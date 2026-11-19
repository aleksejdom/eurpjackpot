"use client";
import {LogOut} from "lucide-react";
import {authClient} from "@/lib/auth-client";
export default function LogoutButton(){
 return <button className="ghost icon-btn" title="Abmelden" onClick={async()=>{
    await authClient.signOut();
    window.location.href="/login";
  }}><LogOut size={16}/><span>Abmelden</span></button>;
}
