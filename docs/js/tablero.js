// js/tablero.js       — AMA Producción
//
// El tablero de Inicio (10/11): cómo viene la temporada contra lo planificado.
// Cuatro relojes —ritmo del plan, cosecha a hoy, puntualidad y datos para
// revisar— y la curva de cosecha acumulada.
//
// Dos reglas:
//  - Los HECHOS de toda la temporada los cuenta el servicio (?seguimiento=1,
//    seguimientoDe en Code.gs) y el plan cruzado con las siembras
//    (?generaciones=1): el teléfono recibe solo las últimas 15 filas de cada
//    hoja y contar sobre esa ventana ya rompió dos funciones.
//  - Lo ESPERADO se calcula acá con tramosDe, la misma cuenta que dibuja el
//    plan estratégico: el tablero y el plan no pueden decir cosas distintas.
//
// Arriba van las cuentas, sin pantalla (probadas en pruebas.html); abajo, el
// dibujo. Cada reloj dice de qué está hecho: nunca un porcentaje solo.
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos.

// Dentro de esta cantidad de días, antes o después, una etapa está "en fecha".
const EN_FECHA_DIAS = 7;
// Desde cuándo algo sin cargar pide una revisión: un almácigo pasado de su
// fecha de trasplante, una siembra del plan sin registro, y los días sin
// cosechas cargadas cuando el plan dice que hay cultivos en cosecha.
const REVISAR_DESDE = { bandeja: 14, siembra: 30, cosecha: 14 };
// Cuánto dura la cosecha de un cultivo cuando el catálogo no lo dice (el
// mismo supuesto que la vista por semanas de Stock).
const DIAS_EN_COSECHA_SUPUESTOS = 14;

// Qué reloj está abierto mostrando su detalle. Vacío = ninguno.
let relojAbierto = "";

const masDias = (fecha, n) => (n ? sumarDias(fecha, n) : fecha);
const claveGen = (cultivo, generacion) => `${claveArea(cultivo)}|${Number(generacion) || 1}`;
// El lunes de una semana lo da lunesDe, de stock.js.

// Lo que mandó el servicio para ESTA chacra (null si todavía no llegó o si
// el servicio es anterior al tablero).
function seguimiento() {
  const s = leer(LS.seguimiento, null);
  return s && s.chacra === chacraCodigo() ? s.datos : null;
}

// ==========================================================
// LAS CUENTAS
// ==========================================================

/* Las etapas del plan: la siembra de cada generación y, si va por almácigo,
   su trasplante. Cada una con su fecha planificada y la real (vacía si no
   se hizo). Una generación partida en bancales separados es una sola
   siembra: cuenta una vez. `mide` es false en la siembra de plantines
   encargados o comprados: su fecha es teórica y no dice si se sembró a
   tiempo (sí cuenta como hecha). */
function etapasDelPlan(gens, noPropias = new Set()) {
  const etapas = new Map();
  gens.forEach((g) => {
    const t = tramosDe(g);
    if (!t) return;
    const poner = (tipo, plan, real, mide) => {
      if (!plan) return;
      const k = `${claveGen(g.cultivo, g.generacion)}|${tipo}`;
      const ya = etapas.get(k);
      if (!ya) {
        etapas.set(k, { tipo, cultivo: g.cultivo, generacion: Number(g.generacion) || 1,
                        plan, real: real || "", mide });
        return;
      }
      if (plan < ya.plan) ya.plan = plan;
      if (real && (!ya.real || real < ya.real)) ya.real = real;
    };
    poner("siembra", t.plan.inicio, t.real.siembra, !noPropias.has(String(g.siembra_id || "")));
    if (!t.directa) poner("trasplante", t.plan.campo, t.real.campo, true);
  });
  return [...etapas.values()].map((e) => Object.assign(e,
    { diferencia: e.real ? diasEntre(e.plan, e.real) : null }));
}

/* Ritmo del plan: de las etapas que tocaban hasta hoy, cuántas se hicieron.
   Se mueve desde el primer día de la temporada, antes de cosechar nada. */
function ritmoDelPlan(etapas, hoyISO) {
  const tocaban = etapas.filter((e) => e.plan <= hoyISO);
  const hechas = tocaban.filter((e) => e.real);
  return {
    tocaban: tocaban.length, hechas: hechas.length,
    pct: tocaban.length ? (hechas.length / tocaban.length) * 100 : null,
    adelantadas: etapas.filter((e) => e.plan > hoyISO && e.real).length,
    faltan: tocaban.filter((e) => !e.real).sort((a, b) => a.plan.localeCompare(b.plan)),
  };
}

/* Puntualidad: de lo que se hizo, cuánto se apartó de la fecha planificada.
   La mediana y no el promedio: una sola etapa muy atrasada no mueve el número
   de todas las demás. */
function puntualidadDe(etapas) {
  const medidas = etapas.filter((e) => e.real && e.mide && e.diferencia !== null);
  if (!medidas.length) return { medidas: [], mediana: null, pct: null, enFecha: 0 };
  const d = medidas.map((e) => e.diferencia).sort((a, b) => a - b);
  const m = d.length % 2 ? d[(d.length - 1) / 2] : Math.round((d[d.length / 2 - 1] + d[d.length / 2]) / 2);
  const enFecha = medidas.filter((e) => Math.abs(e.diferencia) <= EN_FECHA_DIAS).length;
  return { medidas, mediana: m, enFecha, pct: (enFecha / medidas.length) * 100 };
}

/* Cuándo y cuánto se esperaba cosechar de cada generación, SEGÚN EL PLAN:
   la ida al campo planificada más los días a cosecha del catálogo, y los
   kilos (bancales × m² × rinde) repartidos parejo en los días que dura la
   cosecha. Con la fecha planificada y no la prevista: si una siembra se
   atrasó, lo esperado no se corre con ella; eso es justamente lo que se
   quiere ver. */
function ventanasDeCosecha(gens, plan = []) {
  const out = [];
  gens.forEach((g) => {
    const camas = Number(g.camas) || 0;
    const t = camas > 0 ? tramosDe(g) : null;
    if (!t || !t.plan.campo) return;
    const fila = plan.find((p) => claveArea(p.cultivo) === claveArea(g.cultivo)) || {};
    const rinde = Number(fila.rinde_kg_m2) || Number((perfil(g.cultivo) || {}).rinde_ref_kg_m2) || 0;
    const kg = camas * bancalM2(g.sector) * rinde;
    if (!kg) return;
    const aCosecha = diasEntre(t.campo, t.inicioCosecha) || 0;
    const dura = diasEntre(t.inicioCosecha, t.fin) || DIAS_EN_COSECHA_SUPUESTOS;
    const desde = masDias(t.plan.campo, aCosecha);
    out.push({ cultivo: g.cultivo, kg, desde, hasta: masDias(desde, dura), dias: dura });
  });
  return out;
}

// Los kilos que el plan esperaba tener cosechados hasta esa fecha (inclusive).
function esperadoAl(ventanas, fecha, cultivo = "") {
  const k = cultivo ? claveArea(cultivo) : "";
  let kg = 0;
  ventanas.forEach((v) => {
    if (k && claveArea(v.cultivo) !== k) return;
    const pasados = diasEntre(v.desde, fecha) + 1;
    kg += v.kg * Math.max(0, Math.min(1, pasados / v.dias));
  });
  return kg;
}

/* La curva de la temporada: un punto por semana (cada domingo) con lo
   esperado acumulado y, hasta hoy, lo cosechado. `cosechas` viene sumado por
   semana: [lunes, cultivo, kg]. La proyección supone que lo que falta sigue
   en la misma proporción que hasta ahora: no adivina, prolonga. No se calcula
   hasta que el plan esperaba al menos el 3 % de la temporada (con menos, un
   cajón de más o de menos cambia todo). */
function serieDeCosecha(ventanas, cosechas, desde, hasta, hoyISO) {
  const ultimoDia = masDias(hasta, -1);
  const realAl = (fecha) => cosechas.reduce((a, c) => a + (c[0] <= fecha ? Number(c[2]) || 0 : 0), 0);
  const puntos = [{ fecha: desde, plan: esperadoAl(ventanas, masDias(desde, -1)), real: 0 }];
  let f = masDias(desde, (7 - new Date(desde + "T12:00:00").getDay()) % 7);
  for (; f < ultimoDia; f = masDias(f, 7)) {
    if (f === desde) continue;
    puntos.push({ fecha: f, plan: esperadoAl(ventanas, f), real: f < hoyISO ? realAl(f) : null });
  }
  puntos.push({ fecha: ultimoDia, plan: esperadoAl(ventanas, ultimoDia),
                real: ultimoDia < hoyISO ? realAl(ultimoDia) : null });

  const total = puntos[puntos.length - 1].plan;
  const empezo = hoyISO >= desde;
  const ref = hoyISO > ultimoDia ? ultimoDia : hoyISO;
  const hoyP = empezo ? { fecha: ref, plan: esperadoAl(ventanas, ref), real: realAl(ref) } : null;
  let proyeccion = null;
  if (hoyP && ref < ultimoDia && total > 0 && hoyP.plan >= total * 0.03) {
    const factor = hoyP.real / hoyP.plan;
    proyeccion = { factor, fin: hoyP.real + factor * (total - hoyP.plan) };
  }
  return { puntos, hoy: hoyP, total, proyeccion };
}

// Por cultivo: lo esperado a hoy, lo cosechado y lo que espera la temporada.
function cosechaPorCultivo(ventanas, cosechas, hoyISO, finISO) {
  const filas = new Map();
  const fila = (cultivo) => {
    const k = claveArea(cultivo);
    if (!filas.has(k)) filas.set(k, { cultivo, esperado: 0, real: 0, total: 0 });
    return filas.get(k);
  };
  ventanas.forEach((v) => {
    const x = fila(v.cultivo);
    x.esperado += esperadoAl([v], hoyISO);
    x.total += esperadoAl([v], finISO);
  });
  cosechas.forEach((c) => { if (c[0] <= hoyISO) fila(c[1]).real += Number(c[2]) || 0; });
  return [...filas.values()].filter((x) => x.esperado >= 0.5 || x.real > 0)
    .sort((a, b) => (b.esperado - a.esperado) || (b.real - a.real));
}

/* Datos para revisar: lo que puede hacer que un reloj mienta. Un atraso que
   en realidad es un registro que falta se ve igual que un atraso de verdad;
   esto lo separa para que alguien lo mire. El porcentaje es la parte de las
   generaciones que ya tenían que tener datos y no tienen nada raro.

   `vencidos`: almácigos pasados de su fecha de trasplante
   ({cultivo, generacion, dias, objetivo}). `seg`: lo del servicio. */
function datosParaRevisar({ etapas, vencidos = [], seg = null, ventanas = [], hoyISO }) {
  const senales = [];
  const marcadas = new Set();
  const enJuego = new Set(etapas.filter((e) => e.tipo === "siembra" && e.plan <= hoyISO)
    .map((e) => claveGen(e.cultivo, e.generacion)));
  const marcar = (cultivo, generacion) => {
    const k = claveGen(cultivo, generacion);
    if (enJuego.has(k)) marcadas.add(k);
  };

  vencidos.forEach((s) => {
    senales.push({ ir: "trasplantes", texto: `${s.cultivo} G${s.generacion}: tocaba trasplantar el ${
      diaMes(s.objetivo)} y sigue figurando en bandeja (${s.dias} días). ¿Ya está en el campo?` });
    marcar(s.cultivo, s.generacion);
  });
  etapas.filter((e) => e.tipo === "siembra" && !e.real
      && diasEntre(e.plan, hoyISO) > REVISAR_DESDE.siembra).forEach((e) => {
    senales.push({ ir: "siembras", texto: `${e.cultivo} G${e.generacion}: tocaba sembrar el ${
      diaMes(e.plan)} y no hay siembra cargada. Si no se va a hacer, sacala del plan.` });
    marcar(e.cultivo, e.generacion);
  });
  ((seg && seg.repetidas) || []).forEach((r) => {
    senales.push({ ir: "siembras", texto: `${r.cultivo} G${r.generacion}: tiene ${r.veces
      } siembras, del ${diaMes(r.desde)} al ${diaMes(r.hasta)}. ¿Alguna era de otra generación?` });
    marcar(r.cultivo, r.generacion);
  });
  ((seg && seg.futuras) || []).forEach((x) => {
    senales.push({ ir: x.hoja, texto: `${x.cultivo}: hay un registro en ${x.hoja
      } con fecha ${fechaCorta(x.fecha)}, que todavía no llegó.` });
  });
  // El plan dice que estas dos semanas hubo cosecha y no se cargó ninguna.
  if (seg) {
    const antes = masDias(hoyISO, -REVISAR_DESDE.cosecha);
    const entro = esperadoAl(ventanas, hoyISO) - esperadoAl(ventanas, antes);
    const ultima = (seg.ultimo || {}).cosechas || "";
    if (entro >= 1 && (!ultima || ultima < antes)) {
      senales.push({ ir: "cosechas", texto: ultima
        ? `La última cosecha cargada es del ${diaMes(ultima)} y el plan dice que hay cultivos en cosecha.`
        : "El plan dice que ya hay cultivos en cosecha y todavía no se cargó ninguna." });
    }
  }
  const limpias = enJuego.size - marcadas.size;
  return { senales, enJuego: enJuego.size, limpias,
           pct: enJuego.size ? (limpias / enJuego.size) * 100 : null };
}

// ==========================================================
// LOS DATOS DE ESTA CHACRA
// ==========================================================

// Las cosechas cargadas en este teléfono que todavía no viajaron: el servicio
// no las tiene, así que se suman encima (solo la cola: lo ya enviado lo
// cuenta el servicio, y sumarlo de nuevo lo contaría dos veces).
function cosechasEnLaCola() {
  return pendientes.filter((r) => r.tipo === "cosechas" && r.datos && r.datos.fecha)
    .map((r) => [lunesDe(r.datos.fecha), r.datos.cultivo, Number(r.datos.kg) || 0]);
}

// Todo lo que el tablero muestra, calculado una vez por dibujo.
function datosDelTablero() {
  const gens = leer(LS.generaciones, []) || [];
  if (!gens.length) return null;
  const seg = seguimiento();
  const hoyISO = hoy();
  const desde = isoDe(inicioDeTemporada());
  const fin = new Date(inicioDeTemporada()); fin.setFullYear(fin.getFullYear() + 1);
  const hasta = isoDe(fin);

  const etapas = etapasDelPlan(gens, new Set((seg && seg.no_propias) || []));
  const ventanas = ventanasDeCosecha(gens, CFG?.plan || []);
  /* Sin el servicio nuevo no hay cosecha por semana: queda el total de la
     chacra en un solo punto, hoy, y la curva real no se dibuja. */
  const cosechas = seg ? seg.cosechas.concat(cosechasEnLaCola())
    : Object.entries(resumen?.kg_por_cultivo || kgLocalesPorCultivo())
        .map(([cultivo, kg]) => [desde, cultivo, kg]);
  const vencidos = almacigosPendientes()
    .map((s) => ({ cultivo: s.cultivo, generacion: s.generacion, objetivo: s.objetivo,
                   dias: s.objetivo ? diasEntre(s.objetivo, hoyISO) : null }))
    .filter((s) => s.dias !== null && s.dias > REVISAR_DESDE.bandeja);

  return {
    hoyISO, desde, hasta, conSemanas: !!seg,
    ritmo: ritmoDelPlan(etapas, hoyISO),
    puntualidad: puntualidadDe(etapas),
    serie: serieDeCosecha(ventanas, cosechas, desde, hasta, hoyISO),
    porCultivo: cosechaPorCultivo(ventanas, cosechas, hoyISO, masDias(hasta, -1)),
    primeraCosecha: ventanas.map((v) => v.desde).sort()[0] || "",
    revisar: datosParaRevisar({ etapas, vencidos, seg, ventanas, hoyISO }),
  };
}

// ==========================================================
// EL DIBUJO
// ==========================================================

// Bien, atención o flojo: el color del reloj. Nunca va solo: al lado está el
// número y debajo de qué está hecho.
const tonoDeReloj = (pct) => (pct === null ? "sin" : pct >= 85 ? "bien" : pct >= 60 ? "ojo" : "flojo");

/* Un reloj: medio círculo que se llena hasta el porcentaje, el valor en
   grande y abajo, en palabras, de qué está hecho. Es un botón: tocarlo abre
   el detalle. */
function reloj(id, { pct, valor, titulo, detalle }) {
  const lleno = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const arco = "M 12 62 A 48 48 0 0 1 108 62";
  return `<button type="button" class="reloj tono-${tonoDeReloj(pct)}${relojAbierto === id ? " abierto" : ""}"
      data-reloj="${id}" aria-expanded="${relojAbierto === id}">
    <svg viewBox="0 0 120 70" aria-hidden="true">
      <path class="reloj-pista" d="${arco}" pathLength="100"/>
      ${lleno > 0 ? `<path class="reloj-arco" d="${arco}" pathLength="100" stroke-dasharray="${lleno.toFixed(1)} 100"/>` : ""}
    </svg>
    <b>${valor}</b>
    <span class="reloj-titulo">${titulo}</span>
    <span class="reloj-detalle">${detalle}</span>
  </button>`;
}

const pctTexto = (p) => `${num(p)}<small>%</small>`;
const plural = (n, uno, muchos) => `${num(n)} ${n === 1 ? uno : muchos}`;

function relojesDelTablero(d) {
  const { ritmo, puntualidad: p, serie, revisar } = d;
  const h = serie.hoy;
  const tocaCosecha = h && h.plan >= 1;
  const pctCosecha = tocaCosecha ? (h.real / h.plan) * 100 : null;
  return `<div class="relojes">
    ${reloj("ritmo", {
      pct: ritmo.pct, titulo: "Ritmo del plan",
      valor: ritmo.pct === null ? "—" : pctTexto(ritmo.pct),
      detalle: ritmo.tocaban ? `${num(ritmo.hechas)} de ${plural(ritmo.tocaban, "etapa que tocaba", "etapas que tocaban")}`
        : "todavía no tocaba nada",
    })}
    ${reloj("cosecha", {
      pct: pctCosecha, titulo: "Cosecha a hoy",
      valor: tocaCosecha ? pctTexto(pctCosecha) : (h && h.real > 0 ? `${num(h.real)}<small> kg</small>` : "—"),
      detalle: tocaCosecha ? `${num(h.real)} de ${num(h.plan)} kg esperados a hoy`
        : (d.primeraCosecha ? `el plan empieza a cosechar el ${diaMes(d.primeraCosecha)}` : "el plan no tiene kilos cargados"),
    })}
    ${reloj("puntualidad", {
      pct: p.pct, titulo: "Puntualidad",
      valor: p.mediana === null ? "—"
        : p.mediana === 0 ? "0<small> d</small>" : `${p.mediana > 0 ? "+" : "−"}${Math.abs(p.mediana)}<small> d</small>`,
      detalle: p.mediana === null ? "todavía no hay etapas hechas"
        : `${p.mediana > 0 ? "de atraso típico" : p.mediana < 0 ? "de adelanto típico" : "justo a tiempo"} · ${num(p.pct)}% en fecha`,
    })}
    ${reloj("revisar", {
      pct: revisar.pct, titulo: "Confianza del dato",
      valor: revisar.pct === null ? "—" : pctTexto(revisar.pct),
      detalle: revisar.senales.length ? `${plural(revisar.senales.length, "cosa", "cosas")} para revisar` : "nada para revisar",
    })}
  </div>`;
}

// Un tope "redondo" para el eje: 1, 2 o 5 por la potencia de diez que toque.
function topeRedondo(v) {
  if (!(v > 0)) return 10;
  const base = Math.pow(10, Math.floor(Math.log10(v)));
  const paso = [1, 2, 2.5, 5, 10].find((m) => m * base >= v);
  return paso * base;
}

/* La curva de cosecha acumulada. Tres cosas en el mismo par de ejes: lo que
   el plan esperaba (punteado), lo cosechado (lleno, con su área) y hacia
   dónde va a este ritmo (puntos). La raya vertical es hoy. */
function curvaDeCosecha(d) {
  const { serie, desde, hasta } = d;
  if (!(serie.total > 0)) return "";
  const W = 340, H = 186, x0 = 34, x1 = 318, y0 = 150, y1 = 14;
  const dias = diasEntre(desde, hasta);
  const tope = topeRedondo(Math.max(serie.total, serie.hoy ? serie.hoy.real : 0,
    serie.proyeccion ? serie.proyeccion.fin : 0));
  const X = (fecha) => x0 + (x1 - x0) * Math.max(0, Math.min(1, diasEntre(desde, fecha) / dias));
  const Y = (kg) => y0 - (y0 - y1) * Math.min(1, kg / tope);
  const p = (fecha, kg) => `${X(fecha).toFixed(1)},${Y(kg).toFixed(1)}`;

  const h = serie.hoy;
  const plan = serie.puntos.map((q) => p(q.fecha, q.plan)).join(" ");
  const reales = d.conSemanas && h
    ? serie.puntos.filter((q) => q.real !== null && q.fecha < h.fecha).concat([h]) : [];
  const real = reales.map((q) => p(q.fecha, q.real)).join(" ");
  const pr = serie.proyeccion;
  const futuro = pr ? [h].concat(serie.puntos.filter((q) => q.fecha > h.fecha))
    .map((q) => p(q.fecha, h.real + pr.factor * (q.plan - h.plan))).join(" ") : "";

  // Meses: una marca cada dos, con la letra del mes.
  const meses = [];
  for (let i = 0; i < 12; i += 2) {
    const m = new Date(inicioDeTemporada()); m.setMonth(m.getMonth() + i);
    meses.push(`<text x="${X(isoDe(m)).toFixed(1)}" y="${y0 + 15}">${MESES_CORTOS[m.getMonth()]}</text>`);
  }
  const lineas = [0, 0.5, 1].map((f) => `<line x1="${x0}" x2="${x1}" y1="${Y(tope * f).toFixed(1)}" y2="${Y(tope * f).toFixed(1)}"/>
    <text x="${x0 - 5}" y="${(Y(tope * f) + 3.5).toFixed(1)}" text-anchor="end">${num(tope * f)}</text>`).join("");

  const frase = !h ? "La temporada todavía no empezó."
    : h.plan < 1 ? (h.real > 0 ? `Van ${num(h.real)} kg cosechados; el plan todavía no esperaba cosecha.`
        : `El plan empieza a cosechar el ${fechaCorta(d.primeraCosecha)}.`)
    : `Van <b>${num(h.real)} kg</b> de los ${num(h.plan)} que el plan esperaba a hoy.${
        pr ? ` A este ritmo la temporada cierra cerca de <b>${num(pr.fin)} kg</b> (${num((pr.fin / serie.total) * 100)}% del plan).` : ""}`;

  return `<div class="curva">
    <h3>Cosecha acumulada <small>kg</small></h3>
    <p class="curva-frase">${frase}</p>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cosecha acumulada de la temporada: lo esperado por el plan contra lo cosechado.">
      <g class="curva-ejes">${lineas}${meses.join("")}</g>
      ${real ? `<polygon class="curva-area" points="${p(reales[0].fecha, 0)} ${real} ${p(h.fecha, 0)}"/>` : ""}
      <polyline class="curva-plan" points="${plan}"/>
      ${futuro ? `<polyline class="curva-futuro" points="${futuro}"/>` : ""}
      ${real ? `<polyline class="curva-real" points="${real}"/>` : ""}
      ${h ? `<line class="curva-hoy" x1="${X(h.fecha).toFixed(1)}" x2="${X(h.fecha).toFixed(1)}" y1="${y1 - 4}" y2="${y0}"/>
        <text class="curva-hoy-tx" x="${X(h.fecha).toFixed(1)}" y="${y1 - 7}" text-anchor="${X(h.fecha) > x1 - 30 ? "end" : "middle"}">hoy</text>
        <circle class="curva-punto" cx="${X(h.fecha).toFixed(1)}" cy="${Y(h.real).toFixed(1)}" r="4.5"/>` : ""}
    </svg>
    <div class="leyenda">
      <span><i class="ley-plan"></i>Plan</span>
      <span><i class="ley-real"></i>Cosechado</span>
      ${pr ? `<span><i class="ley-futuro"></i>A este ritmo</span>` : ""}
    </div>
    ${d.conSemanas ? "" : `<p class="nota">La línea de lo cosechado semana a semana aparece cuando se actualice el servicio de la chacra.</p>`}
  </div>`;
}

const nombreEtapa = (e) => `${esc(e.cultivo)} <span class="gen">G${e.generacion}</span>`;
const tantosMas = (lista, tope) => (lista.length > tope
  ? `<p class="nota">y ${num(lista.length - tope)} más.</p>` : "");

// Lo que tocaba y falta, lo más viejo primero.
function detalleRitmo(d) {
  const { faltan, adelantadas } = d.ritmo;
  const TOPE = 8;
  return `<div class="reloj-panel">
    <p class="nota">Cuenta la siembra de cada generación y, si va por almácigo, su trasplante.
      Toca lo que el plan tenía fechado hasta hoy.${adelantadas ? ` Además hay ${plural(adelantadas, "etapa hecha", "etapas hechas")} antes de su fecha.` : ""}</p>
    ${faltan.length ? faltan.slice(0, TOPE).map((e) => `<div class="registro">
        <div><div class="detalle">${nombreEtapa(e)}</div>
          <div class="cuando">${e.tipo === "siembra" ? "sembrar" : "trasplantar"} · tocaba el ${fechaCorta(e.plan)}</div></div>
        <span class="etiqueta alerta">hace ${plural(diasEntre(e.plan, d.hoyISO), "día", "días")}</span>
      </div>`).join("") + tantosMas(faltan, TOPE)
      : `<p class="nota"><b>Todo lo que tocaba está hecho.</b></p>`}
  </div>`;
}

/* Por cultivo: la barra es lo cosechado y la marca, lo que el plan esperaba a
   hoy. Si la barra no llega a la marca, ese cultivo viene de menos. */
function detalleCosecha(d) {
  const filas = d.porCultivo;
  const TOPE = 10;
  if (!filas.length) {
    return `<div class="reloj-panel"><p class="nota">El plan todavía no esperaba cosecha de ningún cultivo${
      d.primeraCosecha ? `: la primera es para el ${fechaCorta(d.primeraCosecha)}` : ""}.</p></div>`;
  }
  const maximo = Math.max(...filas.map((x) => Math.max(x.esperado, x.real)), 1);
  return `<div class="reloj-panel">
    <p class="nota">La barra es lo cosechado; la marca, lo que el plan esperaba a hoy.
      Lo esperado reparte los kilos de cada generación en los días que dura su cosecha.</p>
    ${filas.slice(0, TOPE).map((x) => `<div class="bala">
      <div class="bala-cab"><b>${esc(x.cultivo)}</b>
        <span>${num(x.real)} de ${num(x.esperado)} kg</span></div>
      <div class="bala-pista">
        <i style="width:${((x.real / maximo) * 100).toFixed(1)}%"></i>
        ${x.esperado >= 0.5 ? `<u style="left:${((x.esperado / maximo) * 100).toFixed(1)}%"></u>` : ""}
      </div>
    </div>`).join("")}${tantosMas(filas, TOPE)}
  </div>`;
}

/* Cada punto es una etapa hecha, puesta en los días que se apartó de su fecha
   planificada. La franja es "en fecha". Los que caen el mismo día se apilan. */
function detallePuntualidad(d) {
  const { medidas } = d.puntualidad;
  if (!medidas.length) {
    return `<div class="reloj-panel"><p class="nota">Todavía no hay siembras ni trasplantes registrados contra el plan.</p></div>`;
  }
  const MIN = -21, MAX = 42, W = 340, x0 = 12, x1 = 328, base = 78;
  const X = (dias) => x0 + (x1 - x0) * (Math.max(MIN, Math.min(MAX, dias)) - MIN) / (MAX - MIN);
  const pila = new Map();
  const puntos = medidas.slice().sort((a, b) => a.diferencia - b.diferencia).map((e) => {
    const col = Math.round(X(e.diferencia) / 9);
    const n = pila.get(col) || 0;
    pila.set(col, n + 1);
    const tono = Math.abs(e.diferencia) <= EN_FECHA_DIAS ? "en-fecha" : e.diferencia > 0 ? "tarde" : "antes";
    return `<circle class="pt-${tono}" cx="${(col * 9).toFixed(1)}" cy="${base - 9 - Math.min(n, 6) * 9}" r="3.8"/>`;
  }).join("");
  const marcas = [-14, 0, 14, 28, 42].map((n) => `<text x="${X(n).toFixed(1)}" y="${base + 14}" text-anchor="middle">${
    n === 0 ? "en fecha" : (n > 0 ? "+" : "−") + Math.abs(n) + (n === MAX ? "+" : "")}</text>`).join("");
  const peores = medidas.filter((e) => e.diferencia > EN_FECHA_DIAS)
    .sort((a, b) => b.diferencia - a.diferencia);
  const TOPE = 5;
  return `<div class="reloj-panel">
    <p class="nota">Cada punto es una siembra o un trasplante hecho: a la derecha, los días de atraso
      contra el plan; a la izquierda, de adelanto. La franja es «en fecha» (hasta ${EN_FECHA_DIAS} días).
      Los plantines encargados o comprados no cuentan en la siembra.</p>
    <svg class="tira" viewBox="0 0 ${W} 98" role="img" aria-label="${medidas.length} etapas hechas: ${d.puntualidad.enFecha} en fecha.">
      <rect class="tira-franja" x="${X(-EN_FECHA_DIAS).toFixed(1)}" y="8" width="${(X(EN_FECHA_DIAS) - X(-EN_FECHA_DIAS)).toFixed(1)}" height="${base - 8}" rx="4"/>
      <line class="tira-eje" x1="${x0}" x2="${x1}" y1="${base}" y2="${base}"/>
      <line class="tira-cero" x1="${X(0).toFixed(1)}" x2="${X(0).toFixed(1)}" y1="8" y2="${base}"/>
      ${puntos}
      <g class="tira-marcas">${marcas}</g>
    </svg>
    <div class="leyenda">
      <span><i class="ley-punto pt-en-fecha"></i>En fecha (${num(d.puntualidad.enFecha)})</span>
      <span><i class="ley-punto pt-tarde"></i>Tarde (${num(peores.length)})</span>
      <span><i class="ley-punto pt-antes"></i>Antes (${num(medidas.length - d.puntualidad.enFecha - peores.length)})</span>
    </div>
    ${peores.slice(0, TOPE).map((e) => `<div class="registro">
      <div><div class="detalle">${nombreEtapa(e)}</div>
        <div class="cuando">${e.tipo} · plan ${fechaCorta(e.plan)} · se hizo el ${fechaCorta(e.real)}</div></div>
      <span class="etiqueta espera">+${plural(e.diferencia, "día", "días")}</span>
    </div>`).join("")}${tantosMas(peores, TOPE)}
  </div>`;
}

const SECCION_DE = { siembras: "Siembras", trasplantes: "Trasplantes", cosechas: "Cosechas" };

function detalleRevisar(d) {
  const { senales, enJuego, limpias } = d.revisar;
  const TOPE = 10;
  return `<div class="reloj-panel">
    <p class="nota">Un reloj dice la verdad solo si el dato está cargado. Esto es lo que puede estar
      haciendo que parezca un atraso algo que es un registro que falta o está mal.
      ${enJuego ? `${num(limpias)} de ${plural(enJuego, "generación", "generaciones")} en marcha no tienen nada raro.` : ""}</p>
    ${senales.length ? senales.slice(0, TOPE).map((s) => `<div class="registro">
        <div class="detalle senal">${esc(s.texto)}</div>
        ${SECCION_DE[s.ir] ? `<button type="button" class="secundario chico" data-ir-seccion="${s.ir}">${SECCION_DE[s.ir]}</button>` : ""}
      </div>`).join("") + tantosMas(senales, TOPE)
      : `<p class="nota"><b>No hay nada para revisar.</b></p>`}
  </div>`;
}

// La tarjeta entera. Vacía si la chacra todavía no tiene generaciones en el
// plan: sin plan no hay contra qué comparar.
function tarjetaTablero() {
  const d = datosDelTablero();
  if (!d) return "";
  const detalle = { ritmo: detalleRitmo, cosecha: detalleCosecha,
                    puntualidad: detallePuntualidad, revisar: detalleRevisar }[relojAbierto];
  return `<div class="tarjeta tablero">
    <h2>Cómo viene la temporada <small>plan contra real</small></h2>
    ${relojesDelTablero(d)}
    ${detalle ? detalle(d) : `<p class="nota tablero-pista">Tocá un reloj para ver de qué está hecho.</p>`}
    ${curvaDeCosecha(d)}
  </div>`;
}

// Tocar un reloj abre su detalle; tocarlo de nuevo lo cierra. Se redibuja
// solo esta tarjeta (es una parte), y el foco vuelve al reloj tocado.
function prepararTablero() {
  document.querySelectorAll("[data-reloj]").forEach((b) => {
    b.onclick = () => {
      relojAbierto = relojAbierto === b.dataset.reloj ? "" : b.dataset.reloj;
      const cual = b.dataset.reloj;
      // Una parte con el foco adentro no se reemplaza (ver actualizarPartes):
      // se suelta el foco —puede estar en otro reloj— y después se devuelve.
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      redibujarConDatos("inicio");
      const otra = document.querySelector(`[data-reloj="${cual}"]`);
      if (otra) otra.focus({ preventScroll: true });
    };
  });
  document.querySelectorAll("[data-ir-seccion]").forEach((b) => {
    b.onclick = () => {
      // Siembras y Trasplantes se abren con su lista "Para…" desplegada.
      if (b.dataset.irSeccion === "siembras") abiertoParaSembrar = true;
      if (b.dataset.irSeccion === "trasplantes") abiertoParaTrasplantar = true;
      render(b.dataset.irSeccion);
    };
  });
}

// Los hechos de la temporada. Solo si el servicio de la chacra ya los sabe
// dar (cfg.tablero); con freno de 20 s, y redibuja solo si cambió algo.
async function traerSeguimiento(forzar = false) {
  if (!CFG?.tablero || !chacraCodigo() || !tieneAcceso() || !navigator.onLine) return;
  if (!forzar && Date.now() - (pedidoReciente.seguimiento || 0) < 20000) return;
  pedidoReciente.seguimiento = Date.now();
  try {
    const d = await (await fetch(
      `${urlServicio()}?${conCredenciales("seguimiento=1")}`)).json();
    if (!d.ok || !Array.isArray(d.cosechas)) return;
    const nuevo = { chacra: chacraCodigo(), datos: d };
    const cambio = JSON.stringify(leer(LS.seguimiento, null)) !== JSON.stringify(nuevo);
    escribir(LS.seguimiento, nuevo);
    if (cambio && vistaActual === "inicio") redibujarConDatos("inicio");
  } catch { /* sin señal: se usa lo último que se bajó */ }
}
