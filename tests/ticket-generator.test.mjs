import test from "node:test";
import assert from "node:assert/strict";
import {
 generatePicks,DEFAULT_RULES,validateExclusions,
 recentlyDrawnExclusions,combinedExclusions,ticketKey,analyzeHistory
} from "../lib/ticket-generator.ts";
const draws=[
 {date:"2026-11-17",main_numbers:[1,5,7,15,19],euro_numbers:[1,11]},
 {date:"2026-11-13",main_numbers:[5,12,27,35,44],euro_numbers:[4,9]},
 {date:"2026-11-10",main_numbers:[7,15,17,40,44],euro_numbers:[5,7]},
 {date:"2026-11-06",main_numbers:[3,8,21,30,48],euro_numbers:[2,10]},
 {date:"2026-10-30",main_numbers:[6,13,20,38,50],euro_numbers:[3,12]}
];
test("hard recent filter includes latest draw and excludes BOTH main and Euro numbers",()=>{
 const excluded=recentlyDrawnExclusions(draws,2);
 assert(excluded.main.includes(1));
 assert(excluded.main.includes(48));
 assert(excluded.euro.includes(11));
 assert(excluded.euro.includes(10));
 assert(!excluded.main.includes(6));
 assert(!excluded.euro.includes(3));
 const tickets=generatePicks(draws,5,"recent",DEFAULT_RULES,excluded);
 assert.equal(tickets.length,5);
 for(const ticket of tickets){
  assert(ticket.main.every(n=>!excluded.main.includes(n)));
  assert(ticket.euro.every(n=>!excluded.euro.includes(n)));
 }
});
test("manual exclusion merges with recent exclusion and is enforced before scoring",()=>{
 const auto=recentlyDrawnExclusions(draws,2);
 const manual={main:[34,45],euro:[6]};
 const all=combinedExclusions(manual,auto);
 const tickets=generatePicks(draws,5,"frequency",DEFAULT_RULES,all);
 for(const t of tickets){
  assert(t.main.every(n=>!all.main.includes(n)));
  assert(t.euro.every(n=>!all.euro.includes(n)));
 }
});
test("all five tickets are valid, have unique full combinations and no duplicates within a field",()=>{
 const tickets=generatePicks(draws,5,"frequency",DEFAULT_RULES,{main:[],euro:[]});
 assert.equal(new Set(tickets.map(ticketKey)).size,5);
 for(const t of tickets){
  assert.equal(t.main.length,5);
  assert.equal(t.euro.length,2);
  assert.equal(new Set(t.main).size,5);
  assert.equal(new Set(t.euro).size,2);
  assert(t.main.every(n=>n>=1&&n<=50));
  assert(t.euro.every(n=>n>=1&&n<=12));
 }
});
test("rejects exclusions that make legal tickets impossible",()=>{
 assert.throws(()=>validateExclusions({main:Array.from({length:46},(_,i)=>i+1),euro:[]},5));
 assert.throws(()=>validateExclusions({main:[],euro:Array.from({length:11},(_,i)=>i+1)},5));
 assert.throws(()=>validateExclusions({main:Array.from({length:45},(_,i)=>i+1),euro:Array.from({length:10},(_,i)=>i+1)},2));
});
test("historical analysis counts neighbors and sample sizes without predictive claims",()=>{
 const result=analyzeHistory(draws);
 assert.equal(result.draws,5);
 assert.equal(result.firstDate,"2026-10-30");
 assert.equal(result.lastDate,"2026-11-17");
 assert.equal(result.sumRange,null);
});
