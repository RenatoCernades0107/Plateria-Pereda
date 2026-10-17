-- Pieza agregada a una guía ya registrada: sin precio pasa a Consulta, como al registrar.
begin;
select plan(5);

select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from public.profiles where role = 'ventas' limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;

create temp table g as
select * from public.create_restoration(
  (select id from public.clients where active limit 1), null, 'contado', null, '',
  '[{"description": "Primera", "service_name": "Limpieza y pulido"}]'::jsonb);

insert into public.pieces (restoration_id, description, service_name)
select id, 'Agregada', 'Limpieza y pulido' from g;

select public.send_unpriced_to_consultation(array(
  select p.id from public.pieces p join g on g.id = p.restoration_id
  where p.description = 'Agregada'));

select is(
  (select p.status::text from public.pieces p join g on g.id = p.restoration_id
   where p.description = 'Agregada'),
  'en_consulta', 'la pieza agregada sin precio pasa a Consulta');

select is(
  (select h.note from public.piece_status_history h
   join public.pieces p on p.id = h.piece_id join g on g.id = p.restoration_id
   where p.description = 'Agregada' and h.to_status = 'en_consulta'),
  private.unpriced_note(), 'con la misma nota que al registrar la guía');

-- Repetirla no falla ni duplica: la pieza ya no está Registrada.
select lives_ok(
  $$select public.send_unpriced_to_consultation(array(
      select p.id from public.pieces p join g on g.id = p.restoration_id))$$,
  'es idempotente');
select is(
  (select count(*)::int from public.piece_status_history h
   join public.pieces p on p.id = h.piece_id join g on g.id = p.restoration_id
   where p.description = 'Agregada' and h.to_status = 'en_consulta'),
  1, 'un solo paso a Consulta en el historial');

-- Guía interna: la pieza agregada nace Aprobada y no se toca.
create temp table gi as
select * from public.create_restoration(
  (select id from public.clients where active limit 1), null, 'contado', null, '',
  '[{"description": "Interna", "service_name": "Limpieza y pulido"}]'::jsonb, null, 'interno');
insert into public.pieces (restoration_id, description, service_name)
select id, 'Interna agregada', 'Limpieza y pulido' from gi;
select public.send_unpriced_to_consultation(array(
  select p.id from public.pieces p join gi on gi.id = p.restoration_id));
select is(
  (select p.status::text from public.pieces p join gi on gi.id = p.restoration_id
   where p.description = 'Interna agregada'),
  'aprobada', 'en una guía interna la pieza agregada sigue Aprobada');

select * from finish();
rollback;
