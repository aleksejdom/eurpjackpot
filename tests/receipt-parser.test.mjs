import test from "node:test";
import assert from "node:assert/strict";
import {parseEurojackpotReceipt,parseDigitalEurojackpotScreenshot,isDigitalEurojackpotScreenshot,digitalFieldRegionsFromTsv,spatialDigitalLinesFromTsv,reconcileDigitalFieldScans,parseDigitalNumbersFromText,mergeReceiptScans} from "../lib/receipt-parser.ts";
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

test("digital Spielauftrag screenshot: all four fields plus date and price",()=>{
 const screenshot=`Für diese Ziehung liegen noch keine Ergebnisse vor
Mein Spielauftrag
Spielfeld 1
Eurozahlen
3 4 21 34 37 9 10
Spielfeld 2
Eurozahlen
14 24 39 41 42 7 8
Spielfeld 3
Eurozahlen
17 21 32 38 39 7 9
Spielfeld 4
Eurozahlen
1 4 33 44 45 1 10
Losnummer 8028742
Kaufdatum Fr. 20.11.2026, 14:21
Ziehung Fr. 20.11.2026, 20:00
Preis 9,60 €
Laufzeit 1 Woche`;
 assert.equal(isDigitalEurojackpotScreenshot(screenshot),true);
 const s=parseDigitalEurojackpotScreenshot(screenshot);
 assert.deepEqual(s.lines.map(l=>l.main),["3 4 21 34 37","14 24 39 41 42","17 21 32 38 39","1 4 33 44 45"]);
 assert.deepEqual(s.lines.map(l=>l.euro),["9 10","7 8","7 9","1 10"]);
 assert.ok(s.lines.every(l=>l.complete));
 assert.equal(s.purchaseDate,"2026-11-20");
 assert.deepEqual(s.drawDates,["2026-11-20"]);
 assert.equal(s.amount,"9,60");
 assert.equal(s.weeks,1);
});
test("digital screenshot recognizes OCR-wrapped rows and keeps purchase separate from draw date",()=>{
 const s=parseDigitalEurojackpotScreenshot(`Mein Spielauftrag
Spielfeld 1 Eurozahlen
3 4 21 34 37
9 10
Spielfeld 2
Eurozahlen
14 24 39 41 42 7 8
Kaufdatum
19.11.2026, 17:20
Ziehung
20.11.2026, 20:00
Preis
9,60 €
Laufzeit: 1 Woche`);
 assert.equal(s.lines.length,2);
 assert.ok(s.lines.every(l=>l.complete));
 assert.deepEqual(s.drawDates,["2026-11-20"]);
 assert.equal(s.purchaseDate,"2026-11-19");
 assert.equal(s.amount,"9,60");
});
test("digital screenshot does not infer numbers from metadata",()=>{
 const s=parseDigitalEurojackpotScreenshot(`Mein Spielauftrag
Spielfeld 1
Eurozahlen
3 4 21 34
Losnummer 8028742
Kaufdatum 20.11.2026
Ziehung 20.11.2026
Preis 9,60 €`);
 assert.equal(s.lines.length,1);
 assert.equal(s.lines[0].complete,false);
 assert.equal(s.lines[0].main,"");
 assert(s.warnings.some(w=>w.includes("Spielfeld 1")));
});


test("TSV geometry locates independent Spielfeld regions with no barcode/price contamination",()=>{
 const header="level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
 const line=(level,block,lineNum,word,left,top,width,height,text)=>
  [level,1,block,1,lineNum,word,left,top,width,height,92,text].join("\t");
 const tsv=[header,
  line(1,0,0,0,0,0,980,1750,""),
  line(5,1,1,1,60,330,150,33,"Spielfeld"),
  line(5,1,1,2,220,330,25,33,"1"),
  line(5,1,2,1,65,410,620,35,"3 4 21 34 37 9 10"),
  line(5,2,1,1,60,555,150,33,"Spielfeld"),
  line(5,2,1,2,220,555,25,33,"2"),
  line(5,3,1,1,60,790,150,33,"Spielfeld"),
  line(5,3,1,2,220,790,25,33,"3"),
  line(5,4,1,1,60,1020,150,33,"Spielfeld"),
  line(5,4,1,2,220,1020,25,33,"4"),
  line(5,5,1,1,60,1360,140,30,"Kaufdatum"),
  line(5,6,1,1,60,1470,140,30,"Ziehung")
 ].join("\n");
 const regions=digitalFieldRegionsFromTsv(tsv);
 assert.deepEqual(regions.map(r=>r.index),[1,2,3,4]);
 assert(regions.every(r=>r.width>500&&r.height>30));
 assert(regions[0].top>330&&regions[0].top<410);
 assert(regions[0].top+regions[0].height<=555);
 assert(regions[3].top+regions[3].height<=1360);
});
test("isolated OCR game rows reject incomplete and duplicate numbers",()=>{
 assert.deepEqual(parseDigitalNumbersFromText("Eurozahlen\n3 4 21 34 37 9 10"),{main:"3 4 21 34 37",euro:"9 10"});
 assert.deepEqual(parseDigitalNumbersFromText("3 4 21 34 37\n9 10"),{main:"3 4 21 34 37",euro:"9 10"});
 assert.equal(parseDigitalNumbersFromText("3 4 21 34 37 9"),null);
 assert.equal(parseDigitalNumbersFromText("3 4 21 34 37 9 9"),null);
});


test("each Spielfeld is linked to its own TSV number row, not the first row",()=>{
 const header="level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
 const lines=[header,[1,1,0,0,0,0,0,0,1179,1872,0,""].join("\t")];
 const put=(block,lineNum,word,left,top,text)=>lines.push([5,1,block,1,lineNum,word,left,top,40,28,90,text].join("\t"));
 for(const [i,values] of [
  [3,4,21,34,37,9,10],
  [14,24,39,41,42,7,8],
  [17,21,32,38,39,7,9],
  [1,4,33,44,45,1,10]
 ].entries()){
  const block=i+1;
  put(block,1,1,60,280+i*225,"Spielfeld");
  put(block,1,2,250,280+i*225,String(block));
  values.forEach((n,j)=>put(block,2,j+1,78+j*70,345+i*225,String(n)));
 }
 put(5,1,1,70,1300,"Losnummer");
 const spatial=spatialDigitalLinesFromTsv(lines.join("\n"));
 assert.deepEqual(spatial.map(x=>x.index),[1,2,3,4]);
 assert.deepEqual(spatial.map(x=>x.main),["3 4 21 34 37","14 24 39 41 42","17 21 32 38 39","1 4 33 44 45"]);
 assert.deepEqual(spatial.map(x=>x.euro),["9 10","7 8","7 9","1 10"]);
});
test("global OCR repeating numbers never overwrites independently verified fields",()=>{
 const repeated=parseDigitalEurojackpotScreenshot([
  "Mein Spielauftrag","Spielfeld 1","3 4 21 34 37 9 10",
  "Spielfeld 2","3 4 21 34 37 9 10",
  "Spielfeld 3","3 4 21 34 37 9 10",
  "Spielfeld 4","3 4 21 34 37 9 10"
 ].join("\n"));
 const independent=[
  {index:1,main:"3 4 21 34 37",euro:"9 10",complete:true},
  {index:2,main:"14 24 39 41 42",euro:"7 8",complete:true},
  {index:3,main:"17 21 32 38 39",euro:"7 9",complete:true},
  {index:4,main:"1 4 33 44 45",euro:"1 10",complete:true}
 ];
 const result=reconcileDigitalFieldScans([repeated],independent);
 assert.deepEqual(result.lines.map(l=>l.main),independent.map(l=>l.main));
 assert.deepEqual(result.lines.map(l=>l.euro),independent.map(l=>l.euro));
});
test("unverified duplicated OCR rows remain blank rather than copied to every field",()=>{
 const repeated=parseDigitalEurojackpotScreenshot([
  "Mein Spielauftrag","Spielfeld 1","3 4 21 34 37 9 10",
  "Spielfeld 2","3 4 21 34 37 9 10"
 ].join("\n"));
 const result=reconcileDigitalFieldScans([repeated]);
 assert.equal(result.lines.length,2);
 assert(result.lines.every(line=>!line.complete&&!line.main&&!line.euro));
 assert(result.warnings.some(message=>message.includes("dieselbe Reihe")));
});
