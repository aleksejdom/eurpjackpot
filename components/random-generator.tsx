"use client";
import {useMemo,useState} from "react";
import {Dices,Copy,RefreshCcw,Info} from "lucide-react";
type Draw={date:string;main_numbers:number[];euro_numbers:number[]};
type Pick={main:number[];euro:number[]};
type Strategy="uniform"|"frequency"|"recent"|"neighbor";
const STRATEGIES:{value:Strategy;title:string;info:string}[]=[
 {value:"uniform",title:"Reiner Zufall",info:"Jede Zahl hat dieselbe Chance, in einen Tipp aufgenommen zu werden."},
 {value:"frequency",title:"Historisch häufig",info:"Häufiger gezogene Zahlen erhalten bei der Auswahl ein höheres Gewicht."},
 {value:"recent",title:"Wiederholungen (2–4 Wochen)",info:"Bevorzugt bei der Auswahl Zahlen, die in den 2–4 Wochen vor der neuesten Ziehung vorkamen."},
 {value:"neighbor",title:"Benachbarte Zahlen",info:"Erhöht die Auswahlchance für einen Tipp mit mindestens einem benachbarten Zahlenpaar."}
];
function rand(max:number){
 const buffer=new Uint32Array(1);
 const limit=Math.floor(4294967296/max)*max;
 let x:number;
 do{crypto.getRandomValues(buffer);x=buffer[0];}while(x>=limit);
 return x%max;
}
function choose(weights:number[],amount:number):number[]{
 const available=weights.map((weight,i)=>({n:i+1,w:Math.max(1,weight)}));
 const result:number[]=[];
 for(let i=0;i<amount;i++){
  const total=available.reduce((sum,x)=>sum+x.w,0);
  let t=rand(total),idx=0;
  for(;idx<available.length-1;idx++){if(t<available[idx].w)break;t-=available[idx].w;}
  result.push(available[idx].n);
  available.splice(idx,1);
 }
 return result.sort((a,b)=>a-b);
}
function adjacentCount(numbers:number[]){const sorted=[...numbers].sort((a,b)=>a-b);return sorted.slice(1).filter((n,i)=>n===sorted[i]+1).length;}
function recentPool(draws:Draw[]){
 if(!draws.length)return new Set<number>();
 const latest=new Date(draws[0].date+"T12:00:00Z").getTime();
 return new Set(draws.filter(d=>{
  const days=(latest-new Date(d.date+"T12:00:00Z").getTime())/86400000;
  return days>=14&&days<=28;
 }).flatMap(d=>d.main_numbers));
}
export function generateTicket(draws:Draw[],strategy:Strategy):Pick{
 const freq=Array.from({length:50},()=>0),efreq=Array.from({length:12},()=>0);
 for(const d of draws){for(const n of d.main_numbers)freq[n-1]++;for(const n of d.euro_numbers)efreq[n-1]++;}
 const recent=recentPool(draws);
 const weights=freq.map((count,i)=>{
  if(strategy==="uniform")return 100;
  if(strategy==="frequency")return 20+count*10;
  if(strategy==="recent")return recent.has(i+1)?350:100;
  return 100;
 });
 const euroWeights=efreq.map(n=>strategy==="frequency"?20+n*10:100);
 let main=choose(weights,5);
 if(strategy==="neighbor"){
  // Sample a complete legal draw uniformly until the intended pattern appears.
  // This changes the chosen style, not its statistical chance of winning.
  for(let i=0;i<80&&!adjacentCount(main);i++)main=choose(weights,5);
 }
 return {main,euro:choose(euroWeights,2)};
}
export default function RandomGenerator({draws}:{draws:Draw[]}){
 const [strategy,setStrategy]=useState<Strategy>("uniform");
 const [count,setCount]=useState(1);
 const [generated,setGenerated]=useState<Pick[]>([]);
 const sorted=useMemo(()=>[...draws].sort((a,b)=>b.date.localeCompare(a.date)),[draws]);
 const stats=useMemo(()=>{
  const n=sorted.length;
  const pairs=sorted.filter(x=>adjacentCount(x.main_numbers)>0).length;
  const frequency=Array.from({length:50},(_,i)=>({number:i+1,count:sorted.filter(d=>d.main_numbers.includes(i+1)).length})).sort((a,b)=>b.count-a.count||a.number-b.number);
  const overlap=sorted.map((d,i)=>{
    const target=new Date(d.date+"T12:00:00Z").getTime();
    const previous=new Set(sorted.slice(i+1).filter(p=>{
      const age=(target-new Date(p.date+"T12:00:00Z").getTime())/86400000;
      return age>=14&&age<=28;
    }).flatMap(x=>x.main_numbers));
    return previous.size?{overlap:d.main_numbers.filter(x=>previous.has(x)).length,hasHistory:true}:{overlap:0,hasHistory:false};
  }).filter(x=>x.hasHistory);
  return {n,pairs,frequency,overlap,totalComparable:overlap.length,withOverlap:overlap.filter(x=>x.overlap>0).length};
 },[sorted]);
 const percent=(num:number,den:number)=>den?(100*num/den).toLocaleString("de-DE",{maximumFractionDigits:1})+" %":"—";
 const next=()=>setGenerated(Array.from({length:count},()=>generateTicket(sorted,strategy)));
 return <section className="random-view">
  <div className="games-hero"><div><span className="eyebrow">STATISTIK UND ZUFALL</span><h1>Zufallsschein</h1><p>Erzeuge gültige 5-aus-50- und 2-aus-12-Kombinationen – mit frei wählbaren historischen Auswahlmustern.</p></div></div>
  <div className="games-panel">
   <div className="games-title"><h2>Generator</h2><p>Die Gewichtung verändert, welche Zahlen der Generator vorschlägt, nicht die Gewinnwahrscheinlichkeit deiner Kombination.</p></div>
   <div className="generator-settings"><label className="field">Strategie<select value={strategy} onChange={e=>setStrategy(e.target.value as Strategy)}>{STRATEGIES.map(o=><option key={o.value} value={o.value}>{o.title}</option>)}</select></label><label className="field">Tippfelder<select value={count} onChange={e=>setCount(Number(e.target.value))}>{Array.from({length:10},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label></div>
   <p className="generator-description"><Info size={16}/>{STRATEGIES.find(x=>x.value===strategy)?.info}</p>
   <button className="primary-btn" onClick={next}><Dices size={18}/> {generated.length?"Neu generieren":"Zufallsschein generieren"}</button>
   {!!generated.length&&<div className="generator-results">{generated.map((pick,i)=><div className="generated-row" key={i}><strong>Feld {i+1}</strong><div className="ticket-balls">{pick.main.map(n=><span className="ticket-ball" key={n}>{n}</span>)}<span className="ticket-divider">+</span>{pick.euro.map(n=><span className="ticket-ball euro" key={n}>{n}</span>)}</div><button className="small-btn" aria-label={"Feld "+(i+1)+" kopieren"} title="Zahlen kopieren" onClick={()=>navigator.clipboard.writeText(pick.main.join(" ")+" + "+pick.euro.join(" "))}><Copy size={16}/></button></div>)}
    <button className="outlined-btn" onClick={()=>navigator.clipboard.writeText(generated.map((p,i)=>"Spiel "+(i+1)+": "+p.main.join(" ")+" + "+p.euro.join(" ")).join("\n"))}><Copy size={16}/> Alle Tipps kopieren</button>
   </div>}
  </div>
  <div className="games-panel"><div className="games-title"><h2>Historische Muster</h2><p>Berechnet aus {stats.n.toLocaleString("de-DE")} gespeicherten Ziehungen ab {sorted.at(-1)?.date??"—"}. Dies sind beobachtete Häufigkeiten, keine Vorhersagen.</p></div>
   <div className="pattern-grid"><div className="pattern-box"><small>Mindestens zwei benachbarte Hauptzahlen</small><strong>{percent(stats.pairs,stats.n)}</strong><span>{stats.pairs} von {stats.n} Ziehungen</span></div><div className="pattern-box"><small>Mindestens eine Wiederholung aus Ziehungen 2–4 Wochen zuvor</small><strong>{percent(stats.withOverlap,stats.totalComparable)}</strong><span>{stats.withOverlap} von {stats.totalComparable} vergleichbaren Ziehungen</span></div></div>
   <div className="games-subtitle"><h3>Die 10 häufigsten Hauptzahlen</h3><span>Gesamte gespeicherte Historie</span></div>
   <div className="freq-list">{stats.frequency.slice(0,10).map(x=><div className="freq-item" key={x.number}><span className="freq-number">{x.number}</span><div className="freq-track"><div style={{width:(x.count/(stats.frequency[0]?.count||1)*100)+"%"}}/></div><span className="freq-value">{x.count}×</span></div>)}</div>
  </div>
  <p className="games-small">Jede der 139.838.160 möglichen vollständigen Eurojackpot-Kombinationen ist vor der Ziehung gleich wahrscheinlich (Jackpotchance je Feld 1 : 139.838.160). Historische Muster liefern keinen statistischen Vorteil. Generierte Tipps werden nicht automatisch als gekaufte Spielscheine gespeichert und nicht als Ausgaben gezählt.</p>
 </section>;
}
