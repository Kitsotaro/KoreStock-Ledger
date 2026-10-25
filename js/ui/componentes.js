// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// COMPONENTES.JS — piezas de interfaz reutilizables (R4: heredadas de la
// v2 cuando existían, sin manejadores inline para permitir una política
// de contenido estricta).
//
//   icono(nombre)            → <svg> del sprite (D42)
//   mostrarDialogo({...})    → reemplaza alert/confirm (API de la v2);
//                              con Cancelar, el foco va a Cancelar (INV. 21)
//   confirmar({...})         → igual, pero devuelve una promesa (true/false)
//   confirmarFuerte({...})   → pide escribir una palabra (acciones por lote, §10.1)
//   mostrarResumen({...})    → ventana tras guardar: Aceptar / Deshacer (§12.2)
//   abrirHoja({...})         → hoja inferior (filtros, opciones)
//   avisar(texto, opciones)  → aviso breve abajo
//   crearBuscador({...})     → autocompletado (heredado de crearAutocomplete)
//   pintarPaginado({...})    → lista con «Cargar más (quedan N)» (D37)
//   html`...`                → plantilla que escapa los valores (INV. 16)
//
// Expone: anclarBotonPrincipal, icono, html, seguro, mostrarDialogo, cerrarDialogo, confirmar,
//   confirmarFuerte, mostrarResumen, abrirHoja, avisar, crearBuscador,
//   pintarPaginado, delegar, activarSugerencias, botonInfo, mostrarInfobox, cerrarInfobox, $, $$.
// Depende de: utilidades.js (escaparHTML).
// ============================================================

const $ = (sel, raiz) => (raiz || document).querySelector(sel);
const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));

function icono(nombre, clase) {
  return `<svg class="icono ${clase || ''}" aria-hidden="true" focusable="false"><use href="assets/iconos.svg?v=${VERSION_APP}#i-${nombre}"></use></svg>`;
}

// Texto ya seguro (no se vuelve a escapar dentro de html``).
function seguro(texto) { return { __seguro: true, texto: String(texto) }; }

// Plantilla: todo valor interpolado se escapa salvo que venga de seguro() o
// sea un arreglo de piezas seguras.
function html(partes, ...valores) {
  const convertir = (v) => {
    if (v === null || v === undefined || v === false) return '';
    if (Array.isArray(v)) return v.map(convertir).join('');
    if (v && v.__seguro) return v.texto;
    return escaparHTML(v);
  };
  let salida = partes[0];
  valores.forEach((v, i) => { salida += convertir(v) + partes[i + 1]; });
  return seguro(salida);
}

// Delegación de eventos: data-accion="nombre" en cualquier botón del contenedor.
function delegar(raiz, tipo, acciones) {
  raiz.addEventListener(tipo, (e) => {
    const el = e.target.closest('[data-accion]');
    if (!el || !raiz.contains(el)) return;
    const fn = acciones[el.dataset.accion];
    if (fn) fn(el, e);
  });
}

// ---------- Diálogo ----------
let dialogoActual = null;

function cerrarDialogo() {
  if (dialogoActual) { dialogoActual.remove(); dialogoActual = null; }
  document.removeEventListener('keydown', teclaDialogo);
}
function teclaDialogo(e) {
  if (e.key === 'Escape' && dialogoActual) { const c = $('[data-rol="cancelar"]', dialogoActual); if (c) c.click(); else cerrarDialogo(); }
}

function mostrarDialogo({ titulo = 'Aviso', mensaje = '', contenido = null, textoConfirmar = 'Entendido', textoCancelar = null,
  onConfirmar = null, onCancelar = null, peligro = false, aviso = false, clase = '', alMontar = null }) {
  cerrarDialogo();
  const fondo = document.createElement('div');
  fondo.className = 'dialogo-fondo';
  fondo.innerHTML = html`<div class="dialogo ${clase}" role="alertdialog" aria-modal="true" aria-labelledby="dialogo-titulo">
      <h2 id="dialogo-titulo">${titulo}</h2>
      ${mensaje ? html`<p class="mensaje">${mensaje}</p>` : ''}
      <div class="dialogo-contenido">${contenido ? seguro(contenido.texto || contenido) : ''}</div>
      <div class="acciones">
        ${textoCancelar ? html`<button type="button" class="boton boton-secundario" data-rol="cancelar">${textoCancelar}</button>` : ''}
        <button type="button" class="boton ${peligro ? 'boton-peligro' : aviso ? 'boton-aviso' : 'boton-primario'}" data-rol="confirmar">${textoConfirmar}</button>
      </div></div>`.texto;
  document.body.appendChild(fondo);
  dialogoActual = fondo;
  const btnConfirmar = $('[data-rol="confirmar"]', fondo);
  const btnCancelar = $('[data-rol="cancelar"]', fondo);
  btnConfirmar.addEventListener('click', () => {
    if (btnConfirmar.disabled) return;
    const valor = fondo.__valor ? fondo.__valor() : undefined;
    cerrarDialogo();
    if (onConfirmar) onConfirmar(valor);
  });
  if (btnCancelar) btnCancelar.addEventListener('click', () => { cerrarDialogo(); if (onCancelar) onCancelar(); });
  document.addEventListener('keydown', teclaDialogo);
  if (alMontar) alMontar(fondo, btnConfirmar);
  (btnCancelar || btnConfirmar).focus();
}

function confirmar(opciones) {
  return new Promise((resolver) => {
    mostrarDialogo(Object.assign({ textoConfirmar: 'Sí, continuar', textoCancelar: 'Cancelar' }, opciones,
      { onConfirmar: () => resolver(true), onCancelar: () => resolver(false) }));
  });
}

// Confirmación fuerte: hay que escribir la palabra (por defecto CONFIRMAR).
function confirmarFuerte({ titulo, mensaje, palabra = 'CONFIRMAR', textoConfirmar = 'Aplicar', vistaPrevia = '' }) {
  return new Promise((resolver) => {
    mostrarDialogo({
      titulo, mensaje, textoConfirmar, textoCancelar: 'Cancelar', peligro: true,
      contenido: html`${seguro(vistaPrevia || '')}<div class="campo"><label for="confirmacion-fuerte">Para continuar escribe <strong>${palabra}</strong></label>
        <div class="control"><input id="confirmacion-fuerte" autocomplete="off" autocapitalize="characters"></div></div>`,
      alMontar: (fondo, boton) => {
        const input = $('#confirmacion-fuerte', fondo);
        boton.disabled = true;
        input.addEventListener('input', () => { boton.disabled = input.value.trim().toUpperCase() !== palabra; });
      },
      onConfirmar: () => resolver(true), onCancelar: () => resolver(false)
    });
  });
}

// Resumen tras guardar (sin temporizador): Aceptar o Deshacer (§12.2 punto 7).
function mostrarResumen({ titulo, lineas = [], total = '', detalle = '', alDeshacer = null, textoDeshacer = 'Deshacer' }) {
  return new Promise((resolver) => {
    mostrarDialogo({
      titulo, clase: 'resumen',
      contenido: html`${total ? html`<div class="total">${total}</div>` : ''}
        ${detalle ? html`<p class="t-secundario">${detalle}</p>` : ''}
        ${lineas.length ? html`<ul class="columna t-pequeno">${lineas.map(l => html`<li class="fila-separada"><span>${l.izquierda}</span><strong class="cifra">${l.derecha || ''}</strong></li>`)}</ul>` : ''}`,
      textoConfirmar: 'Aceptar',
      textoCancelar: alDeshacer ? textoDeshacer : null,
      onConfirmar: () => resolver('aceptar'),
      onCancelar: async () => { if (alDeshacer) await alDeshacer(); resolver('deshacer'); }
    });
    // En el resumen el foco va a Aceptar (la venta ya está guardada).
    setTimeout(() => { const b = $('[data-rol="confirmar"]', dialogoActual); if (b) b.focus(); }, 0);
  });
}

// ---------- Hoja inferior ----------
let hojaAbierta = null;
function abrirHoja({ titulo, contenido, acciones = [], alMontar = null, alCerrar = null }) {
  if (hojaAbierta) hojaAbierta.cerrar();
  const velo = document.createElement('div');
  velo.className = 'velo';
  const hoja = document.createElement('section');
  hoja.className = 'hoja-inferior';
  hoja.setAttribute('role', 'dialog');
  hoja.setAttribute('aria-modal', 'true');
  hoja.setAttribute('aria-label', titulo);
  hoja.innerHTML = html`<div class="asa"></div>
    <div class="cabecera"><h2>${titulo}</h2><button type="button" class="boton boton-icono" data-rol="cerrar" aria-label="Cerrar">${seguro(icono('cerrar'))}</button></div>
    <div class="cuerpo">${seguro(contenido && contenido.texto !== undefined ? contenido.texto : (contenido || ''))}</div>
    ${acciones.length ? html`<div class="acciones">${acciones.map((a, i) => html`<button type="button" class="boton ${a.clase || 'boton-secundario'}" data-indice="${i}">${a.texto}</button>`)}</div>` : ''}`.texto;
  document.body.append(velo, hoja);
  requestAnimationFrame(() => { velo.classList.add('visible'); hoja.classList.add('abierta'); });
  const control = {
    el: hoja,
    cerrar: () => {
      velo.classList.remove('visible'); hoja.classList.remove('abierta');
      document.removeEventListener('keydown', tecla);
      setTimeout(() => { velo.remove(); hoja.remove(); }, 320);
      if (hojaAbierta === control) hojaAbierta = null;
      if (alCerrar) alCerrar();
    }
  };
  const tecla = (e) => { if (e.key === 'Escape') control.cerrar(); };
  document.addEventListener('keydown', tecla);
  velo.addEventListener('click', control.cerrar);
  $('[data-rol="cerrar"]', hoja).addEventListener('click', control.cerrar);
  $$('[data-indice]', hoja).forEach(b => b.addEventListener('click', () => { const a = acciones[Number(b.dataset.indice)]; if (a.fn) a.fn(control); }));
  hojaAbierta = control;
  if (alMontar) alMontar(hoja, control);
  setTimeout(() => { const f = $('button:not([data-rol="cerrar"])', $('.cuerpo', hoja)); if (f) f.focus({ preventScroll: true }); }, 60);
  return control;
}

// ---------- Avisos ----------
function avisar(texto, opciones) {
  const { accion = null, alAccion = null, duracion = 4000 } = opciones || {};
  let zona = $('#avisos');
  if (!zona) { zona = document.createElement('div'); zona.id = 'avisos'; zona.className = 'avisos'; zona.setAttribute('aria-live', 'polite'); document.body.appendChild(zona); }
  const el = document.createElement('div');
  el.className = 'aviso-flotante';
  el.innerHTML = html`<span>${texto}</span>${accion ? html`<button type="button" class="boton boton-texto">${accion}</button>` : ''}`.texto;
  zona.appendChild(el);
  const quitar = () => el.remove();
  if (accion) $('button', el).addEventListener('click', () => { quitar(); if (alAccion) alAccion(); });
  setTimeout(quitar, duracion);
}

// ---------- Buscador con autocompletado (heredado de crearAutocomplete) ----------
// obtener(q) → [{ html, valor }]; nuevo(q) → { html } opcional (siempre al final).
function crearBuscador({ input, obtener, alElegir, nuevo = null, maximo = 8, alEnfocarVacio = null }) {
  const contenedor = input.closest('.buscador') || input.parentElement;
  const lista = document.createElement('div');
  lista.className = 'desplegable-opciones oculto';
  lista.setAttribute('role', 'listbox');
  contenedor.appendChild(lista);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  let opciones = [], resaltada = -1;

  const cerrar = () => { lista.classList.add('oculto'); input.setAttribute('aria-expanded', 'false'); };
  const marcar = () => $$('.opcion', lista).forEach((el, i) => {
    el.classList.toggle('resaltada', i === resaltada);
    if (i === resaltada) el.scrollIntoView({ block: 'nearest' });
  });
  const elegir = (op) => { cerrar(); if (op.esNuevo) nuevo.fn(input.value.trim()); else alElegir(op.valor); };
  const pintar = () => {
    const q = input.value.trim();
    opciones = q ? obtener(q).slice(0, maximo) : (alEnfocarVacio ? alEnfocarVacio().slice(0, maximo) : []);
    const htmlNuevo = q && nuevo ? nuevo.html(q) : null;
    if (htmlNuevo) opciones.push({ esNuevo: true, html: htmlNuevo });
    resaltada = opciones.length ? 0 : -1;
    if (!opciones.length) { cerrar(); return; }
    // Una opción con `grupo` abre un encabezado (no elegible) cuando cambia el grupo.
    let grupo = null;
    lista.innerHTML = opciones.map((o, i) => {
      const cabecera = o.grupo && o.grupo !== grupo ? escaparHTML(o.grupo) : '';
      if (o.grupo) grupo = o.grupo;
      return `${cabecera ? `<div class="opcion-grupo" role="presentation">${cabecera}</div>` : ''}<div class="opcion${o.esNuevo ? ' nuevo' : ''}${i === 0 ? ' resaltada' : ''}" role="option" data-i="${i}">${o.html.texto !== undefined ? o.html.texto : o.html}</div>`;
    }).join('');
    lista.classList.remove('oculto');
    input.setAttribute('aria-expanded', 'true');
  };
  lista.addEventListener('mousedown', (e) => {
    const el = e.target.closest('.opcion'); if (!el) return;
    e.preventDefault(); elegir(opciones[Number(el.dataset.i)]);
  });
  input.addEventListener('input', pintar);
  input.addEventListener('focus', () => { if (input.value.trim() || alEnfocarVacio) pintar(); });
  input.addEventListener('blur', () => setTimeout(cerrar, 150));
  input.addEventListener('keydown', (e) => {
    if (lista.classList.contains('oculto') || !opciones.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); resaltada = Math.min(resaltada + 1, opciones.length - 1); marcar(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); resaltada = Math.max(resaltada - 1, 0); marcar(); }
    else if (e.key === 'Enter') { if (resaltada >= 0) { e.preventDefault(); elegir(opciones[resaltada]); } }
    else if (e.key === 'Escape') cerrar();
  });
  return { cerrar, refrescar: pintar };
}

// ---------- ⓘ explicativos e infobox (fase UI) ----------
// Botón pequeño junto a una cifra; al tocarlo abre un INFOBOX anclado (no un
// diálogo) con markdown enriquecido: listas, negritas y fórmulas completas en
// bloques ```formula```. El texto es siempre propio de la app (nunca del usuario).
function botonInfo(titulo, texto) {
  return html`<button type="button" class="boton-info" data-info-titulo="${titulo}" data-info="${texto}" aria-label="Qué es ${titulo}">${seguro(icono('info', 'icono-sm'))}</button>`;
}

let infoboxAbierto = null;
function cerrarInfobox() { if (infoboxAbierto) { infoboxAbierto.remove(); infoboxAbierto = null; } }

async function mostrarInfobox(ancla, titulo, markdown) {
  cerrarInfobox();
  const caja = document.createElement('div');
  caja.className = 'infobox';
  caja.setAttribute('role', 'dialog');
  caja.setAttribute('aria-label', titulo);
  caja.innerHTML = html`<div class="infobox-cabecera"><strong>${titulo}</strong><button type="button" class="boton-info" data-cerrar-infobox aria-label="Cerrar">${seguro(icono('cerrar', 'icono-sm'))}</button></div><div class="infobox-cuerpo">${markdown}</div><span class="infobox-flecha"></span>`.texto;
  document.body.appendChild(caja);
  infoboxAbierto = caja;
  try {
    await cargarMarked();
    const cuerpo = $('.infobox-cuerpo', caja);
    if (cuerpo && infoboxAbierto === caja) cuerpo.innerHTML = marked.parse(markdown);
  } catch (e) { /* queda el texto plano */ }
  // Posición: debajo del ícono si cabe; si no, encima. Flecha apuntando al ícono.
  const r = ancla.getBoundingClientRect();
  const ancho = Math.min(caja.offsetWidth, window.innerWidth - 24);
  const izq = Math.max(12, Math.min(r.left + r.width / 2 - ancho / 2, window.innerWidth - ancho - 12));
  const debajo = r.bottom + 10 + caja.offsetHeight < window.innerHeight - 80;
  caja.style.left = `${izq}px`;
  caja.style.top = `${debajo ? r.bottom + 10 : Math.max(12, r.top - caja.offsetHeight - 10)}px`;
  caja.classList.add(debajo ? 'abajo' : 'arriba');
  $('.infobox-flecha', caja).style.left = `${r.left + r.width / 2 - izq - 7}px`;
  requestAnimationFrame(() => caja.classList.add('visible'));
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-info]');
    if (b) { e.preventDefault(); e.stopPropagation(); mostrarInfobox(b, b.dataset.infoTitulo, b.dataset.info); return; }
    if (infoboxAbierto && (e.target.closest('[data-cerrar-infobox]') || !e.target.closest('.infobox'))) cerrarInfobox();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarInfobox(); });
  window.addEventListener('scroll', cerrarInfobox, { passive: true });
}

// ---------- Sugerencias en campos de texto libre ----------
// El <datalist> del navegador no abre en todos los entornos (p. ej. vistas
// incrustadas). Cada input[list] se convierte solo en un buscador propio
// que lee las opciones de su <datalist> cada vez que se abre, con un botón
// para ver todas (sin abrir el teclado: el chevron no enfoca el campo). Se activa sola en todo HTML nuevo (MutationObserver).
function activarSugerencias(raiz) {
  const inputs = raiz.matches && raiz.matches('input[list]') ? [raiz] : $$('input[list]', raiz);
  inputs.forEach(input => {
    const idLista = input.getAttribute('list');
    input.removeAttribute('list');
    input.dataset.sugerencias = idLista;
    const control = input.parentElement;
    control.classList.add('con-sugerencias');
    const opcionesLista = () => { const dl = document.getElementById(idLista); return dl ? [...dl.options].filter(o => o.value) : []; };
    const valores = () => opcionesLista().map(o => o.value);
    const grupoDe = (v) => { const o = opcionesLista().find(x => x.value === v); return o ? (o.dataset.grupo || null) : null; };
    const iconoDe = (v) => { const o = opcionesLista().find(x => x.value === v); return o ? (o.dataset.icono || '') : ''; };
    const opcion = (v) => { const ic = iconoDe(v); return { valor: v, grupo: grupoDe(v), html: html`${ic ? html`<span class="icono-gasto">${seguro(icono(ic, 'icono-sm'))}</span>` : ''}<span class="crece">${v}</span>` }; };
    // Con data-permite-nuevo, si lo escrito no existe se ofrece «Agregar «X»» al final.
    const ponerValor = (v) => {
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const nuevo = input.dataset.permiteNuevo === undefined ? null : {
      html: (q) => valores().some(v => normalizarIdentidad(v) === normalizarIdentidad(q)) ? null : html`${seguro(icono('mas', 'icono-sm'))}<span class="crece">Agregar «${q}»</span>`,
      fn: (v) => { ponerValor(v); setTimeout(() => buscador.cerrar(), 0); }
    };
    const buscador = crearBuscador({
      input, maximo: 50, nuevo,
      obtener: (q) => valores().filter(v => normalizarIdentidad(v) !== normalizarIdentidad(q) && coincidenPalabras(v, q)).map(opcion),
      alEnfocarVacio: () => valores().map(opcion),
      alElegir: (v) => { ponerValor(v); setTimeout(() => buscador.cerrar(), 0); }
    });
    const boton = document.createElement('button');
    boton.type = 'button'; boton.className = 'boton-sugerencias'; boton.tabIndex = -1;
    boton.setAttribute('aria-label', 'Ver opciones');
    boton.innerHTML = icono('chevron-abajo', 'icono-sm');
    boton.addEventListener('mousedown', (e) => e.preventDefault());
    let quitar = () => {};
    boton.addEventListener('click', () => {
      const abierta = input.getAttribute('aria-expanded') === 'true';
      quitar();
      if (abierta) { buscador.cerrar(); return; }
      // Regla global: el chevron solo despliega la lista (no enfoca el campo), así no sube el teclado
      // en el teléfono. Sin foco no hay «blur» que la cierre: se cierra al tocar fuera o con Escape.
      const antes = input.value; input.value = ''; buscador.refrescar(); input.value = antes;
      const fuera = (e) => { if (!control.contains(e.target)) { buscador.cerrar(); quitar(); } };
      const tecla = (e) => { if (e.key === 'Escape') { buscador.cerrar(); quitar(); } };
      quitar = () => { document.removeEventListener('pointerdown', fuera, true); document.removeEventListener('keydown', tecla, true); quitar = () => {}; };
      document.addEventListener('pointerdown', fuera, true);
      document.addEventListener('keydown', tecla, true);
    });
    control.appendChild(boton);
  });
}
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.body) {
  new MutationObserver((cambios) => cambios.forEach(c => c.addedNodes.forEach(n => { if (n.nodeType === 1) activarSugerencias(n); })))
    .observe(document.body, { childList: true, subtree: true });
}

// ---------- Lista con tope y «Cargar más» (D37) ----------
// Los filtros y buscadores actúan sobre TODOS los datos; aquí solo se limita
// cuántas filas se dibujan.
function pintarPaginado({ contenedor, items, pintarItem, tope = 30, vacio = '', cuenta = null }) {
  let mostrados = 0;
  contenedor.innerHTML = '';
  if (!items.length) { contenedor.innerHTML = vacio && vacio.texto !== undefined ? vacio.texto : (vacio || ''); return; }
  const lista = document.createElement('div');
  lista.className = 'lista';
  const pie = document.createElement('div');
  pie.className = 'cargar-mas';
  contenedor.append(lista, pie);
  const mas = () => {
    const siguiente = items.slice(mostrados, mostrados + tope);
    lista.insertAdjacentHTML('beforeend', siguiente.map(it => { const r = pintarItem(it); return r && r.texto !== undefined ? r.texto : r; }).join(''));
    mostrados += siguiente.length;
    const resto = items.slice(mostrados);
    const quedan = cuenta ? resto.filter(cuenta).length : resto.length;
    pie.innerHTML = quedan > 0 ? html`<button type="button" class="boton boton-secundario">Cargar más (quedan ${formatearNumero(quedan)})</button>`.texto : '';
    const b = $('button', pie); if (b) b.addEventListener('click', mas);
  };
  mas();
}

// Botón principal anclado (solo teléfono): mientras el botón real (Cobrar / Guardar) queda
// debajo de la pantalla, un botón compacto flota abajo a la izquierda y le pasa el toque.
// Solo presentación: no calcula nada, copia el texto y el estado del botón real.
function anclarBotonPrincipal(pantalla, selector, clase) {
  const flota = document.createElement('button');
  flota.type = 'button'; flota.className = `boton ${clase} boton-flotante`; flota.hidden = true;
  document.body.appendChild(flota);
  let real = null, abajo = false;
  const io = new IntersectionObserver(([e]) => {
    abajo = !e.isIntersecting && e.boundingClientRect.top >= (e.rootBounds ? e.rootBounds.bottom : innerHeight);
    sincronizar();
  }, { rootMargin: '0px 0px -96px 0px' });
  function sincronizar() {
    const activa = !pantalla.hidden && real && real.isConnected;
    // Con el teclado abierto (escribiendo en un campo) no estorba.
    const escribiendo = pantalla.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    flota.hidden = !(activa && abajo && !escribiendo);
    if (activa) {
      // Compacto: solo el ícono y el monto («$2.87»); el texto completo queda para lectores de pantalla.
      const monto = (real.textContent.match(/\$[\d.,]+/) || [''])[0], ic = real.querySelector('svg');
      flota.innerHTML = monto && ic ? ic.outerHTML + `<span>${monto}</span>` : real.innerHTML;
      flota.setAttribute('aria-label', real.textContent.trim());
      flota.disabled = real.disabled;
    }
  }
  function buscar() {
    const nuevo = pantalla.querySelector(selector);
    if (nuevo === real) { sincronizar(); return; }
    io.disconnect(); real = nuevo; abajo = false;
    if (real) io.observe(real);
    sincronizar();
  }
  new MutationObserver(buscar).observe(pantalla, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'hidden'] });
  pantalla.addEventListener('focusin', sincronizar);
  pantalla.addEventListener('focusout', () => setTimeout(sincronizar, 0));
  flota.addEventListener('click', () => { if (real) real.click(); });
}
