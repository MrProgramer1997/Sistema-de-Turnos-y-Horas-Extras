// Deterministic proposal builder. All writes are made by the checked weekly RPC.
export const ROLES_AUTO_OPS = {rotar_h:'Rotación hombres',rotar_m:'Rotación mujeres',fijo:'Puesto fijo',flexible:'Patín adicional',apoyo_am:'Apoyo de mañana',apoyo_pm:'Apoyo de tarde',coordinador:'Coordinación',excluir:'No incluir'};
export const NOVEDADES_AUTO_OPS = {VAC:'Vacaciones',INC:'Incapacidad',F:'Día de la familia',CUMPLE:'Cumpleaños',VOT:'Votaciones',DP:'Descanso pendiente',DF:'Descanso festivo',LR:'Licencia no remunerada',CITA:'Cita',SP:'Suspensión',NNJ:'Novedad no justificada'};
const dia = (s,n=0) => {const d=new Date(`${s}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
export const semanaAutoOps = s => {const d=new Date(`${s}T12:00:00Z`);return dia(s,-((d.getUTCDay()+6)%7));};
export const fechasAutoOps = s => Array.from({length:7},(_,i)=>dia(s,i));
export const minutosAutoOps = r => {if(r?.tipo_registro!=='turno'||!r.hora_inicio||!r.hora_fin)return 0;const m=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));return (m(r.hora_fin)-m(r.hora_inicio)+ (r.hora_fin<r.hora_inicio?1440:0))-Number(r.minutos_descanso||0);};
export function sugerirConfiguracionOps(ctx){
 const org=ctx.organizacion,personal=ctx.programacion.personal,ps=org.puestos;
 const id=k=>ps.find(p=>p.clave===k)?.id||'';
 const hombres=[3,4,5,6,7,8,9,10,11].map(n=>id(`PLANTILLA_FILA_${n}`));
 const mujeres=[17,18,19,20,21].map(n=>id(`PLANTILLA_FILA_${n}`)).concat(id('OPS_AUTO_HOYO19'),[22,23,24].map(n=>id(`PLANTILLA_FILA_${n}`)));
 const tipos={PLANTILLA_FILA_2:'normal',PLANTILLA_FILA_12:'flexible',PLANTILLA_FILA_13:'vestier_h_pm',PLANTILLA_FILA_14:'vestier_h_am',PLANTILLA_FILA_15:'vestier_h_pm',PLANTILLA_FILA_25:'damas_pm',PLANTILLA_FILA_26:'damas_am',PLANTILLA_FILA_27:'tenis_am',PLANTILLA_FILA_28:'tenis_pm',PLANTILLA_FILA_29:'porteria',PLANTILLA_FILA_30:'porteria',PLANTILLA_FILA_31:'parqueadero'};
 const puestos=ps.map(p=>{let tipo=tipos[p.clave]||'normal';if(hombres.slice(6).includes(p.id)||mujeres.slice(6).includes(p.id))tipo='flexible';const sexo=mujeres.includes(p.id)||/damas|tenis_/.test(tipo)?'F':hombres.includes(p.id)||tipo.startsWith('vestier_h')||p.clave==='PLANTILLA_FILA_2'||p.clave==='PLANTILLA_FILA_12'?'M':'';return {id:p.id,tipo,sexo,obligatorio:tipo!=='flexible',normal:'historial',aseo:'historial',especial:'historial',referencia_id:p.clave==='OPS_AUTO_HOYO19'?id('PLANTILLA_FILA_21'):p.id};});
 const anteriores=org.asignaciones.filter(a=>a.semana<ctx.semana).sort((a,b)=>b.semana.localeCompare(a.semana));
 const personas=personal.map(p=>{const a=anteriores.find(a=>a.empleado_id===p.empleado_id),puesto=puestos.find(x=>x.id===a?.puesto_id),hist=anteriores.filter(x=>x.empleado_id===p.empleado_id);let rol=p.proceso_codigo==='OPS_COORDINADOR'?'coordinador':hombres.includes(a?.puesto_id)?'rotar_h':mujeres.includes(a?.puesto_id)?'rotar_m':puesto?.tipo==='flexible'?'flexible':a?'fijo':'excluir';return {empleado_id:p.empleado_id,rol,sexo:puesto?.sexo||'',puesto_id:a?.puesto_id||'',alternar:rol==='fijo'&&/^(damas_|vestier_h_[ap]m)/.test(puesto?.tipo||'')&&hist.some(x=>x.puesto_id!==a?.puesto_id),turno_apoyo:'historial'};});
 return {confirmada:false,ciclos:{hombres,mujeres},puestos,personas,aseo_festivo:'revisar',reconocidos:{F:420,CUMPLE:420,VOT:420,DP:420,DF:420}};
}
const clave=(id,f)=>`${id}|${f}`;
function intervalo(r){const a=Date.parse(`${r.fecha}T${r.hora_inicio}:00Z`),b=Date.parse(`${r.fecha}T${r.hora_fin}:00Z`)+(r.hora_fin<r.hora_inicio?86400000:0);return [a,b];}
const trabaja=r=>r?.tipo_registro==='turno'&&minutosAutoOps(r)>0;
function registroDesde(j,u,fecha){return {empleado_id:u.empleado_id,proceso_id:u.proceso_id,es_externo:!!u.es_externo,fecha,tipo_registro:'turno',personalizado:true,hora_inicio:j.hora_inicio,hora_fin:j.hora_fin,minutos_descanso:Number(j.minutos_descanso||0),observacion:null};}
export function generarSemanaOps(ctx,condiciones=[]){
 const cfg=ctx.configuracion,fechas=fechasAutoOps(ctx.semana),personas=new Map(ctx.programacion.personal.map(p=>[p.empleado_id,p])),puestos=new Map(ctx.organizacion.puestos.map(p=>[p.id,p]));
 const perfiles=new Map((cfg?.personas||[]).map(p=>[p.empleado_id,p])),reglas=new Map((cfg?.puestos||[]).map(p=>[p.id,p]));
 const ubicaciones=ctx.ubicaciones||[],ubicados=new Map(ubicaciones.map(u=>[u.empleado_id,u])),titulares=new Map(ubicaciones.filter(u=>u.puesto_id).map(u=>[u.puesto_id,u]));
 const plantillas=new Map((ctx.jornadas||[]).map(j=>[clave(j.puesto_id||j.empleado_id,j.fecha),j]));
 const errores=[...(ctx.pendientes||[])],avisos=[],novedades=new Map(),fijos=new Map(),descansos=new Map(),registros=new Map();
 const nombre=id=>{const p=personas.get(id);return p?[p.nombres,p.apellidos].filter(Boolean).join(' '):id;};
 const pendiente=(mensaje,fecha='',puesto_id='')=>({mensaje,fecha,puesto_id});
 if(!cfg?.confirmada)errores.push(pendiente('Confirma los grupos, el sexo de cobertura y los horarios en Reglas de generación.'));
 if(ctx.ocupada)errores.push(pendiente('Esta semana ya tiene programación o puestos asignados. Elige una semana vacía para conservar los cambios existentes.'));
 if(ctx.lunes_festivo&&cfg?.aseo_festivo==='revisar')errores.push(pendiente('Define si el aseo general se mantiene o se traslada al martes en este lunes festivo.'));
 for(const c of condiciones){
  if(!ubicados.has(c.empleado_id)){errores.push(pendiente('La condición corresponde a una persona no incluida en la propuesta.'));continue;}
  if(c.tipo==='descanso'){
   if(!fechas.includes(c.desde)||c.hasta&&c.hasta!==c.desde||fijos.has(c.empleado_id)){errores.push(pendiente(`Revisa el descanso solicitado de ${nombre(c.empleado_id)}.`));continue;}fijos.set(c.empleado_id,c.desde);
  }else{
   if(!NOVEDADES_AUTO_OPS[c.codigo]||!fechas.includes(c.desde)||!fechas.includes(c.hasta)||c.hasta<c.desde){errores.push(pendiente(`Revisa la novedad de ${nombre(c.empleado_id)}.`));continue;}
   for(const f of fechas.filter(f=>f>=c.desde&&f<=c.hasta)){const k=clave(c.empleado_id,f);if(novedades.has(k))errores.push(pendiente(`Hay novedades superpuestas para ${nombre(c.empleado_id)}.`,f));novedades.set(k,c);}
  }
 }
 // Rests established by policy precede the distributed rests.
 const descansoPorteria=dia(ctx.semana,ctx.lunes_festivo?1:0);
 for(const u of ubicaciones){const rol=perfiles.get(u.empleado_id)?.rol,tipo=reglas.get(u.puesto_id)?.tipo;
  if(['porteria','parqueadero'].includes(tipo))descansos.set(u.empleado_id,descansoPorteria);
  if(['apoyo_am','apoyo_pm','coordinador'].includes(rol))descansos.set(u.empleado_id,fechas[6]);
 }
 for(const grupo of [['damas_am','damas_pm'],['tenis_am','tenis_pm']]){
  const par=ubicaciones.filter(u=>grupo.includes(reglas.get(u.puesto_id)?.tipo));if(par.length!==2){errores.push(pendiente(`Completa los dos puestos ${grupo[0].startsWith('damas')?'de Vestier Damas':'de Tenis mujeres'}.`));continue;}
  if(par.some(u=>fijos.has(u.empleado_id)&&![fechas[0],fechas[1]].includes(fijos.get(u.empleado_id)))&&!par.some(u=>[fechas[0],fechas[1]].includes(fijos.get(u.empleado_id))))continue;
  let a=par.find(u=>fijos.get(u.empleado_id)===fechas[0]),b=par.find(u=>fijos.get(u.empleado_id)===fechas[1]);
  if(a&&b&&a===b){errores.push(pendiente('El cruce lunes/martes tiene descansos incompatibles.'));continue;}
  if(!a&&b)a=par.find(u=>u!==b);
  if(!a){const anterior=ctx.programacion.programacion.filter(r=>par.some(u=>u.empleado_id===r.empleado_id)&&r.tipo_registro==='descanso'&&new Date(`${r.fecha}T12:00:00Z`).getUTCDay()===1&&r.fecha<ctx.semana).sort((a,b)=>b.fecha.localeCompare(a.fecha))[0];a=par.find(u=>u.empleado_id===anterior?.empleado_id)||par[0];}
  b=par.find(u=>u!==a);descansos.set(a.empleado_id,fechas[0]);descansos.set(b.empleado_id,fechas[1]);
 }
 for(const [id,f] of fijos){if(descansos.has(id)&&descansos.get(id)!==f)errores.push(pendiente(`El descanso de ${nombre(id)} contradice una regla fija.`,f));else descansos.set(id,f);}
 for(const [id,f] of descansos)if(novedades.has(clave(id,f))&&fijos.has(id))errores.push(pendiente(`El descanso solicitado de ${nombre(id)} coincide con una novedad.`,f));
 const propio=(u,f)=>plantillas.get(clave(u.puesto_id||u.empleado_id,f));
 const compatible=(u,j)=>{const perfil=perfiles.get(u.empleado_id),regla=reglas.get(j.puesto_id);return (!regla?.sexo||perfil?.sexo===regla.sexo)&&!(perfil?.rol==='apoyo_am'&&j.hora_inicio>='12:00')&&!(perfil?.rol==='apoyo_pm'&&j.hora_inicio<'12:00');};
 function construir(){
  registros.clear();for(const u of ubicaciones)for(const f of fechas){
   const nov=novedades.get(clave(u.empleado_id,f)),j=propio(u,f);let r;
   if(nov)r={empleado_id:u.empleado_id,proceso_id:u.proceso_id,es_externo:!!u.es_externo,fecha:f,tipo_registro:'novedad',novedad_codigo:nov.codigo,novedad_descripcion:NOVEDADES_AUTO_OPS[nov.codigo],observacion:nov.observacion||null};
   else if(descansos.get(u.empleado_id)===f)r={empleado_id:u.empleado_id,proceso_id:u.proceso_id,es_externo:!!u.es_externo,fecha:f,tipo_registro:'descanso',observacion:null};
   else if(j?.hora_inicio&&j?.hora_fin)r=registroDesde(j,u,f);
   else r={empleado_id:u.empleado_id,proceso_id:u.proceso_id,es_externo:!!u.es_externo,fecha:f,tipo_registro:'pendiente'};
   registros.set(clave(u.empleado_id,f),r);
  }
 }
 function cubrir(guardar=false){
  const relevos=[],faltantes=[];const usados=new Set();
  const necesidades=[];
  for(const p of cfg?.puestos||[])if(p.obligatorio&&p.tipo!=='flexible')for(const f of fechas){
   if(['porteria','parqueadero'].includes(p.tipo)&&f===descansoPorteria)continue;
   const u=titulares.get(p.id),j=plantillas.get(clave(p.id,f));
   if(u&&trabaja(registros.get(clave(u.empleado_id,f)))&&compatible(u,{...j,puesto_id:p.id}))continue;
   necesidades.push({p,f,u,j});
  }
  const disponibles=({p,f,j})=>ubicaciones.filter(u=>{const r=registros.get(clave(u.empleado_id,f)),regla=reglas.get(u.puesto_id);return perfiles.get(u.empleado_id)?.rol!=='coordinador'&&j?.hora_inicio&&trabaja(r)&&(!regla?.obligatorio||regla.tipo==='flexible')&&compatible(u,{...j,puesto_id:p.id});}).length;
  // Cover the most constrained interval first so an AM/PM support is not stranded.
  necesidades.sort((a,b)=>a.f.localeCompare(b.f)||disponibles(a)-disponibles(b)||(a.p.sexo?0:1)-(b.p.sexo?0:1)||((puestos.get(a.p.id)?.orden||0)-(puestos.get(b.p.id)?.orden||0)));
  for(const {p,f,j} of necesidades){
   if(!j?.hora_inicio||!j?.hora_fin){faltantes.push(pendiente(`Falta horario ${f===fechas[6]?'de domingo':ctx.programacion.festivos.some(x=>x.fecha===f)?'de festivo':'operativo'} para ${puestos.get(p.id)?.nombre||'el puesto'}.`,f,p.id));continue;}
   const candidatos=ubicaciones.filter(u=>{
    const perfil=perfiles.get(u.empleado_id),r=registros.get(clave(u.empleado_id,f)),regla=reglas.get(u.puesto_id);
    return perfil?.rol!=='coordinador'&&!usados.has(clave(u.empleado_id,f))&&trabaja(r)&&(!regla?.obligatorio||regla.tipo==='flexible')&&compatible(u,{...j,puesto_id:p.id})&&u.puesto_id!==p.id&&fechas.every(otro=>{if(otro===f)return true;const vecino=registros.get(clave(u.empleado_id,otro));if(!trabaja(vecino))return true;const [a,b]=intervalo({...j,fecha:f}),[x,y]=intervalo(vecino);return b<=x||a>=y;});
   }).sort((a,b)=>{
    const peso=u=>{const perfil=perfiles.get(u.empleado_id);if(/^apoyo_/.test(perfil?.rol||''))return 3;const index=[...(cfg?.ciclos?.hombres||[]).slice(6),...(cfg?.ciclos?.mujeres||[]).slice(6)].indexOf(u.puesto_id);return index>=0?index%3:perfil?.rol==='flexible'?2:4;};return peso(a)-peso(b)||nombre(a.empleado_id).localeCompare(nombre(b.empleado_id));
   });
   const u=candidatos[0];if(!u){faltantes.push(pendiente(`Sin relevo ${p.sexo==='F'?'femenino':p.sexo==='M'?'masculino':'disponible'} para ${puestos.get(p.id)?.nombre||'el puesto'}.`,f,p.id));continue;}
   usados.add(clave(u.empleado_id,f));relevos.push({puesto_id:p.id,fecha:f,empleado_id:u.empleado_id});
   if(guardar){const r=registroDesde(j,u,f);r.observacion=`Relevo: ${puestos.get(p.id)?.nombre||'puesto'}; conserva su rotación semanal.`;registros.set(clave(u.empleado_id,f),r);}
  }
  return {relevos,faltantes};
 }
 // Greedy distribution scores actual coverability, rather than only head count.
 const restantes=ubicaciones.filter(u=>!descansos.has(u.empleado_id)&&!fechas.every(f=>novedades.has(clave(u.empleado_id,f))));
 restantes.sort((a,b)=>Number(!reglas.get(a.puesto_id)?.obligatorio)-Number(!reglas.get(b.puesto_id)?.obligatorio)||nombre(a.empleado_id).localeCompare(nombre(b.empleado_id)));
 for(const u of restantes){
  const candidatos=fechas.filter(f=>!novedades.has(clave(u.empleado_id,f)));let mejor=candidatos[0],puntaje=Infinity;
  for(const f of candidatos){descansos.set(u.empleado_id,f);construir();const deficit=cubrir().faltantes.length,carga=[...descansos.values()].filter(x=>x===f).length,misma=ubicaciones.filter(x=>x.empleado_id!==u.empleado_id&&descansos.get(x.empleado_id)===f&&reglas.get(x.puesto_id)?.sexo===perfiles.get(u.empleado_id)?.sexo).length;const valor=deficit*10000+carga*10+misma*5+(f===fechas[6]?4:0);if(valor<puntaje){puntaje=valor;mejor=f;}}
  descansos.set(u.empleado_id,mejor);
 }
 // Improve only freely distributed rests; fixed requests and Monday/Tuesday pairs stay put.
 const libres=restantes.filter(u=>!fijos.has(u.empleado_id));
 for(let vuelta=0;vuelta<2;vuelta++)for(const u of libres){construir();let actual=descansos.get(u.empleado_id),min=cubrir().faltantes.length;for(const f of fechas.filter(f=>!novedades.has(clave(u.empleado_id,f)))){descansos.set(u.empleado_id,f);construir();const n=cubrir().faltantes.length;if(n<min){min=n;actual=f;}}descansos.set(u.empleado_id,actual);}
 construir();const cobertura=cubrir(true);errores.push(...cobertura.faltantes);
 for(const r of registros.values()){
  const perfil=perfiles.get(r.empleado_id);if(r.tipo_registro==='pendiente')errores.push(pendiente(`Falta horario para ${nombre(r.empleado_id)}.`,r.fecha));
  if(trabaja(r)){if(perfil?.rol==='apoyo_am'&&r.hora_inicio>='12:00'||perfil?.rol==='apoyo_pm'&&r.hora_inicio<'12:00')errores.push(pendiente(`El horario de ${nombre(r.empleado_id)} contradice su apoyo de ${perfil.rol==='apoyo_am'?'mañana':'tarde'}.`,r.fecha));const relevo=cobertura.relevos.find(x=>x.empleado_id===r.empleado_id&&x.fecha===r.fecha),regla=reglas.get(relevo?.puesto_id||ubicados.get(r.empleado_id)?.puesto_id);if(regla?.tipo.endsWith('_am')&&r.hora_inicio>='12:00'||regla?.tipo.endsWith('_pm')&&r.hora_inicio<'12:00')errores.push(pendiente(`Revisa el horario AM/PM de ${nombre(r.empleado_id)}.`,r.fecha));if(minutosAutoOps(r)>720)avisos.push(pendiente(`Jornada de más de 12 horas para ${nombre(r.empleado_id)}; revisa el horario seleccionado.`,r.fecha));}
 }
 for(const u of ubicaciones){const rs=fechas.map(f=>registros.get(clave(u.empleado_id,f)));for(let i=0;i<6;i++)if(trabaja(rs[i])&&trabaja(rs[i+1])){const [a,b]=intervalo(rs[i]),[x,y]=intervalo(rs[i+1]);if(a<y&&x<b)errores.push(pendiente(`Los turnos de ${nombre(u.empleado_id)} se cruzan al pasar medianoche.`,rs[i+1].fecha));}}
 for(const r of registros.values())if(trabaja(r))for(const vecino of ctx.bloqueos||[])if(vecino.empleado_id===r.empleado_id){const [a,b]=intervalo(r),[x,y]=intervalo({...vecino,tipo_registro:'turno'});if(a<y&&x<b)errores.push(pendiente(`Otra jornada de ${nombre(r.empleado_id)} se cruza con este horario.`,r.fecha));}
 const resumen=ubicaciones.map(u=>{const rs=fechas.map(f=>registros.get(clave(u.empleado_id,f))),trabajados=rs.reduce((n,r)=>n+Math.max(0,minutosAutoOps(r)),0),reconocidos=rs.reduce((n,r)=>n+(r.tipo_registro==='novedad'?Number(cfg?.reconocidos?.[r.novedad_codigo]||0):0),0);return {...u,nombre:nombre(u.empleado_id),puesto:puestos.get(u.puesto_id)?.nombre||ROLES_AUTO_OPS[perfiles.get(u.empleado_id)?.rol]||'Sin puesto',trabajados,reconocidos,adicionales:Math.max(0,trabajados+reconocidos-2520),descanso:descansos.get(u.empleado_id)||'',registros:rs};});
 if(ctx.lunes_festivo)avisos.push(pendiente(`Lunes festivo: Portería y Parqueadero descansan el martes. Aseo general: ${cfg?.aseo_festivo==='martes'?'martes':'según horarios confirmados'}.`));
 return {semana:ctx.semana,huella:ctx.huella,asignaciones:ubicaciones.filter(u=>u.puesto_id).map(u=>({puesto_id:u.puesto_id,empleado_id:u.empleado_id})),registros:[...registros.values()],relevos:cobertura.relevos,condiciones,resumen,errores:[...new Map(errores.map(e=>[`${e.mensaje}|${e.fecha||''}|${e.puesto_id||''}`,e])).values()],avisos};
}
