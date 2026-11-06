/* BAS P15.7: local real-frame GIF previews for PRIVATE administrative moderation.
 * Uses the existing tested JSZip bootanimation parser and native bitmap decoder.
 * Output: short low-resolution GIF89a, never a fake/placeholder animation.
 */
(()=>{
'use strict';
const COUNT=10, MAX_SIDE=256, MAX_BYTES=2*1024*1024;
function bytes16(out,n){out.push(n&255,(n>>>8)&255);}
function palette332(){
 const p=[];
 for(let i=0;i<256;i++)p.push(Math.round(((i>>>5)&7)*255/7),Math.round(((i>>>2)&7)*255/7),Math.round((i&3)*255/3));
 return p;
}
function indexesRGBA(data,w,h){
 if(!data||data.length!==w*h*4)throw Error('GIF preview frame dimensions mismatch');
 const out=new Uint8Array(w*h);
 for(let k=0,i=0;k<data.length;k+=4,i++){
  const alpha=data[k+3]/255;
  const red=Math.round(data[k]*alpha),green=Math.round(data[k+1]*alpha),blue=Math.round(data[k+2]*alpha);
  out[i]=((red>>>5)<<5)|((green>>>5)<<2)|(blue>>>6);
 }
 return out;
}
function lzw(indices){
 const clear=256,end=257;
 let width=9,next=258,dict=new Map(),bits=0,bitCount=0;
 const out=[];
 function write(code){
  bits|=code<<bitCount;bitCount+=width;
  while(bitCount>=8){out.push(bits&255);bits>>>=8;bitCount-=8;}
 }
 write(clear);
 let previous=indices[0];
 for(let i=1;i<indices.length;i++){
  const current=indices[i],key=previous*256+current;
  if(dict.has(key)){previous=dict.get(key);continue;}
  write(previous);
  if(next<4096){
   dict.set(key,next++);
   // GIF decoder adds the equivalent code one output later.
   if(next>(1<<width)&&width<12)width++;
  }else{
   write(clear);dict=new Map();width=9;next=258;
  }
  previous=current;
 }
 write(previous);write(end);
 if(bitCount)out.push(bits&255);
 return out;
}
function encodeRGB332(frames,w,h,delayCs=24){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<2||h<2||w>MAX_SIDE||h>MAX_SIDE||
   !Array.isArray(frames)||frames.length<2||frames.length>20||
   !Number.isInteger(delayCs)||delayCs<2||delayCs>200)throw Error('Invalid moderation GIF dimensions');
 const out=[71,73,70,56,57,97];
 bytes16(out,w);bytes16(out,h);out.push(0xf7,0,0,...palette332());
 // NETSCAPE 2.0 extension, infinitely looping the REAL sampled frames.
 out.push(0x21,0xff,0x0b,78,69,84,83,67,65,80,69,50,46,48,0x03,0x01,0,0,0);
 for(const frame of frames){
  const px=frame instanceof Uint8Array&&frame.length===w*h?frame:indexesRGBA(frame,w,h);
  out.push(0x21,0xf9,4,0x00);
  bytes16(out,delayCs);out.push(0,0);
  out.push(0x2c,0,0,0,0);bytes16(out,w);bytes16(out,h);out.push(0,8);
  const compressed=lzw(px);
  for(let i=0;i<compressed.length;i+=255)out.push(Math.min(255,compressed.length-i),...compressed.slice(i,i+255));
  out.push(0);
  if(out.length>MAX_BYTES)throw Error('Moderation GIF too large');
 }
 out.push(0x3b);
 if(out.length>MAX_BYTES)throw Error('Moderation GIF too large');
 return new Uint8Array(out);
}
async function fromBootZip(zipBlob){
 if(!(zipBlob instanceof Blob)||zipBlob.size<1||zipBlob.size>40*1024*1024)throw Error('Invalid ZIP for preview');
 const api=window.BASCommunityAnimation;
 if(!api?.buildFromZip||!api?.frameAtTime||typeof createImageBitmap!=='function')
  throw Error('Real frame preview unavailable on this browser');
 const model=await api.buildFromZip(zipBlob);
 const plan=model.plan;
 const ratio=Math.min(1,MAX_SIDE/Math.max(plan.width,plan.height));
 const w=Math.max(2,Math.round(plan.width*ratio));
 const h=Math.max(2,Math.round(plan.height*ratio));
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const ctx=canvas.getContext('2d',{alpha:false,willReadFrequently:true});
 if(!ctx)throw Error('Canvas unavailable for GIF encoding');
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 const samples=[],frameCache=new Map();
 try{
  for(let i=0;i<COUNT;i++){
   const path=api.frameAtTime(plan,i*Math.min(plan.total,COUNT*0.24)/COUNT);
   if(!frameCache.has(path)){
    const entry=model.zip.file(path);
    if(!entry)throw Error('Boot animation frame missing');
    const frame=await entry.async('blob');
    if(frame.size<12||frame.size>4*1024*1024)throw Error('Boot animation frame exceeds limit');
    frameCache.set(path,await createImageBitmap(frame));
   }
   ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
   const bitmap=frameCache.get(path);
   const scale=Math.min(w/bitmap.width,h/bitmap.height);
   ctx.drawImage(bitmap,Math.round((w-bitmap.width*scale)/2),Math.round((h-bitmap.height*scale)/2),
    Math.round(bitmap.width*scale),Math.round(bitmap.height*scale));
   samples.push(ctx.getImageData(0,0,w,h).data);
  }
  // Reject a broken source rather than uploading a deceptive still-frame GIF.
  const gif=encodeRGB332(samples,w,h,24);
  return new Blob([gif],{type:'image/gif'});
 }finally{for(const img of frameCache.values())img.close?.();canvas.width=1;canvas.height=1;}
}
window.BASCommunityGif=Object.freeze({fromBootZip,encodeRGB332,indexesRGBA});
})();
