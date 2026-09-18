/* Fase 7.10. Read-only reconciliation helpers; no personal overrides and no auto writes. */
const text = v => String(v ?? '').trim();
const norm = v => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toUpperCase();
const key = r => `${text(r.cedula)}|${text(r.fecha).slice(0,10)}`;
const finite = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
export function fechaLocalColombia(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function fechaValidaControl(f) {
  return /^\d{4}-\d{2}-\d{2}$/.test(f) && Number.isFinite(Date.parse(f+'T12:00:00Z')) && new Date(f+'T12:00:00Z').toISOString().slice(0,10)===f;
}
export function areaConsulta(r, j = r.jornada_actual, e = {}) {
  // Only display/filter context. Never rewrite stored process IDs or payroll concepts.
  return text(r.proceso_nombre || j?.proceso_nombre || j?.area || r.area || e.area || r.grupo_nombre || r.grupo_codigo || e.centro_costos || r.centro_costos || 'SIN AREA');
}
export function coincideAreaConsulta(r, selected) {
  if (!text(selected)) return true;
  const j=r.jornada_actual;
  return [r.area_consulta,r.proceso_nombre,r.area,r.grupo_nombre,r.grupo_codigo,r.proceso_codigo,r.centro_costos,j?.proceso_nombre,j?.area,j?.centro_costos]
    .some(a=>text(a) && norm(a)===norm(selected));
}
export function domingosSinConcepto(jornadas,revisiones,{hoy=fechaLocalColombia(),calendario=null,oficiales=null}={}){
 const presentes=new Set(revisiones.filter(r=>['P006','P007'].includes(text(r.concepto_codigo))).map(key)),vistos=new Set(),out=[];
 for(const r of jornadas){const fecha=text(r.fecha).slice(0,10),k=key(r),festivo=Boolean(calendario?.festivos?.has(fecha));
  if(!fechaValidaControl(fecha)||fecha>hoy||(!festivo&&new Date(fecha+'T12:00:00Z').getUTCDay()!==0)||Number(r.total_marcaciones)<1||presentes.has(k)||vistos.has(k))continue;
  if(r.es_externo_chef===true||['extra','externo','eventual'].includes(text(r.tipo_personal).toLowerCase()))continue;
  if(oficiales&&!oficiales.has(text(r.cedula)))continue;
  vistos.add(k);out.push({jornada:r,fecha,clave:k,festivo,preparable:!!calendario,motivo:'Hay marcas sin registro base. Preparar solo incorpora el caso; no calcula ni aprueba pagos.'});
 }return out.sort((a,b)=>a.fecha.localeCompare(b.fecha)||text(a.jornada.empleado).localeCompare(text(b.jornada.empleado),'es'));
}
export async function prepararDomingoSeleccionado(request,fecha,{hoy=fechaLocalColombia(),calendario,signal}={}){
 if(!fechaValidaControl(fecha)||fecha>hoy||(!calendario?.festivos?.has(fecha)&&new Date(fecha+'T12:00:00Z').getUTCDay()!==0))throw new Error('Selecciona domingo o festivo con registros recibidos.');
 if(signal?.aborted)throw new Error('Operación cancelada antes de enviar.');
 const r=await request('preparar_revision_general_v713',{p_desde:fecha,p_hasta:fecha},{read:false,signal});if(r?.error)throw r.error;
 const d=r?.data;if(!d||d.sin_aprobar!==true||!Array.isArray(d.cobertura)||d.cobertura.some(x=>x.faltantes!==0))throw new Error('No se confirmó la cobertura. Actualiza antes de reintentar.');
 return {insertados:d.insertados,actualizados:d.actualizados,fecha};
}
export function controlExtraVigente(r,m) {
  if(['aprobado','rechazado'].includes(text(r.estado_revision||r.estado).toLowerCase())||!['P003','P004','P008','P009'].includes(text(r.concepto_codigo))) return null;
  if(r.detalle?.retirado_por_correccion_horario_v711===true)return 'Candidato retirado al corregir el horario confirmado. Sin horas extra por esta salida; se conserva el registro y su auditoria.';
  const actual=m?.p||{},doc=actual.documental_711,confirmado=doc?actual.programacion_tipo==='confirmada':Boolean(m?.ev?.horario)||actual.programacion_tipo==='confirmada'||r.programacion_tipo==='confirmada';
  if(doc&&['deteccion_semanal','pendiente','conflicto','festivo_sin_regla'].includes(doc.tipo))return 'Turno semanal no confirmado. Se muestran las marcas, pero falta validar la base para decidir extras.';
  if(doc?.conflicto_documental)return 'La asignacion guardada difiere del horario fijo documental. Confirmar la excepcion o corregir la base antes de decidir extras.';
  if(doc?.reconciliar_guardado)return 'Horario confirmado corregido en lectura. La asignacion y el candidato antiguos requieren reconciliacion auditada en la base antes de aprobar.';
  if(doc&&doc.tipo!=='guardada'){
    const d=r.detalle||{},hi=text(d.hora_inicio),hf=text(d.hora_fin),hp=finite(d.horas_programadas??d.horas_programadas_netas);
    if(!hi||!hf||hp===null||Math.abs(hp-Number(actual.horas_programadas_netas||0))>.01)return 'Candidato anterior no conciliado con el horario documental y su descanso. Revisar y recalcular sin aprobar automaticamente.';
  }
  if(!confirmado) return null;
  const d=r.detalle||{},campos=['hora_inicio','hora_fin','hora_inicio_2','hora_fin_2'];
  const hh=v=>text(v).slice(0,5);
  if(campos.some(c=>Object.prototype.hasOwnProperty.call(d,c)&&hh(d[c])!==hh(actual[c]))) {
    return 'El horario actual difiere del utilizado para calcular este candidato. Revisar la asignacion y recalcular antes de aprobar o ajustar; la lectura no modifica el registro.';
  }
  if(m.comparable && Number.isFinite(m.deltaSalida) && m.deltaSalida<=25) {
    return 'La salida comparada no supera 25 minutos despues del turno vigente. Este candidato de extras requiere revision; no se ofrece aprobacion directa.';
  }
  return null;
}
