import {redirect} from "next/navigation";
import {getUserSession} from "@/lib/require-session";
import MyGames from "@/components/my-games";
export const dynamic="force-dynamic";
export default async function EditTicketPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!/^\d{1,18}$/.test(id))redirect("/?tab=games");
 let authenticated=false;
 try{authenticated=Boolean((await getUserSession())?.user);}catch(error){console.error("Ticket editor auth failed",error);}
 if(!authenticated)redirect("/login");
 return <MyGames draws={[]} mode="editor" editId={id}/>;
}
