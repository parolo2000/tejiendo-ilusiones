#!/bin/sh
# Prueba las reglas en un Postgres local (no toca Supabase). Uso: sh supabase/pruebas/probar.sh
set -e
D="$(cd "$(dirname "$0")" && pwd)"
su postgres -c "dropdb --if-exists tejiendo_prueba && createdb tejiendo_prueba"
for f in "$D/simular-supabase.sql" "$D/../migrations/0001_cuentas_y_red.sql" "$D/../migrations/0001_cuentas_y_red.sql" "$D/reglas.sql"; do
  su postgres -c "psql -q -v ON_ERROR_STOP=1 -d tejiendo_prueba -f '$f'"
done
