# Aviso de Privacidad y Manejo de Datos

Esta nota describe, sin tecnicismos legales, cómo maneja tus datos la
aplicación **KoreStock Ledger** (PWA).

## No hay servidor propio

Esta aplicación es 100% del lado del cliente (client-side): no existe
ningún servidor del autor que reciba, procese, almacene o pase por en
medio de tus datos. Todo corre directamente en tu navegador y se conecta
de forma directa a tu propia cuenta de Google.

## 1. Datos a los que accedemos

Usamos **Google OAuth 2.0** para autenticarte y acceder a los servicios
de Google API. Solicitamos un único permiso (scope):

- [`https://www.googleapis.com/auth/drive.file`](https://developers.google.com/identity/protocols/oauth2/scopes#drive):
  permiso diseñado específicamente para que una aplicación **solo
  pueda crear y administrar los archivos que ella misma genera**, sin
  ninguna capacidad técnica de listar, leer o acceder al resto de tu
  Google Drive.
- Con ese mismo permiso, también leemos tu **dirección de correo de
  Google** (vía la función `about` de la API de Drive) para iniciar tu
  sesión y verificar que tu cuenta está autorizada a usar la app — no
  se solicita ningún permiso adicional para esto.

En la práctica, esto significa que la app:

- **Sí puede**: crear y leer/escribir la hoja de cálculo (Google Sheet)
  que ella misma genera para guardar tu inventario, ventas y costos.
- **No puede**: ver, listar ni tocar ningún otro archivo, carpeta,
  documento o dato de tu Google Drive — no por una promesa, sino porque
  el permiso que la app solicita no lo permite técnicamente.

## 2. Cómo usamos esos datos

- Tu correo se usa **únicamente** para confirmar que estás autorizado a
  entrar (lista blanca) y para identificar tu sesión mientras usas la
  app.
- Los datos de tu hoja de cálculo (inventario, ventas, costos) se usan
  **exclusivamente** para calcular y mostrarte reportes dentro de la
  propia app, en tu navegador.
- No usamos tus datos para publicidad, perfiles de comportamiento, ni
  los vendemos ni los compartimos con fines comerciales de ningún tipo.
- **Cumplimiento de Uso Limitado (Limited Use):** el uso y la
  transferencia de información obtenida a través de las APIs de Google
  por parte de KoreStock Ledger se adhieren a la
  [Política de Datos de Usuario de los Servicios API de Google](https://developers.google.com/terms/api-services-user-data-policy),
  incluidos los requisitos de Uso Limitado. Garantizamos que no
  transferimos, vendemos ni compartimos datos de usuarios de Google
  con terceros o plataformas de anuncios, y que no usamos estos datos
  para entrenar modelos de inteligencia artificial ni de aprendizaje
  automático.

## 3. Con quién compartimos tus datos

- No compartimos, vendemos ni transferimos tus datos de Google con
  terceros.
- **Única verificación técnica interna:** al iniciar sesión, tu
  dirección de correo se valida exclusivamente mediante una función
  interna ejecutada en Google Apps Script — infraestructura alojada y
  protegida por Google, operada por el propio autor de la app, no un
  tercero externo — para confirmar si tu cuenta está en la lista de
  correos autorizados. Esta función responde únicamente con un estado
  de confirmación (sí/no) y no almacena, comparte ni expone tus datos
  a ningún servicio o servidor externo de terceros.

## 4. Almacenamiento y protección de tus datos

- Los datos de tu negocio (inventario, ventas, costos) se guardan
  **únicamente en tu propio Google Drive**, en un archivo que tú
  controlas por completo desde tu propia cuenta.
- La app no tiene servidor ni base de datos propia del autor — es
  100% client-side, corre en tu navegador, y no existe ninguna copia de
  tus datos en ningún otro lugar.
- La protección de esos datos depende directamente de la seguridad de
  tu propia cuenta de Google (recomendamos activar verificación en dos
  pasos en tu cuenta si aún no la tienes).

## 5. Retención y borrado de tus datos

Tus datos permanecen en tu Google Drive el tiempo que tú decidas — no
hay un plazo de retención ni borrado automático de nuestra parte,
porque nunca tenemos una copia que borrar.

**Cómo eliminar tus datos y revocar el acceso**, en dos pasos simples:

1. **Eliminar los datos almacenados:** entra a tu Google Drive, busca
   la hoja de cálculo generada por la app y muévela a la papelera o
   elimínala — igual que con cualquier otro archivo tuyo.
2. **Revocar el acceso de la app:** retira el permiso de KoreStock
   Ledger a tu cuenta de Google desde tus
   [permisos de cuenta de Google](https://myaccount.google.com/permissions),
   seleccionando la app y dando clic en "Quitar acceso".

- **Recomendación importante:** como tus datos viven únicamente en tu
  Google Drive y nosotros no guardamos ninguna copia, te recomendamos
  hacer respaldos manuales periódicos del archivo (por ejemplo,
  descargando una copia desde Google Sheets). Si el archivo se borra,
  se corrompe, o se pierde por cualquier motivo — incluyendo un posible
  fallo en el código de la app — no tenemos forma de recuperar tus
  registros, ya que no existe ninguna copia fuera de tu propio Drive.

## Quién ve tus datos

Nadie más que tú. Cada persona que usa esta app se conecta con su
propia cuenta de Google, y su información vive únicamente en su propio
Drive. El autor de la app no recibe copia, no tiene acceso remoto y no
puede ver bajo ninguna circunstancia lo que cualquier usuario guarda en
su hoja de cálculo — incluyendo al propio autor, que tampoco tiene una
puerta trasera para ver datos de otras cuentas.

## Responsabilidad

El autor no se hace responsable por pérdida de datos, errores de
cálculo, ni decisiones de negocio tomadas a partir de la información que
esta aplicación muestra. Ver `LICENSE` para los términos completos de
uso del código, y `TERMS.md` para los términos de uso de la aplicación.
