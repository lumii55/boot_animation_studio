/* P15.7: shared normalization for publishing, catalog and safe tags. */
export function foldSearch(value){
  return String(value||'').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLocaleLowerCase('en-US').replace(/[\u0000-\u001f\u007f]/g,'').trim();
}
export function normalizeTags(values){
  if(!Array.isArray(values)||values.length>12)return null;
  const output=[];
  for(const raw of values){
    if(typeof raw!=='string')return null;
    const value=foldSearch(raw).replace(/^#/, '');
    if(value.length<1||value.length>32||!/^[a-z0-9_-]+$/.test(value))return null;
    if(!output.includes(value))output.push(value);
  }
  return output;
}
