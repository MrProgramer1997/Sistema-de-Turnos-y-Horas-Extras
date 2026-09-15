// Fase 7.3. Motor puro: horarios individuales, sin modificar el catalogo.
export function minutosHora(v) {
  const m=/^(\d{2}):(\d{2})(?::00)?$/.exec(String(v??''));
  return m&&+m[1]<24&&+m[2]<60 ? +m[1]*60 + +m[2] : null;
}
export function horaMinutos(v) { const n=((Math.round(v)%1440)+1440)%1440;return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; }
export function fechaMas(d,n) { const a=new Date(`${d}T00:00:00Z`);if(!Number.isFinite(a.getTime())||a.toISOString().slice(0,10)!==d)throw Error('Fecha no v\u00e1lida');a.setUTCDate(a.getUTCDate()+n);return a.toISOString().slice(0,10); }
export function textoMinutos(n){return `${Math.floor(Math.abs(n)/60)} h ${Math.abs(n)%60} min`;}
export function esExternoChef(p={}){return !!p.externo_id||/extern|extra|eventual/i.test(p.tipo_personal||'');}
export function horarioAsignado(r){if(r?.horario_asignado==null)return null;const h=r.horario_asignado;if(Number(h.version)!==1)throw Error('Versi\u00f3n de horario no compatible. Actualiza el m\u00f3dulo.');return h;}
export function codigoAsignado(r,base={},bloque=1){
  const h=horarioAsignado(r);if(!h)return base;
  return {...base,hora_inicio:h[`inicio${bloque}`]||null,hora_fin:h[`fin${bloque}`]||null,
    catalogo_no_disponible:false,origen_horario:'asignacion_individual'};
}
export function crearHorario(c1={},c2=null,op={}){
  const norm=v=>v?String(v).slice(0,5):null;
  const h={version:1,inicio1:norm(c1.hora_inicio),fin1:norm(c1.hora_fin),inicio2:norm(c2?.hora_inicio),fin2:norm(c2?.hora_fin),
    descanso_minutos:c1.hora_inicio?30:0,flexible:!!op.flexible,origen:op.origen||'plantilla'};
  analizarHorario(h);return h;
}
export function analizarHorario(h){
  if(!h||Number(h.version)!==1)throw Error('Horario individual no v\u00e1lido');
  let bloques=[],brutos=0,primero=null,anterior=null;
  for(const n of [1,2]){
    const a=h[`inicio${n}`],b=h[`fin${n}`];if(!a&&!b)continue;
    let ini=minutosHora(a),fin=minutosHora(b);
    if(ini===null||fin===null)throw Error(`Completa entrada y salida del bloque ${n}`);
    if(n===2&&primero===null)throw Error('El segundo bloque necesita un primero');
    if(ini===fin)throw Error('Entrada y salida iguales: no se asumen 24 horas');
    if(n===2&&ini<primero){ini+=1440;fin+=1440;}
    if(fin<ini)fin+=1440;
    if(anterior!==null&&ini<anterior)throw Error('Los bloques se superponen');
    if(fin-ini>720)throw Error('Un bloque supera 12 horas; revisa el horario');
    if(primero===null)primero=ini;
    if(fin-primero>=1440)throw Error('Una jornada no puede abarcar 24 horas');
    anterior=fin;brutos+=fin-ini;bloques.push({n,inicio:ini,fin,minutos:fin-ini,diaInicio:Math.floor(ini/1440),diaFin:Math.floor(fin/1440)});
  }
  const descanso=Number(h.descanso_minutos);
  if(descanso!==(brutos?30:0)||descanso>brutos)throw Error('Se descuentan 30 minutos una sola vez por jornada');
  const netos=brutos-descanso;
  if(h.flexible&&netos>540)throw Error('La distribuci\u00f3n flexible permite hasta 9 horas netas por d\u00eda');
  return {bloques,brutos,descanso,netos};
}
export function resumenSemanal(rows,objetivo=2520){
  let total=0;const errores=[],avisos=[],intervalos=[];
  for(const r of rows){
    if(!r.horario)continue;
    try{const a=analizarHorario(r.horario);total+=a.netos;
      const base=Date.parse(`${r.fecha}T00:00:00Z`)/60000;
      for(const b of a.bloques){intervalos.push({fecha:r.fecha,inicio:base+b.inicio,fin:base+b.fin});
        if(r.sinDomingo){for(let m=b.inicio;m<b.fin;m+=1)if(new Date((base+m)*60000).getUTCDay()===0){avisos.push(`${r.fecha}: el turno ocupa parte del domingo`);break;}}
      }
      if(a.netos>540)avisos.push(`${r.fecha}: supera 9 h netas; revisar jornada y extras`);
    }catch(e){errores.push(`${r.fecha}: ${e.message}`);}
  }
  intervalos.sort((a,b)=>a.inicio-b.inicio);
  for(let i=1;i<intervalos.length;i++)if(intervalos[i].inicio<intervalos[i-1].fin)errores.push(`Hay cruce entre las jornadas de ${intervalos[i-1].fecha} y ${intervalos[i].fecha}`);
  return {total,objetivo,diferencia:objetivo-total,errores,avisos:[...new Set(avisos)]};
}
export function proponerDistribucion(rows,objetivo=2520){
  if(rows.some(x=>['INC','V','VAC','DF','DFAM','DC','CUMP','PNR','CAL','LUTO','MATR'].includes(String(x.datos?.codigo_turno||'').toUpperCase())))throw Error('La semana contiene una novedad. No se recuperan esas horas autom\u00e1ticamente; revisa la meta con Bienestar.');
  const result=JSON.parse(JSON.stringify(rows)),r=resumenSemanal(result,objetivo);
  if(r.errores.length)throw Error(r.errores[0]);
  if(r.diferencia<0)throw Error('La semana ya supera la meta. Ajusta los horarios; no se recortan autom\u00e1ticamente.');
  const validos=result.filter(x=>x.ajustable&&!x.bloqueado&&x.horario&&analizarHorario(x.horario).netos>0);
  if(r.diferencia&&!validos.length)throw Error('Selecciona al menos un d\u00eda laborable para distribuir');
  let faltan=r.diferencia;
  while(faltan>0){let avance=false;for(const x of validos){if(!faltan)break;const a=analizarHorario({...x.horario,flexible:false});const margen=540-a.netos;if(margen<=0)continue;
    const ultimo=a.bloques.at(-1),inc=Math.min(5,faltan,margen),h={...x.horario,origen:'distribucion_semanal',flexible:true};h[`fin${ultimo.n}`]=horaMinutos(ultimo.fin+inc);
    try{analizarHorario(h);}catch{continue;}
    x.horario=h;faltan-=inc;avance=true;
  }if(!avance)throw Error('No caben las horas faltantes en los d\u00edas elegidos sin superar el l\u00edmite diario. Ajusta la selecci\u00f3n.');}
  for(const x of result)if(x.horario&&analizarHorario(x.horario).netos>0&&!x.bloqueado)x.horario={...x.horario,flexible:true,origen:'distribucion_semanal'};
  const final=resumenSemanal(result,objetivo);if(final.errores.length)throw Error(final.errores[0]);if(final.avisos.some(x=>x.includes('domingo')))throw Error(final.avisos.find(x=>x.includes('domingo')));
  return result;
}
export function cambioParaRPC(personaId,r,datos){return {fecha:r.fecha,esperado_id:r.id||null,esperado_updated_at:r.updated_at||null,datos:{...datos,horario_asignado:datos.horario_asignado}};}
