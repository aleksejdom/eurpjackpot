import "server-only";
import {headers} from "next/headers";
import {auth,ensureAuthSchema} from "./auth";
export async function getUserSession(){
  await ensureAuthSchema();
  return auth.api.getSession({headers:await headers()});
}
export async function requireApiSession() {
  const session=await getUserSession();
  return Boolean(session?.user?.id);
}
