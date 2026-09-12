// Payroll loading only. Business rules and authorization stay in the existing RPCs.
// Bounded parallel READS, adaptive slices and verified pagination. No repeated writes.
export const FUENTES_NOMINA = Object.freeze([
  ['marcas','consultar_marcaciones_nomina_v3','Marcaciones'],
  ['general','consultar_jornadas_generales_nomina_v3','Programaci\u00f3n general'],
  ['ayb','consultar_jornadas_ayb_nomina_v4','Programaci\u00f3n A&B y Chef'],
  ['inferidos','consultar_turnos_inferidos_nomina_v5','Turnos inferidos']
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

// Only two independent sources may run at once. A&B has the smaller window;
// a timeout reduces that window for the rest of THIS load, never forever.
export const PLAN_LECTURA = Object.freeze({marcas:7, general:7, ayb:5, inferidos:7});
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
export async function cargarFuentesNomina({
  request,readReviews,desde,hasta,signal,onProgress=()=>{},concurrency=2,clock=now
}) {
  diasEntre(desde,hasta);enteroPositivo(concurrency,'Consultas simultaneas',2);
  cancelado(signal);
  const control=new AbortController(),abort=()=>control.abort();
  signal?.addEventListener('abort',abort,{once:true});
  const innerSignal=control.signal,result={},metrics=new Map(),inicio=clock();
  let firstError=null,next=0;
  const names=new Map([['empleados','Catalogo de empleados'],...FUENTES_NOMINA.map(([key,,label])=>[key,label]),['revisiones','Decisiones y observaciones']]);
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
      return {key,run:()=>leerPorTramos(tracked(key),{nombre,desde,hasta,signal:innerSignal,chunkDays:PLAN_LECTURA[key],pageSize:1000,clock,
        onProgress:p=>{Object.assign(metrics.get(key),{dias:p.dias,totalDias:p.totalDias,desde:p.desde,hasta:p.hasta});publicar({...p,etapa});}})};
    }),
    {key:'revisiones',run:()=>readReviews(desde,hasta,innerSignal,p=>{
      metrics.get('revisiones').peticiones=p.paginas;publicar({etapa:names.get('revisiones')});
    })}
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

export async function recalcularPorDias(request,{desde,hasta,signal,onProgress=()=>{}}) {
  const dias=diasEntre(desde,hasta);let completadas=0;
  for(const fecha of dias) {
    const args={p_fecha_desde:fecha,p_fecha_hasta:fecha};
    for(const [nombre,etapa,params] of [
      ['preparar_conceptos_revision','A&B',{...args,p_grupo_codigo:null,p_proceso_codigo:null}],
      ['preparar_conceptos_revision_generales_v2','General',args]
    ]) {
      cancelado(signal);onProgress({etapa,fecha,completadas,total:dias.length*2});
      try {
        const r=await request(nombre,params,{read:false,signal});
        if(r?.error) throw r.error;
        if(!Array.isArray(r?.data)) throw new Error('No se pudo confirmar el rec\u00e1lculo.');
        completadas++;
      } catch(e) {
        // Earlier days may have committed. Do not replay writes or declare
        // the whole range recalculated when a single operation failed.
        e=contextualizar(e,nombre,fecha,fecha);e.operacionesCompletadas=completadas;throw e;
      }
    }
  }
  return {completadas};
}
