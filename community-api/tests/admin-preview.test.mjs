import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {validateReviewGif} from '../src/admin-preview.mjs';
const browser={window:{}};
runInNewContext(readFileSync(new URL('../../js/community-gif.js',import.meta.url),'utf8'),browser);
const codec=browser.window.BASCommunityGif;
function make(){
 const first=new Uint8Array(4*4*4),second=new Uint8Array(4*4*4);
 for(let i=0;i<16;i++){first.set([i*16,60,240,255],i*4);second.set([240,30,i*16,255],i*4);}
 return codec.encodeRGB332([first,second],4,4,10);
}
test('actual RGB canvas frames produce bounded valid animated GIF89a for moderator',()=>{
 const gif=make();const parsed=validateReviewGif(gif);
 assert.deepEqual(parsed,{width:4,height:4,frames:2,bytes:gif.length});
 assert.equal(String.fromCharCode(...gif.slice(0,6)),'GIF89a');
 assert.equal(gif.at(-1),0x3b);
 assert.notDeepEqual([...gif.slice(0,20)],[...new Uint8Array(20)]);
});
test('server refuses malformed, fake and oversized GIFs',()=>{
 const gif=make();
 for(const mutated of [
  new Uint8Array(gif.slice(0,-1)),new Uint8Array(gif.slice(0,-14)),
  new Uint8Array([...gif,0]),new Uint8Array(gif.map((x,i)=>i===0?0:x)),
  new Uint8Array(gif.map((x,i)=>i===7?3:x))
 ])assert.equal(validateReviewGif(mutated),null);
 assert.throws(()=>codec.encodeRGB332([new Uint8Array(4*4*4)],4,4),/Invalid/);
 assert.throws(()=>codec.encodeRGB332([new Uint8Array(4*4*4),new Uint8Array(4*4*4)],260,260),/Invalid/);
});
