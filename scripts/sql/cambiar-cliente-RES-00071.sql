-- Corrección puntual: la guía RES-00071 pasa a la clienta Angela Alvarez
-- (angelaalvareztola@hotmail.com, Shopify gid://shopify/Customer/10069963505721),
-- que ya existe en el sistema.
--
-- Cómo usarlo: pegarlo completo en el SQL Editor de Supabase (proyecto de
-- producción) y ejecutarlo. Corre en una transacción: si algo no cuadra, lanza un
-- error y no cambia nada.
--
-- Qué cambia:
--   * restorations.client_id de RES-00071 → Angela Alvarez.
--   * restorations.contact_id → null (una persona no tiene contactos; el trigger
--     restorations_ensure_contact exige que el contacto sea del nuevo cliente).
-- Qué NO cambia:
--   * La cotización de WhatsApp de origen (si la tiene) sigue con su cliente.
--   * Los pedidos de Shopify ya creados para los pagos de la guía siguen a nombre del
--     cliente anterior en Shopify; si hace falta, se cambian a mano en Shopify.
-- El cambio queda en el historial de la guía (audit_log) como "Sistema".

begin;

do $$
declare
  v_restoration public.restorations;
  v_old public.clients;
  v_new public.clients;
begin
  select * into v_restoration from public.restorations where code = 'RES-00071' for update;
  if not found then
    raise exception 'No existe la guía RES-00071';
  end if;

  select * into v_new from public.clients
  where shopify_customer_id = 'gid://shopify/Customer/10069963505721'
     or email = 'angelaalvareztola@hotmail.com';
  if not found then
    raise exception 'No se encontró a Angela Alvarez (angelaalvareztola@hotmail.com)';
  end if;
  if (select count(*) from public.clients
      where shopify_customer_id = 'gid://shopify/Customer/10069963505721'
         or email = 'angelaalvareztola@hotmail.com') > 1 then
    raise exception 'Hay más de un cliente con ese email o id de Shopify; revisar a mano';
  end if;
  if not v_new.active or v_new.merged_into is not null then
    raise exception 'La clienta % está desactivada o fusionada con otro cliente', v_new.display_name;
  end if;

  select * into v_old from public.clients where id = v_restoration.client_id;

  if v_old.id = v_new.id then
    raise notice 'RES-00071 ya es de % (%). No se cambia nada.', v_new.display_name, v_new.id;
    return;
  end if;

  raise notice 'RES-00071: % (%) → % (%)',
    v_old.display_name, v_old.id, v_new.display_name, v_new.id;

  update public.restorations
  set client_id = v_new.id,
      contact_id = null
  where id = v_restoration.id;
end;
$$;

-- Comprobación: debe mostrar a Angela Alvarez.
select r.code, c.display_name, c.email, c.shopify_customer_id, r.contact_id, r.updated_at
from public.restorations r
join public.clients c on c.id = r.client_id
where r.code = 'RES-00071';

commit;
