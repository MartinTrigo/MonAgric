// ==========================================================
// MonAgric Web — monitoreo agrícola desde el celular
//
// Los registros se guardan primero en el teléfono (funciona sin señal)
// y se envían a la planilla de Google (Apps Script) cuando hay conexión.
// El plan de la temporada se lee de temporada.json, que se genera desde
// la app de escritorio con:  python tools/exportar_temporada.py
// ==========================================================

"use strict";

const TIPOS_SIEMBRA = ["Siembra directa", "Siembra almácigo", "Trasplante", "Esqueje"];
const TIPOS_BANDEJA = [72, 98, 128, 162];
const ACTIVIDADES = ["Siembras", "Trasplantes", "Cosecha y poscosecha", "Desyuyes",
                     "Poda", "Conducción", "Aplicaciones"];
// Los tipos que nacen en bandeja: el formulario pide bandejas en vez de bancal.
const EN_BANDEJA = new Set(["Siembra almácigo", "Esqueje"]);

// ---- Almacenamiento en el teléfono ----
const LS = {
  pendientes: "monagric_pendientes",
  enviados: "monagric_enviados",
  nombre: "monagric_nombre",
  scriptUrl: "monagric_script_url",
  resumen: "monagric_resumen",
};

const leer = (k, def) => {
  try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); }
  catch { return def; }
};
const escribir = (k, v) => localStorage.setItem(k, JSON.stringify(v));

let pendientes = leer(LS.pendientes, []);
let enviados = leer(LS.enviados, []);
let resumen = leer(LS.resumen, null);   // totales de toda la chacra (desde la planilla)
let TEMP = null;                        // contenido de temporada.json
let vistaActual = "inicio";

// ---- Utilidades ----
const $ = (sel) => document.querySelector(sel);
// Fecha local: con toISOString(), después de las 21 hs de Argentina el registro
// quedaría fechado al día siguiente (la app se usa al final de la jornada).
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const ahora = () => new Date().toISOString();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const num = (n, dec = 0) => (isFinite(n) ? n : 0).toLocaleString("es-AR",
  { minimumFractionDigits: dec, maximumFractionDigits: dec });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function sumarDias(fechaISO, dias) {
  if (!fechaISO || !dias) return "";
  const d = new Date(fechaISO + "T12:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function fechaCorta(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(2)}`;
}

function aviso(msg, esError = false) {
  const el = $("#aviso");
  el.textContent = msg;
  el.classList.toggle("error", esError);
  el.classList.remove("oculto");
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => el.classList.add("oculto"), 3400);
}

const perfil = (cultivo) => (TEMP?.perfiles || {})[cultivo] || {};
const enPlan = (cultivo) => (TEMP?.plan || []).find((p) => p.cultivo === cultivo);
const integrantes = () => (TEMP?.integrantes || []).map((i) => i.nombre);
const sectores = () => TEMP?.sectores || [];

// ---- Estado de sincronización ----
function refrescarEstado() {
  const el = $("#estado-sync");
  const t = TEMP?.temporada;
  const base = t ? `Temporada ${t.nombre}` : "Sin plan de temporada";
  if (!leer(LS.scriptUrl, "")) el.textContent = `${base} · sin conectar a la planilla`;
  else if (pendientes.length) el.textContent = `${base} · ${pendientes.length} por enviar`;
  else el.textContent = `${base} · al día ✓`;
}

// ---- Envío a la planilla ----
async function sincronizar(silencioso = true) {
  const url = leer(LS.scriptUrl, "");
  if (!url) { refrescarEstado(); return; }

  if (pendientes.length && navigator.onLine) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ registros: pendientes }),
      });
      const datos = await resp.json();
      if (!datos.ok) throw new Error(datos.error || "respuesta inválida");
      enviados = pendientes.map((r) => ({ ...r, enviado_en: ahora() })).concat(enviados).slice(0, 60);
      pendientes = [];
      escribir(LS.pendientes, pendientes);
      escribir(LS.enviados, enviados);
      if (!silencioso) aviso("Registros enviados a la planilla ✓");
    } catch (e) {
      if (!silencioso) aviso("No se pudo enviar: " + e.message, true);
    }
  }
  await traerResumen();
  refrescarEstado();
  if (vistaActual === "inicio" || vistaActual === "plan") render(vistaActual);
}

// Totales de toda la chacra (lo que cargaron todos los teléfonos).
async function traerResumen() {
  const url = leer(LS.scriptUrl, "");
  if (!url || !navigator.onLine) return;
  try {
    const r = await fetch(url + "?resumen=1");
    const d = await r.json();
    if (d.ok) { resumen = d; escribir(LS.resumen, resumen); }
  } catch { /* sin conexión: se sigue mostrando el último resumen guardado */ }
}

function guardarRegistro(tipo, datos) {
  pendientes.push({
    id: uid(),
    tipo,
    datos,
    temporada: TEMP?.temporada?.nombre || "",
    creado_en: ahora(),
    dispositivo: leer(LS.nombre, ""),
  });
  escribir(LS.pendientes, pendientes);
  refrescarEstado();
  aviso("Registro guardado ✓");
  sincronizar();
}

// ---- Componentes reutilizables ----
function opcionesCultivo(seleccionado = "") {
  const delPlan = (TEMP?.plan || []).map((p) => p.cultivo);
  const otros = (TEMP?.cultivos || []).filter((c) => !delPlan.includes(c));
  const op = (c) => `<option${c === seleccionado ? " selected" : ""}>${esc(c)}</option>`;
  return `<option value="" disabled${seleccionado ? "" : " selected"}>Elegí el cultivo…</option>
    ${delPlan.length ? `<optgroup label="Del plan de la temporada">${delPlan.map(op).join("")}</optgroup>` : ""}
    ${otros.length ? `<optgroup label="Otros cultivos">${otros.map(op).join("")}</optgroup>` : ""}`;
}

function opcionesIntegrante(seleccionado = "") {
  const lista = integrantes();
  return `<option value="" disabled${seleccionado ? "" : " selected"}>Elegí…</option>
    ${lista.map((n) => `<option${n === seleccionado ? " selected" : ""}>${esc(n)}</option>`).join("")}`;
}

function camposSectorBancal(idPrefijo = "") {
  const secs = sectores();
  if (!secs.length) return "";
  const bancales = Array.from({ length: secs[0].bancales }, (_, i) => i + 1);
  return `<div class="fila">
    <div>
      <label>Sector</label>
      <select name="sector" id="${idPrefijo}sector">
        ${secs.map((s) => `<option value="${esc(s.sector)}">${esc(s.sector)} (${s.bancales} bancales)</option>`).join("")}
      </select>
    </div>
    <div>
      <label>Bancal</label>
      <select name="bancal" id="${idPrefijo}bancal">
        ${bancales.map((b) => `<option>${b}</option>`).join("")}
      </select>
    </div>
  </div>`;
}

// El nº de bancales depende del sector elegido.
function enlazarSectorBancal(form) {
  const sel = form.querySelector("select[name=sector]");
  const ban = form.querySelector("select[name=bancal]");
  if (!sel || !ban) return;
  sel.addEventListener("change", () => {
    const s = sectores().find((x) => x.sector === sel.value);
    const n = s ? s.bancales : 15;
    const previo = ban.value;
    ban.innerHTML = Array.from({ length: n }, (_, i) => `<option>${i + 1}</option>`).join("");
    if (Number(previo) <= n) ban.value = previo;
  });
}

function barra(porcentaje, clara = false) {
  const p = Math.max(0, Math.min(100, porcentaje || 0));
  return `<div class="barra${clara ? " clara" : ""}"><i style="width:${p}%"></i></div>`;
}

// ==========================================================
// VISTAS
// ==========================================================
const plantillas = {

  inicio() {
    if (!TEMP) return tarjetaSinPlan();
    const t = TEMP.temporada, ch = TEMP.chacra;
    const supPlan = TEMP.plan.reduce((a, p) => a + p.superficie_m2, 0);
    const kgPlan = TEMP.plan.reduce((a, p) => a + p.cosecha_esperada_kg, 0);
    const local = totalesLocales();
    const kgLogrado = resumen ? resumen.kg_cosechados : local.kg;
    const pct = kgPlan ? (kgLogrado / kgPlan) * 100 : 0;
    const ultimos = pendientes.concat(enviados).slice(0, 6);

    return `
    <div class="tarjeta temporada-cab">
      <h2>Temporada ${esc(t.nombre)}</h2>
      <div class="chacra">${esc(ch.nombre)} · ${esc(ch.productor)}</div>
      <div class="rango">Inicio ${fechaCorta(t.inicio)}${t.fin ? " · fin " + fechaCorta(t.fin) : ""}
        · ${TEMP.plan.length} cultivos planificados</div>
      <div class="cifras">
        <div class="cifra"><b>${num(supPlan)}</b><span>m² planificados</span></div>
        <div class="cifra"><b>${num(kgPlan)}</b><span>kg esperados</span></div>
        <div class="cifra"><b>${num(kgLogrado)}</b><span>kg cosechados</span></div>
      </div>
      ${barra(pct, true)}
      <div class="rango" style="margin-top:6px">
        ${num(pct, 1)}% de lo esperado ·
        ${resumen ? "datos de toda la chacra"
                  : "solo este teléfono (conectá la planilla en Ajustes)"}
      </div>
    </div>

    <div class="tarjeta">
      <h2>Lo cargado ${resumen ? "desde la chacra" : "<small>(solo este teléfono)</small>"}</h2>
      <div class="cifras">
        ${cifraClara(num(resumen ? resumen.siembras : local.siembras), "siembras")}
        ${cifraClara(num(resumen ? resumen.plantines : local.plantines), "plantines")}
        ${cifraClara(num(resumen ? resumen.horas : local.horas, 1), "horas de trabajo")}
      </div>
      ${pendientes.length
        ? `<button class="secundario" id="btn-enviar">Enviar ${pendientes.length} registro(s) ahora</button>`
        : ""}
    </div>

    <div class="tarjeta">
      <h2>Últimos registros de este teléfono</h2>
      ${ultimos.length
        ? ultimos.map(filaRegistro).join("")
        : `<p class="nota">Todavía no cargaste nada. Usá las pestañas de abajo.</p>`}
    </div>`;
  },

  siembras() {
    if (!TEMP) return tarjetaSinPlan();
    const yo = leer(LS.nombre, "");
    return `
    <div class="tarjeta">
      <h2>&#127793; Registrar siembra</h2>
      <form id="form-siembras">
        <label>Fecha</label>
        <input type="date" name="fecha" value="${hoy()}" required>

        <label>Cultivo</label>
        <select name="cultivo" required>${opcionesCultivo()}</select>

        <div class="fila">
          <div>
            <label>Variedad</label>
            <input type="text" name="variedad" placeholder="Ej: criolla">
          </div>
          <div>
            <label>Generación</label>
            <input type="number" name="generacion" value="1" min="1" max="99" inputmode="numeric" required>
          </div>
        </div>

        <label>Tipo</label>
        <select name="tipo" required>
          ${TIPOS_SIEMBRA.map((t) => `<option${t === "Siembra almácigo" ? " selected" : ""}>${t}</option>`).join("")}
        </select>

        <div id="bloque-bandejas">
          <div class="fila">
            <div>
              <label>Bandejas</label>
              <input type="number" name="bandejas" value="1" min="1" max="999" inputmode="numeric">
            </div>
            <div>
              <label>Alvéolos por bandeja</label>
              <select name="tipo_bandeja">
                ${TIPOS_BANDEJA.map((v) => `<option>${v}</option>`).join("")}
              </select>
            </div>
          </div>
        </div>

        <div id="bloque-lugar">${camposSectorBancal()}</div>

        <div class="calculo" id="calculo-siembra"></div>

        <label>Operador</label>
        <select name="operador" required>${opcionesIntegrante(yo)}</select>

        <label>Observaciones</label>
        <textarea name="observaciones" rows="2" placeholder="Opcional"></textarea>

        <button class="principal">Guardar siembra</button>
      </form>
    </div>
    ${historialDe("siembras")}`;
  },

  horas() {
    const yo = leer(LS.nombre, "");
    return `
    <div class="tarjeta">
      <h2>&#9201; Registrar horas de trabajo</h2>
      <form id="form-horas">
        <label>Fecha</label>
        <input type="date" name="fecha" value="${hoy()}" required>

        <label>Integrante</label>
        <select name="integrante" required>${opcionesIntegrante(yo)}</select>

        <label>Horas trabajadas</label>
        <input type="number" name="horas" min="0.25" max="24" step="0.25" inputmode="decimal"
               placeholder="Ej: 6.5" required>

        <label>Actividades</label>
        <div class="chips">
          ${ACTIVIDADES.map((a, i) => `<label class="chip">
            <input type="checkbox" name="act" value="${esc(a)}" id="act${i}"><span>${esc(a)}</span>
          </label>`).join("")}
        </div>

        <label>Detalle (opcional)</label>
        <textarea name="detalle" rows="2" placeholder="Ej: sector B, bancales 3 a 7"></textarea>

        <button class="principal">Guardar horas</button>
      </form>
    </div>
    ${historialDe("horas")}`;
  },

  cosechas() {
    const yo = leer(LS.nombre, "");
    return `
    <div class="tarjeta">
      <h2>&#127807; Registrar cosecha</h2>
      <form id="form-cosechas">
        <label>Fecha</label>
        <input type="date" name="fecha" value="${hoy()}" required>

        <label>Cultivo</label>
        <select name="cultivo" required>${opcionesCultivo()}</select>

        <label>Kilos cosechados</label>
        <input type="number" name="kg" min="0.01" step="0.01" inputmode="decimal"
               placeholder="Ej: 12.5" required>

        ${camposSectorBancal()}

        <div class="calculo" id="calculo-cosecha"></div>

        <label>Cosechó</label>
        <select name="operador">${opcionesIntegrante(yo)}</select>

        <button class="principal">Guardar cosecha</button>
      </form>
    </div>
    ${historialDe("cosechas")}`;
  },

  plan() {
    if (!TEMP) return tarjetaSinPlan();
    const ch = TEMP.chacra;
    const porCultivo = resumen?.kg_por_cultivo || kgLocalesPorCultivo();
    return `
    <div class="tarjeta">
      <h2>Plan de la temporada <small>${TEMP.plan.length} cultivos</small></h2>
      ${TEMP.plan.map((p) => {
        const logrado = porCultivo[p.cultivo] || 0;
        const pct = p.cosecha_esperada_kg ? (logrado / p.cosecha_esperada_kg) * 100 : 0;
        const bancales = ch.bancal_m2 ? p.superficie_m2 / ch.bancal_m2 : 0;
        return `<div class="plan-fila">
          <div class="plan-cab">
            <b>${esc(p.cultivo)}</b>
            <span>${num(logrado)} / ${num(p.cosecha_esperada_kg)} kg</span>
          </div>
          <div class="plan-detalle">
            ${num(p.superficie_m2)} m² (${num(bancales, 1)} bancales) ·
            ${esc(p.tipo_siembra)} · ${num(p.lineas)} líneas a ${num(p.distancia_cm)} cm ·
            ${num(p.plantas)} plantas
          </div>
          ${barra(pct)}
        </div>`;
      }).join("")}
    </div>

    <div class="tarjeta">
      <h2>Sectores de riego</h2>
      ${TEMP.sectores.map((s) => `<div class="registro">
        <div><div class="detalle">Sector ${esc(s.sector)}</div>
          <div class="cuando">${esc(s.tipo_riego)}</div></div>
        <span class="etiqueta ok">${s.bancales} bancales</span>
      </div>`).join("")}
      <p class="nota" style="margin-top:10px">
        Bancal de ${num(ch.largo_bancal_m, 1)} × ${num(ch.ancho_bancal_m, 1)} m
        (${num(ch.bancal_m2, 1)} m²) · pasillo ${num(ch.pasillo_m, 1)} m ·
        ${num(ch.n_bancales)} bancales en la chacra
      </p>
    </div>

    <div class="tarjeta">
      <h2>Integrantes</h2>
      ${TEMP.integrantes.map((i) => `<div class="registro">
        <div class="detalle">${esc(i.nombre)}</div>
        <span class="etiqueta ok">${esc(i.rol)}</span>
      </div>`).join("")}
      <p class="nota" style="margin-top:10px">
        El plan se actualiza desde la app de escritorio con
        <code>python tools/exportar_temporada.py</code>.
      </p>
    </div>`;
  },

  ajustes() {
    return `
    <div class="tarjeta">
      <h2>&#9881; Ajustes</h2>
      <label>Tu nombre (queda en cada registro que cargues)</label>
      <select id="aj-nombre">${opcionesIntegrante(leer(LS.nombre, ""))}</select>

      <label>Dirección del servicio (Apps Script)</label>
      <input type="url" id="aj-url" value="${esc(leer(LS.scriptUrl, ""))}"
             placeholder="https://script.google.com/macros/s/…/exec">

      <button class="principal" id="btn-guardar-ajustes">Guardar ajustes</button>
      <button class="secundario" id="btn-probar">Probar conexión</button>
    </div>
    <div class="tarjeta">
      <h2>Acerca de</h2>
      <p class="nota">MonAgric — monitoreo agrícola para emprendimientos agroecológicos.
      Los registros se guardan en este teléfono (funciona sin señal) y se envían a la
      planilla de la chacra cuando hay conexión.</p>
      <p class="nota" style="margin-top:8px">Plan cargado: ${TEMP
        ? `temporada ${esc(TEMP.temporada.nombre)}, generado ${fechaCorta((TEMP.generado || "").slice(0, 10))}`
        : "ninguno"}.</p>
    </div>`;
  },
};

function tarjetaSinPlan() {
  return `<div class="tarjeta">
    <h2>Falta el plan de la temporada</h2>
    <p class="nota">No se pudo leer <code>temporada.json</code>. Generalo desde la app de
    escritorio con <code>python tools/exportar_temporada.py</code> y subilo junto a la app.</p>
  </div>`;
}

const cifraClara = (valor, etq) =>
  `<div class="cifra" style="background:#E7EFE6;color:var(--sage-dark)">
     <b>${valor}</b><span style="color:var(--sage)">${etq}</span></div>`;

// Mientras no haya planilla conectada, la app muestra lo de este teléfono.
function totalesLocales() {
  const t = { siembras: 0, plantines: 0, horas: 0, kg: 0 };
  pendientes.concat(enviados).forEach((r) => {
    if (r.tipo === "siembras") { t.siembras++; t.plantines += r.datos.plantines || 0; }
    else if (r.tipo === "horas") t.horas += r.datos.horas || 0;
    else if (r.tipo === "cosechas") t.kg += r.datos.kg || 0;
  });
  return t;
}

function kgLocalesPorCultivo() {
  const mapa = {};
  pendientes.concat(enviados).forEach((r) => {
    if (r.tipo === "cosechas") mapa[r.datos.cultivo] = (mapa[r.datos.cultivo] || 0) + (r.datos.kg || 0);
  });
  return mapa;
}

function historialDe(tipo) {
  const filas = pendientes.concat(enviados).filter((r) => r.tipo === tipo).slice(0, 8);
  if (!filas.length) return "";
  return `<div class="tarjeta"><h2>Últimos registros <small>de este teléfono</small></h2>
    ${filas.map(filaRegistro).join("")}</div>`;
}

function filaRegistro(r) {
  const d = r.datos;
  const esperando = !r.enviado_en;
  let titulo, detalle;
  if (r.tipo === "horas") {
    titulo = "Horas";
    detalle = `${esc(d.integrante)}: ${d.horas} h${d.actividades ? " · " + esc(d.actividades) : ""}`;
  } else if (r.tipo === "cosechas") {
    titulo = "Cosecha";
    detalle = `${esc(d.cultivo)}: ${d.kg} kg (${esc(d.sector)}${d.bancal})`;
  } else {
    titulo = "Siembra";
    const cant = d.plantines ? `${num(d.plantines)} plantines` : `${esc(d.sector)}${d.bancal || ""}`;
    detalle = `${esc(d.cultivo)} G${d.generacion} · ${esc(d.tipo)} · ${cant}`;
  }
  return `<div class="registro">
    <div><div class="detalle">${titulo} — ${detalle}</div>
      <div class="cuando">${fechaCorta(d.fecha)}</div></div>
    <span class="etiqueta ${esperando ? "espera" : "ok"}">${esperando ? "Por enviar" : "Enviado"}</span>
  </div>`;
}

// ==========================================================
// RENDER Y FORMULARIOS
// ==========================================================
function render(vista) {
  vistaActual = vista;
  $("#vista").innerHTML = plantillas[vista]();
  window.scrollTo(0, 0);
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("activa", t.dataset.vista === vista));

  ({ siembras: prepararSiembras, horas: prepararHoras, cosechas: prepararCosechas,
     inicio: prepararInicio, ajustes: prepararAjustes }[vista] || (() => {}))();
}

function prepararInicio() {
  const b = $("#btn-enviar");
  if (b) b.onclick = () => sincronizar(false);
}

function prepararSiembras() {
  const f = $("#form-siembras");
  const bandejas = $("#bloque-bandejas");
  const lugar = $("#bloque-lugar");
  const calculo = $("#calculo-siembra");
  enlazarSectorBancal(f);

  const actualizar = () => {
    const tipo = f.tipo.value;
    const conBandeja = EN_BANDEJA.has(tipo);
    bandejas.style.display = conBandeja ? "" : "none";
    lugar.style.display = conBandeja ? "none" : "";

    const p = perfil(f.cultivo.value);
    const partes = [];
    if (conBandeja) {
      const total = (parseInt(f.bandejas.value, 10) || 0) * (parseInt(f.tipo_bandeja.value, 10) || 0);
      partes.push(`<b>${num(total)}</b> plantines`);
      if (p.dias_almacigo) partes.push(`trasplante estimado: <b>${fechaCorta(sumarDias(f.fecha.value, p.dias_almacigo))}</b>`);
      if (p.dias_a_cosecha) partes.push(`cosecha estimada: <b>${fechaCorta(sumarDias(f.fecha.value, p.dias_a_cosecha))}</b>`);
    } else {
      const dias = tipo === "Trasplante" ? p.dias_trasplante_cosecha : p.dias_a_cosecha;
      if (dias) partes.push(`cosecha estimada: <b>${fechaCorta(sumarDias(f.fecha.value, dias))}</b>`);
      const plan = enPlan(f.cultivo.value);
      if (plan) partes.push(`plan: ${num(plan.superficie_m2)} m² · ${num(plan.lineas)} líneas a ${num(plan.distancia_cm)} cm`);
    }
    calculo.innerHTML = partes.length ? partes.join(" · ") : "Elegí el cultivo para ver las fechas estimadas.";
  };

  f.addEventListener("input", actualizar);
  f.addEventListener("change", actualizar);
  actualizar();

  f.onsubmit = (e) => {
    e.preventDefault();
    const tipo = f.tipo.value;
    const conBandeja = EN_BANDEJA.has(tipo);
    const gen = parseInt(f.generacion.value, 10);
    if (!(gen >= 1)) return aviso("La generación debe ser 1 o mayor.", true);

    const datos = {
      fecha: f.fecha.value,
      cultivo: f.cultivo.value,
      variedad: f.variedad.value.trim(),
      tipo,
      generacion: gen,
      operador: f.operador.value,
      observaciones: f.observaciones.value.trim(),
      bandejas: 0, tipo_bandeja: 0, plantines: 0, sector: "", bancal: 0,
    };

    if (conBandeja) {
      datos.bandejas = parseInt(f.bandejas.value, 10) || 0;
      datos.tipo_bandeja = parseInt(f.tipo_bandeja.value, 10) || 0;
      datos.plantines = datos.bandejas * datos.tipo_bandeja;
      if (!datos.bandejas) return aviso("Indicá cuántas bandejas sembraste.", true);
    } else if (f.sector) {
      datos.sector = f.sector.value;
      datos.bancal = parseInt(f.bancal.value, 10) || 0;
    }

    const p = perfil(datos.cultivo);
    datos.trasplante_estimado = conBandeja ? sumarDias(datos.fecha, p.dias_almacigo) : "";
    datos.cosecha_estimada = sumarDias(datos.fecha,
      tipo === "Trasplante" ? p.dias_trasplante_cosecha : p.dias_a_cosecha);

    if (!leer(LS.nombre, "")) escribir(LS.nombre, datos.operador);
    guardarRegistro("siembras", datos);
    render("inicio");
  };
}

function prepararHoras() {
  const f = $("#form-horas");
  f.onsubmit = (e) => {
    e.preventDefault();
    const horas = parseFloat(f.horas.value);
    if (!(horas > 0 && horas <= 24)) return aviso("Las horas deben estar entre 0 y 24.", true);
    const marcadas = [...f.querySelectorAll("input[name=act]:checked")].map((c) => c.value);
    const detalle = f.detalle.value.trim();
    if (!leer(LS.nombre, "")) escribir(LS.nombre, f.integrante.value);
    guardarRegistro("horas", {
      fecha: f.fecha.value,
      integrante: f.integrante.value,
      horas,
      actividades: marcadas.join(", "),
      detalle,
    });
    render("inicio");
  };
}

function prepararCosechas() {
  const f = $("#form-cosechas");
  const calculo = $("#calculo-cosecha");
  enlazarSectorBancal(f);

  const actualizar = () => {
    const kg = parseFloat(f.kg.value);
    const m2 = TEMP?.chacra?.bancal_m2 || 0;
    if (!kg || !m2) { calculo.innerHTML = "Cargá los kilos para ver el rinde del bancal."; return; }
    const rinde = kg / m2;
    const ref = perfil(f.cultivo.value).rinde_ref_kg_m2 || 0;
    calculo.innerHTML = `Rinde: <b>${num(rinde, 2)} kg/m²</b> en ${num(m2, 1)} m² de bancal`
      + (ref ? ` · referencia del cultivo: ${num(ref, 1)} kg/m² (${num((rinde / ref) * 100)}%)` : "");
  };
  f.addEventListener("input", actualizar);
  f.addEventListener("change", actualizar);
  actualizar();

  f.onsubmit = (e) => {
    e.preventDefault();
    const kg = parseFloat(f.kg.value);
    if (!(kg > 0)) return aviso("Los kilos deben ser mayores a cero.", true);
    if (f.operador.value && !leer(LS.nombre, "")) escribir(LS.nombre, f.operador.value);
    guardarRegistro("cosechas", {
      fecha: f.fecha.value,
      cultivo: f.cultivo.value,
      kg,
      sector: f.sector ? f.sector.value : "",
      bancal: f.bancal ? parseInt(f.bancal.value, 10) : 0,
      operador: f.operador.value,
    });
    render("inicio");
  };
}

function prepararAjustes() {
  $("#btn-guardar-ajustes").onclick = () => {
    escribir(LS.nombre, $("#aj-nombre").value);
    const url = $("#aj-url").value.trim();
    if (url && !url.startsWith("https://script.google.com/")) {
      return aviso("La dirección debe ser la de tu Apps Script (script.google.com).", true);
    }
    escribir(LS.scriptUrl, url);
    refrescarEstado();
    aviso("Ajustes guardados ✓");
    sincronizar();
  };
  $("#btn-probar").onclick = async () => {
    const url = leer(LS.scriptUrl, "");
    if (!url) return aviso("Primero guardá la dirección del servicio.", true);
    try {
      const r = await fetch(url);
      const d = await r.json();
      aviso(d.ok ? "Conexión OK: la planilla responde ✓" : "El servicio respondió con error.", !d.ok);
    } catch {
      aviso("No se pudo conectar. Revisá la dirección y tu señal.", true);
    }
  };
}

// ==========================================================
// ARRANQUE
// ==========================================================
document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => render(t.dataset.vista)));
$("#btn-ajustes").addEventListener("click", () => render("ajustes"));
window.addEventListener("online", () => sincronizar());

(async function iniciar() {
  try {
    const r = await fetch("temporada.json", { cache: "no-cache" });
    if (r.ok) TEMP = await r.json();
  } catch { /* sin plan: la app avisa y sigue permitiendo cargar horas */ }
  render("inicio");
  refrescarEstado();
  sincronizar();
})();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
