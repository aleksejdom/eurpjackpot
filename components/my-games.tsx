"use client";
import { useEffect,useMemo,useState } from "react";
import { parseEurojackpotReceipt, parseDigitalEurojackpotScreenshot, isDigitalEurojackpotScreenshot, digitalFieldRegionsFromTsv, spatialDigitalLinesFromTsv, parseDigitalNumbersFromText, reconcileDigitalFieldScans, mergeReceiptScans } from "@/lib/receipt-parser";
import { prepareReceiptImage, receiptGameRegion, digitalTicketNumberRegion, prepareDigitalScreenshot, cropOcrRegion } from "@/lib/receipt-image";
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
 const mainWinners=new Set((draw?.main_numbers||[]).map(Number));
 const euroWinners=new Set((draw?.euro_numbers||[]).map(Number));
 return <div className="ticket-balls">
  {line.main_numbers.map((n,i)=>{
   const hit=mainWinners.has(Number(n));
   return <span key={"m"+i} className={"ticket-ball"+(hit?" matched":"")} style={hit?{backgroundColor:"#37d59c",color:"#0a2a20",boxShadow:"0 0 0 2px #57e9b1"}:undefined} title={hit?"Richtige Hauptzahl":"Hauptzahl ohne Treffer"}>{n}</span>;
  })}
  <span className="ticket-divider">+</span>
  {line.euro_numbers.map((n,i)=>{
   const hit=euroWinners.has(Number(n));
   return <span key={"e"+i} className={"ticket-ball euro"+(hit?" matched-euro":"")} style={hit?{backgroundColor:"#37d59c",color:"#0a2a20",boxShadow:"0 0 0 2px #57e9b1"}:{backgroundColor:"#f5c34b",color:"#272114"}} title={hit?"Richtige Eurozahl":"Eurozahl ohne Treffer"}>{n}</span>;
  })}
 </div>;
}
export default function MyGames({draws,mode="list",editId}:{draws:Draw[];mode?:"list"|"editor";editId?:string}){
 const [tickets,setTickets]=useState<Ticket[]>([]);
 const [quotas,setQuotas]=useState<Record<string,Record<string,number>>>({});
 const [busy,setBusy]=useState(false),[scanning,setScanning]=useState(false),[scanProgress,setScanProgress]=useState("");
 const [message,setMessage]=useState(""),[error,setError]=useState("");
 const [scanWarnings,setScanWarnings]=useState<string[]>([]);
 const [receiptPreview,setReceiptPreview]=useState<string|null>(null);
 const [purchase,setPurchase]=useState(""),[amount,setAmount]=useState(""),[note,setNote]=useState("");
 const [lines,setLines]=useState<FormLine[]>([emptyLine()]),[date,setDate]=useState(""),[dates,setDates]=useState<string[]>([]);
 const [showForm,setShowForm]=useState(mode==="editor"),[expanded,setExpanded]=useState<string|null>(null);
 const [editingId,setEditingId]=useState<string|null>(editId??null);
 const [editLoaded,setEditLoaded]=useState(false);
 const [listLoaded,setListLoaded]=useState(false);
 const drawMap=useMemo(()=>new Map(draws.map(d=>[d.date,d])),[draws]);
 async function load(){
   try{const r=await fetch("/api/games",{cache:"no-store"});const result=await r.json();if(!r.ok)throw new Error(result.error);setTickets(result.tickets||[]);setListLoaded(true);}
   catch(e){setError(e instanceof Error?e.message:"Spiele nicht verfügbar");}
 }
 useEffect(()=>{void load();void loadPrizes();},[]);
 useEffect(()=>{if(mode==="editor"&&editId&&listLoaded&&!editLoaded){const ticket=tickets.find(t=>t.id===editId);if(ticket){startEdit(ticket);}else setError("Der angeforderte Spielschein wurde nicht gefunden.");setEditLoaded(true);}},[mode,editId,listLoaded,editLoaded,tickets]);
 async function loadPrizes(){
   try {
    const r=await fetch("/api/prizes",{cache:"no-store"});
    if(r.ok){const json=await r.json();setQuotas(json.quotas||{});}
   }catch{/* Display unavailable quota instead of claiming a payout. */}
 }
 useEffect(()=>()=>{if(receiptPreview)URL.revokeObjectURL(receiptPreview);},[receiptPreview]);
 async function scan(file?:File,preferred:"auto"|"camera"|"screenshot"="auto") {
  if(!file)return;
  if(file.size>12*1024*1024){setError("Bild darf höchstens 12 MB groß sein");return;}
  if(!file.type.startsWith("image/")){setError("Bitte ein Foto oder einen Screenshot auswählen");return;}
  setReceiptPreview(URL.createObjectURL(file));
  setScanning(true);setError("");setScanWarnings([]);setMessage("");setScanProgress("Bild wird analysiert …");
  let worker:Awaited<ReturnType<typeof import("tesseract.js").createWorker>>|undefined;
  try{
    const tesseract=await import("tesseract.js");
    worker=await tesseract.createWorker("eng",1,{logger:m=>{
      if(m.status==="recognizing text")setScanProgress("Texterkennung: "+Math.round((m.progress||0)*100)+" %");
    }});
    // Tesseract v6 only returns text by default. Request TSV explicitly so
    // bounding boxes can be used to isolate each individual Spielfeld.
    const initial=await worker.recognize(file,{}, {tsv:true});
    const digital=isDigitalEurojackpotScreenshot(initial.data.text)||
      (preferred==="screenshot"&&!/SPIEL\s*QUITTUNG|5\s*\/\s*50/i.test(initial.data.text));
    const results:ReturnType<typeof parseEurojackpotReceipt>[]=[];
    let spatial:ReturnType<typeof spatialDigitalLinesFromTsv>=[];
    if(digital){
      results.push(parseDigitalEurojackpotScreenshot(initial.data.text));
      spatial=typeof initial.data.tsv==="string"?spatialDigitalLinesFromTsv(initial.data.tsv):[];
      setScanProgress("Digitale Spielauftrag-Zahlen werden genauer gelesen …");
      const enhanced=await prepareDigitalScreenshot(file);
      const enhancedResult=await worker.recognize(enhanced);
      results.push(parseDigitalEurojackpotScreenshot(enhancedResult.data.text));
      // TSV box coordinates are relative to the original image. Re-OCR
      // selected field regions at 1.0–2.7x size, not the entire screenshot.
      const regions=typeof initial.data.tsv==="string"
        ?digitalFieldRegionsFromTsv(initial.data.tsv):[];
      if(regions.length){
        await worker.setParameters({tessedit_pageseg_mode:tesseract.PSM.SINGLE_BLOCK});
        for(const [i,region] of regions.slice(0,20).entries()){
          setScanProgress("Spielfeld "+(i+1)+" von "+Math.min(regions.length,20)+" wird geprüft …");
          const cropped=await cropOcrRegion(file,region);
          const focused=await worker.recognize(cropped);
          const nums=parseDigitalNumbersFromText(focused.data.text);
          if(nums){
            results.push(parseDigitalEurojackpotScreenshot(
              "Mein Spielauftrag\nSpielfeld "+region.index+"\n"+
              nums.main+" "+nums.euro
            ));
          }
        }
        await worker.setParameters({tessedit_pageseg_mode:tesseract.PSM.AUTO});
      }else if(results.every(r=>r.lines.length===0||r.lines.some(l=>!l.complete))){
        // Layout may not expose heading coordinates; preserve older fallback.
        const region=await digitalTicketNumberRegion(file);
        const retry=await worker.recognize(region);
        results.push(parseDigitalEurojackpotScreenshot(retry.data.text));
      }
    }else{
      results.push(parseEurojackpotReceipt(initial.data.text));
      // Compare original and contrast-corrected printing even when the
      // original looked complete: digit substitution is common on paper.
      setScanProgress("Papierquittung wird mit verbessertem Kontrast geprüft …");
      const prepared=await prepareReceiptImage(file);
      const second=await worker.recognize(prepared);
      results.push(parseEurojackpotReceipt(second.data.text));
      if(results.every(r=>r.lines.length===0||r.lines.some(l=>!l.complete))){
        setScanProgress("Tippfelder werden separat geprüft …");
        const region=await receiptGameRegion(prepared);
        const third=await worker.recognize(region);
        results.push(parseEurojackpotReceipt(third.data.text));
      }
    }
    const extracted=digital?reconcileDigitalFieldScans(results,spatial):mergeReceiptScans(results);
    // Keep numeric field order: the UI has no separate field-index metadata.
    const ordered=[...extracted.lines].sort((a,b)=>a.index-b.index);
    // Preserve field identity if an individual OCR field was unreadable:
    // never shift "Spielfeld 4" into the "Spielfeld 3" editor position.
    const maxIndex=ordered.length?Math.max(...ordered.map(l=>l.index)):0;
    const byIndex=new Map(ordered.map(l=>[l.index,l]));
    const normalizedLines=maxIndex
      ?Array.from({length:Math.min(maxIndex,20)},(_,i)=>{
        const field=byIndex.get(i+1);
        return field?{main:field.main,euro:field.euro}:emptyLine();
       })
      :[emptyLine()];
    const missing=normalizedLines.filter(l=>!l.main||!l.euro).length;
    setScanWarnings([...extracted.warnings,...(missing?[missing+" Spielfeld(er) müssen manuell geprüft werden"]:[])]);
    setLines(normalizedLines);
    setPurchase(extracted.purchaseDate||"");
    setDates(extracted.drawDates);
    setAmount(extracted.amount||"");
    if(digital){
      const reference=initial.data.text.match(/\bLosnummer\s*[:.]?\s*(\d{5,12})\b/i)?.[1];
      if(reference)setNote("Losnummer "+reference);
    }
    setMessage(ordered.length
      ?(digital?"Digitaler Spielauftrag":"Lotto-Quittung")+" erkannt: "+ordered.length+
       " Tippfelder. Bitte alle Zahlen, Eurozahlen, Ziehung, Kaufdatum und Preis vor dem Speichern überprüfen."
      :"Keine eindeutigen Tippfelder erkannt. Du kannst die Werte manuell eintragen oder eine schärfere Aufnahme verwenden.");
    setShowForm(true);
  }catch(e){
    console.error("Ticket OCR failed",e);
    setError("Texterkennung fehlgeschlagen. Bitte anderes Bild auswählen oder alle Werte manuell eintragen.");
    setShowForm(true);
  }finally{
    if(worker)await worker.terminate();
    setScanning(false);setScanProgress("");
  }
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
   if(mode==="editor"){window.location.assign("/?tab=games");return;}
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
 const bestTicketHit=(ticket:Ticket)=>{
  let best:{main:number;euro:number;date:string;field:number}|null=null;
  let compared=0;
  for(const date of ticket.dates){
   const draw=drawMap.get(date);if(!draw)continue;
   const winMain=new Set(draw.main_numbers.map(Number));
   const winEuro=new Set(draw.euro_numbers.map(Number));
   for(const [index,line] of ticket.lines.entries()){
    const main=line.main_numbers.filter(n=>winMain.has(Number(n))).length;
    const euro=line.euro_numbers.filter(n=>winEuro.has(Number(n))).length;
    compared++;
    // Strongest combination: prefer the highest number of main hits,
    // then Euro hits, as in the Eurojackpot jackpot requirement (5+2).
    if(!best||main>best.main||(main===best.main&&euro>best.euro)){
     best={main,euro,date,field:index+1};
    }
   }
  }
  return {best,compared};
 };
 const formPanel=<div className="games-panel">
   <div className="games-title"><h2>{editingId?"Spielschein bearbeiten":"Neuen Schein erfassen"}</h2><p>Erkennt Papierquittungen und digitale Spielaufträge aus Screenshots: 5 Hauptzahlen, 2 Eurozahlen, Kaufdatum, Ziehung und Gesamtpreis. Prüfe jeden Vorschlag vor dem Speichern.</p></div>
   <div className="capture-options">
    <label className="capture"><Camera size={24}/><strong>{scanning?scanProgress:"Papierquittung fotografieren"}</strong><span>Lotto-Quittung vollständig und scharf mit der Handykamera aufnehmen.</span><input aria-label="Lotto-Quittung mit Kamera fotografieren" type="file" accept="image/*" capture="environment" disabled={scanning||busy} onChange={e=>{const file=e.target.files?.[0];void scan(file,"camera");e.target.value="";}}/></label>
    <label className="capture"><Camera size={24}/><strong>Screenshot aus der Fotomediathek auswählen</strong><span>Digitale Spielaufträge mit „Spielfeld“, „Eurozahlen“, „Kaufdatum“, „Ziehung“ und „Preis“ werden ebenfalls erkannt.</span><input aria-label="Screenshot oder Spielscheinbild hochladen" type="file" accept="image/*" disabled={scanning||busy} onChange={e=>{const file=e.target.files?.[0];void scan(file,"screenshot");e.target.value="";}}/></label>
   </div>
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
   <div className="edit-actions"><button className="primary-btn" disabled={busy||scanning} onClick={()=>void save()}><Save size={17}/>{busy?"Speichere …":editingId?"Änderungen speichern":"Geprüften Spielschein speichern"}</button>{<button className="outlined-btn" disabled={busy} onClick={()=>{if(mode==="editor")window.location.assign("/?tab=games");else clearForm();}}><X size={16}/> Abbrechen</button>}</div>
  </div>;
 if(mode==="editor")return <main className="ticket-editor-page">
   <header className="ticket-editor-top"><a href="/?tab=games" className="outlined-btn"><X size={16}/> Zurück zu Meine Spiele</a><span>EUROJACKPOT · SPIELSCHEIN</span></header>
   <div className="ticket-editor-shell">
    <span className="eyebrow">FOKUSSIERTE ERFASSUNG</span>
    <h1>{editId?"Spielschein bearbeiten":"Spielschein erfassen"}</h1>
    <p className="ticket-editor-intro">{editId?"Passe die Angaben deines gespeicherten Spielscheins an.":"Fotografiere die Quittung und überprüfe anschließend alle erkannten Zahlen, Termine und Kosten."}</p>
    {error&&<div className="warning" role="alert">{error}</div>}
    {message&&<p className="games-note" role="status">{message}</p>}
    {(!editId||editLoaded)&&formPanel}
    {editId&&!editLoaded&&<div className="games-panel">Lade Spielschein …</div>}
   </div>
 </main>;
 return <section className="games-view">
  <div className="games-hero"><div><span className="eyebrow">PERSÖNLICHES ARCHIV</span><h1>Meine Spiele</h1><p>Spielscheine erfassen, Treffer kontrollieren und deine Ausgaben nachvollziehen.</p></div><button className="primary-btn" onClick={()=>window.location.assign("/games/new")}><Plus size={18}/>Spielschein erfassen</button></div>
  <div className="stats games-stats">
   <div className="stat"><div className="stat-top"><span>Gesamtausgaben</span><Coins size={17}/></div><strong>{currency(spent)}</strong><small>{tickets.length} erfasste Scheine</small></div>

  </div>
  {error&&<div className="warning">{error}</div>}{message&&<p className="games-note" role="status">{message}</p>}
  <div className="games-panel"><div className="games-title"><h2>Gespeicherte Spielscheine</h2><p>{checked} geprüfte Tippfeld-Ziehungen · Ohne vorhandene Ziehung kein Trefferstatus</p></div>
   {!tickets.length?<div className="empty">Noch keine Spielscheine gespeichert.</div>:tickets.map(t=><div className="ticket-card" key={t.id}>
     <div className="ticket-heading"><button className="ticket-expand" onClick={()=>setExpanded(v=>v===t.id?null:t.id)}>{expanded===t.id?<ChevronUp size={18}/>:<ChevronDown size={18}/>}<span><strong>Schein vom {readableDate(t.purchased_on)}</strong><small>{t.lines.length} Tippfelder · {t.dates.length} Ziehungen{t.note?" · "+t.note:""}</small><span className="ticket-compact-hits">{(()=>{const result=bestTicketHit(t);if(!result.best)return "Treffer noch offen";const hit=result.best;return "Beste Kombination: "+hit.main+" Hauptzahl"+(hit.main===1?"":"en")+" + "+hit.euro+" Eurozahl"+(hit.euro===1?"":"en")+" · Feld "+hit.field+" · "+readableDate(hit.date);})()}</span></span></button><div className="ticket-heading-end"><strong>{currency(t.total_cents)}</strong><button className="small-btn" type="button" title="Schein bearbeiten" aria-label={"Spielschein vom "+readableDate(t.purchased_on)+" bearbeiten"} onClick={()=>window.location.assign("/games/edit/"+t.id)}><Pencil size={16}/></button><button className="small-btn" title="Schein löschen" onClick={()=>void remove(t.id)}><Trash2 size={16}/></button></div></div>
     {expanded===t.id&&<div className="ticket-detail">{t.dates.map(d=><div className="ticket-draw" key={d}><div className="ticket-draw-header"><strong>Ziehung {readableDate(d)}</strong><span>{drawMap.has(d)?"Ergebnis verfügbar":"Noch kein Ergebnis im Archiv"}</span></div>
       {t.lines.map((line,i)=>{
        const draw=drawMap.get(d);
        const mains=draw?line.main_numbers.filter(n=>draw.main_numbers.map(Number).includes(Number(n))).length:0;
        const euros=draw?line.euro_numbers.filter(n=>draw.euro_numbers.map(Number).includes(Number(n))).length:0;
        const classes:Record<string,number>={"5+2":1,"5+1":2,"5+0":3,"4+2":4,"4+1":5,"3+2":6,"4+0":7,"2+2":8,"3+1":9,"3+0":10,"1+2":11,"2+1":12};
        const prizeClass=draw?classes[mains+"+"+euros]:undefined;
        const prize=prizeClass?quotas[d]?.[String(prizeClass)]:undefined;
        return <div className="ticket-line-result" key={i}>
          <small>Feld {i+1}</small>
          <MatchBalls line={line} draw={draw}/>
          <div className="ticket-result-meta">
           <span className="match-count">{draw?mains+" + "+euros:"Offen"}</span>
           {draw?<span className={"won-amount"+(prize!==undefined&&prize>0?" positive":"")}>
            Gewonnen: {prizeClass===undefined?"0,00 €":prize!==undefined?currency(prize):"Quote ausstehend"}
           </span>:<span className="won-amount">Gewonnen: noch offen</span>}
          </div>
        </div>;
       })}
       {drawMap.has(d)&&<div className="winning-reference">Gezogen: {drawMap.get(d)!.main_numbers.join(" · ")} + {drawMap.get(d)!.euro_numbers.join(" · ")}</div>}
       <PayoutInput date={d} ticketId={t.id} recorded={t.payouts.find(p=>p.date===d)?.amount_cents} onSave={savePayout}/>
     </div>)}</div>}
   </div>)}
  </div>
  <div className="games-summary-grid">
   <div className="games-panel"><div className="games-title"><h2>Meine häufigsten Zahlen</h2><p>Häufigkeit je angekreuztem Tippfeld, nicht je Ziehung</p></div>
   <h3>Hauptzahlen</h3><Frequency data={freq.main.slice(0,10)}/><h3>Eurozahlen</h3><Frequency data={freq.euro.slice(0,6)}/></div>
   <div className="games-panel"><div className="games-title"><h2>Gesamtausgaben</h2><p>Alle erfassten Eurojackpot-Scheine, unabhängig vom Kaufmonat.</p></div><div className="expense-total"><span>Ausgaben insgesamt</span><strong>{currency(spent)}</strong><small>{tickets.length} Spielscheine, jeweils einmal gezählt.</small></div></div>
  </div>
  <p className="games-small">„Gewonnen“ basiert auf den Treffern und – sofern verfügbar – gespeicherten Gewinnquoten der jeweiligen Ziehung. Ohne verifizierte Quote steht „Quote ausstehend“. Die tatsächlichen Auszahlungen bleiben gesondert erfasst. Alle Angaben ohne Gewähr.</p>
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
