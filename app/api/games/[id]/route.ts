import { NextResponse } from "next/server";
import {requireApiSession} from "@/lib/require-session";
import { deleteTicket } from "@/lib/games";
export const runtime="nodejs";
export async function DELETE(_request:Request,{params}:{params:Promise<{id:string}>}){
 if(!(await requireApiSession()))return NextResponse.json({error:"Nicht angemeldet"},{status:401});
 const {id}=await params;
 if(!/^\d{1,18}$/.test(id))return NextResponse.json({error:"Ungültige ID"},{status:400});
 try{await deleteTicket(id);return NextResponse.json({ok:true});}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Fehler"},{status:400});}
}
