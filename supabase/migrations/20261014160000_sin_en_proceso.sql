-- Sin el estado general "En proceso" (pedido del 2026-10-13, P56/D65).
--   * El estado general ya no pasa a "En proceso" cuando una pieza sale al taller:
--     mientras tanto la guía queda Aprobada o Parcialmente aprobada, y avanza a
--     Parcialmente lista / Lista cuando vuelven las piezas (§7.3; solo avanza, P19).
--   * El valor 'en_proceso' queda en el enum restoration_status sin uso: quitarlo
--     obligaría a recrear el tipo y todas las funciones y vistas que lo usan. Un check
--     impide guardarlo.

create or replace function public.derive_restoration_status(p_pieces jsonb)
returns public.restoration_status
language sql
immutable
set search_path = ''
as $$
  with p as (
    select (e ->> 'status')::public.piece_status as status,
      (e ->> 'approvedAt') is not null as approved,
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
    when (select bool_and(approved) from a) then 'aprobada'
    when (select bool_or(approved) from a) then 'parcialmente_aprobada'
    else 'registrada'
  end::public.restoration_status;
$$;

-- Las guías En proceso pasan al estado que les corresponde sin él (Aprobada o
-- Parcialmente aprobada; nunca vuelven a Registrada porque ya tienen piezas aprobadas).
update public.restorations r
set status = public.derive_restoration_status((
  select coalesce(jsonb_agg(jsonb_build_object(
      'status', p.status, 'approvedAt', p.approved_at, 'firstSentAt', p.first_sent_at,
      'readyForDelivery', p.ready_for_delivery)), '[]')
  from public.pieces p where p.restoration_id = r.id
))
where r.status = 'en_proceso';

alter table public.restorations
  add constraint restorations_status_sin_en_proceso check (status <> 'en_proceso');
