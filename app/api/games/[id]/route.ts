import { NextResponse } from "next/server";
import {requireApiSession} from "@/lib/require-session";
import { deleteTicket, updateTicket } from "@/lib/games";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};

export async function PUT(request:Request,{params}:Context){
  if(!(await requireApiSession()))return NextResponse.json({error:"Nicht angemeldet"},{status:401});
  const {id}=await params;
  if(!/^\d{1,18}$/.test(id))return NextResponse.json({error:"Ungültige ID"},{status:400});
  try{
    const size=Number(request.headers.get("content-length")||0);
    if(size>50000)return NextResponse.json({error:"Anfrage zu groß"},{status:413});
    const payload=await request.json();
    await updateTicket(id,payload);
    return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Aktualisierung fehlgeschlagen"},{status:400});
  }
}

export async function DELETE(_request:Request,{params}:Context){
  if(!(await requireApiSession()))return NextResponse.json({error:"Nicht angemeldet"},{status:401});
  const {id}=await params;
  if(!/^\d{1,18}$/.test(id))return NextResponse.json({error:"Ungültige ID"},{status:400});
  try{await deleteTicket(id);return NextResponse.json({ok:true});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Fehler"},{status:400});}
}
