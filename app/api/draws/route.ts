import { NextResponse } from "next/server";
import { getAllDraws, getMeta } from "@/lib/db";
import { syncIfNeeded } from "@/lib/sync";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  try {
    const url=new URL(request.url);
    const force=url.searchParams.get("refresh")==="1";
    const result=await syncIfNeeded(force);
    const [draws, lastSync]=await Promise.all([getAllDraws(),getMeta("last_sync")]);
    return NextResponse.json({draws,lastSync,syncError:result.error||null,source:"LOTTO Bayern / protomultix"},{headers:{"Cache-Control":"no-store"}});
  } catch(e) {
    console.error("Eurojackpot database error", e);
    return NextResponse.json({draws:[],lastSync:null,syncError:"Datenbank nicht erreichbar oder nicht konfiguriert"},{status:500});
  }
}
