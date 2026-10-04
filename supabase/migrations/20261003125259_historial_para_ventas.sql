-- Ventas ve la pestaña "Historial" de restauraciones, piezas, clientes y talleres
-- (permiso historial.ver), pero no los cambios de usuarios ni de configuración,
-- que solo ve el administrador en /auditoria. Logística no ve el historial (P42).

create policy "Ventas lee el historial de las entidades del negocio"
  on public.audit_log for select
  to authenticated
  using (
    table_name <> all ('{profiles}')
    and (select private.has_role('{ventas}'))
  );
