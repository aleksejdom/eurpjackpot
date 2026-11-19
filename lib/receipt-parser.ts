/**
 * Conservative, receipt-specific text parser. Field detection uses Spiel N anchors
 * and 5/50 + 2/12 row labels, never arbitrary barcode / serial numbers.
 * Every OCR value is a suggestion requiring visual confirmation.
 */
export type ReceiptLine={index:number;main:string;euro:string;complete:boolean};
export type ReceiptScan={lines:ReceiptLine[];purchaseDate:string|null;drawDates:string[];amount:string|null;weeks:number|null;warnings:string[];recognized:boolean};
type Entry={main?:string;euro?:string};
const normalize=(x:string)=>x.replace(/[\u00a0\u200b\u200e]/g," ").replace(/[：]/g,":").replace(/[，]/g,",");
function dateOf(s:string):string|null {
  const m=s.match(/\b(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{2}|\d{4})\b/);
  if(!m)return null;
  const year=Number(m[3].length===2?"20"+m[3]:m[3]), month=+m[2],day=+m[1];
  const d=new Date(Date.UTC(year,month-1,day,12));
  return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day
    ?`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`:null;
}
function nextDate(start:string,offset:number) {const date=new Date(start+"T12:00:00Z");date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);}
function digits(raw:string,count:number,max:number):string|null {
  // The short punctuation fragments are sometimes split into 1 and 1 instead of 11;
  // never combine ambiguous tokens into guessed numbers.
  const arr=(raw.match(/(?<!\d)\d{1,2}(?!\d)/g)||[]).map(Number);
  return arr.length===count && arr.every(v=>v>=1&&v<=max)&&new Set(arr).size===count ? arr.join(" ") : null;
}
const header=/\bSp[i1lI]{1,3}e?l?\s*([1-9]|1\d|20)\s*[:.]?/i;
// Accept Spiel/SpieI/Spie1, but not Spiel 77 (additional lottery).
const spiel=/\b(?:Spiel|Spie[lI1]|SpieI)\s*([1-9]|1\d|20)\s*[:.]?/i;
const mainMarker=/\b5\s*[/|:]\s*50\s*[:;.]?\s*/i;
const euroMarker=/\b2\s*[/|:]\s*12\s*[:;.]?\s*/i;
const stop=/\b(?:Laufzeit|Betrag|Eurojackpot\s*:|Gl[uü]cksSpirale|Super\s*6|Spiel\s*77|Spiel\s*7\s*7|Spielquittungs|Schein)\b/i;
function rowPieces(text:string):Array<{kind:"main"|"euro";value:string}>{
  const marks=[...text.matchAll(/(?:5\s*[/|:]\s*50|2\s*[/|:]\s*12)\s*[:;.]?/gi)];
  return marks.map((m,i)=>({
    kind:/^5/.test(m[0])?"main":"euro",
    value:text.slice((m.index||0)+m[0].length, i+1<marks.length?marks[i+1].index:undefined)
  }));
}
export function parseEurojackpotReceipt(raw:string):ReceiptScan{
 const result:ReceiptScan={lines:[],purchaseDate:null,drawDates:[],amount:null,weeks:null,warnings:[],recognized:false};
 const rows=normalize(raw).split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
 result.recognized=/EURO\s*JACKPOT|JACKPOT|SPIEL\s*QUITTUNG|\b5\s*\/\s*50/i.test(raw);
 const found=new Map<number,Entry>();
 let current:number|null=null, pending:"main"|"euro"|null=null;
 for(let i=0;i<rows.length;i++){
   const row=rows[i];
   if(stop.test(row) && !spiel.test(row)){current=null;pending=null;continue;}
   const match=row.match(spiel);
   if(match){
     current=Number(match[1]);pending="main";
     if(!found.has(current))found.set(current,{});
   }
   if(current===null)continue;
   const entry=found.get(current)!;
   const content=match?row.slice((match.index||0)+match[0].length).trim():row;
   const pieces=rowPieces(content);
   if(pieces.length){
     for(const piece of pieces){
       const value=digits(piece.value,piece.kind==="main"?5:2,piece.kind==="main"?50:12);
       if(value)entry[piece.kind]=value;
       pending=value?null:piece.kind;
     }
   }else if(pending){
     const value=digits(content,pending==="main"?5:2,pending==="main"?50:12);
     if(value){entry[pending]=value;pending=null;}
   }
 }
 for(const [index,entry] of [...found].sort((a,b)=>a[0]-b[0])){
   if(!entry.main&&!entry.euro)continue;
   result.lines.push({index,main:entry.main||"",euro:entry.euro||"",complete:!!entry.main&&!!entry.euro});
   if(!entry.main||!entry.euro)result.warnings.push(`Spiel ${index}: Zahlen unvollständig erkannt`);
 }
 const indexOfGame=rows.findIndex(x=>/EURO\s*JACKPOT|JACKPOT/i.test(x));
 const headerRows=rows.slice(0,indexOfGame>=0?indexOfGame:Math.min(rows.length,8));
 result.purchaseDate=headerRows.map(dateOf).find(Boolean)||null;
 const weeks=rows.join(" ").match(/Laufzeit\s*[:;.]?\s*(\d{1,2})\s*Woch/i);
 if(weeks)result.weeks=+weeks[1];
 const amountAt=rows.findIndex(x=>/\bBetrag\b/i.test(x));
 if(amountAt>=0){
   const near=rows.slice(amountAt,amountAt+3).join(" ");
   const match=near.match(/\bBetrag\s*[:;.]?\s*(\d{1,5})\s*[,\.]\s*(\d{2})\b/i);
   if(match)result.amount=`${match[1]},${match[2]}`;
 }
 const drawAt=rows.findIndex(x=>/Eurojackpot\s*:/i.test(x));
 if(drawAt>=0){
   const text=rows.slice(drawAt,drawAt+4).join(" ");
   const date=dateOf(text);
   if(date){
     const day=new Date(date+"T12:00:00Z").getUTCDay();
     if(day!==2&&day!==5)result.warnings.push("Erkanntes Ziehungsdatum ist weder Dienstag noch Freitag");
     else {
       const multipleDays=/\bDi\b/i.test(text)&&/\bFr\b/i.test(text);
       if(multipleDays)result.warnings.push("Beide Ziehungstage erkannt – weitere Termine manuell prüfen");
       if(result.weeks&&result.weeks>12)result.warnings.push("Ungewöhnliche Laufzeit – Termine bitte prüfen");
       const weeksCount=(!multipleDays&&result.weeks&&result.weeks<=12)?result.weeks:1;
       result.drawDates=Array.from({length:weeksCount},(_,i)=>nextDate(date,i*7));
     }
   }
 }
 if(!result.purchaseDate)result.warnings.push("Kaufdatum nicht sicher erkannt");
 if(!result.amount)result.warnings.push("Betrag nicht sicher erkannt");
 if(!result.drawDates.length)result.warnings.push("Ziehungsdatum nicht sicher erkannt");
 if(!result.lines.length)result.warnings.push("Keine vollständigen Spielnummer-Anker erkannt");
 return result;
}
/** Merge independent OCR passes by field. A disagreement is left empty, not silently guessed. */
export function mergeReceiptScans(scans:ReceiptScan[]):ReceiptScan{
 const merged:ReceiptScan={lines:[],purchaseDate:null,drawDates:[],amount:null,weeks:null,warnings:[],recognized:scans.some(s=>s.recognized)};
 const conflict=new Set<string>();
 const pick=<T>(name:string, values:T[], key:(x:T)=>string):T|null=>{
   if(!values.length)return null;
   const counts=new Map<string,{value:T;n:number}>();
   for(const value of values){const k=key(value);const entry=counts.get(k);if(entry)entry.n++;else counts.set(k,{value,n:1});}
   const ranked=[...counts.values()].sort((a,b)=>b.n-a.n);
   if(ranked.length>1&&ranked[0].n===ranked[1].n){conflict.add(name);return null;}
   return ranked[0].value;
 };
 merged.purchaseDate=pick("Kaufdatum",scans.flatMap(s=>s.purchaseDate?[s.purchaseDate]:[]),String);
 merged.amount=pick("Betrag",scans.flatMap(s=>s.amount?[s.amount]:[]),String);
 merged.weeks=pick("Laufzeit",scans.flatMap(s=>s.weeks?[s.weeks]:[]),String);
 merged.drawDates=pick("Ziehungstermine",scans.filter(s=>s.drawDates.length).map(s=>s.drawDates),s=>s.join("|"))||[];
 const ids=[...new Set(scans.flatMap(s=>s.lines.map(l=>l.index)))].sort((a,b)=>a-b);
 for(const index of ids){
   const candidates=scans.flatMap(s=>s.lines.filter(l=>l.index===index));
   const main=pick(`Spiel ${index} Hauptzahlen`,candidates.map(l=>l.main).filter(Boolean),String)||"";
   const euro=pick(`Spiel ${index} Eurozahlen`,candidates.map(l=>l.euro).filter(Boolean),String)||"";
   merged.lines.push({index,main,euro,complete:!!main&&!!euro});
   if(!main||!euro)merged.warnings.push(`Spiel ${index}: bitte fehlende Zahlen ergänzen`);
 }
 merged.warnings.push(...[...conflict].map(k=>`Widersprüchliche OCR-Ergebnisse bei ${k}: bitte manuell prüfen`));
 if(!merged.purchaseDate)merged.warnings.push("Kaufdatum prüfen");
 if(!merged.amount)merged.warnings.push("Betrag prüfen");
 if(!merged.drawDates.length)merged.warnings.push("Ziehungstermin prüfen");
 if(!merged.lines.length)merged.warnings.push("Keine Tippfelder erkannt");
 return merged;
}
