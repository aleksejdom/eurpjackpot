"use client";
import {useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
import {authClient} from "@/lib/auth-client";
import {LockKeyhole,Eye,EyeOff,ArrowLeft,CheckCircle} from "lucide-react";

export default function ResetPasswordForm(){
 const [token,setToken]=useState("");
 const [invalid,setInvalid]=useState(false);
 const [newPassword,setNewPassword]=useState("");
 const [repeatPassword,setRepeatPassword]=useState("");
 const [visible,setVisible]=useState(false);
 const [busy,setBusy]=useState(false);
 const [saved,setSaved]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{
  const query=new URLSearchParams(window.location.search);
  const value=query.get("token");
  setToken(value||"");
  setInvalid(!value||!!query.get("error"));
  // The token must not remain in the address bar, copy/paste, or browser history.
  window.history.replaceState(null,"",window.location.pathname);
 },[]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(busy)return;
  if(newPassword.length<12||newPassword.length>128){setError("Bitte ein Passwort mit 12 bis 128 Zeichen eingeben.");return;}
  if(newPassword!==repeatPassword){setError("Die Passwörter stimmen nicht überein.");return;}
  if(!token){setError("Der Zurücksetzungslink ist ungültig oder abgelaufen.");return;}
  setBusy(true);setError("");
  try{
   const res=await authClient.resetPassword({newPassword,token});
   if(res.error){
    setError("Der Link ist ungültig, abgelaufen oder wurde bereits verwendet. Bitte fordere einen neuen Link an.");
    return;
   }
   setSaved(true);setToken("");setNewPassword("");setRepeatPassword("");
  }catch{setError("Die Verbindung ist fehlgeschlagen. Bitte versuche es erneut.");}
  finally{setBusy(false);}
 }
 return <main className="auth-screen"><div className="auth-glow"/><div className="auth-card">
  <div className="auth-logo">{saved?<CheckCircle size={23}/>:<LockKeyhole size={23}/>}</div>
  <span className="eyebrow">KONTO WIEDERHERSTELLEN</span>
  <h1>{saved?"Passwort geändert.":"Neues Passwort"}</h1>
  {saved?<p className="auth-lead" role="status">Dein Passwort wurde aktualisiert. Melde dich jetzt mit dem neuen Passwort an.</p>
   :invalid?<p className="auth-error" role="alert">Der Link ist ungültig oder abgelaufen. Fordere bitte einen neuen Link an.</p>
   :<>
    <p className="auth-lead">Lege ein neues Passwort mit mindestens 12 Zeichen fest.</p>
    <form onSubmit={e=>void submit(e)}>
     <label className="auth-field"><span>Neues Passwort</span><div className="auth-input"><LockKeyhole size={17}/><input type={visible?"text":"password"} autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={e=>setNewPassword(e.target.value)} required placeholder="Mindestens 12 Zeichen"/><button type="button" className="auth-reveal" onClick={()=>setVisible(v=>!v)} aria-label={visible?"Passwort verbergen":"Passwort anzeigen"}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
     <label className="auth-field"><span>Neues Passwort bestätigen</span><div className="auth-input"><LockKeyhole size={17}/><input type={visible?"text":"password"} autoComplete="new-password" minLength={12} maxLength={128} value={repeatPassword} onChange={e=>setRepeatPassword(e.target.value)} required placeholder="Passwort wiederholen"/></div></label>
     {error&&<p className="auth-error" role="alert">{error}</p>}
     <button type="submit" className="auth-submit" disabled={busy}>{busy?"Wird geändert …":"Passwort speichern"}</button>
    </form>
   </>}
  <Link className="auth-reset-link" href={invalid?"/forgot-password":"/login"}><ArrowLeft size={16}/>{invalid?"Neuen Link anfordern":"Zurück zur Anmeldung"}</Link>
 </div></main>;
}
