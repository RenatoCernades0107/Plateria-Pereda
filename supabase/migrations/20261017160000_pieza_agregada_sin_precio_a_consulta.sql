-- Pieza agregada sin precio (2026-10-17). "Agregar pieza" en una guía ya registrada
-- inserta la fila directo y la pieza quedaba Registrada; al registrar la guía, en
-- cambio, la pieza sin precio pasa a Consulta (20261014200000). Esta función aplica la
-- misma regla a las piezas agregadas después: la app la llama al insertar.
--   * Solo mueve piezas Registradas, sin precio y de guías normales (las internas u
--     observadas no se cotizan).
--   * El cambio pasa por change_piece_status: valida el rol y deja el historial con
--     la misma nota que el registro.
create function public.send_unpriced_to_consultation(p_piece_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_unpriced uuid[];
begin
  select coalesce(array_agg(p.id order by p.code), '{}'::uuid[]) into v_unpriced
  from public.pieces p
  join public.restorations r on r.id = p.restoration_id
  where p.id = any (p_piece_ids)
    and p.status = 'registrada'
    and p.price is null
    and r.kind = 'normal';
  if cardinality(v_unpriced) > 0 then
    perform public.change_piece_status(v_unpriced, 'en_consulta', private.unpriced_note());
  end if;
end;
$$;

revoke execute on function public.send_unpriced_to_consultation(uuid[]) from public, anon;
grant execute on function public.send_unpriced_to_consultation(uuid[]) to authenticated;
