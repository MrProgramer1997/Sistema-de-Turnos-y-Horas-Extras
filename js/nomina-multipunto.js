/* v7.51. Read-only, schedule-bounded reference across INTERNAL terminals.
 * These windows detect ambiguity; they are NOT paid-time tolerances.
 * Raw marks, payroll approvals and the 26-minute review filter are unchanged.
 */
const text = v => String(v ?? '').trim();
const norm = v => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const label = v => text(v.punto || v.area_alias || v.area_biometrico || v.terminal_alias || v.terminal || v.serial);
const gate = v => norm([v.punto,v.area_alias,v.area_biometrico,v.terminal_alias,v.terminal].filter(Boolean).join(' ')).includes('PORTER');
const direction = v => !gate(v) ? '' : /SALIDA/.test(norm(v.terminal_alias || v.terminal)) ? 'salida' : /INGRESO|ENTRADA/.test(norm(v.terminal_alias || v.terminal)) ? 'ingreso' : '';
export const VENTANAS_MULTIPUNTO751 = Object.freeze({entrada:120,salida:240,proximidad:2,maximo:960});
export function seleccionarMultipunto751(eventos,cantidad,{inicio,fin,partido=false,conflicto=false}={}) {
 const validos=eventos.filter(v=>Number.isFinite(v.t)).slice().sort((a,b)=>a.t-b.t||text(a.id??a.biotime_id).localeCompare(text(b.id??b.biotime_id)));
 const internos=validos.filter(v=>v.is_attendance!==false&&!gate(v)&&norm(label(v))&&!/^[A-Z]{2,}[0-9]{6,}$/.test(norm(label(v))));
 const grupos=new Set(internos.map(v=>norm(label(v)))).size;
 if(grupos<2)return null; // Existing single-point and gate-only rules are retained.
 if(!Number.isFinite(inicio)||!Number.isFinite(fin))return null;
 const completa=validos.length===cantidad;
 const fail=nota=>({version:'multipunto_v751',usadas:[],fuente:'incompleta',nota,coincide:null,punto:'',entrada:null,salida:null,parClaro:false,grupos,completa});
 if(!completa)return fail('Recorrido incompleto: actualizar antes de comparar puntos distintos.');
 if(partido||conflicto||fin<=inicio||fin-inicio>960)return fail('Horario dividido o en conflicto: confirmar cada bloque antes de combinar puntos.');
 const first=internos[0],last=internos.at(-1),a=first.t,b=last.t;
 if(b<=a||b-a>960||Math.abs(a-inicio)>120||Math.abs(b-fin)>240||a>=fin||b<=inicio)
  return fail('Los extremos de distintos puntos no son congruentes con el horario. Revisar todas las marcas; no se recortan ni se inventan horas.');
 if(internos.some(v=>v!==first&&v.t-a<=2&&norm(label(v))!==norm(label(first)))||
    internos.some(v=>v!==last&&b-v.t<=2&&norm(label(v))!==norm(label(last))))
  return fail('Hay lecturas de distintos puntos muy proximas a un extremo. Confirmar cual corresponde a entrada o salida; no asumir una captura accidental.');
 if(validos.some(v=>direction(v)==='salida'&&v.t>a&&v.t<b&&validos.some(w=>direction(w)==='ingreso'&&w.t>v.t&&w.t<b)))
  return fail('Hay salida y reingreso intermedios de Porteria. Revisar intervalos antes de sumar la jornada.');
 const punto=label(first)===label(last)?label(first):`${label(first)} -> ${label(last)}`;
 return {version:'multipunto_v751',usadas:[first,last],fuente:'multipunto_horario',nota:'Entrada y salida en puntos internos, contrastadas con el horario. Las marcas intermedias se conservan como movimientos, no cierran la jornada. Es referencia para revisar, no pago aprobado.',coincide:null,punto,puntoEntrada:label(first),puntoSalida:label(last),entrada:a,salida:b,parClaro:true,grupos,completa};
}
