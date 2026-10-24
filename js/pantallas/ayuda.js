// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// PANTALLA AYUDA (F5) — «Ayuda y políticas» del panel lateral:
//   - Guía rápida: qué se hace en cada pantalla, en lenguaje simple (D52).
//   - Tus datos: dónde viven, hasta cuándo sirve la copia del dispositivo
//     y cómo descargar o borrar todo.
//   - Preguntas frecuentes (las mismas de la página de inicio).
//   - Políticas: Privacidad, Términos y Licencia (texto formal).
//   - Contacto y versión.
//
// Expone: (registra la pantalla 'ayuda').
// Depende de: shell.js, componentes.js, cargador.js (abrirDocumento),
//   cache-local.js (vencimientoCopia).
// ============================================================

const GUIA_PANTALLAS = [
  ['venta', 'carrito', 'Venta', 'Busca el producto, elige si vendes por unidad o por empaque, escribe cuánto y cobra. Puedes armar un ticket con varios productos y elegir un cliente antes de cobrar. Después de cobrar tienes «Deshacer».'],
  ['entrada', 'entrada', 'Entrada', 'Registra lo que compraste como lo compraste: por empaque (caja, fardo…) o por unidad. Escribe el costo y el precio de venta; antes de guardar ves el resumen con tu ganancia y margen. Lo nuevo o lo que cambia mucho se marca en naranja. Para cambiar el costo o el precio de un producto usa «Modo editor».'],
  ['stock', 'caja', 'Stock', 'Todo tu catálogo con su semáforo: cuánto queda, cuánto vale y qué se está acabando. Lo que llega gratis (bonificación) siempre sale primero al vender; después, lo pagado a su costo promedio. Desde aquí editas productos, repartes sabores y fijas cuándo avisarte.'],
  ['dashboard', 'grafico-barras', 'Dashboard', 'Arriba ves lo vendido hoy. Debajo, cuánto vendiste y ganaste en el período que elijas con el botón de fecha, comparado con el anterior. En «Movimientos» ves cada ticket agrupado por día y puedes anular o corregir; lo anulado se puede revertir durante 7 días.'],
  ['panorama', 'panorama', 'Panorama (modo Pro)', 'Retorno de tu inversión, punto de equilibrio, cuándo se agota cada producto, costo promedio y combustible. Toca una tarjeta para ver el detalle.'],
  ['gastos', 'recibo', 'Gastos', 'Alquiler, luz, sueldos y demás gastos del negocio, con su reparto por categoría. Si la categoría no existe, elige «Agregar». Cuentan para el punto de equilibrio.'],
  ['combustible', 'combustible', 'Combustible', 'Cargas por vehículo: cuánto gastaste, galones y su rendimiento (km por galón).'],
  ['clientes', 'clientes', 'Clientes', 'Tus clientes, cuánto te compran y cuándo fue su último pedido; ordénalos por último pedido para armar tu ruta. Elegir cliente al vender es opcional.'],
  ['datos', 'descargar', 'Exportar / Importar', 'Respaldos automáticos, descargar una copia en Excel, restaurarla, importar compras y ventas, y archivar el historial antiguo.']
];

registrarPantalla('ayuda', {
  titulo: 'Ayuda y políticas',
  montar(el) {
    el.innerHTML = html`<div class="columna" id="ayuda-contenido"></div>`.texto;
    delegar(el, 'click', {
      'ayuda-documento': (b) => abrirDocumento(b.dataset.archivo, b.dataset.titulo)
    });
  },
  mostrar(el) { pintarAyuda(el); }
});

function pintarAyuda(el) {
  const vence = Almacen.actualizadoEn ? vencimientoCopia(Almacen.actualizadoEn) : 0;
  const hasta = vence ? new Date(vence) : null;
  const preguntas = $$('#preguntas details').map(d => ({ pregunta: $('summary', d).textContent, respuesta: $('p', d).textContent }));
  $('#ayuda-contenido', el).innerHTML = html`
    <section class="tarjeta columna" aria-labelledby="ayuda-guia">
      <div class="tarjeta-titulo"><h2 id="ayuda-guia">${seguro(icono('ayuda', 'icono-sm'))} Guía rápida</h2></div>
      <div class="lista">${GUIA_PANTALLAS.map(([destino, ic, titulo, texto]) => html`
        <details class="desplegable" name="guia" ${destino === 'panorama' ? seguro('data-solo-modo="pro"') : ''}>
          <summary class="fila-lista"><span class="icono-gasto">${seguro(icono(ic, 'icono-sm'))}</span><span class="crece titulo">${titulo}</span>${seguro(icono('chevron-abajo', 'icono-sm chevron'))}</summary>
          <div class="desplegable-cuerpo"><p class="t-pequeno t-secundario">${texto}</p>
            <button type="button" class="boton boton-secundario boton-sm" data-ir="${destino}" style="justify-self:start">Ir a ${titulo.replace(' (modo Pro)', '')}${seguro(icono('adelante', 'icono-sm'))}</button></div>
        </details>`)}</div>
    </section>

    <section class="tarjeta columna" aria-labelledby="ayuda-datos">
      <div class="tarjeta-titulo"><h2 id="ayuda-datos">${seguro(icono('privacidad', 'icono-sm'))} Tus datos</h2></div>
      <p class="t-pequeno">Viven en tu Google Drive, dentro de la carpeta <strong>KoreStock</strong>: tu base, sus respaldos y lo archivado. Nadie más tiene acceso.</p>
      <p class="t-pequeno">Este dispositivo guarda una copia para abrir rápido y consultar sin internet. Se borra sola si pasan 3 días sin actualizarla con internet, y también al salir.${hasta ? html` La copia actual sirve sin internet hasta el <strong>${formatearFechaCorta(fechaATexto(hasta))} a las ${String(hasta.getHours()).padStart(2, '0')}:${String(hasta.getMinutes()).padStart(2, '0')}</strong>.` : ''}</p>
      <p class="t-pequeno">Cuida tu teléfono: usa bloqueo de pantalla, no lo prestes con la sesión abierta y evita las redes Wi-Fi públicas.</p>
      <button type="button" class="boton boton-secundario" data-ir="datos">${seguro(icono('descargar', 'icono-sm'))}Descargar una copia o ver respaldos</button>
    </section>

    ${preguntas.length ? html`<section class="tarjeta columna" aria-labelledby="ayuda-faq">
      <div class="tarjeta-titulo"><h2 id="ayuda-faq">${seguro(icono('comentario', 'icono-sm'))} Preguntas frecuentes</h2></div>
      <div class="lista">${preguntas.map(p => html`<details class="desplegable" name="faq">
        <summary class="fila-lista"><span class="icono-gasto">${seguro(icono('ayuda', 'icono-sm'))}</span><span class="crece titulo">${p.pregunta}</span>${seguro(icono('chevron-abajo', 'icono-sm chevron'))}</summary>
        <div class="desplegable-cuerpo"><p class="t-pequeno t-secundario">${p.respuesta}</p></div></details>`)}</div>
    </section>` : ''}

    <section class="tarjeta columna" aria-labelledby="ayuda-politicas">
      <div class="tarjeta-titulo"><h2 id="ayuda-politicas">${seguro(icono('legal', 'icono-sm'))} Políticas</h2></div>
      <div class="lista">
        <button type="button" class="fila-lista" data-accion="ayuda-documento" data-archivo="PRIVACY.md" data-titulo="Aviso de privacidad">${seguro(icono('privacidad', 'icono-sm'))}<span class="crece titulo">Aviso de privacidad</span>${seguro(icono('adelante', 'icono-sm'))}</button>
        <button type="button" class="fila-lista" data-accion="ayuda-documento" data-archivo="TERMS.md" data-titulo="Términos de uso">${seguro(icono('documento', 'icono-sm'))}<span class="crece titulo">Términos de uso</span>${seguro(icono('adelante', 'icono-sm'))}</button>
        <button type="button" class="fila-lista" data-accion="ayuda-documento" data-archivo="LICENSE" data-titulo="Licencia">${seguro(icono('legal', 'icono-sm'))}<span class="crece titulo">Licencia (código disponible)</span>${seguro(icono('adelante', 'icono-sm'))}</button>
      </div>
    </section>

    <section class="tarjeta columna" aria-labelledby="ayuda-contacto">
      <div class="tarjeta-titulo"><h2 id="ayuda-contacto">${seguro(icono('comentario', 'icono-sm'))} Contacto</h2></div>
      <p class="t-pequeno">¿Dudas o algo no funciona? Escríbenos a <a href="mailto:${CORREO_CONTACTO}">${CORREO_CONTACTO}</a>.</p>
      <p class="t-mini t-tenue">© 2026 KoreStock Ledger — un proyecto de Kitsótaro · versión ${VERSION_APP}</p>
    </section>`.texto;
  pintarIconos(el);
}
