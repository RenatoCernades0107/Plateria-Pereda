-- P50 (2026-10-08):
--   1. "Rechazado (cliente)" solo desde "Espera respuesta cliente": es ahí donde el
--      cliente aprueba o rechaza. Antes de eso, una pieza que no sigue se anula.
--   2. Una pieza en Observación (de vuelta del taller o por un reclamo después de la
--      entrega) queda en la ubicación "Sin enviar": está en la tienda, por programar
--      su reenvío al taller.

-- 1. Transiciones. La auditoría pide un id por fila y esta tabla tiene clave
-- compuesta: el cambio no se audita (igual que la siembra de estados_pieza_v2).
alter table public.piece_status_transitions disable trigger audit_changes;
delete from public.piece_status_transitions
where to_status = 'rechazada' and from_status in ('registrada', 'en_consulta');
alter table public.piece_status_transitions enable trigger audit_changes;

-- 2. Ubicación (§7.2): Observación → Sin enviar, en la columna generada y en la función.
alter table public.pieces alter column location set expression as (
  case
    when status = 'anulada' then 'anulada'::public.piece_location
    when status = 'entregada' then 'entregada'::public.piece_location
    when status in ('rechazada', 'sin_arreglo') and returned_at is not null
      then 'entregada'::public.piece_location
    when arrived_at is null then 'por_whatsapp'::public.piece_location
    when status = 'observada' then 'sin_enviar'::public.piece_location
    when status = 'enviada_taller' and not (
      last_returned_at is not null and last_sent_at is not null and last_returned_at >= last_sent_at
    ) then 'en_taller'::public.piece_location
    when first_sent_at is not null then 'en_tienda'::public.piece_location
    else 'sin_enviar'::public.piece_location
  end
);

create or replace function public.derive_piece_location(
  p_status public.piece_status,
  p_arrived_at timestamptz,
  p_first_sent_at timestamptz default null,
  p_last_sent_at timestamptz default null,
  p_last_returned_at timestamptz default null,
  p_returned_at timestamptz default null
)
returns public.piece_location
language sql
immutable
set search_path = ''
as $$
  select case
    when p_status = 'anulada' then 'anulada'::public.piece_location
    when p_status = 'entregada' then 'entregada'::public.piece_location
    when p_status in ('rechazada', 'sin_arreglo') and p_returned_at is not null
      then 'entregada'::public.piece_location
    when p_arrived_at is null then 'por_whatsapp'::public.piece_location
    when p_status = 'observada' then 'sin_enviar'::public.piece_location
    when p_status = 'enviada_taller' and not (
      p_last_returned_at is not null and p_last_sent_at is not null and p_last_returned_at >= p_last_sent_at
    ) then 'en_taller'::public.piece_location
    when p_first_sent_at is not null then 'en_tienda'::public.piece_location
    else 'sin_enviar'::public.piece_location
  end;
$$;
