import Dashboard from "@/components/dashboard";
import {getUserSession} from "@/lib/require-session";
import {redirect} from "next/navigation";
import {cookies} from "next/headers";
export const dynamic="force-dynamic";
export default async function Home(){
  // Visitors without a cookie need the login form, not a database connection.
  const allCookies=await cookies();
  const hasSessionCookie=allCookies.getAll().some(c=>c.name==="better-auth.session_token"||c.name==="__Secure-better-auth.session_token");
  if(!hasSessionCookie)redirect("/login");
  let signedIn=false;
  try{signedIn=Boolean((await getUserSession())?.user);}
  catch(error){
    console.error("[auth] Could not validate session: check PostgreSQL and Better Auth migrations",error);
    // Never display protected data when session validation fails.
    redirect("/login");
  }
  if(!signedIn)redirect("/login");
  return <Dashboard/>;
}
