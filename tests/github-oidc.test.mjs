import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign} from "node:crypto";
import {verifyGithubSyncToken} from "../lib/github-oidc.ts";
const {publicKey,privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});
const jwk=publicKey.export({format:"jwk"});
const audience="https://euro.ad-d.info/api/cron/sync";
const now=Math.floor(Date.now()/1000);
function signed(overrides={}){
 const header={alg:"RS256",typ:"JWT",kid:"test-key"};
 const payload={
  iss:"https://token.actions.githubusercontent.com",aud:audience,
  repository:"aleksejdom/eurpjackpot",
  ref:"refs/heads/main",
  workflow_ref:"aleksejdom/eurpjackpot/.github/workflows/sync-eurojackpot.yml@refs/heads/main",
  event_name:"schedule",iat:now-5,exp:now+180,...overrides
 };
 const part=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
 const input=part(header)+"."+part(payload);
 return input+"."+sign("RSA-SHA256",Buffer.from(input),privateKey).toString("base64url");
}
const fakeJwks=async url=>{
 assert.equal(url,"https://token.actions.githubusercontent.com/.well-known/jwks");
 return new Response(JSON.stringify({keys:[{...jwk,kid:"test-key",use:"sig",alg:"RS256"}]}),{status:200});
};
test("valid signed GitHub workflow token authorizes only the trusted sync task",async()=>{
 assert.equal(await verifyGithubSyncToken(signed(),fakeJwks),true);
 assert.equal(await verifyGithubSyncToken(signed({event_name:"workflow_dispatch"}),fakeJwks),true);
});
test("reject tokens from other repos, workflows, branches, events and audiences",async()=>{
 for(const claim of [
  {repository:"bad/other"},
  {ref:"refs/heads/feature"},
  {workflow_ref:"aleksejdom/eurpjackpot/.github/workflows/verify.yml@refs/heads/main"},
  {event_name:"pull_request"},
  {aud:"https://example.com/sync"},
  {iss:"https://example.com"},
  {exp:now-1},
  {iat:now-400}
 ]){
  assert.equal(await verifyGithubSyncToken(signed(claim),fakeJwks),false,JSON.stringify(claim));
 }
});
test("rejects tampered tokens, malformed headers and missing JWKS keys",async()=>{
 const valid=signed();
 assert.equal(await verifyGithubSyncToken(valid.slice(0,-10)+"aaaaaaaaaa",fakeJwks),false);
 assert.equal(await verifyGithubSyncToken("not-a-token",fakeJwks),false);
 assert.equal(await verifyGithubSyncToken(valid,async()=>new Response(JSON.stringify({keys:[]}))),false);
 assert.equal(await verifyGithubSyncToken(valid,async()=>{throw Error("network down");}),false);
});
