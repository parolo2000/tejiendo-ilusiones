#!/bin/sh
# Prueba las reglas en un Postgres local (no toca Supabase). Uso: sh supabase/pruebas/probar.sh
set -e
D="$(cd "$(dirname "$0")" && pwd)"
su postgres -c "dropdb --if-exists tejiendo_prueba && createdb tejiendo_prueba"
M="$D/../migrations"
for f in "$D/simular-supabase.sql" "$M/0001_cuentas_y_red.sql" "$M/0001_cuentas_y_red.sql" "$D/reglas.sql"; do
  su postgres -c "psql -q -v ON_ERROR_STOP=1 -d tejiendo_prueba -f '$f'"
done
# Otra base limpia para 0002 (con 0001 debajo), ejecutada dos veces
su postgres -c "dropdb --if-exists tejiendo_prueba2 && createdb tejiendo_prueba2"
for f in "$D/simular-supabase.sql" "$M/0001_cuentas_y_red.sql" "$M/0002_orden_avisos_guardados.sql" "$M/0002_orden_avisos_guardados.sql" "$D/reglas2.sql"; do
  su postgres -c "psql -q -v ON_ERROR_STOP=1 -d tejiendo_prueba2 -f '$f'"
done
