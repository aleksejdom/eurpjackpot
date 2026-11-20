/**
 * Structured digital screenshot scanner.
 *
 * Unlike normal OCR this detects the light gray main-number strips using
 * pixel geometry, then builds one independent crop per number bubble.
 * Tesseract reads vertically arranged 28+ isolated bubbles, not the source
 * screen's headings or adjacent fields. No image is sent to the server.
 */
import type {Worker} from "tesseract.js";

export type PixelImage={width:number;height:number;data:Uint8ClampedArray};
export type DigitalBallRow={top:number;height:number;firstCenterX:number;step:number};
export type DigitalBubbleScan={lines:{index:number;main:string;euro:string;complete:boolean}[];warnings:string[]};

const tileW=190,tileH=156;
const isGray=(pixels:Uint8ClampedArray,width:number,x:number,y:number)=>{
 const pos=(y*width+x)*4,r=pixels[pos],g=pixels[pos+1],b=pixels[pos+2];
 return r>=178&&r<=236&&Math.abs(r-g)<=11&&Math.abs(r-b)<=13;
};

/** Detects the actual four horizontal gray number strips, not text labels.
 * Also works on a screenshot scaled to another iPhone/Android resolution.
 */
export function detectDigitalBallRows(image:PixelImage):DigitalBallRow[]{
 const {width:w,height:h,data}=image;
 if(w<260||h<350||data.length<w*h*4)return [];
 const ys:number[]=[];
 const minCount=Math.max(9,Math.floor(w*.016));
 const fromX=Math.round(w*.03),toX=Math.round(w*.7);
 for(let y=0;y<h;y+=3){
  let n=0;
  for(let x=fromX;x<toX;x+=3)if(isGray(data,w,x,y))n++;
  if(n>=minCount)ys.push(y);
 }
 const groups:{start:number;last:number}[]=[];
 for(const y of ys){
  const last=groups.at(-1);
  if(!last||y-last.last>9)groups.push({start:y,last:y});
  else last.last=y;
 }
 const candidates:DigitalBallRow[]=[];
 for(const group of groups){
  const bandH=group.last-group.start+3;
  if(bandH<Math.max(16,h*.019)||bandH>h*.22)continue;
  const scanY=Math.min(h-1,group.start+Math.max(4,Math.round(bandH*.055)));
  let runStart=-1,bestStart=-1,bestLength=0;
  const maxX=Math.round(w*.72);
  for(let x=Math.round(w*.02);x<=maxX;x++){
   const gray=x<maxX&&isGray(data,w,x,scanY);
   if(gray&&runStart<0)runStart=x;
   if(!gray&&runStart>=0){
    const len=x-runStart;
    if(len>bestLength){bestStart=runStart;bestLength=len;}
    runStart=-1;
   }
  }
  if(bestLength<Math.max(bandH*2,w*.16))continue;
  const firstCenterX=bestStart+bandH*.19;
  const step=(bestLength-bandH*.82)/4;
  if(step<bandH*.65||step>bandH*1.2)continue;
  if(firstCenterX+step*6+bandH*.2>=w)continue;
  candidates.push({top:(group.start+group.last)/2-bandH/2+bandH/2,height:bandH,firstCenterX,step});
 }
 candidates.sort((a,b)=>a.top-b.top);
 // The rows must be separated. A solid gray footer or card cannot masquerade
 // as a second row of numbers.
 const rows:DigitalBallRow[]=[];
 for(const row of candidates)if(!rows.length||row.top-rows.at(-1)!.top>Math.max(row.height*1.4,h*.045))rows.push(row);
 // Limit false positives from UI backgrounds. The actual design has 1..20
 // independent numbered rows.
 return rows.length<=20?rows:[];
}

function numericToken(raw:string,max:number):number|null{
 const cleaned=raw.replace(/\s/g,"");
 if(!/^\d{1,2}$/.test(cleaned))return null;
 const n=Number(cleaned);
 return n>=1&&n<=max?n:null;
}

/** Map Tesseract TSV coordinates to a unique crop, never by OCR word order. */
export function parseBubbleSheetTsv(tsv:string,cellCount:number):Array<number|null>{
 const result:Array<number|null>=Array(cellCount).fill(null);
 const head=tsv.split(/\r?\n/);
 if(!head.length)return result;
 const columns=head[0].split("\t");
 const index=(s:string)=>columns.indexOf(s);
 const required=["level","top","height","left","text"];
 if(required.some(x=>index(x)<0))return result;
 const found=new Map<number,{text:string;left:number}[]>();
 for(const row of head.slice(1)){
  const parts=row.split("\t");
  if(Number(parts[index("level")])!==5)continue;
  const top=Number(parts[index("top")]),height=Number(parts[index("height")]);
  const left=Number(parts[index("left")]);
  if(!Number.isFinite(top)||!Number.isFinite(height)||!Number.isFinite(left))continue;
  const cell=Math.floor((top+height/2)/tileH);
  if(cell<0||cell>=cellCount)continue;
  const content=(parts.slice(index("text")).join("\t")||"").trim();
  if(!content)continue;
  const list=found.get(cell)||[];list.push({text:content,left});found.set(cell,list);
 }
 for(const [cell,words] of found){
  const text=words.sort((a,b)=>a.left-b.left).map(w=>w.text).join("");
  result[cell]=numericToken(text,cell%7<5?50:12);
 }
 return result;
}

async function makeSheets(file:File,progress:(text:string)=>void):Promise<{sheets:Blob[];rowCount:number}|null>{
 if(typeof document==="undefined")return null;
 let bitmap:ImageBitmap;
 try{bitmap=await createImageBitmap(file);}catch{return null;}
 try{
  const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.round(bitmap.width*scale);
  canvas.height=Math.round(bitmap.height*scale);
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(!ctx)return null;
  ctx.fillStyle="white";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const rows=detectDigitalBallRows(ctx.getImageData(0,0,canvas.width,canvas.height));
  if(!rows.length)return null;
  progress(rows.length+" getrennte Zahlenleisten gefunden.");
  async function sheet(radius:number):Promise<Blob>{
   const out=document.createElement("canvas");
   out.width=tileW;out.height=rows.length*7*tileH;
   const c=out.getContext("2d");
   if(!c)throw Error("Canvas konnte nicht erstellt werden");
   c.fillStyle="white";c.fillRect(0,0,out.width,out.height);
   let cell=0;
   for(const row of rows){
    for(let i=0;i<7;i++){
     const cx=row.firstCenterX+row.step*i;
     const cy=row.top;
     const half=Math.max(7,Math.round(row.height*radius));
     const x=Math.round(cx-half),y=Math.round(cy-half);
     if(x<0||y<0||x+2*half>canvas.width||y+2*half>canvas.height)throw Error("Zahlenfeld außerhalb des Bildes");
     c.drawImage(canvas,x,y,half*2,half*2,30,cell*tileH+16,124,124);
     cell++;
    }
   }
   return await new Promise<Blob>((resolve,reject)=>out.toBlob(b=>b?resolve(b):reject(Error("Bildaufbereitung fehlgeschlagen")),"image/png"));
  }
  return {sheets:[await sheet(.26),await sheet(.24),await sheet(.25)],rowCount:rows.length};
 }finally{bitmap.close();}
}

export async function scanDigitalBallNumbers(file:File,worker:Worker,psm:{SINGLE_BLOCK:string|number;AUTO:string|number},progress:(message:string)=>void):Promise<DigitalBubbleScan|null>{
 const images=await makeSheets(file,progress);
 if(!images)return null;
 const count=images.rowCount*7;
 const scans:Array<Array<number|null>>=[];
 try{
  await worker.setParameters({tessedit_char_whitelist:"0123456789",tessedit_pageseg_mode:psm.SINGLE_BLOCK as never});
  for(let i=0;i<2;i++){
   progress("Einzelzahlen werden geprüft (Durchlauf "+(i+1)+"/2) …");
   const recognition=await worker.recognize(images.sheets[i],{}, {tsv:true});
   scans.push(parseBubbleSheetTsv(recognition.data.tsv||"",count));
  }
  if(scans[0].some((n,i)=>n===null||n!==scans[1][i])){
   progress("Unsichere Ziffern werden erneut kontrolliert …");
   const third=await worker.recognize(images.sheets[2],{}, {tsv:true});
   scans.push(parseBubbleSheetTsv(third.data.tsv||"",count));
  }
 }finally{
  await worker.setParameters({tessedit_char_whitelist:"",tessedit_pageseg_mode:psm.AUTO as never});
 }
 const values:Array<number|null>=[];
 for(let i=0;i<count;i++){
  const counts=new Map<number,number>();
  for(const scan of scans){
   const n=scan[i];
   if(n!==null)counts.set(n,(counts.get(n)||0)+1);
  }
  const ranking=[...counts].sort((a,b)=>b[1]-a[1]);
  // Agreement of two INDEPENDENT crops is essential.
  values.push(ranking.length&&ranking[0][1]>=2&&
   (ranking.length<2||ranking[0][1]>ranking[1][1])?ranking[0][0]:null);
 }
 const warnings:string[]=[];
 const lines:DigitalBubbleScan["lines"]=[];
 for(let r=0;r<images.rowCount;r++){
  const part=values.slice(r*7,r*7+7);
  const main=part.slice(0,5),euro=part.slice(5,7);
  const mainValid=main.every((n):n is number=>n!==null)&&new Set(main).size===5;
  const euroValid=euro.every((n):n is number=>n!==null)&&new Set(euro).size===2;
  const mainString=mainValid?main.join(" "):"";
  const euroString=euroValid?euro.join(" "):"";
  if(!mainValid||!euroValid)warnings.push("Spielfeld "+(r+1)+": "+(!mainValid?"Hauptzahlen ":"")+(!euroValid?"Eurozahlen ":"")+"bitte am Originalbild prüfen");
  lines.push({index:r+1,main:mainString,euro:euroString,complete:mainValid&&euroValid});
 }
 // Identical complete rows may be legitimate, but are a common error
 // signature. Do not silently populate identical lines without verification.
 const duplicates=new Map<string,number[]>();
 for(const line of lines)if(line.complete){
  const key=line.main+"|"+line.euro;
  duplicates.set(key,[...(duplicates.get(key)||[]),line.index]);
 }
 for(const group of duplicates.values())if(group.length>1){
  for(const line of lines)if(group.includes(line.index)){
   line.main="";line.euro="";line.complete=false;
  }
  warnings.push("Gleiche Zahlen in Spielfeld "+group.join(", ")+": bitte manuell bestätigen");
 }
 return {lines,warnings};
}
