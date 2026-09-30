import {horasTextoOps,minutosNetosOps} from './operaciones-reglas.js?v=745';

// A3 landscape, matching the supplied weekly matrix. No personal identifiers,
// no DOM screenshots, no credentials and no dependence on visible scroll rows.
const COLORS={navy:[25,57,80],blue:[0,74,161],ink:[27,42,59],muted:[83,101,122],grid:[201,214,225],stripe:[243,248,252],sunday:[255,249,239],special:[146,79,28],rest:[231,243,236],news:[255,243,211],empty:[240,243,247],total:[232,242,252],note:[119,53,2],noteBg:[255,226,162],alert:[151,33,40]};
const DAY=['Domingo','Lunes','Martes','Mi\u00e9rcoles','Jueves','Viernes','S\u00e1bado'];
const SHORT_MONTH=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const safe=v=>String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim();
const fecha=d=>new Date(`${d}T12:00:00Z`);
const ddmm=d=>`${d.slice(8,10)}/${d.slice(5,7)}`;
const span=(text,size=8.4,bold=false,color=COLORS.ink,bg=null)=>({text:safe(text),size,bold,color,bg});
function periodoLegible(ds){const a=fecha(ds[0]),b=fecha(ds.at(-1));return `${DAY[a.getUTCDay()]} ${a.getUTCDate()} de ${SHORT_MONTH[a.getUTCMonth()]} al ${DAY[b.getUTCDay()].toLowerCase()} ${b.getUTCDate()} de ${SHORT_MONTH[b.getUTCMonth()]} de ${b.getUTCFullYear()}`;}
function cellLines(doc,spans,width,align='center'){
  const lines=[];
  for(const s of spans){if(!s.text)continue;doc.setFont('helvetica',s.bold?'bold':'normal');doc.setFontSize(s.size);
    const split=doc.splitTextToSize(s.text,width-5);
    for(const text of split)lines.push({...s,text,height:s.size*0.352778*1.22,align});
  }
  return lines;
}
function fragments(record,warning){
  if(!record)return [span('Sin programaci\u00f3n',8,false,COLORS.muted)];
  if(record.tipo_registro!=='turno'){
    const title=record.tipo_registro==='descanso'?'Descanso':record.tipo_registro==='compensatorio'?'Compensatorio':record.novedad_descripcion||'Novedad';
    const result=[span(title,8.8,true),span(record.tipo_registro==='novedad'?record.novedad_codigo:'',8,false,COLORS.muted)];
    if(record.observacion)result.push(span(record.observacion,8.1,true,COLORS.note,COLORS.noteBg));
    return result;
  }
  const hs=String(record.hora_inicio||'').slice(0,5),hf=String(record.hora_fin||'').slice(0,5);
  const result=[span(record.turno_codigo||record.horario_nombre||'Personalizado',7.5,false,COLORS.blue),span(`${hs||'--:--'} - ${hf||'--:--'}${record.cruza_medianoche?' (+1 d\u00eda)':''}`,10,true),span(`${horasTextoOps(minutosNetosOps(record),true)} netas`,8.6),span(`Pausa: ${horasTextoOps(record.minutos_descanso,true)}`,8,false,COLORS.muted)];
  if(record.observacion)result.push(span(record.observacion,8.1,true,COLORS.note,COLORS.noteBg));
  if(warning?.tipo==='sin-intervalo')result.push(span('Revisar horario',7.5,true,COLORS.alert));
  return result;
}
function rowCells(doc,row,section,widths){
  const left=[span(row.numero,8,false,COLORS.muted),span(row.puesto||'SIN PUESTO ASIGNADO',9.2,true)];
  const person=row.persona;
  const names=person?[span(person.nombre,9.4,true),span(person.cargo,8,false,COLORS.muted)]:[span('Sin asignar',9,true)];
  if(person?.externo&&!/externo/i.test(person.cargo))names.push(span('Personal externo',7.6,false,COLORS.muted));
  let any=false,total=0;
  const daily=section.fechas.map((d,i)=>{
    const r=row.registros[i];if(r){any=true;total+=minutosNetosOps(r);}
    return cellLines(doc,fragments(r,row.alertas?.[i]),widths[i+2]);
  });
  return [cellLines(doc,left,widths[0],'left'),cellLines(doc,names,widths[1],'left'),...daily,cellLines(doc,[span(any?horasTextoOps(total):'-',9,true)],widths.at(-1))];
}
function fillFor(row,col,section,index){
  if(col===section.fechas.length+2)return COLORS.total;
  if(col<2)return index%2?COLORS.stripe:[255,255,255];
  const r=row.registros[col-2],d=section.fechas[col-2];
  if(!r)return COLORS.empty;
  if(['descanso','compensatorio'].includes(r.tipo_registro))return COLORS.rest;
  if(r.tipo_registro==='novedad')return COLORS.news;
  if(fecha(d).getUTCDay()===0||section.festivos?.some(f=>f.fecha===d))return COLORS.sunday;
  return index%2?COLORS.stripe:[255,255,255];
}
function drawCell(doc,x,y,w,h,lines,bg){
  doc.setFillColor(...bg);doc.setDrawColor(...COLORS.grid);doc.setLineWidth(.2);doc.rect(x,y,w,h,'FD');
  const content=lines.reduce((n,l)=>n+l.height,0);let top=y+(h-content)/2;
  for(const line of lines){
    if(line.bg){doc.setFillColor(...line.bg);doc.rect(x+1.2,top-.1,w-2.4,line.height+.2,'F');}
    doc.setFont('helvetica',line.bold?'bold':'normal');doc.setFontSize(line.size);doc.setTextColor(...line.color);
    const tx=line.align==='left'?x+2.5:x+w/2;
    doc.text(line.text,tx,top+line.height*.78,{align:line.align});top+=line.height;
  }
}
export function crearPdfCalendarioOps(jsPDF,secciones,{consulta='',etiqueta='Calendario completo'}={}){
  if(!jsPDF)throw new Error('La librer\u00eda PDF no est\u00e1 disponible. Recarga la p\u00e1gina.');
  if(!secciones?.length)throw new Error('No hay una semana cargada para exportar.');
  const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a3',compress:true});
  doc.setProperties({title:'Programaci\u00f3n semanal de Operaciones',subject:'Calendario de turnos sin documentos ni c\u00f3digos de n\u00f3mina',author:'Club Campestre Pereira',creator:'Programaci\u00f3n Operaciones 7.44'});
  let first=true,page=0;
  for(const section of secciones){
    const widths=[40,62,...section.fechas.map(()=>((396-124)/section.fechas.length)),22];
    let y,count;
    function newPage(){
      if(!first)doc.addPage('a3','landscape');first=false;page++;count=0;
      doc.setFillColor(...COLORS.blue);doc.rect(10,9.7,12,1.2,'F');
      doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(...COLORS.navy);doc.text('CLUB CAMPESTRE PEREIRA',26,11);
      doc.setFontSize(23);doc.text('Programaci\u00f3n semanal de Operaciones',10,22);
      doc.setFont('helvetica','normal');doc.setFontSize(10.5);doc.setTextColor(...COLORS.muted);doc.text(periodoLegible(section.fechas),10,29);
      doc.setFontSize(8);doc.text(`${section.puestos} puestos fijos + ${section.sinPuesto} colaboradores sin puesto`,408,10,{align:'right'});
      doc.text(`${etiqueta} | Consulta: ${safe(consulta)} (Colombia)`,408,15,{align:'right'});
      if(section.alertas)doc.text(`Cobertura por revisar: ${section.alertas} puesto(s). Ver alertas en el m\u00f3dulo.`,408,29,{align:'right'});
      y=37;let x=12;
      const titles=['Puesto / turno fijo','Colaborador',...section.fechas.map(d=>`${DAY[fecha(d).getUTCDay()]}\n${ddmm(d)}${section.festivos?.some(f=>f.fecha===d)?'\nFESTIVO':''}`),'Neto\nsemanal'];
      widths.forEach((w,i)=>{
        const d=section.fechas[i-2],special=d&&(fecha(d).getUTCDay()===0||section.festivos?.some(f=>f.fecha===d));
        drawCell(doc,x,y,w,17,cellLines(doc,[span(titles[i],9.1,true,[255,255,255])],w),special?COLORS.special:COLORS.navy);x+=w;
      });
      y+=17;
      doc.setDrawColor(...COLORS.grid);doc.line(10,279,408,279);doc.setFont('helvetica','normal');doc.setFontSize(7.6);doc.setTextColor(...COLORS.muted);
      doc.text('Pausa: alimentaci\u00f3n/descanso registrado. Neto: intervalo programado menos pausa. No es liquidaci\u00f3n de n\u00f3mina.',10,284);
      doc.text('Fuente: programaci\u00f3n y asignaciones semanales de Operaciones en Supabase. Sin programaci\u00f3n no equivale a descanso.',10,289);
      doc.text(`P\u00e1gina ${page}`,408,289,{align:'right'});
    }
    newPage();
    if(!section.filas.length){doc.setFontSize(11);doc.text('No hay filas para este periodo.',12,y+12);continue;}
    for(let ri=0;ri<section.filas.length;ri++){
      const row=section.filas[ri];let cells=rowCells(doc,row,section,widths),continued=false;
      while(cells.some(c=>c.length)){
        let height=Math.max(row.registros.some(Boolean)?24:17,...cells.map(c=>c.reduce((a,l)=>a+l.height,0)+5));
        if((count>=8||y+height>272)&&count>0)newPage();
        const available=272-y;
        // Extremely long notes continue on a new sheet; never truncate to fit.
        const take=[],rest=[];let fragmented=false;
        for(const cell of cells){let used=0,n=0;while(n<cell.length&&used+cell[n].height<=available-5){used+=cell[n].height;n++;}take.push(cell.slice(0,n));rest.push(cell.slice(n));if(n<cell.length)fragmented=true;}
        if(fragmented){height=Math.max(17,...take.map(c=>c.reduce((n,l)=>n+l.height,0)+5));}
        else height=Math.min(height,available);
        if(continued){take[0]=cellLines(doc,[span(row.numero,8),span(row.puesto,8,true),span('(continuaci\u00f3n)',7.5)],widths[0],'left');take[1]=cellLines(doc,[span(row.persona?.nombre||'Sin asignar',8.5,true)],widths[1],'left');}
        let x=12;take.forEach((lines,i)=>{drawCell(doc,x,y,widths[i],height,lines,fillFor(row,i,section,ri));x+=widths[i];});
        if(row.sinPuesto&&!continued){doc.setDrawColor(...COLORS.blue);doc.setLineWidth(.35);doc.line(12,y,408,y);}
        y+=height;count++;
        if(!fragmented)break;
        cells=rest;continued=true;newPage();
      }
    }
  }
  return doc;
}
