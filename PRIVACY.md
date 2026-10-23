# Aviso de Privacidad

**KoreStock Ledger** · Última actualización: octubre de 2026

Este aviso describe qué datos trata la aplicación KoreStock Ledger (en adelante, «la Aplicación»), con qué finalidad, dónde se almacenan y cómo puede el usuario ejercer control sobre ellos. El responsable de la Aplicación es Wilber Adonay Escobar Solórzano (en adelante, «el Autor»). Contacto: contacto@kitsotaro.com.

## 1. Arquitectura: la Aplicación no tiene servidor propio

La Aplicación se ejecuta íntegramente en el navegador del usuario y se conecta de forma directa con la cuenta de Google del propio usuario. El Autor no opera ningún servidor ni base de datos que reciba, procese o almacene la información de negocio de los usuarios. La única excepción es la verificación de acceso descrita en la sección 4.

## 2. Datos a los que accede la Aplicación

La Aplicación utiliza Google OAuth 2.0 y solicita un único permiso: [`drive.file`](https://developers.google.com/identity/protocols/oauth2/scopes#drive). Este permiso solo permite crear y administrar los archivos que la propia Aplicación genera o que el usuario elige expresamente; no permite listar, leer ni modificar ningún otro archivo de su Google Drive.

Con ese permiso, la Aplicación trata:

- **Dirección de correo de la cuenta de Google**, obtenida mediante la API de Drive, para iniciar la sesión y verificar la autorización de uso.
- **Información de negocio** que el usuario registra: productos, compras, ventas, gastos, combustible, vehículos, clientes y precios.
- **Correo del usuario como autor de ciertas acciones** (cambios de precio, correcciones y anulaciones registradas), que se guarda dentro de la propia hoja de cálculo del usuario para dejar constancia de quién las realizó.

## 3. Finalidad del tratamiento

- El correo se usa únicamente para verificar que la cuenta está autorizada a usar la Aplicación y para identificar la sesión.
- La información de negocio se usa exclusivamente para mostrar al usuario sus registros, cálculos e informes dentro de la Aplicación.
- La Aplicación no utiliza los datos con fines publicitarios, no crea perfiles de comportamiento, no los vende, no los cede con fines comerciales y no los usa para entrenar modelos de inteligencia artificial o de aprendizaje automático.
- **Uso Limitado (Limited Use):** el uso y la transferencia de información obtenida a través de las APIs de Google se ajustan a la [Política de Datos de Usuario de los Servicios API de Google](https://developers.google.com/terms/api-services-user-data-policy), incluidos sus requisitos de Uso Limitado.

## 4. Verificación de acceso

Al iniciar sesión, la Aplicación envía a una función de Google Apps Script operada por el Autor la dirección de correo del usuario y el token de acceso temporal emitido por Google. La función usa el token exclusivamente para confirmar ante Google la identidad de la cuenta y responde si esa cuenta está autorizada. La función no almacena la información de negocio del usuario, no conserva el token y no comparte ningún dato con terceros. Esta comprobación se ejecuta sobre la infraestructura de Google.

## 5. Dónde se almacenan los datos

- **En el Google Drive del usuario.** La Aplicación crea una carpeta llamada `KoreStock` que contiene la hoja de cálculo principal (`KoreStock_DB`), hasta dos copias de respaldo automáticas y, cuando corresponda, los archivos históricos de periodos anteriores. Todos estos archivos pertenecen al usuario y están bajo su control.
- **En el dispositivo del usuario.** Para abrir rápidamente y permitir la consulta sin conexión, la Aplicación guarda en el navegador una copia de lectura de la información y el token temporal de la sesión. Esta copia **no se cifra** y se **elimina automáticamente** si transcurren tres (3) días sin actualizarse con conexión a internet. También se elimina al cerrar la sesión desde la Aplicación.
- **Copias descargadas.** Si el usuario descarga una copia en Excel, ese archivo queda bajo su exclusiva custodia.

El Autor no conserva copia alguna de la información de los usuarios.

## 6. Seguridad del dispositivo y de la cuenta

La protección de la información depende de la seguridad de la cuenta de Google del usuario y del dispositivo en el que usa la Aplicación. Corresponde al usuario proteger su dispositivo con bloqueo de pantalla, mantener actualizado el sistema y el navegador, no compartir su sesión y evitar redes Wi-Fi públicas o desconocidas. Se recomienda activar la verificación en dos pasos de la cuenta de Google.

## 7. Conservación y eliminación

Los datos permanecen en el Google Drive del usuario mientras él lo decida; el Autor no aplica plazos de conservación porque no posee copia de ellos. Para eliminarlos y retirar el acceso:

1. **Eliminar los datos:** en Google Drive, eliminar la carpeta `KoreStock` y su contenido (incluidos respaldos e históricos) y cualquier copia descargada.
2. **Eliminar la copia local:** cerrar la sesión desde la Aplicación o borrar los datos del sitio en el navegador.
3. **Retirar el acceso:** en los [permisos de la cuenta de Google](https://myaccount.google.com/permissions), seleccionar KoreStock Ledger y elegir «Quitar acceso».

Dado que el Autor no conserva copias, no puede recuperar información eliminada o perdida. Se recomienda descargar periódicamente una copia desde la sección «Exportar / Importar» y guardarla fuera de la cuenta de Google.

## 8. Acceso de terceros

Ninguna persona distinta del usuario tiene acceso a su información a través de la Aplicación. El Autor no dispone de acceso remoto ni de mecanismos para consultar los datos de las cuentas de los usuarios.

## 9. Cambios a este aviso

El Autor podrá actualizar este aviso. La versión vigente estará siempre disponible en la Aplicación y en su repositorio público, con la fecha de su última actualización.

## 10. Limitación de responsabilidad

El Autor no será responsable por pérdida de datos, errores de cálculo ni decisiones de negocio tomadas con base en la información que muestra la Aplicación. Los términos de uso de la Aplicación se encuentran en `TERMS.md` y los derechos sobre el código, en `LICENSE`.
