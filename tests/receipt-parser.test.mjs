import test from "node:test";
import assert from "node:assert/strict";
import {parseEurojackpotReceipt,mergeReceiptScans} from "../lib/receipt-parser.ts";
const sample=`SPIELQUITTUNG
14.11.26 19:45:43
EURO JACKPOT
Spiel 1
5/50: 1 6 25 29 47
2/12: 4 11
Spiel 2
5/50: 5 13 14 28 46
2/12: 9 11
Spiel 3
5/50: 22 28 29 34 40
2/12: 3 7
Spiel 4
5/50: 8 12 41 43 46
2/12: 7 8
GlücksSpirale NEIN
Spiel 77 NEIN
Laufzeit: 1 Woche
Eurojackpot:
17.11.26 Di
Betrag 8,35 €
`;
test("Lotto BW four fields, dates and total",()=>{
 const s=parseEurojackpotReceipt(sample);
 assert.equal(s.purchaseDate,"2026-11-14");
 assert.equal(s.amount,"8,35");
 assert.deepEqual(s.drawDates,["2026-11-17"]);
 assert.equal(s.weeks,1);
 assert.deepEqual(s.lines.map(l=>l.main),["1 6 25 29 47","5 13 14 28 46","22 28 29 34 40","8 12 41 43 46"]);
 assert.deepEqual(s.lines.map(l=>l.euro),["4 11","9 11","3 7","7 8"]);
 assert.ok(s.lines.every(l=>l.complete));
});
test("same-line header and labels as well as wrapped rows",()=>{
 const s=parseEurojackpotReceipt(`SPIELQUITTUNG
14.11.26
EURO JACKPOT
Spiel 1 5/50: 1 6 25 29 47 2/12: 4 11
Spiel 2
5/50:
5 13 14 28 46
2/12:
9 11
Laufzeit: 1 Woche
Eurojackpot: 17.11.26 Di
Betrag 8,35 €`);
 assert.equal(s.lines.length,2);
 assert.ok(s.lines.every(l=>l.complete));
 assert.deepEqual(s.lines.map(l=>l.euro),["4 11","9 11"]);
});
test("do not guess missing or extra numbers",()=>{
 const s=parseEurojackpotReceipt("EURO JACKPOT\nSpiel 1\n5/50: 1 6 25 29\n2/12: 4 11");
 assert.equal(s.lines[0].complete,false);
 assert.equal(s.lines[0].main,"");
 assert.equal(s.lines[0].euro,"4 11");
});
test("merge independent passes by field and flag equal-scored conflicts",()=>{
 const first=parseEurojackpotReceipt("EURO JACKPOT\nSpiel 1\n5/50: 1 6 25 29 47");
 const second=parseEurojackpotReceipt("EURO JACKPOT\nSpiel 1\n2/12: 4 11");
 const merged=mergeReceiptScans([first,second]);
 assert.equal(merged.lines[0].complete,true);
 const conflict=mergeReceiptScans([first,parseEurojackpotReceipt("EURO JACKPOT\nSpiel 1\n5/50: 1 6 25 29 48")]);
 assert.equal(conflict.lines[0].main,"");
 assert.ok(conflict.warnings.some(w=>w.includes("Widersprüchliche")));
});
test("invalid dates are not accepted",()=>{
 const s=parseEurojackpotReceipt("SPIELQUITTUNG\n31.02.26\nEURO JACKPOT\nSpiel 1\n5/50: 1 6 25 29 47\n2/12: 4 11\nEurojackpot: 18.11.26 Mi\nBetrag 8,35 €");
 assert.equal(s.purchaseDate,null);
 assert.deepEqual(s.drawDates,[]);
});
