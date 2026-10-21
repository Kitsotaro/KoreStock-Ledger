// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// SELECTOR-ARCHIVO.JS — el selector de Google (Picker) para elegir una base
// que la app aún no conoce (heredado de abrirSelectorArchivo de la v2).
// Con el permiso drive.file la app solo ve lo que creó o lo que el usuario
// le muestra aquí; después Google recuerda ese permiso para el archivo.
// En modo demostración no existe: se ofrece cargar la base de prueba.
//
// Expone: elegirArchivoConGoogle.
// Depende de: config.js (API_KEY, PICKER_APP_ID), sesion.js, gapi/google.picker.
// ============================================================

function elegirArchivoConGoogle() {
  return new Promise((resolver, rechazar) => {
    if (!Sesion.pickerListo || typeof google === 'undefined' || !google.picker) {
      rechazar(new Error('El selector de Google todavía no está listo. Espera unos segundos e inténtalo de nuevo.'));
      return;
    }
    const token = gapi.client.getToken();
    const vista = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS).setMimeTypes('application/vnd.google-apps.spreadsheet');
    const picker = new google.picker.PickerBuilder()
      .addView(vista)
      .setOAuthToken(token.access_token)
      .setDeveloperKey(API_KEY)
      .setAppId(PICKER_APP_ID)
      .setLocale('es')
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) resolver(data.docs[0].id);
        else if (data.action === google.picker.Action.CANCEL) rechazar(new Error('CANCELADO'));
      })
      .build();
    picker.setVisible(true);
  });
}
