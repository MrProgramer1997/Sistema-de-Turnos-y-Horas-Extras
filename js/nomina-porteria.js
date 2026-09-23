import { rpcConSesion, observarSesion } from './nomina-sesion.js?v=717';
import { consultarPermisos, tieneModulo } from './permisos-modulos.js?v=720';
import { ENCABEZADOS730, NOTA730, escapar730, texto730, fechaISO730, fechaVisual730, horaVisual730, bloques730, cargarPorteria730, construirFilas730, celdas730, filasHTML730, htmlImpresion730, cargarCalendarioPorteria731 } from './nomina-porteria-core.js?v=732';
// This module is lazy-loaded only from BOTON ANTERIOR. It never writes payroll data.
let instancia=null;
export async function abrirPorteria730(){
 if(!instancia)instancia=crearPorteria730();
 return instancia.abrir();
}
function crearPorteria730(){
 const dialog=document.createElement('dialog');dialog.id='npDialogo730';dialog.setAttribute('aria-labelledby','npTitulo730');
 const cols=[96,150,180,174,31,162,31,162,31,174,31,72,72,215];
 dialog.innerHTML=`<div class="np-window"><header class="np-heading"><h2 id="npTitulo730">Revisi\u00f3n de Horarios</h2></header>
 <form class="np-toolbar" id="npForm730"><div class="np-filters"><div class="np-persona"><label for="npPersona730">Persona :</label><input id="npPersona730" name="persona" maxlength="150" list="npPersonas730" placeholder="Todos" title="C\u00f3digo, c\u00e9dula o nombre. Vac\u00edo: todas las personas." autocomplete="off"><input id="npNombre730" readonly aria-label="Nombre de la persona" value="TODAS LAS PERSONAS"><datalist id="npPersonas730"></datalist></div>
 <div class="np-dates"><label for="npDesde730">Fecha Inicial :</label><input id="npDesde730" name="desde" inputmode="numeric" maxlength="10" placeholder="dd/mm/aaaa" required><label for="npHasta730">Fecha Final :</label><input id="npHasta730" name="hasta" inputmode="numeric" maxlength="10" placeholder="dd/mm/aaaa" required></div></div>
 <div class="np-actions"><button class="np-action" type="submit" id="npGenerar730"><span class="np-icon np-icon-generar" aria-hidden="true"></span><span>Generar</span></button><button class="np-action" type="button" id="npImprimir730" disabled><span class="np-icon np-icon-imprimir" aria-hidden="true"></span><span>Imprimir</span></button><button class="np-action" type="button" id="npExcel730" disabled><span class="np-icon np-icon-excel" aria-hidden="true"></span><span>Excel</span></button><button class="np-action" type="button" id="npCerrar730"><span class="np-icon np-icon-cerrar" aria-hidden="true"></span><span>Cerrar</span></button></div></form>
 <div class="np-grid" tabindex="0" aria-label="Registros de Porter\u00eda"><table class="np-table"><colgroup>${cols.map(w=>`<col style="width:${w}px">`).join('')}</colgroup><thead><tr>${ENCABEZADOS730.map(h=>`<th scope="col">${escapar730(h)}</th>`).join('')}</tr></thead><tbody id="npBody730"></tbody></table></div>
 <footer class="np-footer"><div class="np-status" id="npEstado730" role="status" aria-live="polite"></div><p>${escapar730(NOTA730)}</p></footer></div>`;
 document.body.append(dialog);
 const $=id=>dialog.querySelector('#'+id), body=$('npBody730'), inputs=['npPersona730','npDesde730','npHasta730'].map($);
 let rows=[],marcas=[],snapshot=null,busy=false,controller=null,generation=0;const prints=new Set();
 function estado(text,error=false){$('npEstado730').textContent=text;$('npEstado730').dataset.error=String(error);}
 function controles(){for(const x of inputs)x.disabled=busy;$('npGenerar730').disabled=busy;$('npImprimir730').disabled=busy||!snapshot||!rows.length;$('npExcel730').disabled=busy||!snapshot||!rows.length;dialog.querySelector('.np-grid').setAttribute('aria-busy',String(busy));}
 function vacio(text){body.innerHTML=`<tr class="np-empty"><td colspan="14">${escapar730(text)}</td></tr>`;}
 function descartar(){snapshot=null;rows=[];marcas=[];controles();}
 function cerrar(){generation++;controller?.abort();busy=false;descartar();body.replaceChildren();dialog.close();document.getElementById('heBotonAnterior')?.focus();}
 async function permisos(){const s=await consultarPermisos({force:true});if(!tieneModulo(s,'horas-extras'))throw new Error('No tienes permiso para Horas extras.');return s;}
 inputs.forEach(x=>x.addEventListener('input',()=>{snapshot=null;controles();estado('Filtros modificados. Pulsa Generar para actualizar.');if(x.id==='npPersona730')$('npNombre730').value=x.value?'PULSA GENERAR PARA CONSULTAR':'TODAS LAS PERSONAS';}));
 $('npForm730').addEventListener('submit',e=>{e.preventDefault();void generar();});
 $('npCerrar730').addEventListener('click',cerrar);
 dialog.addEventListener('cancel',e=>{e.preventDefault();cerrar();});
 body.addEventListener('click',e=>{const tr=e.target.closest('tr[data-np-fila]');if(tr){body.querySelector('.np-selected')?.classList.remove('np-selected');tr.classList.add('np-selected');}});
 observarSesion(()=>{for(const w of prints){try{w.close();}catch{}}prints.clear();if(dialog.open)cerrar();else descartar();});
 async function generar(){
  if(busy)return;
  const id=++generation;controller?.abort();controller=new AbortController();const signal=controller.signal;
  try{
   const desde=fechaISO730($('npDesde730').value),hasta=fechaISO730($('npHasta730').value),persona=texto730($('npPersona730').value);bloques730(desde,hasta);
   busy=true;descartar();controles();vacio('Consultando Porter\u00eda...');estado('Consultando marcaciones de Porter\u00eda...');await permisos();
   if(id!==generation||!dialog.open)return;
   const consultaCalendario=cargarCalendarioPorteria731({desde,hasta,signal,
    request:(args,signal)=>rpcConSesion('consultar_calendario_nomina_v78',args,{signal,read:true})
   }).catch(error=>{
    if(signal.aborted||error?.name==='AbortError'||String(error?.code||'').startsWith('AUTH_')||['42501','PGRST301','PGRST302','PGRST303'].includes(String(error?.code))||[401,403].includes(Number(error?.status)))throw error;
    // An unavailable calendar must not hide marks or fabricate holidays.
    console.warn('Calendario del informe de Porteria:',error);
    return {festivos:new Map(),verificado:false,aviso:'No se pudieron verificar los festivos. Solo se identifican los domingos; pulsa Generar para reintentar.'};
   });
   const [marcasLeidas,calendario]=await Promise.all([
    cargarPorteria730({desde,hasta,persona,signal,request:async(args,signal)=>{
     try{return await rpcConSesion('consultar_porteria_nomina_v730',args,{signal,read:true});}catch(error){if(error?.code==='QUERY_TIMEOUT')return {error};throw error;}
    },onProgress:(done,total)=>{if(id===generation)estado(`Consultando Porter\u00eda: ${done} de ${total} bloques.`);}}),
    consultaCalendario
   ]);
   marcas=marcasLeidas;
   if(id!==generation||!dialog.open)return;
   rows=construirFilas730(marcas,desde,hasta);
   const unique=new Map();for(const f of rows)unique.set(f.cedula,{codigo:f.codigo,nombres:f.nombres,apellidos:f.apellidos});
   const personas=[...unique.values()];$('npNombre730').value=personas.length===1?`${personas[0].nombres} ${personas[0].apellidos}`.trim():persona?`${personas.length} PERSONAS ENCONTRADAS`:'TODAS LAS PERSONAS';
   if(persona&&personas.length===1)$('npPersona730').value=personas[0].codigo;
   $('npPersonas730').innerHTML=personas.map(p=>`<option value="${escapar730(p.codigo)}" label="${escapar730(`${p.nombres} ${p.apellidos}`)}"></option>`).join('');
   $('npDesde730').value=fechaVisual730(desde);$('npHasta730').value=fechaVisual730(hasta);
   if(!rows.length)vacio('No hay marcaciones de Porter\u00eda para esta persona y periodo.');
   else{
    body.replaceChildren();
    for(let i=0;i<rows.length;i+=200){
     if(signal.aborted||id!==generation||!dialog.open)return;
     body.insertAdjacentHTML('beforeend',filasHTML730(rows.slice(i,i+200),{calendario}).replace(/data-np-fila="(\d+)"/g,(_,n)=>`data-np-fila="${i+Number(n)}"`));
     if(i+200<rows.length)await new Promise(resolve=>setTimeout(resolve,0));
    }
    for(let i=rows.length;i<22;i++)body.insertAdjacentHTML('beforeend',`<tr aria-hidden="true">${ENCABEZADOS730.map(()=>'<td>&nbsp;</td>').join('')}</tr>`);
    body.querySelector('tr[data-np-fila]')?.classList.add('np-selected');
   }
   const inRange=marcas.filter(m=>m.hora.slice(0,10)>=desde&&m.hora.slice(0,10)<=hasta).length;
   const shownInRange=new Set(rows.flatMap(r=>r.eventos.filter(m=>m.hora.slice(0,10)>=desde&&m.hora.slice(0,10)<=hasta).map(m=>String(m.id))));
   if(shownInRange.size!==inRange)throw new Error('No se pudo comprobar la integridad de los registros. Genera nuevamente.');
   snapshot={desde,hasta,persona:$('npPersona730').value?`${$('npPersona730').value} - ${$('npNombre730').value}`:'Todas las personas',consultado:new Date().toLocaleString('es-CO',{timeZone:'America/Bogota'}),marcasPeriodo:inRange,calendario};
   estado(`${inRange} marcaciones de Porter\u00eda \u00b7 ${rows.length} filas por empleado/d\u00eda.${calendario.aviso?' '+calendario.aviso:''}`,Boolean(calendario.aviso));
  }catch(error){
   if(id!==generation)return;
   controller?.abort();descartar();vacio('No se complet\u00f3 la consulta. No hay un informe completo para imprimir.');
   estado(error?.message||'No se pudo consultar Porter\u00eda.',true);console.error('Informe de Porteria:',error);
  }finally{if(id===generation){busy=false;controles();}}
 }
 $('npImprimir730').addEventListener('click',async()=>{
  if(!snapshot||busy||!rows.length)return;
  const data={...snapshot},copy=rows.slice(),id=generation;
  const w=window.open('','_blank','width=1200,height=820');
  if(!w){estado('Permite la ventana de impresi\u00f3n en el navegador y pulsa Imprimir otra vez.',true);return;}
  prints.add(w);w.opener=null;w.document.body.textContent='Preparando impresi\u00f3n...';
  try{
   await permisos();if(id!==generation||!snapshot){w.close();return;}
   w.document.open();w.document.write(htmlImpresion730(copy,data));w.document.close();
   w.addEventListener('afterprint',()=>{prints.delete(w);w.close();},{once:true});
   if(w.document.fonts)await w.document.fonts.ready;
   setTimeout(()=>{if(!w.closed){w.focus();w.print();}},120);
  }catch(e){w.close();prints.delete(w);descartar();vacio('Es necesario verificar el acceso.');estado(e.message||'No se pudo imprimir.',true);}
 });
 $('npExcel730').addEventListener('click',async()=>{
  if(!snapshot||busy||!rows.length)return;
  const id=generation;
  try{
   await permisos();if(id!==generation||!snapshot)return;
   const X=window.XLSX;if(!X?.utils||!X.writeFile)throw new Error('No se carg\u00f3 el componente Excel. Recarga la p\u00e1gina y vuelve a intentar.');
   const workbook=X.utils.book_new(),sheet=X.utils.aoa_to_sheet([['Revisi\u00f3n de Horarios - Solo Porter\u00eda'],['Persona',snapshot.persona],['Desde',fechaVisual730(snapshot.desde),'Hasta',fechaVisual730(snapshot.hasta)],[NOTA730],[],ENCABEZADOS730,...rows.map(celdas730)]);
   sheet['!cols']=[{wch:12},{wch:25},{wch:28},{wch:23},{wch:5},{wch:23},{wch:5},{wch:23},{wch:5},{wch:23},{wch:5},{wch:10},{wch:10},{wch:60}];
   X.utils.book_append_sheet(workbook,sheet,'Revision de Horarios');
   const seen=new Map();for(const r of rows)for(const m of r.eventos)seen.set(m.id,m);
   const raw=X.utils.aoa_to_sheet([['ID','Codigo recibido','Codigo nomina','Nombre','Apellido','Fecha y hora','Huellero','Serial','Tipo','Dentro del filtro'],...[...seen.values()].sort((a,b)=>a.hora.localeCompare(b.hora)).map(m=>[m.id,m.codigo_recibido,m.codigo,m.nombres,m.apellidos,horaVisual730(m.hora),m.terminal,m.serial,m.sentido,m.hora.slice(0,10)>=snapshot.desde&&m.hora.slice(0,10)<=snapshot.hasta?'Si':'Contexto'])]);
   raw['!cols']=[{wch:16},{wch:18},{wch:15},{wch:28},{wch:30},{wch:23},{wch:24},{wch:22},{wch:13},{wch:18}];X.utils.book_append_sheet(workbook,raw,'Marcas originales');
   X.writeFile(workbook,`Porteria_${snapshot.desde}_${snapshot.hasta}.xlsx`);
  }catch(e){estado(e.message||'No se pudo exportar Excel.',true);}
 });
 async function abrir(){
  if(dialog.open){$('npPersona730').focus();return;}
  const now=new Date(),fecha=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(now);
  const desde=document.getElementById('heDesde')?.value||fecha,hasta=document.getElementById('heHasta')?.value||fecha;
  $('npPersona730').value=document.getElementById('heBuscar')?.value||'';$('npNombre730').value=$('npPersona730').value?'CONSULTANDO PERSONA...':'TODAS LAS PERSONAS';
  $('npDesde730').value=fechaVisual730(desde);$('npHasta730').value=fechaVisual730(hasta);descartar();dialog.showModal();$('npGenerar730').focus();
  await generar();
 }
 return {abrir};
}
