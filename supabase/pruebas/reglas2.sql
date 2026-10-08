-- Pruebas de 0002: contadores, avisos, guardados y veces tejido.
\set ON_ERROR_STOP 1
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','ana@x'),('22222222-2222-2222-2222-222222222222','bea@x'),('33333333-3333-3333-3333-333333333333','carla@x');
create function pg_temp.como(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u, false); end $$;
set role authenticated;
select pg_temp.como('11111111-1111-1111-1111-111111111111');
insert into publicaciones(id,titulo,patron) values ('aaaaaaaa-0000-0000-0000-000000000001','Gorro','{"t":"Gorro","p":["Vuelta 1"]}');
insert into publicaciones(id,titulo) values ('aaaaaaaa-0000-0000-0000-000000000002','Sin patrón');
insert into megusta(publicacion) values ('aaaaaaaa-0000-0000-0000-000000000001'); -- su propio «me gusta»: cuenta pero no avisa
select pg_temp.como('22222222-2222-2222-2222-222222222222');
insert into megusta(publicacion) values ('aaaaaaaa-0000-0000-0000-000000000001');
delete from megusta where usuario = auth.uid();
insert into megusta(publicacion) values ('aaaaaaaa-0000-0000-0000-000000000001');
insert into comentarios(publicacion,texto) values ('aaaaaaaa-0000-0000-0000-000000000001','¡Precioso!');
insert into tejidas(publicacion) values ('aaaaaaaa-0000-0000-0000-000000000001');
insert into seguidores(seguido) values ('11111111-1111-1111-1111-111111111111');
insert into guardados(publicacion) values ('aaaaaaaa-0000-0000-0000-000000000001');
do $$ begin
  assert (select n_gusta from publicaciones where titulo='Gorro')=2, 'cuenta 2 me gusta';
  assert (select n_tejida from publicaciones where titulo='Gorro')=1, 'tejido 1 vez';
  assert (select count(*) from avisos)=0, 'Bea no ve los avisos de Ana';
  assert (select count(*) from guardados)=1, 'Bea ve lo que guarda';
  update publicaciones set titulo='x'; assert (select count(*) from publicaciones where titulo='x')=0, 'no edita lo ajeno';
end $$;
do $$ begin insert into tejidas(publicacion) values ('aaaaaaaa-0000-0000-0000-000000000001'); raise exception 'FALLO: teje dos veces';
  exception when unique_violation then null; end $$;
do $$ begin insert into tejidas(publicacion) values ('aaaaaaaa-0000-0000-0000-000000000002'); raise exception 'FALLO: teje algo sin patrón';
  exception when insufficient_privilege then null; end $$;
do $$ begin insert into avisos(para,de,tipo) values ('11111111-1111-1111-1111-111111111111', auth.uid(), 'gusta'); raise exception 'FALLO: crea avisos a mano';
  exception when insufficient_privilege then null; end $$;
do $$ begin insert into tejidas(publicacion,usuario) values ('aaaaaaaa-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333'); raise exception 'FALLO: teje en nombre de otra';
  exception when insufficient_privilege or unique_violation then null; end $$;
select pg_temp.como('11111111-1111-1111-1111-111111111111');
do $$ begin
  update publicaciones set n_gusta = 999; raise exception 'FALLO: cambia el contador';
  exception when insufficient_privilege then null; end $$;
do $$ begin
  assert (select count(*) from avisos)=4, 'Ana tiene 4 avisos (gusta una vez, comenta, teje, sigue): '||(select count(*) from avisos);
  assert (select count(*) from avisos where tipo='gusta')=1, 'quitar y poner el me gusta no avisa dos veces';
  assert (select count(*) from guardados)=0, 'Ana no ve lo que guarda Bea';
  update avisos set leido = true; assert (select count(*) from avisos where not leido)=0, 'los marca como leídos';
end $$;
do $$ begin update avisos set para='22222222-2222-2222-2222-222222222222'; raise exception 'FALLO: cambia el destino';
  exception when insufficient_privilege then null; end $$;
-- Ana bloquea a Bea: sus avisos dejan de verse
insert into bloqueos(a_quien) values ('22222222-2222-2222-2222-222222222222');
do $$ begin assert (select count(*) from avisos)=0, 'no ve avisos de quien bloqueó'; end $$;
select 'TODAS LAS REGLAS 0002 BIEN' as resultado;
