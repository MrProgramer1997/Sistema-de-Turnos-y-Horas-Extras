/* Consultas históricas segmentadas para Centro de Control.
   Cero escrituras; cada bloque cabe en el límite de 97 días de los RPC.
   Las respuestas se consolidan solo si TODOS los bloques se completan.
*/
const DAY_MS=86400000;
const day=d=>Date.parse(String(d).slice(0,10)+'T00:00:00Z');
const iso=t=>new Date(t).toISOString().slice(0,10);

export function dividirHistorico(desde,hasta,dias=28){
  const a=day(desde),b=day(hasta);
  if(!Number.isFinite(a)||!Number.isFinite(b)||a>b||!Number.isInteger(dias)||dias<1||dias>90)
    throw new Error('Rango histórico inválido');
  const rangos=[];
  for(let t=a;t<=b;t+=dias*DAY_MS){
    rangos.push({from:iso(t),to:iso(Math.min(b,t+(dias-1)*DAY_MS))});
  }
  return rangos;
}
const ARRAYS=['employees','terminals','externals','extraQueue','links','processes',
  'chefPeople','chefCodes','legacy','general','chef','requests','notices','appliedNotices'];
const filaKey=(name,row)=>{
  if(row?.id!=null)return String(row.id);
  if(name==='terminals')return String(row.sn||JSON.stringify(row));
  if(name==='processes')return String(row.codigo||JSON.stringify(row));
  if(name==='chefCodes')return String(row.codigo||JSON.stringify(row));
  return JSON.stringify(row);
};
export function unirContextos(contextos){
  if(!contextos.length)throw new Error('Contexto histórico incompleto');
  const first=contextos[0],merged={...first},scope=JSON.stringify(first.scope||[]);
  for(const ctx of contextos){
    if(!ctx||JSON.stringify(ctx.scope||[])!==scope)
      throw new Error('Los permisos cambiaron durante la consulta; vuelve a cargar');
  }
  for(const name of ARRAYS){
    const seen=new Set(),out=[];
    for(const ctx of contextos)for(const row of ctx[name]||[]){
      const key=filaKey(name,row);
      if(!seen.has(key)){seen.add(key);out.push(row);}
    }
    merged[name]=out;
  }
  return merged;
}
export function unirMarcaciones(partes){
  const ids=new Set(),rows=[];let expected=0;
  for(const parte of partes){
    if(!parte||!Array.isArray(parte.rows)||!Number.isFinite(parte.total)||parte.total!==parte.rows.length)
      throw new Error('Un bloque de marcaciones quedó incompleto');
    expected+=parte.total;
    for(const row of parte.rows){
      const id=String(row.biotime_id);
      if(ids.has(id))throw new Error('Marcación repetida entre bloques; no se publicó la consulta');
      ids.add(id);rows.push(row);
    }
  }
  if(rows.length!==expected)throw new Error('Total histórico inconsistente');
  return {rows,total:expected};
}
