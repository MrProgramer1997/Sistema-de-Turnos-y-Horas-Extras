create or replace function public.normalizar_jornada_estandar_ayb_42h()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inicio text;
  v_fin_habil text;
  v_fin_largo text;
  v_jornada_larga boolean;
begin
  if upper(btrim(coalesce(new.area, ''))) <> 'ALIMENTOS Y BEBIDAS'
     or lower(btrim(coalesce(new.tipo_registro, 'turno'))) = 'novedad'
     or new.fecha is null
     or nullif(btrim(coalesce(new.turno, '')), '') is null
     or nullif(btrim(coalesce(new.hora_inicio, '')), '') is null
     or nullif(btrim(coalesce(new.hora_fin, '')), '') is null
     or nullif(btrim(coalesce(new.hora_inicio_2, '')), '') is not null
     or nullif(btrim(coalesce(new.hora_fin_2, '')), '') is not null then
    return new;
  end if;

  select catalogo.inicio, catalogo.fin_habil, catalogo.fin_largo
    into v_inicio, v_fin_habil, v_fin_largo
  from (values
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
  ) as catalogo(turno, inicio, fin_habil, fin_largo)
  where catalogo.turno = btrim(new.turno);

  if not found
     or btrim(new.hora_inicio) <> v_inicio
     or btrim(new.hora_fin) not in (v_fin_habil, v_fin_largo) then
    return new;
  end if;

  select
    extract(isodow from new.fecha)::int in (6, 7)
    or exists (
      select 1
      from public.festivos f
      where f.fecha = new.fecha
        and coalesce(f.activo, true)
    )
  into v_jornada_larga;

  new.hora_inicio := v_inicio;
  new.hora_fin := case when v_jornada_larga then v_fin_largo else v_fin_habil end;
  return new;
end;
$$;

drop trigger if exists trg_normalizar_jornada_estandar_ayb_42h
on public.programacion_turnos;

create trigger trg_normalizar_jornada_estandar_ayb_42h
before insert or update
on public.programacion_turnos
for each row
execute function public.normalizar_jornada_estandar_ayb_42h();

comment on function public.normalizar_jornada_estandar_ayb_42h() is
'Protege los turnos estandar A&B: lunes a viernes 7 h brutas/6,5 h netas; sabados, domingos y festivos 8,5 h brutas/8 h netas, con 0,5 h de receso.';
