import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(file)=>readFileSync(new URL("../"+file,import.meta.url),"utf8");
test("reset uses Better Auth single-use token and revokes existing sessions",()=>{
 const auth=read("lib/auth.ts");
 assert.match(auth,/sendResetPassword\s*:/);
 assert.match(auth,/resetPasswordTokenExpiresIn:\s*60\s*\*\s*30/);
 assert.match(auth,/revokeSessionsOnPasswordReset:\s*true/);
 assert.doesNotMatch(auth,/console\.log\([^\n]*token/);
});
test("password recovery UI does not reveal users and requires confirmation",()=>{
 const request=read("components/forgot-password-form.tsx");
 const reset=read("components/reset-password-form.tsx");
 const login=read("components/login-form.tsx");
 assert.match(login,/href="\/forgot-password"/);
 assert.match(request,/authClient\.requestPasswordReset/);
 assert.match(request,/Falls ein Konto mit dieser E-Mail-Adresse existiert/);
 assert.match(reset,/authClient\.resetPassword/);
 assert.match(reset,/newPassword!==repeatPassword/);
 assert.match(reset,/window\.history\.replaceState/);
});
test("mail delivery requires SMTP and matches trusted https app origin",()=>{
 const email=read("lib/password-reset-mail.ts");
 const route=read("app/api/auth/[...all]/route.ts");
 assert.match(email,/SMTP_HOST/);
 assert.match(email,/SMTP_PASSWORD/);
 assert.match(email,/new URL\(url\)/);
 assert.match(email,/link\.origin!==app\.origin/);
 assert.match(email,/requireTLS:port!==465/);
 assert.match(route,/passwordResetMailConfigured/);
 assert.match(route,/status:503/);
});
