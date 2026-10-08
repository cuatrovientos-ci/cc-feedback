'use strict';
const form=document.getElementById('main-form'),input=document.getElementById('data'),list=document.getElementById('results'),status=document.getElementById('status'),results=document.getElementById('results-container'),loading=document.getElementById('loading-overlay');
let pendingInput='',elapsedTimer,started=0;
let identities=new Map(),records=[],request=null,last=Date.now(),timeout;
const parentOrigin=new URL(document.referrer||location.href).origin;
function send(data){parent.postMessage(data,parentOrigin);}
function reset(message=''){
  last=Date.now();clearInterval(elapsedTimer);pendingInput='';form.setAttribute('aria-busy','false');clearTimeout(timeout);request=null;identities.clear();records=[];input.value='';list.querySelectorAll('textarea').forEach(t=>t.value='');list.replaceChildren();results.style.display='none';loading.style.display='none';form.style.display='block';status.textContent=message;send({type:'cancel'});
}
const failures={not_connected:'Primero pulsa Acceder a Puter / Gemini en el botón superior y completa el acceso.',busy:'Ya hay una generación en curso. Espera o cancélala.',auth:'La sesión de Puter no es válida. Vuelve a acceder con el botón superior.',quota:'Puter ha indicado un límite de uso o saldo. Revisa tu cuenta antes de volver a generar.',model:'El modelo seleccionado no está disponible para esta petición. Prueba el otro modelo.',network:'Se ha interrumpido la conexión. Comprueba la red y vuelve a intentarlo.',provider:'Puter o el modelo no han completado la petición. Puedes intentarlo de nuevo o probar el otro modelo.',invalid_response:'La IA devolvió una respuesta incompleta o con un formato que no coincide con los alumnos. No se han preparado correos. Prueba con menos filas o con el otro modelo.',timeout:'Se ha agotado el tiempo de espera. La petición anterior podría seguir procesándose en el proveedor.'};
function fail(code){
  const retained=pendingInput;const safe=Object.hasOwn(failures,code)?code:'provider';
  reset(failures[safe]+' [GENERACION_'+safe.toUpperCase()+']');input.value=retained;
  status.className='alert alert-danger';status.setAttribute('role','alert');status.tabIndex=-1;status.focus();status.scrollIntoView({block:'center'});
}
function progress(stage){
  document.getElementById('progress-detail').textContent=({waiting:'Esperando la respuesta de Gemini…',receiving:'Recibiendo las recomendaciones…',validating:'Comprobando que cada respuesta corresponde a su alumno…'})[stage]||'Generando recomendaciones…';
}
function expire(){if(Date.now()-last>=900000)reset('Datos retirados por inactividad.');}
['pointerdown','keydown','input'].forEach(type=>document.addEventListener(type,()=>{expire();last=Date.now();},true));
setInterval(expire,15000);document.addEventListener('visibilitychange',expire);window.addEventListener('pagehide',()=>reset());window.addEventListener('pageshow',e=>{if(e.persisted)reset();});
['clear','erase','cancel-loading'].forEach(id=>document.getElementById(id).addEventListener('click',()=>reset('Datos retirados. Las peticiones ya enviadas no se pueden retirar del proveedor.')));
document.getElementById('example').addEventListener('click',()=>{reset();input.value='Alumno1 5 5 6 4 6 7\nAlumno2 6 5 4 3 4 5';});
function node(tag,text,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
form.addEventListener('submit',event=>{
  event.preventDefault();
  if(parent===window){status.textContent='Abre index.html para trabajar en la zona aislada.';return;}
  try{
    pendingInput=input.value;status.className='';status.setAttribute('role','status');
    const batch=Feedback.prepare(Feedback.parseStudents(input.value));
    identities=batch.identities;records=batch.records;request=crypto.randomUUID();
    send({type:'generate',request,records,model:document.getElementById('form-select').value});
    input.value='';form.style.display='none';loading.style.display='flex';status.textContent='';form.setAttribute('aria-busy','true');progress('waiting');started=Date.now();document.getElementById('elapsed').textContent='Tiempo transcurrido: 0 s';elapsedTimer=setInterval(()=>{document.getElementById('elapsed').textContent=`Tiempo transcurrido: ${Math.floor((Date.now()-started)/1000)} s`;},1000);
    timeout=setTimeout(()=>fail('timeout'),180000);
  }catch{status.textContent='Revisa cabeceras, columnas, correos y valores. Sin cabecera, escribe seis notas, con nombre opcional numéricas 0–10, con total opcional; no se ha enviado esta tabla.';}
});
window.addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==parentOrigin||!request||event.data?.request!==request)return;
  expire();if(!request)return;
  const message=event.data;
  if(message.type==='progress'){progress(message.stage);return;}
  if(message.type==='failure'){fail(message.code);return;}
  if(message.type!=='result')return;
  try{
    const responses=Feedback.response(JSON.stringify(message.result),records);
    clearTimeout(timeout);clearInterval(elapsedTimer);pendingInput='';form.setAttribute('aria-busy','false');loading.style.display='none';results.style.display='block';
    for(const response of responses){
      const person=identities.get(response.id);
      let body=`Hola, ${person.name}:\n\n${response.intro}\n\n`;
      for(const c of response.competencias_evaluadas){const value=person.values.find(v=>v.competencia===c.nombre_competencia).valor;body+=`${c.nombre_competencia}\nCalificación: ${value}\nValoración: ${c.rubrica}\nSugerencia: ${c.recomendaciones}\n\n`;}
      if(person.total!==null)body+=`Nota final introducida por el docente: ${person.total}\n\n`;
      body+=`${response.conclusion}\n\nAtentamente,\nEl Equipo Docente de Cuatrovientos.\n\nTexto elaborado con apoyo de inteligencia artificial y revisado por tu docente.`;
      const card=node('article','','list-group-item p-3 mb-3'),heading=node('h3',person.name,'h5'),email=node('p',person.email+(person.emailExample?' (correo de ejemplo: sustituir en Gmail antes de enviar)':''));
      const details=node('details','','draft-details'),summary=node('summary'),identity=node('span','','draft-identity'),hint=node('span','Revisar borrador','draft-toggle');identity.append(heading,email);summary.append(identity,hint);details.append(summary);details.addEventListener('toggle',()=>{hint.textContent=details.open?'Cerrar borrador':'Revisar borrador';});
      const label=node('label','Revisa y adapta el borrador:');const area=node('textarea','','result-text form-control');area.value=body;area.spellcheck=false;area.autocomplete='off';area.id='draft-'+list.childElementCount;label.htmlFor=area.id;
      const review=node('label','','d-block my-3'),check=node('input');check.type='checkbox';review.append(check,document.createTextNode(' He revisado el contenido, las notas y el destinatario.'));
      const gmail=node('button','Generar Gmail','btn btn-outline-danger');gmail.type='button';gmail.disabled=true;
      check.addEventListener('change',()=>gmail.disabled=!check.checked||!person.email||!area.value.trim());
      area.addEventListener('input',()=>{check.checked=false;gmail.disabled=true;});
      gmail.addEventListener('click',()=>{
        expire();if(!card.isConnected||!check.checked||!person.email)return;
        const url=new URL('https://mail.google.com/mail/');url.search=new URLSearchParams({view:'cm',fs:'1',to:person.email,su:'Retroalimentación: Competencias Clave',body:area.value});
        window.open(url.href,'_blank','noopener,noreferrer');
      });
      details.append(label,area,review,gmail,node('p','Al abrir Gmail, el texto y el destinatario se incluyen en su URL y pasan a Google. Comprueba la cuenta institucional y revisa antes de enviar.','small mt-2'));card.append(details);list.append(card);
    }
    request=null;records=[];identities.clear();status.textContent='Recomendaciones preparadas. Revisa cada borrador antes de abrir Gmail.';
  }catch{fail('invalid_response');}
});
