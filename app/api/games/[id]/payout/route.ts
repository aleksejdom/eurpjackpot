import {NextResponse} from "next/server";
import {getUserSession} from "@/lib/require-session";
import {setPayout} from "@/lib/games";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const userId=(await getUserSession())?.user?.id;
  if(!userId)return NextResponse.json({error:"Nicht angemeldet"},{status:401});
  const {id}=await params;
  if(!/^\d{1,18}$/.test(id))return NextResponse.json({error:"Ungültige ID"},{status:400});
  if(Number(request.headers.get("content-length")||0)>50000)return NextResponse.json({error:"Anfrage zu groß"},{status:413});
  const {date,amount_cents}=await request.json();
  await setPayout(userId,id,date,amount_cents);
  return NextResponse.json({ok:true});
 }catch(error){console.error("Payout PUT",error);return NextResponse.json({error:"Ziehung nicht gefunden oder Aktualisierung fehlgeschlagen"},{status:404});}
}
