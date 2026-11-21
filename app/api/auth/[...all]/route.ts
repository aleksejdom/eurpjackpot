import {toNextJsHandler} from "better-auth/next-js";
import {auth,ensureAuthSchema} from "@/lib/auth";
import {NextResponse} from "next/server";
import {passwordResetMailConfigured} from "@/lib/password-reset-mail";
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
  // Never return "success" for an account if email delivery is not set up.
  // This guard is independent of whether the supplied email is registered.
  const path=new URL(request.url).pathname;
  if((path.endsWith("/request-password-reset")||path.endsWith("/forget-password"))&&!passwordResetMailConfigured())
    return NextResponse.json({error:"Passwort-Zurücksetzung ist noch nicht eingerichtet. SMTP in Coolify konfigurieren."},{status:503});
  if(!(await ready()))return NextResponse.json({error:"Authentifizierung nicht verfügbar – PostgreSQL oder Better Auth Migration prüfen."},{status:503});
  return handlers.POST(request);
}
