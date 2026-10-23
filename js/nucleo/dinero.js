// © 2026 Kitsótaro · KoreStock Ledger · Código disponible, todos los derechos reservados (ver LICENSE).
// ============================================================
// DINERO.JS — toda la aritmética de dinero de la app pasa por aquí.
//
// Por qué existe: JavaScript usa decimales binarios (0.1 + 0.2 no da 0.3)
// y 8.5 ÷ 30 no termina nunca. Si cada pantalla redondea a su manera, los
// errores se acumulan con miles de ventas. Aquí el dinero vive como un
// ENTERO en una escala fija (1 = 0.00001 dólar: alcanza para costos por
// unidad de hasta 5 decimales) y se redondea UNA sola vez, al final de cada
// línea o total, siempre con la misma regla (mitad hacia afuera del cero).
//
// Reglas:
//   - Ningún otro archivo suma, multiplica ni divide dinero a mano.
//   - El dato exacto es el TOTAL (lo pagado o cobrado); el precio por
//     unidad es derivado.
//   - Para escribir en Sheets se convierte con dineroANumero().
//
// Expone: ESCALA_DINERO, dinero, esDineroValido, sumarDinero, restarDinero,
//   multiplicarDinero, dividirDinero, redondearCentavo, redondearDinero,
//   dineroANumero, formatearDinero, porcentajeDe, distribuirDinero,
//   precioUnitario, totalLinea, fijarTodosLosDecimales.
// Depende de: nada (se puede cargar primero y en Node para las pruebas).
// ============================================================

const ESCALA_DINERO = 100000;          // 5 decimales
const ESCALA_DINERO_BIG = 100000n;
const DECIMALES_DINERO = 5;

// Divide dos BigInt redondeando la mitad hacia afuera del cero.
function dividirRedondeadoBig(a, b) {
  if (b === 0n) throw new Error('División de dinero entre cero');
  const negativo = (a < 0n) !== (b < 0n);
  const aa = a < 0n ? -a : a;
  const bb = b < 0n ? -b : b;
  let q = aa / bb;
  const r = aa - q * bb;
  if (r * 2n >= bb) q += 1n;
  return negativo ? -q : q;
}

// Convierte texto decimal ("12.345678") al entero de la escala, redondeando
// el 6.º decimal. Trabaja con los dígitos, sin pasar por coma flotante.
function textoDecimalADinero(texto) {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(texto);
  if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) return NaN;
  const signo = m[1] === '-' ? -1n : 1n;
  const entero = BigInt(m[2] || '0');
  const frac = (m[3] || '').padEnd(DECIMALES_DINERO + 1, '0');
  let valor = entero * ESCALA_DINERO_BIG + BigInt(frac.slice(0, DECIMALES_DINERO));
  if (Number(frac[DECIMALES_DINERO]) >= 5) valor += 1n;
  return Number(signo * valor);
}

// Normaliza separadores como parsearNumero(): si trae coma y punto, el que
// esté más a la derecha es el decimal; si trae solo uno, ese es el decimal.
function normalizarTextoNumero(texto) {
  let t = String(texto).trim().replace(/\s|\$/g, '');
  const coma = t.includes(','), punto = t.includes('.');
  if (coma && punto) {
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (coma) {
    t = t.replace(',', '.');
  }
  return t;
}

// dinero(valor): número, texto o entero de escala → entero de escala.
// Vacío o inválido → 0 (igual criterio que parsearNumero).
function dinero(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'bigint') return Number(valor * ESCALA_DINERO_BIG);
  let texto;
  if (typeof valor === 'number') {
    if (!isFinite(valor)) return 0;
    texto = valor.toFixed(10); // quita el ruido binario (0.30000000000000004)
  } else {
    texto = normalizarTextoNumero(valor);
  }
  const d = textoDecimalADinero(texto);
  return isNaN(d) ? 0 : d;
}

function esDineroValido(valor) {
  if (valor === null || valor === undefined || valor === '') return false;
  if (typeof valor === 'number') return isFinite(valor);
  return !isNaN(textoDecimalADinero(normalizarTextoNumero(valor)));
}

function sumarDinero(...valores) {
  const lista = valores.length === 1 && Array.isArray(valores[0]) ? valores[0] : valores;
  let total = 0n;
  for (const v of lista) total += BigInt(v || 0);
  return Number(total);
}

function restarDinero(a, b) {
  return Number(BigInt(a || 0) - BigInt(b || 0));
}

// Multiplica dinero por una cantidad (entera o con hasta 3 decimales, p. ej.
// libras). Resultado redondeado a la escala.
function multiplicarDinero(d, cantidad) {
  const milesimas = BigInt(Math.round(Number(cantidad) * 1000));
  return Number(dividirRedondeadoBig(BigInt(d || 0) * milesimas, 1000n));
}

// Divide dinero entre una cantidad (entera o con hasta 3 decimales).
function dividirDinero(d, divisor) {
  const milesimas = BigInt(Math.round(Number(divisor) * 1000));
  if (milesimas === 0n) return 0;
  return Number(dividirRedondeadoBig(BigInt(d || 0) * 1000n, milesimas));
}

// Redondea a centavo (2 decimales) — la regla única para totales y líneas.
function redondearCentavo(d) {
  return Number(dividirRedondeadoBig(BigInt(d || 0), 1000n) * 1000n);
}

// Redondea a N decimales (0..5).
function redondearDinero(d, decimales) {
  const paso = 10n ** BigInt(DECIMALES_DINERO - decimales);
  return Number(dividirRedondeadoBig(BigInt(d || 0), paso) * paso);
}

// Para guardar en Sheets: número con hasta 5 decimales, sin ruido binario.
function dineroANumero(d) {
  const n = Number(d || 0);
  const signo = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const entero = Math.floor(abs / ESCALA_DINERO);
  const frac = String(abs % ESCALA_DINERO).padStart(DECIMALES_DINERO, '0');
  return Number(`${signo}${entero}.${frac}`);
}

// "$1,234.56" — con signo negativo delante del símbolo. decimales 0..5.
// Decimales que se MUESTRAN (los cálculos siempre usan los 5): 2 por defecto;
// 5 si el usuario activa «Mostrar todos los decimales». `detalle: true`
// marca cifras que pueden necesitar más de 2 (costos por unidad, CPP).
let decimalesDetalle = 2;
function fijarTodosLosDecimales(si) { decimalesDetalle = si ? DECIMALES_DINERO : 2; }

function formatearDinero(d, opciones) {
  const { detalle = false, simbolo = '$' } = opciones || {};
  const decimales = (opciones && opciones.decimales !== undefined) ? opciones.decimales : (detalle ? decimalesDetalle : 2);
  const redondo = redondearDinero(d || 0, decimales);
  const negativo = redondo < 0;
  const abs = Math.abs(redondo);
  const entero = Math.floor(abs / ESCALA_DINERO);
  const frac = String(abs % ESCALA_DINERO).padStart(DECIMALES_DINERO, '0').slice(0, decimales);
  const enteroTexto = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negativo ? '-' : ''}${simbolo}${enteroTexto}${decimales > 0 ? '.' + frac : ''}`;
}

// Porcentaje (número normal, para mostrar): parte ÷ total × 100.
function porcentajeDe(parte, total) {
  if (!total) return 0;
  return (Number(parte) / Number(total)) * 100;
}

// Reparte un total exacto entre partes proporcionales a unos pesos, sin
// perder ni inventar un solo decimal (método del mayor resto). Útil para
// repartir el total de un lote entre varias líneas.
function distribuirDinero(total, pesos) {
  const sumaPesos = pesos.reduce((s, p) => s + Number(p), 0);
  if (!sumaPesos) return pesos.map(() => 0);
  const T = BigInt(total);
  const base = pesos.map(p => {
    const num = T * BigInt(Math.round(Number(p) * 1000));
    const den = BigInt(Math.round(sumaPesos * 1000));
    return { parte: num / den, resto: num % den, den };
  });
  let asignado = base.reduce((s, b) => s + b.parte, 0n);
  let faltante = T - asignado;
  const orden = base.map((b, i) => i).sort((a, b) => (base[b].resto > base[a].resto ? 1 : base[b].resto < base[a].resto ? -1 : 0));
  const paso = faltante >= 0n ? 1n : -1n;
  for (let k = 0; faltante !== 0n && k < orden.length * 2; k++) {
    base[orden[k % orden.length]].parte += paso;
    faltante -= paso;
  }
  return base.map(b => Number(b.parte));
}

// Precio por unidad derivado de un total: total ÷ unidades, a 5 decimales.
function precioUnitario(total, unidades) {
  return unidades ? dividirDinero(total, unidades) : 0;
}

// Total de una línea: unidades × precio, redondeado a centavo (regla única).
function totalLinea(unidades, precio) {
  return redondearCentavo(multiplicarDinero(precio, unidades));
}
