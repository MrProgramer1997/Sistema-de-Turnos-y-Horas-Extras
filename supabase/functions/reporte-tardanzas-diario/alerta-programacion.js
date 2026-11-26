import {documentosProgramados} from './consulta-paginada.js';

/** Solo programaciones vigentes de AYB y Chef de planta para la fecha solicitada.
 * Una base de datos vacía NO significa cero tardanzas.
 */
export function evaluarProgramacion(ctx,fecha){
  const legacy=(ctx.legacy||[]).filter(r=>r.fecha===fecha);
  const chef=(ctx.chef||[]).filter(r=>r.fecha===fecha);
  const ayb=documentosProgramados(legacy,[],[],[]);
  const cocina=documentosProgramados([],chef,ctx.chefPeople||[],ctx.employees||[]);
  const faltan=[];
  if(!ayb.length)faltan.push('AYB');
  if(!cocina.length)faltan.push('Chef');
  return {
    completa:faltan.length===0,
    faltan,
    empleados:{AYB:ayb.length,Chef:cocina.length}
  };
}
const htmlEscape=v=>String(v??'').replace(/[&<>"']/g,c=>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fechaHumana=v=>String(v).split('-').reverse().join('/');
const dashboard='https://mrprogramer1997.github.io/Sistema-de-Turnos-y-Horas-Extras/pages/dashboard.html';

/** Alerta operativa: no presenta recuentos de tardanza cuando una fuente falta. */
export function avisoProgramacionFaltante(evaluacion,fecha){
  if(evaluacion.completa || !evaluacion.faltan.length)
    throw new Error('Solo se puede emitir alerta cuando falta programación');
  const ambas=evaluacion.faltan.length===2;
  const ausentes=ambas?'AYB y Programación Chef':evaluacion.faltan[0]==='AYB'?'AYB':'Programación Chef';
  const subject=`ALERTA: Programación ${ambas?'no registrada':'incompleta'} (${ausentes}) | ${fechaHumana(fecha)}`;
  const status=area=>evaluacion.empleados[area]>0
    ?`${evaluacion.empleados[area]} empleado(s) con programación registrada`
    :'Sin programación válida registrada';
  const html=`<!doctype html><html lang="es"><body style="margin:0;background:#f2f5f8;font-family:Arial,sans-serif;color:#183149">
   <main style="max-width:720px;margin:22px auto;background:#fff;border-radius:12px;padding:26px">
    <div style="background:#004AA1;color:#fff;padding:18px;border-radius:8px">
      <h1 style="font-size:21px;margin:0">Aviso de programación faltante</h1>
      <p style="margin:8px 0 0">Alimentos y Bebidas / Chef · ${htmlEscape(fechaHumana(fecha))}</p>
    </div>
    <p><strong>No fue posible generar el informe consolidado de llegadas tarde</strong>
    correspondiente al día ${htmlEscape(fechaHumana(fecha))} porque
    ${ambas?'no se encontraron programaciones válidas de AYB ni de Chef':
               'no se encontró programación válida de '+htmlEscape(ausentes)}.</p>
    <table style="border-collapse:collapse;width:100%;margin:18px 0;font-size:14px">
      <thead><tr style="background:#e4f0ff"><th style="text-align:left;padding:11px">Fuente</th><th style="text-align:left;padding:11px">Programación</th></tr></thead>
      <tbody><tr><td style="padding:11px;border-bottom:1px solid #e4e8ec">Alimentos y Bebidas</td><td style="padding:11px;border-bottom:1px solid #e4e8ec">${htmlEscape(status('AYB'))}</td></tr>
      <tr><td style="padding:11px">Programación Chef (personal fijo)</td><td style="padding:11px">${htmlEscape(status('Chef'))}</td></tr></tbody>
    </table>
    <p style="padding:12px;border-left:4px solid #df8f19;background:#fff8e8">
      <strong>Esta alerta NO significa que nadie haya llegado tarde.</strong>
      No se generó un listado de tardanzas porque faltan datos de programación para compararlos con las marcaciones.</p>
    <p><strong>Acción requerida:</strong> los responsables de ${htmlEscape(ausentes)}
       deben revisar y completar la programación del ${htmlEscape(fechaHumana(fecha))}.
       Después se podrá consultar y verificar la puntualidad en el Centro de Control.</p>
    <p><a href="${dashboard}" style="color:#004AA1;font-weight:bold">Abrir Centro de Control AYB / Chef</a></p>
    <p style="font-size:12px;color:#5a6670">Notificación operativa automática. No altera turnos,
      registros biométricos, liquidación de nómina ni autorizaciones de horas extras.</p>
   </main>
  </body></html>`;
  return {subject,html,tipo:'alerta_programacion',faltan:[...evaluacion.faltan]};
}
