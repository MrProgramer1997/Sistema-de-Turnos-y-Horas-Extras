/* Regla compartida de evidencias. No escribe en Supabase ni aprueba conceptos.
 * Usa el punto interno; Porteria solo es alternativa con dos marcas de puerta.
 * Los extremos son referencias cronologicas, no sensores de direccion.
 */
const text=v=>String(v??'').trim();
export const normalizarPunto=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export const escaparPunto=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function fechaRevision(fecha){const f=text(fecha).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(f)?`${f.slice(8,10)}/${f.slice(5,7)}/${f.slice(0,4)}`:f;}
export function diaSemanaRevision(fecha){const f=text(fecha).slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(f))return '';const d=new Date(f+'T12:00:00Z');return Number.isFinite(d.getTime())?['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][d.getUTCDay()]:'';}
export const fechaDiaRevision=f=>`<span>${escaparPunto(fechaRevision(f))}</span><small class="rev-small rev-dia">${escaparPunto(diaSemanaRevision(f))}</small>`;
export const ordenCronologicoRevision=(a,b)=>text(a.fecha).localeCompare(text(b.fecha))||text(a.empleado||a.nombre||a.cedula).localeCompare(text(b.empleado||b.nombre||b.cedula),'es')||text(a.concepto_codigo).localeCompare(text(b.concepto_codigo))||text(a.revision_id||a.id).localeCompare(text(b.revision_id||b.id));
export const etiquetaPunto=v=>text(v.punto||v.area_alias||v.area_biometrico||v.terminal_alias||v.terminal||v.serial);
export const esPorteria=v=>normalizarPunto([v.punto,v.area_alias,v.area_biometrico,v.terminal_alias,v.terminal].filter(Boolean).join(' ')).includes('PORTER');
export function seleccionarPuntoRevision(eventos,cantidad,p={}){
 const validos=eventos.filter(v=>Number.isFinite(v.t)).slice().sort((a,b)=>a.t-b.t||text(a.id??a.biotime_id).localeCompare(text(b.id??b.biotime_id)));
 const utiles=v=>{const n=normalizarPunto(etiquetaPunto(v));return n&&!/^[A-Z]{2,}[0-9]{6,}$/.test(n);};
 const internos=validos.filter(v=>!esPorteria(v)&&utiles(v)),grupos=new Set(internos.map(v=>normalizarPunto(etiquetaPunto(v))));
 const esperado=normalizarPunto(p.subarea||p.area_cocina||''),partido=Boolean(p.hora_inicio_2||p.turno_2);
 let usadas=[],fuente='incompleta',nota='',coincide=null;
 if(esperado&&!esperado.includes('PORTER'))usadas=internos.filter(v=>normalizarPunto(etiquetaPunto(v))===esperado||normalizarPunto(v.terminal_alias||v.terminal)===esperado);
 if(usadas.length){fuente='punto';coincide=true;}
 else if(grupos.size===1){usadas=internos;fuente='punto';coincide=esperado?false:null;if(coincide===false)nota='El punto observado difiere de la subárea programada. Se usa el único punto interno recibido, sin cambiar la asignación.';}
 else if(validos.length===2&&cantidad===2&&validos.every(esPorteria)){usadas=validos;fuente='porteria_dos';nota='Portería como referencia: son las dos únicas marcas recibidas. Validar trabajo efectivo.';}
 else if(validos.length===2&&cantidad===2&&internos.length===0&&!validos.some(esPorteria)){usadas=validos;fuente='dos_sin_punto';nota='Dos registros sin punto identificado: se muestra el intervalo recibido, no una comparacion laboral confirmada.';}
 else nota=grupos.size>1?'Varios puntos internos: revisar bloques sin mezclar extremos de áreas distintas.':'Falta el par del punto. Portería solo se usa con exactamente dos marcas, ambas de Portería.';
 const completa=validos.length===cantidad;
 let entrada=usadas.length>=2?usadas[0].t:null,salida=usadas.length>=2&&usadas.at(-1).t>entrada?usadas.at(-1).t:null;
 if(usadas.length===1)nota+=' Marca única en el área: falta confirmar si es entrada o salida.';
 if(!completa){nota+=' El recorrido no coincide con el total de marcas; completar la lectura.';entrada=salida=null;}
 if(partido){nota+=' Turno partido: revisar bloques; el intervalo global no representa horas netas.';}
 return {usadas,fuente,nota,coincide,punto:fuente==='punto'?etiquetaPunto(usadas[0]):fuente==='porteria_dos'?'Portería':'',entrada,salida,parClaro:fuente!=='dos_sin_punto'&&completa&&!partido&&usadas.length===2&&salida>entrada&&salida-entrada<=960,grupos:grupos.size,completa};
}
export function lecturaEventoRevision(v,m){
 if(m.seleccion?.fuente==='dos_sin_punto')return 'Registro recibido (punto sin identificar)';
 const gates=m.eventos.filter(esPorteria),usadas=m.usadas||[],first=usadas[0],last=usadas.at(-1);
 if(esPorteria(v))return gates.length>=2?(v===gates[0]?'Portería · primer registro':v===gates.at(-1)?'Portería · último registro':'Portería · movimiento'):'Portería · registro único';
 if(usadas.length===1&&v===first)return 'Área · marca sin pareja';
 if(usadas.length>=2&&v===first)return 'Área · entrada de referencia';
 if(usadas.length>=2&&v===last)return 'Área · salida de referencia';
 return 'Área · movimiento adicional';
}
export function recorridoRevisionHtml(m){return m.eventos.map(v=>{const f=new Date(Math.round(v.t*60000)).toISOString();return `<tr><td>${escaparPunto(f.slice(0,19).replace('T',' '))}<small class="rev-small">${escaparPunto(diaSemanaRevision(f))}</small></td><td>${escaparPunto(v.punto||v.area_alias||v.area_biometrico||'Sin área informada')}</td><td>${escaparPunto(v.terminal_alias||v.terminal||v.serial||'—')}</td><td>${escaparPunto(lecturaEventoRevision(v,m))}</td></tr>`;}).join('');}
