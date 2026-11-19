import "server-only";
import {Pool} from "pg";

export const PRIZE_CLASSES:Record<string,number>={
  "5+2":1,"5+1":2,"5+0":3,"4+2":4,"4+1":5,"3+2":6,
  "4+0":7,"2+2":8,"3+1":9,"3+0":10,"1+2":11,"2+1":12
};
export function classify(main:number,euro:number):number|null{
 return PRIZE_CLASSES[`${main}+${euro}`]??null;
}
export type PayoutRow={date:string;classes:Record<string,number>};
let pool:Pool|undefined, setup:Promise<void>|undefined;
const db=()=>pool??(pool=new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:10000}));
async function ready(){
 if(!setup)setup=db().query(`CREATE TABLE IF NOT EXISTS eurojackpot_prize_quotas (
    date DATE NOT NULL,
    class INTEGER NOT NULL CHECK(class BETWEEN 1 AND 12),
    amount_cents BIGINT NOT NULL CHECK(amount_cents >= 0),
    source TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(date,class)
  )`).then(()=>{}).catch(e=>{setup=undefined;throw e;});
 await setup;
}
const isDate=(s:unknown):s is string=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s);
function cents(value:unknown):number|null{
 if(typeof value==="number")return Number.isFinite(value)&&value>=0&&value<=200000000?Math.round(value*100):null;
 if(typeof value!=="string")return null;
 const t=value.replace(/€/g,"").trim();
 if(!t)return null;
 let normalized=t.replace(/\s/g,"");
 if(/\d+\.\d{3},\d{1,2}$/.test(normalized))normalized=normalized.replace(/\./g,"").replace(",",".");
 else if(/\d+,\d{1,2}$/.test(normalized))normalized=normalized.replace(",",".");
 else if(!/^\d+(?:\.\d{1,2})?$/.test(normalized))return null;
 const number=Number(normalized);
 return Number.isFinite(number)&&number>=0&&number<=200000000?Math.round(number*100):null;
}
const record=(x:unknown):Record<string,unknown>|null=>x!==null&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:null;
/** A deliberately narrow parser: only known class number keys / 5+2 labels are accepted.
 * An unknown provider payload is ignored, never converted into invented payouts.
 */
export function extractQuotaData(payload:unknown):PayoutRow[]{
 const rows=Array.isArray(payload)?payload:record(payload)?.draws??record(payload)?.results??record(payload)?.data;
 if(!Array.isArray(rows))return [];
 const result:PayoutRow[]=[];
 for(const item of rows){
   const data=record(item);if(!data)continue;
   const date=data.date??data.draw_date??data.drawDate;
   if(!isDate(date))continue;
   const quota=record(data.quotas??data.payouts??data.prizes??data.tiers);
   if(!quota)continue;
   const classes:Record<string,number>={};
   for(const [key,value] of Object.entries(quota)){
     let c:number|null=null;
     if(/^([1-9]|1[0-2])$/.test(key))c=Number(key);
     else if(/^class_?([1-9]|1[0-2])$/i.test(key))c=Number(key.match(/\d+$/)?.[0]);
     else if(/^([0-5])\s*\+\s*([0-2])$/.test(key)){
       const m=key.match(/([0-5])\s*\+\s*([0-2])/)!;
       c=classify(Number(m[1]),Number(m[2]));
     }
     if(c===null)continue;
     const amount=record(value)?.amount??record(value)?.payout??record(value)?.prize??value;
     const n=cents(amount);
     if(n!==null)classes[String(c)]=n;
   }
   if(Object.keys(classes).length)result.push({date,classes});
 }
 return result;
}
let refreshing:Promise<{updated:number;error?:string}>|undefined;
export async function syncPrizeQuotas():Promise<{updated:number;error?:string}>{
 if(refreshing)return refreshing;
 refreshing=(async()=>{
  try{
   const url=process.env.EUROJACKPOT_QUOTAS_URL;
   if(!url)return {updated:0,error:"Keine verifizierte Quoten-JSON-Quelle konfiguriert"};
   if(!/^https:\/\//i.test(url))throw Error("Quotenquelle muss HTTPS verwenden");
   const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(18000)});
   if(!response.ok)throw Error("Quotenquelle HTTP "+response.status);
   const rows=extractQuotaData(await response.json());
   if(!rows.length)throw Error("Quotenformat nicht unterstützt; vorhandene Quoten bleiben erhalten");
   await ready();
   const client=await db().connect();
   try{
    await client.query("BEGIN");
    let updated=0;
    for(const row of rows)for(const [cls,amount] of Object.entries(row.classes)){
      await client.query(`INSERT INTO eurojackpot_prize_quotas (date,class,amount_cents,source)
       VALUES ($1::date,$2,$3,$4) ON CONFLICT(date,class)
       DO UPDATE SET amount_cents=EXCLUDED.amount_cents,source=EXCLUDED.source,updated_at=now()`,
       [row.date,Number(cls),amount,new URL(url).hostname]);
      updated++;
    }
    await client.query("COMMIT");
    return {updated};
   }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  }catch(error){return {updated:0,error:error instanceof Error?error.message:String(error)};}
  finally{refreshing=undefined;}
 })();
 return refreshing;
}
export async function getPrizeQuotas():Promise<Record<string,Record<string,number>>>{
 await ready();
 const result=await db().query<{date:string;class:number;amount_cents:string}>(`SELECT to_char(date,'YYYY-MM-DD') AS date,class,amount_cents::text FROM eurojackpot_prize_quotas ORDER BY date DESC`);
 const map:Record<string,Record<string,number>>={};
 for(const r of result.rows){(map[r.date]??={})[String(r.class)]=Number(r.amount_cents);}
 return map;
}
