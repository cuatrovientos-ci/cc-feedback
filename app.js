'use strict';
const frame=document.getElementById('editor');
const connection=document.getElementById('connection');
const models=new Set(['google/gemini-2.5-flash','google/gemini-3-flash-preview']);
let ready=false,busy=false,epoch=0,loading;
function loadSDK(){
  if(!loading) loading=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://js.puter.com/v2/';
    script.onload=resolve;script.onerror=()=>{loading=null;script.remove();reject(new Error('SDK'));};document.head.append(script);
  });return loading;
}
// The provider script runs outside the opaque-origin frame holding identities.
// First click loads the SDK; a subsequent click signs in directly from the gesture.
document.getElementById('connect').addEventListener('click',async()=>{
  try{
    if(!globalThis.puter){await loadSDK();connection.textContent='Servicio cargado. Pulsa de nuevo para iniciar sesión.';return;}
    await puter.auth.signIn();ready=true;connection.textContent='Conectado. Puedes generar las recomendaciones.';
  }catch{ready=false;connection.textContent='No se pudo conectar. Comprueba la conexión y permite la ventana de acceso.';}
});
frame.addEventListener('load',()=>{epoch++;busy=false;});
function send(message){frame.contentWindow.postMessage(message,'*');}
window.addEventListener('message',async event=>{
  if(event.source!==frame.contentWindow||event.origin!=='null')return;
  const data=event.data;
  if(data?.type==='cancel'){epoch++;busy=false;return;}
  if(data?.type!=='generate'||typeof data.request!=='string'||!models.has(data.model))return;
  if(!ready||busy){send({type:'failure',request:data.request});return;}
  const run=++epoch;busy=true;
  try{
    const records=Feedback.validateRecords(data.records);
    const stream=await puter.ai.chat(Feedback.prompt(records,RUBRICS),{model:data.model,stream:true,responseMimeType:'application/json'});
    let raw='';
    for await(const part of stream){
      if(run!==epoch)return;
      if(typeof part?.text==='string')raw+=part.text;
      if(raw.length>500000)throw new Error('Limit');
    }
    const result=Feedback.response(raw,records);
    if(run===epoch)send({type:'result',request:data.request,result});
  }catch{if(run===epoch)send({type:'failure',request:data.request});}
  finally{if(run===epoch)busy=false;}
});
