-- Tejiendo Ilusiones: ordenar por «me gusta» y por veces tejido, avisos y publicaciones guardadas.
-- Se pega entera en Supabase › SQL Editor › New query › Run, después de 0001. Se puede ejecutar más de una vez
-- (no borra datos).

-- ── Cuántas veces se ha tejido un patrón publicado (cada persona cuenta una vez) ────────────────────────────
create table if not exists public.tejidas (
  publicacion uuid not null references public.publicaciones(id) on delete cascade,
  usuario uuid not null references public.perfiles(id) on delete cascade default auth.uid(),
  creado timestamptz not null default now(),
  primary key (publicacion, usuario)
);

-- ── Contadores en la publicación, para poder ordenar. Los mantiene la base de datos, nadie los puede tocar ───
alter table public.publicaciones add column if not exists n_gusta integer not null default 0;
alter table public.publicaciones add column if not exists n_tejida integer not null default 0;
create index if not exists publicaciones_gusta on public.publicaciones(n_gusta desc, creado desc);
create index if not exists publicaciones_tejida on public.publicaciones(n_tejida desc, creado desc);

create or replace function public.contar_gusta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then update public.publicaciones set n_gusta = n_gusta + 1 where id = new.publicacion;
  else update public.publicaciones set n_gusta = greatest(n_gusta - 1, 0) where id = old.publicacion; end if;
  return null;
end $$;
drop trigger if exists contar_gusta on public.megusta;
create trigger contar_gusta after insert or delete on public.megusta for each row execute function public.contar_gusta();

create or replace function public.contar_tejida() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then update public.publicaciones set n_tejida = n_tejida + 1 where id = new.publicacion;
  else update public.publicaciones set n_tejida = greatest(n_tejida - 1, 0) where id = old.publicacion; end if;
  return null;
end $$;
drop trigger if exists contar_tejida on public.tejidas;
create trigger contar_tejida after insert or delete on public.tejidas for each row execute function public.contar_tejida();

-- Los «me gusta» que ya había
update public.publicaciones p set n_gusta = (select count(*) from public.megusta m where m.publicacion = p.id);
update public.publicaciones p set n_tejida = (select count(*) from public.tejidas t where t.publicacion = p.id);

-- ── Publicaciones guardadas: solo las ve quien las guarda ────────────────────────────────────────────────
create table if not exists public.guardados (
  usuario uuid not null references public.perfiles(id) on delete cascade default auth.uid(),
  publicacion uuid not null references public.publicaciones(id) on delete cascade,
  creado timestamptz not null default now(),
  primary key (usuario, publicacion)
);

-- ── Avisos: «a Bea le gusta tu labor», «Carmen te ha comentado»… Los crea la base de datos, no la app ──────
create table if not exists public.avisos (
  id uuid primary key default gen_random_uuid(),
  para uuid not null references public.perfiles(id) on delete cascade,
  de uuid not null references public.perfiles(id) on delete cascade,
  tipo text not null check (tipo in ('gusta','comenta','sigue','teje')),
  publicacion uuid references public.publicaciones(id) on delete cascade,
  leido boolean not null default false,
  creado timestamptz not null default now()
);
create index if not exists avisos_para on public.avisos(para, creado desc);
create index if not exists avisos_sin_leer on public.avisos(para) where not leido;

create or replace function public.crear_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
declare duena uuid; quien uuid; pub uuid; t text;
begin
  if tg_table_name = 'megusta' then quien := new.usuario; pub := new.publicacion; t := 'gusta';
  elsif tg_table_name = 'comentarios' then quien := new.autor; pub := new.publicacion; t := 'comenta';
  elsif tg_table_name = 'tejidas' then quien := new.usuario; pub := new.publicacion; t := 'teje';
  else quien := new.seguidor; pub := null; t := 'sigue'; duena := new.seguido; end if;
  if pub is not null then select autor into duena from public.publicaciones where id = pub; end if;
  if duena is null or duena = quien then return null; end if;
  -- Un «me gusta» quitado y vuelto a poner no avisa dos veces
  if t in ('gusta','sigue','teje') and exists (select 1 from public.avisos a where a.para = duena and a.de = quien and a.tipo = t
      and a.publicacion is not distinct from pub) then return null; end if;
  insert into public.avisos(para, de, tipo, publicacion) values (duena, quien, t, pub);
  -- Se guardan los 200 últimos de cada persona
  delete from public.avisos where para = duena and id in (select id from public.avisos where para = duena order by creado desc offset 200);
  return null;
end $$;
drop trigger if exists aviso_gusta on public.megusta;
create trigger aviso_gusta after insert on public.megusta for each row execute function public.crear_aviso();
drop trigger if exists aviso_comenta on public.comentarios;
create trigger aviso_comenta after insert on public.comentarios for each row execute function public.crear_aviso();
drop trigger if exists aviso_teje on public.tejidas;
create trigger aviso_teje after insert on public.tejidas for each row execute function public.crear_aviso();
drop trigger if exists aviso_sigue on public.seguidores;
create trigger aviso_sigue after insert on public.seguidores for each row execute function public.crear_aviso();

-- ── Reglas (RLS) ──────────────────────────────────────────────────────────────────────────────────────────
alter table public.tejidas enable row level security;
alter table public.guardados enable row level security;
alter table public.avisos enable row level security;
revoke all on public.tejidas, public.guardados, public.avisos from anon;

drop policy if exists tej_ver on public.tejidas;
create policy tej_ver on public.tejidas for select to authenticated using (usuario = auth.uid());
drop policy if exists tej_crear on public.tejidas;
create policy tej_crear on public.tejidas for insert to authenticated with check (usuario = auth.uid()
  and exists (select 1 from public.publicaciones p where p.id = publicacion and p.con_patron and not public.bloqueado(p.autor)));
revoke update, delete on public.tejidas from authenticated;

drop policy if exists guar_mios on public.guardados;
create policy guar_mios on public.guardados for all to authenticated using (usuario = auth.uid())
  with check (usuario = auth.uid() and exists (select 1 from public.publicaciones p where p.id = publicacion and not public.bloqueado(p.autor)));
revoke update on public.guardados from authenticated;

drop policy if exists av_ver on public.avisos;
create policy av_ver on public.avisos for select to authenticated using (para = auth.uid() and not public.bloqueado(de));
drop policy if exists av_leer on public.avisos;
create policy av_leer on public.avisos for update to authenticated using (para = auth.uid()) with check (para = auth.uid());
drop policy if exists av_borrar on public.avisos;
create policy av_borrar on public.avisos for delete to authenticated using (para = auth.uid());
revoke insert, update on public.avisos from authenticated;
grant update (leido) on public.avisos to authenticated;

-- Los contadores no se pueden cambiar desde la app (solo título, texto, patrón y foto, como antes)
revoke update on public.publicaciones from authenticated;
grant update (titulo, texto, patron, foto) on public.publicaciones to authenticated;
revoke all on function public.contar_gusta(), public.contar_tejida(), public.crear_aviso() from public, anon, authenticated;
