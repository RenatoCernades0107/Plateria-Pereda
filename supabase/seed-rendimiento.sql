-- Volumen para medir rendimiento (Paso 15.3). NO se carga con `pnpm db:reset`: se
-- aplica a mano sobre la BD local, después del seed normal y de seed-volumen.sql:
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/seed-volumen.sql
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/seed-rendimiento.sql
--
-- Copia las guías que ya hay (la copia n de RES-00012 es RES-n00012) (con sus piezas, historial de estados y pagos) hasta pasar
-- de 5 000 guías, corriendo cada copia unos días hacia atrás para repartirlas en ~2 años,
-- y agrega clientes. Escribe directo con los disparadores apagados (las copias ya traen
-- sus estados, totales y códigos), así que no genera auditoría, alertas ni colas hacia
-- Shopify. Es determinista: los ids nuevos salen del id original y el número de copia.

begin;

select set_config('seed.copias', '40', true);

alter table public.clients disable trigger user;
alter table public.restorations disable trigger user;
alter table public.pieces disable trigger user;
alter table public.piece_status_history disable trigger user;
alter table public.payments disable trigger user;

create function pg_temp.nuevo_id(p_id uuid, p_copia int) returns uuid
language sql immutable as $$ select md5(p_id::text || ':' || p_copia)::uuid $$;

-- Columnas que se copian tal cual (sin las generadas ni las identity).
create function pg_temp.columnas(p_tabla text, p_excluir text[], p_alias text) returns text
language sql stable as $$
  select string_agg(coalesce(p_alias || '.', '') || quote_ident(column_name), ', ' order by ordinal_position)
  from information_schema.columns
  where table_schema = 'public' and table_name = p_tabla
    and is_generated = 'NEVER' and is_identity = 'NO'
    and column_name <> all (p_excluir)
$$;

do $$
declare
  v_copias int := current_setting('seed.copias')::int;
  v_cols text;
  v_sel text;
begin
  -- 2 000 clientes más (ya "sincronizados": con id de Shopify).
  insert into public.clients (id, kind, first_name, last_name, document_type, document_number,
                              phone, shopify_customer_id, created_at)
  select md5('cliente-rendimiento:' || g)::uuid, 'persona',
         (array['Ana','Luis','María','Jorge','Rosa','Carlos','Lucía','Pedro'])[1 + g % 8],
         (array['Quispe','Flores','Rojas','Huamán','Torres','Díaz','Vargas','Mendoza'])[1 + (g / 8) % 8] || ' ' || g,
         'dni', lpad((40000000 + g)::text, 8, '0'), '+519' || lpad(g::text, 8, '0'),
         'gid://shopify/Customer/rend-' || g, now() - make_interval(days => g % 730)
  from generate_series(1, 2000) g
  on conflict do nothing;

  -- Guías: mismas columnas, id y código nuevos, fechas corridas y repartidas entre los
  -- clientes nuevos (las de WhatsApp se copian como de oficina: sin su cotización).
  v_cols := pg_temp.columnas('restorations', array['id', 'code', 'client_id', 'contact_id',
    'created_at', 'updated_at', 'shopify_order_id', 'shopify_order_name', 'whatsapp_quote_id', 'origin'], null);
  v_sel := pg_temp.columnas('restorations', array['id', 'code', 'client_id', 'contact_id',
    'created_at', 'updated_at', 'shopify_order_id', 'shopify_order_name', 'whatsapp_quote_id', 'origin'], 'r');
  execute format($f$
    insert into public.restorations (id, code, client_id, created_at, updated_at, origin, %1$s)
    select pg_temp.nuevo_id(r.id, c), 'RES-' || (c * 100000 + substr(r.code, 5)::int),
           md5('cliente-rendimiento:' || (1 + abs(hashtext(r.id::text || c)) %% 2000))::uuid,
           r.created_at - make_interval(days => c * 17), r.updated_at - make_interval(days => c * 17),
           'oficina', %3$s
    from public.restorations r cross join generate_series(1, %2$s) c
    where substr(r.code, 5)::int < 100000
  $f$, v_cols, v_copias, v_sel);

  v_cols := pg_temp.columnas('pieces', array['id', 'restoration_id', 'code', 'whatsapp_quote_item_id'], null);
  v_sel := pg_temp.columnas('pieces', array['id', 'restoration_id', 'code', 'whatsapp_quote_item_id'], 'p');
  execute format($f$
    insert into public.pieces (id, restoration_id, code, %1$s)
    select pg_temp.nuevo_id(p.id, c), pg_temp.nuevo_id(p.restoration_id, c),
           'RES-' || (c * 100000 + split_part(p.code, '-', 2)::int) || '-' || split_part(p.code, '-', 3), %3$s
    from public.pieces p
    join public.restorations r on r.id = p.restoration_id and substr(r.code, 5)::int < 100000
    cross join generate_series(1, %2$s) c
  $f$, v_cols, v_copias, v_sel);

  -- Las fechas de las piezas e historial se corren igual que su guía.
  update public.pieces p set
    created_at = p.created_at - make_interval(days => c.n * 17),
    approved_at = p.approved_at - make_interval(days => c.n * 17),
    first_sent_at = p.first_sent_at - make_interval(days => c.n * 17),
    last_sent_at = p.last_sent_at - make_interval(days => c.n * 17),
    last_returned_at = p.last_returned_at - make_interval(days => c.n * 17),
    arrived_at = p.arrived_at - make_interval(days => c.n * 17),
    delivered_at = p.delivered_at - make_interval(days => c.n * 17)
  from (select substr(code, 5)::int / 100000 as n, id from public.restorations
        where substr(code, 5)::int >= 100000) c
  where p.restoration_id = c.id;

  v_cols := pg_temp.columnas('piece_status_history', array['id', 'piece_id', 'restoration_id', 'occurred_at'], null);
  v_sel := pg_temp.columnas('piece_status_history', array['id', 'piece_id', 'restoration_id', 'occurred_at'], 'h');
  execute format($f$
    insert into public.piece_status_history (piece_id, restoration_id, occurred_at, %1$s)
    select pg_temp.nuevo_id(h.piece_id, c), pg_temp.nuevo_id(h.restoration_id, c),
           h.occurred_at - make_interval(days => c * 17), %3$s
    from public.piece_status_history h
    join public.restorations r on r.id = h.restoration_id and substr(r.code, 5)::int < 100000
    cross join generate_series(1, %2$s) c
  $f$, v_cols, v_copias, v_sel);

  v_cols := pg_temp.columnas('payments', array['id', 'restoration_id', 'paid_on', 'created_at',
    'refunded_payment_id', 'shopify_transaction_id', 'shopify_order_id', 'shopify_order_name'], null);
  v_sel := pg_temp.columnas('payments', array['id', 'restoration_id', 'paid_on', 'created_at',
    'refunded_payment_id', 'shopify_transaction_id', 'shopify_order_id', 'shopify_order_name'], 'p');
  execute format($f$
    insert into public.payments (id, restoration_id, paid_on, created_at, refunded_payment_id, %1$s)
    select pg_temp.nuevo_id(p.id, c), pg_temp.nuevo_id(p.restoration_id, c),
           p.paid_on - c * 17, p.created_at - make_interval(days => c * 17),
           case when p.refunded_payment_id is not null then pg_temp.nuevo_id(p.refunded_payment_id, c) end, %3$s
    from public.payments p
    join public.restorations r on r.id = p.restoration_id and substr(r.code, 5)::int < 100000
    cross join generate_series(1, %2$s) c
    where p.source = 'sistema'
  $f$, v_cols, v_copias, v_sel);
end;
$$;

alter table public.clients enable trigger user;
alter table public.restorations enable trigger user;
alter table public.pieces enable trigger user;
alter table public.piece_status_history enable trigger user;
alter table public.payments enable trigger user;

commit;

analyze public.clients, public.restorations, public.pieces, public.piece_status_history, public.payments;

select 'guías' as dato, count(*) from public.restorations
union all select 'piezas', count(*) from public.pieces
union all select 'historial', count(*) from public.piece_status_history
union all select 'pagos', count(*) from public.payments
union all select 'clientes', count(*) from public.clients;
