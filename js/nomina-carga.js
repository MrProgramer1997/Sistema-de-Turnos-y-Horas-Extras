// Payroll loading only. Business rules and authorization stay in the existing RPCs.
// Small, sequential reads; no automatic preparation or repeated writes.
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
export async function leerPaginas(request,{nombre,args={},signal,onProgress=()=>{},pageSize=500}) {
  let rows=[],offset=0,total=null;
  for(let page=0;page<2000;page++) {
    cancelado(signal);
    const r=await request(nombre,args,{range:[offset,offset+pageSize-1],signal,read:true,count:page===0?'exact':undefined});
    cancelado(signal);
    const lote=arrayValido(r,nombre);
    if(page===0&&r.count!=null) {
      if(!Number.isSafeInteger(Number(r.count))||Number(r.count)<0) throw new Error(nombre+': conteo de filas no v\u00e1lido.');
      total=Number(r.count);
    }
    rows.push(...lote);offset+=lote.length;
    onProgress({nombre,filas:offset,total});
    if(total!==null) {
      if(offset>total || (!lote.length&&offset<total)) throw new Error(nombre+': la paginaci\u00f3n no coincide con el conteo. Actualiza nuevamente.');
      if(offset===total) return rows;
    } else if(lote.length<pageSize) return rows;
  }
  throw new Error(nombre+': demasiadas p\u00e1ginas; la lectura no se considera completa.');
}
export async function leerPorTramos(request,{nombre,desde,hasta,signal,onProgress=()=>{},chunkDays=3,pageSize=500}) {
  const dias=diasEntre(desde,hasta);let terminados=0;
  const trozo=async fechas=>{
    cancelado(signal);
    const a=fechas[0],b=fechas.at(-1);
    onProgress({nombre,desde:a,hasta:b,dias:terminados,totalDias:dias.length});
    try {
      const rows=await leerPaginas(request,{nombre,args:{p_fecha_desde:a,p_fecha_hasta:b},signal,pageSize});
      // Every row must belong to the requested slice. Never silently discard rows.
      for(const row of rows) {
        const date=String((row?.jornada||row)?.fecha||'').slice(0,10);
        if(!date||date<a||date>b) throw new Error(nombre+': fila fuera del tramo solicitado.');
      }
      terminados+=fechas.length;
      onProgress({nombre,desde:a,hasta:b,dias:terminados,totalDias:dias.length,filas:rows.length});
      return rows;
    } catch(e) {
      cancelado(signal);
      // A timed-out READ is safe to subdivide. No retry for auth, network,
      // missing RPCs or write operations. Single-day failure is surfaced.
      if(esTiempoAgotado(e)&&fechas.length>1) {
        const mid=Math.ceil(fechas.length/2);
        onProgress({nombre,desde:a,hasta:b,reducido:true,dias:terminados,totalDias:dias.length});
        const left=await trozo(fechas.slice(0,mid));
        return left.concat(await trozo(fechas.slice(mid)));
      }
      throw contextualizar(e,nombre,a,b);
    }
  };
  const result=[];
  for(let i=0;i<dias.length;i+=chunkDays) result.push(...await trozo(dias.slice(i,i+chunkDays)));
  return result;
}
export async function cargarFuentesNomina({request,readReviews,desde,hasta,signal,onProgress=()=>{}}) {
  diasEntre(desde,hasta);const result={};
  onProgress({etapa:'Cat\u00e1logo de empleados'});
  result.empleados=await leerPaginas(request,{nombre:'consultar_empleados_nomina_v4',signal});
  for(const [key,nombre,etapa] of FUENTES_NOMINA) {
    result[key]=await leerPorTramos(request,{nombre,desde,hasta,signal,onProgress:p=>onProgress({...p,etapa})});
  }
  cancelado(signal);onProgress({etapa:'Decisiones y observaciones guardadas'});
  result.revisiones=await readReviews(desde,hasta,signal);
  cancelado(signal);
  return result;
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
