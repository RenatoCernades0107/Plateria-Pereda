begin;

select plan(4);

select has_extension('pg_trgm', 'pg_trgm está instalado');
select has_schema('private', 'existe el esquema private');
select has_function('private', 'set_updated_at', 'existe private.set_updated_at()');

create table public.prueba_updated_at (
  id int primary key,
  valor text,
  updated_at timestamptz not null default '2000-01-01'
);

create trigger prueba_set_updated_at
  before update on public.prueba_updated_at
  for each row execute function private.set_updated_at();

insert into public.prueba_updated_at (id, valor) values (1, 'a');
update public.prueba_updated_at set valor = 'b' where id = 1;

select is(
  (select updated_at from public.prueba_updated_at where id = 1),
  now(),
  'set_updated_at pone la fecha actual al modificar la fila'
);

select * from finish();
rollback;
