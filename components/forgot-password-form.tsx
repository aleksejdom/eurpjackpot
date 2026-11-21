"use client";
import {useState,type FormEvent} from "react";
import Link from "next/link";
import {authClient} from "@/lib/auth-client";
import {Mail,ArrowLeft,Send} from "lucide-react";

export default function ForgotPasswordForm(){
 const [email,setEmail]=useState("");
 const [busy,setBusy]=useState(false);
 const [submitted,setSubmitted]=useState(false);
 const [error,setError]=useState("");
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(busy)return;
  setError("");setBusy(true);
  try{
   const res=await authClient.requestPasswordReset({
    email:email.trim(),
    redirectTo:window.location.origin+"/reset-password"
   });
   if(res.error){
    if(res.error.status===503)setError("Der E-Mail-Versand ist noch nicht eingerichtet. Bitte den Administrator kontaktieren.");
    else if(res.error.status===429)setError("Zu viele Anfragen. Bitte später erneut versuchen.");
    else setError("Die Anfrage konnte nicht verarbeitet werden. Bitte später erneut versuchen.");
    return;
   }
   setSubmitted(true);
  }catch{
   setError("Verbindung fehlgeschlagen. Bitte versuche es später erneut.");
  }finally{setBusy(false);}
 }
 return <main className="auth-screen"><div className="auth-glow"/><div className="auth-card">
  <div className="auth-logo"><Mail size={23}/></div>
  <span className="eyebrow">KONTO WIEDERHERSTELLEN</span>
  <h1>Passwort vergessen?</h1>
  {submitted?<div role="status">
   <p className="auth-lead">Falls ein Konto mit dieser E-Mail-Adresse existiert, erhältst du einen Link zum Zurücksetzen deines Passworts. Prüfe auch deinen Spam-Ordner.</p>
  </div>:<>
   <p className="auth-lead">Gib deine registrierte E-Mail-Adresse ein. Wir senden dir einen Link, um ein neues Passwort festzulegen.</p>
   <form onSubmit={e=>void submit(e)}>
    <label className="auth-field"><span>E-Mail-Adresse</span><div className="auth-input"><Mail size={17}/><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="name@beispiel.de"/></div></label>
    {error&&<p className="auth-error" role="alert">{error}</p>}
    <button type="submit" className="auth-submit" disabled={busy}><Send size={17}/>{busy?"Wird gesendet …":"Link anfordern"}</button>
   </form>
  </>}
  <Link className="auth-reset-link" href="/login"><ArrowLeft size={16}/> Zurück zur Anmeldung</Link>
 </div></main>;
}
