import {NextResponse} from "next/server";
import {timingSafeEqual} from "node:crypto";
import {syncIfNeeded} from "@/lib/sync";
import {syncPrizeQuotas} from "@/lib/prizes";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||secret.length<32)return NextResponse.json({error:"Cron nicht konfiguriert"},{status:503});
 const supplied=request.headers.get("authorization")?.replace(/^Bearer /,"")||"";
 const a=Buffer.from(supplied),b=Buffer.from(secret);
 if(a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.json({error:"Nicht autorisiert"},{status:401});
 const draws=await syncIfNeeded(true);
 const prizes=await syncPrizeQuotas();
 return NextResponse.json({draws,prizes,completedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
}
