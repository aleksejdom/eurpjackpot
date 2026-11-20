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


/**
 * Digital ticket screenshots ("Mein Spielauftrag" / "Spielfeld N").
 * Unlike a printed receipt, the seven numbers are displayed in one horizontal
 * pill: 5 main values followed by 2 Euro values. All parsing is conservative:
 * reject ambiguous/incomplete lines rather than inventing digits.
 */
export function isDigitalEurojackpotScreenshot(raw:string):boolean{
 return /\b(?:Mein\s+Spielauftrag|Spielfel[d0]\s*\d+)\b/i.test(normalize(raw));
}
function digitalNumbers(raw:string):{main:string;euro:string}|null{
 // Only numbers from the number strip; reject text, currency, date and longer IDs.
 // OCR occasionally supplies a + or a bar between the main and Euro balls.
 const compact=raw.replace(/[\u00a0|+•·()]/g," ").trim();
 if(!/^[\d\s,;.-]+$/.test(compact))return null;
 const parts=compact.match(/(?<!\d)\d{1,2}(?!\d)/g);
 if(!parts||parts.length!==7)return null;
 const values=parts.map(Number),main=values.slice(0,5),euro=values.slice(5);
 if(main.some(n=>n<1||n>50)||new Set(main).size!==5||
    euro.some(n=>n<1||n>12)||new Set(euro).size!==2)return null;
 return {main:main.join(" "),euro:euro.join(" ")};
}
function digitalFieldLine(text:string):{index:number;rest:string}|null{
 // Accept "Spielfeld 1" and the common OCR variations "Spiel feld 1".
 const m=text.match(/\bSpiel\s*feld\s*([1-9]|1\d|20)\b\s*[:.]?/i);
 if(!m)return null;
 return {index:Number(m[1]),rest:text.slice((m.index??0)+m[0].length).trim()};
}
function labeledDate(raw:string,label:"Kaufdatum"|"Ziehung"):string|null{
 const pattern=label==="Kaufdatum"?/^\s*Kauf\s*datum\b/i:/^\s*Ziehung\b/i;
 const rows=normalize(raw).split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
 const i=rows.findIndex(row=>pattern.test(row));
 if(i<0)return null;
 const dateText=[rows[i],rows[i+1]||""].join(" ");
 return dateOf(dateText);
}
export function parseDigitalEurojackpotScreenshot(raw:string):ReceiptScan{
 const result:ReceiptScan={lines:[],purchaseDate:null,drawDates:[],amount:null,weeks:null,warnings:[],recognized:isDigitalEurojackpotScreenshot(raw)};
 const rows=normalize(raw).split(/\r?\n/).map(r=>r.trim()).filter(Boolean);
 const fields=new Map<number,{main:string;euro:string}>();
 let current:number|null=null;
 let buffer:string[]=[];
 function finish(){
  if(current===null)return;
  // The screenshots label Eurozahlen above the seven-ball row.
  // Strip only those labels, never trim actual number digits.
  const candidates=buffer.map(line=>line.replace(/\bEuro\s*zahlen\b/gi,"").trim())
    .filter(Boolean);
  let value:{main:string;euro:string}|null=null;
  for(const line of candidates){
   value=digitalNumbers(line);
   if(value)break;
  }
  if(!value){
   // OCR may wrap a single row into two lines (5 mains, then 2 Euros).
   // Do not combine unrelated metadata from the screenshot.
   const onlyDigits=candidates.filter(line=>/^[\d\s,;.+|•·()-]+$/.test(line));
   if(onlyDigits.length===2)value=digitalNumbers(onlyDigits.join(" "));
  }
  if(value)fields.set(current,value);
  else result.warnings.push("Spielfeld "+current+": 5 Haupt- und 2 Eurozahlen nicht eindeutig erkannt");
 }
 for(const row of rows){
  const next=digitalFieldLine(row);
  if(next){
   finish();current=next.index;buffer=next.rest?[next.rest]:[];
   continue;
  }
  if(current===null)continue;
  if(/\b(?:Losnummer|Kaufdatum|Ziehung|Preis|Laufzeit|Bitte\s+beachten|Mein\s+Spielauftrag)\b/i.test(row)){
   finish();current=null;buffer=[];
   continue;
  }
  // OCR may emit misplaced header/footer text. Keep only compact field region.
  if(buffer.length<6)buffer.push(row);
 }
 finish();
 result.lines=[...fields].sort((a,b)=>a[0]-b[0]).map(([index,v])=>({index,...v,complete:true}));
 // The purchase date can match the draw date, but they have separate labels.
 result.purchaseDate=labeledDate(raw,"Kaufdatum");
 const draw=labeledDate(raw,"Ziehung");
 if(draw){
  const weekday=new Date(draw+"T12:00:00Z").getUTCDay();
  if(weekday===2||weekday===5)result.drawDates=[draw];
  else result.warnings.push("Ziehungsdatum ist nicht Dienstag oder Freitag");
 }
 const priceLine=rows.findIndex(line=>/\bPreis\b/i.test(line));
 if(priceLine>=0){
  const text=rows.slice(priceLine,priceLine+2).join(" ");
  const match=text.match(/\bPreis\s*[:.]?\s*(\d{1,5})\s*[,\.]\s*(\d{2})\s*€?/i);
  if(match)result.amount=match[1]+","+match[2];
 }
 const duration=rows.join(" ").match(/\bLaufzeit\s*[:.]?\s*(\d{1,2})\s*Woch/i);
 if(duration)result.weeks=Number(duration[1]);
 // Do not fabricate additional draw dates; the screenshot explicitly states
 // one draw, even though the "Laufzeit" describes the ticket duration.
 if(!result.lines.length)result.warnings.push("Keine lesbaren Spielfelder erkannt");
 if(!result.purchaseDate)result.warnings.push("Kaufdatum prüfen");
 if(!result.drawDates.length)result.warnings.push("Ziehungsdatum prüfen");
 if(!result.amount)result.warnings.push("Preis prüfen");
 return result;
}
