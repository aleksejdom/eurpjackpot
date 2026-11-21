import { NextResponse } from "next/server";
import {requireApiSession} from "@/lib/require-session";
import { getAllDraws, getMeta } from "@/lib/db";
import {expectedLatestDrawDate} from "@/lib/draw-sources";
import { syncIfNeeded } from "@/lib/sync";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  try {
    if(!(await requireApiSession())) return NextResponse.json({error:"Nicht angemeldet"},{status:401});
    const url=new URL(request.url);
    const force=url.searchParams.get("refresh")==="1";
    const result=await syncIfNeeded(force);
    const [draws, lastSync, lastSource]=await Promise.all([getAllDraws(),getMeta("last_sync"),getMeta("last_source")]);
    const expectedDate=expectedLatestDrawDate(new Date());
    const latestDate=draws[0]?.date??null;
    const stale=!latestDate||latestDate<expectedDate;
    return NextResponse.json({draws,lastSync,latestDate,expectedDate,stale,syncError:result.error||(stale?`Ziehung ${expectedDate} ist noch nicht im Archiv vorhanden`:null),source:result.source||lastSource||"Unbekannte Datenquelle"},{headers:{"Cache-Control":"no-store"}});
  } catch(e) {
    console.error("Eurojackpot database error", e);
    return NextResponse.json({draws:[],lastSync:null,syncError:"Datenbank nicht erreichbar oder nicht konfiguriert"},{status:500});
  }
}
