with catalogo(turno,inicio,fin_habil,fin_largo) as (
  values
    ('1','05:30','12:30','14:00'),
    ('2','06:00','13:00','14:30'),
    ('3','07:00','14:00','15:30'),
    ('4','08:00','15:00','16:30'),
    ('5','09:00','16:00','17:30'),
    ('6','10:00','17:00','18:30'),
    ('7','11:00','18:00','19:30'),
    ('8','12:00','19:00','20:30'),
    ('9','13:00','20:00','21:30'),
    ('10','14:00','21:00','22:30'),
    ('11','15:00','22:00','23:30')
), candidatos_simples as materialized (
  select p.id
  from public.programacion_turnos p
  join catalogo c on c.turno=p.turno and c.inicio=p.hora_inicio
  where upper(btrim(p.area))='ALIMENTOS Y BEBIDAS'
    and coalesce(p.tipo_registro,'turno') <> 'novedad'
    and p.fecha >= date '2026-07-15'
    and nullif(btrim(coalesce(p.hora_inicio_2,'')),'') is null
    and nullif(btrim(coalesce(p.hora_fin_2,'')),'') is null
    and p.hora_fin in (c.fin_habil,c.fin_largo)
    and p.hora_fin <> case
      when extract(isodow from p.fecha)::int in (6,7)
        or exists (
          select 1 from public.festivos f
          where f.fecha=p.fecha and coalesce(f.activo,true)
        )
      then c.fin_largo else c.fin_habil end
)
update public.programacion_turnos p
set hora_fin=p.hora_fin
from candidatos_simples c
where p.id=c.id;

with catalogo(turno,inicio) as (
  values
    ('1','05:30'),('2','06:00'),('3','07:00'),('4','08:00'),('5','09:00'),('6','10:00'),
    ('7','11:00'),('8','12:00'),('9','13:00'),('10','14:00'),('11','15:00')
), validos as materialized (
  select p.id,p.fecha,p.hora_inicio,p.hora_fin,p.hora_inicio_2,p.hora_fin_2
  from public.programacion_turnos p
  join catalogo c on c.turno=p.turno and c.inicio=p.hora_inicio
  where upper(btrim(p.area))='ALIMENTOS Y BEBIDAS'
    and coalesce(p.tipo_registro,'turno') <> 'novedad'
    and p.fecha >= date '2026-07-15'
    and p.turno_2 in ('1','2','3','4','5','6','7','8','9','10','11')
    and p.hora_inicio ~ '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$'
    and p.hora_fin ~ '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$'
    and p.hora_inicio_2 ~ '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$'
    and p.hora_fin_2 ~ '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$'
), calculados as materialized (
  select v.id,
    round((
      case when v.hora_fin::time >= v.hora_inicio::time
        then extract(epoch from (v.hora_fin::time-v.hora_inicio::time))/60
        else 1440 + extract(epoch from (v.hora_fin::time-v.hora_inicio::time))/60 end
      + case when v.hora_fin_2::time >= v.hora_inicio_2::time
        then extract(epoch from (v.hora_fin_2::time-v.hora_inicio_2::time))/60
        else 1440 + extract(epoch from (v.hora_fin_2::time-v.hora_inicio_2::time))/60 end
    ))::integer as minutos_brutos,
    case when extract(isodow from v.fecha)::int in (6,7)
      or exists (
        select 1 from public.festivos f
        where f.fecha=v.fecha and coalesce(f.activo,true)
      )
      then 510 else 420 end as minutos_esperados
  from validos v
), candidatos_partidos as materialized (
  select id
  from calculados
  where minutos_brutos in (420,510)
    and minutos_brutos <> minutos_esperados
)
update public.programacion_turnos p
set hora_fin_2=p.hora_fin_2
from candidatos_partidos c
where p.id=c.id;
