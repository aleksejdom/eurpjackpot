/** Camera image variants: preserve the original and produce a receipt-focused
 * grayscale copy. Never upload files; all canvas operations run in-browser. */
export async function prepareReceiptImage(file:File):Promise<Blob>{
 if(typeof document==="undefined")return file;
 let bitmap:ImageBitmap;
 try{bitmap=await createImageBitmap(file);}catch{return file;}
 try{
  // Preserve detail: thermal receipt figures can be just a few pixels wide.
  const scale=Math.min(1,2600/Math.max(bitmap.width,bitmap.height));
  const width=Math.max(1,Math.round(bitmap.width*scale));
  const height=Math.max(1,Math.round(bitmap.height*scale));
  const canvas=document.createElement("canvas");
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(!ctx)return file;
  ctx.drawImage(bitmap,0,0,width,height);
  const pixels=ctx.getImageData(0,0,width,height);
  const d=pixels.data;
  // Count yellow pixels by column; select border pair if they are sustained.
  const counts=new Float32Array(width);
  for(let x=0;x<width;x+=2) {
   let n=0,total=0;
   for(let y=Math.round(height*.08);y<Math.round(height*.90);y+=8){
    const i=(y*width+x)*4;
    const r=d[i],g=d[i+1],b=d[i+2];
    if(r>155&&g>105&&b<155&&r>b*1.4&&g>b*1.25)n++;
    total++;
   }
   counts[x]=n/Math.max(1,total);
  }
  const candidates:Array<{x:number;score:number}>=[];
  for(let x=0;x<width;x+=2)if(counts[x]>.25)candidates.push({x,score:counts[x]});
  let left=0,right=width;
  // Avoid edge stripping unless a credible two-bar pair exists.
  let best=-1;
  for(const a of candidates.filter((_,i)=>i%5===0))for(const b of candidates.filter((_,i)=>i%5===0)){
   const gap=b.x-a.x;
   if(gap<width*.22||gap>width*.85)continue;
   const score=Math.min(a.score,b.score);
   if(score>best){best=score;left=a.x;right=b.x;}
  }
  if(best>.35){const pad=Math.round((right-left)*.06);left=Math.max(0,left-pad);right=Math.min(width,right+pad);}
  const cropW=Math.max(1,right-left);
  const output=document.createElement("canvas");
  const zoom=Math.min(2.5,Math.max(1,1350/cropW));
  output.width=Math.round(cropW*zoom);
  output.height=Math.round(height*zoom);
  // Guard memory on mobile devices.
  if(output.width*output.height>11_000_000){
   const limit=Math.sqrt(11_000_000/(output.width*output.height));
   output.width=Math.round(output.width*limit);output.height=Math.round(output.height*limit);
  }
  const out=output.getContext("2d",{willReadFrequently:true});
  if(!out)return file;
  out.drawImage(canvas,left,0,cropW,height,0,0,output.width,output.height);
  const p=out.getImageData(0,0,output.width,output.height);
  for(let i=0;i<p.data.length;i+=4){
   const v=Math.round(.299*p.data[i]+.587*p.data[i+1]+.114*p.data[i+2]);
   // Moderately improve faded black without obliterating thin strokes.
   const contrast=Math.max(0,Math.min(255,(v-128)*1.3+135));
   p.data[i]=p.data[i+1]=p.data[i+2]=contrast;
  }
  out.putImageData(p,0,0);
  return await new Promise<Blob>(resolve=>output.toBlob(b=>resolve(b||file),"image/png"));
 }finally{bitmap.close();}
}
/** Supplemental region scan: the middle part of common Baden-Württemberg receipts
 * contains the rows Spiel 1..N. Optional; original whole image is still scanned. */
export async function receiptGameRegion(image:Blob):Promise<Blob>{
 if(typeof document==="undefined")return image;
 let bitmap:ImageBitmap;
 try{bitmap=await createImageBitmap(image);}catch{return image;}
 try{
  const canvas=document.createElement("canvas");
  // Wider y region to support longer/shorter receipts, not authoritative.
  const from=Math.floor(bitmap.height*.15);
  const h=Math.floor(bitmap.height*.46);
  canvas.width=bitmap.width;canvas.height=h;
  const ctx=canvas.getContext("2d");if(!ctx)return image;
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,h);
  ctx.drawImage(bitmap,0,from,bitmap.width,h,0,0,bitmap.width,h);
  return await new Promise<Blob>(resolve=>canvas.toBlob(b=>resolve(b||image),"image/png"));
 }finally{bitmap.close();}
}

/** Keep digital app screenshots untouched for the first OCR pass.
 * The number rows occupy the central area of common "Mein Spielauftrag"
 * screenshots. A supplemental central crop helps Tesseract read the balls.
 */
export async function digitalTicketNumberRegion(image:Blob):Promise<Blob>{
 if(typeof document==="undefined")return image;
 let bitmap:ImageBitmap;
 try{bitmap=await createImageBitmap(image);}catch{return image;}
 try{
  const y0=Math.floor(bitmap.height*.14);
  const y1=Math.floor(bitmap.height*.80);
  const canvas=document.createElement("canvas");
  canvas.width=bitmap.width;
  canvas.height=y1-y0;
  const ctx=canvas.getContext("2d");
  if(!ctx)return image;
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap,0,y0,bitmap.width,y1-y0,0,0,canvas.width,canvas.height);
  return await new Promise<Blob>(resolve=>canvas.toBlob(b=>resolve(b||image),"image/png"));
 }finally{bitmap.close();}
}


export type OcrImageRegion={left:number;top:number;width:number;height:number};

/** Preserve the source image and only improve local contrast. The receipt
 * yellow-border crop must NEVER be used for clean digital screenshots. */
export async function prepareDigitalScreenshot(file:File):Promise<Blob>{
 return renderOcrRegion(file,null,true,1800);
}

/** Crop the exact TSV-detected Spielfeld region. Upscaling is useful because
 * small ball numerals are often only 12-20 native pixels tall. */
export async function cropOcrRegion(image:Blob,region:OcrImageRegion):Promise<Blob>{
 return renderOcrRegion(image,region,true,1350);
}
async function renderOcrRegion(image:Blob,region:OcrImageRegion|null,contrast:boolean,targetWidth:number):Promise<Blob>{
 if(typeof document==="undefined")return image;
 let bitmap:ImageBitmap;
 try{bitmap=await createImageBitmap(image);}catch{return image;}
 try{
  const x=region?Math.max(0,Math.floor(region.left)):0;
  const y=region?Math.max(0,Math.floor(region.top)):0;
  const w=region?Math.min(bitmap.width-x,Math.ceil(region.width)):bitmap.width;
  const h=region?Math.min(bitmap.height-y,Math.ceil(region.height)):bitmap.height;
  if(w<10||h<10)return image;
  let scale=Math.max(1,Math.min(2.7,targetWidth/w));
  if(w*h*scale*scale>8_000_000)scale=Math.sqrt(8_000_000/(w*h));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(w*scale));
  canvas.height=Math.max(1,Math.round(h*scale));
  const ctx=canvas.getContext("2d",{willReadFrequently:contrast});
  if(!ctx)return image;
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap,x,y,w,h,0,0,canvas.width,canvas.height);
  if(contrast){
   const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
   const data=pixels.data;
   for(let i=0;i<data.length;i+=4){
    const v=Math.round(.299*data[i]+.587*data[i+1]+.114*data[i+2]);
    // Preserve fine strokes from screenshot fonts, moderate contrast only.
    const result=Math.min(255,Math.max(0,(v-128)*1.38+127));
    data[i]=data[i+1]=data[i+2]=result;
   }
   ctx.putImageData(pixels,0,0);
  }
  return await new Promise<Blob>(resolve=>canvas.toBlob(b=>resolve(b||image),"image/png"));
 }finally{bitmap.close();}
}
