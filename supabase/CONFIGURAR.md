# Poner en marcha las cuentas y la comunidad

La app ya lleva la dirección del proyecto (`https://frbqbjusjfmucltuxodp.supabase.co`) y su clave pública
(«anon»). Esa clave está hecha para ir dentro de la app: lo que protege los datos son las reglas del paso 1.
**La clave `service_role` (o «secret») no se pone nunca en la app ni en el repositorio.**

Todo se hace en https://supabase.com/dashboard, dentro del proyecto.

## 1. Crear las tablas y las reglas (obligatorio)

1. Menú de la izquierda › **SQL Editor** › **New query**.
2. Pega entero el archivo `supabase/migrations/0001_cuentas_y_red.sql` y pulsa **Run**.
3. Debe acabar en «Success. No rows returned». Se puede ejecutar otra vez sin problema: no borra nada.

## 2. Direcciones de la app (obligatorio)

**Authentication › URL Configuration**:

- **Site URL**: `https://parolo2000.github.io/tejiendo-ilusiones/`
- **Redirect URLs** › Add URL: `https://parolo2000.github.io/tejiendo-ilusiones/**`

## 3. Solo entra quien tú das de alta (obligatorio)

La app es de pago: no tiene «crear cuenta» y sin cuenta no se puede usar nada.

1. **Authentication › Sign In / Providers** (Autenticación › Inicio de sesión / Proveedores): desactiva
   **Allow new users to sign up** (Permitir que se registren usuarios nuevos) y guarda.
   **No** desactives el proveedor **Email**: es el que deja entrar con correo y contraseña.

**Dar de alta a una persona** (cuando te haya pagado):
**Authentication › Users › Add user › Create new user**. Escribe su correo y una contraseña provisional (al menos 8
letras o números), marca **Auto Confirm User** y pulsa **Create user**. Pásale su correo y la contraseña; desde la app
la puede cambiar en «Gente › Mi perfil › Cambiar mi contraseña».

**Quitarle la cuenta a alguien que deja de pagar**: **Authentication › Users**, en su fila los tres puntos ›
**Ban user** (Bloquear). Deja de poder entrar en cuanto su sesión caduca (como mucho una hora); lo suyo no se borra y
si vuelve a pagar le quitas el bloqueo. Para borrarla del todo: **Delete user**.

## 4. El correo de «He olvidado mi contraseña», en español (obligatorio)

**Authentication › Emails › Templates** › **Reset Password** (Restablecer contraseña):

- Asunto: `Tu código para poner una contraseña nueva`
- Mensaje (en «Source»):

```html
<h2>Tu código: {{ .Token }}</h2>
<p>Escríbelo en Tejiendo Ilusiones para poner una contraseña nueva. Caduca en una hora.</p>
<p>Si estás en el mismo móvil, también puedes <a href="{{ .ConfirmationURL }}">tocar aquí</a>.</p>
<p>Si no lo has pedido tú, no hagas nada: tu contraseña no cambia.</p>
```

## 5. Que el correo llegue a todo el mundo (obligatorio antes de invitar a nadie)

El correo que trae Supabase de serie **solo llega a las personas del equipo del proyecto y como mucho 2 por hora**.
Para que llegue a cualquiera hace falta un servicio de correo. Gratis:

| Servicio | Gratis | Nota |
|---|---|---|
| **Brevo** (recomendado) | 300 correos al día | Sin tarjeta. Se verifica el correo que envía. |
| Gmail con «contraseña de aplicación» | unos 500 al día | Sale desde tu Gmail; algunos correos pueden ir a Spam. |
| Resend | 3.000 al mes | Necesita un dominio propio (de pago, unos 10 €/año). |

Con Brevo:
1. Crea la cuenta en https://www.brevo.com y verifica el correo con el que quieres enviar (Senders › Add a sender).
2. En Brevo: **SMTP & API › SMTP** › genera una clave SMTP.
3. En Supabase: **Authentication › Emails › SMTP Settings** › activa **Enable custom SMTP**:
   host `smtp-relay.brevo.com`, puerto `587`, usuario y contraseña los de Brevo, «Sender email» el que verificaste,
   «Sender name» `Tejiendo Ilusiones`.
4. En **Authentication › Rate Limits** sube «Rate limit for sending emails» a 30 por hora.

La contraseña SMTP se queda en Supabase: no va en la app ni en el repositorio.

## 6. Entrar con Google (opcional)

Si un día se quiere el botón «Entrar con Google»: crea un cliente OAuth en https://console.cloud.google.com
(gratis), pégalo en **Authentication › Sign In / Providers › Google**, y en la app cambia `google:false` por
`google:true` en el bloque `NUBE`.

## A tener en cuenta

- **Lo que no se puede cerrar**: el código de la app es público (GitHub Pages), así que alguien que sepa programar
  podría usar la parte que funciona solo en el móvil. Lo que está en la nube (cuentas, libreta guardada, comunidad)
  sí está protegido por las reglas. Para cerrar también eso haría falta un repositorio privado con Pages (GitHub Pro,
  unos 4 $ al mes).
- **Plan gratis**: 50.000 personas al mes, 500 MB de datos y 1 GB de fotos. Las fotos van comprimidas (unos
  100 KB), así que caben unas 10.000. Si se llena, el plan de pago cuesta 25 $ al mes.
- **Si pasa una semana sin que nadie entre, Supabase pausa el proyecto.** Se reactiva desde el panel con
  «Restore project»; no se pierde nada.
- **Denuncias**: se ven en **Table Editor › denuncias**. Para quitar una publicación, bórrala en
  **Table Editor › publicaciones**.
- **Contacto en la página de privacidad**: si quieres que salga un correo, ponlo en `contacto:""` del bloque `NUBE`.
  Si no, sale el enlace al proyecto en GitHub.

## Probar sin tocar el proyecto de verdad

- Reglas, sin Docker: `sh supabase/pruebas/probar.sh` (Postgres local).
- La app entera contra un Supabase local: `npx supabase start` en una carpeta con este `supabase/`, luego
  `export SUPABASE_SERVICE_ROLE_KEY=…` (la que da `npx supabase status -o env`, solo la local) y
  `NODE_PATH=$(npm root -g) node tests/nube.test.cjs`.
