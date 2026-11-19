/** Browser-only preparation optimized for long yellow-bordered lottery receipts. */
export async function prepareReceiptImage(file:File):Promise<Blob>{
 if(typeof document==="undefined")return file;
 let bitmap:ImageBitmap;
 try{bitmap=await createImageBitmap(file);}catch{return file;}
 try{
  const base=document.createElement("canvas");
  const shrink=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
  base.width=Math.max(1,Math.round(bitmap.width*shrink));
  base.height=Math.max(1,Math.round(bitmap.height*shrink));
  const ctx=base.getContext("2d",{willReadFrequently:true});
  if(!ctx)return file;
  ctx.drawImage(bitmap,0,0,base.width,base.height);
  const width=base.width,height=base.height;
  const pixels=ctx.getImageData(0,0,width,height).data;
  const leftBars:{x:number;score:number}[]=[];
  for(let x=0;x<width;x+=3){
   let score=0;
   for(let y=Math.round(height*.08);y<height*.89;y+=7){
    const i=(y*width+x)*4;
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    if(r>140&&g>106&&b<155&&r>b*1.5&&g>b*1.3)score++;
   }
   if(score>Math.max(8,height*.055/7))leftBars.push({x,score});
  }
  let x0=0,x1=width;
  // Yellow border has two separate vertical strips, not a single colored object.
  if(leftBars.length>5){
   const regions:{start:number;end:number;score:number}[]=[];
   for(const p of leftBars){
    const prev=regions[regions.length-1];
    if(prev&&p.x-prev.end<=18){prev.end=p.x;prev.score+=p.score;}
    else regions.push({start:p.x,end:p.x,score:p.score});
   }
   regions.sort((a,b)=>b.score-a.score);
   const best=regions.slice(0,6);
   let bestPair:typeof best=[];
   let pairScore=-1;
   for(const l of best)for(const r of best){
    if(r.start-l.end<width*.2)continue;
    if(r.start-l.end>width*.85)continue;
    const s=Math.min(l.score,r.score);
    if(s>pairScore){bestPair=[l,r];pairScore=s;}
   }
   if(bestPair.length===2){
    const left=Math.min(bestPair[0].start,bestPair[1].start);
    const right=Math.max(bestPair[0].end,bestPair[1].end);
    x0=Math.max(0,left-Math.round(width*.02));
    x1=Math.min(width,right+Math.round(width*.02));
   }
  }
  const cropW=x1-x0;
  // Keep whole height; header purchase date and lower draw dates are both needed.
  const output=document.createElement("canvas");
  const zoom=Math.min(2.2,Math.max(1,1250/cropW));
  output.width=Math.round(cropW*zoom);
  output.height=Math.round(height*zoom);
  const dest=output.getContext("2d");
  if(!dest)return file;
  dest.fillStyle="#fff";dest.fillRect(0,0,output.width,output.height);
  dest.drawImage(base,x0,0,cropW,height,0,0,output.width,output.height);
  const image=dest.getImageData(0,0,output.width,output.height);
  const data=image.data;
  for(let i=0;i<data.length;i+=4){
   // Desaturate yellow borders and boost contrast of faded thermal printing.
   const v=.299*data[i]+.587*data[i+1]+.114*data[i+2];
   const contrasted=Math.min(255,Math.max(0,(v-135)*1.55+150));
   data[i]=data[i+1]=data[i+2]=contrasted;
  }
  dest.putImageData(image,0,0);
  const blob=await new Promise<Blob|null>(resolve=>output.toBlob(resolve,"image/png"));
  return blob||file;
 }finally{bitmap.close();}
}
