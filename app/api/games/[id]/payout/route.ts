import { NextResponse } from "next/server";
import {requireApiSession} from "@/lib/require-session";
import { setPayout } from "@/lib/games";
export const runtime="nodejs";
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!(await requireApiSession()))return NextResponse.json({error:"Nicht angemeldet"},{status:401});
 const {id}=await params;
 if(!/^\d{1,18}$/.test(id))return NextResponse.json({error:"Ungültige ID"},{status:400});
 try{
   const {date,amount_cents}=await request.json();
   await setPayout(id,date,amount_cents);
   return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Fehler"},{status:400});}
}
