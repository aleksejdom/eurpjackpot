"use client";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Database, RefreshCcw, Search, Trophy, Clock3, ChartNoAxesColumn } from "lucide-react";
type Draw={date:string;date_de:string;main_numbers:number[];euro_numbers:number[]};
type ResponseData={draws:Draw[];lastSync:string|null;syncError:string|null;source?:string};
const format=(d:string)=>new Intl.DateTimeFormat("de-DE",{weekday:"long",day:"2-digit",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(d+"T12:00:00Z"));
const ordered=(a:number[])=>[...a].sort((x,y)=>x-y);
function Balls({draw}:{draw:Draw}){return <div className="balls"><div className="ball-group">{ordered(draw.main_numbers).map(n=><span key={n} className="ball">{n}</span>)}</div><span className="plus">+</span><div className="ball-group">{ordered(draw.euro_numbers).map(n=><span key={n} className="ball euro">{n}</span>)}</div></div>;}
export default function Dashboard(){
 const [data,setData]=useState<ResponseData>({draws:[],lastSync:null,syncError:null});
 const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);
 const [selectedDate,setSelectedDate]=useState("");const [year,setYear]=useState("all");const [search,setSearch]=useState("");
 const [page,setPage]=useState(0);const pageSize=12;
 async function load(force=false){
   force?setRefreshing(true):setLoading(true);
   try{const r=await fetch("/api/draws"+(force?"?refresh=1":""),{cache:"no-store"});const json=await r.json();setData(json);if(!r.ok)throw new Error(json.syncError||"Abruf fehlgeschlagen");}
   catch(e){setData(old=>({...old,syncError:e instanceof Error?e.message:String(e)}));}
   finally{setLoading(false);setRefreshing(false);}
 }
 useEffect(()=>{void load();},[]);
 const years=useMemo(()=>[...new Set(data.draws.map(x=>x.date.slice(0,4)))].sort((a,b)=>b.localeCompare(a)),[data.draws]);
 const filtered=useMemo(()=>data.draws.filter(d=>(year==="all"||d.date.startsWith(year))&&(!selectedDate||d.date===selectedDate)&&(!search||d.date_de.includes(search)||d.date.includes(search))),[data.draws,year,selectedDate,search]);
 const shown=filtered.slice(page*pageSize,(page+1)*pageSize);
 const newest=data.draws[0];
 const maxPages=Math.max(1,Math.ceil(filtered.length/pageSize));
 const freq=useMemo(()=>{const tally=Array.from({length:50},(_,i)=>({n:i+1,count:0}));for(const d of data.draws)for(const n of d.main_numbers)tally[n-1].count++;return tally.sort((a,b)=>b.count-a.count).slice(0,5)},[data.draws]);
 function reset(){setYear("all");setSelectedDate("");setSearch("");setPage(0);}
 return <main className="shell">
  <header className="topbar"><div className="brand"><span className="brand-logo"><Trophy size={19}/></span><span>EURO<span className="brand-accent">JACKPOT</span><small>ERGEBNISARCHIV</small></span></div><div className="top-right"><span className="live"><span className="live-dot"/>Datenarchiv</span><button className="ghost icon-btn" title="Daten aktualisieren" onClick={()=>void load(true)} disabled={refreshing}><RefreshCcw size={17} className={refreshing?"spin":""}/><span>Aktualisieren</span></button></div></header>
  <section className="intro"><div className="eyebrow">ZAHLEN. DATEN. ZIEHUNGEN.</div><h1>Jede Ziehung.<br/><span>Ein Blick zurück.</span></h1><p>Durchsuche die Eurojackpot-Gewinnzahlen nach Datum und entdecke die gesamte verfügbare Historie.</p></section>
  <section className="stats"><div className="stat"><div className="stat-top"><span>Erfasste Ziehungen</span><Database size={18}/></div><strong>{data.draws.length.toLocaleString("de-DE")}</strong><small>In der lokalen SQLite-Datenbank</small></div><div className="stat"><div className="stat-top"><span>Letzte Ziehung</span><CalendarDays size={18}/></div><strong>{newest?.date_de||"—"}</strong><small>{newest?format(newest.date).split(",")[0]:"Noch keine Daten"}</small></div><div className="stat"><div className="stat-top"><span>Datenstand</span><Clock3 size={18}/></div><strong>{data.lastSync?new Date(data.lastSync).toLocaleDateString("de-DE"):"—"}</strong><small>{data.lastSync?"Letzter erfolgreicher Import":"Noch nicht synchronisiert"}</small></div></section>
  {data.syncError&&<div className="warning">Datenimport: {data.syncError}. {data.draws.length?"Gespeicherte Daten werden weiterhin angezeigt.":"Bitte Quelle und SQLite-Volume prüfen."}</div>}
  {newest&&<section className="featured"><div className="sectionline"><span className="featured-badge"><span className="live-dot"/> NEUESTE ZIEHUNG</span><span>{format(newest.date)}</span></div><div className="feature-body"><div><h2>Aktuelle Gewinnzahlen</h2><p>5 Gewinnzahlen und 2 Eurozahlen</p></div><Balls draw={newest}/></div></section>}
  <section className="history"><div className="history-heading"><div><span className="eyebrow">ALLE ERGEBNISSE</span><h2>Ziehungshistorie</h2><p>Wähle ein Datum oder durchsuche die vorhandenen Ziehungen.</p></div><div className="count"><ChartNoAxesColumn size={15}/>{filtered.length} Ergebnisse</div></div>
  <div className="filters"><label className="filter"><span><CalendarDays size={15}/> Datum</span><input aria-label="Ziehungsdatum" type="date" value={selectedDate} max={new Date().toISOString().slice(0,10)} onChange={e=>{setSelectedDate(e.target.value);setPage(0);}}/></label><label className="filter"><span>Jahr</span><select aria-label="Jahr auswählen" value={year} onChange={e=>{setYear(e.target.value);setPage(0);}}><option value="all">Alle Jahre</option>{years.map(y=><option key={y} value={y}>{y}</option>)}</select></label><label className="filter search"><span><Search size={15}/> Suche</span><input aria-label="Nach Datum suchen" placeholder="z. B. 17.11.2026" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label><button className="reset" onClick={reset}>Filter zurücksetzen</button></div>
  <div className="draw-list">{loading?<div className="empty">Ziehungen werden geladen …</div>:shown.length===0?<div className="empty">Keine Ziehung gefunden. Eurojackpot wird dienstags und freitags gezogen, sofern an diesem Datum eine Ziehung stattfand. <button onClick={reset}>Alle anzeigen</button></div>:shown.map((draw)=><article className="draw-row" key={draw.date}><div className="draw-date"><span className="date-icon"><CalendarDays size={19}/></span><div><strong>{draw.date_de}</strong><span>{format(draw.date).split(",")[0]}</span></div></div><Balls draw={draw}/><span className="row-tag">Ziehung</span></article>)}</div>
  <div className="pagination"><span>Seite {Math.min(page+1,maxPages)} von {maxPages}</span><div><button aria-label="Vorherige Seite" disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))}><ChevronLeft size={18}/></button><button aria-label="Nächste Seite" disabled={page>=maxPages-1} onClick={()=>setPage(p=>Math.min(maxPages-1,p+1))}><ChevronRight size={18}/></button></div></div></section>
  {freq.length>0&&<section className="frequencies"><div><span className="eyebrow">STATISTIK</span><h2>Häufigste Gewinnzahlen</h2><p>Über alle gespeicherten Ziehungen hinweg – keine Gewinnprognose.</p></div><div className="freq-list">{freq.map((f,i)=><div className="freq-item" key={f.n}><span className="freq-number">{f.n}</span><div className="freq-track"><div style={{width:(f.count/(freq[0]?.count||1)*100)+"%"}}/></div><span className="freq-value">{f.count}×</span></div>)}</div></section>}
  <footer><span>EUROJACKPOT · DATENARCHIV</span><span>Datenquelle: LOTTO Bayern (über öffentliches JSON-Archiv). Alle Angaben ohne Gewähr. Keine Verbindung zu LOTTO.</span></footer>
 </main>;
}
