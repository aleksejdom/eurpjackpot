import "server-only";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

export function passwordResetMailConfigured():boolean{
 const env=process.env;
 const required=[env.SMTP_HOST,env.SMTP_USER,env.SMTP_PASSWORD,env.SMTP_FROM];
 const port=Number(env.SMTP_PORT||587);
 return required.every(x=>typeof x==="string"&&x.trim().length>0)&&
  Number.isInteger(port)&&port>0&&port<=65535&&
  !!env.BETTER_AUTH_URL;
}

function validateResetUrl(url:string):void{
 const expected=process.env.BETTER_AUTH_URL;
 if(!expected)throw Error("Better Auth URL nicht konfiguriert");
 const link=new URL(url),app=new URL(expected);
 if(link.origin!==app.origin||link.protocol!=="https:")
  throw Error("Passwort-Link hat eine unerwartete Zieladresse");
}

/** Sends a single-use Better Auth URL. Do not log or persist the URL/token. */
export async function sendPasswordResetMail(to:string,url:string):Promise<void>{
 if(!passwordResetMailConfigured())throw Error("SMTP für Passwort-Zurücksetzung nicht konfiguriert");
 validateResetUrl(url);
 const port=Number(process.env.SMTP_PORT||587);
 const options:SMTPTransport.Options={
  host:process.env.SMTP_HOST!,
  port,
  secure:port===465,
  requireTLS:port!==465,
  auth:{user:process.env.SMTP_USER!,pass:process.env.SMTP_PASSWORD!},
  tls:{minVersion:"TLSv1.2"},
  connectionTimeout:10000,
  greetingTimeout:10000,
  socketTimeout:12000
 };
 const transporter=nodemailer.createTransport(options);
 try{
  await transporter.sendMail({
   from:process.env.SMTP_FROM!,
   to,
   subject:"Eurojackpot – Passwort zurücksetzen",
   text:"Du hast eine Passwort-Zurücksetzung angefordert.\n\n" +
    "Öffne diesen einmalig gültigen Link, um ein neues Passwort festzulegen:\n"+
    url+"\n\nFalls du das nicht angefordert hast, ignoriere diese E-Mail.\n",
   // Avoid loading external tracking pixels or embedding untrusted HTML.
   headers:{"Auto-Submitted":"auto-generated"}
  });
 }finally{transporter.close();}
}
