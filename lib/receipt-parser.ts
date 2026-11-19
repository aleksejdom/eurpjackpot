/** Receipt-aware parser for Lotto BW EUROJACKPOT Spielquittung.
 * It never guesses missing digits and never writes anything to the database.
 * All fields are OCR suggestions requiring verification by the user.
 */
export type ReceiptLine={index:number;main:string;euro:string;complete:boolean};
export type ReceiptScan={lines:ReceiptLine[];purchaseDate:string|null;drawDates:string[];amount:string|null;weeks:number|null;warnings:string[];recognized:boolean};

const clean=(text:string)=>text.replace(/[\u00a0\u200b]/g," ").replace(/[：]/g,":").replace(/[Oo](?=\d)/g,"0");
const numbers=(value:string)=>((value.match(/\b\d{1,2}\b/g)||[]).map(Number));
const valid=(values:number[],size:number,max:number)=>values.length===size&&values.every(n=>n>=1&&n<=max)&&new Set(values).size===size;
function parseDate(value:string):string|null{
 const match=value.match(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2}|\d{4})\b/);
 if(!match)return null;
 const day=Number(match[1]),month=Number(match[2]);
 const year=Number(match[3].length===2?"20"+match[3]:match[3]);
 const date=new Date(Date.UTC(year,month-1,day,12));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
 return [year,("0"+month).slice(-2),("0"+day).slice(-2)].join("-");
}
function nextDate(start:string,offset:number){const d=new Date(start+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
function firstNumbers(line:string,expected:number,max:number):number[]|null{
 // Ignore identifiers (5/50, 2/12) BEFORE parsing content.
 const normalized=line.replace(/^\s*(?:5\s*[\/:]\s*50|2\s*[\/:]\s*12)\s*[:;.]?\s*/i,"").trim();
 const vals=numbers(normalized);
 if(valid(vals,expected,max))return vals;
 // Permit OCR punctuation but never accept excess digits as a guessed sequence.
 return null;
}
export function parseEurojackpotReceipt(raw:string):ReceiptScan {
 const result:ReceiptScan={lines:[],purchaseDate:null,drawDates:[],amount:null,weeks:null,warnings:[],recognized:false};
 const lines=clean(raw).split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
 result.recognized=/EURO\s*JACKPOT|JACKPOT|SPIEL\s*QUITTUNG/i.test(raw);
 const byIndex=new Map<number,{main?:number[];euro?:number[]}>();
 let current:number|null=null;
 let expected:"main"|"euro"|null=null;
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  const match=line.match(/\b(?:Spiel|Spie[l1I])\s*([1-9]|1\d|20)\b\s*[:.]?/i);
  if(match){current=Number(match[1]);if(!byIndex.has(current))byIndex.set(current,{});expected="main";}
  if(current===null)continue;
  if(/\b(?:Laufzeit|Betrag|Eurojackpot\s*:|Gl[uü]cksSpirale|Super\s*6|Spiel\s*77|Schein)/i.test(line)){
    current=null;expected=null;continue;
  }
  const entry=byIndex.get(current)!;
  const mainMarker=line.match(/5\s*[\/:]\s*50\s*[:;.]?\s*(.*)$/i);
  const euroMarker=line.match(/2\s*[\/:]\s*12\s*[:;.]?\s*(.*)$/i);
  if(mainMarker){expected="main";const found=firstNumbers(mainMarker[1],5,50);if(found)entry.main=found;continue;}
  if(euroMarker){expected="euro";const found=firstNumbers(euroMarker[1],2,12);if(found)entry.euro=found;continue;}
  if(expected==="main"&&!entry.main){
    const found=firstNumbers(line,5,50);
    if(found){entry.main=found;expected=null;}
  } else if(expected==="euro"&&!entry.euro){
    const found=firstNumbers(line,2,12);
    if(found){entry.euro=found;expected=null;}
  }
 }
 for(const [index,entry] of [...byIndex].sort((a,b)=>a[0]-b[0])){
  if(!entry.main&&!entry.euro)continue;
  result.lines.push({index,main:entry.main?.join(" ")||"",euro:entry.euro?.join(" ")||"",complete:!!entry.main&&!!entry.euro});
  if(!entry.main||!entry.euro)result.warnings.push("Spiel "+index+": Zahlen unvollständig erkannt");
 }
 // Kaufdatum appears above the large EUROJACKPOT heading (not at the draw date).
 const startOfGame=lines.findIndex(l=>/EURO\s*JACKPOT|JACKPOT/i.test(l));
 const purchaseCandidate=lines.slice(0,startOfGame===-1?Math.min(lines.length,8):startOfGame).map(parseDate).find(Boolean);
 result.purchaseDate=purchaseCandidate||null;
 const weeks=lines.join(" ").match(/Laufzeit\s*[:;.]?\s*(\d{1,2})\s*Woch/i);
 if(weeks)result.weeks=Number(weeks[1]);
 const amountIndex=lines.findIndex(l=>/\bBetrag\b/i.test(l));
 if(amountIndex!==-1){
  const joined=[lines[amountIndex],lines[amountIndex+1]||""].join(" ");
  const amountMatch=joined.match(/(?:Betrag\s*[:;.]?\s*)(\d{1,5})\s*[,\.]\s*(\d{2})\s*€?/i);
  if(amountMatch)result.amount=amountMatch[1]+","+amountMatch[2];
 }
 const euroIndex=lines.findIndex(l=>/Eurojackpot\s*:/i.test(l)&&!/5\/50|2\/12/.test(l));
 if(euroIndex!==-1){
  const section=lines.slice(euroIndex,Math.min(lines.length,euroIndex+4)).join(" ");
  const foundDate=parseDate(section);
  if(foundDate){
   const wd=new Date(foundDate+"T12:00:00Z").getUTCDay();
   const hasTue=/\bDi\b/i.test(section),hasFri=/\bFr\b/i.test(section);
   if(![2,5].includes(wd)){result.warnings.push("Erkanntes Ziehungsdatum liegt nicht auf Dienstag oder Freitag");}
   else{
    const count=result.weeks||1;
    if(count<=12 && count>=1 && !(hasTue&&hasFri)){
      result.drawDates=Array.from({length:count},(_,i)=>nextDate(foundDate,7*i));
    }else {
      result.drawDates=[foundDate];
      if(hasTue&&hasFri)result.warnings.push("Mehrere Ziehungstage erkannt: bitte weitere Ziehungsdaten ergänzen");
      if(count>12)result.warnings.push("Ungewöhnliche Laufzeit erkannt: Ziehungstermine prüfen");
    }
   }
  }
 }
 if(!result.purchaseDate)result.warnings.push("Kaufdatum konnte nicht eindeutig erkannt werden");
 if(!result.amount)result.warnings.push("Betrag konnte nicht eindeutig erkannt werden");
 if(!result.drawDates.length)result.warnings.push("Ziehungsdatum konnte nicht eindeutig erkannt werden");
 if(!result.lines.length)result.warnings.push("Keine Tippfelder erkannt");
 return result;
}
