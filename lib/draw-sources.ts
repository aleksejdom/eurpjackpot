export type DrawRecord={date:string;main_numbers:number[];euro_numbers:number[]};
export const PRIMARY_DRAW_SOURCE="https://raw.githubusercontent.com/protomultix/eurojackpot-api/main/public/api/draws.json";
export const BACKUP_DRAW_SOURCE="https://lottochaos.com/data/ej.csv";
const MIN_DRAW_DATE="2022-03-25";
export function validDraw(value:unknown):value is DrawRecord{
 if(!value||typeof value!=="object")return false;
 const draw=value as Partial<DrawRecord>;
 if(typeof draw.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(draw.date)||draw.date<MIN_DRAW_DATE)return false;
 const d=new Date(draw.date+"T00:00:00Z");
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==draw.date)return false;
 if(![2,5].includes(d.getUTCDay()))return false;
 const main=draw.main_numbers,euro=draw.euro_numbers;
 return Array.isArray(main)&&main.length===5&&main.every(n=>Number.isInteger(n)&&n>=1&&n<=50)&&new Set(main).size===5
  &&Array.isArray(euro)&&euro.length===2&&euro.every(n=>Number.isInteger(n)&&n>=1&&n<=12)&&new Set(euro).size===2;
}
export function parsePrimaryDraws(payload:unknown):DrawRecord[]{
 const obj=payload&&typeof payload==="object"?payload as Record<string,unknown>:null;
 const rows=Array.isArray(payload)?payload:obj?.draws;
 if(!Array.isArray(rows)||rows.length<100)throw Error("Primärquelle enthält kein gültiges Ziehungsarchiv");
 const dates=new Set<string>(),result:DrawRecord[]=[];
 for(const row of rows){
  if(!validDraw(row))throw Error("Primärquelle enthält ungültige Ziehungen");
  if(dates.has(row.date))throw Error("Primärquelle enthält doppelte Ziehungsdaten");
  dates.add(row.date);result.push({date:row.date,main_numbers:row.main_numbers,euro_numbers:row.euro_numbers});
 }
 return result.sort((a,b)=>b.date.localeCompare(a.date));
}
/** CSV format documented at https://lottochaos.com/de/open-data/.
 * We intentionally restrict to the post-2022 5+2 rules supported by the app.
 */
export function parseBackupCsv(csv:string):DrawRecord[]{
 const rows=csv.replace(/^\uFEFF/,"").trim().split(/\r?\n/);
 const head=rows.shift()?.split(",").map(x=>x.trim().toLowerCase())||[];
 const required=["date","n1","n2","n3","n4","n5","b1","b2"];
 const indexes=required.map(x=>head.indexOf(x));
 if(indexes.some(x=>x<0))throw Error("Unbekanntes Format der Eurojackpot-CSV");
 const seen=new Set<string>(),result:DrawRecord[]=[];
 for(const row of rows){
  if(!row.trim())continue;
  const parts=row.split(",");
  const date=parts[indexes[0]]?.trim();
  if(!date||date<MIN_DRAW_DATE)continue;
  const raw=indexes.slice(1).map(i=>parts[i]?.trim()||"");
  if(raw.some(x=>!/^(?:[1-9]|[1-4]\d|50)$/.test(x)))throw Error("Ungültige Zahlen in CSV: "+date);
  const numbers=raw.map(Number);
  const draw={date,main_numbers:numbers.slice(0,5),euro_numbers:numbers.slice(5)};
  if(!validDraw(draw)||seen.has(date))throw Error("Ungültige oder doppelte CSV-Ziehung: "+date);
  seen.add(date);result.push(draw);
 }
 if(result.length<100)throw Error("Backup-Ziehungsarchiv ist unvollständig");
 return result.sort((a,b)=>b.date.localeCompare(a.date));
}
export function chooseFreshest(
 sources:Array<{source:string;draws:DrawRecord[]}>
):{source:string;draws:DrawRecord[];latestDate:string}{
 const valid=sources.filter(x=>x.draws.length>0);
 if(!valid.length)throw Error("Keine gültige Ziehungsdatenquelle verfügbar");
 valid.sort((a,b)=>b.draws[0].date.localeCompare(a.draws[0].date)||b.draws.length-a.draws.length);
 return {...valid[0],latestDate:valid[0].draws[0].date};
}
function berlinDate(now:Date){
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(now);
 const get=(type:string)=>parts.find(p=>p.type===type)?.value||"";
 return {date:get("year")+"-"+get("month")+"-"+get("day"),hour:Number(get("hour"))};
}
/** A draw becomes due at 23:00 Berlin time; prior to this point a
 * still-unpublished Tuesday/Friday result must not count as an outage.
 */
export function expectedLatestDrawDate(now:Date):string{
 const local=berlinDate(now),candidate=new Date(local.date+"T12:00:00Z");
 const dow=candidate.getUTCDay();
 if((dow===2||dow===5)&&local.hour<23)candidate.setUTCDate(candidate.getUTCDate()-1);
 while(![2,5].includes(candidate.getUTCDay()))candidate.setUTCDate(candidate.getUTCDate()-1);
 return candidate.toISOString().slice(0,10);
}
