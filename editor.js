'use strict';
const form=document.getElementById('main-form'),input=document.getElementById('data'),list=document.getElementById('results'),status=document.getElementById('status'),results=document.getElementById('results-container'),loading=document.getElementById('loading-overlay');
let identities=new Map(),records=[],request=null,last=Date.now(),timeout;
const parentOrigin=new URL(document.referrer||location.href).origin;
function send(data){parent.postMessage(data,parentOrigin);}
function reset(message=''){
  last=Date.now();clearTimeout(timeout);request=null;identities.clear();records=[];input.value='';list.querySelectorAll('textarea').forEach(t=>t.value='');list.replaceChildren();results.style.display='none';loading.style.display='none';form.style.display='block';status.textContent=message;send({type:'cancel'});
}
function expire(){if(Date.now()-last>=900000)reset('Datos retirados por inactividad.');}
['pointerdown','keydown','input'].forEach(type=>document.addEventListener(type,()=>{expire();last=Date.now();},true));
setInterval(expire,15000);document.addEventListener('visibilitychange',expire);window.addEventListener('pagehide',()=>reset());window.addEventListener('pageshow',e=>{if(e.persisted)reset();});
['clear','erase'].forEach(id=>document.getElementById(id).addEventListener('click',()=>reset('Datos retirados. Las peticiones ya enviadas no se pueden retirar del proveedor.')));
document.getElementById('example').addEventListener('click',()=>{reset();input.value='Nombre\tEmail\tCompetency 1 Level\tCompetency 2 Level\tTotal\nPersona ficticia\tpersona@example.invalid\t7,5\tNivel 3\t8';});
function node(tag,text,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
form.addEventListener('submit',event=>{
  event.preventDefault();
  if(parent===window){status.textContent='Abre index.html para trabajar en la zona aislada.';return;}
  try{
    const batch=Feedback.prepare(Feedback.parseStudents(input.value));
    identities=batch.identities;records=batch.records;request=crypto.randomUUID();
    send({type:'generate',request,records,model:document.getElementById('form-select').value});
    input.value='';form.style.display='none';loading.style.display='block';status.textContent='';
    timeout=setTimeout(()=>reset('Tiempo de espera agotado. Si vuelves a generar, se hará una nueva petición.'),180000);
  }catch{status.textContent='Revisa cabeceras, columnas, correos y valores. Solo se admiten competencias reconocidas, notas 0–10 o Nivel 1–4; no se ha enviado esta tabla.';}
});
window.addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==parentOrigin||!request||event.data?.request!==request)return;
  expire();if(!request)return;
  const message=event.data;
  if(message.type==='failure'){reset('No se han generado informes. Comprueba la conexión con Puter y vuelve a intentarlo con datos ficticios.');return;}
  if(message.type!=='result')return;
  try{
    const responses=Feedback.response(JSON.stringify(message.result),records);
    clearTimeout(timeout);loading.style.display='none';results.style.display='block';
    for(const response of responses){
      const person=identities.get(response.id);
      let body=`Hola, ${person.name}:\n\n${response.intro}\n\n`;
      for(const c of response.competencias_evaluadas){const value=person.values.find(v=>v.competencia===c.nombre_competencia).valor;body+=`${c.nombre_competencia}\nCalificación: ${value}\nValoración: ${c.rubrica}\nSugerencia: ${c.recomendaciones}\n\n`;}
      if(person.total!==null)body+=`Nota final introducida por el docente: ${person.total}\n\n`;
      body+=`${response.conclusion}\n\nAtentamente,\nEl Equipo Docente de Cuatrovientos.\n\nTexto elaborado con apoyo de inteligencia artificial y revisado por tu docente.`;
      const card=node('article','','list-group-item p-3 mb-3'),heading=node('h3',person.name,'h5'),email=node('p',person.email||'Sin correo: copia el texto al canal institucional.');
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
      card.append(heading,email,label,area,review,gmail,node('p','Al abrir Gmail, el texto y el destinatario se incluyen en su URL y pasan a Google. Comprueba la cuenta institucional y revisa antes de enviar.','small mt-2'));list.append(card);
    }
    request=null;records=[];identities.clear();status.textContent='Recomendaciones preparadas. Revisa cada borrador antes de abrir Gmail.';
  }catch{reset('La respuesta de la IA no coincide con los registros. No se han preparado correos.');}
});
