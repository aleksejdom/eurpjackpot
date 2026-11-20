import test from "node:test";
import assert from "node:assert/strict";
import {detectDigitalBallRows,parseBubbleSheetTsv} from "../lib/digital-circle-ocr.ts";

test("detect separate number bars without reusing the first field",()=>{
 const w=600,h=900,rgba=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<w*h;i++){rgba[i*4]=255;rgba[i*4+1]=255;rgba[i*4+2]=255;rgba[i*4+3]=255;}
 const draw=(x1,y1,x2,y2,red,green,blue)=>{
  for(let y=y1;y<y2;y++)for(let x=x1;x<x2;x++){
   const i=(y*w+x)*4;rgba[i]=red;rgba[i+1]=green;rgba[i+2]=blue;
  }
 };
 for(const y of [160,310,460,610]){
  draw(50,y,357,y+70,203,203,205);
  draw(357,y,489,y+70,125,124,130);
 }
 const rows=detectDigitalBallRows({width:w,height:h,data:rgba});
 assert.equal(rows.length,4);
 assert.deepEqual(rows.map(r=>Math.round(r.top)),[195,345,495,645]);
 assert(rows.every(r=>r.step>55&&r.step<69));
 assert(rows.every(r=>r.firstCenterX>=58&&r.firstCenterX<=72));
});
test("TSV maps 28 independent numeral crops by coordinates, not OCR order",()=>{
 const texts=[3,4,21,34,37,9,10,14,24,39,41,42,7,8,17,21,32,38,39,7,9,1,4,33,44,45,1,10];
 const header="level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
 const lines=texts.map((n,i)=>[5,1,1,1,i+1,1,30,i*156+45,80,65,90,n].join("\t"));
 // Reverse TSV order to prove that coordinate placement is authoritative.
 const result=parseBubbleSheetTsv([header,...lines.reverse()].join("\n"),28);
 assert.deepEqual(result,texts);
});
test("invalid bubble numbers are never accepted",()=>{
 const header="level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
 const tsv=[header,[5,1,1,1,1,1,30,45,70,60,90,"99"].join("\t"),
 [5,1,1,1,2,1,30,201,70,60,90,"0"].join("\t"),
 [5,1,1,1,3,1,30,2*156+45,70,60,90,"7"].join("\t")].join("\n");
 assert.deepEqual(parseBubbleSheetTsv(tsv,3),[null,null,7]);
});
