import test from "node:test";
import assert from "node:assert/strict";
import {parseBackupCsv,parsePrimaryDraws,chooseFreshest,expectedLatestDrawDate} from "../lib/draw-sources.ts";
function legacy(date,main=[1,5,7,15,19],euro=[1,11]){return {date,main_numbers:main,euro_numbers:euro};}
const historical=Array.from({length:110},(_,i)=>{
 const d=new Date("2022-04-01T12:00:00Z");
 d.setUTCDate(d.getUTCDate()+i*7);
 return legacy(d.toISOString().slice(0,10));
});
test("parses correctly documented Lottochaos Eurojackpot CSV columns",()=>{
 const csv="date,weekday,n1,n2,n3,n4,n5,b1,b2\n2022-03-22,tue,1,2,3,4,5,6,7\n"+
  Array.from({length:105},(_,i)=>{
   const d=new Date("2022-04-01T00:00:00Z");d.setUTCDate(d.getUTCDate()+7*i);
   return d.toISOString().slice(0,10)+",fri,1,5,7,15,19,1,11";
  }).join("\n")+"\n2026-11-20,fri,15,28,29,34,35,5,9\n";
 const draws=parseBackupCsv(csv);
 assert.equal(draws[0].date,"2026-11-20");
 assert.deepEqual(draws[0].main_numbers,[15,28,29,34,35]);
 assert.deepEqual(draws[0].euro_numbers,[5,9]);
 assert(draws.every(x=>x.date>="2022-03-25"));
});
test("chooses the newest usable source, never first success",()=>{
 const stale=historical;
 const fresh=[legacy("2026-11-20"),...historical];
 const selected=chooseFreshest([{source:"stale",draws:stale},{source:"fresh",draws:fresh}]);
 assert.equal(selected.source,"fresh");
 assert.equal(selected.latestDate,"2026-11-20");
});
test("rejects incomplete source and duplicate or wrong draw days",()=>{
 assert.throws(()=>parsePrimaryDraws({draws:[legacy("2026-11-20")]}));
 assert.throws(()=>parsePrimaryDraws({draws:[...historical,legacy("2026-11-19")]}));
 assert.throws(()=>parsePrimaryDraws({draws:[...historical,...historical]}));
 assert.throws(()=>parseBackupCsv("date,foo\n2026-11-20,1"));
});
test("Friday result is due on Saturday; not early on Friday",()=>{
 assert.equal(expectedLatestDrawDate(new Date("2026-11-21T09:00:00Z")),"2026-11-20");
 assert.equal(expectedLatestDrawDate(new Date("2026-11-20T19:00:00Z")),"2026-11-17");
 assert.equal(expectedLatestDrawDate(new Date("2026-11-20T22:00:00Z")),"2026-11-20");
 assert.equal(expectedLatestDrawDate(new Date("2026-11-17T19:00:00Z")),"2026-11-13");
});
