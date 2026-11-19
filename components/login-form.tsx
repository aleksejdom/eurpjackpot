"use client";
import {useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {LockKeyhole,Mail,Eye,EyeOff,Trophy,LogIn} from "lucide-react";
import {authClient} from "@/lib/auth-client";
export default function LoginForm({allowRegistration}:{allowRegistration:boolean}){
 const router=useRouter();
 const [register,setRegister]=useState(false);
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [name,setName]=useState("");
 const [visible,setVisible]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError("");
  try {
   const res=register
      ?await authClient.signUp.email({name,email,password})
      :await authClient.signIn.email({email,password});
   if(res.error){setError(res.error.message||"Anmeldung fehlgeschlagen");return;}
   router.replace("/");router.refresh();
  }catch{setError("Verbindung fehlgeschlagen. Bitte Auth-Konfiguration und Datenbank prüfen.");}
  finally{setBusy(false);}
 }
 return <main className="auth-screen"><div className="auth-glow"/><div className="auth-card">
   <div className="auth-logo"><Trophy size={23}/></div>
   <span className="eyebrow">PERSÖNLICHES DASHBOARD</span>
   <h1>{register?"Konto einrichten":"Willkommen zurück."}</h1>
   <p className="auth-lead">{register?"Lege dein persönliches Konto an.":"Melde dich an, um deine Eurojackpot-Ziehungen, Spielscheine und Statistiken aufzurufen."}</p>
   <form onSubmit={e=>void submit(e)}>
     {register&&<label className="auth-field"><span>Name</span><input autoComplete="name" value={name} onChange={e=>setName(e.target.value)} required minLength={2} placeholder="Dein Name"/></label>}
     <label className="auth-field"><span>E-Mail-Adresse</span><div className="auth-input"><Mail size={17}/><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="name@beispiel.de"/></div></label>
     <label className="auth-field"><span>Passwort</span><div className="auth-input"><LockKeyhole size={17}/><input type={visible?"text":"password"} autoComplete={register?"new-password":"current-password"} value={password} onChange={e=>setPassword(e.target.value)} required minLength={register?12:1} placeholder="••••••••••••"/><button className="auth-reveal" type="button" onClick={()=>setVisible(v=>!v)} aria-label={visible?"Passwort verbergen":"Passwort anzeigen"}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
     {register&&<p className="auth-hint">Mindestens 12 Zeichen. Registrierung nach der Einrichtung in Coolify wieder deaktivieren.</p>}
     {error&&<p className="auth-error" role="alert">{error}</p>}
     <button type="submit" className="auth-submit" disabled={busy}><LogIn size={17}/>{busy?"Bitte warten …":register?"Konto erstellen":"Anmelden"}</button>
   </form>
   {allowRegistration&&<button className="auth-toggle" onClick={()=>{setRegister(v=>!v);setError("");}}>{register?"Ich habe bereits ein Konto – anmelden":"Erstes Konto einrichten"}</button>}
   <p className="auth-foot">Sicherer Zugang mit Better Auth · Eurojackpot Archiv</p>
 </div></main>;
}
