// Payroll loading only. Business rules and authorization stay in the existing RPCs.
// Bounded parallel READS, adaptive slices and verified pagination. No repeated writes.
export const FUENTES_NOMINA = Object.freeze([
  ['marcas','consultar_marcaciones_nomina_v3','Marcaciones'],
  ['general','consultar_jornadas_generales_nomina_v3','Programaci\u00f3n general'],
  ['ayb','consultar_jornadas_ayb_nomina_v4','Programaci\u00f3n A&B y Chef'],
  ['inferidos','consultar_turnos_inferidos_nomina_v6','Turnos inferidos']
]);
const DIA = 86400000;
export function diasEntre(desde,hasta) {
  const parse = value => {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')) throw new Error('Selecciona las dos fechas.');
    const time=Date.parse(value+'T00:00:00Z');
    if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value) throw new Error('La fecha no es v\u00e1lida.');
    return time;
  };
  const a=parse(desde),b=parse(hasta);
  if(b<a) throw new Error('La fecha Hasta debe ser igual o posterior a Desde.');
  if((b-a)/DIA>365) throw new Error('Consulta como m\u00e1ximo 366 d\u00edas por carga. No se ha recortado tu selecci\u00f3n.');
  return Array.from({length:(b-a)/DIA+1},(_,i)=>new Date(a+i*DIA).toISOString().slice(0,10));
}
export function esTiempoAgotado(error) {
  return error?.code==='57014' && /statement timeout/i.test(error.message||'');
}
function cancelado(signal) { if(signal?.aborted) throw new DOMException('Consulta cancelada','AbortError'); }
function arrayValido(response, nombre) {
  if(response?.error) throw response.error;
  if(!Array.isArray(response?.data)) throw new Error(nombre+': respuesta no v\u00e1lida. No se sustituy\u00f3 por una lista vac\u00eda.');
  return response.data;
}
function contextualizar(error, fuente, desde, hasta) {
  if(error && typeof error==='object') {
    error.fuenteNomina=fuente; error.desdeNomina=desde;error.hastaNomina=hasta;
    return error;
  }
  const e=new Error(String(error));e.fuenteNomina=fuente;return e;
}

// Two independent reads at most. Scalar blocks run the expensive SQL once,
// without OFFSET pages or an additional exact-count execution.
export const PLAN_LECTURA = Object.freeze({marcas:28, general:28, ayb:28, inferidos:7});
const now = () => globalThis.performance?.now?.() ?? Date.now();
function enteroPositivo(value, label, max) {
  if(!Number.isSafeInteger(value)||value<1||value>max) throw new Error(label+': valor no valido.');
}
export async function leerPaginas(request,{nombre,args={},signal,onProgress=()=>{},pageSize=1000}) {
  enteroPositivo(pageSize,'Tamano de pagina',1000);
  const rows=[],seenPages=new Set(); let offset=0,total=null;
  for(let page=0;page<2000;page++) {
    cancelado(signal);
    const r=await request(nombre,args,{range:[offset,offset+pageSize-1],signal,read:true,count:page===0?'exact':undefined});
    cancelado(signal);
    const lote=arrayValido(r,nombre);
    if(page===0&&r.count!=null) {
      if(!Number.isSafeInteger(Number(r.count))||Number(r.count)<0) throw new Error(nombre+': conteo de filas no valido.');
      total=Number(r.count);
    }
    if(lote.length>pageSize) throw new Error(nombre+': el servidor no respeto la paginacion.');
    if(lote.length) {
      const firma=JSON.stringify(lote);
      if(seenPages.has(firma)) throw new Error(nombre+': pagina repetida. No se considera completa la lectura.');
      seenPages.add(firma);
    }
    rows.push(...lote); offset+=lote.length;
    onProgress({nombre,filas:offset,total,paginas:page+1});
    if(total!==null) {
      if(offset>total||(!lote.length&&offset<total)) throw new Error(nombre+': la paginacion no coincide con el conteo. Actualiza nuevamente.');
      if(offset===total) return rows;
    } else if(lote.length===0) {
      // A short page alone is NOT proof of completeness: the API may have a
      // cap smaller than pageSize. Continue until an actual empty page.
      return rows;
    }
  }
  throw new Error(nombre+': demasiadas paginas; la lectura no se considera completa.');
}
export async function leerPorTramos(request,{
  nombre,desde,hasta,signal,onProgress=()=>{},chunkDays=5,pageSize=1000,clock=now
}) {
  enteroPositivo(chunkDays,'Dias por tramo',31);
  const dias=diasEntre(desde,hasta);let terminados=0,tramoActual=chunkDays;
  const trozo=async fechas=>{
    cancelado(signal);
    const a=fechas[0],b=fechas.at(-1),inicio=clock();
    onProgress({nombre,desde:a,hasta:b,dias:terminados,totalDias:dias.length});
    try {
      const rows=await leerPaginas(request,{nombre,args:{p_fecha_desde:a,p_fecha_hasta:b},signal,pageSize});
      for(const row of rows) {
        const date=String((row?.jornada||row)?.fecha||'').slice(0,10);
        if(!date||date<a||date>b) throw new Error(nombre+': fila fuera del tramo solicitado.');
      }
      const ms=clock()-inicio;
      terminados+=fechas.length;
      // Do not keep sending large windows when this source is close to its
      // current server limit. This changes scheduling only, not calculations.
      if(ms>5500&&fechas.length>1) tramoActual=Math.min(tramoActual,Math.max(1,Math.floor(fechas.length/2)));
      onProgress({nombre,desde:a,hasta:b,dias:terminados,totalDias:dias.length,filas:rows.length,ms});
      return rows;
    } catch(e) {
      cancelado(signal);
      if(esTiempoAgotado(e)&&fechas.length>1) {
        tramoActual=Math.min(tramoActual,Math.max(1,Math.floor(fechas.length/2)));
        const mid=Math.ceil(fechas.length/2);
        onProgress({nombre,desde:a,hasta:b,reducido:true,dias:terminados,totalDias:dias.length});
        const left=await trozo(fechas.slice(0,mid));
        return left.concat(await trozo(fechas.slice(mid)));
      }
      throw contextualizar(e,nombre,a,b);
    }
  };
  const result=[];
  for(let i=0;i<dias.length;) {
    const fechas=dias.slice(i,i+tramoActual);
    result.push(...await trozo(fechas));i+=fechas.length;
  }
  return result;
}

// The response is a scalar envelope, not a PostgREST result-set page. Its nested
// rows and count are generated together. A small API row limit cannot silently
// turn 1,500 employee/days into 1,000 accepted rows.
export function validarBloqueNomina(data,fuente,desde,hasta) {
  if(!data||data.version!=='721'||data.fuente!==fuente||data.desde!==desde||data.hasta!==hasta||
     data.completa!==true||!Array.isArray(data.filas)||!Number.isSafeInteger(data.total)||data.total!==data.filas.length)
    throw new Error('Bloque de '+fuente+' incompleto o de otro periodo. No se habilitan decisiones.');
  for(const row of data.filas) {
    if(!row||typeof row!=='object'||typeof row.fecha!=='string'||
       !/^\d{4}-\d{2}-\d{2}$/.test(row.fecha)||row.fecha<desde||row.fecha>hasta||!String(row.cedula??'').trim())
      throw new Error('Fila no valida en el bloque de '+fuente+'.');
  }
  return data.filas.map(jornada=>({jornada}));
}
export async function leerBloquesNomina(request,{
  fuente,desde,hasta,signal,onProgress=()=>{},chunkDays=7,clock=now
}) {
  if(!FUENTES_NOMINA.some(([key])=>key===fuente))throw new Error('Fuente de nomina no valida.');
  enteroPositivo(chunkDays,'Dias por bloque',fuente==='inferidos'?7:32);
  const dias=diasEntre(desde,hasta),nombre='consultar_fuente_nomina_v721';
  let terminados=0,ancho=chunkDays;
  const trozo=async fechas=>{
    cancelado(signal);const a=fechas[0],b=fechas.at(-1),inicio=clock();
    onProgress({nombre,desde:a,hasta:b,dias:terminados,totalDias:dias.length});
    try {
      const r=await request(nombre,{p_fuente:fuente,p_desde:a,p_hasta:b},{signal,read:true});
      cancelado(signal);if(r?.error)throw r.error;
      const rows=validarBloqueNomina(r?.data,fuente,a,b),ms=clock()-inicio;
      if(ms>4500&&fechas.length>1)ancho=Math.min(ancho,Math.max(1,Math.floor(fechas.length/2)));
      terminados+=fechas.length;
      onProgress({nombre,desde:a,hasta:b,dias:terminados,totalDias:dias.length,filas:rows.length,ms});
      return rows;
    } catch(e) {
      cancelado(signal);
      // Only a confirmed SQL read timeout may be split. Do not replay writes,
      // authentication failures or unknown network acknowledgements.
      if(esTiempoAgotado(e)&&fechas.length>1) {
        ancho=Math.min(ancho,Math.max(1,Math.floor(fechas.length/2)));
        onProgress({nombre,desde:a,hasta:b,reducido:true,dias:terminados,totalDias:dias.length});
        const mid=Math.ceil(fechas.length/2);
        const left=await trozo(fechas.slice(0,mid));
        return left.concat(await trozo(fechas.slice(mid)));
      }
      throw contextualizar(e,nombre+' ('+fuente+')',a,b);
    }
  };
  const result=[];
  for(let i=0;i<dias.length;) {
    const fechas=dias.slice(i,i+ancho);result.push(...await trozo(fechas));i+=fechas.length;
  }
  return result;
}

export async function leerEvidenciasNomina(request,revisiones,{
  signal,chunkSize=80,onProgress=()=>{}
}={}) {
  enteroPositivo(chunkSize,'Jornadas por lote de evidencia',200);
  const clave=x=>String(x.cedula).trim()+'|'+String(x.fecha).slice(0,10);
  const pares=[...new Map(revisiones.map(r=>[clave(r),{cedula:String(r.cedula).trim(),fecha:String(r.fecha).slice(0,10)}])).values()]
    .sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.cedula.localeCompare(b.cedula));
  const mapa=new Map();let ancho=chunkSize,peticiones=0;
  const nombre='consultar_evidencia_nomina_v716';
  const leer=async items=>{
    cancelado(signal);
    try {
      peticiones++;
      const r=await request(nombre,{p_items:items},{read:true,signal});
      cancelado(signal);if(r?.error)throw r.error;
      const d=r?.data,esperados=new Set(items.map(clave)),vistos=new Set();
      if(!d||!Array.isArray(d.jornadas)||d.total!==items.length||d.total!==d.jornadas.length)
        throw new Error('La evidencia del corte no se recibio completa. No se habilitan decisiones.');
      for(const x of d.jornadas) {
        const k=clave(x);
        if(!esperados.has(k)||vistos.has(k)||x.completo!==true||!Array.isArray(x.recorrido))
          throw new Error('La evidencia contiene jornadas repetidas, inesperadas o incompletas.');
        vistos.add(k);
      }
      // Commit the batch only after all its requested keys are validated.
      for(const x of d.jornadas)mapa.set(clave(x),x);
      onProgress({nombre,filas:mapa.size,total:pares.length,peticiones});
    }catch(e) {
      cancelado(signal);
      if(esTiempoAgotado(e)&&items.length>1) {
        ancho=Math.min(ancho,Math.max(1,Math.floor(items.length/2)));
        const mid=Math.ceil(items.length/2);
        await leer(items.slice(0,mid));await leer(items.slice(mid));return;
      }
      throw contextualizar(e,nombre,items[0]?.fecha,items.at(-1)?.fecha);
    }
  };
  for(let i=0;i<pares.length;) {
    const items=pares.slice(i,i+ancho);await leer(items);i+=items.length;
  }
  cancelado(signal);return mapa;
}

// Preparation already existed on opening the module. Bound the work to one
// week per transaction, retaining the SAME generators and no automatic payment.
// Never retry a write, even a timeout: earlier blocks may already be committed.
export async function prepararCortePorTramos(preparar,desde,hasta,{signal,onProgress=()=>{}}={}) {
  const dias=diasEntre(desde,hasta);
  const result={desde,hasta,insertados:0,actualizados:0,cobertura:[],sin_aprobar:true,bloques:0};
  for(let i=0;i<dias.length;i+=7) {
    const fechas=dias.slice(i,i+7),a=fechas[0],b=fechas.at(-1);
    cancelado(signal);onProgress({etapa:'Preparando el corte',desde:a,hasta:b});
    try {
      const d=await preparar(a,b,{signal});cancelado(signal);
      if(!d||d.desde!==a||d.hasta!==b||d.sin_aprobar!==true||
         !Number.isSafeInteger(d.insertados)||d.insertados<0||!Number.isSafeInteger(d.actualizados)||d.actualizados<0||
         !Array.isArray(d.cobertura)||d.cobertura.some(x=>x.faltantes!==0))
        throw new Error('No se confirmo la preparacion del corte. Actualiza antes de decidir.');
      result.insertados+=d.insertados;result.actualizados+=d.actualizados;
      result.cobertura.push(...d.cobertura);result.bloques++;
    }catch(e) {
      const error=contextualizar(e,'preparar_revision_general_v713',a,b);
      error.operacionesCompletadas=result.bloques;throw error;
    }
  }
  return result;
}

export async function cargarFuentesNomina({
  request,readReviews,desde,hasta,signal,onProgress=()=>{},concurrency=2,clock=now,extras=[]
}) {
  diasEntre(desde,hasta);enteroPositivo(concurrency,'Consultas simultaneas',2);
  cancelado(signal);
  const control=new AbortController(),abort=()=>control.abort();
  signal?.addEventListener('abort',abort,{once:true});
  const innerSignal=control.signal,result={},metrics=new Map(),inicio=clock();
  let firstError=null,next=0;
  const names=new Map([['empleados','Catalogo de empleados'],...FUENTES_NOMINA.map(([key,,label])=>[key,label]),['revisiones','Decisiones y observaciones']]);
  for(const extra of extras) {
    if(!extra||!/^extra_[a-z]+$/.test(extra.key)||names.has(extra.key)||typeof extra.run!=='function')
      throw new Error('Fuente adicional no valida.');
    names.set(extra.key,extra.label||extra.key);
  }
  for(const [key,label] of names)metrics.set(key,{key,etapa:label,estado:'pendiente',filas:0,peticiones:0,ms:0});
  const publicar=(extra={})=>{
    const list=[...metrics.values()].map(x=>({...x,ms:x.inicio==null?x.ms:clock()-x.inicio}));
    onProgress({...extra,fuentesCompletas:list.filter(x=>x.estado==='completa').length,totalFuentes:list.length,
      enCurso:list.filter(x=>x.estado==='leyendo').map(x=>x.etapa),transcurridoMs:clock()-inicio,detalle:list});
  };
  const comenzar=key=>{Object.assign(metrics.get(key),{estado:'leyendo',inicio:clock()});publicar({etapa:names.get(key)});};
  const terminar=(key,rows)=>{
    const m=metrics.get(key);Object.assign(m,{estado:'completa',filas:rows.length,ms:clock()-m.inicio,inicio:null});
    result[key]=rows;publicar({etapa:names.get(key)});
  };
  const tracked=key=>async (nombre,args,opts)=>{
    cancelado(innerSignal);metrics.get(key).peticiones++;
    return request(nombre,args,{...opts,signal:innerSignal});
  };
  const jobs=[
    // Start the slow source first; the other worker handles the lighter ones.
    ...['ayb','marcas','general','inferidos'].map(key=>{
      const [,nombre,etapa]=FUENTES_NOMINA.find(x=>x[0]===key);
      return {key,run:()=>leerBloquesNomina(tracked(key),{fuente:key,desde,hasta,signal:innerSignal,chunkDays:PLAN_LECTURA[key],clock,
        onProgress:p=>{Object.assign(metrics.get(key),{dias:p.dias,totalDias:p.totalDias,desde:p.desde,hasta:p.hasta});publicar({...p,etapa});}})};
    }),
    {key:'revisiones',run:()=>readReviews(desde,hasta,innerSignal,p=>{
      metrics.get('revisiones').peticiones=p.paginas;publicar({etapa:names.get('revisiones')});
    })},
    ...extras.map(extra=>({key:extra.key,run:async()=>[await extra.run(tracked(extra.key),innerSignal)]}))
  ];
  try {
    comenzar('empleados');
    const employees=await leerPaginas(tracked('empleados'),{nombre:'consultar_empleados_nomina_v4',signal:innerSignal,pageSize:1000});
    terminar('empleados',employees);
    const worker=async()=>{
      while(!innerSignal.aborted) {
        const job=jobs[next++];if(!job)return;
        comenzar(job.key);
        try {
          const rows=await job.run();cancelado(innerSignal);
          if(!Array.isArray(rows))throw new Error(names.get(job.key)+': respuesta no valida.');
          terminar(job.key,rows);
        }catch(error){
          const m=metrics.get(job.key);Object.assign(m,{estado:innerSignal.aborted?'cancelada':'error',ms:clock()-m.inicio,inicio:null});
          if(!firstError)firstError=error;
          control.abort();return;
        }
      }
    };
    await Promise.all(Array.from({length:concurrency},worker));
    if(firstError)throw firstError;
    cancelado(innerSignal);
    for(const key of names.keys())if(!Array.isArray(result[key]))throw new Error('No se completo la fuente '+names.get(key));
    result.diagnostico={totalMs:clock()-inicio,concurrency,fuentes:[...metrics.values()].map(x=>({...x}))};
    publicar({etapa:'Verificando integridad'});return result;
  }catch(error){
    for(const m of metrics.values())if(m.estado==='leyendo')Object.assign(m,{estado:signal?.aborted?'cancelada':'error',ms:clock()-m.inicio,inicio:null});
    publicar({fallo:true});throw error;
  }finally{
    control.abort();signal?.removeEventListener('abort',abort);
  }
}

export async function recalcularPorDias(request,{desde,hasta,signal,onProgress=()=>{},chunkDays=7}) {
  enteroPositivo(chunkDays,'Dias por bloque de recalculo',7);
  const dias=diasEntre(desde,hasta);let completadas=0;
  const total=Math.ceil(dias.length/chunkDays)*2;
  for(let i=0;i<dias.length;i+=chunkDays) {
    const fecha=dias[i],fin=dias[Math.min(i+chunkDays-1,dias.length-1)];
    const args={p_fecha_desde:fecha,p_fecha_hasta:fin};
    for(const [nombre,etapa,params] of [
      ['preparar_conceptos_revision_v717','A&B',{...args,p_grupo_codigo:null,p_proceso_codigo:null}],
      ['preparar_conceptos_revision_generales_v2','General',args]
    ]) {
      cancelado(signal);onProgress({etapa,fecha,desde:fecha,hasta:fin,completadas,total});
      try {
        const r=await request(nombre,params,{read:false,signal});
        if(r?.error) throw r.error;
        if(!Array.isArray(r?.data)||r.data.length!==1||['insertados','actualizados'].some(k=>!Number.isSafeInteger(r.data[0]?.[k])||r.data[0][k]<0)) throw new Error('No se pudo confirmar el recalculo.');
        completadas++;
      } catch(e) {
        // Earlier days may have committed. Do not replay writes or declare
        // the whole range recalculated when a single operation failed.
        e=contextualizar(e,nombre,fecha,fin);e.operacionesCompletadas=completadas;throw e;
      }
    }
  }
  // The current Sunday/holiday/nocturnal generator runs once in the following
  // load. Do not call the legacy Sunday generator with its fixed 30 min pause.
  return {completadas};
}

// A preparation failure may not be reported as missing biometric data. Read
// the persisted sources without repeating the failed write. Decisions remain
// disabled until a subsequent explicit update confirms the preparation.
export async function prepararOConsultarGuardado(preparar, {
  soloConsulta = false, advertencia = '', esErrorSesion = () => false, signal
} = {}) {
  cancelado(signal);
  if (soloConsulta) return {cobertura:null, error:null, completa:false,
    aviso:advertencia || 'Consulta guardada; preparacion del corte pendiente.'};
  try {
    const cobertura = await preparar();
    cancelado(signal);
    return {cobertura, error:null, completa:true, aviso:''};
  } catch(error) {
    cancelado(signal);
    if(esErrorSesion(error)) throw error;
    return {cobertura:null, error, completa:false,
      aviso:'Marcaciones consultadas; no se completo la preparacion del corte. Decisiones deshabilitadas.'};
  }
}
