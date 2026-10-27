-- Corrección puntual: deja una guía como PAGO COMPLETO en la base de datos sin que
-- el pago pase por Shopify.
--
-- Cómo funciona: registra en `payments` un pago por el saldo pendiente. Los triggers
-- hacen lo de siempre (recalculan `paid` y pasan `payment_status` a "pagado"), pero
-- en la misma transacción se desactiva el envío a Shopify:
--   * se quita el nombre de pedido que le pone `private.prepare_payment_order()`
--     (sin nombre, `syncPaymentOrders` no crea ningún pedido para ese pago),
--   * se marca `shopify_synced_at` (en guías con orden de piezas, `payment.sync` no
--     lo vuelve a enviar) y
--   * se borra el job `payment.sync` que el trigger acaba de encolar. Un job que ya
--     estuviera pendiente antes no se toca; al procesarse tampoco enviaría este pago.
-- Todo ocurre en una sola transacción, así el procesador del outbox nunca ve el pago
-- a medias.
--
-- Uso (SQL Editor de Supabase o `psql`):
--   1. Ajusta los tres valores de abajo.
--   2. Corre el script tal cual (v_aplicar = false): simula, muestra el resultado en
--      el mensaje y revierte todo.
--   3. Si el resultado es el esperado, pon v_aplicar := true y vuelve a correrlo.

do $$
declare
  v_codigo constant text := 'RES-00034';         -- código de la guía (GUIA34)
  v_metodo constant text := 'Efectivo';          -- método de pago tal como está en el catálogo
  v_aplicar constant boolean := false;           -- false: simula y revierte; true: aplica

  v_res public.restorations;
  v_method public.payment_methods;
  v_payment_id uuid;
  v_jobs integer;
  v_after public.restorations;
begin
  select * into v_res from public.restorations where code = v_codigo for update;
  if v_res.id is null then
    raise exception 'No existe la guía %', v_codigo;
  end if;
  if v_res.kind <> 'normal' then
    raise exception 'La guía % es interna u observada: no se cobra', v_codigo;
  end if;
  if v_res.total <= 0 then
    raise exception 'La guía % no tiene total (%): no hay nada que cobrar', v_codigo, v_res.total;
  end if;
  if v_res.balance <= 0 then
    raise exception 'La guía % ya está pagada por completo (pagado % de %)',
      v_codigo, v_res.paid, v_res.total;
  end if;

  select * into v_method from public.payment_methods where name = v_metodo;
  if v_method.id is null then
    raise exception 'No existe el método de pago "%". Disponibles: %', v_metodo,
      (select string_agg(name, ', ' order by name) from public.payment_methods);
  end if;

  -- El trigger valida que no pase del saldo y fija el nombre del método.
  insert into public.payments (restoration_id, amount, payment_method_id, method_name, reason)
  values (
    v_res.id, v_res.balance, v_method.id, v_method.name,
    'Corrección manual: pago completo registrado sin pasar por Shopify'
  )
  returning id into v_payment_id;

  -- Sin sesión de usuario el trigger deja el autor vacío: se deja dicho que fue un script.
  update public.payments
  set shopify_order_title = null,
      shopify_synced_at = now(),
      created_by_name = 'Corrección manual (script)'
  where id = v_payment_id;

  delete from public.shopify_sync_jobs
  where kind = 'payment.sync' and entity_table = 'restorations'
    and entity_id = v_res.id::text and status = 'pending' and created_at = now();
  get diagnostics v_jobs = row_count;

  select * into v_after from public.restorations where id = v_res.id;
  if v_after.payment_status <> 'pagado' or v_after.balance <> 0 then
    raise exception 'Algo no cuadró: estado % y saldo % (se revierte)',
      v_after.payment_status, v_after.balance;
  end if;

  if not v_aplicar then
    raise exception 'SIMULACIÓN OK (nada se guardó). % pasaría de pagado % / saldo % (%) a pagado % / saldo % (%). Pago de % con %. Jobs de Shopify retirados: %. Pon v_aplicar := true para aplicarlo.',
      v_codigo, v_res.paid, v_res.balance, v_res.payment_status,
      v_after.paid, v_after.balance, v_after.payment_status,
      v_res.balance, v_method.name, v_jobs;
  end if;

  raise notice 'LISTO: % quedó pagado % / saldo % (%). Pago % de % con %. Jobs de Shopify retirados: %.',
    v_codigo, v_after.paid, v_after.balance, v_after.payment_status,
    v_payment_id, v_res.balance, v_method.name, v_jobs;
end;
$$;
