"use client";
import { useEffect,useMemo,useState } from "react";
import { parseEurojackpotReceipt, mergeReceiptScans } from "@/lib/receipt-parser";
import { prepareReceiptImage, receiptGameRegion } from "@/lib/receipt-image";
import { Camera, Check, ChevronDown, ChevronUp, Plus, Trash2, Save, Coins, CalendarDays, Pencil, X } from "lucide-react";
type Line={main_numbers:number[];euro_numbers:number[]};
type Ticket={id:string;purchased_on:string;total_cents:number;note:string;created_at:string;dates:string[];lines:Line[];payouts:{date:string;amount_cents:number}[]};
type Draw={date:string;main_numbers:number[];euro_numbers:number[]};
type FormLine={main:string;euro:string};
const emptyLine=():FormLine=>({main:"",euro:""});
const currency=(cents:number)=>new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(cents/100);
const readableDate=(value:string)=>value.split("-").reverse().join(".");
const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+"T12:00:00Z"))&&new Date(value+"T12:00:00Z").toISOString().slice(0,10)===value;
const drawDay=(date:string)=>[2,5].includes(new Date(date+"T12:00:00Z").getUTCDay());
function parseNumbers(value:string,length:number,max:number):number[]|null {
 const arr=value.trim().split(/[\s,;|+/-]+/).filter(Boolean).map(Number);
 return arr.length===length&&arr.every(n=>Number.isInteger(n)&&n>=1&&n<=max)&&new Set(arr).size===length?arr:null;
}
function parseOcr(text:string):FormLine[]{
 const found:FormLine[]=[];
 for(const raw of text.split(/\r?\n/)){
   const line=raw.replace(/[|]/g," ").trim();
   // Conservative: require seven 1-2-digit tokens on a single line.
   const groups=line.match(/\b\d{1,2}\b/g)?.map(Number)||[];
   for(let start=0;start+7<=groups.length;start++){
     const main=groups.slice(start,start+5),euro=groups.slice(start+5,start+7);
     if(main.every(n=>n>=1&&n<=50)&&new Set(main).size===5&&euro.every(n=>n>=1&&n<=12)&&new Set(euro).size===2){
       found.push({main:main.join(" "),euro:euro.join(" ")});
       break;
     }
   }
 }
 return found.slice(0,20);
}
function MatchBalls({line,draw}:{line:Line;draw?:Draw}){
 return <div className="ticket-balls">
  {line.main_numbers.map((n,i)=><span key={"m"+i} className={"ticket-ball"+(draw?.main_numbers.includes(n)?" matched":"")}>{n}</span>)}
  <span className="ticket-divider">+</span>
  {line.euro_numbers.map((n,i)=><span key={"e"+i} className={"ticket-ball euro"+(draw?.euro_numbers.includes(n)?" matched-euro":"")}>{n}</span>)}
 </div>;
}
export default function MyGames({draws}:{draws:Draw[]}){
 const [tickets,setTickets]=useState<Ticket[]>([]);
 const [busy,setBusy]=useState(false),[scanning,setScanning]=useState(false),[scanProgress,setScanProgress]=useState("");
 const [message,setMessage]=useState(""),[error,setError]=useState("");
 const [scanWarnings,setScanWarnings]=useState<string[]>([]);
 const [receiptPreview,setReceiptPreview]=useState<string|null>(null);
 const [purchase,setPurchase]=useState(""),[amount,setAmount]=useState(""),[note,setNote]=useState("");
 const [lines,setLines]=useState<FormLine[]>([emptyLine()]),[date,setDate]=useState(""),[dates,setDates]=useState<string[]>([]);
 const [showForm,setShowForm]=useState(false),[expanded,setExpanded]=useState<string|null>(null);
 const [editingId,setEditingId]=useState<string|null>(null);
 const drawMap=useMemo(()=>new Map(draws.map(d=>[d.date,d])),[draws]);
 async function load(){
   try{const r=await fetch("/api/games",{cache:"no-store"});const result=await r.json();if(!r.ok)throw new Error(result.error);setTickets(result.tickets||[]);}
   catch(e){setError(e instanceof Error?e.message:"Spiele nicht verfügbar");}
 }
 useEffect(()=>{void load();},[]);
 useEffect(()=>()=>{if(receiptPreview)URL.revokeObjectURL(receiptPreview);},[receiptPreview]);
 async function scan(file?:File) {
  if(!file)return;
  if(file.size>12*1024*1024){setError("Foto darf höchstens 12 MB groß sein");return;}
  if(!file.type.startsWith("image/")){setError("Bitte ein Foto auswählen");return;}
  setReceiptPreview(URL.createObjectURL(file));
  setScanning(true);setError("");setScanWarnings([]);setMessage("");setScanProgress("Bild wird vorbereitet …");
  let worker:Awaited<ReturnType<typeof import("tesseract.js").createWorker>>|undefined;
  try{
    const tesseract=await import("tesseract.js");
    const prepared=await prepareReceiptImage(file);
    worker=await tesseract.createWorker("eng",1,{logger:m=>{
      if(m.status==="recognizing text")setScanProgress("Erkennung: "+Math.round((m.progress||0)*100)+" %");
    }});
    // Each pass produces suggestions; disagreements remain blank until verified.
    const results:ReturnType<typeof parseEurojackpotReceipt>[]=[];
    const first=await worker.recognize(prepared);
    results.push(parseEurojackpotReceipt(first.data.text));
    const needsMore=results[0].lines.length===0||results[0].lines.some(l=>!l.complete)||!results[0].amount||!results[0].purchaseDate||!results[0].drawDates.length;
    if(needsMore) {
      setScanProgress("Zusätzliche Texterkennung …");
      const second=await worker.recognize(file);
      results.push(parseEurojackpotReceipt(second.data.text));
    }
    // Focused pass can recover rows which whole-receipt layout detection misses.
    if(results.every(x=>x.lines.length<4||x.lines.some(l=>!l.complete))){
      setScanProgress("Tippfelder werden geprüft …");
      const region=await receiptGameRegion(prepared);
      const third=await worker.recognize(region);
      results.push(parseEurojackpotReceipt(third.data.text));
    }
    const extracted=mergeReceiptScans(results);
    setScanWarnings(extracted.warnings);
    setLines(extracted.lines.length?extracted.lines.map(l=>({main:l.main,euro:l.euro})):[emptyLine()]);
    setPurchase(extracted.purchaseDate||"");
    setDates(extracted.drawDates);
    setAmount(extracted.amount||"");
    setMessage(extracted.lines.length
     ?extracted.lines.length+" Tippfelder gefunden. Bei Abweichungen zwischen den Erkennungsdurchläufen bleiben Felder zur Sicherheit leer. Bitte alle Werte mit der Originalquittung vergleichen."
     :"Keine zuverlässigen Tippfelder erkannt. Bitte das Foto frontal, scharf und gut beleuchtet erneut aufnehmen oder Werte manuell eingeben.");
    setShowForm(true);
  }catch(e){console.error("OCR error",e);setError("Texterkennung fehlgeschlagen. Bitte das Foto erneut aufnehmen oder die Werte manuell eingeben.");setShowForm(true);}
  finally{if(worker)await worker.terminate();setScanning(false);setScanProgress("");}
 }
 function clearForm(){
  setEditingId(null);setShowForm(false);setPurchase("");setAmount("");setNote("");
  setDates([]);setDate("");setLines([emptyLine()]);
  setScanWarnings([]);setError("");setReceiptPreview(null);
 }
 function startEdit(ticket:Ticket){
  setEditingId(ticket.id);
  setPurchase(ticket.purchased_on);
  setAmount((ticket.total_cents/100).toFixed(2).replace(".",","));
  setNote(ticket.note);
  setDates([...ticket.dates]);setDate("");
  setLines(ticket.lines.map(line=>({main:line.main_numbers.join(" "),euro:line.euro_numbers.join(" ")})));
  setScanWarnings([]);setReceiptPreview(null);setError("");setMessage("");
  setShowForm(true);setExpanded(ticket.id);
  window.scrollTo({top:0,behavior:"smooth"});
 }
 function toggleNew(){
  if(showForm){clearForm();return;}
  clearForm();setShowForm(true);
 }
 function updateLine(i:number,field:keyof FormLine,value:string){setLines(v=>v.map((line,j)=>i===j?{...line,[field]:value}:line));}
 function addDate(){if(!validDate(date)||!drawDay(date)){setError("Bitte einen gültigen Dienstag oder Freitag wählen");return;}if(!purchase){setError("Bitte zuerst Kaufdatum eintragen");return;}if(date<purchase){setError("Die Ziehung darf nicht vor dem Kauf liegen");return;}setDates(prev=>[...new Set([...prev,date])].sort());setDate("");setError("");}
 async function save(){
  setError("");setMessage("");
  if(!validDate(purchase)){setError("Bitte das Kaufdatum angeben");return;}
  if(!dates.length){setError("Bitte mindestens ein Ziehungsdatum hinzufügen");return;}
  const price=Number(amount.replace(",","."));
  if(!amount.trim()||!Number.isFinite(price)||price<0||price>1000000||Math.round(price*100)!==price*100&&Math.abs(Math.round(price*100)-price*100)>0.00001){setError("Bitte den Gesamtpreis mit maximal zwei Nachkommastellen angeben");return;}
  const parsed:Line[]=[];
  for(const [i,line] of lines.entries()){
   const main=parseNumbers(line.main,5,50),euro=parseNumbers(line.euro,2,12);
   if(!main||!euro){setError("Tippfeld "+(i+1)+": 5 unterschiedliche Hauptzahlen (1–50) und 2 Eurozahlen (1–12) eingeben");return;}
   parsed.push({main_numbers:main,euro_numbers:euro});
  }
  setBusy(true);
  try {
   if(editingId){
     const original=tickets.find(t=>t.id===editingId);
     const removedPayouts=original?.payouts.filter(p=>!dates.includes(p.date))||[];
     if(removedPayouts.length && !confirm("Du hast Ziehungsdaten entfernt, für die Auszahlungen hinterlegt sind. Diese Auszahlungen werden beim Speichern gelöscht. Trotzdem fortfahren?")){setBusy(false);return;}
   }
   const response=await fetch(editingId?"/api/games/"+editingId:"/api/games",{method:editingId?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({purchased_on:purchase,total_cents:Math.round(price*100),note,dates,lines:parsed})});
   const out=await response.json();if(!response.ok)throw new Error(out.error||"Speichern fehlgeschlagen");
   const wasEditing=Boolean(editingId);
   await load();clearForm();
   setMessage(wasEditing?"Spielschein aktualisiert. Treffer, Zahlenhäufigkeit und Gesamtausgaben wurden neu berechnet.":"Schein gespeichert. Die Zahlen werden mit vorhandenen Ziehungen verglichen.");
  }catch(e){setError(e instanceof Error?e.message:"Speichern fehlgeschlagen");}
  finally{setBusy(false);}
 }
 async function remove(id:string){if(!confirm("Diesen Spielschein einschließlich seiner Ausgaben wirklich löschen?"))return;
   try{const r=await fetch("/api/games/"+id,{method:"DELETE"});const j=await r.json();if(!r.ok)throw new Error(j.error);await load();setMessage("Schein gelöscht.");}
   catch(e){setError(e instanceof Error?e.message:"Löschen fehlgeschlagen");}
 }
 async function savePayout(id:string,day:string,value:string){
  const amountNumber=Number(value.replace(",","."));
  if(!Number.isFinite(amountNumber)||amountNumber<0||Math.abs(Math.round(amountNumber*100)-amountNumber*100)>0.00001){setError("Ungültiger Auszahlungsbetrag");return;}
  try{const r=await fetch("/api/games/"+id+"/payout",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({date:day,amount_cents:Math.round(amountNumber*100)})});
  const j=await r.json();if(!r.ok)throw new Error(j.error);await load();setMessage("Auszahlung gespeichert.");setError("");}
  catch(e){setError(e instanceof Error?e.message:"Fehler");}
 }
 const spent=tickets.reduce((sum,t)=>sum+t.total_cents,0);
 const paid=tickets.reduce((sum,t)=>sum+t.payouts.reduce((s,p)=>s+p.amount_cents,0),0);
 const freq=useMemo(()=>{
  const main=Array.from({length:50},(_,i)=>({number:i+1,count:0}));
  const euro=Array.from({length:12},(_,i)=>({number:i+1,count:0}));
  for(const ticket of tickets)for(const line of ticket.lines){line.main_numbers.forEach(n=>main[n-1].count++);line.euro_numbers.forEach(n=>euro[n-1].count++);}
  return {main:main.sort((a,b)=>b.count-a.count||a.number-b.number),euro:euro.sort((a,b)=>b.count-a.count||a.number-b.number)};
 },[tickets]);
 const checked=tickets.reduce((s,t)=>s+t.dates.reduce((a,d)=>a+(drawMap.has(d)?t.lines.length:0),0),0);
 return <section className="games-view">
  <div className="games-hero"><div><span className="eyebrow">PERSÖNLICHES ARCHIV</span><h1>Meine Spiele</h1><p>Spielscheine erfassen, Treffer kontrollieren und deine Ausgaben nachvollziehen.</p></div><button className="primary-btn" onClick={toggleNew}><Plus size={18}/>{showForm?"Erfassung schließen":"Spielschein erfassen"}</button></div>
  <div className="stats games-stats">
   <div className="stat"><div className="stat-top"><span>Gesamtausgaben</span><Coins size={17}/></div><strong>{currency(spent)}</strong><small>{tickets.length} erfasste Scheine</small></div>
   <div className="stat"><div className="stat-top"><span>Erfasste Auszahlungen</span><Check size={17}/></div><strong>{currency(paid)}</strong><small>Auszahlungen manuell eingetragen</small></div>
   <div className="stat"><div className="stat-top"><span>Bilanz</span><Coins size={17}/></div><strong>{currency(paid-spent)}</strong><small>Auszahlungen minus Ausgaben</small></div>
  </div>
  {error&&<div className="warning">{error}</div>}{message&&<p className="games-note" role="status">{message}</p>}
  {showForm&&<div className="games-panel">
   <div className="games-title"><h2>{editingId?"Spielschein bearbeiten":"Neuen Schein erfassen"}</h2><p>Die App erkennt Spielnummern, 5/50, 2/12, Kaufdatum, Eurojackpot-Ziehungsdatum, Laufzeit und Betrag soweit lesbar. Prüfe alle Vorschläge sorgfältig.</p></div>
   <label className="capture"><Camera size={24}/><strong>{scanning?scanProgress:"Eurojackpot-Quittung fotografieren oder auswählen"}</strong><span>Quittung mit gelben LOTTO-Rändern möglichst vollständig und scharf fotografieren. Das Foto wird nicht auf dem Server gespeichert.</span><input aria-label="Spielschein fotografieren" type="file" accept="image/*" capture="environment" disabled={scanning||busy} onChange={e=>{const file=e.target.files?.[0];void scan(file);e.target.value="";}}/></label>
   {scanWarnings.length>0&&<div className="scan-review" role="status"><strong>Beim Prüfen beachten:</strong><ul>{scanWarnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
   {receiptPreview&&<details className="scan-preview" open><summary>Originalquittung zum Zahlenvergleich anzeigen</summary><img src={receiptPreview} alt="Originalaufnahme zur Kontrolle der automatisch erkannten Daten"/></details>}
   <div className="games-form-grid"><label className="field">Kaufdatum<input type="date" value={purchase} onChange={e=>setPurchase(e.target.value)}/></label><label className="field">Gesamtpreis in € (inkl. Gebühren)<input type="text" inputMode="decimal" placeholder="z. B. 12,50" value={amount} onChange={e=>setAmount(e.target.value)}/></label></div>
   <div className="games-subtitle"><h3>Tippfelder</h3><span>5 Hauptzahlen + 2 Eurozahlen je Feld</span></div>
   {lines.map((line,i)=><div className="line-editor" key={i}><span className="line-index">{i+1}</span><label className="field">Hauptzahlen<input value={line.main} placeholder="5 12 23 34 48" onChange={e=>updateLine(i,"main",e.target.value)}/></label><label className="field euro-input">Eurozahlen<input value={line.euro} placeholder="2 9" onChange={e=>updateLine(i,"euro",e.target.value)}/></label><button aria-label={"Tippfeld "+(i+1)+" entfernen"} className="small-btn" disabled={lines.length===1} onClick={()=>setLines(v=>v.filter((_,j)=>i!==j))}><Trash2 size={16}/></button></div>)}
   <button className="outlined-btn" disabled={lines.length>=20} onClick={()=>setLines(v=>[...v,emptyLine()])}><Plus size={16}/> Weiteres Tippfeld</button>
   <div className="games-subtitle"><h3>Gültige Ziehungen</h3><span>Alle Spieltermine explizit angeben</span></div>
   <div className="date-editor"><input aria-label="Ziehungsdatum hinzufügen" type="date" value={date} onChange={e=>setDate(e.target.value)}/><button className="outlined-btn" onClick={addDate}><Plus size={16}/> Datum hinzufügen</button></div>
   <div className="date-tags">{dates.map(d=><span className="date-tag" key={d}><CalendarDays size={13}/>{readableDate(d)}<button aria-label={"Datum "+d+" entfernen"} onClick={()=>setDates(v=>v.filter(x=>x!==d))}>×</button></span>)}</div>
   <label className="field field-note">Notiz (optional)<input maxLength={500} placeholder="z. B. Annahmestelle oder Scheinbezeichnung" value={note} onChange={e=>setNote(e.target.value)}/></label>
   <p className="games-small">Der Gesamtpreis wird einmal pro Schein gezählt, auch wenn mehrere Termine ausgewählt sind. Die App kann den Annahmeschluss nicht prüfen.</p>
   <div className="edit-actions"><button className="primary-btn" disabled={busy||scanning} onClick={()=>void save()}><Save size={17}/>{busy?"Speichere …":editingId?"Änderungen speichern":"Geprüften Spielschein speichern"}</button>{editingId&&<button className="outlined-btn" disabled={busy} onClick={clearForm}><X size={16}/> Abbrechen</button>}</div>
  </div>}
  <div className="games-panel"><div className="games-title"><h2>Gespeicherte Spielscheine</h2><p>{checked} geprüfte Tippfeld-Ziehungen · Ohne vorhandene Ziehung kein Trefferstatus</p></div>
   {!tickets.length?<div className="empty">Noch keine Spielscheine gespeichert.</div>:tickets.map(t=><div className="ticket-card" key={t.id}>
     <div className="ticket-heading"><button className="ticket-expand" onClick={()=>setExpanded(v=>v===t.id?null:t.id)}>{expanded===t.id?<ChevronUp size={18}/>:<ChevronDown size={18}/>}<span><strong>Schein vom {readableDate(t.purchased_on)}</strong><small>{t.lines.length} Tippfelder · {t.dates.length} Ziehungen{t.note?" · "+t.note:""}</small></span></button><div className="ticket-heading-end"><strong>{currency(t.total_cents)}</strong><button className="small-btn" type="button" title="Schein bearbeiten" aria-label={"Spielschein vom "+readableDate(t.purchased_on)+" bearbeiten"} onClick={()=>startEdit(t)}><Pencil size={16}/></button><button className="small-btn" title="Schein löschen" onClick={()=>void remove(t.id)}><Trash2 size={16}/></button></div></div>
     {expanded===t.id&&<div className="ticket-detail">{t.dates.map(d=><div className="ticket-draw" key={d}><div className="ticket-draw-header"><strong>Ziehung {readableDate(d)}</strong><span>{drawMap.has(d)?"Ergebnis verfügbar":"Noch kein Ergebnis im Archiv"}</span></div>
       {t.lines.map((line,i)=>{const draw=drawMap.get(d);const mains=draw?line.main_numbers.filter(n=>draw.main_numbers.includes(n)).length:0;const euros=draw?line.euro_numbers.filter(n=>draw.euro_numbers.includes(n)).length:0;return <div className="ticket-line-result" key={i}><small>Feld {i+1}</small><MatchBalls line={line} draw={draw}/><span className="match-count">{draw?mains+" + "+euros:"Offen"}</span></div>;})}
       {drawMap.has(d)&&<div className="winning-reference">Gezogen: {drawMap.get(d)!.main_numbers.join(" · ")} + {drawMap.get(d)!.euro_numbers.join(" · ")}</div>}
       <PayoutInput date={d} ticketId={t.id} recorded={t.payouts.find(p=>p.date===d)?.amount_cents} onSave={savePayout}/>
     </div>)}</div>}
   </div>)}
  </div>
  <div className="games-summary-grid">
   <div className="games-panel"><div className="games-title"><h2>Meine häufigsten Zahlen</h2><p>Häufigkeit je angekreuztem Tippfeld, nicht je Ziehung</p></div>
   <h3>Hauptzahlen</h3><Frequency data={freq.main.slice(0,10)}/><h3>Eurozahlen</h3><Frequency data={freq.euro.slice(0,6)}/></div>
   <div className="games-panel"><div className="games-title"><h2>Gesamtausgaben</h2><p>Alle erfassten Eurojackpot-Scheine zusammen – unabhängig vom Kaufmonat.</p></div><div className="expense-total"><span>Ausgaben insgesamt</span><strong>{currency(spent)}</strong><small>Summe aus {tickets.length} Spielscheinen inklusive eingetragener Gebühren. Jeder Schein wird nur einmal gezählt.</small></div><div className="expense-detail"><span>Erfasste Auszahlungen</span><strong>{currency(paid)}</strong></div><div className="expense-detail"><span>Gesamtbilanz</span><strong>{currency(paid-spent)}</strong></div></div>
  </div>
  <p className="games-small">Trefferanzeigen zeigen ausschließlich passende Zahlen, keine bestätigte Gewinnklasse oder Auszahlung. Gewinnquoten und tatsächliche Auszahlungen sind gesondert zu prüfen. Alle Angaben ohne Gewähr.</p>
 </section>;
}
function Frequency({data}:{data:{number:number;count:number}[]}){
 return <div className="freq-list">{data.map(item=><div className="freq-item" key={item.number}><span className="freq-number">{item.number}</span><div className="freq-track"><div style={{width:(item.count/(data[0]?.count||1)*100)+"%"}}/></div><span className="freq-value">{item.count}×</span></div>)}</div>;
}
function PayoutInput({date,ticketId,recorded,onSave}:{date:string;ticketId:string;recorded?:number;onSave:(id:string,date:string,value:string)=>Promise<void>}){
 const [value,setValue]=useState(recorded===undefined?"":(recorded/100).toFixed(2).replace(".",","));
 useEffect(()=>{setValue(recorded===undefined?"":(recorded/100).toFixed(2).replace(".",","));},[recorded]);
 return <div className="payout-row"><label>Auszahlung in € <input type="text" inputMode="decimal" placeholder="0,00" value={value} onChange={e=>setValue(e.target.value)}/></label><button className="outlined-btn" onClick={()=>void onSave(ticketId,date,value)}>Auszahlung speichern</button></div>;
}
