/**
 * Pure Eurojackpot generator and historical analysis.
 * Historical preferences do not change the probability of a valid ticket winning.
 */
export type Draw={date:string;main_numbers:number[];euro_numbers:number[]};
export type Pick={main:number[];euro:number[]};
export type Strategy="uniform"|"frequency"|"recent"|"neighbor";
export type RuleKey="unique"|"overlap"|"birthdays"|"parity"|"ranges"|"sum"|"neighbors"|"recent"|"patterns";
export type Rules=Record<RuleKey,boolean>;
export type Exclusions={main:number[];euro:number[]};
export const DEFAULT_RULES:Rules={
 unique:true,overlap:true,birthdays:true,parity:true,ranges:true,
 sum:true,neighbors:true,recent:true,patterns:true
};
export const RULE_DEFINITIONS:{key:RuleKey;name:string;description:string}[]=[
 {key:"unique",name:"Keine identischen Tippfelder",description:"Der Generator vermeidet doppelte vollständige 5+2-Kombinationen. Diese Schutzregel bleibt immer aktiv."},
 {key:"overlap",name:"Überschneidungen reduzieren",description:"Zwischen den fünf Feldern werden möglichst unterschiedliche Haupt- und Eurozahlen bevorzugt."},
 {key:"birthdays",name:"Geburtstagszahlen weniger gewichten",description:"Hauptzahlen 1–31 werden etwas seltener vorgeschlagen; die Zahlen 32–50 bekommen mehr Auswahlgewicht."},
 {key:"parity",name:"Gerade/ungerade mischen",description:"Zwei oder drei gerade und entsprechend drei oder zwei ungerade Hauptzahlen werden bevorzugt."},
 {key:"ranges",name:"Niedrige/hohe Zahlen mischen",description:"Zwei bis drei Hauptzahlen aus 1–25 und die übrigen aus 26–50 werden bevorzugt."},
 {key:"sum",name:"Historische Zahlensummen berücksichtigen",description:"Die Hauptzahlensumme wird leicht zum 10.–90. Perzentil der historischen Ziehungen hingewichtet."},
 {key:"neighbors",name:"Benachbarte Zahlen berücksichtigen",description:"Die Häufigkeit aufeinanderfolgender Hauptzahlen wie 23 und 24 wird bei der Tippauswahl als Muster verwendet."},
 {key:"recent",name:"Letzte Ziehungen ausschließen",description:"Mit dem Wochenfilter werden Haupt- und Eurozahlen aus den letzten 2, 3 oder 4 Wochen vollständig aus dem Zahlenpool entfernt."},
 {key:"patterns",name:"Offensichtliche Muster vermeiden",description:"Einfache Zahlenreihen mit konstantem Abstand und reine gleiche Endziffern werden möglichst vermieden."}
];
const asc=(a:number,b:number)=>a-b;
const day=(iso:string)=>Date.parse(iso+"T12:00:00Z");
export const sum=(values:number[])=>values.reduce((s,n)=>s+n,0);
export function adjacency(values:number[]):number{
 const sorted=[...values].sort(asc);
 return sorted.slice(1).filter((n,i)=>n===sorted[i]+1).length;
}
export function isObviousPattern(values:number[]):boolean{
 const s=[...values].sort(asc);
 const steps=s.slice(1).map((n,i)=>n-s[i]);
 return steps.every(n=>n===steps[0])||s.every(n=>n%10===s[0]%10);
}
export const ticketKey=(pick:Pick)=>[...pick.main].sort(asc).join("-")+"|"+[...pick.euro].sort(asc).join("-");
function intersection(a:number[],b:number[]):number{
 const set=new Set(a);return b.filter(n=>set.has(n)).length;
}
function recentSet(draws:Draw[]):Set<number>{
 if(!draws.length)return new Set();
 const newest=Math.max(...draws.map(d=>day(d.date)).filter(Number.isFinite));
 return new Set(draws.filter(d=>{
  const age=(newest-day(d.date))/86400000;
  return age>=14&&age<=28;
 }).flatMap(d=>d.main_numbers));
}
function quantile(sorted:number[],portion:number):number{
 const idx=(sorted.length-1)*portion,low=Math.floor(idx);
 return sorted[low]+((sorted[low+1]??sorted[low])-sorted[low])*(idx-low);
}
export function analyzeHistory(draws:Draw[]){
 const sorted=[...draws].sort((a,b)=>b.date.localeCompare(a.date));
 const mainFreq=Array.from({length:50},(_,i)=>({number:i+1,count:0}));
 const euroFreq=Array.from({length:12},(_,i)=>({number:i+1,count:0}));
 const sums:number[]=[];
 let neighbors=0,repeat=0,comparable=0;
 for(const [i,d] of sorted.entries()){
  for(const n of d.main_numbers)if(n>=1&&n<=50)mainFreq[n-1].count++;
  for(const n of d.euro_numbers)if(n>=1&&n<=12)euroFreq[n-1].count++;
  sums.push(sum(d.main_numbers));
  if(adjacency(d.main_numbers)>0)neighbors++;
  const thisDay=day(d.date);
  const pool=new Set(sorted.slice(i+1).filter(p=>{
   const age=(thisDay-day(p.date))/86400000;
   return age>=14&&age<=28;
  }).flatMap(p=>p.main_numbers));
  if(pool.size){
   comparable++;
   if(d.main_numbers.some(n=>pool.has(n)))repeat++;
  }
 }
 sums.sort(asc);
 return {
  draws:sorted.length,
  firstDate:sorted.at(-1)?.date??null,
  lastDate:sorted[0]?.date??null,
  topMain:mainFreq.sort((a,b)=>b.count-a.count||a.number-b.number).slice(0,10),
  neighborDraws:neighbors,
  repeatDraws:repeat,
  comparableDraws:comparable,
  sumRange:sums.length>=30?{
   low:Math.round(quantile(sums,.10)),median:Math.round(quantile(sums,.50)),
   high:Math.round(quantile(sums,.90))
  }:null
 };
}
export function secureInt(max:number):number{
 if(!Number.isSafeInteger(max)||max<1||max>4294967296)throw new Error("Invalid random bound");
 if(!globalThis.crypto?.getRandomValues)throw new Error("Secure random generator is unavailable");
 const buf=new Uint32Array(1);
 const limit=Math.floor(4294967296/max)*max;
 let n:number;
 do{globalThis.crypto.getRandomValues(buf);n=buf[0];}while(n>=limit);
 return n%max;
}
export type RandomInt=(max:number)=>number;
/** Hard exclusion: include the most recent draw and every draw up to the
 * specified number of weeks before it. Do not confuse with the optional
 * 14–28-day weighting rule.
 */
export function recentlyDrawnExclusions(draws:Draw[],weeks:2|3|4):Exclusions{
 if(!draws.length)return {main:[],euro:[]};
 const latest=Math.max(...draws.map(d=>day(d.date)).filter(Number.isFinite));
 if(!Number.isFinite(latest))return {main:[],euro:[]};
 const first=latest-weeks*7*86400000;
 const main=new Set<number>(),euro=new Set<number>();
 for(const d of draws){
  const date=day(d.date);
  if(date<first||date>latest)continue;
  d.main_numbers.forEach(n=>{if(n>=1&&n<=50)main.add(n);});
  d.euro_numbers.forEach(n=>{if(n>=1&&n<=12)euro.add(n);});
 }
 return {main:[...main].sort(asc),euro:[...euro].sort(asc)};
}
export function combinedExclusions(manual:Exclusions,auto:Exclusions):Exclusions{
 return {
  main:[...new Set([...manual.main,...auto.main])].sort(asc),
  euro:[...new Set([...manual.euro,...auto.euro])].sort(asc)
 };
}
export function validateExclusions(excluded:Exclusions,count:number):void{
 for(const [type,values,max,needed] of [
  ["Hauptzahlen",excluded.main,50,5],
  ["Eurozahlen",excluded.euro,12,2]
 ] as const){
  if(!Array.isArray(values)||new Set(values).size!==values.length||
    !values.every(n=>Number.isInteger(n)&&n>=1&&n<=max))
   throw new Error("Ungültige ausgeschlossene "+type);
  if(max-values.length<needed)
   throw new Error("Zu viele ausgeschlossene "+type+": mindestens "+needed+" Zahlen müssen verfügbar bleiben.");
 }
 const a=50-excluded.main.length,b=12-excluded.euro.length;
 const combinations=(a*(a-1)*(a-2)*(a-3)*(a-4)/120)*(b*(b-1)/2);
 if(count>combinations)throw new Error("Mit diesen Ausschlüssen sind nicht genug unterschiedliche vollständige Tipps möglich.");
}
function pickWeighted(numbers:number[],weights:Map<number,number>,amount:number,rng:RandomInt):number[]{
 const available=[...numbers];const picked:number[]=[];
 for(let i=0;i<amount;i++){
  const total=available.reduce((s,n)=>s+(weights.get(n)??1),0);
  let target=rng(total),index=0;
  for(;index<available.length-1;index++){
   const weight=weights.get(available[index])??1;
   if(target<weight)break;
   target-=weight;
  }
  picked.push(available.splice(index,1)[0]);
 }
 return picked.sort(asc);
}
function weightMaps(draws:Draw[],strategy:Strategy,rules:Rules){
 const counts=Array(50).fill(0),euro=Array(12).fill(0);
 for(const d of draws){
  for(const n of d.main_numbers)if(n>=1&&n<=50)counts[n-1]++;
  for(const n of d.euro_numbers)if(n>=1&&n<=12)euro[n-1]++;
 }
 const n=Math.max(1,draws.length),recent=recentSet(draws);
 const main=new Map<number,number>(),euros=new Map<number,number>();
 for(let value=1;value<=50;value++){
  let weight=strategy==="frequency"?100+240*counts[value-1]/n:100;
  // The recent strategy applies a hard exclusion in the UI. Do not boost those numbers.
  if(rules.birthdays&&value<=31)weight*=.7;
  // Recent exclusion is applied to the allowed number pool before sampling.
  main.set(value,Math.max(1,Math.round(weight)));
 }
 for(let value=1;value<=12;value++){
  const weight=strategy==="frequency"?100+240*euro[value-1]/n:100;
  euros.set(value,Math.max(1,Math.round(weight)));
 }
 return {main,euros};
}
function candidateScore(p:Pick,previous:Pick[],rules:Rules,strategy:Strategy,history:ReturnType<typeof analyzeHistory>):number{
 const odd=p.main.filter(n=>n%2).length,small=p.main.filter(n=>n<=25).length;
 const neighbors=adjacency(p.main);
 let score=0;
 if(rules.overlap&&previous.length){
  const overlaps=previous.map(other=>intersection(p.main,other.main)+1.25*intersection(p.euro,other.euro));
  score-=8*Math.max(...overlaps);
  score-=1.3*sum(overlaps);
 }
 if(rules.parity)score+=odd===2||odd===3?5:-Math.abs(odd-2.5)*2;
 if(rules.ranges)score+=small===2||small===3?5:-Math.abs(small-2.5)*2;
 if(rules.sum&&history.sumRange){
  const n=sum(p.main),{low,high}=history.sumRange;
  score+=n>=low&&n<=high?5:-4;
 }
 if(rules.neighbors||strategy==="neighbor"){
  const ratio=history.draws?history.neighborDraws/history.draws:.35;
  // Sample the historically observed share of draws containing neighbors;
  // never describe this as improving the future winning probability.
  if(neighbors)score+=(ratio>=.3?4:1);
  else score+=(ratio<.3?4:1);
 }
 if(rules.patterns&&isObviousPattern(p.main))score-=100;
 return score;
}
export function generatePicks(
 draws:Draw[],count=5,strategy:Strategy="frequency",
 rules:Rules=DEFAULT_RULES,excluded:Exclusions={main:[],euro:[]},rng:RandomInt=secureInt
):Pick[]{
 if(!Number.isInteger(count)||count<1||count>10)throw new Error("Bitte 1 bis 10 Tippfelder wählen.");
 validateExclusions(excluded,count);
 const validMain=Array.from({length:50},(_,i)=>i+1).filter(n=>!excluded.main.includes(n));
 const validEuro=Array.from({length:12},(_,i)=>i+1).filter(n=>!excluded.euro.includes(n));
 const weights=weightMaps(draws,strategy,rules),analysis=analyzeHistory(draws);
 const chosen:Pick[]=[],seen=new Set<string>();
 for(let field=0;field<count;field++){
  let best:Pick|null=null,bestScore=-Infinity;
  // Score multiple random candidates, then choose the best according to preferences.
  for(let i=0;i<220;i++){
   const candidate={main:pickWeighted(validMain,weights.main,5,rng),euro:pickWeighted(validEuro,weights.euros,2,rng)};
   if(seen.has(ticketKey(candidate)))continue;
   const score=candidateScore(candidate,chosen,rules,strategy,analysis);
   if(score>bestScore){best=candidate;bestScore=score;}
  }
  // Deterministic exhaustive fallback for tiny remaining pools, guaranteeing
  // uniqueness whenever the number of legal combinations is sufficient.
  if(!best){
   outer:for(let a=0;a<validMain.length-4;a++)
    for(let b=a+1;b<validMain.length-3;b++)
     for(let c=b+1;c<validMain.length-2;c++)
      for(let d=c+1;d<validMain.length-1;d++)
       for(let e=d+1;e<validMain.length;e++)
        for(let f=0;f<validEuro.length-1;f++)
         for(let g=f+1;g<validEuro.length;g++){
          const candidate={main:[validMain[a],validMain[b],validMain[c],validMain[d],validMain[e]],
            euro:[validEuro[f],validEuro[g]]};
          if(!seen.has(ticketKey(candidate))){best=candidate;break outer;}
         }
  }
  if(!best)throw new Error("Keine weitere eindeutige Kombination möglich. Ausschlüsse reduzieren.");
  seen.add(ticketKey(best));chosen.push(best);
 }
 return chosen;
}
