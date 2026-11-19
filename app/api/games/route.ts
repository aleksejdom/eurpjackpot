import { NextRequest,NextResponse } from "next/server";
import {requireApiSession} from "@/lib/require-session";
import { createTicket,listTickets } from "@/lib/games";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
  try {if(!(await requireApiSession()))return NextResponse.json({error:"Nicht angemeldet"},{status:401});return NextResponse.json({tickets:await listTickets()},{headers:{"Cache-Control":"no-store"}});}
  catch(e){console.error("Games GET",e);return NextResponse.json({error:"Spiele konnten nicht geladen werden"},{status:500});}
}
export async function POST(req:NextRequest){
  try {
    if(!(await requireApiSession()))return NextResponse.json({error:"Nicht angemeldet"},{status:401});
    const length=Number(req.headers.get("content-length")||0);
    if(length>50000) return NextResponse.json({error:"Anfrage zu groß"},{status:413});
    const data=await req.json();
    const id=await createTicket(data);
    return NextResponse.json({id},{status:201});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Speichern fehlgeschlagen"},{status:400});}
}
