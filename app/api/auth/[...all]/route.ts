import {toNextJsHandler} from "better-auth/next-js";
import {auth,ensureAuthSchema} from "@/lib/auth";
import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const handlers=toNextJsHandler(auth);
async function ready(){
  try{await ensureAuthSchema();return true;}
  catch(error){
    console.error("[auth] PostgreSQL initialization/migration failed",error);
    return false;
  }
}
export async function GET(request:Request){
  if(!(await ready()))return NextResponse.json({error:"Authentifizierung nicht verfügbar – PostgreSQL oder Better Auth Migration prüfen."},{status:503});
  return handlers.GET(request);
}
export async function POST(request:Request){
  if(!(await ready()))return NextResponse.json({error:"Authentifizierung nicht verfügbar – PostgreSQL oder Better Auth Migration prüfen."},{status:503});
  return handlers.POST(request);
}
