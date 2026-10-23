// © 2026 Wilber Adonay Escobar Solórzano (Kitsótaro) · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// PRIMER-USO.JS — recorrido de la primera vez en este dispositivo (§25.1):
//   1. Elegir modo (Bodega · Tienda · Pro), con una frase cada uno.
//   2. Avisos de una sola vez (D30/D66): redes Wi-Fi públicas y
//      responsabilidad del dispositivo. Botón «Entendido».
// Se recuerda en este navegador (D23); si se borra, vuelve a preguntar.
//
// Expone: necesitaPrimerUso, ejecutarPrimerUso.
// Depende de: shell.js (MODOS, Shell), componentes.js, config.js.
// ============================================================

function necesitaPrimerUso() {
  return !leerLocal(CLAVES_LOCALES.MODO) || leerLocal(CLAVES_LOCALES.AVISOS_LEIDOS) !== '1';
}

function ejecutarPrimerUso() {
  return new Promise((resolver) => {
    const pasoAvisos = () => {
      if (leerLocal(CLAVES_LOCALES.AVISOS_LEIDOS) === '1') { resolver(); return; }
      mostrarDialogo({
        titulo: 'Antes de empezar',
        contenido: html`<ul class="columna">
            <li class="fila" style="align-items:flex-start">${seguro(icono('escudo'))}<span><strong>Evita las redes Wi-Fi públicas.</strong><br><span class="t-pequeno t-secundario">Tu conexión con Google va cifrada, pero una red pública puede ser falsa o pedirte aceptar avisos de seguridad. Usa tu red o tus datos móviles.</span></span></li>
            <li class="fila" style="align-items:flex-start">${seguro(icono('telefono'))}<span><strong>Protege tu dispositivo.</strong><br><span class="t-pequeno t-secundario">La app guarda una copia de tus datos en este teléfono o computadora para abrir rápido. Usa bloqueo de pantalla; en un equipo compartido, cierra sesión al terminar.</span></span></li>
          </ul>`,
        textoConfirmar: 'Entendido',
        onConfirmar: () => { guardarLocal(CLAVES_LOCALES.AVISOS_LEIDOS, '1'); resolver(); }
      });
    };
    if (leerLocal(CLAVES_LOCALES.MODO)) { pasoAvisos(); return; }
    mostrarDialogo({
      titulo: '¿Cómo trabaja tu negocio?',
      mensaje: 'Elige un modo. Puedes cambiarlo cuando quieras desde el menú; tus datos no cambian.',
      contenido: html`<div class="opciones-modo">${Object.entries(MODOS).map(([clave, m]) => html`
        <button type="button" class="tarjeta opcion-modo" data-modo-inicial="${clave}" aria-pressed="${String(clave === 'tienda')}">
          ${seguro(icono(m.icono, 'icono-lg'))}<span><strong>${m.nombre}</strong><span class="t-pequeno t-secundario">${m.frase}</span></span>
        </button>`)}</div>`,
      textoConfirmar: 'Continuar',
      alMontar: (fondo) => {
        let elegido = 'tienda';
        fondo.__valor = () => elegido;
        $$('[data-modo-inicial]', fondo).forEach(b => b.addEventListener('click', () => {
          elegido = b.dataset.modoInicial;
          $$('[data-modo-inicial]', fondo).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        }));
      },
      onConfirmar: (modo) => { Shell.cambiarModo(modo || 'tienda'); setTimeout(pasoAvisos, 50); }
    });
  });
}
