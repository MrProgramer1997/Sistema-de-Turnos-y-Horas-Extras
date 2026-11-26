import {buildModel,punctuality,bogotaNow,addDays} from './centro-control-metricas.js';

/* Cálculo idéntico al Centro de Control: programa AYB/Chef,
   primera marca valida en el punto de trabajo y cero tolerancia.
   No usa Porteria ni crea faltas de asistencia a partir de marcas ausentes. */
export function informeDelDia(ctx,marcaciones,fecha,ahora=bogotaNow()){
  const model=buildModel(ctx,marcaciones,ahora);
  const p=punctuality(model,{from:fecha,to:fecha});
  const turnos=p.journeys.filter(j=>j.source==='Programación A&B'||j.source==='Programación Chef');
  const tardes=turnos.filter(j=>j.status==='tarde').map(j=>({
    nombre:j.person.name,area:j.person.areaLabel,subarea:j.subarea||'',
    inicio:j.begin?.slice(0,5)||'',entrada:j.entry?.clock||'',
    punto:j.entry?.point||'',minutos:Math.max(0,Math.trunc(j.delta||0))
  })).sort((a,b)=>b.minutos-a.minutos||a.nombre.localeCompare(b.nombre));
  const cont=estado=>turnos.filter(j=>j.status===estado).length;
  const pend=turnos.filter(j=>['sin_marca','sin_entrada','sin_punto','conflicto','sin_horario','en_espera','inferida','novedad_no_comparable','novedad_no_justificada'].includes(j.status)).length;
  return {
    fecha,turnos:turnos.length,comparables:cont('tarde')+cont('puntual'),
    tardanzas:tardes.length,puntuales:cont('puntual'),pendientes:pend,
    novedades:cont('justificada'),minutos:tardes.reduce((n,x)=>n+x.minutos,0),
    porArea:{
      AYB:turnos.filter(j=>j.source==='Programación A&B').length,
      Chef:turnos.filter(j=>j.source==='Programación Chef').length
    },
    filas:tardes
  };
}

const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function correoHTML(info,url='https://mrprogramer1997.github.io/Sistema-de-Turnos-y-Horas-Extras/pages/dashboard.html'){
  const filas=info.filas.length?info.filas.map((p,i)=>`<tr style="background:${i%2?'#f4f7fa':'#fff'}"><td style="padding:9px">${escapeHTML(p.nombre)}</td><td style="padding:9px">${escapeHTML(p.area)}${p.subarea?' / '+escapeHTML(p.subarea):''}</td><td style="padding:9px">${escapeHTML(p.inicio)}</td><td style="padding:9px">${escapeHTML(p.entrada)}</td><td style="padding:9px">${escapeHTML(p.punto)}</td><td style="padding:9px;text-align:right"><strong>${p.minutos} min</strong></td></tr>`).join(''):
    '<tr><td colspan="6" style="padding:16px">No se detectaron tardanzas verificadas. Revisar jornadas pendientes antes de concluir que todas las asistencias fueron puntuales.</td></tr>';
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f2f5f8;font-family:Arial,sans-serif;color:#182b40">
  <main style="max-width:860px;margin:20px auto;background:#fff;padding:28px;border-radius:12px">
  <div style="background:#004AA1;color:#fff;padding:18px;border-radius:8px">
    <h1 style="font-size:22px;margin:0">Reporte diario de puntualidad</h1>
    <p style="margin:6px 0 0">Alimentos y Bebidas · Programación Chef · ${escapeHTML(info.fecha)}</p>
  </div>
  <p>Resultado de los turnos programados y la primera marcación válida en el punto de trabajo.</p>
  <p><strong>${info.tardanzas} tardanzas</strong> · ${info.minutos} minutos acumulados · ${info.puntuales} llegadas puntuales · ${info.comparables} jornadas comparables.</p>
  <p><strong>${info.pendientes} jornadas por revisar</strong> · ${info.novedades} novedades o descansos · ${info.porArea.AYB} jornadas AYB · ${info.porArea.Chef} Chef.</p>
  <div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:13px">
  <thead><tr style="background:#e4f0ff;color:#003979"><th align="left" style="padding:10px">Empleado</th><th align="left">Área / Punto</th><th>Inicio</th><th>Entrada laboral</th><th>Punto biométrico</th><th>Retraso</th></tr></thead>
  <tbody>${filas}</tbody></table></div>
  <p><a href="${escapeHTML(url)}" style="color:#004AA1;font-weight:bold">Consultar detalle en el Centro de Control</a></p>
  <p style="font-size:12px;color:#586779">Informe informativo, no implica descuento de nómina ni sanción automática. Portería no determina la hora de llegada laboral. Las incapacidades, descansos y demás novedades justificadas no cuentan como tardanza. Las ausencias de marca se reportan para revisión y no como retrasos.</p>
  </main></body></html>`;
}
