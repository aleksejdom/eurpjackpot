import Dashboard from "@/components/dashboard";
import {getUserSession} from "@/lib/require-session";
import {redirect} from "next/navigation";
export const dynamic="force-dynamic";
export default async function Home(){
 const session=await getUserSession();
 if(!session?.user)redirect("/login");
 return <Dashboard/>;
}
