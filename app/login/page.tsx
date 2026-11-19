import {redirect} from "next/navigation";
import {getUserSession} from "@/lib/require-session";
import LoginForm from "@/components/login-form";
export const dynamic="force-dynamic";
export default async function LoginPage(){
  let signedIn=false;
  try { signedIn=Boolean((await getUserSession())?.user); }
  catch { /* login form will surface any DB/auth errors */ }
  if(signedIn)redirect("/");
  return <LoginForm allowRegistration={process.env.BETTER_AUTH_ENABLE_SIGNUP==="true"}/>;
}
