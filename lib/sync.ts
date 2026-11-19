import "server-only";
import { getMeta, saveDraws, type Draw } from "./db";
const SOURCE = process.env.EUROJACKPOT_SOURCE_URL || "https://raw.githubusercontent.com/protomultix/eurojackpot-api/main/public/api/draws.json";
let pending: Promise<{ synced: boolean; error?: string }> | null = null;
function validDraw(x: unknown): x is Draw {
  if (!x || typeof x !== "object") return false;
  const d=x as Partial<Draw>;
  if (typeof d.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !Number.isFinite(Date.parse(d.date+"T00:00:00Z"))) return false;
  const a=d.main_numbers, b=d.euro_numbers;
  return Array.isArray(a) && a.length===5 && a.every(n=>Number.isInteger(n)&&n>=1&&n<=50) && new Set(a).size===5
    && Array.isArray(b) && b.length===2 && b.every(n=>Number.isInteger(n)&&n>=1&&n<=12) && new Set(b).size===2;
}
export async function syncIfNeeded(force=false): Promise<{ synced: boolean; error?: string }> {
  if (pending) return pending;
  const previous=await getMeta("last_sync");
  const hours=Math.max(1,Number(process.env.SYNC_INTERVAL_HOURS || 6) || 6);
  if(!force && previous && Date.now()-new Date(previous).getTime()<hours*3600000) return {synced:false};
  pending=(async()=>{
    try {
      const response=await fetch(SOURCE,{cache:"no-store",signal:AbortSignal.timeout(20000),headers:{"Accept":"application/json"}});
      if(!response.ok) throw new Error("Datenquelle antwortet mit HTTP "+response.status);
      const payload:unknown=await response.json();
      const records=Array.isArray(payload)?payload:((payload && typeof payload==="object" && "draws" in payload)?(payload as {draws:unknown}).draws:null);
      if(!Array.isArray(records)) throw new Error("Unerwartetes JSON-Format");
      const validated=records.filter(validDraw);
      if(validated.length===0 || validated.length!==records.length) throw new Error("Ungültige oder fehlende Ziehungen; Import abgebrochen");
      await saveDraws(validated,new Date().toISOString());
      return {synced:true};
    } catch(e) {
      return {synced:false,error:e instanceof Error?e.message:String(e)};
    } finally { pending=null; }
  })();
  return pending;
}
