/* BAS P15.5 ZIP admission preflight - Node.js staging/offline only.
 * No public upload route exists. The Cloudflare Worker MUST NOT import this Node module.
 * Decompression and media decoding for a deployed R2 pipeline need separate review.
 */
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const MAX_ZIP_BYTES = 40 * 1024 * 1024;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_DESC_BYTES = 16 * 1024;
const MAX_TOTAL_UNPACKED = 128 * 1024 * 1024;
const MAX_ENTRIES = 800;
const MAX_FRAMES = 750;
const MAX_RATIO = 100;
const MAX_PIXELS = 32 * 1024 * 1024;
const KNOWN_FLAGS = 0x0006 | 0x0800;
const UTF8 = new TextDecoder('utf-8', {fatal:true});

export class ZipPolicyError extends Error {
  constructor(code) {super('BAS rejected bootanimation ZIP: '+code);this.name='ZipPolicyError';this.code=code;}
}
function refuse(code) {throw new ZipPolicyError(code);}
function checkRange(buffer, at, length) {
  if(!Number.isSafeInteger(at)||!Number.isSafeInteger(length)||at<0||length<0||at+length>buffer.length)
    refuse('truncated_zip');
}
function u16(buffer,at){checkRange(buffer,at,2);return buffer.readUInt16LE(at);}
function u32(buffer,at){checkRange(buffer,at,4);return buffer.readUInt32LE(at);}
function safeText(bytes){
  try{return UTF8.decode(bytes);}catch(_){refuse('invalid_utf8');}
}
function crc32(bytes){
  let crc=0xffffffff;
  for(const byte of bytes){
    crc^=byte;
    for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function noZip64(extra){
  for(let pos=0;pos<extra.length;){
    if(pos+4>extra.length)refuse('invalid_extra');
    const id=extra.readUInt16LE(pos),size=extra.readUInt16LE(pos+2);
    if(id===1)refuse('zip64_unsupported');
    pos+=4+size;
    if(pos>extra.length)refuse('invalid_extra');
  }
}
function detectImage(path,bytes){
  const ext=path.slice(path.lastIndexOf('.')+1).toLowerCase();
  if(ext==='png'){
    if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')refuse('bad_png_signature');
    if(bytes.toString('ascii',12,16)!=='IHDR')refuse('bad_png_header');
    const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
    if(!width||!height||width>8192||height>8192||width*height>MAX_PIXELS)refuse('image_dimensions');
  }else if(ext==='jpg'||ext==='jpeg'){
    if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8||bytes[2]!==0xff)refuse('bad_jpeg_signature');
  }else if(ext==='webp'){
    if(bytes.length<16||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')refuse('bad_webp_signature');
  }else refuse('invalid_frame_type');
}
function parseDesc(bytes){
  const text=safeText(bytes);
  if(text.includes('\0')||text.length>MAX_DESC_BYTES)refuse('bad_description');
  const lines=text.replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
  if(lines.length<2)refuse('missing_parts');
  const dims=/^(\d{1,5})\s+(\d{1,5})\s+(\d{1,3})$/.exec(lines.shift());
  if(!dims)refuse('invalid_description_header');
  const [width,height,fps]=dims.slice(1).map(Number);
  if(width<1||width>8192||height<1||height>8192||width*height>MAX_PIXELS||fps<1||fps>120)
    refuse('invalid_description_dimensions');
  const parts=new Set();
  for(const line of lines){
    const matched=/^[pc]\s+\d{1,5}\s+\d{1,5}\s+(part\d{1,2})$/.exec(line);
    if(!matched)refuse('unsupported_description_command');
    parts.add(matched[1]);
  }
  if(!parts.size)refuse('missing_parts');
  return {width,height,fps,parts};
}
function kind(path){
  if(path==='desc.txt')return 'desc';
  if(/^part\d{1,2}\/$/.test(path))return 'folder';
  if(/^part\d{1,2}\/[A-Za-z0-9_-]{1,64}\.(?:png|jpg|jpeg|webp)$/.test(path))return 'frame';
  refuse('invalid_path');
}
export function validateBootAnimationZip(input){
  if(!(input instanceof Uint8Array))refuse('invalid_input');
  const bytes=Buffer.from(input.buffer,input.byteOffset,input.byteLength);
  if(!bytes.length||bytes.length>MAX_ZIP_BYTES)refuse('archive_size');
  let eocd=-1;
  const min=Math.max(0,bytes.length-(65535+22));
  for(let i=bytes.length-22;i>=min;i--){
    if(u32(bytes,i)===0x06054b50 && i+22+u16(bytes,i+20)===bytes.length){eocd=i;break;}
  }
  if(eocd<0)refuse('missing_end_directory');
  if(u16(bytes,eocd+4)!==0||u16(bytes,eocd+6)!==0||u16(bytes,eocd+8)!==u16(bytes,eocd+10))refuse('multi_disk');
  const entries=u16(bytes,eocd+10),directorySize=u32(bytes,eocd+12),directory=u32(bytes,eocd+16);
  if(entries===0xffff||directory===0xffffffff||directorySize===0xffffffff)refuse('zip64_unsupported');
  if(entries<2||entries>MAX_ENTRIES)refuse('entry_count');
  if(directory+directorySize!==eocd)refuse('directory_layout');
  let at=directory,totalUnpacked=0,frameCount=0,desc=null;
  const paths=new Set(),framesByPart=new Map(),ranges=[];
  let minHeaderOffset=Infinity, minCompressed=0;
  for(let i=0;i<entries;i++){
    checkRange(bytes,at,46);
    if(u32(bytes,at)!==0x02014b50)refuse('invalid_central_directory');
    const versionMade=u16(bytes,at+4),flags=u16(bytes,at+8),method=u16(bytes,at+10);
    const crc=u32(bytes,at+16),compressed=u32(bytes,at+20),uncompressed=u32(bytes,at+24);
    const nameLength=u16(bytes,at+28),extraLength=u16(bytes,at+30),commentLength=u16(bytes,at+32);
    const startDisk=u16(bytes,at+34),attributes=u32(bytes,at+38),offset=u32(bytes,at+42);
    if(startDisk!==0||offset===0xffffffff||compressed===0xffffffff||uncompressed===0xffffffff)refuse('zip64_unsupported');
    if(flags&~KNOWN_FLAGS || (flags&0x0009))refuse('unsafe_flags');
    if(method!==0&&method!==8)refuse('unsupported_compression');
    if(!nameLength||nameLength>120||commentLength>1024)refuse('name_or_comment_size');
    checkRange(bytes,at+46,nameLength+extraLength+commentLength);
    const name=safeText(bytes.subarray(at+46,at+46+nameLength));
    noZip64(bytes.subarray(at+46+nameLength,at+46+nameLength+extraLength));
    if(paths.has(name.toLowerCase()))refuse('duplicate_path');
    paths.add(name.toLowerCase());
    const entryKind=kind(name);
    const unixMode=versionMade>>>8===3?(attributes>>>16):0;
    if((unixMode&0xf000)===0xa000)refuse('symlink_forbidden');
    if(uncompressed>MAX_ENTRY_BYTES||compressed>MAX_ENTRY_BYTES)refuse('entry_too_large');
    if(entryKind==='folder'&&(compressed!==0||uncompressed!==0))refuse('folder_with_data');
    if(entryKind==='desc'&&uncompressed>MAX_DESC_BYTES)refuse('description_size');
    if(compressed===0&&uncompressed!==0)refuse('compression_ratio');
    if(uncompressed>Math.max(compressed,1)*MAX_RATIO)refuse('compression_ratio');
    totalUnpacked+=uncompressed;
    minCompressed+=compressed;
    if(totalUnpacked>MAX_TOTAL_UNPACKED)refuse('total_unpacked_limit');
    checkRange(bytes,offset,30);
    if(u32(bytes,offset)!==0x04034b50)refuse('missing_local_header');
    if(u16(bytes,offset+6)!==flags||u16(bytes,offset+8)!==method)refuse('mismatched_local_header');
    if(u32(bytes,offset+14)!==crc||u32(bytes,offset+18)!==compressed||u32(bytes,offset+22)!==uncompressed)
      refuse('mismatched_local_size');
    const lNameLength=u16(bytes,offset+26),lExtraLength=u16(bytes,offset+28);
    if(lNameLength!==nameLength)refuse('mismatched_filename');
    checkRange(bytes,offset+30,lNameLength+lExtraLength);
    if(!bytes.subarray(offset+30,offset+30+nameLength).equals(bytes.subarray(at+46,at+46+nameLength)))
      refuse('mismatched_filename');
    noZip64(bytes.subarray(offset+30+lNameLength,offset+30+lNameLength+lExtraLength));
    const payloadStart=offset+30+lNameLength+lExtraLength;
    checkRange(bytes,payloadStart,compressed);
    if(payloadStart+compressed>directory)refuse('overlap_directory');
    ranges.push([offset,payloadStart+compressed]);
    minHeaderOffset=Math.min(minHeaderOffset,offset);
    const payload=bytes.subarray(payloadStart,payloadStart+compressed);
    let inflated;
    if(method===0){
      if(compressed!==uncompressed)refuse('mismatched_stored_sizes');
      inflated=payload;
    }else{
      try{inflated=inflateRawSync(payload,{maxOutputLength:MAX_ENTRY_BYTES+1});}
      catch(_){refuse('invalid_deflate_stream');}
    }
    if(inflated.length!==uncompressed)refuse('unpacked_size_mismatch');
    if(crc32(inflated)!==crc)refuse('crc_mismatch');
    if(entryKind==='desc'){
      desc=parseDesc(inflated);
    }else if(entryKind==='frame'){
      detectImage(name,inflated);
      frameCount++;
      if(frameCount>MAX_FRAMES)refuse('too_many_frames');
      const part=name.split('/')[0];
      framesByPart.set(part,(framesByPart.get(part)||0)+1);
    }
    at+=46+nameLength+extraLength+commentLength;
  }
  if(at!==directory+directorySize)refuse('directory_length');
  if(minHeaderOffset!==0)refuse('self_extracting_archive');
  ranges.sort((a,b)=>a[0]-b[0]);
  for(let i=0;i<ranges.length;i++){
    const prev=i?ranges[i-1][1]:0;
    if(ranges[i][0]!==prev)refuse('hidden_or_overlapping_data');
  }
  if(ranges[ranges.length-1][1]!==directory)refuse('hidden_data');
  if(!desc)refuse('missing_description');
  if(!frameCount)refuse('missing_frames');
  for(const part of desc.parts)if(!framesByPart.has(part))refuse('empty_declared_part');
  for(const part of framesByPart.keys())if(!desc.parts.has(part))refuse('undeclared_part');
  if(totalUnpacked>Math.max(minCompressed,1)*MAX_RATIO)refuse('total_compression_ratio');
  return Object.freeze({
    valid:true,width:desc.width,height:desc.height,fps:desc.fps,
    frame_count:frameCount,part_count:desc.parts.size,
    archive_bytes:bytes.length,total_unpacked_bytes:totalUnpacked,
    sha256:createHash('sha256').update(bytes).digest('hex'),
    status:'preflight_only_not_publishable'
  });
}
