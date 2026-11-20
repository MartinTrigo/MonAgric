// js/cierres.js       — AMA Producción
//
// Terminar una generación (12/11): se cosechó entera, o se perdió o se
// levantó antes (se fue en flor, plaga, malezas, no germinó…). El cierre
// guarda el motivo y LOS KILOS QUE DIO EN TOTAL, y de ahí sale el rinde
// logrado: kilos contra lo que se esperaba de esos bancales. Esa medida no
// depende de fechas: el Hakusai que se cosechó antes porque se fue en flor
// parecía un éxito en «Cosecha a hoy» (135 kg contra 0 esperados a esa fecha)
// y en realidad había dado menos de lo que tenía que dar.
//
// Los cierres viven en la hoja Cierres y llegan con ?seguimiento=1. Reabrir
// una generación es borrar su cierre.
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos.

const COSECHA_COMPLETA = "Cosecha completa";
const MOTIVOS_CIERRE = [COSECHA_COMPLETA, "Se fue en flor", "Plaga o enfermedad", "Malezas",
  "No germinó o falló el almácigo", "Helada o clima", "Otro motivo"];

// Qué generación se está terminando en la pantalla ("cultivo|generación").
let cierreAbierto = "";

/* Los cierres que valen ahora: los del servicio y, encima, lo de este
   teléfono que el servicio todavía no puede tener —lo que espera en la cola
   y lo enviado en los últimos diez minutos (el servicio recuerda su
   respuesta unos minutos)—. Lo mismo con los cierres borrados (reabrir).
   Pasado ese rato manda la planilla: un cierre que otro teléfono reabrió no
   se queda pegado acá. Devuelve un mapa por "cultivo|generación"; si hubiera
   dos de la misma, vale el último. */
let cierresMemo = { seg: null, cola: -1, enviados: -1, cuando: 0, mapa: new Map() };
function cierresVigentes() {
  const seg = seguimiento();
  const m = cierresMemo;
  if (m.seg === seg && seg && m.cola === pendientes.length && m.enviados === enviados.length
      && Date.now() - m.cuando < 60000) return m.mapa;
  const hace10 = Date.now() - 10 * 60000;
  const recientes = pendientes.concat(enviados.filter((r) => Date.parse(r.enviado_en || "") > hace10));
  const borrados = new Set(recientes
    .filter((r) => r.tipo === "registro_borrar" && r.datos && r.datos.hoja === "cierres")
    .map((r) => String(r.datos.id)));
  const delServicio = (seg && seg.cierres) || [];
  const yaEstan = new Set(delServicio.map((c) => String(c.id)));
  const locales = recientes.filter((r) => r.tipo === "cierres" && !yaEstan.has(String(r.id)))
    .map((r) => ({ id: String(r.id), fecha: r.datos.fecha, cultivo: r.datos.cultivo,
                   generacion: Number(r.datos.generacion) || 1, motivo: r.datos.motivo || "",
                   kg: Number(r.datos.kg) || 0, observaciones: r.datos.observaciones || "",
                   perdida: r.datos.perdida || "" }));
  const mapa = new Map();
  delServicio.concat(locales).forEach((c) => {
    if (!borrados.has(String(c.id))) mapa.set(claveGen(c.cultivo, c.generacion), c);
  });
  cierresMemo = { seg, cola: pendientes.length, enviados: enviados.length, cuando: Date.now(), mapa };
  return mapa;
}

// El cierre de una generación del plan (o de {cultivo, generacion}), o null.
const cierreDe = (g) => cierresVigentes().get(claveGen(g.cultivo, g.generacion)) || null;

// ==========================================================
// LAS CUENTAS (sin pantalla; probadas en pruebas.html)
// ==========================================================

/* Los kilos de un cultivo que no dicen de qué generación son y que ningún
   cierre reclamó todavía. Un cierre dice cuánto dio su generación en total:
   lo que supere a lo que esa generación ya tenía asignado salió de acá. */
function kgSinAsignar(cultivo, seg, cierres) {
  const k = claveArea(cultivo);
  const total = Number(((seg && seg.kg_sin_asignar) || {})[k]) || 0;
  let usados = 0;
  cierres.forEach((c) => {
    if (claveArea(c.cultivo) !== k) return;
    const suyos = Number(((seg && seg.kg_generacion) || {})[`${k}|${c.generacion}`]) || 0;
    usados += Math.max(0, (Number(c.kg) || 0) - suyos);
  });
  return Math.max(0, Math.round((total - usados) * 100) / 100);
}

// Los kilos que ya dicen ser de esa generación.
const kgAsignados = (cultivo, generacion, seg) =>
  Number(((seg && seg.kg_generacion) || {})[`${claveArea(cultivo)}|${Number(generacion) || 1}`]) || 0;

const NO_GERMINO = "No germinó o falló el almácigo";

/* Dónde se perdió una generación terminada (20/11): no es lo mismo perder
   una bandeja que un bancal a punto de cosechar. */
const ETAPAS_PERDIDA = {
  completa: "cosecha completa",
  siembra: "se perdió en la siembra",
  campo: "se perdió en el campo, antes de cosechar",
  cosecha: "se perdió en cosecha",
};

/* Rinde logrado: de las generaciones terminadas, los kilos que dieron contra
   los que se esperaban de sus bancales (ventanasDeCosecha: bancales × m² ×
   rinde). Una fila por generación terminada, con los días que faltaban para
   el fin de cosecha previsto si no fue una cosecha completa. Las que no
   tienen kilos esperados (sin rinde cargado) se listan pero no entran en el
   porcentaje.

   Dos porcentajes (20/11):
   - pctPlan: contra todo lo esperado. Una bandeja que no germinó pesa lo
     mismo que un bancal que se perdió antes de cosechar.
   - pct (el del reloj): PONDERADO por los días de bancal que la generación
     alcanzó a usar. Lo que se perdió en la bandeja no ocupó bancal y no pesa
     acá (va a «Siembras logradas»); lo que se perdió a mitad de ciclo pesa
     la mitad. Una cosecha completa pesa entera aunque haya terminado antes:
     si no, el Hakusai cosechado a los 43 de 105 días daba 229 %.
   El día de la pérdida es «Se perdió» si se cargó; si no, la fecha del
   cierre. */
function rindeLogrado(ventanas, cierres) {
  const filas = [];
  cierres.forEach((c) => {
    const suyas = ventanas.filter((v) => claveGen(v.cultivo, v.generacion) === claveGen(c.cultivo, c.generacion));
    const esperado = suyas.reduce((a, v) => a + v.kg, 0);
    const bancales = suyas.reduce((a, v) => a + v.camas, 0);
    const hasta = suyas.map((v) => v.hasta).sort().pop() || "";
    const kg = Number(c.kg) || 0;
    const completa = c.motivo === COSECHA_COMPLETA;
    const seFue = (c.perdida && c.perdida <= c.fecha) ? c.perdida : c.fecha;
    const faltaban = hasta && !completa ? diasEntre(seFue, hasta) : 0;
    // Los días de bancal: desde que llegó al campo hasta que se perdió.
    const enCampo = suyas.map((v) => v.enCampo).filter(Boolean).sort()[0] || "";
    const ciclo = Math.max(0, ...suyas.map((v) => Number(v.ciclo) || 0));
    const aCosecha = Math.max(0, ...suyas.map((v) => (Number(v.ciclo) || 0) - (Number(v.dias) || 0)));
    const usados = enCampo ? Math.max(0, diasEntre(enCampo, seFue)) : 0;
    const peso = completa ? 1 : !enCampo ? 0 : ciclo ? Math.min(1, usados / ciclo) : 1;
    const etapa = completa ? "completa"
      : (!enCampo || c.motivo === NO_GERMINO) ? "siembra"
      : usados < aCosecha ? "campo" : "cosecha";
    filas.push({ id: c.id, cultivo: c.cultivo, generacion: c.generacion, motivo: c.motivo, fecha: c.fecha,
                 seFue, kg, esperado, bancales, pct: esperado ? (kg / esperado) * 100 : null,
                 faltaban: faltaban > 0 ? faltaban : 0, perdida: kg === 0,
                 etapa, usados, ciclo, peso, ponderado: esperado * peso });
  });
  filas.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const conPlan = filas.filter((f) => f.esperado > 0);
  const esperadoPlan = conPlan.reduce((a, f) => a + f.esperado, 0);
  const esperado = conPlan.reduce((a, f) => a + f.ponderado, 0);
  const kg = conPlan.reduce((a, f) => a + f.kg, 0);
  const motivos = {};
  filas.filter((f) => f.motivo !== COSECHA_COMPLETA).forEach((f) => {
    const m = motivos[f.motivo] || (motivos[f.motivo] = { motivo: f.motivo, generaciones: 0, faltaron: 0 });
    m.generaciones++;
    m.faltaron += Math.max(0, f.esperado - f.kg);
  });
  return { filas, esperado, kg, pct: esperado ? (kg / esperado) * 100 : null,
           esperadoPlan, pctPlan: esperadoPlan ? (kg / esperadoPlan) * 100 : null,
           // Las que se perdieron sin llegar a usar bancal: pesan cero acá.
           sinBancal: conPlan.filter((f) => f.peso === 0).length,
           motivos: Object.values(motivos).sort((a, b) => b.faltaron - a.faltaron) };
}

/* Siembras logradas (20/11): de las generaciones sembradas, cuántas llegaron
   al campo. Mide el manejo de las siembras y los almácigos, aparte del
   rinde de los bancales.
   - Lograda: llegó al bancal (trasplantada, o sembrada directo en él).
   - Fallida: se terminó sin llegar al campo, o con «No germinó».
   - Las que siguen en bandeja no cuentan todavía: no se sabe.
   Una generación partida en bancales separados es una sola siembra. Las
   resiembras se cuentan aparte: la generación se salvó, pero la siembra
   pidió una segunda vuelta. */
function siembrasLogradas(gens, cierres, resiembras = []) {
  const juntas = new Map();
  gens.forEach((g) => {
    if (!esSembrada(g)) return;
    const t = tramosDe(g);
    if (!t) return;
    const k = claveGen(g.cultivo, g.generacion);
    const x = juntas.get(k) || { clave: k, cultivo: g.cultivo, generacion: Number(g.generacion) || 1,
                                 enCampo: "", sembrada: t.real.siembra || "" };
    if (t.real.campo && (!x.enCampo || t.real.campo < x.enCampo)) x.enCampo = t.real.campo;
    juntas.set(k, x);
  });
  const logradas = [], fallidas = [], enBandeja = [];
  juntas.forEach((x, k) => {
    const c = cierres.get(k);
    if (c && (c.motivo === NO_GERMINO || !x.enCampo)) fallidas.push({ ...x, motivo: c.motivo, fecha: c.perdida || c.fecha });
    else if (x.enCampo) logradas.push(x);
    else enBandeja.push(x);
  });
  const vistas = new Set();
  const resembradas = resiembras.filter((r) => {
    const k = claveGen(r.cultivo, r.generacion);
    if (!juntas.has(k) || vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
  const definidas = logradas.length + fallidas.length;
  return { logradas: logradas.length, fallidas, enBandeja: enBandeja.length, resembradas,
           sembradas: juntas.size, pct: definidas ? (logradas.length / definidas) * 100 : null };
}

/* Las generaciones sembradas que siguen abiertas, una por número (las partes
   de una generación partida se juntan). Con dónde están: en el campo desde
   cuándo, o todavía en bandeja. */
function generacionesAbiertas(gens, cierres) {
  const juntas = new Map();
  gens.forEach((g) => {
    if (!esSembrada(g)) return;
    const k = claveGen(g.cultivo, g.generacion);
    if (cierres.has(k)) return;
    const t = tramosDe(g);
    if (!t) return;
    const x = juntas.get(k) || { clave: k, cultivo: g.cultivo, generacion: Number(g.generacion) || 1,
                                 camas: 0, sembrada: t.real.siembra || "", enCampo: "", hasta: "" };
    x.camas += Number(g.camas) || 0;
    if (t.real.campo && (!x.enCampo || t.real.campo < x.enCampo)) x.enCampo = t.real.campo;
    if (t.fin > x.hasta) x.hasta = t.fin;
    juntas.set(k, x);
  });
  return [...juntas.values()].sort((a, b) =>
    String(a.enCampo || "9").localeCompare(String(b.enCampo || "9")) || a.cultivo.localeCompare(b.cultivo)
    || a.generacion - b.generacion);
}

/* De qué generación es una cosecha: la app lo dice sola solo cuando no hay
   duda, o sea cuando ese cultivo tiene UNA generación abierta en el campo a
   esa fecha. Con dos o más queda sin asignar y se reparte al terminarlas. */
function generacionEnCosecha(cultivo, fecha, gens, cierres) {
  const k = claveArea(cultivo);
  const enCampo = generacionesAbiertas(gens.filter((g) => claveArea(g.cultivo) === k), cierres)
    .filter((x) => x.enCampo && x.enCampo <= fecha);
  return enCampo.length === 1 ? enCampo[0].generacion : "";
}

// [1,2,3,5] -> "1 a 3, 5": doce bancales seguidos no entran en un desplegable.
function tramosDeBancales(bs) {
  const t = [];
  bs.forEach((b) => { const u = t[t.length - 1]; if (u && u[1] === b - 1) u[1] = b; else t.push([b, b]); });
  return t.map(([a, z]) => (a === z ? `${a}` : z === a + 1 ? `${a}, ${z}` : `${a} a ${z}`)).join(", ");
}

/* De qué bancales puede salir la cosecha de un cultivo (15/11): los lugares
   donde hay una generación suya abierta en el campo. Un lugar por parte de
   generación; dos generaciones en el mismo lugar (Mix G1 y G2 en Primavera
   A 12) son un solo lugar con las dos. Si el lugar tiene una sola
   generación, la cosecha queda a su nombre sin preguntar.
   Devuelve [{ clave, sector, bancales: [..], generaciones: [..], texto }]. */
function lugaresDeCosecha(cultivo, fecha, gens, cierres) {
  const k = claveArea(cultivo);
  const plantadas = plantadasDe(gens);
  const porLugar = new Map();
  gens.forEach((g) => {
    if (claveArea(g.cultivo) !== k || cierres.has(claveGen(g.cultivo, g.generacion))) return;
    // En el campo: tiene lugar plantado (verificado o registrado), o el plan
    // dice que ya fue a tierra antes de esta fecha.
    const t = tramosDe(g);
    const enCampo = plantadas.has(g.id) || (esSembrada(g) && t && t.real.campo && t.real.campo <= fecha);
    if (!enCampo) return;
    const porSector = new Map();
    lugaresDe(g, gens).forEach((l) => porSector.set(l.sector, (porSector.get(l.sector) || []).concat(l.bancal)));
    porSector.forEach((bs, sector) => {
      bs.sort((a, b) => a - b);
      const clave = `${sector}|${bs.join(",")}`;
      const x = porLugar.get(clave) || { clave, sector, bancales: bs, generaciones: [] };
      const n = Number(g.generacion) || 1;
      if (!x.generaciones.includes(n)) x.generaciones.push(n);
      porLugar.set(clave, x);
    });
  });
  return [...porLugar.values()]
    .map((x) => ({ ...x, generaciones: x.generaciones.sort((a, b) => a - b),
                   texto: `${x.sector} ${tramosDeBancales(x.bancales)} (G${x.generaciones.slice().sort((a, b) => a - b).join(", G")})` }))
    .sort((a, b) => a.sector.localeCompare(b.sector, "es") || a.bancales[0] - b.bancales[0]);
}

// ==========================================================
// LA PANTALLA: en Cosechas, «Terminar una generación»
// ==========================================================

function formularioCierre(x, d) {
  const sugerido = Math.round((d.asignados + d.sinAsignar) * 10) / 10;
  return `<form class="editar-gen" data-form-cierre="${esc(x.clave)}">
    <p class="nota">${d.esperado ? `De ${plural(x.camas, "bancal", "bancales")} se esperaban <b>${num(d.esperado)} kg</b>. ` : ""}${
      d.asignados ? `Ya tiene ${num(d.asignados, 1)} kg cosechados a su nombre. ` : ""}${
      d.sinAsignar ? `Hay <b>${num(d.sinAsignar, 1)} kg</b> de ${esc(x.cultivo)} cosechados sin decir de qué generación: poné cuántos fueron de esta.` : ""}</p>
    <label>¿Cómo terminó?</label>
    <select name="motivo">${MOTIVOS_CIERRE.map((m) => `<option>${esc(m)}</option>`).join("")}</select>
    <div class="fila">
      <div><label>Kilos que dio en total</label>
        <input type="text" name="kg" inputmode="decimal" autocomplete="off"
               value="${sugerido ? esc(String(sugerido).replace(".", ",")) : ""}" placeholder="0 si nada"></div>
      <div><label>Fecha</label><input type="date" name="fecha" value="${hoy()}" max="${hoy()}"></div>
    </div>
    ${CFG?.cierre_perdida ? `<div data-se-perdio hidden>
      <label>¿Cuándo se dio por perdida? <small>aproximado</small></label>
      <input type="date" name="perdida" max="${hoy()}"${x.enCampo || x.sembrada ? ` min="${esc(x.enCampo || x.sembrada)}"` : ""}>
      <p class="nota">Si se perdió antes de hoy. El bancal se suele limpiar después: con este día se sabe
        cuántos días de bancal alcanzó a usar. Vacío = la fecha de arriba.</p>
    </div>` : ""}
    <label>Observaciones</label>
    <input type="text" name="observaciones" placeholder="Opcional">
    <div class="calculo" data-nota-cierre data-esperado="${d.esperado || 0}" data-hasta="${esc(x.hasta)}"></div>
    <div class="editar-gen-botones">
      <button class="principal">Terminar la generación</button>
      <button type="button" class="secundario" data-cancelar-cierre>Cancelar</button>
    </div>
  </form>`;
}

function tarjetaCierres() {
  if (!CFG?.cierres) return "";
  const gens = leer(LS.generaciones, []) || [];
  if (!gens.length) return "";
  const seg = seguimiento();
  const cierres = cierresVigentes();
  const ventanas = ventanasDeCosecha(gens, CFG?.plan || []);
  const esperadoDe = (clave) => ventanas.filter((v) => claveGen(v.cultivo, v.generacion) === clave)
    .reduce((a, v) => a + v.kg, 0);
  const abiertas = generacionesAbiertas(gens, cierres);
  const rinde = rindeLogrado(ventanas, cierres);
  const TOPE = 8;

  const fila = (x) => {
    const abierta = cierreAbierto === x.clave;
    const d = { esperado: esperadoDe(x.clave), asignados: kgAsignados(x.cultivo, x.generacion, seg),
                sinAsignar: kgSinAsignar(x.cultivo, seg, cierres) };
    const pasada = x.hasta && x.hasta < hoy();
    return `<div class="registro abre-cierre${abierta ? " editando" : ""}" role="button" tabindex="0" data-cerrar="${esc(x.clave)}">
      <div><div class="detalle">${esc(x.cultivo)} <span class="gen">G${x.generacion}</span></div>
        <div class="cuando">${x.enCampo ? `en el campo desde el ${fechaCorta(x.enCampo)}` : `en bandeja desde el ${fechaCorta(x.sembrada)}`}${
          x.camas ? ` · ${plural(x.camas, "bancal", "bancales")}` : ""}${
          d.asignados ? ` · ${num(d.asignados, 1)} kg cosechados` : ""}</div></div>
      ${x.hasta ? `<span class="etiqueta ${pasada ? "espera" : "ok"}">${pasada ? "ya pasó su cosecha" : `cosecha hasta ${diaMes(x.hasta)}`}</span>` : ""}
    </div>
    ${abierta ? formularioCierre(x, d) : ""}`;
  };

  return `<details class="tarjeta desplegable" data-recordar="cierres"${estaDesplegado("cierres") || cierreAbierto ? " open" : ""}>
    <summary>
      <h2>&#127937; Terminar una generación <small>${abiertas.length} en marcha</small></h2>
      <span class="desplegable-resumen">${rinde.filas.length
        ? `<span class="etiqueta ok">${plural(rinde.filas.length, "terminada", "terminadas")}</span>` : ""}</span>
    </summary>
    <p class="nota">Cuando un bancal se terminó de cosechar, o se perdió, o hubo que levantarlo antes.
      Tocá la generación y decí cómo terminó y cuántos kilos dio: con eso se sabe cuánto rindió
      contra lo esperado, y deja de aparecer como pendiente.</p>
    ${abiertas.length ? abiertas.map(fila).join("")
      : `<p class="nota">No hay generaciones sembradas en marcha.</p>`}
    ${rinde.filas.length ? `<h3 class="subtitulo">Terminadas</h3>
      ${rinde.filas.slice(0, TOPE).map((f) => `<div class="registro">
        <div><div class="detalle">${esc(f.cultivo)} <span class="gen">G${f.generacion}</span></div>
          <div class="cuando">${fechaCorta(f.fecha)} · ${esc(f.motivo.toLowerCase())}${
            f.seFue !== f.fecha ? ` (se perdió el ${fechaCorta(f.seFue)})` : ""} · ${num(f.kg, 1)} kg${
            f.esperado ? ` de ${num(f.esperado)} esperados (${num(f.pct)}%)` : ""}</div></div>
        <button type="button" class="secundario chico" data-reabrir="${esc(f.id)}">Reabrir</button>
      </div>`).join("")}${tantosMas(rinde.filas, TOPE)}` : ""}
  </details>`;
}

/* Redibuja solo esta tarjeta. Con render() entero se perdería lo que la
   persona esté cargando en el formulario de cosecha, que está al lado. */
function redibujarCierres() {
  enMemoria(() => {
    const viva = document.querySelector('#vista [data-parte="cierres"]');
    if (!viva) { render("cosechas", true); return; }
    const t = document.createElement("template");
    t.innerHTML = parte("cierres", tarjetaCierres());
    const nueva = t.content.firstElementChild;
    viva.replaceWith(nueva);
    htmlDePartes.set("cierres", nueva.outerHTML);
    partesTocadas.delete("cierres");
    prepararCierres();
  });
}

function prepararCierres() {
  document.querySelectorAll("[data-cerrar]").forEach((fila) => {
    const abrir = () => {
      cierreAbierto = cierreAbierto === fila.dataset.cerrar ? "" : fila.dataset.cerrar;
      desplegablesAbiertos.add("cierres");
      redibujarCierres();
    };
    fila.onclick = abrir;
    fila.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); }
    };
  });
  document.querySelectorAll("[data-cancelar-cierre]").forEach((b) => {
    b.onclick = () => { cierreAbierto = ""; redibujarCierres(); };
  });

  document.querySelectorAll("[data-form-cierre]").forEach((form) => {
    // Lo que la app nota mientras se completa: cuánto rindió y si es antes
    // de lo previsto. Informa; no impide guardar.
    const nota = form.querySelector("[data-nota-cierre]");
    const esperado = Number(nota.dataset.esperado) || 0;
    const hasta = nota.dataset.hasta || "";
    const sePerdio = form.querySelector("[data-se-perdio]");
    const avisar = () => {
      // «¿Cuándo se dio por perdida?» solo si no fue una cosecha completa.
      if (sePerdio) sePerdio.hidden = form.motivo.value === COSECHA_COMPLETA;
      const kg = aNumero(form.kg.value);
      const partes = [];
      if (esperado && kg >= 0) partes.push(`rindió el <b>${num((kg / esperado) * 100)}%</b> de lo esperado`);
      const dia = (sePerdio && !sePerdio.hidden && form.perdida.value) || form.fecha.value;
      const faltaban = hasta && dia ? diasEntre(dia, hasta) : 0;
      if (faltaban > 7) {
        partes.push(form.motivo.value === COSECHA_COMPLETA
          ? `<b class="texto-alerta">el plan esperaba cosecharla hasta el ${fechaCorta(hasta)}: faltaban ${faltaban} días.</b> Si hubo que levantarla antes, elegí por qué en «¿Cómo terminó?»`
          : `se terminó ${faltaban} días antes de lo previsto`);
      } else if (esperado && kg >= 0 && kg < esperado * 0.6 && form.motivo.value === COSECHA_COMPLETA) {
        partes.push("dio bastante menos de lo esperado: si fue por algo en particular, elegilo en «¿Cómo terminó?»");
      }
      nota.innerHTML = partes.length ? partes.join(" · ") : "Poné los kilos que dio en total, 0 si no se cosechó nada.";
    };
    form.addEventListener("input", avisar);
    form.addEventListener("change", avisar);
    avisar();

    form.onsubmit = (e) => {
      e.preventDefault();
      const [, generacion] = form.dataset.formCierre.split("|");
      const x = generacionesAbiertas(leer(LS.generaciones, []) || [], cierresVigentes())
        .find((g) => g.clave === form.dataset.formCierre);
      if (!x) return;
      const kg = form.kg.value.trim() === "" ? NaN : aNumero(form.kg.value);
      if (!(kg >= 0)) return aviso("Poné los kilos que dio en total; 0 si no se cosechó nada.", true);
      if (!form.fecha.value || form.fecha.value > hoy()) return aviso("Revisá la fecha.", true);
      const perdida = sePerdio && !sePerdio.hidden ? form.perdida.value : "";
      if (perdida && perdida > form.fecha.value) {
        return aviso("El día en que se perdió no puede ser después de la fecha del cierre.", true);
      }
      guardarRegistro("cierres", {
        fecha: form.fecha.value, cultivo: x.cultivo, generacion: Number(generacion) || 1,
        motivo: form.motivo.value, kg: Math.round(kg * 100) / 100, perdida,
        observaciones: form.observaciones.value.trim(), operador: leer(LS.nombre, ""),
      }, `${x.cultivo} G${x.generacion} terminada ✓`);
      cierreAbierto = "";
      redibujarCierres();
    };
  });

  document.querySelectorAll("[data-reabrir]").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.reabrir;
      if (!confirm("¿Reabrir esta generación? Vuelve a figurar en marcha y su cierre se borra.")) return;
      // Si el cierre todavía no viajó, alcanza con sacarlo de la cola.
      if (pendientes.some((r) => r.tipo === "cierres" && String(r.id) === id)) {
        pendientes = pendientes.filter((r) => String(r.id) !== id);
        escribir(LS.pendientes, pendientes);
        refrescarEstado();
        aviso("Generación reabierta ✓");
      } else {
        guardarRegistro("registro_borrar", { hoja: "cierres", id }, "Generación reabierta ✓");
      }
      redibujarCierres();
    };
  });
}
