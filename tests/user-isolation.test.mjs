import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("all personal ticket routes derive the user ID from Better Auth session",()=>{
 for(const path of ["app/api/games/route.ts","app/api/games/[id]/route.ts","app/api/games/[id]/payout/route.ts"]){
  const source=read(path);
  assert.match(source,/getUserSession\(\)/);
  assert.match(source,/session|userId/);
  assert.match(source,/\.user\?\.id/);
  assert.doesNotMatch(source,/req\.json\(\)\.userId/);
 }
});
test("all ticket operations are scoped by owner at the database query level",()=>{
 const source=read("lib/games.ts");
 assert.match(source,/owner_user_id TEXT NOT NULL/);
 assert.match(source,/ALTER TABLE ej_tickets ADD COLUMN IF NOT EXISTS owner_user_id TEXT/);
 assert.match(source,/INSERT INTO ej_tickets\(owner_user_id,purchased_on/);
 assert.match(source,/FROM ej_tickets t WHERE t\.owner_user_id=\$1/);
 assert.match(source,/UPDATE ej_tickets SET [\s\S]*?WHERE id=\$1::bigint AND owner_user_id=\$5/);
 assert.match(source,/DELETE FROM ej_tickets WHERE id=\$1::bigint AND owner_user_id=\$2/);
 assert.match(source,/t\.owner_user_id=\$4/);
 assert.match(source,/if\(!userId\)throw new Error/);
});
test("ticket routes always pass session user id to every CRUD operation",()=>{
 const route=read("app/api/games/route.ts");
 assert.match(route,/listTickets\(userId\)/);
 assert.match(route,/createTicket\(userId,/);
 const item=read("app/api/games/[id]/route.ts");
 assert.match(item,/updateTicket\(userId,/);
 assert.match(item,/deleteTicket\(userId,/);
 const payout=read("app/api/games/[id]/payout/route.ts");
 assert.match(payout,/setPayout\(userId,/);
});
