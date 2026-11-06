import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { validateBootAnimationZip, ZipPolicyError } from '../src/zip-preflight.mjs';

function crc32(bytes){
  let c=0xffffffff;
  for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}
  return (c^0xffffffff)>>>0;
}
function image(){
  const png=Buffer.alloc(33,0);
  Buffer.from('89504e470d0a1a0a','hex').copy(png,0);
  png.writeUInt32BE(13,8);
  png.write('IHDR',12,'ascii');
  png.writeUInt32BE(1080,16);
  png.writeUInt32BE(2400,20);
  return png;
}
const DESCRIPTION=Buffer.from('1080 2400 30\np 1 0 part0\n','utf8');
function zip(records,opts={}){
  const locals=[],central=[];
  let offset=0;
  for(const item of records){
    const filename=Buffer.from(item.name,'utf8');
    const content=Buffer.from(item.bytes||'');
    const method=item.method??0;
    const compressed=method===8?deflateRawSync(content):content;
    const checksum=crc32(content)^(item.badCrc?1:0);
    const flag=item.flags||0;
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);
    local.writeUInt16LE(20,4);
    local.writeUInt16LE(flag,6);
    local.writeUInt16LE(method,8);
    local.writeUInt32LE(checksum>>>0,14);
    local.writeUInt32LE(compressed.length,18);
    local.writeUInt32LE(item.fakeUncompressed??content.length,22);
    local.writeUInt16LE(filename.length,26);
    const localBuffer=Buffer.concat([local,filename,compressed]);
    const c=Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50,0);
    c.writeUInt16LE(item.symlink?0x0314:20,4);
    c.writeUInt16LE(20,6);
    c.writeUInt16LE(flag,8);
    c.writeUInt16LE(method,10);
    c.writeUInt32LE(checksum>>>0,16);
    c.writeUInt32LE(compressed.length,20);
    c.writeUInt32LE(item.fakeUncompressed??content.length,24);
    c.writeUInt16LE(filename.length,28);
    if(item.symlink)c.writeUInt32LE(0xa0000000,38);
    c.writeUInt32LE(offset,42);
    locals.push(localBuffer);
    central.push(c,filename);
    offset+=localBuffer.length;
  }
  const c=Buffer.concat(central);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(records.length,8);
  end.writeUInt16LE(records.length,10);
  end.writeUInt32LE(c.length,12);
  end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,...(opts.gap?[Buffer.alloc(4)]:[]),c,end]);
}
function validRecords(method=0){
  return [
    {name:'desc.txt',bytes:DESCRIPTION,method},
    {name:'part0/00000.png',bytes:image(),method}
  ];
}
function rejects(records,code,opts){
  assert.throws(()=>validateBootAnimationZip(zip(records,opts)),e=>e instanceof ZipPolicyError && e.code===code);
}
test('valid stored bootanimation archive yields checksummed staging metadata',()=>{
  const result=validateBootAnimationZip(zip(validRecords()));
  assert.equal(result.valid,true);
  assert.equal(result.width,1080);
  assert.equal(result.height,2400);
  assert.equal(result.fps,30);
  assert.equal(result.frame_count,1);
  assert.equal(result.status,'preflight_only_not_publishable');
  assert.match(result.sha256,/^[a-f0-9]{64}$/);
});
test('valid deflated frame is inflated and CRC-verified',()=>{
  const result=validateBootAnimationZip(zip(validRecords(8)));
  assert.equal(result.frame_count,1);
});
test('rejects path traversal and backslash separators',()=>{
  rejects([{name:'desc.txt',bytes:DESCRIPTION},{name:'../part0/00000.png',bytes:image()}],'invalid_path');
  rejects([{name:'desc.txt',bytes:DESCRIPTION},{name:'part0\\00000.png',bytes:image()}],'invalid_path');
});
test('rejects symlinks even when frame name looks valid',()=>{
  rejects([{name:'desc.txt',bytes:DESCRIPTION},{name:'part0/00000.png',bytes:image(),symlink:true}],'symlink_forbidden');
});
test('rejects encrypted archives and hidden unsupported flags',()=>{
  rejects([{name:'desc.txt',bytes:DESCRIPTION},{name:'part0/00000.png',bytes:image(),flags:1}],'unsafe_flags');
});
test('rejects duplicate archive paths ignoring case',()=>{
  rejects([...validRecords(),{name:'part0/00000.png',bytes:image()}],'duplicate_path');
});
test('rejects missing desc and invalid declared parts',()=>{
  rejects([{name:'part0/00000.png',bytes:image()},{name:'part0/00001.png',bytes:image()}],'missing_description');
  rejects([{name:'desc.txt',bytes:Buffer.from('1080 2400 30\np 1 0 part1\n')},{name:'part0/00000.png',bytes:image()}],'empty_declared_part');
});
test('rejects forged CRC and entry sizes',()=>{
  rejects([{name:'desc.txt',bytes:DESCRIPTION},{name:'part0/00000.png',bytes:image(),badCrc:true}],'crc_mismatch');
  rejects([{name:'desc.txt',bytes:DESCRIPTION},{name:'part0/00000.png',bytes:image(),fakeUncompressed:1000}],'mismatched_stored_sizes');
  rejects([{name:'desc.txt',bytes:DESCRIPTION},{name:'part0/00000.png',bytes:image(),method:8,fakeUncompressed:1000}],'unpacked_size_mismatch');
});
test('rejects compressible zip-bomb entry by expansion ratio',()=>{
  rejects([{name:'desc.txt',bytes:DESCRIPTION},{name:'part0/00000.png',bytes:Buffer.alloc(100000,0),method:8}],'compression_ratio');
});
test('rejects hidden padding between local payloads and central directory',()=>{
  rejects(validRecords(),'directory_layout',{gap:true});
});
test('rejects malformed PNG and dangerous image dimensions',()=>{
  rejects([{name:'desc.txt',bytes:DESCRIPTION},{name:'part0/00000.png',bytes:Buffer.from('not-a-png')}],'bad_png_signature');
  const huge=image();huge.writeUInt32BE(9000,16);
  rejects([{name:'desc.txt',bytes:DESCRIPTION},{name:'part0/00000.png',bytes:huge}],'image_dimensions');
});
test('rejects misleading description dimensions and executable file',()=>{
  rejects([{name:'desc.txt',bytes:Buffer.from('0 2400 30\np 1 0 part0\n')},{name:'part0/00000.png',bytes:image()}],'invalid_description_dimensions');
  rejects([...validRecords(),{name:'evil.sh',bytes:Buffer.from('echo bad')}],'invalid_path');
});
test('rejects oversized archive and truncated ZIP',()=>{
  assert.throws(()=>validateBootAnimationZip(Buffer.alloc(40*1024*1024+1)),e=>e.code==='archive_size');
  assert.throws(()=>validateBootAnimationZip(zip(validRecords()).subarray(0,60)),e=>e.code==='missing_end_directory');
});
