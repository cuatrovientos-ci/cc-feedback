'use strict';
(function (root) {
  const competencies = ['Innovación', 'Emprendimiento', 'Trabajo en equipo', 'Comunicación oral', 'Comunicación escrita', 'Competencia digital', 'Adaptación al entorno', 'Autonomía', 'Responsabilidad'];
  const normalize = value => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function parseTSV(input) {
    if (input.length > 100000) throw new Error('La entrada supera el límite de 100.000 caracteres.');
    const rows = []; let row = [], cell = '', quoted = false, closed = false;
    input = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (quoted) {
        if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') { quoted = false; closed = true; }
        else cell += ch;
      } else if (ch === '\t' || ch === '\n') {
        row.push(cell.trim()); cell = ''; closed = false;
        if (ch === '\n') { rows.push(row); row = []; }
      } else if (ch === '"' && cell === '' && !closed) quoted = true;
      else {
        if (closed || ch === '"') throw new Error('Revisa las comillas del bloque copiado.');
        cell += ch;
      }
    }
    if (quoted) throw new Error('Hay una celda con comillas sin cerrar.');
    row.push(cell.trim()); rows.push(row);
    return rows.filter(r => r.some(Boolean));
  }

  const groups = ['Innovación y emprendimiento', 'Trabajo en equipo', 'Capacidad comunicativa', 'Competencia digital', 'Adaptación al entorno', 'Autonomía y responsabilidad'];
  const allNames = [...new Set([...competencies,...groups])];
  function header(value) {
    const n=normalize(value).replace(/^[1-6]\.\s*/, '');
    if (['nombre','nombre del estudiante','student name','alumno','alumna'].includes(n)) return 'name';
    if (['email','correo','correo electronico','e-mail'].includes(n)) return 'email';
    if (['total','nota final'].includes(n)) return 'total';
    const generic=/^competency ([1-6]) level$/.exec(n);
    if(generic) return groups[Number(generic[1])-1];
    return allNames.find(name=>normalize(name)===n) || null;
  }
  function grade(value) {
    if (!/^(?:[0-9](?:[.,][0-9]{1,2})?|10(?:[.,]0{1,2})?)$/.test(value)) throw new Error('Usa notas numéricas entre 0 y 10 (hasta dos decimales). No se admite texto libre.');
    return Number(value.replace(',','.'));
  }
  function parseStudents(input) {
    if(input.length>100000) throw new Error('La entrada supera el límite de 100.000 caracteres.');
    let rows;
    if(input.includes('\t')) rows=parseTSV(input);
    else rows=input.replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>line.trim()).map(line=>{
      const tokens=line.trim().split(/\s+/); const numbers=[];
      while(tokens.length && /^[0-9]+(?:[.,][0-9]+)?$/.test(tokens[tokens.length-1])) numbers.unshift(tokens.pop());
      if(numbers.length<6||numbers.length>7) throw new Error('Sin cabecera, introduce nombre y seis notas, con total opcional. Usa tabulaciones para separar columnas con cabecera.');
      const email=tokens[tokens.length-1]?.includes('@')?tokens.pop():null;
      return [tokens.join(' '),...(email?[email]:[]),...numbers];
    });
    if(!rows.length) throw new Error('Introduce al menos una persona.');
    const firstHeaders=rows[0].map(header);
    const hasHeader=firstHeaders.some(h=>allNames.includes(h));
    let headers;
    if(hasHeader){
      headers=firstHeaders;rows.shift();
      if(headers.includes(null)||new Set(headers).size!==headers.length) throw new Error('Cabeceras desconocidas o duplicadas. No se envía ninguna fila.');
    }else{
      // Canonical positional schema, reconstructed for every row; no raw text reaches AI.
      headers=['name','email',...groups,'total'];
      rows=rows.map(row=>{
        const cells=[...row];
        const numericOnly=cells.every(c=>/^[0-9]+(?:[.,][0-9]+)?$/.test(c));
        const name=numericOnly?'':cells.shift();
        const email=cells[0]?.includes('@')?cells.shift():'';
        if(cells.length!==6&&cells.length!==7)throw new Error('Sin cabecera se requieren seis competencias y, opcionalmente, Total.');
        return [name,email,...cells.slice(0,6),cells.length===7?cells[6]:''];
      });
    }
    if(rows.length<1 || rows.length>100) throw new Error('Incluye entre 1 y 100 personas.');
    const ni=headers.indexOf('name'),ei=headers.indexOf('email'),ti=headers.indexOf('total');
    const fields=headers.map((name,index)=>({name,index})).filter(f=>allNames.includes(f.name));
    if(!fields.length) throw new Error('Incluye al menos una competencia reconocida.');
    const seen=new Set();
    return rows.map((row,i)=>{
      if(row.length!==headers.length) throw new Error(`Fila ${i+2}: número de columnas incorrecto.`);
      const name=(ni<0?'':row[ni])||`Alumno${i+1}`,email=ei<0?'':row[ei];
      if(!name||name.length>120||/[\x00-\x1f\x7f]/.test(name)) throw new Error(`Fila ${i+2}: nombre inválido.`);
      if(email && (email.length>254||!/^[^\s@<>,;"?&=]+@[^\s@<>,;"?&=]+\.[^\s@<>,;"?&=]+$/.test(email)||seen.has(email.toLowerCase()))) throw new Error(`Fila ${i+2}: correo inválido o repetido.`);
      if(email) seen.add(email.toLowerCase());
      const values=fields.filter(f=>row[f.index]!=='').map(f=>({competencia:f.name,valor:grade(row[f.index])}));
      if(!values.length) throw new Error(`Fila ${i+2}: no hay competencias evaluadas.`);
      return {name,email:email||`alumno${i+1}@example.invalid`,emailExample:!email,total:ti>=0&&row[ti]!==''?grade(row[ti]):null,values};
    });
  }
  function prepare(students) {
    const identities=new Map();
    const records=students.map(student=>{
      const id=globalThis.crypto.randomUUID(); identities.set(id,student);
      return {id,competencias:student.values.map(c=>({competencia:c.competencia,valor:c.valor}))};
    });
    return {identities,records};
  }
  function validateRecords(records) {
    if(!Array.isArray(records)||!records.length||records.length>100) throw new Error('Petición inválida.');
    const ids=new Set();
    return records.map(r=>{
      if(!r||typeof r.id!=='string'||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(r.id)||ids.has(r.id)||!Array.isArray(r.competencias)||!r.competencias.length||r.competencias.length>allNames.length) throw new Error('Petición inválida.');
      ids.add(r.id);const names=new Set();
      return {id:r.id,competencias:r.competencias.map(c=>{
        if(!c||!allNames.includes(c.competencia)||names.has(c.competencia)) throw new Error('Competencia inválida.');
        names.add(c.competencia);
        const value=grade(String(c.valor));
        return {competencia:c.competencia,valor:value};
      })};
    });
  }
  function prompt(records,rubrics) {
    return 'Redacta retroalimentación educativa constructiva en español, con recomendaciones prácticas personalizadas a los valores de cada registro. Son códigos temporales, no nombres. No inventes identidades, correos, notas, diagnósticos ni información personal. Las notas numéricas son datos observados: no las conviertas a niveles cuando la correspondencia no sea explícita. No calcules nota final. Usa las rúbricas como orientación, con lenguaje respetuoso. Devuelve SOLO un array JSON con un elemento por id: {"id":"...","intro":"...","competencias_evaluadas":[{"nombre_competencia":"cabecera exacta","rubrica":"valoración","recomendaciones":"consejos concretos"}],"conclusion":"cierre motivador"}. Devuelve exactamente las competencias recibidas, y todos los ids una vez. No incluyas enlaces.\nRúbricas: '+JSON.stringify(rubrics)+'\nRegistros: '+JSON.stringify(validateRecords(records));
  }
  function response(raw,records) {
    if(typeof raw!=='string'||raw.length>500000) throw new Error('Respuesta inválida.');
    const parsed=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
    if(!Array.isArray(parsed)||parsed.length!==records.length) throw new Error('Respuesta incompleta.');
    const expected=new Map(records.map(r=>[r.id,r])),seen=new Set();
    const text=t=>{if(typeof t!=='string'||!t.trim()||t.length>4000)throw new Error('Texto inválido.');return t;};
    return parsed.map(p=>{
      if(!p||!expected.has(p.id)||seen.has(p.id))throw new Error('Código desconocido o repetido.');
      seen.add(p.id);const record=expected.get(p.id),names=new Set();
      if(!Array.isArray(p.competencias_evaluadas)||p.competencias_evaluadas.length!==record.competencias.length)throw new Error('Competencias incompletas.');
      const values=p.competencias_evaluadas.map(c=>{
        if(!c||!record.competencias.some(v=>v.competencia===c.nombre_competencia)||names.has(c.nombre_competencia))throw new Error('Competencia inesperada.');
        names.add(c.nombre_competencia);
        return {nombre_competencia:c.nombre_competencia,rubrica:text(c.rubrica),recomendaciones:text(c.recomendaciones)};
      });
      return {id:p.id,intro:text(p.intro),competencias_evaluadas:values,conclusion:text(p.conclusion)};
    });
  }
  const api={competencies,parseTSV,parseStudents,prepare,validateRecords,prompt,response};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Feedback=Object.freeze(api);
})(globalThis);
