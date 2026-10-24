// js/stock.js         — AMA Producción
//
// Stock (23/10): qué hay disponible en el campo, en la cámara, elaborado.
// Es una FOTO, no una cuenta de entradas y salidas: cada registro dice "esto
// había acá, este día", y lo vigente de un lugar es su último registro, nunca
// la suma. La app vieja de escritorio sumaba los de un rango de fechas, y lo
// relevado el lunes y el jueves contaba dos veces.
//
// Lo vigente lo calcula el servicio sobre la hoja entera (stockDe en Code.gs):
// el teléfono recibe solo las últimas filas de cada hoja. Acá se le suma
// encima lo que este teléfono cargó y la planilla todavía no devolvió.
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos.

const TIPOS_STOCK = ["En campo", "Cosechado", "Elaborado", "Fruta", "Otro"];
const FORMATOS_STOCK = ["kg", "unidad", "atado", "frasco", "caja"];
const LUGARES_STOCK = ["Cámara", "Sala de lavado", "Depósito", "Biofábrica"];
// Un relevamiento de más de dos semanas ya no dice mucho de lo que hay: se
// sigue mostrando, pero marcado.
const DIAS_STOCK_VIEJO = 14;
// Cuándo está listo, en cuatro grupos: es lo que mira comercialización.
const GRUPOS_STOCK = [
  { hasta: 0, nombre: "Listo" },
  { hasta: 7, nombre: "Esta semana" },
  { hasta: 30, nombre: "Próximas semanas" },
  { hasta: Infinity, nombre: "Más adelante" },
];

let stockFecha = "";      // la fecha que se mira; vacío = hoy
let stockDesde = "";      // desde cuándo bajar los registros; vacío = el mismo día
// Lo último cargado, para la recorrida: el formulario siguiente viene en el
// mismo sector y en el bancal de al lado.
let stockUltimo = null;

const fechaStock = () => stockFecha || hoy();
const desdeStock = () => (stockDesde && stockDesde <= fechaStock() ? stockDesde : fechaStock());
const textoPlano = (s) => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const esDeCampo = (d) => (d.tipo || "En campo") === "En campo";

// Una fila de la hoja a los nombres de la app (los de DE_LA_HOJA.stock).
function deFilaStock(f) {
  const d = datosDeFila("stock", f);
  d.id = String(f.Id || "");
  d.fecha = aFechaISO(d.fecha);
  d.disponible = aFechaISO(d.disponible) || d.fecha;
  ["cantidad", "peso_unidad", "kg", "dias"].forEach((k) => {
    d[k] = d[k] === "" || d[k] == null ? "" : Number(d[k]);
  });
  return d;
}

// El mismo lugar y el mismo cultivo: un registro nuevo reemplaza al anterior.
// Igual que claveDeStock_ en Code.gs.
const claveStock = (d) => [d.tipo || "En campo", d.sector || "", String(d.bancal || ""),
  textoPlano(d.lugar), claveArea(d.cultivo), textoPlano(d.variedad)].join("|");

// Los kilos y la fecha de disponible, a partir de lo que se escribe. Al
// cargar y al corregir, con la misma cuenta.
function calcularStock(d) {
  const cantidad = Number(d.cantidad) || 0;
  const peso = Number(d.peso_unidad) || 0;
  const porKg = (d.formato || "kg") === "kg";
  const kg = porKg ? cantidad : (peso ? cantidad * peso : "");
  const dias = Math.max(0, parseInt(d.dias, 10) || 0);
  return {
    kg: kg === "" ? "" : Math.round(kg * 100) / 100,
    dias,
    disponible: sumarDias(d.fecha, dias) || d.fecha,
  };
}

/* Lo vigente a una fecha: el último registro de cada lugar hasta ese día.
   Los que quedaron en cero se relevaron como agotados y no se muestran. En
   la lista, lo de igual fecha va en el orden en que se cargó: gana lo último.
   conAgotados: también los que quedaron en cero (la vista por semanas los
   necesita para saber qué bancales ya se relevaron). */
function stockVigente(registros, fecha, conAgotados = false) {
  const ultimo = new Map();
  registros
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.fecha && r.fecha <= fecha)
    .sort((a, b) => (a.r.fecha < b.r.fecha ? -1 : a.r.fecha > b.r.fecha ? 1 : a.i - b.i))
    .forEach(({ r }) => ultimo.set(claveStock(r), r));
  return [...ultimo.values()].filter((r) => conAgotados || Number(r.kg) > 0 || Number(r.cantidad) > 0);
}

/* Lo que se muestra a una fecha: lo del servicio, más lo de este teléfono que
   la planilla todavía no tenía cuando se pidió. Lo enviado antes de ese pedido
   ya está adentro —vigente, o reemplazado por algo posterior—, y sumarlo de
   nuevo resucitaría lo que otro teléfono marcó agotado. */
// Lo que bajó del servicio para esa fecha (y esta chacra), o null.
function stockGuardado(fecha, desde = null) {
  const g = leer(LS.stock, null);
  return g && g.chacra === chacraCodigo() && g.fecha === fecha
    && (desde === null || g.desde === desde) ? g : null;
}

function stockAl(fecha) {
  const delServicio = stockGuardado(fecha);
  const base = (delServicio?.vigente || []).map(deFilaStock);
  // Los agotados los manda el servicio desde el 24/10; uno anterior, no.
  const agotados = (delServicio?.agotados || []).map(deFilaStock);
  const conocidos = new Set(base.concat(agotados).map((r) => r.id)
    .concat((delServicio?.registros || []).map((f) => String(f.Id))));
  const leido = delServicio?.leido || "";
  const locales = pendientes.map((r) => ({ r, porEnviar: true }))
    .concat(enviados.filter((r) => !leido || (r.enviado_en || "") > leido).map((r) => ({ r, porEnviar: false })))
    .filter(({ r }) => r.tipo === "stock" && !conocidos.has(String(r.id)))
    .sort((a, b) => String(a.r.creado_en).localeCompare(String(b.r.creado_en)))
    .map(({ r, porEnviar }) => ({ ...r.datos, id: String(r.id), porEnviar }));
  return { lista: stockVigente(base.concat(locales), fecha),
           ultimos: stockVigente(agotados.concat(base, locales), fecha, true), delServicio };
}

// En qué grupo cae, mirado desde la fecha que se está viendo.
function grupoStock(d, fecha) {
  const faltan = diasEntre(fecha, d.disponible || d.fecha) || 0;
  return GRUPOS_STOCK.find((g) => faltan <= g.hasta);
}

// ---- Textos ----
const PLURALES = { unidad: "unidades", atado: "atados", frasco: "frascos", caja: "cajas" };
const enFormato = (n, formato) => `${num(n, n % 1 ? 1 : 0)} ${n === 1 ? formato : PLURALES[formato] || formato}`;

function cantidadStock(d) {
  const porKg = (d.formato || "kg") === "kg";
  const peso = Number(d.peso_unidad) || 0;
  if (porKg) {
    const u = peso ? Math.round(Number(d.cantidad) / peso) : 0;
    return `${num(Number(d.kg) || 0, 1)} kg${u ? ` (≈ ${u} de ${num(peso, 2)} kg)` : ""}`;
  }
  return `${enFormato(Number(d.cantidad) || 0, d.formato)}${peso
    ? ` de ${num(peso, 2)} kg = ${num(Number(d.kg) || 0, 1)} kg` : ""}`;
}

const dondeStock = (d) => (esDeCampo(d)
  ? (d.sector ? `${d.sector}${d.bancal ? " · bancal " + d.bancal : ""}` : "en campo")
  : [d.tipo, d.lugar].filter(Boolean).join(" · "));

function cuandoStock(d, fecha = hoy()) {
  const faltan = diasEntre(fecha, d.disponible || d.fecha) || 0;
  return faltan <= 0 ? "listo" : `en ${faltan} día${faltan === 1 ? "" : "s"} (${fechaCorta(d.disponible)})`;
}

// Kilos y unidades de varios registros juntos: "40 kg · 32 atados".
function totalStock(lista) {
  const kg = lista.reduce((a, d) => a + (Number(d.kg) || 0), 0);
  const unidades = {};
  lista.filter((d) => (d.formato || "kg") !== "kg")
    .forEach((d) => { unidades[d.formato] = (unidades[d.formato] || 0) + (Number(d.cantidad) || 0); });
  return [kg ? `${num(kg, 1)} kg` : "",
    ...Object.entries(unidades).map(([f, n]) => enFormato(n, f))].filter(Boolean).join(" · ");
}

// Los grupos (Listo, Esta semana…) y adentro, cada cultivo con sus lugares.
function stockAgrupado(lista, fecha) {
  return GRUPOS_STOCK.map((g) => {
    const delGrupo = lista.filter((d) => grupoStock(d, fecha) === g);
    const porCultivo = new Map();
    delGrupo.forEach((d) => {
      const k = claveArea(d.cultivo);
      if (!porCultivo.has(k)) porCultivo.set(k, { cultivo: d.cultivo, lugares: [] });
      porCultivo.get(k).lugares.push(d);
    });
    const cultivos = [...porCultivo.values()].sort((a, b) => a.cultivo.localeCompare(b.cultivo));
    return { ...g, cultivos, lista: delGrupo };
  }).filter((g) => g.lista.length);
}

// ---- Lo que el plan dice que hay en un bancal ----
// Las generaciones ubicadas en ese bancal que lo ocupan en esa fecha. Primero
// las ya sembradas: son las que de verdad están en el campo.
function cultivosEnBancal(sector, bancal, fecha) {
  if (!sector || !bancal) return [];
  return (leer(LS.generaciones, []) || [])
    .filter((g) => g.sector === sector && bancalesDe(g).includes(Number(bancal)))
    .filter((g) => { const o = ocupacionDe(g); return o && o.desde <= fecha && fecha <= o.hasta; })
    .sort((a, b) => Number(!!b.sembrada) - Number(!!a.sembrada));
}

// ---- Pantalla ----
function tarjetaFormStock() {
  const yo = leer(LS.nombre, "");
  const u = stockUltimo || {};
  const secs = sectores();
  const tipo = u.tipo || "En campo";
  const sector = secs.some((s) => s.sector === u.sector) ? u.sector : secs[0]?.sector || "";
  const nBancales = (secs.find((s) => s.sector === sector) || {}).bancales || 0;
  // La recorrida va de un bancal al siguiente.
  const bancal = u.bancal ? Math.min(Number(u.bancal) + 1, nBancales) : 1;
  const { lista, delPlan } = cultivosOrdenados();
  return `<div class="tarjeta" id="tarjeta-form-stock">
    <h2>&#128230; Registrar stock</h2>
    <p class="nota">Lo que hay hoy en un lugar. Un registro nuevo del mismo cultivo
      en el mismo lugar <b>reemplaza</b> al anterior, no se suma. Con 0 queda
      marcado que no hay más.</p>
    <form id="form-stock">
      <div class="fila">
        <div>
          <label>Fecha</label>
          <input type="date" name="fecha" value="${esc(u.fecha || hoy())}" required>
        </div>
        <div>
          <label>¿Qué es?</label>
          <select name="tipo">${TIPOS_STOCK.map((t) =>
            `<option${t === tipo ? " selected" : ""}>${t}</option>`).join("")}</select>
        </div>
      </div>

      <!-- El hidden va en una caja sin clase: el display de .fila le gana. -->
      <div id="stock-en-campo"${tipo === "En campo" ? "" : " hidden"}><div class="fila">
        <div>
          <label>Sector</label>
          <select name="sector">${secs.map((s) => `<option value="${esc(s.sector)}"${
            s.sector === sector ? " selected" : ""}>${esc(s.sector)} (${s.bancales})</option>`).join("")}</select>
        </div>
        <div>
          <label>Bancal</label>
          <select name="bancal">${opcionesBancal(sector, bancal)}</select>
        </div>
      </div></div>
      <div id="stock-en-lugar"${tipo === "En campo" ? " hidden" : ""}>
        <label>¿Dónde está?</label>
        <input type="text" name="lugar" list="lugares-stock" maxlength="40" autocomplete="off"
               value="${esc(u.lugar || "")}" placeholder="Ej: Cámara">
        <datalist id="lugares-stock">${LUGARES_STOCK.map((l) => `<option value="${esc(l)}">`).join("")}</datalist>
      </div>

      <label id="rotulo-cultivo-stock">${tipo === "En campo" ? "¿Qué cultivo?" : "¿Qué producto?"}</label>
      ${buscador("cultivo", lista, { placeholder: "Elegí de la lista o escribí uno nuevo…",
                                    destacadas: delPlan, libre: true })}
      <div class="nota" id="sugerencia-stock"></div>

      <div class="fila">
        <div>
          <label>Variedad <small>(opcional)</small></label>
          <input type="text" name="variedad" maxlength="40" autocomplete="off">
        </div>
        <div>
          <label>Se vende por</label>
          <select name="formato">${FORMATOS_STOCK.map((f) => `<option>${f}</option>`).join("")}</select>
        </div>
      </div>

      <div class="fila">
        <div>
          <label id="rotulo-cantidad-stock">Kg disponibles</label>
          <input type="text" name="cantidad" inputmode="decimal" autocomplete="off" placeholder="Ej: 40" required>
        </div>
        <div>
          <label id="rotulo-peso-stock">Peso por unidad <small>(kg, opcional)</small></label>
          <input type="text" name="peso_unidad" inputmode="decimal" autocomplete="off" placeholder="Ej: 1,2">
        </div>
      </div>

      <label id="rotulo-dias-stock">Días a cosecha</label>
      <input type="text" name="dias" inputmode="numeric" autocomplete="off" value="0">
      <p class="nota">0 = ya está listo · 7 = la semana que viene · 30 = falta un mes.</p>

      <div class="calculo" id="calculo-stock"></div>

      <label>Observaciones <small>(opcional)</small></label>
      <textarea name="observaciones" rows="2" placeholder="Ej: se está espigando, hay que sacarlo ya"></textarea>

      <label>Relevó</label>
      <select name="operador" data-parte="op-operador" data-parte-modo="opciones">${opcionesIntegrante(u.operador || yo)}</select>

      <button class="principal">Guardar stock</button>
    </form>
  </div>`;
}

// ---- Por semana (24/10) ----
// Semanas de calendario, de lunes a domingo: es como se arma la oferta. Cada
// cultivo es un renglón con barras, como el plan: llenas las relevadas en el
// campo, punteadas lo que el plan dice que entra en cosecha y nadie relevó
// todavía. Las dos cosas nunca se suman.
const SEMANAS_STOCK = 8;
let modoStock = "semanas";       // "semanas" o "lugares"

function lunesDe(iso) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDe(d);
}
// En qué semana cae una fecha, contando desde la de lunes0 (la 0).
const semanaDe = (iso, lunes0) => Math.floor(diasEntre(lunes0, iso) / 7);

function semanasStock(fecha, n = SEMANAS_STOCK) {
  const lunes0 = lunesDe(fecha);
  return Array.from({ length: n }, (_, i) => {
    const desde = sumarDias(lunes0, 7 * i) || lunes0;
    const hasta = sumarDias(desde, 6);
    const nombre = i === 0 ? "Esta semana" : i === 1 ? "Semana que viene" : `Semana del ${diaMes(desde)}`;
    // "Semana del 2/11" ya dice cuándo: el rango solo va en las dos primeras.
    return { i, desde, hasta, nombre, rango: i < 2 ? `${diaMes(desde)}–${diaMes(hasta)}` : "" };
  });
}

// Hasta cuándo se puede cosechar, según el catálogo. Lo que ya está en la
// cámara o elaborado sigue disponible hasta que alguien lo marque agotado.
const DIAS_COSECHA_SIN_DATO = 14;
function hastaCuandoStock(d) {
  if (!esDeCampo(d) && d.tipo !== "Fruta") return null;
  const p = perfil(d.cultivo) || {};
  const dura = Number(p.dias_en_cosecha_max || p.dias_en_cosecha) || DIAS_COSECHA_SIN_DATO;
  return sumarDias(d.disponible || d.fecha, dura);
}

// Las barras de lo relevado. Del mismo cultivo, lo que empieza y termina las
// mismas semanas va en una sola barra (los bancales juntos); lo demás, aparte.
function barrasRelevadas(lista, fecha, n = SEMANAS_STOCK) {
  const lunes0 = lunesDe(fecha);
  const grupos = new Map();
  lista.forEach((d) => {
    const desde = Math.max(0, semanaDe(d.disponible || d.fecha, lunes0));
    if (desde >= n) return;
    const fin = hastaCuandoStock(d);
    // Si ya pasó su tiempo de cosecha y nadie lo marcó agotado, sigue
    // estando: se muestra al menos esta semana.
    const hasta = fin === null ? n - 1 : Math.min(n - 1, Math.max(desde, semanaDe(fin, lunes0)));
    const k = `${claveArea(d.cultivo)}|${desde}|${hasta}`;
    if (!grupos.has(k)) grupos.set(k, { tipo: "relevado", cultivo: d.cultivo, desde, hasta, regs: [] });
    grupos.get(k).regs.push(d);
  });
  return [...grupos.values()];
}

// ¿Esa generación ya se relevó? Un registro del mismo cultivo en uno de sus
// bancales, hecho después de que fue al campo (uno anterior es de otra
// generación). Cuenta también lo marcado agotado: ya se miró y no hay.
function generacionRelevada(g, ultimos, campo) {
  const k = claveArea(g.cultivo);
  const bancales = bancalesDe(g);
  return ultimos.some((d) => claveArea(d.cultivo) === k && esDeCampo(d)
    && (!campo || d.fecha >= campo)
    && (!g.sector || !bancales.length || (d.sector === g.sector && bancales.includes(Number(d.bancal)))));
}

// Las barras punteadas: las generaciones del plan que entran en cosecha en
// estas semanas y nadie relevó. Los kg son una estimación: bancales × m² del
// bancal × rinde del plan (o el de referencia del catálogo).
function barrasDelPlan(ultimos, fecha, n = SEMANAS_STOCK) {
  const lunes0 = lunesDe(fecha);
  const finVentana = sumarDias(lunes0, 7 * n - 1);
  return (leer(LS.generaciones, []) || []).flatMap((g) => {
    const t = tramosDe(g);
    if (!t || !t.inicioCosecha || t.fin < fecha || t.inicioCosecha > finVentana) return [];
    if (generacionRelevada(g, ultimos, t.campo)) return [];
    const rinde = Number(enPlan(g.cultivo)?.rinde_kg_m2) || Number(perfil(g.cultivo)?.rinde_ref_kg_m2) || 0;
    const kg = Math.round((Number(g.camas) || 0) * bancalM2(g.sector) * rinde);
    return [{ tipo: "plan", cultivo: g.cultivo, gen: g, kg,
              desde: Math.max(0, semanaDe(t.inicioCosecha, lunes0)),
              hasta: Math.min(n - 1, semanaDe(t.fin, lunes0)) }];
  });
}

// Las barras de un cultivo en renglones que no se pisen: cada barra va en el
// primero donde entra.
function enCarriles(barras) {
  const carriles = [];
  barras.slice()
    .sort((a, b) => a.desde - b.desde || (a.tipo === "plan") - (b.tipo === "plan"))
    .forEach((b) => {
      let c = carriles.find((x) => x.every((o) => o.hasta < b.desde || o.desde > b.hasta));
      if (!c) { c = []; carriles.push(c); }
      c.push(b);
    });
  return carriles;
}

const lugaresCortos = (regs) => [...new Set(regs.map((d) => (esDeCampo(d)
  ? `${d.sector}${d.bancal ? " " + d.bancal : ""}` : d.lugar)))].filter(Boolean).join(", ");
const textoBarra = (b) => (b.tipo === "plan"
  ? `plan G${b.gen.generacion || 1}${b.kg ? " · ~" + num(b.kg) + " kg" : ""}`
  : `${totalStock(b.regs)}${lugaresCortos(b.regs) ? " · " + lugaresCortos(b.regs) : ""}`);

function graficoSemanas(barras, semanas) {
  const porCultivo = new Map();
  barras.forEach((b) => {
    const k = claveArea(b.cultivo);
    if (!porCultivo.has(k)) porCultivo.set(k, { cultivo: b.cultivo, barras: [] });
    porCultivo.get(k).barras.push(b);
  });
  // Primero lo que está antes; entre iguales, por nombre.
  const cultivos = [...porCultivo.values()].sort((a, b) =>
    Math.min(...a.barras.map((x) => x.desde)) - Math.min(...b.barras.map((x) => x.desde))
    || a.cultivo.localeCompare(b.cultivo));
  let fila = 2;
  const celdas = [];
  cultivos.forEach((c) => {
    const carriles = enCarriles(c.barras);
    celdas.push(`<div class="stock-sem-cultivo" style="grid-row:${fila} / span ${carriles.length}">${esc(c.cultivo)}</div>`);
    carriles.forEach((carril, i) => carril.forEach((b) => {
      const color = colorEtapa(b.cultivo, b.tipo === "plan" ? "campo" : "cosecha");
      celdas.push(`<div class="stock-barra${b.tipo === "plan" ? " plan" : ""}"
        style="grid-row:${fila + i};grid-column:${b.desde + 2} / ${b.hasta + 3};${
          b.tipo === "plan" ? `border-color:${color}` : `background:${color}`}"
        title="${esc(`${b.cultivo}: ${textoBarra(b)}`)}">${esc(textoBarra(b))}</div>`);
    }));
    fila += carriles.length;
  });
  return `<div class="plan-scroll stock-sem-scroll">
    <div class="stock-semanas" style="grid-template-columns:6.5rem repeat(${semanas.length}, minmax(4.6rem, 1fr))">
      <div class="stock-sem-cab"></div>
      ${semanas.map((s) => `<div class="stock-sem-cab${s.i === 0 ? " hoy" : ""}">${
        s.i === 0 ? "esta sem." : s.i === 1 ? "la próxima" : "sem."}<small>${diaMes(s.desde)}</small></div>`).join("")}
      ${semanas.map((s) => `<div class="stock-sem-col${s.i === 0 ? " hoy" : ""}"
        style="grid-column:${s.i + 2};grid-row:2 / ${fila}"></div>`).join("")}
      ${celdas.join("")}
    </div>
  </div>`;
}

/* Debajo del gráfico, semana por semana. Esta semana: todo lo que hay, con
   sus kilos. Las siguientes: solo lo que ENTRA esa semana con sus kilos, y lo
   que sigue de antes nombrado sin kilos. Repetir "Acelga 38 kg" en las ocho
   semanas que dura su cosecha se leía como 38 kg por semana, y los totales
   sumaban lo mismo una y otra vez. Lo del plan va aparte y con "~": es una
   estimación. */
function listaSemanas(barras, semanas) {
  const renglon = (nombre, cuanto, esPlan) => `<div class="stock-sem-item${esPlan ? " plan" : ""}">
    <span>${esc(nombre)}</span><span>${esc(cuanto)}</span></div>`;
  const porCultivo = (lista) => {
    const m = new Map();
    lista.forEach((b) => {
      const k = claveArea(b.cultivo);
      m.set(k, { cultivo: b.cultivo, regs: (m.get(k)?.regs || []).concat(b.regs) });
    });
    return [...m.values()].sort((a, b) => a.cultivo.localeCompare(b.cultivo));
  };
  return semanas.map((s) => {
    const deEsta = barras.filter((b) => b.desde <= s.i && s.i <= b.hasta);
    const rel = deEsta.filter((b) => b.tipo === "relevado");
    const entran = s.i === 0 ? rel : rel.filter((b) => b.desde === s.i);
    const siguen = porCultivo(rel.filter((b) => !entran.includes(b)))
      .filter((c) => !entran.some((b) => claveArea(b.cultivo) === claveArea(c.cultivo)));
    const plan = deEsta.filter((b) => b.tipo === "plan" && (s.i === 0 || b.desde === s.i));
    if (!entran.length && !plan.length) return "";
    const kgRel = entran.flatMap((b) => b.regs).reduce((a, d) => a + (Number(d.kg) || 0), 0);
    const kgPlan = plan.reduce((a, b) => a + b.kg, 0);
    return `<div class="stock-sem-bloque">
      <h3 class="sub">${s.nombre} <small>${[s.rango,
        kgRel ? `${num(kgRel, 1)} kg ${s.i === 0 ? "relevados" : "entran"}` : "",
        kgPlan ? `~${num(kgPlan)} kg del plan` : ""].filter(Boolean).join(" · ")}</small></h3>
      ${porCultivo(entran).map((c) => renglon(c.cultivo, totalStock(c.regs), false)).join("")}
      ${plan.sort((a, b) => a.cultivo.localeCompare(b.cultivo))
        .map((b) => renglon(`${b.cultivo} G${b.gen.generacion || 1}`, b.kg ? `~${num(b.kg)} kg · plan` : "plan", true)).join("")}
      ${siguen.length ? `<p class="nota">Sigue de antes: ${esc(siguen.map((c) => c.cultivo).join(", "))}.</p>` : ""}
    </div>`;
  }).join("");
}

function cuerpoSemanas(lista, ultimos, fecha) {
  const semanas = semanasStock(fecha);
  const barras = barrasRelevadas(lista, fecha).concat(barrasDelPlan(ultimos, fecha));
  const despues = lista.filter((d) => semanaDe(d.disponible || d.fecha, lunesDe(fecha)) >= SEMANAS_STOCK);
  if (!barras.length && !despues.length) {
    return `<p class="nota">No hay nada relevado ni planificado para cosechar en las próximas ${SEMANAS_STOCK} semanas.</p>`;
  }
  return `${barras.length ? graficoSemanas(barras, semanas) : ""}
    <div class="stock-sem-leyenda">
      <span><i class="stock-muestra"></i>relevado en el campo</span>
      <span><i class="stock-muestra plan"></i>lo que dice el plan, sin relevar</span>
    </div>
    ${listaSemanas(barras, semanas)}
    ${despues.length ? `<p class="nota">Más adelante: ${esc([...new Set(despues.map((d) => d.cultivo))].join(", "))}.</p>` : ""}
    <p class="nota">Cada barra dura lo que dura la cosecha de ese cultivo según el catálogo,
      con la cantidad que se anotó: no son esos kilos cada semana. Para marcar algo
      agotado, en «Por lugar».</p>`;
}

function tarjetaDisponible() {
  const fecha = fechaStock();
  const { lista, ultimos, delServicio } = stockAl(fecha);
  const grupos = stockAgrupado(lista, fecha);
  const porSemana = modoStock === "semanas";
  const esHoy = fecha === hoy();
  const kgListo = (grupos.find((g) => g.hasta === 0)?.lista || []).reduce((a, d) => a + (Number(d.kg) || 0), 0);
  const kgMes = grupos.filter((g) => g.hasta <= 30).flatMap((g) => g.lista)
    .reduce((a, d) => a + (Number(d.kg) || 0), 0);
  const cultivos = new Set(lista.map((d) => claveArea(d.cultivo))).size;

  const linea = (d) => {
    const hace = diasEntre(d.fecha, fecha) || 0;
    return `<div class="registro">
      <div><div class="detalle">${esc(dondeStock(d))} — ${esc(cantidadStock(d))}</div>
        <div class="cuando">${[d.variedad ? esc(d.variedad) : "", esc(cuandoStock(d, fecha)),
          `relevado ${fechaCorta(d.fecha)}${d.operador ? " por " + esc(d.operador) : ""}`,
          d.observaciones ? esc(d.observaciones) : ""].filter(Boolean).join(" · ")}</div></div>
      ${d.porEnviar ? `<span class="etiqueta espera">Por enviar</span>`
        : hace > DIAS_STOCK_VIEJO ? `<span class="etiqueta espera" title="Conviene relevarlo de nuevo">hace ${hace} días</span>` : ""}
      ${esHoy ? `<button type="button" class="stock-agotado" data-stock-agotado="${esc(d.id)}"
          title="Ya no hay: queda en cero">Agotado</button>` : ""}
    </div>`;
  };

  const cuerpo = porSemana ? cuerpoSemanas(lista, ultimos, fecha) : grupos.length ? grupos.map((g) => `
    <h3 class="sub">${g.nombre} <small>${esc(totalStock(g.lista))}</small></h3>
    ${g.cultivos.map((c) => {
      const clave = `stock:${g.nombre}:${claveArea(c.cultivo)}`;
      return `<details class="gen-cultivo" data-recordar="${esc(clave)}"${estaDesplegado(clave) ? " open" : ""}>
        <summary>${esc(c.cultivo)} <span>${esc(totalStock(c.lugares))}${
          c.lugares.length > 1 ? ` · ${c.lugares.length} lugares` : ""}</span></summary>
        ${c.lugares.map(linea).join("")}
      </details>`;
    }).join("")}`).join("")
    : `<p class="nota">No hay stock relevado ${esHoy ? "todavía" : "a esa fecha"}.</p>`;

  return `<div class="tarjeta" id="tarjeta-disponible">
    <h2>Disponible <small>${esHoy ? "hoy" : "al " + fechaCorta(fecha)}</small></h2>
    <div class="pestanas-tareas">
      <button type="button" class="pestana${porSemana ? " activa" : ""}" data-modo-stock="semanas">Por semana</button>
      <button type="button" class="pestana${porSemana ? "" : " activa"}" data-modo-stock="lugares">Por lugar</button>
    </div>
    ${!delServicio && navigator.onLine === false ? `<p class="nota alerta">Sin señal: se ve lo último
      que bajó este teléfono y lo que cargó acá.</p>` : ""}
    ${lista.length ? `<div class="cifras">
      <div class="cifra"><b>${num(kgListo)}</b><span>kg listos</span></div>
      <div class="cifra"><b>${num(kgMes)}</b><span>kg en 30 días</span></div>
      <div class="cifra"><b>${cultivos}</b><span>cultivos</span></div>
    </div>` : ""}
    ${cuerpo}
    ${!porSemana && esHoy && lista.length ? `<p class="nota"><b>Agotado</b> lo deja en cero: ya no queda (por
      ejemplo, porque se cosechó todo).</p>` : ""}
  </div>`;
}

// Lo de afuera de las partes: la fecha y los botones no se redibujan cuando
// llegan datos.
function tarjetaResumenStock() {
  return `<div class="tarjeta" id="tarjeta-resumen-stock">
    <h2>Resumen y descargas</h2>
    <div class="fila">
      <div>
        <label>Ver el stock al</label>
        <input type="date" id="stock-fecha" value="${esc(fechaStock())}" max="${hoy()}">
      </div>
      <div>
        <label>Registros desde</label>
        <input type="date" id="stock-desde" value="${esc(desdeStock())}" max="${hoy()}">
      </div>
    </div>
    ${parte("stock-periodo", periodoStock())}
    <div class="fila">
      <div><button type="button" class="secundario" data-stock-descargar="lista">Descargar lista</button></div>
      <div><button type="button" class="secundario" data-stock-descargar="registros">Descargar registros</button></div>
    </div>
    <button type="button" class="secundario" id="btn-stock-compartir">Compartir (WhatsApp…)</button>
    <p class="nota">La <b>lista</b> es lo disponible a esa fecha. Los <b>registros</b> son cada
      relevamiento cargado en el período. Se abren con Excel o con la planilla de Google.</p>
  </div>`;
}

function periodoStock() {
  const g = stockGuardado(fechaStock(), desdeStock());
  if (!g) {
    return `<p class="nota">${navigator.onLine ? "Pidiendo los registros…" : "Sin señal: los registros del período se piden al servicio."}</p>`;
  }
  const regs = (g.registros || []).map(deFilaStock);
  const kg = regs.reduce((a, d) => a + (Number(d.kg) || 0), 0);
  const dias = new Set(regs.map((d) => d.fecha)).size;
  const periodo = g.desde === g.fecha ? `El ${fechaCorta(g.fecha)}` : `Del ${fechaCorta(g.desde)} al ${fechaCorta(g.fecha)}`;
  return `<p class="nota">${periodo}: <b>${regs.length}</b> registro(s)${
    regs.length ? ` en ${dias} día(s), ${num(kg, 1)} kg relevados` : ""}.</p>`;
}

// ---- Descargar y compartir ----
// CSV con punto y coma y coma decimal, que es lo que Excel en castellano abre
// directo en columnas. La marca del principio (BOM) hace que lea bien las tildes.
function descargarCSV(nombre, encabezados, filas) {
  const celda = (v) => {
    const t = typeof v === "number" ? String(v).replace(".", ",") : String(v ?? "");
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const texto = "﻿" + [encabezados, ...filas].map((f) => f.map(celda).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const COLUMNAS_STOCK = ["Fecha", "Cultivo", "Variedad", "Tipo", "Sector", "Bancal", "Lugar",
  "Formato", "Cantidad", "Peso unidad kg", "Kg", "Disponible desde", "Observaciones", "Relevó"];
const filaCSVStock = (d) => [d.fecha, d.cultivo, d.variedad, d.tipo || "En campo", d.sector,
  d.bancal, d.lugar, d.formato || "kg", d.cantidad, d.peso_unidad, d.kg, d.disponible,
  d.observaciones, d.operador];

function descargarStock(cual) {
  const fecha = fechaStock();
  const sufijo = (chacraCodigo() || "chacra") + "_" + fecha.replace(/-/g, "");
  if (cual === "lista") {
    const lista = stockAl(fecha).lista
      .map((d) => ({ d, g: grupoStock(d, fecha) }))
      .sort((a, b) => GRUPOS_STOCK.indexOf(a.g) - GRUPOS_STOCK.indexOf(b.g)
        || a.d.cultivo.localeCompare(b.d.cultivo));
    if (!lista.length) return aviso("No hay stock disponible a esa fecha.", true);
    descargarCSV(`stock_${sufijo}.csv`, ["Cuándo", ...COLUMNAS_STOCK],
      lista.map(({ d, g }) => [g.nombre, ...filaCSVStock(d)]));
    return;
  }
  const g = stockGuardado(fecha, desdeStock());
  if (!g) {
    return aviso("Todavía no llegaron los registros de ese período. Hace falta señal.", true);
  }
  const regs = (g.registros || []).map(deFilaStock);
  if (!regs.length) return aviso("No hay registros en ese período.", true);
  descargarCSV(`stock_registros_${chacraCodigo() || "chacra"}_${g.desde.replace(/-/g, "")}_${
    g.fecha.replace(/-/g, "")}.csv`, COLUMNAS_STOCK, regs.map(filaCSVStock));
}

// El texto para mandar por WhatsApp a quien arma la venta de la semana.
// El texto para mandar por WhatsApp a quien arma la venta de la semana. Va
// por la semana en que entra cada cosa, y solo lo relevado: lo del plan es una
// estimación y no se ofrece.
function textoStock() {
  const fecha = fechaStock();
  const lista = stockAl(fecha).lista;
  if (!lista.length) return "";
  const nombre = chacraActual()?.nombre || "la chacra";
  const lunes0 = lunesDe(fecha);
  const bloques = semanasStock(fecha).map((s) => {
    const deEsta = lista.filter((d) => Math.max(0, semanaDe(d.disponible || d.fecha, lunes0)) === s.i);
    if (!deEsta.length) return "";
    const porCultivo = new Map();
    deEsta.forEach((d) => {
      const k = claveArea(d.cultivo);
      porCultivo.set(k, { cultivo: d.cultivo, regs: (porCultivo.get(k)?.regs || []).concat(d) });
    });
    return [``, `*${s.nombre.toUpperCase()}*${s.rango ? ` (${s.rango})` : ""}`,
      ...[...porCultivo.values()].sort((a, b) => a.cultivo.localeCompare(b.cultivo))
        .map((c) => `• ${c.cultivo}: ${totalStock(c.regs)}`)].join("\n");
  }).filter(Boolean);
  const despues = lista.filter((d) => semanaDe(d.disponible || d.fecha, lunes0) >= SEMANAS_STOCK);
  if (despues.length) {
    bloques.push(["", "*MÁS ADELANTE*", ...despues.map((d) => `• ${d.cultivo}: ${totalStock([d])}`)].join("\n"));
  }
  return [`Stock de ${nombre} ${fecha === hoy() ? "hoy" : "al"} ${fechaCorta(fecha)}`, ...bloques].join("\n");
}

async function compartirStock() {
  const texto = textoStock();
  if (!texto) return aviso("No hay stock disponible para compartir.", true);
  try {
    if (navigator.share) { await navigator.share({ text: texto }); return; }
  } catch (e) {
    if (e && e.name === "AbortError") return;     // se arrepintió: no es un error
  }
  try {
    await navigator.clipboard.writeText(texto);
    aviso("Copiado: pegalo en WhatsApp ✓");
  } catch {
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  }
}

// ---- Pedirle el stock al servicio ----
async function traerStock(forzar = false) {
  if (!chacraCodigo() || !tieneAcceso() || !navigator.onLine || !CFG?.stock) return;
  const fecha = fechaStock(), desde = desdeStock();
  const marca = `stock:${fecha}:${desde}`;
  if (!forzar && Date.now() - (pedidoReciente[marca] || 0) < 20000) return;
  pedidoReciente[marca] = Date.now();
  // La hora de ANTES de pedir: lo que se envíe mientras tanto puede no venir
  // en la respuesta, y tiene que seguir sumándose encima (ver stockAl).
  const leido = ahora();
  try {
    const d = await (await fetch(`${urlServicio()}?${conCredenciales(
      `stock=1&fecha=${fecha}&desde=${desde}`)}`)).json();
    if (!d.ok || !Array.isArray(d.vigente)) return;
    // Si mientras tanto se pidió otra fecha, esta respuesta ya no sirve.
    if (d.fecha !== fechaStock()) return;
    const antes = leer(LS.stock, null);
    const nuevo = { chacra: chacraCodigo(), fecha: d.fecha, desde: d.desde, vigente: d.vigente,
                    agotados: d.agotados || [], registros: d.registros || [], leido };
    const igual = antes && antes.chacra === nuevo.chacra
      && JSON.stringify([antes.fecha, antes.desde, antes.vigente, antes.agotados || [], antes.registros])
      === JSON.stringify([nuevo.fecha, nuevo.desde, nuevo.vigente, nuevo.agotados, nuevo.registros]);
    escribir(LS.stock, nuevo);
    if (!igual && vistaActual === "stock") redibujarConDatos("stock");
  } catch { /* sin señal: queda lo último que se bajó */ }
}

// ---- El formulario ----
function prepararStock() {
  prepararResumenStock();
  engancharAgotados();
  engancharModoStock();
  const f = $("#form-stock");
  if (!f) return;
  enlazarBuscadores(f);

  const calculo = $("#calculo-stock");
  const sugerencia = $("#sugerencia-stock");
  const cultivoTexto = f.querySelector('[data-buscador="cultivo"] .buscador-texto');
  let cultivoSugerido = "";       // lo que puso la app sola: se puede cambiar solo

  const leerForm = () => ({
    fecha: f.fecha.value, tipo: f.tipo.value,
    sector: f.tipo.value === "En campo" ? f.sector.value : "",
    bancal: f.tipo.value === "En campo" ? f.bancal.value : "",
    lugar: f.tipo.value === "En campo" ? "" : f.lugar.value.trim(),
    // Lo escrito y no elegido también vale (un producto nuevo): el buscador
    // lo toma recién un momento después de salir del campo.
    cultivo: f.cultivo.value.trim() || cultivoTexto.value.trim(), variedad: f.variedad.value.trim(),
    formato: f.formato.value,
    cantidad: f.cantidad.value.trim() === "" ? "" : aNumero(f.cantidad.value),
    peso_unidad: f.peso_unidad.value.trim() === "" ? "" : aNumero(f.peso_unidad.value),
    dias: f.dias.value, observaciones: f.observaciones.value.trim(), operador: f.operador.value,
  });

  const ponerCultivo = (nombre) => {
    cultivoTexto.value = nombre;
    f.cultivo.value = nombre;
    cultivoSugerido = nombre;
  };

  // Al elegir un bancal: qué tiene según el plan, y qué se relevó la última vez.
  const mirarLugar = () => {
    const d = leerForm();
    const partes = [];
    if (d.tipo === "En campo") {
      const gens = cultivosEnBancal(d.sector, d.bancal, d.fecha || hoy());
      if (gens.length) {
        partes.push(`En el plan: ${gens.map((g) => `${esc(g.cultivo)} G${g.generacion || 1}${
          g.sembrada ? "" : " (sin sembrar)"}`).join(", ")}.`);
        // Si el cultivo está vacío o lo había puesto la app, va el del plan.
        if (!f.cultivo.value || f.cultivo.value === cultivoSugerido) ponerCultivo(gens[0].cultivo);
      } else if (f.cultivo.value === cultivoSugerido && cultivoSugerido) {
        ponerCultivo("");
      }
    } else if (cultivoSugerido && f.cultivo.value === cultivoSugerido) {
      // Lo que sugirió el plan para un bancal no es lo que hay en la cámara.
      ponerCultivo("");
    }
    const lugar = leerForm();
    if (lugar.cultivo) {
      const antes = stockAl(lugar.fecha || hoy()).lista.find((x) => claveStock(x) === claveStock(lugar));
      if (antes) partes.push(`Último relevamiento: <b>${esc(cantidadStock(antes))}</b>, el ${fechaCorta(antes.fecha)}. Lo que cargues lo reemplaza.`);
    }
    sugerencia.innerHTML = partes.join(" ");
  };

  const actualizar = () => {
    const d = leerForm();
    const deCampo = d.tipo === "En campo";
    $("#stock-en-campo").hidden = !deCampo;
    $("#stock-en-lugar").hidden = deCampo;
    $("#rotulo-cultivo-stock").textContent = deCampo ? "¿Qué cultivo?" : "¿Qué producto?";
    $("#rotulo-dias-stock").textContent = deCampo ? "Días a cosecha" : "Días hasta que esté listo";
    const porKg = d.formato === "kg";
    $("#rotulo-cantidad-stock").textContent = porKg ? "Kg disponibles" : `Cantidad (${PLURALES[d.formato]})`;
    $("#rotulo-peso-stock").innerHTML = `Peso por ${porKg ? "unidad" : esc(d.formato)} <small>(kg, opcional)</small>`;

    if (d.cantidad === "" || !(d.cantidad >= 0)) {
      calculo.innerHTML = "Cargá cuánto hay. Si se vende por unidad o atado, con el peso de cada uno sale el total en kg.";
      return;
    }
    const c = calcularStock({ ...d, fecha: d.fecha || hoy() });
    const todo = { ...d, ...c };
    calculo.innerHTML = d.cantidad === 0
      ? `Queda marcado que <b>no hay más</b>${d.cultivo ? " " + esc(d.cultivo) : ""} en este lugar.`
      : `<b>${esc(cantidadStock(todo))}</b> · ${esc(cuandoStock(todo, d.fecha || hoy()))}`;
  };

  f.addEventListener("change", (e) => {
    if (["tipo", "sector", "bancal", "fecha", "lugar", "variedad"].includes(e.target.name)) mirarLugar();
    actualizar();
  });
  // Elegir un cultivo de la lista es elección de la persona: deja de ser sugerido.
  cultivoTexto.addEventListener("input", () => { cultivoSugerido = ""; });
  f.addEventListener("input", actualizar);
  mirarLugar();
  actualizar();

  f.onsubmit = (e) => {
    e.preventDefault();
    const d = leerForm();
    if (!d.fecha) return aviso("Falta la fecha.", true);
    if (!d.cultivo) return aviso(d.tipo === "En campo" ? "Elegí el cultivo." : "Escribí qué producto es.", true);
    if (d.tipo === "En campo" && !d.sector) return aviso("Elegí el sector.", true);
    if (d.tipo !== "En campo" && !d.lugar) return aviso("Escribí dónde está (cámara, depósito…).", true);
    if (d.cantidad === "" || !(d.cantidad >= 0)) return aviso("Cargá cuánto hay (0 si no queda).", true);
    if (d.peso_unidad !== "" && !(d.peso_unidad > 0)) return aviso("El peso por unidad tiene que ser un número.", true);
    const dias = String(d.dias).trim() === "" ? 0 : Number(d.dias);
    if (!Number.isInteger(dias) || dias < 0) return aviso("Los días tienen que ser un número entero (0 si está listo).", true);

    if (d.operador && !leer(LS.nombre, "")) escribir(LS.nombre, d.operador);
    const datos = { ...d, ...calcularStock({ ...d, dias }) };
    guardarRegistro("stock", datos, d.cantidad === 0
      ? `${d.cultivo}: marcado sin stock ✓` : `Stock guardado: ${d.cultivo} ✓`);
    stockUltimo = { tipo: d.tipo, sector: d.sector, bancal: d.bancal, lugar: d.lugar,
                    fecha: d.fecha, operador: d.operador };
    render("stock", true);
    const caja = $("#form-stock [data-buscador] .buscador-texto");
    if (caja && d.tipo !== "En campo") caja.focus();
  };
}

function prepararResumenStock() {
  const fecha = $("#stock-fecha"), desde = $("#stock-desde");
  if (!fecha) return;
  const cambiar = () => {
    stockFecha = fecha.value && fecha.value !== hoy() ? fecha.value : "";
    stockDesde = desde.value && desde.value !== fechaStock() ? desde.value : "";
    if (desde.value > fechaStock()) desde.value = fechaStock();
    traerStock(true);
    redibujarConDatos("stock");
  };
  fecha.onchange = cambiar;
  desde.onchange = cambiar;
  document.querySelectorAll("[data-stock-descargar]").forEach((b) => {
    b.onclick = () => descargarStock(b.dataset.stockDescargar);
  });
  const compartir = $("#btn-stock-compartir");
  if (compartir) compartir.onclick = compartirStock;
}

// "Agotado" en una línea de lo disponible: se terminó. Es un relevamiento más, con
// cantidad cero, del mismo cultivo en el mismo lugar.
function engancharModoStock() {
  document.querySelectorAll("[data-modo-stock]").forEach((b) => {
    b.onclick = () => { modoStock = b.dataset.modoStock; redibujarConDatos("stock"); };
  });
}

function engancharAgotados() {
  document.querySelectorAll("[data-stock-agotado]").forEach((b) => {
    b.onclick = () => {
      const d = stockAl(hoy()).lista.find((x) => x.id === b.dataset.stockAgotado);
      if (!d) return;
      if (!confirm(`¿Ya no hay ${d.cultivo} en ${dondeStock(d)}?`)) return;
      guardarRegistro("stock", {
        fecha: hoy(), tipo: d.tipo || "En campo", sector: d.sector || "", bancal: d.bancal || "",
        lugar: d.lugar || "", cultivo: d.cultivo, variedad: d.variedad || "", formato: d.formato || "kg",
        cantidad: 0, peso_unidad: d.peso_unidad, kg: 0, dias: 0, disponible: hoy(),
        observaciones: "Agotado", operador: leer(LS.nombre, ""),
      }, `${d.cultivo}: marcado sin stock ✓`);
      redibujarConDatos("stock");
    };
  });
}
