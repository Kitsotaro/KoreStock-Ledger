// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// CONFIG.JS — identificadores PÚBLICOS de la app ante Google.
//
// Son públicos por diseño (el navegador los necesita): su protección no es
// esconderlos sino las restricciones en Google Cloud (orígenes autorizados
// del cliente OAuth, referrer y API de la clave del Picker). Se heredan
// sin rotar (D61). Los secretos de verdad (lista de licencias) viven fuera
// del repo, en la hoja privada que consulta el Apps Script.
//
// Expone: CLIENT_ID, SCOPES, API_KEY, PICKER_APP_ID, URL_VERIFICACION_ACCESO,
//   CLAVES_LOCALES, NOMBRE_APP, VERSION_APP, CORREO_CONTACTO.
// Depende de: nada.
// ============================================================

const NOMBRE_APP = 'KoreStock Ledger';
// Versión visible en el panel (se actualiza al cerrar cada fase; v3.0.0 solo con aprobación, D62).
const VERSION_APP = '2.6';
const CLIENT_ID = '1070607567316-mdbd97lbkprgpc4spj71e5f8anovr6it.apps.googleusercontent.com';
// Solo drive.file: la app ve únicamente los archivos que crea o que el
// usuario elige con el selector de Google. Ampliarlo reabre la verificación.
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
// Clave del selector de archivos (Picker), restringida en Google Cloud.
const API_KEY = 'AIzaSyB812PW3rt74DVzSuy21Kr6uv4WLUR1GjI';
const PICKER_APP_ID = '1070607567316';
// Verificador de licencias (Apps Script). Contrato: V3 §P3.7 (D63, D68).
const URL_VERIFICACION_ACCESO = 'https://script.google.com/macros/s/AKfycby_YtBiiqthE8vDZ7VAB-XUmsbVL2OqsPBG_CBiF6EuGXIueOKU8TwtMU5Ge39LAd-mZg/exec';
const CORREO_CONTACTO = 'contacto@kitsotaro.com';

// Claves de almacenamiento del navegador. NO cambiar los nombres heredados:
// si cambian, los usuarios pierden la sesión y deben volver a elegir su archivo.
const CLAVES_LOCALES = {
  TOKEN: 'korestock-token-google',
  BASE: 'finanzas-spreadsheet-id',
  TEMA: 'finanzas-tema',
  MODO: 'korestock-modo',
  TAMANO_TEXTO: 'korestock-tamano-texto',
  AVISOS_LEIDOS: 'korestock-avisos-leidos',
  ULTIMO_RESPALDO: 'korestock-ultimo-respaldo',
  TODOS_DECIMALES: 'korestock-todos-decimales'
};
