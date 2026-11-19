import "server-only";
import { Pool, type PoolClient } from "pg";

let pool: Pool | undefined;
let initialized: Promise<void> | undefined;
function database() {
  if (!pool) {
    if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL nicht konfiguriert");
    pool = new Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:10000});
  }
  return pool;
}
async function ready() {
  if(!initialized) initialized=(async()=>{
    await database().query(`
      CREATE TABLE IF NOT EXISTS ej_tickets(
        id BIGSERIAL PRIMARY KEY,
        purchased_on DATE NOT NULL,
        total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
        note TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS ej_ticket_lines(
        id BIGSERIAL PRIMARY KEY,
        ticket_id BIGINT NOT NULL REFERENCES ej_tickets(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        main_numbers INTEGER[] NOT NULL,
        euro_numbers INTEGER[] NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ej_ticket_dates(
        ticket_id BIGINT NOT NULL REFERENCES ej_tickets(id) ON DELETE CASCADE,
        draw_date DATE NOT NULL,
        PRIMARY KEY(ticket_id,draw_date)
      );
      CREATE TABLE IF NOT EXISTS ej_payouts(
        ticket_id BIGINT NOT NULL REFERENCES ej_tickets(id) ON DELETE CASCADE,
        draw_date DATE NOT NULL,
        amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),
        PRIMARY KEY(ticket_id,draw_date),
        FOREIGN KEY(ticket_id,draw_date) REFERENCES ej_ticket_dates(ticket_id,draw_date) ON DELETE CASCADE
      );
    `);
  })().catch(e=>{initialized=undefined;throw e;});
  await initialized;
}
export type TicketLine={main_numbers:number[];euro_numbers:number[]};
export type TicketInput={purchased_on:string;total_cents:number;note:string;dates:string[];lines:TicketLine[]};
export type Ticket=TicketInput&{id:string;created_at:string;payouts:{date:string;amount_cents:number}[]};
const isoDate=(value:unknown):value is string=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+"T12:00:00Z"))&&new Date(value+"T12:00:00Z").toISOString().slice(0,10)===value;
const uniqueSorted=(numbers:number[],limit:number,length:number)=>numbers.length===length&&numbers.every(x=>Number.isInteger(x)&&x>=1&&x<=limit)&&new Set(numbers).size===length;
function drawWeekday(s:string){return new Date(s+"T12:00:00Z").getUTCDay();}
export function validateTicket(input:unknown):TicketInput {
  if (!input || typeof input!=="object") throw new Error("Ungültiger Spielschein");
  const t=input as Partial<TicketInput>;
  if (!isoDate(t.purchased_on)) throw new Error("Kaufdatum ungültig");
  if (!Number.isSafeInteger(t.total_cents)||t.total_cents!<0||t.total_cents!>100000000) throw new Error("Gesamtpreis ungültig");
  if (typeof t.note!=="string"||t.note.length>500) throw new Error("Notiz zu lang");
  if (!Array.isArray(t.dates)||t.dates.length<1||t.dates.length>104||new Set(t.dates).size!==t.dates.length||!t.dates.every(isoDate)) throw new Error("Bitte gültige Ziehungsdaten auswählen");
  if (!t.dates.every(d=>[2,5].includes(drawWeekday(d)))) throw new Error("Ziehungen finden dienstags und freitags statt");
  if (t.dates.some(d=>d<t.purchased_on!)) throw new Error("Ziehung liegt vor dem Kaufdatum");
  if (!Array.isArray(t.lines)||t.lines.length<1||t.lines.length>20) throw new Error("Mindestens ein und höchstens 20 Tippfelder erlaubt");
  for(const line of t.lines){
    if(!line||!Array.isArray(line.main_numbers)||!Array.isArray(line.euro_numbers)||!uniqueSorted(line.main_numbers,50,5)||!uniqueSorted(line.euro_numbers,12,2)) throw new Error("Ungültige Zahlen – jedes Feld benötigt 5 unterschiedliche Hauptzahlen und 2 unterschiedliche Eurozahlen");
  }
  return {purchased_on:t.purchased_on,total_cents:t.total_cents!,note:t.note!,dates:[...t.dates].sort(),lines:t.lines.map(l=>({main_numbers:l.main_numbers,euro_numbers:l.euro_numbers}))};
}
export async function createTicket(input:unknown):Promise<string>{
  const t=validateTicket(input);
  await ready();
  const client:PoolClient=await database().connect();
  try{
    await client.query("BEGIN");
    const row=await client.query<{id:string}>("INSERT INTO ej_tickets(purchased_on,total_cents,note) VALUES($1::date,$2,$3) RETURNING id::text AS id",[t.purchased_on,t.total_cents,t.note]);
    const id=row.rows[0].id;
    for(let i=0;i<t.lines.length;i++) await client.query("INSERT INTO ej_ticket_lines(ticket_id,position,main_numbers,euro_numbers) VALUES($1,$2,$3::integer[],$4::integer[])",[id,i+1,t.lines[i].main_numbers,t.lines[i].euro_numbers]);
    for(const date of t.dates) await client.query("INSERT INTO ej_ticket_dates(ticket_id,draw_date) VALUES($1,$2::date)",[id,date]);
    await client.query("COMMIT");
    return id;
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
export async function listTickets():Promise<Ticket[]> {
  await ready();
  const result=await database().query<{
    id:string;purchased_on:string;total_cents:number;note:string;created_at:string;dates:string[];
    lines:TicketLine[];payouts:{date:string;amount_cents:number}[];
  }>(`SELECT t.id::text, to_char(t.purchased_on,'YYYY-MM-DD') AS purchased_on,
    t.total_cents,t.note,t.created_at::text,
    COALESCE((SELECT array_agg(to_char(d.draw_date,'YYYY-MM-DD') ORDER BY d.draw_date) FROM ej_ticket_dates d WHERE d.ticket_id=t.id),ARRAY[]::text[]) AS dates,
    COALESCE((SELECT json_agg(json_build_object('main_numbers',l.main_numbers,'euro_numbers',l.euro_numbers) ORDER BY l.position) FROM ej_ticket_lines l WHERE l.ticket_id=t.id),'[]'::json) AS lines,
    COALESCE((SELECT json_agg(json_build_object('date',to_char(p.draw_date,'YYYY-MM-DD'),'amount_cents',p.amount_cents)) FROM ej_payouts p WHERE p.ticket_id=t.id),'[]'::json) AS payouts
    FROM ej_tickets t ORDER BY t.purchased_on DESC,t.id DESC LIMIT 1000`);
  return result.rows;
}
export async function deleteTicket(id:string):Promise<void>{
  await ready();
  const result=await database().query("DELETE FROM ej_tickets WHERE id=$1::bigint",[id]);
  if(!result.rowCount) throw new Error("Schein nicht gefunden");
}
export async function setPayout(id:string,date:string,cents:number):Promise<void>{
  if(!isoDate(date)||!Number.isSafeInteger(cents)||cents<0||cents>100000000) throw new Error("Auszahlung oder Datum ungültig");
  await ready();
  const result=await database().query(`INSERT INTO ej_payouts(ticket_id,draw_date,amount_cents)
    SELECT ticket_id,draw_date,$3 FROM ej_ticket_dates WHERE ticket_id=$1::bigint AND draw_date=$2::date
    ON CONFLICT(ticket_id,draw_date) DO UPDATE SET amount_cents=EXCLUDED.amount_cents`,[id,date,cents]);
  if(!result.rowCount) throw new Error("Ziehung für diesen Schein nicht gefunden");
}
