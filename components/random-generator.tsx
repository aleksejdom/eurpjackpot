"use client";
import {useEffect,useMemo,useState} from "react";
import {Dices,Copy,ChevronDown,RotateCcw,SlidersHorizontal,ShieldCheck} from "lucide-react";
import {generatePicks,analyzeHistory,adjacency,sum,DEFAULT_RULES,RULE_DEFINITIONS,recentlyDrawnExclusions,combinedExclusions,type Draw,type Pick,type Strategy,type Rules,type Exclusions} from "@/lib/ticket-generator";
type Combo={numbers:number[];count:number};
const strategies:[Strategy,string,string][]=[
 ["uniform","Reiner Zufall","Alle zulässigen Zahlen haben das gleiche Grundgewicht."],
 ["frequency","Historisch häufig","Häufiger gezogene Zahlen werden stärker gewichtet."],
 ["recent","Letzte Wochen ausschließen","Keine Haupt- oder Eurozahl aus den letzten 2–4 Wochen wird verwendet."],
 ["neighbor","Benachbarte Zahlen","Zahlenpaare mit direkt aufeinanderfolgenden Werten werden berücksichtigt."]
];
const storageKey="ej-excluded-numbers-v1";
const percent=(n:number,d:number)=>d?(100*n/d).toLocaleString("de-DE",{maximumFractionDigits:1})+" %":"—";
function validated(v:unknown,max:number):number[]{return Array.isArray(v)?[...new Set(v.filter((n):n is number=>Number.isInteger(n)&&n>=1&&n<=max))].sort((a,b)=>a-b):[];}
function frequentCombos(draws:Draw[],size:2|3):Combo[]{
 const totals=new Map<string,number>();
 for(const draw of draws){
  const a=[...draw.main_numbers].sort((x,y)=>x-y);
  if(size===2){
   for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){
    const key=a[i]+","+a[j];totals.set(key,(totals.get(key)||0)+1);
   }
  }else{
   for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)for(let k=j+1;k<a.length;k++){
    const key=a[i]+","+a[j]+","+a[k];totals.set(key,(totals.get(key)||0)+1);
   }
  }
 }
 return [...totals].map(([key,count])=>({numbers:key.split(",").map(Number),count}))
  .sort((a,b)=>b.count-a.count||a.numbers[0]-b.numbers[0]||a.numbers[1]-b.numbers[1]||((a.numbers[2]??0)-(b.numbers[2]??0))).slice(0,10);
}
export default function RandomGenerator({draws}:{draws:Draw[]}){
 const [strategy,setStrategy]=useState<Strategy>("frequency");
 const [count,setCount]=useState(5);
 const [rules,setRules]=useState<Rules>({...DEFAULT_RULES});
 const [excluded,setExcluded]=useState<Exclusions>({main:[],euro:[]});
 const [excludeRecent,setExcludeRecent]=useState(true);
 const [recentWeeks,setRecentWeeks]=useState<2|3|4>(2);
 const [loaded,setLoaded]=useState(false);
 const [generated,setGenerated]=useState<Pick[]>([]);
 const [error,setError]=useState("");
 const sorted=useMemo(()=>[...draws].sort((a,b)=>b.date.localeCompare(a.date)),[draws]);
 const stats=useMemo(()=>analyzeHistory(sorted),[sorted]);
 const euroStats=useMemo(()=>{
  const list=Array.from({length:12},(_,i)=>({number:i+1,count:0}));
  for(const d of sorted)for(const n of d.euro_numbers)if(n>=1&&n<=12)list[n-1].count++;
  return list.sort((a,b)=>b.count-a.count||a.number-b.number);
 },[sorted]);
 const pairs=useMemo(()=>frequentCombos(sorted,2),[sorted]);
 const triples=useMemo(()=>frequentCombos(sorted,3),[sorted]);
 useEffect(()=>{
  try{const stored=localStorage.getItem(storageKey);if(stored){
   const data=JSON.parse(stored);
   setExcluded({main:validated(data?.main,50),euro:validated(data?.euro,12)});
  }}catch{/* Storage is optional. */}
  setLoaded(true);
 },[]);
 useEffect(()=>{if(loaded)try{localStorage.setItem(storageKey,JSON.stringify(excluded));}catch{/* Storage is optional. */}},[loaded,excluded]);
 const automatic=useMemo(()=>excludeRecent||strategy==="recent"?recentlyDrawnExclusions(sorted,recentWeeks):{main:[],euro:[]},[sorted,recentWeeks,excludeRecent,strategy]);
 const effective=useMemo(()=>combinedExclusions(excluded,automatic),[excluded,automatic]);
 const leftMain=50-effective.main.length,leftEuro=12-effective.euro.length;
 const totalCombos=leftMain*(leftMain-1)*(leftMain-2)*(leftMain-3)*(leftMain-4)/120*(leftEuro*(leftEuro-1)/2);
 const valid=leftMain>=5&&leftEuro>=2&&totalCombos>=count&&(!excludeRecent&&! (strategy==="recent")||sorted.length>0);
 const active=RULE_DEFINITIONS.filter(r=>r.key==="unique"||rules[r.key]).length;
 function flipExcluded(kind:"main"|"euro",number:number){
  setExcluded(prev=>({...prev,[kind]:prev[kind].includes(number)?prev[kind].filter(n=>n!==number):[...prev[kind],number].sort((a,b)=>a-b)}));
  setGenerated([]);setError("");
 }
 function generate(){
  try{
   if(!sorted.length&&(strategy!=="uniform"||excludeRecent))throw Error("Für die ausgewählten Regeln werden zuerst Ziehungsdaten benötigt.");
   setGenerated(generatePicks(sorted,count,strategy,rules,effective));setError("");
  }catch(e){setGenerated([]);setError(e instanceof Error?e.message:"Generierung fehlgeschlagen");}
 }
 function copy(text:string){void navigator.clipboard?.writeText(text);}
 return <section className="random-view">
  <div className="games-hero"><div><span className="eyebrow">ZUFALL UND STATISTIK</span><h1>Zufallsschein</h1><p>Erzeuge unterschiedliche Tippfelder und steuere die Auswahl mit historischen Mustern und eigenen Zahlenfiltern.</p></div></div>
  <div className="games-panel">
   <div className="games-title"><h2>Generator</h2><p>Wähle eine Grundstrategie und die gewünschten Regeln.</p></div>
   <div className="generator-settings">
    <label className="field">Grundstrategie<select value={strategy} onChange={e=>{setStrategy(e.target.value as Strategy);setGenerated([]);}}>{strategies.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <label className="field">Tippfelder<select value={count} onChange={e=>{setCount(Number(e.target.value));setGenerated([]);}}>{Array.from({length:10},(_,i)=><option key={i+1} value={i+1}>{i+1} Tippfelder</option>)}</select></label>
   </div>
   <p className="generator-description">{strategies.find(s=>s[0]===strategy)?.[2]}</p>
   <details className="generator-accordion">
    <summary><span><SlidersHorizontal size={18}/> Berücksichtigte Regeln</span><span>{active} aktiv <ChevronDown size={17}/></span></summary>
    <div className="generator-accordion-body">
     <p className="games-small">Regeln steuern die Vorschläge. Eindeutige vollständige Tippfelder sind immer erforderlich; andere Regeln kannst du deaktivieren.</p>
     <ul className="generator-rule-list">{RULE_DEFINITIONS.map(rule=><li key={rule.key}>
      <label className="generator-rule"><input type="checkbox" checked={rule.key==="unique"||rules[rule.key]} disabled={rule.key==="unique"} onChange={()=>{if(rule.key!=="unique"){if(rule.key==="recent")setExcludeRecent(!rules.recent);setRules(prev=>({...prev,[rule.key]:!prev[rule.key]}));setGenerated([]);}}}/>
       <span><strong>{rule.name}</strong><small>{rule.description}</small></span>
       {rule.key==="unique"&&<ShieldCheck size={16}/>}
      </label>
     </li>)}</ul>
    </div>
   </details>
   <details className="generator-accordion" open>
    <summary><span><SlidersHorizontal size={18}/> Eigener Zahlenfilter</span><span>{effective.main.length+effective.euro.length} ausgeschlossen <ChevronDown size={17}/></span></summary>
    <div className="generator-accordion-body">
     <p className="games-small">Markierte Zahlen werden vor der Zufallsgenerierung aus dem Pool entfernt. Deine eigenen Ausschlüsse werden nur lokal im Browser gespeichert.</p>
     <div className="generator-recent-filter">
       <label className="generator-rule"><input type="checkbox" checked={excludeRecent||strategy==="recent"} disabled={strategy==="recent"} onChange={e=>{setExcludeRecent(e.target.checked);setRules(prev=>({...prev,recent:e.target.checked}));setGenerated([]);}}/>
        <span><strong>Alle zuletzt gezogenen Zahlen ausschließen</strong><small>Haupt- und Eurozahlen aus den letzten 2–4 Wochen werden vollständig gesperrt, nicht nur geringer gewichtet.</small></span>
       </label>
       {(excludeRecent||strategy==="recent")&&<label className="field">Rückblick<select value={recentWeeks} onChange={e=>{setRecentWeeks(Number(e.target.value) as 2|3|4);setGenerated([]);}}>
         <option value={2}>Letzte 2 Wochen</option><option value={3}>Letzte 3 Wochen</option><option value={4}>Letzte 4 Wochen</option></select></label>}
       <p className="games-small">Bis einschließlich {sorted[0]?.date??"keine Daten"}: {automatic.main.length} Hauptzahlen und {automatic.euro.length} Eurozahlen automatisch gesperrt.</p>
       {!sorted.length&&(excludeRecent||strategy==="recent")&&<div className="warning">Bitte zuerst Ziehungsdaten laden; ohne Archiv kann der Rückblick nicht überprüft werden.</div>}
     </div>
     <div className="generator-filter-heading"><strong>Hauptzahlen (1–50)</strong><span>{leftMain} verfügbar · mindestens 5</span></div>
     <div className="generator-number-grid">{Array.from({length:50},(_,i)=>i+1).map(n=><button key={n} type="button" aria-pressed={excluded.main.includes(n)} aria-label={"Hauptzahl "+n+(automatic.main.includes(n)?" automatisch gesperrt":excluded.main.includes(n)?" wieder zulassen":" ausschließen")} className={"generator-number"+(effective.main.includes(n)?" excluded":"")+(automatic.main.includes(n)?" automatic":"")} disabled={automatic.main.includes(n)} onClick={()=>flipExcluded("main",n)}>{n}</button>)}</div>
     <div className="generator-filter-heading"><strong>Eurozahlen (1–12)</strong><span>{leftEuro} verfügbar · mindestens 2</span></div>
     <div className="generator-number-grid">{Array.from({length:12},(_,i)=>i+1).map(n=><button key={n} type="button" aria-pressed={excluded.euro.includes(n)} aria-label={"Eurozahl "+n+(automatic.euro.includes(n)?" automatisch gesperrt":excluded.euro.includes(n)?" wieder zulassen":" ausschließen")} className={"generator-number euro"+(effective.euro.includes(n)?" excluded":"")+(automatic.euro.includes(n)?" automatic":"")} disabled={automatic.euro.includes(n)} onClick={()=>flipExcluded("euro",n)}>{n}</button>)}</div>
     <p className="games-small">Rot markierte Zahlen sind durch den Wochenfilter automatisch gesperrt, andere markierte Zahlen durch deinen eigenen Filter.</p>
     <button type="button" className="outlined-btn generator-clear" disabled={excluded.main.length+excluded.euro.length===0} onClick={()=>{setExcluded({main:[],euro:[]});setGenerated([]);}}><RotateCcw size={16}/> Filter zurücksetzen</button>
    </div>
   </details>
   {!valid&&<div className="warning" role="alert">Zu viele Zahlen ausgeschlossen. Es müssen mindestens 5 Hauptzahlen, 2 Eurozahlen und genügend verschiedene Kombinationen übrig bleiben.</div>}
   {error&&<div className="warning" role="alert">{error}</div>}
   <button className="primary-btn generator-create" disabled={!valid||(!sorted.length&&(excludeRecent||strategy==="recent"))} onClick={generate}><Dices size={18}/> {count} Tippfelder generieren</button>
   {generated.length>0&&<div className="generator-results">
    <h3>Deine Vorschläge</h3>
    {generated.map((p,i)=><div className="generated-row" key={i}><strong>Feld {i+1}</strong><div className="ticket-balls">{p.main.map(n=><span key={n} className="ticket-ball">{n}</span>)}<span className="ticket-divider">+</span>{p.euro.map(n=><span key={n} className="ticket-ball euro">{n}</span>)}</div><button type="button" className="small-btn" title="Feld kopieren" aria-label={"Feld "+(i+1)+" kopieren"} onClick={()=>copy(p.main.join(" ")+" + "+p.euro.join(" "))}><Copy size={16}/></button><small className="generated-metrics">Summe {sum(p.main)} · {adjacency(p.main)} Nachbarpaare</small></div>)}
    <button type="button" className="outlined-btn" onClick={()=>copy(generated.map((p,i)=>"Spiel "+(i+1)+": "+p.main.join(" ")+" + "+p.euro.join(" ")).join("\n"))}><Copy size={16}/> Alle Tipps kopieren</button>
   </div>}
  </div>
  <section className="games-panel">
   <div className="games-title"><h2>Historische Analysen</h2><p>{stats.draws.toLocaleString("de-DE")} Ziehungen ({stats.firstDate??"—"} bis {stats.lastDate??"—"}). Beobachtungen, keine Vorhersagen.</p></div>
   <div className="pattern-grid">
    <div className="pattern-box"><small>Ziehungen mit mindestens einem benachbarten Zahlenpaar</small><strong>{percent(stats.neighborDraws,stats.draws)}</strong><span>{stats.neighborDraws} / {stats.draws}</span></div>
    <div className="pattern-box"><small>Ziehungen mit Wiederholungen aus 2–4 Wochen davor</small><strong>{percent(stats.repeatDraws,stats.comparableDraws)}</strong><span>{stats.repeatDraws} / {stats.comparableDraws}</span></div>
    <div className="pattern-box"><small>Zahlensummen (10.–90. Perzentil)</small><strong>{stats.sumRange?stats.sumRange.low+"–"+stats.sumRange.high:"—"}</strong><span>{stats.sumRange?"Median "+stats.sumRange.median:"Noch nicht genug historische Ziehungen"}</span></div>
   </div>
   <div className="generator-frequency-grid">
    <div><h3>Häufigste Hauptzahlen</h3><div className="freq-list">{stats.topMain.map(x=><div className="freq-item" key={x.number}><span className="freq-number">{x.number}</span><div className="freq-track"><div style={{width:(stats.topMain[0]?.count?100*x.count/stats.topMain[0].count:0)+"%"}}/></div><span className="freq-value">{x.count}×</span></div>)}</div></div>
    <div><h3>Häufigste Eurozahlen</h3><div className="freq-list">{euroStats.map(x=><div className="freq-item" key={x.number}><span className="freq-number euro-number">{x.number}</span><div className="freq-track"><div style={{width:(euroStats[0]?.count?100*x.count/euroStats[0].count:0)+"%"}}/></div><span className="freq-value">{x.count}×</span></div>)}</div></div>
   </div>
   <div className="generator-frequency-grid">
    <div><h3>Häufigste 2er-Kombinationen</h3><div className="combo-list">{pairs.map((combo,i)=><div className="combo-row" key={i}><span>{combo.numbers.join(" + ")}</span><strong>{combo.count}×</strong></div>)}</div></div>
    <div><h3>Häufigste 3er-Kombinationen</h3><div className="combo-list">{triples.map((combo,i)=><div className="combo-row" key={i}><span>{combo.numbers.join(" + ")}</span><strong>{combo.count}×</strong></div>)}</div></div>
   </div>
  </section>
  <section className="games-panel generator-odds"><h2>Tatsächliche Gewinnwahrscheinlichkeit</h2><p>Jackpotchance bei einer einzelnen gültigen 5+2-Kombination: <strong>1 : 139.838.160</strong>. Bei {count} unterschiedlichen Tipps entspricht die Jackpotchance <strong>{count} : 139.838.160</strong>. Keine der obigen Regeln verbessert die Chance einer einzelnen Kombination. Historische Daten beeinflussen nur die Auswahl.</p></section>
 </section>;
}
