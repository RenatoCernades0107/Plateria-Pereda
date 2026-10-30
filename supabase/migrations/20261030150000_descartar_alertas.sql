-- Cada usuario puede descartar (borrar) sus alertas de la campana.
grant delete on public.notifications to authenticated;

create policy "Cada usuario descarta sus alertas"
  on public.notifications for delete to authenticated
  using (recipient_id = (select auth.uid()));
