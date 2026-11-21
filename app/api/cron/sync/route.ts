import {NextResponse} from "next/server";
import {timingSafeEqual} from "node:crypto";
import {verifyGithubSyncToken} from "@/lib/github-oidc";
import {syncIfNeeded} from "@/lib/sync";
import {syncPrizeQuotas} from "@/lib/prizes";
export const runtime="nodejs";
export const dynamic="force-dynamic";

function hasLegacySecret(supplied:string):boolean{
 const secret=process.env.CRON_SECRET;
 if(!secret||secret.length<32)return false;
 const a=Buffer.from(supplied),b=Buffer.from(secret);
 return a.length===b.length&&timingSafeEqual(a,b);
}
export async function GET(request:Request){
 const supplied=request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]||"";
 const authenticated=hasLegacySecret(supplied)||await verifyGithubSyncToken(
  supplied,fetch,process.env.EUROJACKPOT_CRON_AUDIENCE||"https://euro.ad-d.info/api/cron/sync"
 );
 if(!authenticated)return NextResponse.json({error:"Nicht autorisiert: gültiges GitHub OIDC-Token oder konfigurierte Cron-Berechtigung erforderlich"},{status:401});
 try{
  const draws=await syncIfNeeded(true);
  if(draws.error){
   console.error("Eurojackpot synchronization failed:",draws.error);
   return NextResponse.json({error:"Ziehungsdaten konnten nicht aktualisiert werden",details:draws.error,draws},{status:502,headers:{"Cache-Control":"no-store"}});
  }
  // Quotas are optional: no trusted quota URL means no failure for main draws.
  const prizes=await syncPrizeQuotas();
  return NextResponse.json({draws,prizes,completedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  console.error("Eurojackpot sync endpoint exception",error);
  return NextResponse.json({error:"Interner Synchronisierungsfehler"},{status:500});
 }
}
