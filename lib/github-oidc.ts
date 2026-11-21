import {createPublicKey,verify as verifySignature,type JsonWebKey} from "node:crypto";

const ISSUER="https://token.actions.githubusercontent.com";
const JWKS_URL=ISSUER+"/.well-known/jwks";
const TRUSTED_REPOSITORY="aleksejdom/eurpjackpot";
const TRUSTED_WORKFLOW=TRUSTED_REPOSITORY+"/.github/workflows/sync-eurojackpot.yml@refs/heads/main";
const DEFAULT_AUDIENCE="https://euro.ad-d.info/api/cron/sync";
const FIVE_MINUTES=300;
type JsonObject=Record<string,unknown>;
type Jwk={kty:string;kid?:string;alg?:string;use?:string;n?:string;e?:string};
const object=(value:unknown):JsonObject|null=>
 value!==null&&typeof value==="object"&&!Array.isArray(value)?value as JsonObject:null;

/** Cryptographically verify signed GitHub Actions identity. No shared secrets.
 * A compromised token from another repository, workflow, ref, or target
 * audience is not sufficient to trigger this endpoint.
 */
export async function verifyGithubSyncToken(
 token:string,
 loadJwks:typeof fetch=fetch,
 audience:string=DEFAULT_AUDIENCE
):Promise<boolean>{
 try{
  if(typeof token!=="string"||token.length>16000)return false;
  const sections=token.split(".");
  if(sections.length!==3||sections.some(s=>!/^[A-Za-z0-9_-]+$/.test(s)))return false;
  const header=object(JSON.parse(Buffer.from(sections[0],"base64url").toString("utf8")));
  const claims=object(JSON.parse(Buffer.from(sections[1],"base64url").toString("utf8")));
  if(!header||!claims||header.alg!=="RS256"||typeof header.kid!=="string"||!header.kid)return false;
  if(claims.iss!==ISSUER||claims.aud!==audience)return false;
  if(claims.repository!==TRUSTED_REPOSITORY||claims.ref!=="refs/heads/main"||claims.workflow_ref!==TRUSTED_WORKFLOW)return false;
  if(claims.event_name!=="schedule"&&claims.event_name!=="workflow_dispatch")return false;
  const now=Math.floor(Date.now()/1000);
  if(typeof claims.exp!=="number"||typeof claims.iat!=="number"||!Number.isFinite(claims.exp)||!Number.isFinite(claims.iat))return false;
  if(claims.exp<=now||claims.iat>now+30||claims.iat<now-FIVE_MINUTES||claims.exp>now+FIVE_MINUTES+30)return false;
  if(claims.nbf!==undefined&&(typeof claims.nbf!=="number"||claims.nbf>now+30))return false;
  const response=await loadJwks(JWKS_URL,{cache:"no-store",signal:AbortSignal.timeout(6000)});
  if(!response.ok)return false;
  const keys=object(await response.json())?.keys;
  if(!Array.isArray(keys))return false;
  const key=keys.map(object).find(k=>k?.kid===header.kid&&k?.kty==="RSA"&&
   (k.alg===undefined||k.alg==="RS256")&&(k.use===undefined||k.use==="sig")&&typeof k.n==="string"&&typeof k.e==="string") as Jwk|undefined;
  if(!key)return false;
  const publicKey=createPublicKey({key:key as JsonWebKey,format:"jwk"});
  return verifySignature("RSA-SHA256",Buffer.from(sections[0]+"."+sections[1]),publicKey,Buffer.from(sections[2],"base64url"));
 }catch{
  return false; // Fail closed if GitHub's keys are unreachable or malformed.
 }
}
