-- Estado general (§7.3, P54/D61): si ninguna pieza viva salió al taller, hay alguna
-- aprobada y otras todavía no, la restauración queda Parcialmente aprobada. Igual a
-- deriveRestorationStatus() de TypeScript.
create or replace function public.derive_restoration_status(p_pieces jsonb)
returns public.restoration_status
language sql
immutable
set search_path = ''
as $$
  with p as (
    select (e ->> 'status')::public.piece_status as status,
      (e ->> 'approvedAt') is not null as approved,
      (e ->> 'firstSentAt') is not null as sent,
      coalesce((e ->> 'readyForDelivery')::boolean, false) as ready
    from jsonb_array_elements(coalesce(p_pieces, '[]')) e
  ),
  a as (select * from p where status not in ('anulada', 'rechazada', 'sin_arreglo'))
  select case
    when not exists (select 1 from a) then
      case
        when not exists (select 1 from p) then 'registrada'
        when exists (select 1 from p where status in ('rechazada', 'sin_arreglo')) then 'rechazada'
        else 'anulada'
      end
    when (select bool_and(status = 'entregada') from a) then 'completada'
    when (select bool_and(ready or status = 'entregada') from a) then 'lista'
    when (select bool_or(ready or status = 'entregada') from a) then 'parcialmente_lista'
    when (select bool_or(sent) from a) then 'en_proceso'
    when (select bool_and(approved) from a) then 'aprobada'
    when (select bool_or(approved) from a) then 'parcialmente_aprobada'
    else 'registrada'
  end::public.restoration_status;
$$;

-- Las restauraciones registradas que ya tienen piezas aprobadas pasan al estado nuevo
-- (solo avanza: las demás ya están más adelante).
update public.restorations r
set status = 'parcialmente_aprobada'
where r.status = 'registrada'
  and public.derive_restoration_status((
    select coalesce(jsonb_agg(jsonb_build_object(
        'status', p.status, 'approvedAt', p.approved_at, 'firstSentAt', p.first_sent_at,
        'readyForDelivery', p.ready_for_delivery)), '[]')
    from public.pieces p where p.restoration_id = r.id
  )) = 'parcialmente_aprobada';
