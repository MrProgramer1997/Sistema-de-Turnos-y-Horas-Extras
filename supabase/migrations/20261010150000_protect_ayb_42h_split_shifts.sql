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
  v_objetivo_min integer;
  v_inicio_1_min integer;
  v_fin_1_min integer;
  v_inicio_2_min integer;
  v_fin_2_min integer;
  v_duracion_1 integer;
  v_duracion_2 integer;
  v_total_min integer;
  v_fin_2_nuevo integer;
begin
  if upper(btrim(coalesce(new.area, ''))) <> 'ALIMENTOS Y BEBIDAS'
     or lower(btrim(coalesce(new.tipo_registro, 'turno'))) = 'novedad'
     or new.fecha is null
     or new.fecha < date '2026-07-15'
     or nullif(btrim(coalesce(new.turno, '')), '') is null
     or nullif(btrim(coalesce(new.hora_inicio, '')), '') is null
     or nullif(btrim(coalesce(new.hora_fin, '')), '') is null then
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

  if not found or btrim(new.hora_inicio) <> v_inicio then
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

  v_objetivo_min := case when v_jornada_larga then 510 else 420 end;

  if nullif(btrim(coalesce(new.hora_inicio_2, '')), '') is null
     and nullif(btrim(coalesce(new.hora_fin_2, '')), '') is null then
    if btrim(new.hora_fin) in (v_fin_habil, v_fin_largo) then
      new.hora_inicio := v_inicio;
      new.hora_fin := case when v_jornada_larga then v_fin_largo else v_fin_habil end;
    end if;
    return new;
  end if;

  if nullif(btrim(coalesce(new.hora_inicio_2, '')), '') is null
     or nullif(btrim(coalesce(new.hora_fin_2, '')), '') is null
     or btrim(coalesce(new.turno_2, '')) not in ('1','2','3','4','5','6','7','8','9','10','11')
     or btrim(new.hora_inicio) !~ '^([0-9]{1,2}):([0-9]{2})$'
     or btrim(new.hora_fin) !~ '^([0-9]{1,2}):([0-9]{2})$'
     or btrim(new.hora_inicio_2) !~ '^([0-9]{1,2}):([0-9]{2})$'
     or btrim(new.hora_fin_2) !~ '^([0-9]{1,2}):([0-9]{2})$' then
    return new;
  end if;

  v_inicio_1_min := split_part(btrim(new.hora_inicio), ':', 1)::integer * 60
                    + split_part(btrim(new.hora_inicio), ':', 2)::integer;
  v_fin_1_min := split_part(btrim(new.hora_fin), ':', 1)::integer * 60
                 + split_part(btrim(new.hora_fin), ':', 2)::integer;
  v_inicio_2_min := split_part(btrim(new.hora_inicio_2), ':', 1)::integer * 60
                    + split_part(btrim(new.hora_inicio_2), ':', 2)::integer;
  v_fin_2_min := split_part(btrim(new.hora_fin_2), ':', 1)::integer * 60
                 + split_part(btrim(new.hora_fin_2), ':', 2)::integer;

  if v_inicio_1_min < 0 or v_inicio_1_min >= 1440
     or v_fin_1_min < 0 or v_fin_1_min >= 1440
     or v_inicio_2_min < 0 or v_inicio_2_min >= 1440
     or v_fin_2_min < 0 or v_fin_2_min >= 1440 then
    return new;
  end if;

  v_duracion_1 := case
    when v_fin_1_min >= v_inicio_1_min then v_fin_1_min - v_inicio_1_min
    else 1440 - v_inicio_1_min + v_fin_1_min
  end;
  v_duracion_2 := case
    when v_fin_2_min >= v_inicio_2_min then v_fin_2_min - v_inicio_2_min
    else 1440 - v_inicio_2_min + v_fin_2_min
  end;
  v_total_min := v_duracion_1 + v_duracion_2;

  if v_total_min not in (420, 510) or v_total_min = v_objetivo_min then
    return new;
  end if;

  v_fin_2_nuevo := ((v_fin_2_min + (v_objetivo_min - v_total_min)) % 1440 + 1440) % 1440;
  new.hora_fin_2 := lpad((v_fin_2_nuevo / 60)::text, 2, '0')
                    || ':' || lpad((v_fin_2_nuevo % 60)::text, 2, '0');
  return new;
end;
$$;

comment on function public.normalizar_jornada_estandar_ayb_42h() is
'Protege desde el 15-07-2026 los turnos estandar simples y partidos A&B: lunes a viernes 7 h brutas/6,5 h netas; sabados, domingos y festivos 8,5 h brutas/8 h netas, con 0,5 h de receso.';
