const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const ID='d'.repeat(32),EDIT='e'.repeat(32);
function makeUI({pending=false}={}){
 const elements=new Map(),events=new Map(),calls=[];
 const author={handle:'author_55',display_name:'Stella',bio:''};
 const owned={id:ID,title:'Yonkgor Test',summary:'My boot',status:'published',tags:['anime'],
  license:'CC-BY-4.0',author_credit:'Stella',width:720,height:1600,fps:30,
  edit_id:pending?EDIT:null,edit_status:pending?'pending_review':null};
 function node(id){
  if(!elements.has(id)){
   const n={id,innerHTML:'',textContent:'',value:'',checked:false,hidden:false,
    dataset:{},classList:{toggle(){},add(){},remove(){}},
    querySelectorAll:()=>[],querySelector:()=>null,replaceChildren(){this.innerHTML='';},
    contains:()=>true,setAttribute(){},getAttribute(){return null;},focus(){},
    addEventListener(name,handler){events.set(id+':'+name,handler);}};
   elements.set(id,n);
  }
  return elements.get(id);
 }
 const document={getElementById:node,body:{classList:{add(){},remove(){}}},readyState:'complete'};
 const window={BASI18n:{locale:'pt'},addEventListener(){},BASCommunityOnline:{
   available:()=>true,state:()=>({authenticated:true,user:author}),
   gallery:async()=>({items:[{...owned,handle:author.handle,display_name:'Stella'}]}),
   ownedAnimations:async()=>({animations:[owned]}),drafts:async()=>({drafts:[]}),
   media:async()=>{throw Error('No avatar stub');},
   normalizeTags:(str)=>str.split(',').map(s=>s.trim()).filter(Boolean),
   proposeRevision:async(id,meta,file)=>{calls.push(['edit',id,meta,file]);return {status:'pending_review'};},
   withdrawAnimation:async(id)=>{calls.push(['remove',id]);return {status:'removed'};},
   cancelRevision:async(id)=>{calls.push(['cancel',id]);return {status:'cancelled'};}
 }};
 const context={window,document,Blob,FormData,URL,Promise,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(root,'js/community-labels.js'),'utf8'),context);
 vm.runInNewContext(fs.readFileSync(path.join(root,'js/community-live.js'),'utf8'),context);
 function click(action,id=''){
  const hit={dataset:{cAction:action,id},classList:{contains:()=>false},
   closest:()=>hit};
  return window.BASCommunityLive.handle({target:hit});
 }
 return {window,document,node,click,calls,owned};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('the real owner profile exposes safe actions and the selected publication opens detail',async()=>{
 const h=makeUI();
 h.window.BASCommunityLive.showProfile();await flush();
 let html=h.node('bas-c-view').innerHTML;
 assert.match(html,/Yonkgor Test/);assert.match(html,/Editar animação/);
 assert.match(html,/Excluir animação/);assert.match(html,/data-c-action="open-owned"/);
 h.click('open-owned',ID);
 html=h.node('bas-c-view').innerHTML;
 assert.match(html,/Yonkgor Test/);assert.match(html,/data-c-action="edit-animation"/);
 assert.match(html,/data-c-action="remove-animation"/);
});
test('owner edit form clearly requires new review and can leave ZIP unchanged',async()=>{
 const h=makeUI();h.window.BASCommunityLive.showProfile();await flush();
 h.click('edit-animation',ID);
 let html=h.node('bas-c-view').innerHTML;
 assert.match(html,/Solicitar edição/);assert.match(html,/trocar|arquivo|ZIP/i);
 assert.match(html,/aprovaç/);
 h.node('bas-owner-title').value='Yonkgor Atualizado';
 h.node('bas-owner-summary').value='Updated description';
 h.node('bas-owner-credit').value='Stella';
 h.node('bas-owner-tag-input').value='';
 h.node('bas-owner-license').value='CC-BY-4.0';
 h.node('bas-owner-rights').checked=true;
 assert.equal(h.window.BASCommunityLive.onSubmit({target:{id:'bas-owner-edit-form'},preventDefault(){}}),true);
 await flush();
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0][0],'edit');assert.equal(h.calls[0][1],ID);
 assert.equal(h.calls[0][2].title,'Yonkgor Atualizado');assert.equal(h.calls[0][3],null);
});
test('withdrawal is never dispatched before explicit native-BAS confirmation',async()=>{
 const h=makeUI();h.window.BASCommunityLive.showProfile();await flush();
 h.click('remove-animation',ID);
 assert.equal(h.calls.length,0);
 assert.match(h.node('bas-c-modal-host').innerHTML,/Excluir esta animação/);
 assert.match(h.node('bas-c-modal-host').innerHTML,/Sim, excluir/);
 h.click('modal-close');assert.equal(h.calls.length,0);
 h.click('remove-animation',ID);h.click('modal-remove');await flush();
 assert.deepEqual(h.calls,[['remove',ID]]);
});
test('pending owner revision can be cancelled but cannot open duplicate edit form',async()=>{
 const h=makeUI({pending:true});h.window.BASCommunityLive.showProfile();await flush();
 assert.match(h.node('bas-c-view').innerHTML,/Edição aguardando aprovação/);
 assert.doesNotMatch(h.node('bas-c-view').innerHTML,/data-c-action="edit-animation"/);
 h.click('cancel-owner-edit',EDIT);await flush();
 assert.deepEqual(h.calls,[['cancel',EDIT]]);
});
