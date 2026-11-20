import {NextResponse} from "next/server";
import {getUserSession} from "@/lib/require-session";
import {deleteTicket,updateTicket} from "@/lib/games";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function PUT(request:Request,{params}:Context){
 try{
  const userId=(await getUserSession())?.user?.id;
  if(!userId)return NextResponse.json({error:"Nicht angemeldet"},{status:401});
  const {id}=await params;
  if(!/^\d{1,18}$/.test(id))return NextResponse.json({error:"Ungültige ID"},{status:400});
  if(Number(request.headers.get("content-length")||0)>50000)return NextResponse.json({error:"Anfrage zu groß"},{status:413});
  await updateTicket(userId,id,await request.json());
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
 }catch(error){console.error("Games PUT",error);return NextResponse.json({error:"Spielschein nicht gefunden oder Änderung fehlgeschlagen"},{status:404});}
}
export async function DELETE(_request:Request,{params}:Context){
 try{
  const userId=(await getUserSession())?.user?.id;
  if(!userId)return NextResponse.json({error:"Nicht angemeldet"},{status:401});
  const {id}=await params;
  if(!/^\d{1,18}$/.test(id))return NextResponse.json({error:"Ungültige ID"},{status:400});
  await deleteTicket(userId,id);
  return NextResponse.json({ok:true});
 }catch(error){console.error("Games DELETE",error);return NextResponse.json({error:"Spielschein nicht gefunden oder Löschen fehlgeschlagen"},{status:404});}
}
