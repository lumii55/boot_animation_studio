/* BAS P15.6: Worker-compatible strict bootanimation ZIP admission validator.
 * Rejects unknown formats. This returns metadata ONLY; it never grants approval.
 * DecompressionStream(deflate-raw) must be supported; otherwise fail CLOSED.
 * Security review/media decoding on the server is still required before public release.
 */
const MAX_ARCHIVE = 20 * 1024 * 1024;
const MAX_ENTRY = 4 * 1024 * 1024;
const MAX_TOTAL = 64 * 1024 * 1024;
const MAX_FILES = 480;
const MAX_FRAMES = 450;
const MAX_RATIO = 80;
const utf8 = new TextDecoder('utf-8', {fatal:true});
const HEADERS = {zip:'504b0304'};
export class ArchiveRejected extends Error {
  constructor(code){super('ZIP admission failed: '+code);this.name='ArchiveRejected';this.code=code;}
}
function reject(code){throw new ArchiveRejected(code);}
function bounds(arr,offset,length){
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>arr.length)reject('truncated_archive');
}
function view(bytes){return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);}
function readU16(v,pos){if(pos+2>v.byteLength||pos<0)reject('truncated_archive');return v.getUint16(pos,true);}
function readU32(v,pos){if(pos+4>v.byteLength||pos<0)reject('truncated_archive');return v.getUint32(pos,true);}
function ascii(arr,start,end){return String.fromCharCode(...arr.subarray(start,end));}
function text(arr){try{return utf8.decode(arr);}catch(_){reject('invalid_utf8');}}
function crc32(arr){
  let c=0xffffffff;
  for(let i=0;i<arr.length;i++){
    c^=arr[i];
    for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);
  }
  return (c^0xffffffff)>>>0;
}
function checkExtras(arr){
  const v=view(arr);
  for(let pos=0;pos<arr.length;){
    if(pos+4>arr.length)reject('invalid_extra');
    const id=readU16(v,pos),n=readU16(v,pos+2);
    pos+=4+n;
    if(pos>arr.length)reject('invalid_extra');
    if(id===1)reject('zip64_unsupported');
    // Reject Unicode path overrides and arbitrary extension records; avoid parser differentials.
    if(id!==0x5455 && id!==0x000a)reject('unsafe_extra');
  }
}
function validateFrame(path,arr){
  const ext=path.slice(path.lastIndexOf('.')+1).toLowerCase();
  if(ext==='png'){
    if(arr.length<24||ascii(arr,0,8)!=='\x89PNG\r\n\x1a\n'||ascii(arr,12,16)!=='IHDR')reject('invalid_png');
    const v=new DataView(arr.buffer,arr.byteOffset,arr.byteLength);
    const w=v.getUint32(16,false),h=v.getUint32(20,false);
    if(!w||!h||w>8192||h>8192||w*h>32000000)reject('image_dimensions');
  } else if(ext==='jpg'||ext==='jpeg'){
    if(arr.length<4||arr[0]!==0xff||arr[1]!==0xd8||arr[2]!==0xff)reject('invalid_jpeg');
  } else if(ext==='webp'){
    if(arr.length<16||ascii(arr,0,4)!=='RIFF'||ascii(arr,8,12)!=='WEBP')reject('invalid_webp');
  }else reject('invalid_frame_extension');
}
function readDesc(arr){
  const value=text(arr);
  if(value.length>16384||value.includes('\0'))reject('invalid_description');
  const lines=value.replace(/\r/g,'').split('\n').map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
  if(lines.length<2)reject('missing_parts');
  const first=/^(\d{1,5})\s+(\d{1,5})\s+(\d{1,3})$/.exec(lines.shift());
  if(!first)reject('invalid_description');
  const [width,height,fps]=first.slice(1).map(Number);
  if(!width||!height||width>8192||height>8192||width*height>32000000||fps<1||fps>120)reject('invalid_dimensions');
  const parts=new Set();
  for(const line of lines){
    const found=/^[pc]\s+\d{1,5}\s+\d{1,5}\s+(part\d{1,2})$/.exec(line);
    if(!found)reject('unsupported_description');
    parts.add(found[1]);
  }
  return {width,height,fps,parts};
}
function entryType(name){
  if(name==='desc.txt')return 'description';
  if(/^part\d{1,2}\/$/.test(name))return 'folder';
  if(/^part\d{1,2}\/[a-zA-Z0-9_-]{1,64}\.(?:png|jpg|jpeg|webp)$/.test(name))return 'frame';
  reject('unsafe_path');
}
async function decompressRaw(data,maxExpected){
  let stream,reader;
  try{
    if(typeof DecompressionStream!=='function')reject('decompressor_unavailable');
    stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    reader=stream.getReader();
    const chunks=[];let total=0;
    while(true){
      const item=await reader.read();
      if(item.done)break;
      total+=item.value.byteLength;
      if(total>maxExpected||total>MAX_ENTRY){
        await reader.cancel().catch(()=>{});
        reject('decompression_limit');
      }
      chunks.push(item.value);
    }
    const out=new Uint8Array(total);let cursor=0;
    for(const chunk of chunks){out.set(chunk,cursor);cursor+=chunk.length;}
    return out;
  }catch(e){
    if(e instanceof ArchiveRejected)throw e;
    reject('invalid_deflate');
  }finally{try{reader?.releaseLock();}catch(_){}}
}
export async function validateArchive(input){
  if(!(input instanceof Uint8Array))reject('bad_input');
  const bytes=input;
  if(bytes.byteLength<22||bytes.byteLength>MAX_ARCHIVE)reject('archive_limit');
  const v=view(bytes);
  let eocd=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
    if(readU32(v,i)===0x06054b50 && i+22+readU16(v,i+20)===bytes.length){eocd=i;break;}
  }
  if(eocd<0)reject('missing_directory');
  if(readU16(v,eocd+4)!==0||readU16(v,eocd+6)!==0||readU16(v,eocd+8)!==readU16(v,eocd+10))reject('multi_disk');
  const count=readU16(v,eocd+10),dirSize=readU32(v,eocd+12),dirAt=readU32(v,eocd+16);
  if(count===0xffff||dirSize===0xffffffff||dirAt===0xffffffff)reject('zip64_unsupported');
  if(count<2||count>MAX_FILES||dirAt+dirSize!==eocd)reject('directory_layout');
  let pos=dirAt,total=0,frames=0,desc=null;
  const seen=new Set(),parts=new Map(),ranges=[];
  for(let n=0;n<count;n++){
    bounds(bytes,pos,46);
    if(readU32(v,pos)!==0x02014b50)reject('invalid_directory_entry');
    const versionMade=readU16(v,pos+4),flags=readU16(v,pos+8),method=readU16(v,pos+10);
    const crc=readU32(v,pos+16),compressed=readU32(v,pos+20),uncompressed=readU32(v,pos+24);
    const nlen=readU16(v,pos+28),elen=readU16(v,pos+30),clen=readU16(v,pos+32);
    const disk=readU16(v,pos+34),attr=readU32(v,pos+38),localAt=readU32(v,pos+42);
    if(disk||localAt===0xffffffff||compressed===0xffffffff||uncompressed===0xffffffff)reject('zip64_unsupported');
    // Bit 3 data descriptors, bits 0/6 encryption, patched data and reserved flags all forbidden.
    if((flags&~0x0800)!==0)reject('unsupported_flags');
    if(method!==0&&method!==8)reject('unsupported_compression');
    if(nlen<1||nlen>120||clen>1024)reject('oversized_name');
    bounds(bytes,pos+46,nlen+elen+clen);
    const name=text(bytes.subarray(pos+46,pos+46+nlen));
    checkExtras(bytes.subarray(pos+46+nlen,pos+46+nlen+elen));
    if(seen.has(name.toLowerCase()))reject('duplicate_entry');
    seen.add(name.toLowerCase());
    const kind=entryType(name);
    if((versionMade>>8)===3){
      const fileKind=(attr>>>16)&0xf000;
      if(fileKind===0xa000)reject('symlink_forbidden');
      if(fileKind && fileKind!==0x8000 && fileKind!==0x4000)reject('special_file');
      if(kind==='folder' && fileKind===0x8000)reject('file_type_mismatch');
      if(kind!=='folder' && fileKind===0x4000)reject('file_type_mismatch');
    }
    if(compressed>MAX_ENTRY||uncompressed>MAX_ENTRY)reject('oversized_entry');
    if(kind==='description'&&uncompressed>16384)reject('oversized_description');
    if(kind==='folder'&&(compressed!==0||uncompressed!==0))reject('folder_data');
    if(compressed===0&&uncompressed!==0)reject('compression_ratio');
    if(uncompressed>Math.max(1,compressed)*MAX_RATIO)reject('compression_ratio');
    total+=uncompressed;if(total>MAX_TOTAL)reject('total_decompressed');
    bounds(bytes,localAt,30);
    if(readU32(v,localAt)!==0x04034b50||readU16(v,localAt+6)!==flags||readU16(v,localAt+8)!==method)reject('local_header_mismatch');
    if(readU32(v,localAt+14)!==crc||readU32(v,localAt+18)!==compressed||readU32(v,localAt+22)!==uncompressed)reject('local_header_mismatch');
    const localN=readU16(v,localAt+26),localE=readU16(v,localAt+28);
    if(localN!==nlen)reject('name_mismatch');
    bounds(bytes,localAt+30,localN+localE);
    for(let k=0;k<nlen;k++)if(bytes[localAt+30+k]!==bytes[pos+46+k])reject('name_mismatch');
    checkExtras(bytes.subarray(localAt+30+localN,localAt+30+localN+localE));
    const dataAt=localAt+30+localN+localE;
    bounds(bytes,dataAt,compressed);
    if(dataAt+compressed>dirAt)reject('overlap');
    ranges.push([localAt,dataAt+compressed]);
    let payload=bytes.subarray(dataAt,dataAt+compressed);
    if(method===0){
      if(compressed!==uncompressed)reject('stored_size_mismatch');
    }else payload=await decompressRaw(payload,uncompressed);
    if(payload.length!==uncompressed)reject('size_mismatch');
    if(crc32(payload)!==crc)reject('crc_mismatch');
    if(kind==='description')desc=readDesc(payload);
    if(kind==='frame'){
      validateFrame(name,payload);
      frames++;if(frames>MAX_FRAMES)reject('too_many_frames');
      const part=name.split('/')[0];parts.set(part,(parts.get(part)||0)+1);
    }
    pos+=46+nlen+elen+clen;
  }
  if(pos!==dirAt+dirSize)reject('directory_size_mismatch');
  ranges.sort((a,b)=>a[0]-b[0]);
  if(ranges[0]?.[0]!==0)reject('hidden_prefix');
  for(let i=1;i<ranges.length;i++)if(ranges[i][0]!==ranges[i-1][1])reject('hidden_data');
  if(ranges[ranges.length-1]?.[1]!==dirAt)reject('hidden_suffix');
  if(!desc||!frames)reject('missing_description_or_frames');
  for(const part of desc.parts)if(!parts.has(part))reject('empty_part');
  for(const part of parts.keys())if(!desc.parts.has(part))reject('undeclared_part');
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Object.freeze({
    sha256:[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join(''),
    width:desc.width,height:desc.height,fps:desc.fps,frame_count:frames,
    part_count:parts.size,size_bytes:bytes.length,total_unpacked_bytes:total,
    status:'quarantine_only'
  });
}
export const ARCHIVE_CAP_BYTES=MAX_ARCHIVE;
