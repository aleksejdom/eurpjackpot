import { NextRequest,NextResponse } from "next/server";
import { createTicket,listTickets } from "@/lib/games";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
  try {return NextResponse.json({tickets:await listTickets()},{headers:{"Cache-Control":"no-store"}});}
  catch(e){console.error("Games GET",e);return NextResponse.json({error:"Spiele konnten nicht geladen werden"},{status:500});}
}
export async function POST(req:NextRequest){
  try {
    const length=Number(req.headers.get("content-length")||0);
    if(length>50000) return NextResponse.json({error:"Anfrage zu groß"},{status:413});
    const data=await req.json();
    const id=await createTicket(data);
    return NextResponse.json({id},{status:201});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Speichern fehlgeschlagen"},{status:400});}
}
