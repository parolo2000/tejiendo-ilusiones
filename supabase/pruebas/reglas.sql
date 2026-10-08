-- Pruebas de las reglas: cada bloque espera un resultado; si no, error y se para.
\set ON_ERROR_STOP 1
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','ana@x'),('22222222-2222-2222-2222-222222222222','bea@x'),('33333333-3333-3333-3333-333333333333','carla@x');
do $$ begin assert (select count(*) from perfiles)=3, 'perfiles al registrarse';
  assert not exists(select 1 from perfiles where nombre like '%@%'), 'el nombre no lleva el correo'; end $$;

create function pg_temp.como(u text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub', u, false); end $$;
set role authenticated;
select pg_temp.como('11111111-1111-1111-1111-111111111111');
insert into estados(datos,t) values ('{"patrones":[1]}',1);
insert into publicaciones(id,titulo,texto) values ('aaaaaaaa-0000-0000-0000-000000000001','Gorro','Para mi nieta');
update perfiles set nombre='Ana' where id=auth.uid();

select pg_temp.como('22222222-2222-2222-2222-222222222222');
do $$ begin
  assert (select count(*) from estados)=0, 'Bea no ve la libreta de Ana';
  assert (select count(*) from publicaciones)=1, 'Bea ve lo publicado';
  update publicaciones set titulo='hackeado'; assert (select titulo from publicaciones)='Gorro', 'Bea no edita lo de Ana';
  delete from publicaciones; assert (select count(*) from publicaciones)=1, 'Bea no borra lo de Ana';
  update perfiles set nombre='Mala' where id<>auth.uid(); assert (select nombre from perfiles where id='11111111-1111-1111-1111-111111111111')='Ana', 'no cambia otros perfiles';
end $$;
do $$ begin insert into estados(usuario,datos,t) values ('11111111-1111-1111-1111-111111111111','{}',2); raise exception 'FALLO: escribe la libreta de otra';
  exception when insufficient_privilege then null; end $$;
do $$ begin insert into publicaciones(autor,titulo) values ('11111111-1111-1111-1111-111111111111','falsa'); raise exception 'FALLO: publica en nombre de otra';
  exception when insufficient_privilege then null; end $$;
do $$ begin insert into publicaciones(titulo,foto) values ('x','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000009.jpg'); raise exception 'FALLO: usa la foto de otra';
  exception when insufficient_privilege then null; end $$;
do $$ begin update publicaciones set autor=auth.uid(); raise exception 'FALLO: cambia el autor';
  exception when insufficient_privilege then null; end $$;
insert into megusta(publicacion) values ('aaaaaaaa-0000-0000-0000-000000000001');
insert into comentarios(publicacion,texto) values ('aaaaaaaa-0000-0000-0000-000000000001','¡Qué bonito!');
insert into seguidores(seguido) values ('11111111-1111-1111-1111-111111111111');
insert into denuncias(publicacion,motivo) values ('aaaaaaaa-0000-0000-0000-000000000001','prueba');
do $$ begin assert (select count(*) from denuncias)=0, 'las denuncias no se leen desde la app'; end $$;
do $$ begin insert into storage.objects(bucket_id,name) values ('publicas','11111111-1111-1111-1111-111111111111/x.jpg'); raise exception 'FALLO: sube foto a carpeta ajena';
  exception when insufficient_privilege then null; end $$;
insert into storage.objects(bucket_id,name) values ('privadas','22222222-2222-2222-2222-222222222222/x.jpg');

-- Ana borra el comentario de Bea en su publicación; luego bloquea a Carla
select pg_temp.como('11111111-1111-1111-1111-111111111111');
do $$ begin assert (select count(*) from storage.objects)=0, 'Ana no ve las fotos privadas de Bea';
  delete from comentarios; assert (select count(*) from comentarios)=0, 'la dueña quita comentarios'; end $$;
insert into bloqueos(a_quien) values ('33333333-3333-3333-3333-333333333333');
select pg_temp.como('33333333-3333-3333-3333-333333333333');
do $$ begin
  assert (select count(*) from publicaciones)=0, 'bloqueada no ve publicaciones';
  assert (select count(*) from perfiles where id='11111111-1111-1111-1111-111111111111')=0, 'bloqueada no ve el perfil';
  assert (select count(*) from bloqueos)=0, 'no ve quién la bloqueó';
end $$;
do $$ begin insert into comentarios(publicacion,texto) values ('aaaaaaaa-0000-0000-0000-000000000001','hola'); raise exception 'FALLO: bloqueada comenta';
  exception when insufficient_privilege then null; end $$;
do $$ begin insert into seguidores(seguido) values ('11111111-1111-1111-1111-111111111111'); raise exception 'FALLO: bloqueada sigue';
  exception when insufficient_privilege then null; end $$;

-- Sin sesión no se ve nada
reset role; set role anon; select pg_temp.como('');
do $$ begin perform 1 from publicaciones; raise exception 'FALLO: anon lee';
  exception when insufficient_privilege then null; end $$;
do $$ begin perform borrar_mi_cuenta(); raise exception 'FALLO: anon borra';
  exception when insufficient_privilege then null; end $$;

-- Ana borra su cuenta: se va todo lo suyo
reset role; set role authenticated; select pg_temp.como('11111111-1111-1111-1111-111111111111');
select borrar_mi_cuenta();
reset role;
do $$ begin
  assert (select count(*) from auth.users where id='11111111-1111-1111-1111-111111111111')=0, 'cuenta borrada';
  assert (select count(*) from estados)=0 and (select count(*) from publicaciones)=0 and (select count(*) from megusta)=0
     and (select count(*) from perfiles where id='11111111-1111-1111-1111-111111111111')=0 and (select count(*) from bloqueos)=0, 'se va todo en cascada';
end $$;
select 'TODAS LAS REGLAS BIEN' as resultado;
