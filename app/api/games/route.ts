import {NextRequest,NextResponse} from "next/server";
import {getUserSession} from "@/lib/require-session";
import {createTicket,listTickets} from "@/lib/games";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 try{
  const userId=(await getUserSession())?.user?.id;
  if(!userId)return NextResponse.json({error:"Nicht angemeldet"},{status:401});
  return NextResponse.json({tickets:await listTickets(userId)},{headers:{"Cache-Control":"no-store"}});
 }catch(error){console.error("Games GET",error);return NextResponse.json({error:"Spiele konnten nicht geladen werden"},{status:500});}
}
export async function POST(req:NextRequest){
 try{
  const userId=(await getUserSession())?.user?.id;
  if(!userId)return NextResponse.json({error:"Nicht angemeldet"},{status:401});
  if(Number(req.headers.get("content-length")||0)>50000)return NextResponse.json({error:"Anfrage zu groß"},{status:413});
  const id=await createTicket(userId,await req.json());
  return NextResponse.json({id},{status:201});
 }catch(error){console.error("Games POST",error);return NextResponse.json({error:"Speichern fehlgeschlagen"},{status:400});}
}
