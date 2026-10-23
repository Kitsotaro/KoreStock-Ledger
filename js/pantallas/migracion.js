// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// PANTALLA MIGRACION — asistente para pasar una base v2 a la estructura
// nueva (V3 §5). Con botón y aviso (§8 punto 5 / §31): nunca automático.
//   1. Explica qué pasa (tu base actual no se toca y queda de respaldo).
//   2. Muestra las fusiones propuestas, cada una SIN marcar: el usuario
//      confirma una por una (nunca en silencio). Para las de unidades puede
//      corregir el nombre de la unidad (huevo, lata…).
//   3. Migra, verifica y relee; si algo no cuadra, NO se activa y lo explica.
//
// Expone: (registra la pantalla 'migracion'), iniciarMigracion.
// Depende de: shell.js, componentes.js, migracion.js (núcleo).
// ============================================================

let _migracion = { idViejo: null, propuestas: [], alTerminar: null };

async function iniciarMigracion(idViejo, alTerminar) {
  _migracion = { idViejo, propuestas: [], alTerminar, datos: null };
  Shell.ir('migracion');
}

registrarPantalla('migracion', {
  titulo: 'Actualizar tu base',
  montar() {},
  async mostrar(el) {
    el.innerHTML = html`<div class="columna"><div class="pantalla-carga"><div><div class="girador"></div><p>Revisando tu base actual…</p></div></div></div>`.texto;
    try {
      _migracion.datos = await leerBaseV2(_migracion.idViejo);
      _migracion.propuestas = proponerFusiones(_migracion.datos);
    } catch (e) {
      el.innerHTML = html`<div class="vacio">${seguro(icono('peligro'))}<strong>No se pudo leer tu base</strong><p>${e.message}</p></div>`.texto;
      return;
    }
    pintarAsistenteMigracion(el);
  }
});

function pintarAsistenteMigracion(el) {
  const d = _migracion.datos;
  const props = _migracion.propuestas;
  el.innerHTML = html`
    <div class="columna">
      <div class="tarjeta">
        <h2>Tu base de datos necesita actualizarse</h2>
        <p class="t-secundario">La nueva versión guarda tu stock en unidades, permite varios productos por ticket, clientes y precios por presentación. Para eso se crea una base nueva en tu carpeta <strong>KoreStock</strong> con todos tus datos.</p>
        <ul class="columna t-pequeno" style="margin-top:var(--e-3)">
          <li class="fila">${seguro(icono('escudo', 'icono-sm'))}Tu base actual <strong>no se modifica</strong>: queda como respaldo.</li>
          <li class="fila">${seguro(icono('check-circulo', 'icono-sm'))}Al terminar se comprueba que stock, ventas, utilidad y folios sean idénticos. Si algo no cuadra, no se activa nada.</li>
          <li class="fila">${seguro(icono('documento', 'icono-sm'))}${formatearNumero(d.LOG_TRANS.length)} movimientos · ${formatearNumero(d.CATALOGO.length)} productos · ${formatearNumero(d.COSTOS_OPERATIVOS.length + d.COSTOS_COMBUSTIBLE.length)} gastos y cargas.</li>
        </ul>
      </div>
      ${props.length ? html`
      <div class="tarjeta">
        <h3>Productos que se pueden unir (opcional)</h3>
        <p class="t-pequeno t-secundario">Encontramos productos que parecen el mismo. Marca solo los que quieras unir; los que no marques pasan igual que hoy.</p>
        <div class="columna" style="margin-top:var(--e-3)">
          ${props.map((p, i) => html`
            <div class="tarjeta-plana columna">
              <label class="casilla"><input type="checkbox" data-fusion="${i}"> <strong>${p.tipo === 'UNIDADES' ? 'Mismo producto, distinto empaque' : 'Mismo producto, distinto sabor'}</strong></label>
              <ul class="t-pequeno t-secundario">${p.descripcion.map(n => html`<li>• ${n}</li>`)}</ul>
              ${p.tipo === 'UNIDADES' ? html`<div class="campo"><label for="unidad-${i}">Se contará en</label>
                <div class="control"><input id="unidad-${i}" data-unidad="${i}" value="${p.unidadBase}"></div>
                <span class="ayuda-campo">Por ejemplo: huevo, lata, botella. Las cantidades se multiplican por el número de cada empaque.</span></div>` : ''}
              ${p.preciosDistintos ? html`<p class="franja aviso-color">${seguro(icono('advertencia', 'icono-sm'))}Estos productos tienen precios distintos. Si los unes, todos quedarán con el precio del primero.</p>` : ''}
            </div>`)}
        </div>
      </div>` : ''}
      <button type="button" class="boton boton-primario boton-grande boton-bloque" data-accion="migrar">${seguro(icono('actualizar'))}Actualizar mi base</button>
      <p class="t-mini t-tenue" style="text-align:center">Puede tardar un minuto. No cierres la app mientras termina.</p>
    </div>`.texto;
  delegar(el, 'click', { migrar: (boton) => ejecutarMigracionUI(el, boton) });
}

async function ejecutarMigracionUI(el, boton) {
  const props = _migracion.propuestas.map((p, i) => {
    const marcada = $(`[data-fusion="${i}"]`, el);
    const unidad = $(`[data-unidad="${i}"]`, el);
    return Object.assign({}, p, { aceptada: !!(marcada && marcada.checked), unidadBase: unidad ? (unidad.value.trim().toLowerCase() || p.unidadBase) : p.unidadBase });
  });
  const unidas = props.filter(p => p.aceptada).length;
  const ok = await confirmar({
    titulo: 'Actualizar tu base',
    mensaje: `Se creará una base nueva con todos tus datos${unidas ? ` y ${unidas} unión(es) de productos` : ''}. Tu base actual queda como respaldo, sin cambios.`,
    textoConfirmar: 'Actualizar'
  });
  if (!ok) return;
  boton.classList.add('cargando');
  const progreso = document.createElement('p');
  progreso.className = 't-secundario';
  progreso.setAttribute('role', 'status');
  boton.after(progreso);
  try {
    const alProgreso = (paso, texto) => { progreso.textContent = `Paso ${paso} de 6 · ${texto}`; };
    let r = await migrarBaseV2(_migracion.idViejo, props, alProgreso);
    if (!r.ok && r.etapa === 'diferencias') {
      // El stock guardado no coincide con el historial: se avisa y, si acepta, se migra con el historial.
      const d = r.verificacion.diferencias;
      const seguir = await confirmar({
        titulo: `${d.length} ${pluralizar(d.length, 'producto tiene', 'productos tienen')} un stock distinto`,
        mensaje: `En tu versión anterior, el stock guardado de ${d.length === 1 ? 'este producto no coincide' : 'estos productos no coincide'} con sus compras y ventas registradas. KoreStock calcula el stock con el historial (lo que compraste menos lo que vendiste), así que tras actualizar verás el número del historial.\n\nDespués haz un conteo físico de ${d.length === 1 ? 'ese producto' : 'esos productos'} y, si hace falta, corrige con una entrada o una venta.`,
        contenido: html`<ul class="columna t-pequeno">${d.slice(0, 12).map(x => html`<li>• ${x.nombre}: guardado ${formatearNumero(x.guardado)} · historial ${formatearNumero(x.historial)}</li>`)}${d.length > 12 ? html`<li>…y ${d.length - 12} más.</li>` : ''}</ul>`,
        textoConfirmar: 'Actualizar con el historial', textoCancelar: 'Ahora no'
      });
      if (!seguir) { boton.classList.remove('cargando'); progreso.remove(); return; }
      r = await migrarBaseV2(_migracion.idViejo, props, alProgreso, { aceptarDiferencias: true });
    }
    if (!r.ok) {
      boton.classList.remove('cargando');
      const errores = (r.verificacion && r.verificacion.errores || []).concat(r.comparacion ? r.comparacion.errores : []);
      mostrarDialogo({
        titulo: 'No se activó la base nueva',
        mensaje: 'Algo no cuadró al comprobar tus datos, así que todo sigue como estaba.',
        contenido: html`<ul class="columna t-pequeno">${errores.slice(0, 8).map(e => html`<li>• ${e}</li>`)}</ul>
          <p class="t-pequeno t-secundario" style="margin-top:var(--e-3)">Si no sabes por qué pasa, escríbenos a ${CORREO_CONTACTO}.</p>`,
        textoConfirmar: 'Entendido'
      });
      progreso.remove();
      return;
    }
    guardarLocal(CLAVES_LOCALES.BASE, r.idNuevo);
    progreso.textContent = 'Listo: tu base nueva está activa.';
    if (_migracion.alTerminar) await _migracion.alTerminar(r.idNuevo, r);
  } catch (e) {
    boton.classList.remove('cargando');
    progreso.textContent = '';
    mostrarDialogo({ titulo: 'No se pudo terminar', mensaje: `${e.message}\n\nTu base actual no cambió. Puedes intentarlo de nuevo.` });
  }
}
