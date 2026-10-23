// © 2026 KoreStock Ledger — un proyecto de Kitsótaro · Código disponible, todos los derechos reservados (ver LICENSE).
// Casos del módulo de dinero (V3 §4): exactitud, redondeo único y casos extremos.

grupo('Dinero: conversión');
prueba('0.1 + 0.2 da exactamente 0.30', () => {
  igual(sumarDinero(dinero(0.1), dinero(0.2)), dinero('0.3'));
  igual(formatearDinero(sumarDinero(dinero(0.1), dinero(0.2))), '$0.30');
});
prueba('lee texto con coma o punto decimal', () => {
  igual(dinero('8,5'), dinero(8.5));
  igual(dinero('1.234,56'), dinero(1234.56));
  igual(dinero('1,234.56'), dinero(1234.56));
  igual(dinero('$ 5.25'), dinero(5.25));
});
prueba('vacío o inválido es 0', () => {
  igual(dinero(''), 0); igual(dinero(null), 0); igual(dinero('abc'), 0); igual(dinero(NaN), 0);
});
prueba('5 decimales exactos y redondeo del sexto', () => {
  igual(dinero('0.16667'), 16667);
  igual(dinero('0.166665'), 16667);
  igual(dinero('0.166664'), 16666);
  igual(dinero('-0.166665'), -16667);
});
prueba('dineroANumero no deja ruido binario', () => {
  igual(dineroANumero(dinero('9.20001')), 9.20001);
  igual(dineroANumero(dinero(0.1) + dinero(0.2)), 0.3);
  igual(dineroANumero(-150), -0.0015);
});

grupo('Dinero: operaciones');
prueba('8.5 ÷ 30 por unidad y de vuelta al total sin perder centavos', () => {
  const total = dinero(8.5);
  const porUnidad = precioUnitario(total, 30);
  igual(formatearDinero(porUnidad, { decimales: 5 }), '$0.28333');
  // El total exacto es el dato; reconstruirlo desde el precio unitario puede diferir, por eso nunca se hace.
  igual(totalLinea(30, porUnidad), dinero('8.50'));
});
prueba('redondeo único a centavo, mitad hacia afuera', () => {
  igual(redondearCentavo(dinero('2.345')), dinero('2.35'));
  igual(redondearCentavo(dinero('2.344')), dinero('2.34'));
  igual(redondearCentavo(dinero('-2.345')), dinero('-2.35'));
});
prueba('multiplicar por cantidades decimales (libras)', () => {
  igual(multiplicarDinero(dinero('3.25'), 1.5), dinero('4.875'));
  igual(totalLinea(1.5, dinero('3.25')), dinero('4.88'));
});
prueba('5 × $5.25 = $26.25 y ganancia $1.25 sobre costo $5.00 (V3 §9.4)', () => {
  const cobrado = totalLinea(5, dinero(5.25));
  const costo = totalLinea(5, dinero(5.00));
  igual(formatearDinero(cobrado), '$26.25');
  igual(formatearDinero(restarDinero(cobrado, costo)), '$1.25');
});
prueba('miles de unidades con precios de 5 decimales', () => {
  let acumulado = 0;
  for (let i = 0; i < 10000; i++) acumulado = sumarDinero(acumulado, dinero('0.12345'));
  igual(acumulado, dinero('1234.5'));
  igual(totalLinea(250000, dinero('0.12345')), dinero('30862.50'));
});
prueba('montos grandes sin desbordar', () => {
  const grande = dinero('9999999.99999');
  igual(formatearDinero(multiplicarDinero(grande, 100), { decimales: 5 }), '$999,999,999.99900');
});
prueba('repartir un total sin perder un solo decimal', () => {
  const partes = distribuirDinero(dinero('10.00'), [1, 1, 1]);
  igual(sumarDinero(partes), dinero('10.00'));
  igual(Math.max(...partes) - Math.min(...partes) <= 1, true);
  const partes2 = distribuirDinero(dinero('100'), [30, 12, 12]);
  igual(sumarDinero(partes2), dinero('100'));
});
prueba('formato con miles y negativos', () => {
  igual(formatearDinero(dinero('1234567.891')), '$1,234,567.89');
  igual(formatearDinero(dinero('-0.005')), '-$0.01');
  igual(formatearDinero(0), '$0.00');
});
