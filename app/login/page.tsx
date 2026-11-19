import {redirect} from "next/navigation";
import {getUserSession} from "@/lib/require-session";
import {cookies} from "next/headers";
import LoginForm from "@/components/login-form";
export const dynamic="force-dynamic";
export default async function LoginPage(){
  const allCookies=await cookies();
  const hasSessionCookie=allCookies.getAll().some(c=>c.name==="better-auth.session_token"||c.name==="__Secure-better-auth.session_token");
  if(hasSessionCookie){
    try{
      if((await getUserSession())?.user)redirect("/");
    }catch(error){
      console.error("[auth] Login screen session check failed",error);
    }
  }
  return <LoginForm allowRegistration={process.env.BETTER_AUTH_ENABLE_SIGNUP==="true"}/>;
}
