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

## 3. El correo con el código, en español (obligatorio)

**Authentication › Emails › Templates**. Cambia **Magic Link** y también **Confirm signup** (Supabase usa uno u otro según si la persona entra por
primera vez o no):

- Asunto: `Tu código para Tejiendo Ilusiones`
- Mensaje (en «Source»):

```html
<h2>Tu código: {{ .Token }}</h2>
<p>Escríbelo en la app para entrar. Caduca en una hora.</p>
<p>Si estás en el mismo móvil, también puedes <a href="{{ .ConfirmationURL }}">tocar aquí para entrar</a>.</p>
<p>Si no lo has pedido tú, no hagas nada.</p>
```

## 4. Que el correo llegue a todo el mundo (obligatorio antes de invitar a nadie)

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

## 5. Entrar con Google (opcional)

Si un día se quiere el botón «Entrar con Google»: crea un cliente OAuth en https://console.cloud.google.com
(gratis), pégalo en **Authentication › Sign In / Providers › Google**, y en la app cambia `google:false` por
`google:true` en el bloque `NUBE`.

## A tener en cuenta

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
- La app entera contra un Supabase local: `npx supabase start` en una carpeta con este `supabase/` y luego
  `NODE_PATH=$(npm root -g) node tests/nube.test.cjs`.
