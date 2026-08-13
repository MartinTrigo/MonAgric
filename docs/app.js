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
// Los tipos que nacen en bandeja: el formulario pide bandejas en vez de bancal.
const EN_BANDEJA = new Set(["Siembra almácigo", "Esqueje"]);

// Las horas siguen yendo a la planilla del proyecto donde ya están cargadas
// desde julio (la que usaba la app bioma-horas), para no partir el historial.
// Ese servicio recibe un registro por vez, con sus propios nombres de campo.
const URL_HORAS_POR_DEFECTO =
  "https://script.google.com/macros/s/AKfycbyHBMsZAyLOACCgWclgHGDB6e6M8tw2VX_zonELRuFobPp3TdakCr4Wkh2b8TqtB7P2bw/exec";

const ACTIVIDADES_RESPALDO = ["Planificación", "Siembra", "Trasplante", "Manejo productivo",
                              "Cosecha y acondicionado", "Administración", "Comercialización",
                              "Comunicación", "Mantenimiento"];

// ---- Almacenamiento en el teléfono ----
const LS = {
  pendientes: "monagric_pendientes",
  enviados: "monagric_enviados",
  nombre: "monagric_nombre",
  scriptUrl: "monagric_script_url",
  urlHoras: "monagric_url_horas",
  resumen: "monagric_resumen",
  nombresPlanilla: "monagric_nombres_planilla",
  ultimasHoras: "monagric_ultimas_horas",
  tareas: "monagric_tareas",
};

const IMPORTANCIAS = ["Alta", "Media", "Baja"];

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

const urlHoras = () => leer(LS.urlHoras, "") || URL_HORAS_POR_DEFECTO;

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

// En el campo se escribe "5,5" tanto como "5.5": las dos formas valen.
const aNumero = (txt) => parseFloat(String(txt ?? "").replace(",", ".").trim());

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
const sectores = () => TEMP?.sectores || [];
const actividades = () => TEMP?.actividades || ACTIVIDADES_RESPALDO;

// La lista de integrantes sale de las dos fuentes: la planilla de horas del
// proyecto (que manda, porque es donde está el historial) y la configuración de
// la temporada, para que alguien nuevo aparezca apenas se lo carga en la app de
// escritorio, sin esperar a que lo agreguen a la planilla.
function integrantes() {
  const dePlanilla = leer(LS.nombresPlanilla, []);
  const deTemporada = (TEMP?.integrantes || []).map((i) => i.nombre);
  return [...new Set([...dePlanilla, ...deTemporada])];
}

// ---- Estado de sincronización ----
function refrescarEstado() {
  const el = $("#estado-sync");
  const t = TEMP?.temporada;
  const base = t ? `Temporada ${t.nombre}` : "Sin plan de temporada";
  if (pendientes.length) el.textContent = `${base} · ${pendientes.length} por enviar`;
  else if (!leer(LS.scriptUrl, "")) el.textContent = `${base} · falta conectar siembras y cosechas`;
  else el.textContent = `${base} · al día ✓`;
}

// ---- Envío a las planillas ----
// Las horas van a la planilla del proyecto y el resto a la de MonAgric, así que
// cada grupo se envía por su lado y lo que falle queda en la cola.
async function sincronizar(silencioso = true) {
  if (!navigator.onLine) { refrescarEstado(); return; }

  const enviadosAhora = [];
  const fallaron = [];

  const horas = pendientes.filter((r) => r.tipo === "horas");
  for (const r of horas) {
    try {
      await enviarHora(r);
      enviadosAhora.push(r);
    } catch {
      fallaron.push(r);
      break;   // si el servicio no responde, el resto espera al próximo intento
    }
  }

  const otros = pendientes.filter((r) => r.tipo !== "horas");
  const url = leer(LS.scriptUrl, "");
  if (otros.length && url) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ registros: otros }),
      });
      const datos = await resp.json();
      if (!datos.ok) throw new Error(datos.error || "respuesta inválida");
      enviadosAhora.push(...otros);
    } catch (e) {
      fallaron.push(...otros);
      if (!silencioso) aviso("No se pudo enviar: " + e.message, true);
    }
  }

  if (enviadosAhora.length) {
    const ids = new Set(enviadosAhora.map((r) => r.id));
    enviados = enviadosAhora.map((r) => ({ ...r, enviado_en: ahora() })).concat(enviados).slice(0, 60);
    pendientes = pendientes.filter((r) => !ids.has(r.id));
    escribir(LS.pendientes, pendientes);
    escribir(LS.enviados, enviados);
    if (!silencioso) aviso(`${enviadosAhora.length} registro(s) enviado(s) ✓`);
  } else if (!silencioso && fallaron.length) {
    aviso("No se pudo enviar. Revisá la señal y los Ajustes.", true);
  }

  await Promise.all([traerResumen(), traerDatosHoras(), traerTareas()]);
  refrescarEstado();
  if (["inicio", "plan", "horas", "tareas"].includes(vistaActual)) render(vistaActual);
}

// El servicio de la planilla de horas recibe un registro por vez y con sus
// propios nombres de campo (los mismos que usaba la app anterior).
async function enviarHora(r) {
  const d = r.datos;
  const resp = await fetch(urlHoras(), {
    method: "POST",
    body: JSON.stringify({
      marca: r.creado_en,
      fecha: d.fecha,
      nombre: d.integrante,
      horas: d.horas,
      actividad: d.actividad,
      obs: d.observaciones || "",
    }),
  });
  const datos = await resp.json();
  if (!datos.ok) throw new Error(datos.error || "respuesta inválida");
}

// Nombres del equipo y últimos registros, de la planilla de horas.
async function traerDatosHoras() {
  if (!navigator.onLine) return;
  try {
    const r = await fetch(urlHoras());
    const d = await r.json();
    if (Array.isArray(d.nombres) && d.nombres.length) escribir(LS.nombresPlanilla, d.nombres);
    if (Array.isArray(d.ultimas)) escribir(LS.ultimasHoras, d.ultimas);
  } catch { /* sin conexión: se usa lo último guardado */ }
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
// Buscador para listas largas: se escribe para filtrar y se toca para ver todo.
// El valor elegido queda en un campo oculto, así el formulario lo lee como
// cualquier otro campo.
function buscador(nombre, opciones, { placeholder = "Buscá o tocá para ver la lista…",
                                      valor = "", destacadas = [] } = {}) {
  return `<div class="buscador" data-buscador="${nombre}">
    <input type="text" class="buscador-texto" autocomplete="off" enterkeyhint="done"
           placeholder="${esc(placeholder)}" value="${esc(valor)}">
    <input type="hidden" name="${nombre}" value="${esc(valor)}">
    <div class="buscador-lista" hidden
         data-opciones="${esc(JSON.stringify(opciones))}"
         data-destacadas="${esc(JSON.stringify(destacadas))}"></div>
  </div>`;
}

function cultivosOrdenados() {
  const delPlan = (TEMP?.plan || []).map((p) => p.cultivo);
  const otros = (TEMP?.cultivos || []).filter((c) => !delPlan.includes(c));
  return { lista: [...delPlan, ...otros], delPlan };
}

function buscadorCultivo(valor = "") {
  const { lista, delPlan } = cultivosOrdenados();
  return buscador("cultivo", lista, {
    placeholder: "Elegí el cultivo (escribí para buscar)…",
    valor, destacadas: delPlan,
  });
}

// Enciende todos los buscadores que haya en un formulario.
function enlazarBuscadores(form) {
  form.querySelectorAll("[data-buscador]").forEach((caja) => {
    const texto = caja.querySelector(".buscador-texto");
    const oculto = caja.querySelector("input[type=hidden]");
    const lista = caja.querySelector(".buscador-lista");
    const opciones = JSON.parse(lista.dataset.opciones);
    const destacadas = new Set(JSON.parse(lista.dataset.destacadas));
    let marcada = -1;

    // Sin tildes ni mayúsculas: "morron" encuentra "Morrón". El rango ̀-ͯ
    // son las tildes que quedan sueltas al separar con NFD.
    const plano = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

    const pintar = (filtro = "") => {
      const f = plano(filtro.trim());
      const hallados = opciones.filter((o) => plano(o).includes(f));
      marcada = hallados.length ? 0 : -1;
      lista.innerHTML = hallados.length
        ? hallados.map((o, i) => `<div class="buscador-op${i === 0 ? " marcada" : ""}" data-valor="${esc(o)}">
             ${esc(o)}${destacadas.has(o) ? '<span class="del-plan">del plan</span>' : ""}
           </div>`).join("")
        : `<div class="buscador-vacio">No hay ningún cultivo con ese nombre.</div>`;
      lista.hidden = false;
    };

    const elegir = (valor) => {
      texto.value = valor;
      oculto.value = valor;
      lista.hidden = true;
      form.dispatchEvent(new Event("change", { bubbles: true }));
    };

    texto.addEventListener("focus", () => pintar(""));
    texto.addEventListener("input", () => { oculto.value = ""; pintar(texto.value); });
    texto.addEventListener("keydown", (e) => {
      const ops = [...lista.querySelectorAll(".buscador-op")];
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!ops.length) return;
        marcada = (marcada + (e.key === "ArrowDown" ? 1 : -1) + ops.length) % ops.length;
        ops.forEach((o, i) => o.classList.toggle("marcada", i === marcada));
        ops[marcada].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (ops[marcada]) elegir(ops[marcada].dataset.valor);
      } else if (e.key === "Escape") {
        lista.hidden = true;
      }
    });
    lista.addEventListener("mousedown", (e) => {
      const op = e.target.closest(".buscador-op");
      if (op) { e.preventDefault(); elegir(op.dataset.valor); }
    });
    // Al salir del campo: si lo escrito coincide con una opción, se toma.
    texto.addEventListener("blur", () => {
      setTimeout(() => {
        lista.hidden = true;
        if (!oculto.value) {
          const exacta = opciones.find((o) => plano(o) === plano(texto.value));
          if (exacta) elegir(exacta);
          else texto.value = "";
        }
      }, 150);
    });
  });
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
        ${buscadorCultivo()}

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
    const equipo = leer(LS.ultimasHoras, []);
    const pendientesHoras = pendientes.filter((r) => r.tipo === "horas");
    return `
    <div class="tarjeta">
      <h2>&#9201; Registrar horas de trabajo</h2>
      <form id="form-horas">
        <label>Fecha</label>
        <input type="date" name="fecha" value="${hoy()}" required>

        <label>¿Quién trabajó?</label>
        <select name="integrante" required>${opcionesIntegrante(yo)}</select>

        <label>Horas trabajadas</label>
        <!-- texto y no "number": con type=number el navegador descarta "5,5" y
             en el celular el teclado en español ofrece coma. -->
        <input type="text" name="horas" inputmode="decimal" autocomplete="off"
               placeholder="Ej: 4 o 2,5" required>

        <label>¿Qué actividad hiciste más?</label>
        <div class="chips">
          ${actividades().map((a, i) => `<label class="chip">
            <input type="radio" name="actividad" value="${esc(a)}" id="act${i}" required>
            <span>${esc(a)}</span>
          </label>`).join("")}
        </div>

        <label>Observaciones (opcional)</label>
        <textarea name="observaciones" rows="2" placeholder="Ej: cosecha de tomates, sector B"></textarea>

        <button class="principal">Guardar horas</button>
      </form>
    </div>

    <div class="tarjeta">
      <h2>Últimos registros del equipo <small>planilla del proyecto</small></h2>
      ${pendientesHoras.map((r) => `<div class="registro">
        <div><div class="detalle">${esc(r.datos.integrante)} — ${r.datos.horas} h</div>
          <div class="cuando">${fechaCorta(r.datos.fecha)} · ${esc(r.datos.actividad)}</div></div>
        <span class="etiqueta espera">Por enviar</span>
      </div>`).join("")}
      ${equipo.length
        ? equipo.map((f) => `<div class="registro">
            <div><div class="detalle">${esc(f.nombre)} — ${esc(String(f.horas))} h</div>
              <div class="cuando">${esc(f.fecha)} · ${esc(f.actividad)}</div></div>
          </div>`).join("")
        : (pendientesHoras.length ? "" : `<p class="nota">Cuando haya conexión se van a ver
            acá los últimos registros de todo el equipo.</p>`)}
      <a class="enlace-planilla" target="_blank" rel="noopener"
         href="https://docs.google.com/spreadsheets/d/1tx8V0VLciiTLFvAmSViAR6KV9LL9hXzvX6-qy30Ubpg/edit">
        Ver la planilla de horas completa</a>
    </div>`;
  },

  tareas() {
    const yo = leer(LS.nombre, "");
    const lista = tareasParaMostrar();
    const pendientes_ = lista.filter((t) => !t.hecha);
    const hechas = lista.filter((t) => t.hecha).slice(0, 8);
    return `
    <div class="tarjeta">
      <h2>&#9745; Tareas pendientes <small>${pendientes_.length}</small></h2>
      ${pendientes_.length
        ? pendientes_.map(filaTarea).join("")
        : `<p class="nota">No hay tareas pendientes. Agregá una acá abajo.</p>`}
    </div>

    <div class="tarjeta">
      <h2>Anotar una tarea</h2>
      <form id="form-tareas">
        <label>¿Qué hay que hacer?</label>
        <input type="text" name="tarea" maxlength="140" autocomplete="off"
               placeholder="Ej: desyuyar el sector B" required>

        <div class="fila">
          <div>
            <label>¿Para cuándo?</label>
            <input type="date" name="fecha" value="${hoy()}" required>
          </div>
          <div>
            <label>Personas</label>
            <input type="number" name="personas" value="1" min="1" max="30" inputmode="numeric">
          </div>
        </div>

        <label>Importancia</label>
        <div class="chips">
          ${IMPORTANCIAS.map((i) => `<label class="chip">
            <input type="radio" name="importancia" value="${i}"${i === "Media" ? " checked" : ""}>
            <span><span class="punto-imp imp-${i}"></span>${i}</span>
          </label>`).join("")}
        </div>

        <label>Quién la anota</label>
        <select name="creada_por" required>${opcionesIntegrante(yo)}</select>

        <button class="principal">Agregar tarea</button>
      </form>
    </div>

    ${hechas.length ? `<div class="tarjeta">
      <h2>Hechas hace poco</h2>
      ${hechas.map(filaTarea).join("")}
    </div>` : ""}`;
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
        ${buscadorCultivo()}

        <label>Kilos cosechados</label>
        <input type="text" name="kg" inputmode="decimal" autocomplete="off"
               placeholder="Ej: 12,5" required>

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
      <h2>Integrantes <small>${integrantes().length}</small></h2>
      <div class="chips-nombres">
        ${integrantes().map((n) => `<span class="chip-nombre">${esc(n)}</span>`).join("")}
      </div>
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

      <label>Servicio de siembras y cosechas <small>(planilla MonAgric)</small></label>
      <input type="url" id="aj-url" value="${esc(leer(LS.scriptUrl, ""))}"
             placeholder="https://script.google.com/macros/s/…/exec">

      <label>Servicio de horas <small>(planilla del proyecto)</small></label>
      <input type="url" id="aj-url-horas" value="${esc(leer(LS.urlHoras, ""))}"
             placeholder="ya viene configurado — dejalo vacío">
      <p class="nota" style="margin-top:6px">Las horas siguen yendo a la misma planilla
      de siempre. Solo tocá esto si cambia el servicio.</p>

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
    detalle = `${esc(d.integrante)}: ${d.horas} h${d.actividad ? " · " + esc(d.actividad) : ""}`;
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
     tareas: prepararTareas, inicio: prepararInicio, ajustes: prepararAjustes
   }[vista] || (() => {}))();

  // Si la sección quedó fuera de la vista en la barra deslizable, se la acerca.
  const activa = document.querySelector(".tabs-medio .tab.activa");
  if (activa) activa.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
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
  enlazarBuscadores(f);

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
    if (!f.cultivo.value) return aviso("Elegí el cultivo.", true);
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

// ---- Tareas ----
// Se juntan las que ya están en la planilla con las que se cargaron en este
// teléfono y todavía no viajaron, y se aplican las marcas de "hecha" que están
// esperando. Así la lista se ve al día aunque no haya señal.
function tareasParaMostrar() {
  const deLaPlanilla = leer(LS.tareas, []);
  const nuevasLocales = pendientes.filter((r) => r.tipo === "tareas")
    .map((r) => ({ ...r.datos, id: r.id, sinEnviar: true }));
  const hechasLocales = new Set(
    pendientes.filter((r) => r.tipo === "tareas_hecha").map((r) => r.datos.tarea_id));

  const todas = [...nuevasLocales, ...deLaPlanilla]
    .filter((t, i, arr) => arr.findIndex((o) => o.id === t.id) === i)
    .map((t) => ({ ...t, hecha: t.hecha || hechasLocales.has(t.id) }));

  const peso = { Alta: 0, Media: 1, Baja: 2 };
  return todas.sort((a, b) =>
    (a.fecha || "").localeCompare(b.fecha || "") ||
    (peso[a.importancia] ?? 1) - (peso[b.importancia] ?? 1));
}

function filaTarea(t) {
  const vencida = !t.hecha && t.fecha && t.fecha < hoy();
  const cuando = t.fecha === hoy() ? "hoy" : fechaCorta(t.fecha);
  const meta = [
    `<span class="punto-imp imp-${esc(t.importancia || "Media")}"></span>${esc(t.importancia || "Media")}`,
    vencida ? `atrasada desde el ${cuando}` : `para ${cuando}`,
    (t.personas > 1 ? `${t.personas} personas` : ""),
    (t.hecha && t.hecha_por ? `hecha por ${esc(t.hecha_por)}` : ""),
    (t.sinEnviar ? "sin enviar" : ""),
  ].filter(Boolean).join(" · ");

  return `<div class="tarea${t.hecha ? " lista" : ""}${vencida ? " vencida" : ""}">
    <button class="tarea-check${t.hecha ? " hecha" : ""}" data-tarea="${esc(t.id)}"
            ${t.hecha ? "disabled" : ""} aria-label="Marcar como hecha">${t.hecha ? "&#10003;" : ""}</button>
    <div class="tarea-texto">
      <div class="titulo">${esc(t.tarea)}</div>
      <div class="tarea-meta">${meta}</div>
    </div>
  </div>`;
}

function prepararTareas() {
  const f = $("#form-tareas");
  f.onsubmit = (e) => {
    e.preventDefault();
    const texto = f.tarea.value.trim();
    if (!texto) return aviso("Escribí qué hay que hacer.", true);
    escribir(LS.nombre, f.creada_por.value);
    guardarRegistro("tareas", {
      tarea: texto,
      fecha: f.fecha.value,
      importancia: f.querySelector("input[name=importancia]:checked").value,
      personas: parseInt(f.personas.value, 10) || 1,
      creada_por: f.creada_por.value,
      hecha: false,
    });
    render("tareas");
  };

  document.querySelectorAll(".tarea-check").forEach((b) => {
    b.onclick = () => {
      guardarRegistro("tareas_hecha", {
        tarea_id: b.dataset.tarea,
        hecha_el: hoy(),
        hecha_por: leer(LS.nombre, ""),
      });
      render("tareas");
    };
  });
}

// Trae del servicio la lista de tareas del equipo.
async function traerTareas() {
  const url = leer(LS.scriptUrl, "");
  if (!url || !navigator.onLine) return;
  try {
    const d = await (await fetch(url + "?tareas=1")).json();
    if (Array.isArray(d.tareas)) escribir(LS.tareas, d.tareas);
  } catch { /* sin conexión: se usa la última lista guardada */ }
}

function prepararHoras() {
  const f = $("#form-horas");
  f.onsubmit = (e) => {
    e.preventDefault();
    const horas = aNumero(f.horas.value);
    if (!(horas > 0 && horas <= 24)) return aviso("Las horas deben ser un número entre 0 y 24.", true);
    const actividad = f.querySelector("input[name=actividad]:checked");
    if (!actividad) return aviso("Elegí una actividad.", true);
    // El nombre elegido queda como el de este teléfono: la próxima vez viene puesto.
    escribir(LS.nombre, f.integrante.value);
    guardarRegistro("horas", {
      fecha: f.fecha.value,
      integrante: f.integrante.value,
      horas,
      actividad: actividad.value,
      observaciones: f.observaciones.value.trim(),
    });
    render("horas");
  };
}

function prepararCosechas() {
  const f = $("#form-cosechas");
  const calculo = $("#calculo-cosecha");
  enlazarSectorBancal(f);
  enlazarBuscadores(f);

  const actualizar = () => {
    const kg = aNumero(f.kg.value);
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
    const kg = aNumero(f.kg.value);
    if (!f.cultivo.value) return aviso("Elegí el cultivo.", true);
    if (!(kg > 0)) return aviso("Los kilos deben ser un número mayor a cero.", true);
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
  const esScript = (u) => !u || u.startsWith("https://script.google.com/");

  $("#btn-guardar-ajustes").onclick = () => {
    escribir(LS.nombre, $("#aj-nombre").value);
    const url = $("#aj-url").value.trim();
    const urlH = $("#aj-url-horas").value.trim();
    if (!esScript(url) || !esScript(urlH)) {
      return aviso("Las direcciones deben ser de Apps Script (script.google.com).", true);
    }
    escribir(LS.scriptUrl, url);
    escribir(LS.urlHoras, urlH);
    refrescarEstado();
    aviso("Ajustes guardados ✓");
    sincronizar();
  };

  $("#btn-probar").onclick = async () => {
    const partes = [];
    try {
      const d = await (await fetch(urlHoras())).json();
      partes.push(Array.isArray(d.nombres) ? `horas ✓ (${d.nombres.length} integrantes)` : "horas ✓");
    } catch { partes.push("horas ✗"); }

    const url = leer(LS.scriptUrl, "");
    if (!url) partes.push("siembras/cosechas: falta la dirección");
    else {
      try {
        const d = await (await fetch(url)).json();
        partes.push(d.ok ? "siembras/cosechas ✓" : "siembras/cosechas ✗");
      } catch { partes.push("siembras/cosechas ✗"); }
    }
    const hayFalla = partes.some((p) => p.includes("✗") || p.includes("falta"));
    aviso(partes.join(" · "), hayFalla);
    sincronizar();
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
  await traerDatosHoras();     // nombres del equipo antes del primer formulario
  sincronizar();
})();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
