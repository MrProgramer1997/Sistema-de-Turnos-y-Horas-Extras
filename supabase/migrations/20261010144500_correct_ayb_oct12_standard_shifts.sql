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
)
update public.programacion_turnos p
set hora_fin = c.fin_largo
from catalogo c
where upper(btrim(p.area)) = 'ALIMENTOS Y BEBIDAS'
  and coalesce(p.tipo_registro,'turno') <> 'novedad'
  and p.fecha = date '2026-10-12'
  and exists (
    select 1 from public.festivos f
    where f.fecha=p.fecha and coalesce(f.activo,true)
  )
  and p.turno=c.turno
  and p.hora_inicio=c.inicio
  and p.hora_fin=c.fin_habil
  and nullif(btrim(coalesce(p.hora_inicio_2,'')),'') is null
  and nullif(btrim(coalesce(p.hora_fin_2,'')),'') is null;
