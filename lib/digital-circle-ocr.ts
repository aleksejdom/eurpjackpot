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
  // Top-edge gray run covers five main-number steps. A fixed
  // fraction of its length accurately tracks scaled circle positions.
  const firstCenterX=bestStart+bandH*.26;
  const step=bestLength/5;
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


/** Each crop is a separate OCR document. Unlike a 4,000px-tall sheet,
 * Tesseract cannot merge or reorder glyphs across ticket fields. */
/** Count dark connected digit glyphs inside one circle, independently of OCR.
 * Helps distinguish "37" from truncated "3" and "9" from a guessed "8".
 */
export function countDarkGlyphs(pixels:Uint8ClampedArray,size:number):number{
 if(pixels.length<size*size*4)return 0;
 const mask=new Uint8Array(size*size),seen=new Uint8Array(size*size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*size+x,p=i*4;
  if(Math.hypot(x-size/2,y-size/2)>size*.39)continue;
  const gray=(pixels[p]*.299+pixels[p+1]*.587+pixels[p+2]*.114);
  if(gray<135)mask[i]=1;
 }
 let count=0;
 for(let seed=0;seed<mask.length;seed++){
  if(!mask[seed]||seen[seed])continue;
  const pending=[seed];seen[seed]=1;
  let area=0,minY=size,maxY=0;
  while(pending.length){
   const at=pending.pop()!,y=Math.floor(at/size),x=at%size;
   area++;minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(const n of [at-1,at+1,at-size,at+size]){
    if(n<0||n>=mask.length||seen[n]||!mask[n])continue;
    if(Math.abs((n%size)-x)+Math.abs(Math.floor(n/size)-y)!==1)continue;
    seen[n]=1;pending.push(n);
   }
  }
  if(area>=Math.max(16,size*.3)&&maxY-minY>=size*.12)count++;
 }
 return count;
}
async function prepareCells(file:File,progress:(text:string)=>void):Promise<Array<{blob:Blob;glyphs:number}>|null>{
 if(typeof document==="undefined")return null;
 let bitmap:ImageBitmap;
 try{bitmap=await createImageBitmap(file);}catch{return null;}
 try{
  const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));
  canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(!ctx)return null;
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const rows=detectDigitalBallRows(ctx.getImageData(0,0,canvas.width,canvas.height));
  if(!rows.length)return null;
  progress(rows.length+" Zahlenleisten und "+(rows.length*7)+" einzelne Zahlenkreise gefunden.");
  const cells:Array<{blob:Blob;glyphs:number}>=[];
  for(const row of rows)for(let i=0;i<7;i++){
   const x=row.firstCenterX+row.step*i,y=row.top;
   const r=Math.max(9,Math.round(row.height*.34));
   if(x-r<0||y-r<0||x+r>canvas.width||y+r>canvas.height)throw Error("Zahlenkreis außerhalb des Bildes");
   const size=2*r,source=ctx.getImageData(Math.round(x-r),Math.round(y-r),size,size);
   // Strip the colored gray ring: otherwise Tesseract can mistake the
   // circle's corners for a second numeral or an adjacent character.
   for(let py=0;py<size;py++)for(let px=0;px<size;px++){
    if(Math.hypot(px-r,py-r)>r*.78){
     const at=(py*size+px)*4;
     source.data[at]=source.data[at+1]=source.data[at+2]=255;
    }
   }
   const glyphs=countDarkGlyphs(source.data,size);
   const out=document.createElement("canvas");
   out.width=380;out.height=340;
   const painter=out.getContext("2d");
   if(!painter)throw Error("Canvas nicht verfügbar");
   painter.fillStyle="#fff";painter.fillRect(0,0,out.width,out.height);
   const pixel=document.createElement("canvas");
   pixel.width=pixel.height=size;
   const pc=pixel.getContext("2d");
   if(!pc)throw Error("Canvas nicht verfügbar");
   pc.putImageData(source,0,0);
   painter.imageSmoothingEnabled=true;
   painter.imageSmoothingQuality="high";
   painter.drawImage(pixel,58,38,264,264);
   const blob=await new Promise<Blob>((resolve,reject)=>out.toBlob(b=>b?resolve(b):reject(Error("Ziffernbild fehlgeschlagen")),"image/png"));
   cells.push({blob,glyphs});
  }
  return cells;
 }finally{bitmap.close();}
}

export function parseSingleNumber(text:string,max:number):number|null{
 const raw=text.trim();
 if(!/^\d{1,2}$/.test(raw))return null;
 const number=Number(raw);
 return Number.isInteger(number)&&number>=1&&number<=max?number:null;
}
type PsmModes={SINGLE_WORD:string|number;SINGLE_CHAR:string|number;AUTO:string|number};
/** OCR runs per bubble, with a second segmentation mode if the first reading
 * is uncertain. Both modes are checked against valid Eurojackpot ranges. */
export async function scanDigitalBallNumbers(
 file:File,worker:Worker,psm:PsmModes,progress:(message:string)=>void
):Promise<DigitalBubbleScan|null>{
 const cells=await prepareCells(file,progress);
 if(!cells)return null;
 const numbers:(number|null)[]=[];
 try{
  await worker.setParameters({tessedit_char_whitelist:"0123456789"});
  for(let i=0;i<cells.length;i++){
   const max=i%7<5?50:12;
   const {blob,glyphs}=cells[i];
   const position="Spielfeld "+(Math.floor(i/7)+1)+" · Zahl "+(i%7+1);
   progress(position+" wird gelesen ("+(i+1)+"/"+cells.length+") …");
   if(glyphs<1||glyphs>2){numbers.push(null);continue;}
   await worker.setParameters({tessedit_pageseg_mode:psm.SINGLE_WORD as never});
   const word=await worker.recognize(blob);
   const wordNumber=parseSingleNumber(word.data.text,max);
   await worker.setParameters({tessedit_pageseg_mode:psm.SINGLE_CHAR as never});
   const character=await worker.recognize(blob);
   const charNumber=parseSingleNumber(character.data.text,max);
   const candidates=[
    {n:wordNumber,confidence:word.data.confidence},
    {n:charNumber,confidence:character.data.confidence}
   ].filter(x=>x.n!==null&&String(x.n).length===glyphs);
   let digit:number|null=null;
   if(candidates.length===1&&candidates[0].confidence>=28)digit=candidates[0].n;
   else if(candidates.length===2){
    if(candidates[0].n===candidates[1].n)digit=candidates[0].n;
    else{
     const ranked=[...candidates].sort((a,b)=>b.confidence-a.confidence);
     if(ranked[0].confidence>=75&&ranked[0].confidence-ranked[1].confidence>=20)digit=ranked[0].n;
    }
   }
   numbers.push(digit);
  }
 }finally{
  await worker.setParameters({tessedit_char_whitelist:"",tessedit_pageseg_mode:psm.AUTO as never});
 }
 const warnings:string[]=[];
 const lines:DigitalBubbleScan["lines"]=[];
 for(let r=0;r<cells.length/7;r++){
  const values=numbers.slice(r*7,r*7+7);
  const main=values.slice(0,5),euro=values.slice(5,7);
  const validMain=main.every((n):n is number=>n!==null)&&new Set(main).size===5;
  const validEuro=euro.every((n):n is number=>n!==null)&&new Set(euro).size===2;
  const line={index:r+1,main:validMain?main.join(" "):"",euro:validEuro?euro.join(" "):"",complete:validMain&&validEuro};
  if(!validMain||!validEuro)warnings.push("Spielfeld "+(r+1)+": "+(!validMain?"Hauptzahlen ":"")+(!validEuro?"Eurozahlen ":"")+"nicht sicher erkannt – bitte manuell prüfen");
  lines.push(line);
 }
 // Full duplicate combinations across independent strips are suspicious;
 // require confirmation, do not silently clone one field into others.
 const seen=new Map<string,number[]>();
 for(const line of lines)if(line.complete){
  const key=line.main+"|"+line.euro;
  seen.set(key,[...(seen.get(key)||[]),line.index]);
 }
 for(const duplicates of seen.values())if(duplicates.length>1){
  for(const line of lines)if(duplicates.includes(line.index)){line.main="";line.euro="";line.complete=false;}
  warnings.push("Identische OCR-Ergebnisse bei Feld "+duplicates.join(" und ")+": bitte manuell prüfen");
 }
 return {lines,warnings};
}
