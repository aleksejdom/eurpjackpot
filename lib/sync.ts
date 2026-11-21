import "server-only";
import {getMeta,getLatestDrawDate,saveDraws,type Draw} from "./db";
import {
 PRIMARY_DRAW_SOURCE,BACKUP_DRAW_SOURCE,parsePrimaryDraws,parseBackupCsv,
 chooseFreshest,expectedLatestDrawDate,type DrawRecord
} from "./draw-sources";

export type SyncResult={synced:boolean;updated?:number;source?:string;latestDate?:string;expectedDate?:string;error?:string};
let pending:Promise<SyncResult>|null=null;

async function download(url:string):Promise<Response>{
 const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(18000),headers:{Accept:"application/json,text/csv;q=0.9"}});
 if(!response.ok)throw Error("HTTP "+response.status);
 return response;
}
async function loadPrimary():Promise<DrawRecord[]>{
 const response=await download(process.env.EUROJACKPOT_SOURCE_URL||PRIMARY_DRAW_SOURCE);
 return parsePrimaryDraws(await response.json());
}
async function loadBackup():Promise<DrawRecord[]>{
 const response=await download(process.env.EUROJACKPOT_BACKUP_URL||BACKUP_DRAW_SOURCE);
 return parseBackupCsv(await response.text());
}

export async function syncIfNeeded(force=false):Promise<SyncResult>{
 if(pending)return pending;
 const expectedDate=expectedLatestDrawDate(new Date());
 const lastKnown=await getLatestDrawDate();
 const previous=await getMeta("last_sync");
 const hours=Math.max(1,Number(process.env.SYNC_INTERVAL_HOURS||6)||6);
 const upToDate=!!lastKnown&&lastKnown>=expectedDate;
 if(!force&&upToDate&&previous&&Date.now()-new Date(previous).getTime()<hours*3600000){
  return {synced:false,latestDate:lastKnown,expectedDate};
 }
 pending=(async()=>{
  try{
   const sources:Array<{source:string;draws:DrawRecord[]}>=[],failures:string[]=[];
   try{sources.push({source:"LOTTO Bayern / protomultix",draws:await loadPrimary()});}
   catch(error){failures.push("Primärquelle: "+(error instanceof Error?error.message:String(error)));}
   // Use the backup whenever the primary source is late, unavailable, or
   // cannot provide the draw that should already have been published.
   if(!sources.length||sources[0].draws[0].date<expectedDate){
    try{sources.push({source:"Lottochaos.com (CC BY 4.0)",draws:await loadBackup()});}
    catch(error){failures.push("Backupquelle: "+(error instanceof Error?error.message:String(error)));}
   }
   if(!sources.length)throw Error(failures.join("; "));
   const best=chooseFreshest(sources);
   // Prevent an outdated source from replacing newer database results.
   if(lastKnown&&best.latestDate<lastKnown)
    throw Error("Quellen sind älter als gespeicherte Ziehungen (Archiv: "+best.latestDate+", Datenbank: "+lastKnown+")");
   // If both sources are stale, report an actionable error instead of
   // marking the stale import as a successful new update.
   if(best.latestDate<expectedDate)
    throw Error("Ziehung "+expectedDate+" fehlt in allen Quellen (aktuellster Stand: "+best.latestDate+"). "+
      (failures.length?failures.join("; "):""));
   const count=await saveDraws(best.draws as Draw[],new Date().toISOString(),best.source);
   return {synced:true,updated:count,source:best.source,latestDate:best.latestDate,expectedDate};
  }catch(error){
   return {synced:false,latestDate:lastKnown||undefined,expectedDate,error:error instanceof Error?error.message:String(error)};
  }finally{pending=null;}
 })();
 return pending;
}
