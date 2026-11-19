import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type Draw = { date: string; date_de: string; main_numbers: number[]; euro_numbers: number[] };
type DBRow = { date: string; main_numbers: string; euro_numbers: string };
const dbFile = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "database.sqlite");
let instance: Database.Database | undefined;

export function getDB(): Database.Database {
  if (instance) return instance;
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  instance = new Database(dbFile);
  instance.pragma("journal_mode = WAL");
  instance.pragma("busy_timeout = 5000");
  instance.exec("CREATE TABLE IF NOT EXISTS eurojackpot_draws (date TEXT PRIMARY KEY NOT NULL, main_numbers TEXT NOT NULL, euro_numbers TEXT NOT NULL, source TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS eurojackpot_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);");
  return instance;
}
function rowToDraw(row: DBRow): Draw {
  const date = row.date;
  return { date, date_de: date.slice(8,10)+"."+date.slice(5,7)+"."+date.slice(0,4), main_numbers: JSON.parse(row.main_numbers), euro_numbers: JSON.parse(row.euro_numbers) };
}
export function getAllDraws(): Draw[] {
  return (getDB().prepare("SELECT date, main_numbers, euro_numbers FROM eurojackpot_draws ORDER BY date DESC").all() as DBRow[]).map(rowToDraw);
}
export function getMeta(key: string): string | null {
  return (getDB().prepare("SELECT value FROM eurojackpot_meta WHERE key = ?").get(key) as {value:string}|undefined)?.value ?? null;
}
export function saveDraws(draws: Draw[], timestamp: string): number {
  const db=getDB();
  const insert=db.prepare("INSERT INTO eurojackpot_draws (date, main_numbers, euro_numbers, source) VALUES (?, ?, ?, ?) ON CONFLICT(date) DO UPDATE SET main_numbers=excluded.main_numbers, euro_numbers=excluded.euro_numbers, source=excluded.source, updated_at=CURRENT_TIMESTAMP");
  const setMeta=db.prepare("INSERT INTO eurojackpot_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  db.transaction(()=>{
    for(const d of draws) insert.run(d.date, JSON.stringify(d.main_numbers), JSON.stringify(d.euro_numbers), "LOTTO Bayern / protomultix");
    setMeta.run("last_sync",timestamp);
  })();
  return draws.length;
}
