// © 2026 Wilber Adonay Escobar Solórzano (Kitsótaro) · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// HOJA-GOOGLE.JS — motor de datos real: Google Sheets v4 + Drive v3.
//
// - Lecturas con valueRenderOption UNFORMATTED_VALUE (INVARIANTE 4: en una
//   hoja en español «8,5» llegaba como texto y se truncaba a 8).
// - Escrituras RAW (sin interpretar fórmulas ni fechas).
// - Sesión vencida (401): pide renovar el token y reintenta UNA vez (D64).
// - Cuota o error temporal de Google (429/500/503): espera y reintenta
//   (1 s, 2 s, 4 s, 8 s) antes de rendirse.
// - Solo ve archivos que la app creó o que el usuario eligió (drive.file).
//
// Expone: MotorGoogle, codigoErrorGoogle.
// Depende de: gapi (cargado por Google), hoja.js (filaDeRango),
//   sesion.js (Sesion.renovarToken) en tiempo de ejecución.
// ============================================================

const MIME_HOJA = 'application/vnd.google-apps.spreadsheet';
const MIME_CARPETA = 'application/vnd.google-apps.folder';

function codigoErrorGoogle(err) {
  if (!err) return 0;
  if (err.status) return err.status;
  if (err.result && err.result.error && err.result.error.code) return err.result.error.code;
  return 0;
}

async function conReintentosGoogle(fn) {
  let renovado = false;
  const esperas = [1000, 2000, 4000, 8000];
  for (let intento = 0; ; intento++) {
    try {
      return await fn();
    } catch (err) {
      const codigo = codigoErrorGoogle(err);
      if (codigo === 401 && !renovado && typeof Sesion !== 'undefined') {
        renovado = true;
        await Sesion.renovarToken('La sesión con Google venció. Renuévala para continuar.');
        continue;
      }
      const temporal = codigo === 429 || codigo === 500 || codigo === 502 || codigo === 503 || codigo === 0;
      if (temporal && intento < esperas.length && !(codigo === 0 && intento >= 1)) {
        await new Promise(r => setTimeout(r, esperas[intento]));
        continue;
      }
      const mensaje = (err && err.result && err.result.error && err.result.error.message) || (err && err.message) || 'Error de Google';
      const e = new Error(mensaje);
      e.codigo = codigo;
      throw e;
    }
  }
}

function consultaPropiedades(propiedades) {
  return Object.entries(propiedades || {})
    .map(([k, v]) => ` and appProperties has { key='${k}' and value='${String(v).replace(/'/g, "\\'")}' }`).join('');
}

const MotorGoogle = {
  nombre: 'google',

  async leerVarios(id, rangos) {
    const res = await conReintentosGoogle(() => gapi.client.sheets.spreadsheets.values.batchGet({
      spreadsheetId: id, ranges: rangos, valueRenderOption: 'UNFORMATTED_VALUE'
    }));
    const vr = (res.result && res.result.valueRanges) || [];
    return rangos.map((_, i) => (vr[i] && vr[i].values) || []);
  },

  async agregar(id, hoja, filas) {
    if (!filas.length) return { primeraFila: null, ultimaFila: null };
    const res = await conReintentosGoogle(() => gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: id, range: `${hoja}!A1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      resource: { values: filas }
    }));
    const primera = filaDeRango(res.result && res.result.updates && res.result.updates.updatedRange);
    return { primeraFila: primera, ultimaFila: primera ? primera + filas.length - 1 : null };
  },

  async actualizar(id, datos) {
    if (!datos.length) return;
    await conReintentosGoogle(() => gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      resource: { valueInputOption: 'RAW', data: datos.map(d => ({ range: d.rango, values: d.valores })) }
    }));
  },

  async titulosHojas(id) {
    const res = await conReintentosGoogle(() => gapi.client.sheets.spreadsheets.get({
      spreadsheetId: id, fields: 'sheets.properties.title'
    }));
    return res.result.sheets.map(h => h.properties.title);
  },

  async agregarHojas(id, titulos) {
    if (!titulos.length) return;
    await conReintentosGoogle(() => gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      resource: { requests: titulos.map(t => ({ addSheet: { properties: { title: t } } })) }
    }));
  },

  async existe(id) {
    try {
      await gapi.client.sheets.spreadsheets.get({ spreadsheetId: id, fields: 'spreadsheetId' });
      return true;
    } catch (err) {
      if (codigoErrorGoogle(err) === 401 && typeof Sesion !== 'undefined') {
        await Sesion.renovarToken('La sesión con Google venció. Renuévala para continuar.');
        return this.existe(id);
      }
      return false;
    }
  },

  async crearHojaCalculo({ titulo, carpetaId, propiedades, hojas }) {
    const res = await conReintentosGoogle(() => gapi.client.drive.files.create({
      resource: { name: titulo, mimeType: MIME_HOJA, parents: carpetaId ? [carpetaId] : undefined, appProperties: propiedades || {} },
      fields: 'id'
    }));
    const id = res.result.id;
    // La hoja nace con una pestaña por defecto (id 0): se agregan las nuestras y se borra esa.
    const meta = await conReintentosGoogle(() => gapi.client.sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets.properties' }));
    const porDefecto = meta.result.sheets.map(h => h.properties.sheetId);
    const requests = hojas.map(t => ({ addSheet: { properties: { title: t } } }))
      .concat(porDefecto.map(sheetId => ({ deleteSheet: { sheetId } })));
    await conReintentosGoogle(() => gapi.client.sheets.spreadsheets.batchUpdate({ spreadsheetId: id, resource: { requests } }));
    return id;
  },

  async buscarCarpeta(nombre, propiedades) {
    const res = await conReintentosGoogle(() => gapi.client.drive.files.list({
      q: `mimeType='${MIME_CARPETA}' and name='${nombre}' and trashed=false${consultaPropiedades(propiedades)}`,
      fields: 'files(id,name)', spaces: 'drive'
    }));
    const f = res.result.files || [];
    return f.length ? f[0].id : null;
  },

  async crearCarpeta(nombre, propiedades) {
    const res = await conReintentosGoogle(() => gapi.client.drive.files.create({
      resource: { name: nombre, mimeType: MIME_CARPETA, appProperties: propiedades || {} }, fields: 'id'
    }));
    return res.result.id;
  },

  async listarArchivos({ carpetaId, propiedades } = {}) {
    let q = `mimeType='${MIME_HOJA}' and trashed=false`;
    if (carpetaId) q += ` and '${carpetaId}' in parents`;
    q += consultaPropiedades(propiedades);
    const res = await conReintentosGoogle(() => gapi.client.drive.files.list({
      q, fields: 'files(id,name,appProperties,modifiedTime,createdTime)', spaces: 'drive', orderBy: 'createdTime desc'
    }));
    return (res.result.files || []).map(f => ({
      id: f.id, nombre: f.name, propiedades: f.appProperties || {}, modificado: f.modifiedTime, creado: f.createdTime
    }));
  },

  async buscarPorNombre(nombre) {
    const res = await conReintentosGoogle(() => gapi.client.drive.files.list({
      q: `name='${nombre}' and mimeType='${MIME_HOJA}' and trashed=false`, fields: 'files(id,name,appProperties)', spaces: 'drive'
    }));
    return (res.result.files || []).map(f => ({ id: f.id, nombre: f.name, propiedades: f.appProperties || {} }));
  },

  async copiarArchivo(id, { nombre, carpetaId, propiedades }) {
    const res = await conReintentosGoogle(() => gapi.client.drive.files.copy({
      fileId: id, resource: { name: nombre, parents: carpetaId ? [carpetaId] : undefined, appProperties: propiedades || {} }, fields: 'id'
    }));
    return res.result.id;
  },

  async actualizarArchivo(id, { nombre, propiedades }) {
    const resource = {};
    if (nombre) resource.name = nombre;
    if (propiedades) resource.appProperties = propiedades;
    await conReintentosGoogle(() => gapi.client.drive.files.update({ fileId: id, resource, fields: 'id' }));
  },

  async papelera(id) {
    await conReintentosGoogle(() => gapi.client.drive.files.update({ fileId: id, resource: { trashed: true }, fields: 'id' }));
  },

  async correoUsuario() {
    const res = await conReintentosGoogle(() => gapi.client.drive.about.get({ fields: 'user' }));
    const u = res.result && res.result.user;
    return u && u.emailAddress ? u.emailAddress.toLowerCase().trim() : '';
  }
};
