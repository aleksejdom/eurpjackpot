import { NextRequest, NextResponse } from "next/server";

/** HTTP Basic Auth for all pages and APIs. Credentials must be configured at runtime. */
export async function middleware(request: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !password) {
    return new NextResponse("Basic Auth ist noch nicht konfiguriert.", {status:503});
  }
  const challenge = { "WWW-Authenticate": 'Basic realm="Eurojackpot", charset="UTF-8"', "Cache-Control": "no-store" };
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Basic ")) return new NextResponse("Anmeldung erforderlich", {status:401,headers:challenge});
  let credentials: string;
  try { credentials = atob(header.substring(6)); } catch { return new NextResponse("Ungültige Anmeldung", {status:401,headers:challenge}); }
  const colon = credentials.indexOf(":");
  if (colon === -1) return new NextResponse("Ungültige Anmeldung", {status:401,headers:challenge});
  const receivedUser = credentials.slice(0,colon);
  const receivedPassword = credentials.slice(colon+1);
  async function digest(value: string): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
  }
  const [userHash,expectedUserHash,passHash,expectedPassHash]=await Promise.all([
    digest(receivedUser),digest(user),digest(receivedPassword),digest(password)
  ]);
  let diff=0;
  for(let i=0;i<32;i++) diff|=userHash[i]^expectedUserHash[i] | passHash[i]^expectedPassHash[i];
  if(diff!==0) return new NextResponse("Benutzername oder Passwort falsch", {status:401,headers:challenge});
  const response=NextResponse.next();
  response.headers.set("Cache-Control","no-store");
  return response;
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};
