'use strict';
const frame=document.getElementById('editor');
const connection=document.getElementById('connection');
const models=new Set(['google/gemini-2.5-flash','google/gemini-3-flash-preview']);
let ready=false,busy=false,epoch=0,loading;
const button=document.getElementById('connect'),label=document.getElementById('connect-label'),spinner=document.getElementById('connect-spinner');
function buttonState(text,working=false){label.textContent=text;spinner.hidden=!working;button.disabled=working;button.setAttribute('aria-busy',String(working));}
function deadline(promise,ms){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject({code:'timeout'}),ms);})]).finally(()=>clearTimeout(timer));}
function failureCode(error){
  const code=String(error?.error?.code||error?.error||error?.code||'').toLowerCase();
  if(['popup_blocked','auth_window_closed','unsupported_origin','timeout'].includes(code))return code;
  if(/auth|unauthorized|token/.test(code))return 'auth';
  if(/rate|quota|limit|fund|credit|balance/.test(code))return 'quota';
  if(/model|not_found/.test(code))return 'model';
  if(/network|fetch|connection/.test(code))return 'network';
  return 'provider';
}
const authErrors={popup_blocked:'El navegador ha bloqueado la ventana de acceso. Permite las ventanas emergentes y pulsa Acceder.',auth_window_closed:'Se cerró la ventana de acceso sin completar la sesión. Pulsa Acceder para intentarlo de nuevo.',unsupported_origin:'Puter no admite este origen. Abre la web publicada por HTTPS.',timeout:'El acceso está tardando demasiado. Cierra la ventana anterior y vuelve a pulsar Acceder.'};
function loadSDK(){
  if(!loading) loading=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://js.puter.com/v2/';
    const timer=setTimeout(()=>{loading=null;script.remove();reject({code:'timeout'});},20000);
    script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);loading=null;script.remove();reject({code:'network'});};document.head.append(script);
  });return loading;
}
button.addEventListener('click',async()=>{
  connection.hidden=true;
  const loadingSDK=!globalThis.puter;
  try{
    buttonState(loadingSDK?'Cargando servicio…':'Accediendo…',true);
    if(loadingSDK){await loadSDK();buttonState('Acceder a Puter / Gemini');return;}
    await deadline(puter.auth.signIn(),60000);ready=true;buttonState('Conectado con Puter / Gemini');
  }catch(error){
    ready=false;const code=failureCode(error);buttonState(globalThis.puter?'Acceder a Puter / Gemini':'Reintentar conexión');
    connection.textContent=(authErrors[code]||'No se pudo conectar con Puter. Comprueba la conexión y vuelve a intentarlo.')+' [ACCESO_'+code.toUpperCase()+']';connection.hidden=false;
  }
});
frame.addEventListener('load',()=>{epoch++;busy=false;});
function send(message){frame.contentWindow.postMessage(message,'*');}
window.addEventListener('message',async event=>{
  if(event.source!==frame.contentWindow||event.origin!=='null')return;
  const data=event.data;
  if(data?.type==='cancel'){epoch++;busy=false;return;}
  if(data?.type!=='generate'||typeof data.request!=='string'||!models.has(data.model))return;
  if(!ready||busy){send({type:'failure',request:data.request,code:!ready?'not_connected':'busy'});return;}
  const run=++epoch;busy=true;let stage='request';
  send({type:'progress',request:data.request,stage:'waiting'});
  try{
    const records=Feedback.validateRecords(data.records);
    const stream=await puter.ai.chat(Feedback.prompt(records,RUBRICS),{model:data.model,stream:true,responseMimeType:'application/json'});
    let raw='';
    for await(const part of stream){
      if(run!==epoch)return;
      if(part?.error)throw part.error;
      if(typeof part?.text==='string' && part.text){raw+=part.text;send({type:'progress',request:data.request,stage:'receiving'});}
      if(raw.length>500000)throw new Error('Limit');
    }
    stage='response';send({type:'progress',request:data.request,stage:'validating'});
    const result=Feedback.response(raw,records);
    if(run===epoch)send({type:'result',request:data.request,result});
  }catch(error){if(run===epoch)send({type:'failure',request:data.request,code:stage==='response'?'invalid_response':failureCode(error)});}
  finally{if(run===epoch)busy=false;}
});
