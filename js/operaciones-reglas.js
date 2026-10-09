// Shared presentation helpers. No writes, authorizations or payroll decisions.
export const VERSION_OPS = '745';
export const normalizarOps = v => String(v ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
export function lunesOps(fecha){
  const d=new Date(`${fecha}T12:00:00Z`);
  if(!Number.isFinite(d.getTime()))return '';
  d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
  return d.toISOString().slice(0,10);
}
export function identificaVestier({persona={},puesto={},registro={}}={}){
  const referencia=normalizarOps([registro.turno_codigo,registro.turno_nombre,registro.horario_nombre,registro.observacion,puesto.nombre].filter(Boolean).join(' '));
  return /\b(VESTIER(?:ES)?|VESTIDOR(?:ES)?)\b/.test(referencia.replace(/_/g,' ')) || persona.proceso_codigo==='OPS_AUX_VESTIER' || registro.proceso_codigo==='OPS_AUX_VESTIER';
}
// Solo vestieres los lunes: los demas dias conservan exactamente la pausa recibida.
export function descansoVestier(fecha,minutos,aplica,desde){
  const pausa=Math.max(0,Number(minutos)||0);
  if(!aplica||!desde||fecha<desde||!/^\d{4}-\d{2}-\d{2}$/.test(fecha))return pausa;
  return new Date(`${fecha}T12:00:00Z`).getUTCDay()===1?0:pausa;
}
export function minutosNetosOps(r){
  if(r?.tipo_registro!=='turno'||!r.hora_inicio||!r.hora_fin)return 0;
  const toMin=t=>{const a=String(t).slice(0,5).split(':').map(Number);return a[0]*60+a[1];};
  const a=toMin(r.hora_inicio);let b=toMin(r.hora_fin);
  if(!Number.isFinite(a)||!Number.isFinite(b))return 0;
  if(r.cruza_medianoche||b<a)b+=1440;
  return Math.max(0,b-a-Math.max(0,Number(r.minutos_descanso)||0));
}
export function horasTextoOps(minutos,ceroMinutos=false){
  const n=Math.max(0,Math.round(Number(minutos)||0)),h=Math.floor(n/60),m=n%60;
  return m||ceroMinutos?`${h} h ${String(m).padStart(2,'0')} min`:`${h} h`;
}
export function revisarCobertura({puestos=[],asignaciones=[],personal=[],programacion=[],fechas=[],relevos=[],reglas_semanas=[]}={}){
  const personas=new Map(personal.map(p=>[p.empleado_id,p]));
  const puestosSemana=new Map(asignaciones.map(a=>[`${a.puesto_id}|${a.semana}`,a.empleado_id]));
  const registros=new Map();
  for(const r of programacion){if(r.estado==='cancelado')continue;const k=`${r.empleado_id}|${r.fecha}`;if(!registros.has(k))registros.set(k,[]);registros.get(k).push(r);}
  const avisos=[];
  for(const puesto of puestos){for(const fecha of fechas){
    const reglas=reglas_semanas.find(s=>s.semana===lunesOps(fecha)),regla=reglas?.puestos?.find(p=>p.id===puesto.id);
    if(regla&&(regla.tipo==='flexible'||regla.obligatorio===false||(['porteria','parqueadero'].includes(regla.tipo)&&reglas.descanso_porteria===fecha)))continue;
    const relevo=relevos.find(r=>r.puesto_id===puesto.id&&r.fecha===fecha);
    if(relevo&&(registros.get(`${relevo.empleado_id}|${fecha}`)||[]).some(r=>r.tipo_registro==='turno'&&minutosNetosOps(r)>0))continue;
    const id=puestosSemana.get(`${puesto.id}|${lunesOps(fecha)}`),persona=personas.get(id);
    const rs=id?registros.get(`${id}|${fecha}`)||[]:[];
    if(persona && rs.some(r=>r.tipo_registro==='turno'&&r.hora_inicio&&r.hora_fin&&r.hora_inicio!==r.hora_fin&&minutosNetosOps(r)>0))continue;
    const r=rs[0];
    let tipo,etiqueta;
    if(!persona){tipo='sin-asignar';etiqueta='Sin colaborador asignado';}
    else if(!r){tipo='sin-programacion';etiqueta='Sin programaci\u00f3n';}
    else if(r.tipo_registro==='turno'){tipo='sin-intervalo';etiqueta='Horario incompleto';}
    else {tipo='relevo';etiqueta=r.tipo_registro==='novedad'?(r.novedad_descripcion||r.novedad_codigo||'Novedad'):r.tipo_registro==='compensatorio'?'Compensatorio':'Descanso';}
    avisos.push({puesto_id:puesto.id,puesto:puesto.nombre,orden:puesto.orden,fecha,tipo,etiqueta,colaborador:persona?[persona.nombres,persona.apellidos].filter(Boolean).join(' '):''});
  }}
  return avisos;
}
// Only fields used by the public schedule are passed to the PDF renderer.
export function personaPublicaOps(e){return e?{nombre:[e.nombres,e.apellidos].filter(Boolean).join(' ').replace(/\s+/g,' ').trim(),cargo:e.cargo||'',externo:!!e.es_externo}:null;}
