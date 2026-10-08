-- Tejiendo Ilusiones: cuentas, datos de cada una y red social.
-- Se pega entera en Supabase › SQL Editor › New query › Run. Se puede ejecutar más de una vez (no borra datos).
-- Toda la seguridad está aquí (RLS): la app solo lleva la clave «anon public».

-- ── Perfiles ────────────────────────────────────────────────────────────────
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 2 and 40),
  bio text not null default '' check (char_length(bio) <= 300),
  creado timestamptz not null default now()
);

-- Al registrarse se crea su perfil con un nombre provisional (nunca el correo)
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles(id, nombre) values (new.id, 'Tejedora ' || substr(replace(new.id::text,'-',''),1,5))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists al_registrarse on auth.users;
create trigger al_registrarse after insert on auth.users for each row execute function public.crear_perfil();

-- ── Lo de cada una: su libreta entera (patrones, labores, lanas…) ───────────
create table if not exists public.estados (
  usuario uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  datos jsonb not null,
  t bigint not null,
  actualizado timestamptz not null default now(),
  check (pg_column_size(datos) < 4000000)
);

-- ── Red social ──────────────────────────────────────────────────────────────
create table if not exists public.bloqueos (
  quien uuid not null references auth.users(id) on delete cascade default auth.uid(),
  a_quien uuid not null references auth.users(id) on delete cascade,
  creado timestamptz not null default now(),
  primary key (quien, a_quien),
  check (quien <> a_quien)
);

-- ¿Hay un bloqueo entre la persona que mira y esta otra, en cualquier sentido?
create or replace function public.bloqueado(otra uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bloqueos b
    where (b.quien = auth.uid() and b.a_quien = otra) or (b.quien = otra and b.a_quien = auth.uid()));
$$;

create table if not exists public.publicaciones (
  id uuid primary key default gen_random_uuid(),
  autor uuid not null references public.perfiles(id) on delete cascade default auth.uid(),
  titulo text not null check (char_length(btrim(titulo)) between 1 and 80),
  texto text not null default '' check (char_length(texto) <= 1000),
  patron jsonb check (patron is null or pg_column_size(patron) < 200000),
  con_patron boolean generated always as (patron is not null) stored,
  foto text check (foto is null or foto ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  creado timestamptz not null default now()
);
create index if not exists publicaciones_autor on public.publicaciones(autor, creado desc);
create index if not exists publicaciones_creado on public.publicaciones(creado desc);

create table if not exists public.seguidores (
  seguidor uuid not null references public.perfiles(id) on delete cascade default auth.uid(),
  seguido uuid not null references public.perfiles(id) on delete cascade,
  creado timestamptz not null default now(),
  primary key (seguidor, seguido),
  check (seguidor <> seguido)
);

create table if not exists public.megusta (
  publicacion uuid not null references public.publicaciones(id) on delete cascade,
  usuario uuid not null references public.perfiles(id) on delete cascade default auth.uid(),
  creado timestamptz not null default now(),
  primary key (publicacion, usuario)
);

create table if not exists public.comentarios (
  id uuid primary key default gen_random_uuid(),
  publicacion uuid not null references public.publicaciones(id) on delete cascade,
  autor uuid not null references public.perfiles(id) on delete cascade default auth.uid(),
  texto text not null check (char_length(btrim(texto)) between 1 and 500),
  creado timestamptz not null default now()
);
create index if not exists comentarios_pub on public.comentarios(publicacion, creado);

create table if not exists public.denuncias (
  id uuid primary key default gen_random_uuid(),
  quien uuid not null references auth.users(id) on delete cascade default auth.uid(),
  publicacion uuid references public.publicaciones(id) on delete cascade,
  comentario uuid references public.comentarios(id) on delete cascade,
  perfil uuid references auth.users(id) on delete cascade,
  motivo text not null check (char_length(btrim(motivo)) between 1 and 500),
  creado timestamptz not null default now(),
  check (num_nonnulls(publicacion, comentario, perfil) = 1)
);

-- ── Reglas (RLS): nadie entra sin sesión; cada una solo toca lo suyo ───────
alter table public.perfiles enable row level security;
alter table public.estados enable row level security;
alter table public.bloqueos enable row level security;
alter table public.publicaciones enable row level security;
alter table public.seguidores enable row level security;
alter table public.megusta enable row level security;
alter table public.comentarios enable row level security;
alter table public.denuncias enable row level security;

revoke all on public.perfiles, public.estados, public.bloqueos, public.publicaciones, public.seguidores,
  public.megusta, public.comentarios, public.denuncias from anon;

drop policy if exists perfiles_ver on public.perfiles;
create policy perfiles_ver on public.perfiles for select to authenticated using (not public.bloqueado(id));
drop policy if exists perfiles_editar on public.perfiles;
create policy perfiles_editar on public.perfiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.perfiles from authenticated;
grant update (nombre, bio) on public.perfiles to authenticated;

drop policy if exists estados_mio on public.estados;
create policy estados_mio on public.estados for all to authenticated using (usuario = auth.uid()) with check (usuario = auth.uid());

drop policy if exists bloqueos_mios on public.bloqueos;
create policy bloqueos_mios on public.bloqueos for all to authenticated using (quien = auth.uid()) with check (quien = auth.uid());

drop policy if exists pub_ver on public.publicaciones;
create policy pub_ver on public.publicaciones for select to authenticated using (not public.bloqueado(autor));
drop policy if exists pub_crear on public.publicaciones;
create policy pub_crear on public.publicaciones for insert to authenticated
  with check (autor = auth.uid() and (foto is null or split_part(foto,'/',1) = auth.uid()::text));
drop policy if exists pub_editar on public.publicaciones;
create policy pub_editar on public.publicaciones for update to authenticated using (autor = auth.uid())
  with check (autor = auth.uid() and (foto is null or split_part(foto,'/',1) = auth.uid()::text));
drop policy if exists pub_borrar on public.publicaciones;
create policy pub_borrar on public.publicaciones for delete to authenticated using (autor = auth.uid());

drop policy if exists seg_ver on public.seguidores;
create policy seg_ver on public.seguidores for select to authenticated
  using (not public.bloqueado(seguidor) and not public.bloqueado(seguido));
drop policy if exists seg_crear on public.seguidores;
create policy seg_crear on public.seguidores for insert to authenticated
  with check (seguidor = auth.uid() and not public.bloqueado(seguido));
drop policy if exists seg_borrar on public.seguidores;
create policy seg_borrar on public.seguidores for delete to authenticated using (seguidor = auth.uid() or seguido = auth.uid());

drop policy if exists mg_ver on public.megusta;
create policy mg_ver on public.megusta for select to authenticated using (not public.bloqueado(usuario));
drop policy if exists mg_crear on public.megusta;
create policy mg_crear on public.megusta for insert to authenticated with check (usuario = auth.uid()
  and exists (select 1 from public.publicaciones p where p.id = publicacion and not public.bloqueado(p.autor)));
drop policy if exists mg_borrar on public.megusta;
create policy mg_borrar on public.megusta for delete to authenticated using (usuario = auth.uid());

drop policy if exists com_ver on public.comentarios;
create policy com_ver on public.comentarios for select to authenticated using (not public.bloqueado(autor)
  and exists (select 1 from public.publicaciones p where p.id = publicacion and not public.bloqueado(p.autor)));
drop policy if exists com_crear on public.comentarios;
create policy com_crear on public.comentarios for insert to authenticated with check (autor = auth.uid()
  and exists (select 1 from public.publicaciones p where p.id = publicacion and not public.bloqueado(p.autor)));
-- Borra un comentario quien lo escribió o la dueña de la publicación
drop policy if exists com_borrar on public.comentarios;
create policy com_borrar on public.comentarios for delete to authenticated using (autor = auth.uid()
  or exists (select 1 from public.publicaciones p where p.id = publicacion and p.autor = auth.uid()));

-- Las denuncias solo se crean; se leen desde el panel de Supabase
drop policy if exists den_crear on public.denuncias;
create policy den_crear on public.denuncias for insert to authenticated with check (quien = auth.uid());

-- Sin UPDATE en lo que no se edita: las columnas de autoría no se pueden cambiar
revoke update on public.publicaciones from authenticated;
grant update (titulo, texto, patron, foto) on public.publicaciones to authenticated;
revoke update on public.comentarios, public.megusta, public.seguidores, public.bloqueos, public.denuncias from authenticated;
revoke update (usuario) on public.estados from authenticated;

-- ── Borrar la cuenta (derecho de supresión): se va todo en cascada ─────────
create or replace function public.borrar_mi_cuenta() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sin sesión'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.borrar_mi_cuenta() from public, anon;
grant execute on function public.borrar_mi_cuenta() to authenticated;
revoke all on function public.bloqueado(uuid) from public, anon;
grant execute on function public.bloqueado(uuid) to authenticated;

-- ── Fotos ──────────────────────────────────────────────────────────────────
-- Fotos. «privadas»: las de su libreta, solo las ve ella. «publicas»: las de lo que publica.
-- Cada una solo escribe en su carpeta (la primera parte de la ruta es su id). Máximo 1 MB, solo JPEG.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('privadas', 'privadas', false, 1048576, array['image/jpeg']),
       ('publicas', 'publicas', true, 1048576, array['image/jpeg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fotos_ver_mias on storage.objects;
create policy fotos_ver_mias on storage.objects for select to authenticated
  using (bucket_id in ('privadas','publicas') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists fotos_subir on storage.objects;
create policy fotos_subir on storage.objects for insert to authenticated
  with check (bucket_id in ('privadas','publicas') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists fotos_cambiar on storage.objects;
create policy fotos_cambiar on storage.objects for update to authenticated
  using (bucket_id in ('privadas','publicas') and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id in ('privadas','publicas') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists fotos_borrar on storage.objects;
create policy fotos_borrar on storage.objects for delete to authenticated
  using (bucket_id in ('privadas','publicas') and (storage.foldername(name))[1] = auth.uid()::text);
