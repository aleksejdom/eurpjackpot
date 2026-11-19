import {NextResponse} from "next/server";
import {requireApiSession} from "@/lib/require-session";
import {getPrizeQuotas,syncPrizeQuotas} from "@/lib/prizes";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 if(!(await requireApiSession()))return NextResponse.json({error:"Nicht angemeldet"},{status:401});
 try{
  const force=new URL(request.url).searchParams.get("refresh")==="1";
  const result=force?await syncPrizeQuotas():null;
  return NextResponse.json({quotas:await getPrizeQuotas(),error:result?.error??null,updated:result?.updated??0},{headers:{"Cache-Control":"no-store"}});
 }catch(e){
  console.error("Eurojackpot quota read failed",e);
  return NextResponse.json({quotas:{},error:"Quoten nicht erreichbar"},{status:500});
 }
}
