// ==========================================================
// MonAgric Web — monitoreo agrícola desde el celular
//
// Los registros se guardan primero en el teléfono (funciona sin señal) y se
// envían a la planilla de Google (Apps Script) cuando hay conexión.
//
// Dos fuentes de datos, a propósito:
//   · catalogo.json  — cultivos, perfiles y actividades. IGUAL para todas las
//     chacras, lo definimos nosotros: es lo que después permite comparar una
//     chacra con otra. Se genera con  python tools/exportar_catalogo.py
//   · Configuración  — sectores, bancales, integrantes y plan de cultivos. Los
//     carga cada chacra desde la app y viven en la hoja Config de su planilla.
// ==========================================================

"use strict";

// Cada chacra escribe en su propia planilla; el servicio las reparte según el
// código. Para sumar una: crear su planilla, agregarla acá y cargar su id en la
// propiedad CHACRAS del Apps Script (ver docs/README.md).
const CHACRAS = [
  { codigo: "tica", nombre: "Chacra Tica", horasAparte: true },
  { codigo: "milpa", nombre: "La Milpa" },
  { codigo: "focoverde", nombre: "Foco Verde" },
  { codigo: "huerma", nombre: "Huerma" },
  { codigo: "huertota", nombre: "La Huertota" },
];

// Los tipos que nacen en bandeja: el formulario pide bandejas en vez de bancal.
const EN_BANDEJA = new Set(["Siembra almácigo", "Esqueje"]);

// Las horas siguen yendo a la planilla del proyecto donde ya están cargadas
// desde julio (la que usaba la app bioma-horas), para no partir el historial.
// Ese servicio recibe un registro por vez, con sus propios nombres de campo.
const URL_HORAS_POR_DEFECTO =
  "https://script.google.com/macros/s/AKfycbyHBMsZAyLOACCgWclgHGDB6e6M8tw2VX_zonELRuFobPp3TdakCr4Wkh2b8TqtB7P2bw/exec";

// Siembras, cosechas y tareas van a la planilla MonAgric. La dirección viene
// puesta para que nadie tenga que configurar nada: se abre el enlace, se elige
// el nombre y listo. Solo permite agregar filas a esa planilla.
const URL_SERVICIO_POR_DEFECTO =
  "https://script.google.com/macros/s/AKfycbxCe17bpyv_sOsJAdkyKSr87kwpSnCBSejS4e913m6zmjxSHEuMxiKEVRVaa8uRt85O/exec";

// ---- Almacenamiento en el teléfono ----
const LS = {
  pendientes: "monagric_pendientes",
  enviados: "monagric_enviados",
  nombre: "monagric_nombre",
  chacra: "monagric_chacra",
  credencial: "monagric_credencial",
  dispositivo: "monagric_dispositivo",
  config: "monagric_config",
  configLeida: "monagric_config_leida",
  scriptUrl: "monagric_script_url",
  urlHoras: "monagric_url_horas",
  resumen: "monagric_resumen",
  nombresPlanilla: "monagric_nombres_planilla",
  ultimasHoras: "monagric_ultimas_horas",
  tareas: "monagric_tareas",
  ultimos: "monagric_ultimos",
};

const leer = (k, def) => {
  try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); }
  catch { return def; }
};
const escribir = (k, v) => localStorage.setItem(k, JSON.stringify(v));

let pendientes = leer(LS.pendientes, []);
let enviados = leer(LS.enviados, []);
let resumen = leer(LS.resumen, null);   // totales de la chacra (desde su planilla)
let CAT = null;                         // catálogo común (catalogo.json)
let CFG = leer(LS.config, null);        // configuración de esta chacra
let vistaActual = "inicio";
let vistaTareas = "hoy";        // "hoy" o "areas"

// Hasta no haber leído la configuración de la chacra en el servicio no se puede
// guardar nada: guardar reescribe la hoja Config entera, así que hacerlo con la
// configuración a medio cargar borraría lo que ya tenía la chacra.
// Si en este teléfono ya se leyó alguna vez, lo guardado sirve de base y se
// puede seguir editando sin señal.
let configConfirmada = leer(LS.configLeida, false);

const urlHoras = () => leer(LS.urlHoras, "") || URL_HORAS_POR_DEFECTO;
const urlServicio = () => leer(LS.scriptUrl, "") || URL_SERVICIO_POR_DEFECTO;

const chacraCodigo = () => leer(LS.chacra, "");

// ---- Acceso ----
// Cada teléfono canjea una vez su código de invitación y guarda la credencial
// que le devuelve el servicio. Desde ahí viaja con cada pedido: es lo que
// distingue a alguien de la chacra de cualquiera que tenga el enlace.
const credencial = () => leer(LS.credencial, "");
const tieneAcceso = () => !!credencial();

// El identificador de este teléfono. Se crea una sola vez y no cambia: sirve
// para que en la planilla de accesos se vea cuántos aparatos hay cargando.
function dispositivo() {
  let id = leer(LS.dispositivo, "");
  if (!id) {
    id = "d-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    escribir(LS.dispositivo, id);
  }
  return id;
}

// Lo que va en cada pedido para identificarse.
const credenciales = () => ({
  chacra: chacraCodigo(),
  credencial: credencial(),
  dispositivo: dispositivo(),
});

const conCredenciales = (params) =>
  `${params}&chacra=${encodeURIComponent(chacraCodigo())}` +
  `&credencial=${encodeURIComponent(credencial())}` +
  `&dispositivo=${encodeURIComponent(dispositivo())}`;

async function canjearCodigo(codigo, persona) {
  const url = `${urlServicio()}?canjear=${encodeURIComponent(codigo)}` +
    `&chacra=${encodeURIComponent(chacraCodigo())}` +
    `&persona=${encodeURIComponent(persona || "")}` +
    `&dispositivo=${encodeURIComponent(dispositivo())}`;
  const d = await (await fetch(url)).json();
  if (d.ok && d.credencial) escribir(LS.credencial, d.credencial);
  return d;
}
const chacraActual = () => CHACRAS.find((c) => c.codigo === chacraCodigo()) || null;
// Solo Chacra Tica manda las horas a la planilla del proyecto Bioma, donde está
// el historial desde julio. Las demás las guardan en su propia hoja Horas.
const horasVanAparte = () => !!chacraActual()?.horasAparte;

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

// La planilla puede devolver una fecha como "2026-07-07" o como el texto largo
// que arma JavaScript ("Tue Jul 07 2026 00:00:00 GMT-0300…"). Las dos terminan
// acá en el mismo formato.
function aFechaISO(valor) {
  const txt = String(valor || "").trim();
  if (!txt) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(txt)) return txt;
  const d = new Date(txt);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

// Del catálogo común (igual para todas las chacras)
const perfil = (cultivo) => (CAT?.perfiles || {})[cultivo] || {};
const actividades = () => CAT?.actividades || [];
const tiposSiembra = () => CAT?.tipos_siembra || [];
const tiposBandeja = () => CAT?.tipos_bandeja || [72, 128];
const tiposRiego = () => CAT?.tipos_riego || ["Aspersión", "Goteo"];
const importancias = () => CAT?.importancias || ["Alta", "Media", "Baja"];

// De la configuración de esta chacra
const enPlan = (cultivo) => (CFG?.plan || []).find((p) => p.cultivo === cultivo);
const sectores = () => CFG?.sectores || [];

// ---- Áreas de trabajo ----
// Un área es la clasificación del trabajo, no un emprendimiento: agrupa las
// tareas y permite saber cuántas horas se lleva cada parte de la chacra.
//
// Estas seis vienen con la app y son iguales para todos los colectivos. No se
// agregan ni se borran, justamente para que las horas de Tica, Huerma y Foco
// Verde se puedan comparar entre sí: si cada uno inventara sus nombres, el dato
// serviría puertas adentro y nada más. Toda chacra hace mantenimiento,
// administración y comercialización, aunque produzca cosas distintas.
const AREAS_FIJAS = [
  { nombre: "Hortícola", actividades: ["Siembras", "Trasplante", "Desyuye",
      "Sanidad y Fertilidad", "Poda / Conducción", "Cosecha / Poscosecha"] },
  { nombre: "Frutícola", actividades: ["Implantación", "Poda / Conducción",
      "Fertilidad y Sanidad", "Cosecha / Poscosecha"] },
  { nombre: "Fungis", actividades: ["Sustrato", "Inoculación", "Mantenimiento",
      "Cosecha"] },
  { nombre: "Comercialización", actividades: ["Stock", "Análisis mercado",
      "Armado de oferta", "Proveedores", "Otras"] },
  { nombre: "Administración", actividades: ["Contabilidad", "Proyección",
      "Pagos", "Otras"] },
  { nombre: "Mantenimiento", actividades: ["Corte de pasto", "Orden y limpieza",
      "Reparaciones", "Mejoras"] },
];

// Lo propio de cada chacra: Biofábrica o Plantinera existen en Tica y no tienen
// por qué existir en las demás. Se suman a las fijas, nunca las reemplazan.
const areasPropias = () => (CFG?.areas || CFG?.proyectos || []).filter(
  (a) => !esAreaFija(a.nombre));

const esAreaFija = (nombre) =>
  AREAS_FIJAS.some((a) => claveArea(a.nombre) === claveArea(nombre));

// "Horticola", "hortícola" y "Hortícolas" son la misma área escrita por
// personas distintas. Se compara sin tildes, sin mayúsculas y sin la s final.
const claveArea = (nombre) => String(nombre || "").trim().toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/s$/, "");

const areas = () => AREAS_FIJAS.concat(areasPropias());
const areasActivas = () => areas().filter((a) => (a.estado || "activo") !== "terminado");
const ESTADOS_AREA = ["activo", "pausado", "terminado"];
const ESTADOS_TAREA = ["Pendiente", "En curso", "Hecha"];

// Las actividades que tiene sentido hacer en cada área. Sembrar existe en
// Hortícola pero no en Administración: por eso la lista es de cada una.
const actividadesDe = (nombre) =>
  (areas().find((a) => claveArea(a.nombre) === claveArea(nombre)) || {}).actividades || [];

function opcionesArea(seleccionado = "", conVacio = true) {
  const lista = areasActivas();
  return `${conVacio ? `<option value=""${seleccionado ? "" : " selected"}>Sin área</option>` : ""}
    ${lista.map((a) => `<option${claveArea(a.nombre) === claveArea(seleccionado) ? " selected" : ""}>${esc(a.nombre)}</option>`).join("")}`;
}
const hayConfig = () => !!(CFG && CFG.sectores?.length);
const bancalM2 = () => {
  const b = CFG?.bancal || {};
  return (b.largo_m || 0) * (b.ancho_m || 0);
};

// En Chacra Tica los nombres salen también de la planilla de horas del proyecto,
// que es donde está el historial; en las demás, solo de su configuración.
// La planilla de horas viene de una plantilla que traia filas de relleno
// ("Operador 9", "Encargado 2"): no son personas y ensucian el desplegable.
// Un nombre real no es una palabra generica seguida de un numero.
const esNombreDeRelleno = (n) =>
  /^(trabajador|operador|encargado|integrante|persona|nombre)\s*\d+$/i.test(String(n).trim());

function integrantes() {
  const deConfig = CFG?.integrantes || [];
  if (!horasVanAparte()) return [...deConfig];
  const dePlanilla = leer(LS.nombresPlanilla, []).filter((n) => !esNombreDeRelleno(n));
  return [...new Set([...dePlanilla, ...deConfig])];
}

// ---- Estado de sincronización ----
function refrescarEstado() {
  const el = $("#estado-sync");
  const ch = chacraActual();
  if (!ch) { el.textContent = "Elegí tu chacra para empezar"; return; }
  if (!tieneAcceso()) { el.textContent = `${ch.nombre} · falta activar el teléfono`; return; }
  const t = CFG?.temporada?.nombre;
  const base = t ? `${ch.nombre} · ${t}` : ch.nombre;
  if (pendientes.length) el.textContent = `${base} · ${pendientes.length} por enviar`;
  else el.textContent = `${base} · al día ✓`;
}

// ---- Envío a las planillas ----
// Las horas van a la planilla del proyecto y el resto a la de MonAgric, así que
// cada grupo se envía por su lado y lo que falle queda en la cola.
async function sincronizar(silencioso = true) {
  if (!navigator.onLine) { refrescarEstado(); return; }
  // Sin credencial no se manda nada: queda todo en la cola del teléfono hasta
  // que se active con un código.
  if (!tieneAcceso()) { refrescarEstado(); return; }

  const enviadosAhora = [];
  const fallaron = [];

  // Las horas de Chacra Tica van al servicio del proyecto (un registro por vez);
  // las de las demás chacras viajan con todo lo otro a su propia planilla.
  const horas = horasVanAparte() ? pendientes.filter((r) => r.tipo === "horas") : [];
  for (const r of horas) {
    try {
      await enviarHora(r);
      enviadosAhora.push(r);
    } catch {
      fallaron.push(r);
      break;   // si el servicio no responde, el resto espera al próximo intento
    }
  }

  const otros = pendientes.filter((r) => !horas.includes(r));
  if (otros.length) {
    try {
      const resp = await fetch(urlServicio(), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign(credenciales(), { registros: otros })),
      });
      const datos = await resp.json();
      // Si el teléfono fue dado de baja, lo cargado no se pierde: queda en la
      // cola y se avisa que hay que activar de nuevo con un código.
      if (datos.sin_permiso) {
        escribir(LS.credencial, "");
        aviso(datos.error || "Este teléfono ya no tiene acceso.", true);
        refrescarEstado();
        return;
      }
      if (!datos.ok) throw new Error(datos.error || "respuesta inválida");
      enviadosAhora.push(...otros);
    } catch (e) {
      fallaron.push(...otros);
      if (!silencioso) aviso("No se pudo enviar: " + e.message, true);
    }
  }

  if (enviadosAhora.length) {
    // Lo recién enviado ya está en la planilla: se vuelve a pedir para que
    // aparezca en la lista de la chacra y no solo como "por enviar".
    new Set(enviadosAhora.map((r) => r.tipo)).forEach((t) => traerUltimos(t, true));
    const ids = new Set(enviadosAhora.map((r) => r.id));
    enviados = enviadosAhora.map((r) => ({ ...r, enviado_en: ahora() })).concat(enviados).slice(0, 60);
    pendientes = pendientes.filter((r) => !ids.has(r.id));
    escribir(LS.pendientes, pendientes);
    escribir(LS.enviados, enviados);
    if (!silencioso) aviso(`${enviadosAhora.length} registro(s) enviado(s) ✓`);
  } else if (!silencioso && fallaron.length) {
    aviso("No se pudo enviar. Revisá la señal y los Ajustes.", true);
  }

  await Promise.all([traerResumen(), traerDatosHoras(), traerTareas(), traerConfig()]);
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
      actividad: d.actividad || "",
      obs: d.observaciones || "",
      area: d.area || d.proyecto || "",
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
  if (!navigator.onLine) return;
  try {
    const r = await fetch(
      `${urlServicio()}?${conCredenciales("resumen=1")}`);
    const d = await r.json();
    if (d.ok) { resumen = d; escribir(LS.resumen, resumen); }
  } catch { /* sin conexión: se sigue mostrando el último resumen guardado */ }
}

function guardarRegistro(tipo, datos, mensaje = "Registro guardado ✓") {
  // La configuración no se acumula: si hay una esperando, la nueva la reemplaza.
  if (tipo === "config") pendientes = pendientes.filter((r) => r.tipo !== "config");
  pendientes.push({
    id: uid(),
    tipo,
    datos,
    temporada: CFG?.temporada?.nombre || "",
    creado_en: ahora(),
    dispositivo: leer(LS.nombre, ""),
  });
  escribir(LS.pendientes, pendientes);
  refrescarEstado();
  aviso(mensaje);
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
  const delPlan = (CFG?.plan || []).map((p) => p.cultivo);
  const otros = (CAT?.cultivos || []).filter((c) => !delPlan.includes(c));
  return { lista: [...delPlan, ...otros], delPlan };
}

function buscadorCultivo(valor = "", nombre = "cultivo") {
  const { lista, delPlan } = cultivosOrdenados();
  return buscador(nombre, lista, {
    placeholder: "Elegí el cultivo (escribí para buscar)…",
    valor, destacadas: delPlan,
  });
}

// Un cultivo con sus kilos. Se pueden apilar varios en una misma cosecha.
function renglonCosecha(i) {
  return `<div class="renglon-cosecha" data-renglon="${i}">
    <div class="renglon-cab">
      <label>Cultivo</label>
      ${i > 0 ? `<button type="button" class="quitar" data-quitar-renglon="${i}"
                         aria-label="Quitar este cultivo">&times;</button>` : ""}
    </div>
    ${buscadorCultivo("", "cultivo_" + i)}
    <label>Kilos cosechados</label>
    <input type="text" name="kg_${i}" inputmode="decimal" autocomplete="off"
           placeholder="Ej: 12,5">
  </div>`;
}

// Enciende todos los buscadores que haya en un formulario.
function enlazarBuscadores(form) {
  form.querySelectorAll("[data-buscador]").forEach((caja) => {
    if (caja.dataset.encendido) return;    // ya tiene sus eventos (renglones nuevos)
    caja.dataset.encendido = "1";
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

// El cosechador de Pac-Farm con su sombrero de paja, comiéndose la huerta.
// Es pixel art, así que va como PNG y no como vector: un vector necesitaría un
// rectángulo por píxel, pesaría más y se vería peor. Pesa 1,2 KB.
const IMG_PACFARM =
  `<img src="img/pacfarm.png" alt="" class="dibujo-pacfarm" width="65" height="39">`;

// ==========================================================
// VISTAS
// ==========================================================
const plantillas = {

  inicio() {
    if (!chacraActual()) return tarjetaElegirChacra();
    if (!tieneAcceso()) return tarjetaCanje();
    if (!hayConfig()) return tarjetaSinConfig();
    const t = CFG.temporada || {};
    const plan = CFG.plan || [];
    const supPlan = plan.reduce((a, p) => a + p.superficie_m2, 0);
    const kgPlan = plan.reduce((a, p) => a + p.cosecha_esperada_kg, 0);
    const local = totalesLocales();
    const kgLogrado = resumen ? resumen.kg_cosechados : local.kg;
    const pct = kgPlan ? (kgLogrado / kgPlan) * 100 : 0;

    return `
    <div class="tarjeta temporada-cab">
      <h2>Temporada ${esc(t.nombre || "sin nombre")}</h2>
      <div class="chacra">${esc(CFG.nombre || chacraActual().nombre)}</div>
      <div class="rango">${t.inicio ? "Inicio " + fechaCorta(t.inicio) : "Sin fecha de inicio"}${t.fin ? " · fin " + fechaCorta(t.fin) : ""}
        · ${plan.length} cultivos planificados</div>
      <div class="cifras">
        <div class="cifra"><b>${num(supPlan)}</b><span>m² planificados</span></div>
        <div class="cifra"><b>${num(kgPlan)}</b><span>kg esperados</span></div>
        <div class="cifra"><b>${num(kgLogrado)}</b><span>kg cosechados</span></div>
      </div>
      ${barra(pct, true)}
      <div class="rango" style="margin-top:6px">
        ${num(pct, 1)}% de lo esperado ·
        ${resumen ? "datos de toda la chacra" : "solo este teléfono"}
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
      <h2>&#128172; ¿Qué mejorarías de la app?</h2>
      <p class="nota">Lo que te falte, lo que te moleste o algo que se te ocurra.
      Lo leo yo y lo vamos arreglando.</p>
      <form id="form-sugerencia">
        <textarea name="texto" rows="3" maxlength="600"
                  placeholder="Ej: estaría bueno poder anotar el riego de cada sector"></textarea>
        <button class="secundario">Enviar</button>
      </form>
    </div>

    <a class="acceso-juego" href="juego/" aria-label="Jugar a Pac-Farm">
      ${IMG_PACFARM}
      <span>Un rato de Pac-Farm</span>
    </a>`;
  },

  siembras() {
    if (!chacraActual()) return tarjetaElegirChacra();
    if (!tieneAcceso()) return tarjetaCanje();
    if (!hayConfig()) return tarjetaSinConfig();
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
          ${tiposSiembra().map((t) => `<option${t === "Siembra almácigo" ? " selected" : ""}>${esc(t)}</option>`).join("")}
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
                ${tiposBandeja().map((v) => `<option>${v}</option>`).join("")}
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
    if (!chacraActual()) return tarjetaElegirChacra();
    if (!tieneAcceso()) return tarjetaCanje();
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

        <label>¿En qué área?</label>
        <select name="area" required>
          <option value="" disabled selected>Elegí el área…</option>
          ${opcionesArea("", false)}
        </select>

        <div id="bloque-actividad" hidden>
          <label>¿Qué actividad?</label>
          <select name="actividad"></select>
        </div>

        <label>Horas trabajadas</label>
        <!-- texto y no "number": con type=number el navegador descarta "5,5" y
             en el celular el teclado en español ofrece coma. -->
        <input type="text" name="horas" inputmode="decimal" autocomplete="off"
               placeholder="Ej: 4 o 2,5" required>

        <label>¿Qué hiciste?</label>
        <textarea name="observaciones" rows="2"
                  placeholder="Ej: armado de mesadas y colocación de la pollera"></textarea>

        <button class="principal">Guardar horas</button>
      </form>
    </div>

    ${horasVanAparte() ? `
    <div class="tarjeta">
      <h2>Últimos movimientos <small>planilla del proyecto</small></h2>
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
    </div>` : historialDe("horas")}`;
  },

  tareas() {
    if (!chacraActual()) return tarjetaElegirChacra();
    if (!tieneAcceso()) return tarjetaCanje();
    const yo = leer(LS.nombre, "");
    const lista = tareasParaMostrar();
    const pendientes_ = lista.filter((t) => !t.hecha);
    const hechas = lista.filter((t) => t.hecha).slice(0, 8);
    const porArea = vistaTareas === "areas";

    return `
    <div class="pestanas-tareas">
      <button class="pestana${porArea ? "" : " activa"}" data-vista-tareas="hoy">Hoy</button>
      <button class="pestana${porArea ? " activa" : ""}" data-vista-tareas="areas">Por área</button>
    </div>

    ${porArea ? tarjetasDeAreas(lista) : `
    <div class="tarjeta">
      <h2>&#9745; Tareas pendientes <small>${pendientes_.length}</small></h2>
      ${pendientes_.length
        ? pendientes_.map(filaTarea).join("")
        : `<p class="nota">No hay tareas pendientes. Agregá una acá abajo.</p>`}
    </div>`}

    <div class="tarjeta">
      <h2>Anotar una tarea</h2>
      <form id="form-tareas">
        <label>¿Qué hay que hacer?</label>
        <input type="text" name="tarea" maxlength="140" autocomplete="off"
               placeholder="Ej: desyuyar el sector B" required>

        <label>Área</label>
        <select name="area">${opcionesArea()}</select>

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
          ${importancias().map((i) => `<label class="chip">
            <input type="radio" name="importancia" value="${i}"${i === "Media" ? " checked" : ""}>
            <span><span class="punto-imp imp-${i}"></span>${i}</span>
          </label>`).join("")}
        </div>

        <div class="fila">
          <div>
            <label>Quién la anota</label>
            <select name="creada_por" required>${opcionesIntegrante(yo)}</select>
          </div>
          <div>
            <label>Quién la toma <small>(opcional)</small></label>
            <select name="asignada">
              <option value="">Cualquiera</option>
              ${integrantes().map((n) => `<option>${esc(n)}</option>`).join("")}
            </select>
          </div>
        </div>

        <button class="principal">Agregar tarea</button>
      </form>
    </div>

    ${hechas.length ? `<div class="tarjeta">
      <h2>Hechas hace poco</h2>
      ${hechas.map(filaTarea).join("")}
    </div>` : ""}`;
  },

  cosechas() {
    if (!chacraActual()) return tarjetaElegirChacra();
    if (!tieneAcceso()) return tarjetaCanje();
    const yo = leer(LS.nombre, "");
    return `
    <div class="tarjeta">
      <h2>&#127807; Registrar cosecha</h2>
      <p class="nota">Los kilos totales de cada cultivo, de todos los bancales juntos.
      Podés cargar varios cultivos de una vez con el botón +.</p>
      <form id="form-cosechas">
        <label>Fecha</label>
        <input type="date" name="fecha" value="${hoy()}" required>

        <div id="renglones-cosecha">${renglonCosecha(0)}</div>

        <button type="button" class="secundario mas" id="btn-mas-cultivo">
          + Agregar otro cultivo</button>

        <div class="calculo" id="calculo-cosecha"></div>

        <label>Cosechó</label>
        <select name="operador">${opcionesIntegrante(yo)}</select>

        <button class="principal">Guardar cosecha</button>
      </form>
    </div>
    ${historialDe("cosechas")}`;
  },

  plan() {
    if (!chacraActual()) return tarjetaElegirChacra();
    if (!tieneAcceso()) return tarjetaCanje();
    if (!hayConfig()) return tarjetaSinConfig();
    const b = CFG.bancal || {}, m2 = bancalM2();
    const plan = CFG.plan || [];
    const porCultivo = resumen?.kg_por_cultivo || kgLocalesPorCultivo();
    return `
    <div class="tarjeta">
      <h2>Plan de la temporada <small>${plan.length} cultivos</small></h2>
      ${plan.length ? plan.map((p) => {
        const logrado = porCultivo[p.cultivo] || 0;
        const pct = p.cosecha_esperada_kg ? (logrado / p.cosecha_esperada_kg) * 100 : 0;
        const perf = perfil(p.cultivo);
        return `<div class="plan-fila">
          <div class="plan-cab">
            <b>${esc(p.cultivo)}</b>
            <span>${num(logrado)} / ${num(p.cosecha_esperada_kg)} kg</span>
          </div>
          <div class="plan-detalle">
            ${num(p.superficie_m2)} m²${m2 ? ` (${num(p.superficie_m2 / m2, 1)} bancales)` : ""}
            ${perf.tipo_siembra ? ` · ${esc(perf.tipo_siembra)}` : ""}
            ${perf.lineas_bancal ? ` · ${num(perf.lineas_bancal)} líneas a ${num(perf.distancia_cm)} cm` : ""}
            ${perf.dias_a_cosecha ? ` · ${perf.dias_a_cosecha} días a cosecha` : ""}
          </div>
          ${barra(pct)}
        </div>`;
      }).join("") : `<p class="nota">Todavía no hay cultivos planificados.</p>`}
    </div>

    <div class="tarjeta">
      <h2>Sectores de riego</h2>
      ${sectores().map((s) => `<div class="registro">
        <div><div class="detalle">Sector ${esc(s.sector)}</div>
          <div class="cuando">${esc(s.tipo_riego)}</div></div>
        <span class="etiqueta ok">${s.bancales} bancales</span>
      </div>`).join("")}
      <p class="nota" style="margin-top:10px">
        Bancal de ${num(b.largo_m, 1)} × ${num(b.ancho_m, 1)} m (${num(m2, 1)} m²)
        ${b.pasillo_m ? ` · pasillo ${num(b.pasillo_m, 1)} m` : ""}
        · ${num(b.n_bancales)} bancales en total
      </p>
    </div>

    <div class="tarjeta">
      <h2>Integrantes <small>${integrantes().length}</small></h2>
      <div class="chips-nombres">
        ${integrantes().map((n) => `<span class="chip-nombre">${esc(n)}</span>`).join("")}
      </div>
    </div>

    <div class="tarjeta">
      <button class="secundario" id="btn-ir-config">&#128736;&#65039; Configuración</button>
      <p class="nota" style="margin-top:8px">Todo esto se carga y se corrige desde el
      teléfono. Los cultivos disponibles son los mismos para todas las chacras, para
      que después se puedan comparar.</p>
    </div>`;
  },

  // Cada chacra carga acá lo suyo. Los cultivos NO se editan: salen del catálogo
  // común, que es lo que después permite comparar entre chacras.
  configuracion() {
    if (!chacraActual()) return tarjetaElegirChacra();
    if (!tieneAcceso()) return tarjetaCanje();
    // Sin haber leído lo que la chacra tiene guardado no se muestran los
    // formularios: si alguien guardara con la pantalla en blanco, borraría todo.
    if (!configConfirmada) {
      return `<div class="tarjeta">
        <h2>No pude leer la configuración</h2>
        <p class="nota">Para no pisar lo que la chacra ya tenga cargado, primero hay
        que leerlo del servidor, y para eso hace falta señal. ${navigator.onLine
          ? "Estamos reintentando…" : "Ahora no hay conexión."}</p>
        <button class="principal" id="btn-reintentar-config" style="margin-top:12px">
          Reintentar</button>
      </div>`;
    }
    const c = CFG || {};
    const t = c.temporada || {};
    const b = c.bancal || {};
    const plan = c.plan || [];
    const equipo = c.integrantes || [];
    const secs = c.sectores || [];

    return `
    <div class="tarjeta">
      <h2>&#127962; La chacra y la temporada</h2>
      <form id="form-config-general">
        <label>Nombre de la chacra</label>
        <input type="text" name="nombre" value="${esc(c.nombre || chacraActual().nombre)}"
               maxlength="60" required>

        <div class="fila">
          <div>
            <label>Temporada</label>
            <input type="text" name="temporada" value="${esc(t.nombre || "")}"
                   placeholder="Ej: 2026-27" maxlength="20" required>
          </div>
          <div>
            <label>Empieza el</label>
            <input type="date" name="inicio" value="${esc(t.inicio || "")}">
          </div>
        </div>

        <h3 class="sub">Medidas del bancal</h3>
        <div class="fila">
          <div>
            <label>Largo (m)</label>
            <input type="text" name="largo" inputmode="decimal" value="${b.largo_m || ""}"
                   placeholder="Ej: 30">
          </div>
          <div>
            <label>Ancho (m)</label>
            <input type="text" name="ancho" inputmode="decimal" value="${b.ancho_m || ""}"
                   placeholder="Ej: 1">
          </div>
          <div>
            <label>Pasillo (m)</label>
            <input type="text" name="pasillo" inputmode="decimal" value="${b.pasillo_m || ""}"
                   placeholder="Ej: 0,6">
          </div>
        </div>
        <div class="calculo" id="calculo-bancal"></div>

        <button class="principal">Guardar</button>
      </form>
    </div>

    <div class="tarjeta">
      <h2>Sectores <small>${secs.length}</small></h2>
      <p class="nota">Cada sector con cuántos bancales tiene. Es lo que aparece después
      al cargar las siembras. El nombre lo elegís vos: puede ser una letra, un número
      o un nombre (Verano, Otoño…).</p>
      <div id="lista-sectores">
        ${secs.length ? secs.map((s, i) => filaSector(s, i)).join("")
                      : `<p class="nota">Todavía no cargaste ninguno.</p>`}
      </div>
      <form id="form-sector" class="alta">
        <div id="titulo-sector"></div>
        <div class="fila">
          <div>
            <label>Nombre</label>
            <input type="text" name="sector" maxlength="24" placeholder="Ej: A o Verano" required>
          </div>
          <div>
            <label>Bancales</label>
            <input type="number" name="bancales" min="1" max="500" value="10" required>
          </div>
          <div>
            <label>Riego</label>
            <select name="tipo_riego">
              ${tiposRiego().map((r) => `<option>${esc(r)}</option>`).join("")}
            </select>
          </div>
        </div>
        <button class="secundario" id="btn-sector">Agregar sector</button>
        <button type="button" class="secundario" id="btn-cancelar-sector" hidden>Cancelar</button>
      </form>
    </div>

    <div class="tarjeta">
      <h2>Quiénes trabajan <small>${equipo.length}</small></h2>
      <div class="chips-nombres" id="lista-integrantes">
        ${equipo.length ? equipo.map((n) => `<span class="chip-nombre">${esc(n)}
            <button type="button" class="quitar" data-integrante="${esc(n)}"
                    aria-label="Quitar">&times;</button></span>`).join("")
                        : `<p class="nota">Todavía no cargaste a nadie.</p>`}
      </div>
      <form id="form-integrante" class="alta">
        <label>Nombre</label>
        <input type="text" name="nombre" maxlength="40" placeholder="Ej: Marto" required>
        <button class="secundario">Agregar</button>
      </form>
    </div>

    <div class="tarjeta">
      <h2>Áreas de trabajo <small>${areas().length}</small></h2>
      <p class="nota">Con qué se clasifica cada hora y cada tarea. Las seis primeras
      vienen con la app y son iguales en todas las chacras: así las horas se pueden
      comparar entre colectivos. Abajo podés sumar las propias de tu espacio.</p>

      <div class="lista-areas">
        ${AREAS_FIJAS.map((a) => `<div class="registro">
            <div><div class="detalle">${esc(a.nombre)}</div>
              <div class="cuando">${a.actividades.map(esc).join(" · ")}</div></div>
          </div>`).join("")}
      </div>

      <h3 class="sub">Propias de esta chacra</h3>
      <div id="lista-areas-propias">
        ${areasPropias().length ? areasPropias().map((a, i) => `<div class="registro">
            <div><div class="detalle">${esc(a.nombre)}${
                (a.estado || "activo") !== "activo" ? ` <small>${esc(a.estado)}</small>` : ""}</div>
              <div class="cuando">${(a.actividades || []).length
                ? (a.actividades || []).map(esc).join(" · ")
                : "sin actividades: se escribe en Observaciones"}</div></div>
            <button type="button" class="quitar" data-area="${i}" aria-label="Quitar">&times;</button>
          </div>`).join("")
          : `<p class="nota">Ninguna todavía. Las seis de arriba ya alcanzan para empezar.</p>`}
      </div>
      <form id="form-area" class="alta">
        <div class="fila">
          <div>
            <label>Nombre</label>
            <input type="text" name="nombre" maxlength="40" placeholder="Ej: Plantinera" required>
          </div>
          <div>
            <label>Estado</label>
            <select name="estado">
              ${ESTADOS_AREA.map((e) => `<option>${e}</option>`).join("")}
            </select>
          </div>
        </div>
        <label>Actividades <small>(separadas por coma)</small></label>
        <input type="text" name="actividades" maxlength="240"
               placeholder="Ej: Diseño, Ejecución, Mejoras">
        <button class="secundario">Agregar área</button>
      </form>
    </div>

    <div class="tarjeta">
      <h2>Plan de cultivos <small>${plan.length}</small></h2>
      <p class="nota">Se carga en <b>bancales</b>, que es como se planifica en el campo.
      Los metros, los kilos esperados y las plantas los calcula solo. Los cultivos salen
      de una lista común a todas las chacras: si falta alguno, escribime y lo agregamos.</p>
      ${bancalM2() ? "" : `<p class="nota" style="color:#b06a00">Primero cargá las medidas
        del bancal, acá arriba: sin eso no se puede pasar de bancales a metros.</p>`}
      <div id="lista-plan">
        ${plan.length ? plan.map((p, i) => filaPlan(p, i)).join("")
                      : `<p class="nota">Todavía no planificaste ningún cultivo.</p>`}
      </div>

      <form id="form-plan" class="alta">
        <div id="titulo-plan"></div>
        <label>Cultivo</label>
        ${buscador("cultivo", (CAT?.cultivos || []), { placeholder: "Buscá el cultivo…" })}

        <label>¿Cuántos bancales le vas a dar?</label>
        <input type="text" name="bancales" inputmode="decimal" placeholder="Ej: 5" required>

        <details id="avanzado-plan">
          <summary>Ajustar rendimiento y densidad</summary>
          <p class="nota">Vienen del catálogo común. Cambialos si en tu chacra
          este cultivo se maneja distinto.</p>
          <div class="fila">
            <div>
              <label>Rinde (kg/m²)</label>
              <input type="text" name="rinde" inputmode="decimal">
            </div>
            <div>
              <label>Líneas por bancal</label>
              <input type="number" name="lineas" min="1" max="20">
            </div>
            <div>
              <label>Distancia (cm)</label>
              <input type="text" name="distancia" inputmode="decimal">
            </div>
          </div>
        </details>

        <div class="calculo" id="calculo-plan"></div>
        <button class="secundario" id="btn-plan">Agregar al plan</button>
        <button type="button" class="secundario" id="btn-cancelar-plan" hidden>Cancelar</button>
      </form>
    </div>`;
  },

  ajustes() {
    return `
    <div class="tarjeta">
      <h2>&#9881; Ajustes</h2>
      <label>Chacra</label>
      <select id="aj-chacra">
        <option value="" disabled${chacraCodigo() ? "" : " selected"}>Elegí tu chacra…</option>
        ${CHACRAS.map((c) => `<option value="${esc(c.codigo)}"${c.codigo === chacraCodigo() ? " selected" : ""}>
          ${esc(c.nombre)}</option>`).join("")}
      </select>
      <p class="nota" style="margin-top:6px">Cambiarla hace que los registros vayan a
      la planilla de otra chacra. Se elige una vez y no se toca más.</p>

      <label>Tu nombre (queda en cada registro que cargues)</label>
      <select id="aj-nombre">${opcionesIntegrante(leer(LS.nombre, ""))}</select>

      <p class="nota">Con elegir tu nombre alcanza: las dos planillas ya vienen
      conectadas. Los campos de abajo son para cuando cambie algún servicio.</p>

      <label>Servicio de siembras, cosechas y tareas <small>(planilla MonAgric)</small></label>
      <input type="url" id="aj-url" value="${esc(leer(LS.scriptUrl, ""))}"
             placeholder="ya viene configurado — dejalo vacío">

      <label>Servicio de horas <small>(planilla del proyecto)</small></label>
      <input type="url" id="aj-url-horas" value="${esc(leer(LS.urlHoras, ""))}"
             placeholder="ya viene configurado — dejalo vacío">

      <button class="principal" id="btn-guardar-ajustes">Guardar ajustes</button>
      <button class="secundario" id="btn-probar">Probar conexión</button>
    </div>

    ${tieneAcceso() ? `<div class="tarjeta">
      <h2>Este teléfono</h2>
      <p class="nota">Activado para <b>${esc(chacraActual()?.nombre || "")}</b>
      como <b>${esc(leer(LS.nombre, "—"))}</b>.</p>
      <button class="secundario" id="btn-desvincular">Desvincular este teléfono</button>
      <p class="nota" style="margin-top:8px">Vuelve a pedir un código de acceso.
      Lo que tengas sin enviar no se pierde: se manda cuando lo actives de nuevo.</p>
    </div>` : ""}
    <div class="tarjeta">
      <h2>Acerca de</h2>
      <p class="nota">MonAgric — monitoreo agrícola para emprendimientos agroecológicos.
      Los registros se guardan en este teléfono (funciona sin señal) y se envían a la
      planilla de la chacra cuando hay conexión.</p>
      <p class="nota" style="margin-top:8px">
        Chacra: ${esc(chacraActual()?.nombre || "sin elegir")} ·
        ${hayConfig() ? `temporada ${esc(CFG.temporada?.nombre || "")},
          ${(CFG.plan || []).length} cultivos` : "sin configurar"} ·
        catálogo de ${(CAT?.cultivos || []).length} cultivos.</p>
    </div>`;
  },
};

const filaSector = (s, i) => `<div class="registro">
  <div><div class="detalle">${esc(s.sector)}</div>
    <div class="cuando">${esc(s.tipo_riego || "sin riego indicado")}</div></div>
  <span class="etiqueta ok">${s.bancales} bancales</span>
  <button type="button" class="editar" data-editar-sector="${i}" aria-label="Editar">&#9998;</button>
  <button type="button" class="quitar" data-sector="${i}" aria-label="Quitar">&times;</button>
</div>`;

const filaPlan = (p, i) => {
  const b = bancalM2();
  const detalle = [
    b ? `${num(p.superficie_m2 / b, 1)} bancales` : "",
    `${num(p.superficie_m2)} m²`,
    p.plantas ? `${num(p.plantas)} plantas` : "",
    p.rinde_kg_m2 ? `${num(p.rinde_kg_m2, 2)} kg/m²` : "",
  ].filter(Boolean).join(" · ");

  return `<div class="registro">
    <div><div class="detalle">${esc(p.cultivo)}</div>
      <div class="cuando">${detalle}</div></div>
    <span class="etiqueta ok">${num(p.cosecha_esperada_kg)} kg</span>
    <button type="button" class="editar" data-editar="${i}" aria-label="Editar">&#9998;</button>
    <button type="button" class="quitar" data-plan="${i}" aria-label="Quitar">&times;</button>
  </div>`;
};

// Cuántas plantas entran: las líneas del bancal por lo que da la distancia a lo
// largo, por la cantidad de bancales.
function plantasDe({ bancales, lineas, distancia_cm }) {
  const largoCm = (CFG?.bancal?.largo_m || 0) * 100;
  if (!largoCm || !lineas || !distancia_cm) return 0;
  return Math.round(lineas * Math.floor(largoCm / distancia_cm) * bancales);
}

function tarjetaElegirChacra() {
  return `<div class="tarjeta">
    <h2>¿De qué chacra sos?</h2>
    <p class="nota">Se elige una sola vez en este teléfono. Cada chacra guarda sus
    datos en su propia planilla.</p>
    <div class="chips" style="margin-top:12px">
      ${CHACRAS.map((c) => `<button type="button" class="chip-chacra" data-chacra="${esc(c.codigo)}">
        ${esc(c.nombre)}</button>`).join("")}
    </div>
  </div>`;
}

function tarjetaCanje() {
  const ch = chacraActual();
  return `<div class="tarjeta">
    <h2>&#128273; Tu código de acceso</h2>
    <p class="nota">Para cargar datos en <b>${esc(ch.nombre)}</b> hace falta el código
    que te dieron. Se escribe una sola vez en este teléfono; después no te lo pide
    más.</p>
    <form id="form-canje">
      <label>Código</label>
      <input type="text" name="codigo" autocomplete="off" autocapitalize="characters"
             spellcheck="false" placeholder="Ej: TICA-4F2K" required>

      <label>Tu nombre</label>
      <input type="text" name="persona" autocomplete="off" maxlength="40"
             placeholder="Ej: Luna" required>

      <button class="principal">Activar este teléfono</button>
    </form>
    <p class="nota" style="margin-top:12px">¿No tenés código? Pedíselo a quien
    administra la app. ¿Te equivocaste de chacra?
    <a href="#" id="volver-a-chacra">Elegir otra</a>.</p>
  </div>`;
}

function tarjetaSinConfig() {
  return `<div class="tarjeta">
    <h2>Falta configurar la temporada</h2>
    <p class="nota">Antes de empezar hay que cargar los sectores, los bancales, quiénes
    trabajan y qué se planifica sembrar. Se hace una vez y se puede corregir cuando
    quieras.</p>
    <button class="principal" id="btn-ir-config" style="margin-top:12px">
      Configurar la temporada</button>
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

// Cada sección muestra lo último que cargó TODO el equipo, no solo este
// teléfono: primero lo que está esperando enviarse de acá, después lo que ya
// está en la planilla. Para el detalle completo está la planilla.
function historialDe(tipo) {
  const delEquipo = (leer(LS.ultimos, {})[tipo] || []).slice(0, 15);
  const yaEnLaPlanilla = new Set(delEquipo.map((f) => String(f.Id)));

  // Lo cargado en este teléfono que todavía no figura en la lista de la chacra:
  // sea porque falta enviarlo o porque recién se envió y la planilla aún no lo
  // devolvió. Si no, el registro parecía desaparecer apenas se guardaba.
  const locales = pendientes.concat(enviados)
    .filter((r) => r.tipo === tipo && !yaEnLaPlanilla.has(String(r.id)))
    .slice(0, 5);

  const cuerpo = locales.length || delEquipo.length
    ? locales.map(filaRegistro).join("") + delEquipo.map((f) => filaEquipo(tipo, f)).join("")
    : `<p class="nota">Todavía no hay registros cargados.</p>`;

  return `<div class="tarjeta">
    <h2>Últimos movimientos <small>de la chacra</small></h2>
    ${cuerpo}
    <a class="enlace-planilla" href="${esc(enlacePlanilla())}" target="_blank" rel="noopener">
      Ver todo en la planilla</a>
  </div>`;
}

// La dirección de la planilla la manda el servicio junto con la configuración.
const enlacePlanilla = () => CFG?.planilla || "https://drive.google.com/drive/recent";

// Una fila que ya está en la planilla. Las claves son los encabezados de la
// hoja, así que se lee igual que se ve allá.
function filaEquipo(tipo, f) {
  let detalle, extra;
  if (tipo === "siembras") {
    const cant = f.Plantines ? `${num(f.Plantines)} plantines`
      : (f.Sector ? `${esc(f.Sector)}${f.Bancal || ""}` : "");
    detalle = `${esc(f.Cultivo)}${f.Variedad ? " " + esc(f.Variedad) : ""} · G${f["Generación"] || 1}`;
    extra = [esc(f.Tipo), cant, f.Operador ? "por " + esc(f.Operador) : ""].filter(Boolean).join(" · ");
  } else if (tipo === "cosechas") {
    detalle = `${esc(f.Cultivo)} — ${num(f.Kg, 1)} kg`;
    extra = f["Cosechó"] ? "por " + esc(f["Cosechó"]) : "";
  } else if (tipo === "horas") {
    detalle = `${esc(f.Integrante)} — ${num(f.Horas, 1)} h`;
    extra = [f["Área"] || f.Proyecto, f.Actividad, f.Observaciones]
      .filter(Boolean).map(esc).join(" · ");
  } else {
    detalle = esc(f.Tarea || f.Cultivo || "");
    extra = "";
  }
  return `<div class="registro">
    <div><div class="detalle">${detalle}</div>
      <div class="cuando">${fechaCorta(f.Fecha)}${extra ? " · " + extra : ""}</div></div>
  </div>`;
}

// Trae del servicio las últimas filas de una hoja y las guarda para verlas
// aunque después no haya señal.
const pedidoReciente = {};
async function traerUltimos(tipo, forzar = false) {
  if (!chacraCodigo() || !navigator.onLine) return;
  // Sin esto, cada render pediría de nuevo y el redibujado se volvería un lazo.
  if (!forzar && Date.now() - (pedidoReciente[tipo] || 0) < 20000) return;
  pedidoReciente[tipo] = Date.now();
  try {
    const d = await (await fetch(
      `${urlServicio()}?${conCredenciales("ultimos=" + encodeURIComponent(tipo))}&n=15`)).json();
    if (!d.ok || !Array.isArray(d.filas)) return;
    const guardado = leer(LS.ultimos, {});
    const cambio = JSON.stringify(guardado[tipo] || []) !== JSON.stringify(d.filas);
    guardado[tipo] = d.filas;
    escribir(LS.ultimos, guardado);
    if (cambio && vistaActual === tipo) render(tipo);
  } catch { /* sin conexión: se muestra lo último que se bajó */ }
}

// Un registro de este teléfono. Cada tipo se arma aparte: antes todo lo que no
// fuera horas ni cosechas caía en "Siembra", así que los guardados de
// configuración aparecían como "Siembra — Gundefined".
function filaRegistro(r) {
  const d = r.datos;
  const esperando = !r.enviado_en;
  let titulo = "", detalle = "";

  if (r.tipo === "horas") {
    titulo = "Horas";
    detalle = `${esc(d.integrante)}: ${d.horas} h${d.actividad ? " · " + esc(d.actividad) : ""}`;
  } else if (r.tipo === "cosechas") {
    titulo = "Cosecha";
    detalle = `${esc(d.cultivo)}: ${num(d.kg, 1)} kg`;
  } else if (r.tipo === "siembras") {
    titulo = "Siembra";
    const cant = d.plantines ? `${num(d.plantines)} plantines`
      : (d.sector ? `${esc(d.sector)}${d.bancal || ""}` : "");
    detalle = [esc(d.cultivo), d.generacion ? "G" + d.generacion : "", esc(d.tipo), cant]
      .filter(Boolean).join(" · ");
  } else if (r.tipo === "tareas") {
    titulo = "Tarea";
    detalle = esc(d.tarea);
  } else if (r.tipo === "tareas_hecha") {
    titulo = "Tarea hecha";
    detalle = "";
  } else if (r.tipo === "sugerencia") {
    titulo = "Sugerencia";
    detalle = esc((d.texto || "").slice(0, 60));
  } else {
    return "";        // config y demás: no son movimientos, no se listan
  }

  return `<div class="registro">
    <div><div class="detalle">${[titulo, detalle].filter(Boolean).join(" — ")}</div>
      <div class="cuando">${fechaCorta(d.fecha || d.hecha_el || "")}</div></div>
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
     tareas: prepararTareas, inicio: prepararInicio, ajustes: prepararAjustes,
     configuracion: prepararConfiguracion, plan: prepararInicio
   }[vista] || (() => {}))();

  prepararComunes();

  // Las secciones de registro muestran lo último de toda la chacra.
  if (["siembras", "cosechas", "horas"].includes(vista)) traerUltimos(vista);

  // Si la sección quedó fuera de la vista en la barra deslizable, se la acerca.
  const activa = document.querySelector(".tabs-medio .tab.activa");
  if (activa) activa.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
}

// Botones que pueden aparecer en cualquier vista.
function prepararComunes() {
  document.querySelectorAll(".chip-chacra").forEach((b) => {
    b.onclick = async () => {
      escribir(LS.chacra, b.dataset.chacra);
      CFG = null;
      escribir(LS.config, null);
      configConfirmada = false;
      escribir(LS.configLeida, false);
      refrescarEstado();

      // Primero se busca lo que la chacra ya tenga cargado. Recién después se
      // decide qué mostrar: si ya está configurada, el inicio; si no, Config.
      // Cada chacra tiene su propio acceso: al cambiar, hay que canjear de nuevo.
      escribir(LS.credencial, "");
      render("inicio");     // muestra la pantalla del código
    };
  });
  const irConfig = $("#btn-ir-config");
  if (irConfig) irConfig.onclick = () => render("configuracion");

  // ---- canje del código de invitación
  const fc = $("#form-canje");
  if (fc) {
    fc.onsubmit = async (e) => {
      e.preventDefault();
      const codigo = fc.codigo.value.trim().toUpperCase();
      const persona = fc.persona.value.trim();
      if (!codigo || !persona) return aviso("Completá el código y tu nombre.", true);
      if (!navigator.onLine) return aviso("Para activar el teléfono hace falta señal.", true);

      const boton = fc.querySelector("button");
      boton.disabled = true;
      boton.textContent = "Activando…";
      try {
        const d = await canjearCodigo(codigo, persona);
        if (!d.ok) {
          aviso(d.error || "No se pudo activar.", true);
          boton.disabled = false;
          boton.textContent = "Activar este teléfono";
          return;
        }
        escribir(LS.nombre, persona);
        aviso(`¡Listo, ${persona}! Este teléfono ya puede cargar ✓`);
        configConfirmada = false;
        escribir(LS.configLeida, false);
        await traerConfig();
        render(hayConfig() ? "inicio" : "configuracion");
        sincronizar();
      } catch {
        aviso("No se pudo conectar. Revisá la señal.", true);
        boton.disabled = false;
        boton.textContent = "Activar este teléfono";
      }
    };
  }

  const otraChacra = $("#volver-a-chacra");
  if (otraChacra) {
    otraChacra.onclick = (e) => {
      e.preventDefault();
      escribir(LS.chacra, "");
      render("inicio");
    };
  }
}

function prepararInicio() {
  const b = $("#btn-enviar");
  if (b) b.onclick = () => sincronizar(false);

  const f = $("#form-sugerencia");
  if (f) {
    f.onsubmit = (e) => {
      e.preventDefault();
      const texto = f.texto.value.trim();
      if (texto.length < 5) return aviso("Contame un poco más, así se entiende.", true);
      guardarRegistro("sugerencia", {
        texto,
        quien: leer(LS.nombre, ""),
        fecha: hoy(),
      }, "¡Gracias! Tu sugerencia va en camino ✓");
      f.texto.value = "";
    };
  }
}

function prepararSiembras() {
  const f = $("#form-siembras");
  // Si el teléfono todavía no está activado, la vista muestra la tarjeta
  // del código y este formulario no existe.
  if (!f) return;
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

// ---- Configuración de la chacra ----
// Se guarda entera cada vez: la app manda la configuración completa y el
// servicio reescribe la hoja Config. Así no hay estados a medias.
function guardarConfig(cambios, mensaje = "Configuración guardada ✓") {
  // Red de seguridad: guardar reescribe la hoja Config entera. Si todavía no
  // pudimos leer lo que la chacra tenía cargado, guardar borraría sus datos.
  if (!configConfirmada) {
    return aviso("Esperá: todavía no pude leer la configuración de la chacra.", true);
  }
  CFG = Object.assign({
    nombre: chacraActual()?.nombre || "", temporada: {}, bancal: {},
    sectores: [], integrantes: [], areas: [], plan: [],
  }, CFG || {}, cambios);
  escribir(LS.config, CFG);
  guardarRegistro("config", CFG, mensaje);
  render("configuracion");
}

function prepararConfiguracion() {
  const reintentar = $("#btn-reintentar-config");
  if (reintentar) {
    reintentar.onclick = async () => {
      await traerConfig();
      render("configuracion");
      if (!configConfirmada) aviso("Sigo sin poder leerla. Revisá la señal.", true);
    };
  }
  const general = $("#form-config-general");
  if (!general) return;

  const calculoBancal = $("#calculo-bancal");
  const verBancal = () => {
    const m2 = aNumero(general.largo.value) * aNumero(general.ancho.value);
    calculoBancal.innerHTML = m2 > 0
      ? `Cada bancal mide <b>${num(m2, 1)} m²</b>`
      : "Cargá largo y ancho para ver la superficie del bancal.";
  };
  general.addEventListener("input", verBancal);
  verBancal();

  general.onsubmit = (e) => {
    e.preventDefault();
    guardarConfig({
      nombre: general.nombre.value.trim(),
      temporada: { nombre: general.temporada.value.trim(), inicio: general.inicio.value, fin: "" },
      bancal: {
        largo_m: aNumero(general.largo.value) || 0,
        ancho_m: aNumero(general.ancho.value) || 0,
        pasillo_m: aNumero(general.pasillo.value) || 0,
        n_bancales: (CFG?.sectores || []).reduce((a, s) => a + (s.bancales || 0), 0),
      },
    });
  };

  // ---- sectores (agregar y editar)
  const fSector = $("#form-sector");
  let editandoSector = -1;

  const salirDeSector = () => {
    fSector.reset();
    editandoSector = -1;
    $("#titulo-sector").innerHTML = "";
    $("#btn-sector").textContent = "Agregar sector";
    $("#btn-cancelar-sector").hidden = true;
  };
  $("#btn-cancelar-sector").onclick = salirDeSector;

  fSector.onsubmit = (e) => {
    e.preventDefault();
    // El nombre queda como lo escriben: puede ser "A", "3" o "Verano".
    const nombre = fSector.sector.value.trim();
    if (!nombre) return aviso("Ponele un nombre al sector.", true);
    const secs = [...(CFG?.sectores || [])];
    const repetido = secs.findIndex((s) =>
      s.sector.toLowerCase() === nombre.toLowerCase());
    if (repetido !== -1 && repetido !== editandoSector) {
      return aviso(`Ya hay un sector que se llama ${nombre}.`, true);
    }

    const datos = { sector: nombre, bancales: parseInt(fSector.bancales.value, 10) || 1,
                    tipo_riego: fSector.tipo_riego.value };
    let mensaje;
    if (editandoSector >= 0) {
      const antes = secs[editandoSector].sector;
      secs[editandoSector] = datos;
      mensaje = `${antes === nombre ? nombre : `${antes} → ${nombre}`} actualizado ✓`;
    } else {
      secs.push(datos);
      mensaje = `${nombre} agregado ✓`;
    }
    secs.sort((a, b) => a.sector.localeCompare(b.sector, "es", { numeric: true }));
    guardarConfig({ sectores: secs, bancal: Object.assign({}, CFG?.bancal,
      { n_bancales: secs.reduce((a, s) => a + s.bancales, 0) }) }, mensaje);
  };

  document.querySelectorAll("[data-editar-sector]").forEach((b) => {
    b.onclick = () => {
      const i = Number(b.dataset.editarSector);
      const s = (CFG.sectores || [])[i];
      if (!s) return;
      editandoSector = i;
      fSector.sector.value = s.sector;
      fSector.bancales.value = s.bancales;
      fSector.tipo_riego.value = s.tipo_riego || tiposRiego()[0];
      $("#titulo-sector").innerHTML = `<div class="editando">Editando <b>${esc(s.sector)}</b></div>`;
      $("#btn-sector").textContent = "Guardar cambios";
      $("#btn-cancelar-sector").hidden = false;
      fSector.scrollIntoView({ behavior: "smooth", block: "center" });
    };
  });

  // ---- áreas propias de la chacra
  const fArea = $("#form-area");
  fArea.onsubmit = (e) => {
    e.preventDefault();
    const nombre = fArea.nombre.value.trim();
    if (!nombre) return aviso("Ponele un nombre al área.", true);
    // Se compara sin tildes ni mayúsculas: sin esto "Horticola" entraría como
    // un área nueva al lado de "Hortícola" y las horas quedarían partidas.
    if (esAreaFija(nombre)) {
      return aviso(`${nombre} ya viene con la app.`, true);
    }
    const lista = [...areasPropias()];
    if (lista.some((a) => claveArea(a.nombre) === claveArea(nombre))) {
      return aviso(`Ya hay un área que se llama ${nombre}.`, true);
    }
    lista.push({
      nombre, estado: fArea.estado.value,
      actividades: fArea.actividades.value.split(",")
        .map((a) => a.trim()).filter(Boolean),
    });
    guardarConfig({ areas: lista }, `${nombre} agregada ✓`);
  };

  // ---- integrantes
  const fInt = $("#form-integrante");
  fInt.onsubmit = (e) => {
    e.preventDefault();
    const nombre = fInt.nombre.value.trim();
    if (!nombre) return;
    const equipo = [...(CFG?.integrantes || [])];
    if (equipo.includes(nombre)) return aviso(`${nombre} ya está en la lista.`, true);
    equipo.push(nombre);
    guardarConfig({ integrantes: equipo }, `${nombre} agregado ✓`);
  };

  // ---- plan de cultivos
  const fPlan = $("#form-plan");
  enlazarBuscadores(fPlan);
  const calculoPlan = $("#calculo-plan");
  const buscaCultivo = fPlan.querySelector(".buscador-texto");

  // Al elegir un cultivo se traen los valores del catálogo, salvo que ya esté en
  // el plan con los suyos propios.
  const cargarValoresDe = (cultivo) => {
    const p = perfil(cultivo);
    const yaEsta = enPlan(cultivo);
    // Si el cultivo ya estaba planificado sin rinde propio (planes viejos), se
    // deduce de lo que se planificó: kg esperados sobre los metros.
    const rindeDelPlan = yaEsta?.rinde_kg_m2 ||
      (yaEsta?.superficie_m2 ? yaEsta.cosecha_esperada_kg / yaEsta.superficie_m2 : 0);
    fPlan.rinde.value = redondear(rindeDelPlan || p.rinde_ref_kg_m2 || "");
    fPlan.lineas.value = yaEsta?.lineas || p.lineas_bancal || "";
    fPlan.distancia.value = yaEsta?.distancia_cm || p.distancia_cm || "";
  };
  const redondear = (v) => (v ? String(Math.round(v * 1000) / 1000) : "");

  const verPlan = () => {
    const cultivo = fPlan.cultivo.value;
    const b = bancalM2();
    const bancales = aNumero(fPlan.bancales.value) || 0;
    const rinde = aNumero(fPlan.rinde.value) || 0;
    const sup = bancales * b;
    const plantas = plantasDe({ bancales, lineas: parseInt(fPlan.lineas.value, 10) || 0,
                                distancia_cm: aNumero(fPlan.distancia.value) || 0 });
    const ref = perfil(cultivo).rinde_ref_kg_m2 || 0;

    if (!cultivo || !bancales) {
      calculoPlan.innerHTML = "Elegí el cultivo y cuántos bancales para ver los números.";
      return;
    }
    const partes = [`<b>${num(sup)} m²</b>`];
    if (rinde) partes.push(`esperados: <b>${num(sup * rinde)} kg</b> a ${num(rinde, 2)} kg/m²`);
    if (plantas) partes.push(`<b>${num(plantas)}</b> plantas`);
    const p = perfil(cultivo);
    if (p.dias_a_cosecha) partes.push(`${p.dias_a_cosecha} días a cosecha`);
    calculoPlan.innerHTML = partes.join(" · ") +
      (ref && Math.abs(ref - rinde) > 0.005
        ? `<div class="nota" style="margin-top:4px">La referencia del catálogo para
           ${esc(cultivo)} es ${num(ref, 2)} kg/m².</div>` : "");
  };

  // Al cambiar de cultivo se recargan rinde, líneas y distancia.
  let ultimoCultivo = "";
  fPlan.addEventListener("change", () => {
    if (fPlan.cultivo.value && fPlan.cultivo.value !== ultimoCultivo) {
      ultimoCultivo = fPlan.cultivo.value;
      cargarValoresDe(ultimoCultivo);
    }
    verPlan();
  });
  fPlan.addEventListener("input", verPlan);
  verPlan();

  const salirDeEdicion = () => {
    fPlan.reset();
    ultimoCultivo = "";
    buscaCultivo.value = "";
    buscaCultivo.disabled = false;
    $("#titulo-plan").innerHTML = "";
    $("#btn-plan").textContent = "Agregar al plan";
    $("#btn-cancelar-plan").hidden = true;
    verPlan();
  };
  $("#btn-cancelar-plan").onclick = salirDeEdicion;

  fPlan.onsubmit = (e) => {
    e.preventDefault();
    const cultivo = fPlan.cultivo.value;
    if (!cultivo) return aviso("Elegí el cultivo.", true);
    const b = bancalM2();
    if (!b) return aviso("Primero cargá las medidas del bancal.", true);
    const bancales = aNumero(fPlan.bancales.value);
    if (!(bancales > 0)) return aviso("Los bancales tienen que ser más de cero.", true);

    const rinde = aNumero(fPlan.rinde.value) || 0;
    const lineas = parseInt(fPlan.lineas.value, 10) || 0;
    const distancia = aNumero(fPlan.distancia.value) || 0;
    const superficie = bancales * b;

    const plan = [...(CFG?.plan || [])].filter((p) => p.cultivo !== cultivo);
    plan.push({
      cultivo,
      superficie_m2: Math.round(superficie * 100) / 100,
      cosecha_esperada_kg: Math.round(superficie * rinde),
      rinde_kg_m2: rinde,
      lineas,
      distancia_cm: distancia,
      plantas: plantasDe({ bancales, lineas, distancia_cm: distancia }),
    });
    plan.sort((a, b) => a.cultivo.localeCompare(b.cultivo));
    guardarConfig({ plan }, `${cultivo}: ${num(bancales, 1)} bancales ✓`);
  };

  // ---- editar un cultivo del plan
  // Ojo: los sectores usan la misma clase pero otro atributo, así que se
  // seleccionan por el atributo y no por la clase.
  document.querySelectorAll("[data-editar]").forEach((b) => {
    b.onclick = () => {
      const p = (CFG.plan || [])[Number(b.dataset.editar)];
      if (!p) return;
      const m2 = bancalM2();
      fPlan.cultivo.value = p.cultivo;
      buscaCultivo.value = p.cultivo;
      buscaCultivo.disabled = true;          // editando no se cambia de cultivo
      ultimoCultivo = p.cultivo;
      fPlan.bancales.value = m2 ? String(Math.round((p.superficie_m2 / m2) * 100) / 100) : "";
      cargarValoresDe(p.cultivo);   // lo suyo, y lo que falte del catálogo
      $("#avanzado-plan").open = true;
      $("#titulo-plan").innerHTML = `<div class="editando">Editando <b>${esc(p.cultivo)}</b></div>`;
      $("#btn-plan").textContent = "Guardar cambios";
      $("#btn-cancelar-plan").hidden = false;
      verPlan();
      fPlan.scrollIntoView({ behavior: "smooth", block: "center" });
    };
  });

  // ---- quitar cosas
  document.querySelectorAll(".quitar").forEach((b) => {
    b.onclick = () => {
      if (b.dataset.sector !== undefined) {
        const secs = (CFG.sectores || []).filter((_, i) => i !== Number(b.dataset.sector));
        guardarConfig({ sectores: secs }, "Sector quitado");
      } else if (b.dataset.plan !== undefined) {
        const plan = (CFG.plan || []).filter((_, i) => i !== Number(b.dataset.plan));
        guardarConfig({ plan }, "Cultivo quitado del plan");
      } else if (b.dataset.area !== undefined) {
        const lista = areasPropias().filter((_, i) => i !== Number(b.dataset.area));
        guardarConfig({ areas: lista }, "Área quitada");
      } else if (b.dataset.integrante) {
        const equipo = (CFG.integrantes || []).filter((n) => n !== b.dataset.integrante);
        guardarConfig({ integrantes: equipo }, "Integrante quitado");
      }
    };
  });
}

// Trae del servicio la configuración de esta chacra.
async function traerConfig() {
  if (!chacraCodigo() || !navigator.onLine) return;
  try {
    const d = await (await fetch(
      `${urlServicio()}?${conCredenciales("config=1")}`)).json();
    if (!d.ok || !d.config) return;

    // Si hay cosas esperando enviarse, lo del teléfono es más nuevo: no se pisa.
    if (!pendientes.some((r) => r.tipo === "config")) {
      if (d.config.sectores?.length || d.config.plan?.length) {
        const t = d.config.temporada || {};
        t.inicio = aFechaISO(t.inicio);
        t.fin = aFechaISO(t.fin);
        CFG = d.config;
        escribir(LS.config, CFG);
      }
    }
    // Ya sabemos qué tenía la chacra: recién ahora es seguro guardar.
    const eraDesconocida = !configConfirmada;
    configConfirmada = true;
    escribir(LS.configLeida, true);
    if (eraDesconocida && vistaActual === "configuracion") render("configuracion");
  } catch { /* sin conexión: se usa la última configuración guardada */ }
}

// ---- Tareas ----
// Se juntan las que ya están en la planilla con las que se cargaron en este
// teléfono y todavía no viajaron, y se aplican las marcas de "hecha" que están
// esperando. Así la lista se ve al día aunque no haya señal.
function tareasParaMostrar() {
  const deLaPlanilla = leer(LS.tareas, []);
  const nuevasLocales = pendientes.filter((r) => r.tipo === "tareas")
    .map((r) => ({ ...r.datos, id: r.id, sinEnviar: true }));
  // La cola se recorre en orden: si alguien marcó, se arrepintió y volvió a
  // marcar, vale lo último que hizo.
  const estadoLocal = {};
  pendientes.forEach((r) => {
    if (r.tipo === "tareas_hecha") estadoLocal[r.datos.tarea_id] = true;
    else if (r.tipo === "tareas_reabrir") estadoLocal[r.datos.tarea_id] = false;
  });

  const todas = [...nuevasLocales, ...deLaPlanilla]
    .filter((t, i, arr) => arr.findIndex((o) => o.id === t.id) === i)
    .map((t) => ({
      ...t,
      hecha: t.id in estadoLocal ? estadoLocal[t.id] : t.hecha,
    }));

  const peso = { Alta: 0, Media: 1, Baja: 2 };
  return todas.sort((a, b) =>
    (a.fecha || "").localeCompare(b.fecha || "") ||
    (peso[a.importancia] ?? 1) - (peso[b.importancia] ?? 1));
}

// Una tarjeta por área: cómo viene de tareas y cuántas horas se le
// dedicaron. Es la respuesta a "¿cuánto nos llevó la plantinera?".
function tarjetasDeAreas(tareas) {
  const horas = horasPorArea();
  // El área de una tarea puede venir con otra escritura que la de la lista, así
  // que se compara igual que en todos lados: sin tildes ni mayúsculas.
  const areaDe = (t) => t.area || t.proyecto || "";
  const sinArea = tareas.filter((t) => !areaDe(t) && !t.hecha).length;

  return areas().map((a) => {
    const suyas = tareas.filter((t) => claveArea(areaDe(t)) === claveArea(a.nombre));
    const pend = suyas.filter((t) => !t.hecha && t.estado !== "En curso").length;
    const curso = suyas.filter((t) => !t.hecha && t.estado === "En curso").length;
    const listas = suyas.filter((t) => t.hecha).length;
    const hs = horas[a.nombre] || 0;
    const pausada = (a.estado || "activo") !== "activo";

    // Un área fija sin nada cargado no aporta nada a la vista: se muestra solo
    // si tiene tareas u horas. Las seis están siempre para elegir igual.
    if (!suyas.length && !hs && esAreaFija(a.nombre)) return "";

    return `<div class="tarjeta proyecto${pausada ? " pausado" : ""}">
      <h2>${esc(a.nombre)} <small>${esAreaFija(a.nombre) ? "" : "propia"}${
        pausada ? " · " + esc(a.estado) : ""}</small></h2>
      <div class="cifras">
        ${cifraClara(pend, "pendientes")}
        ${cifraClara(curso, "en curso")}
        ${cifraClara(listas, "hechas")}
      </div>
      <p class="nota" style="margin-top:8px">
        ${hs ? `<b>${num(hs, 1)} horas</b> cargadas` : "Sin horas cargadas todavía"}
      </p>
      ${suyas.filter((t) => !t.hecha).slice(0, 4).map(filaTarea).join("")}
    </div>`;
  }).join("") + (sinArea ? `<div class="tarjeta">
    <h2>Sin área <small>${sinArea}</small></h2>
    ${tareas.filter((t) => !areaDe(t) && !t.hecha).map(filaTarea).join("")}
  </div>` : "");
}

// El total de la temporada lo suma el servidor leyendo la planilla entera: acá
// solo se le agregan las horas que todavía están en la cola sin viajar.
function horasPorArea() {
  const total = Object.assign({}, resumen?.horas_por_area || resumen?.horas_por_proyecto || {});
  pendientes.filter((r) => r.tipo === "horas").forEach((r) => {
    const p = r.datos.area || r.datos.proyecto || "Sin área";
    total[p] = (total[p] || 0) + (Number(r.datos.horas) || 0);
  });
  return total;
}

function filaTarea(t) {
  const vencida = !t.hecha && t.fecha && t.fecha < hoy();
  const cuando = t.fecha === hoy() ? "hoy" : fechaCorta(t.fecha);
  const meta = [
    `<span class="punto-imp imp-${esc(t.importancia || "Media")}"></span>${esc(t.importancia || "Media")}`,
    vencida ? `atrasada desde el ${cuando}` : `para ${cuando}`,
    (t.proyecto ? esc(t.proyecto) : ""),
    (t.estado === "En curso" ? "<b>en curso</b>" : ""),
    (t.asignada ? `la toma ${esc(t.asignada)}` : ""),
    (t.personas > 1 ? `${t.personas} personas` : ""),
    (t.hecha && t.hecha_por ? `hecha por ${esc(t.hecha_por)}` : ""),
    (t.sinEnviar ? "sin enviar" : ""),
  ].filter(Boolean).join(" · ");

  return `<div class="tarea${t.hecha ? " lista" : ""}${vencida ? " vencida" : ""}">
    <button class="tarea-check${t.hecha ? " hecha" : ""}" data-tarea="${esc(t.id)}"
            data-hecha="${t.hecha ? "1" : ""}"
            aria-label="${t.hecha ? "Volver a pendiente" : "Marcar como hecha"}"
            title="${t.hecha ? "Tocá para volverla a pendiente" : "Marcar como hecha"}"
            >${t.hecha ? "&#10003;" : ""}</button>
    <div class="tarea-texto">
      <div class="titulo">${esc(t.tarea)}</div>
      <div class="tarea-meta">${meta}</div>
    </div>
  </div>`;
}

function prepararTareas() {
  const f = $("#form-tareas");
  // Si el teléfono todavía no está activado, la vista muestra la tarjeta
  // del código y este formulario no existe.
  if (!f) return;
  f.onsubmit = (e) => {
    e.preventDefault();
    const texto = f.tarea.value.trim();
    if (!texto) return aviso("Escribí qué hay que hacer.", true);
    escribir(LS.nombre, f.creada_por.value);
    guardarRegistro("tareas", {
      tarea: texto,
      area: f.area.value,
      fecha: f.fecha.value,
      importancia: f.querySelector("input[name=importancia]:checked").value,
      personas: parseInt(f.personas.value, 10) || 1,
      creada_por: f.creada_por.value,
      asignada: f.asignada.value,
      estado: "Pendiente",
      hecha: false,
    });
    render("tareas");
  };

  document.querySelectorAll("[data-vista-tareas]").forEach((b) => {
    b.onclick = () => { vistaTareas = b.dataset.vistaTareas; render("tareas"); };
  });

  document.querySelectorAll(".tarea-check").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.tarea;
      if (b.dataset.hecha) {
        // Se arrepintió: la tarea vuelve a estar pendiente. Si la marca de
        // hecha todavía no viajó, alcanza con sacarla de la cola.
        const esperando = pendientes.some((r) => r.tipo === "tareas_hecha" && r.datos.tarea_id === id);
        if (esperando) {
          pendientes = pendientes.filter(
            (r) => !(r.tipo === "tareas_hecha" && r.datos.tarea_id === id));
          escribir(LS.pendientes, pendientes);
          refrescarEstado();
          aviso("Volvió a pendiente");
        } else {
          guardarRegistro("tareas_reabrir", { tarea_id: id }, "Volvió a pendiente");
        }
      } else {
        const esperaReabrir = pendientes.some(
          (r) => r.tipo === "tareas_reabrir" && r.datos.tarea_id === id);
        if (esperaReabrir) {
          pendientes = pendientes.filter(
            (r) => !(r.tipo === "tareas_reabrir" && r.datos.tarea_id === id));
          escribir(LS.pendientes, pendientes);
          refrescarEstado();
          aviso("Marcada como hecha");
        } else {
          guardarRegistro("tareas_hecha", {
            tarea_id: id, hecha_el: hoy(), hecha_por: leer(LS.nombre, ""),
          });
        }
      }
      render("tareas");
    };
  });
}

// Trae del servicio la lista de tareas del equipo.
async function traerTareas() {
  if (!navigator.onLine) return;
  try {
    const d = await (await fetch(
      `${urlServicio()}?${conCredenciales("tareas=1")}`)).json();
    if (Array.isArray(d.tareas)) escribir(LS.tareas, d.tareas);
  } catch { /* sin conexión: se usa la última lista guardada */ }
}

function prepararHoras() {
  const f = $("#form-horas");
  if (f) {
    // La lista de actividades cambia con el área: se rearma cada vez.
    const bloque = $("#bloque-actividad");
    const verActividades = () => {
      const lista = actividadesDe(f.area.value);
      bloque.hidden = !lista.length;
      f.actividad.innerHTML = lista.length
        ? `<option value="">Sin especificar</option>` +
          lista.map((a) => `<option>${esc(a)}</option>`).join("")
        : "";
    };
    f.area?.addEventListener("change", verActividades);
    verActividades();
  }
  // Si el teléfono todavía no está activado, la vista muestra la tarjeta
  // del código y este formulario no existe.
  if (!f) return;
  f.onsubmit = (e) => {
    e.preventDefault();
    const horas = aNumero(f.horas.value);
    if (!(horas > 0 && horas <= 24)) return aviso("Las horas deben ser un número entre 0 y 24.", true);
    if (!f.area.value) return aviso("Elegí el área.", true);
    // El nombre elegido queda como el de este teléfono: la próxima vez viene puesto.
    escribir(LS.nombre, f.integrante.value);
    guardarRegistro("horas", {
      fecha: f.fecha.value,
      integrante: f.integrante.value,
      horas,
      area: f.area.value,
      actividad: f.actividad ? f.actividad.value : "",
      observaciones: f.observaciones.value.trim(),
    });
    render("horas");
  };
}

function prepararCosechas() {
  const f = $("#form-cosechas");
  // Si el teléfono todavía no está activado, la vista muestra la tarjeta
  // del código y este formulario no existe.
  if (!f) return;
  const calculo = $("#calculo-cosecha");
  const renglones = $("#renglones-cosecha");
  let proximo = 1;

  enlazarBuscadores(f);

  // Lee los renglones cargados: cada uno es un cultivo con sus kilos.
  const leerRenglones = () => [...renglones.querySelectorAll(".renglon-cosecha")]
    .map((div) => {
      const i = div.dataset.renglon;
      return { cultivo: f["cultivo_" + i]?.value || "", kg: aNumero(f["kg_" + i]?.value) || 0 };
    })
    .filter((r) => r.cultivo || r.kg);

  const actualizar = () => {
    const cargados = leerRenglones().filter((r) => r.cultivo && r.kg > 0);
    if (!cargados.length) {
      calculo.innerHTML = "Cargá el cultivo y los kilos. Con el + sumás más cultivos.";
      return;
    }
    const total = cargados.reduce((a, r) => a + r.kg, 0);
    const detalle = cargados.map((r) => {
      const plan = enPlan(r.cultivo);
      if (!plan?.cosecha_esperada_kg) return `${esc(r.cultivo)} ${num(r.kg, 1)} kg`;
      return `${esc(r.cultivo)} ${num(r.kg, 1)} kg (${num((r.kg / plan.cosecha_esperada_kg) * 100, 1)}% de lo esperado)`;
    }).join(" · ");
    calculo.innerHTML = `<b>${num(total, 1)} kg</b> en ${cargados.length} cultivo(s)
      <div class="nota" style="margin-top:4px">${detalle}</div>`;
  };

  f.addEventListener("input", actualizar);
  f.addEventListener("change", actualizar);
  actualizar();

  const engancharQuitar = () => {
    renglones.querySelectorAll("[data-quitar-renglon]").forEach((b) => {
      b.onclick = () => {
        b.closest(".renglon-cosecha").remove();
        actualizar();
      };
    });
  };
  engancharQuitar();

  $("#btn-mas-cultivo").onclick = () => {
    renglones.insertAdjacentHTML("beforeend", renglonCosecha(proximo++));
    enlazarBuscadores(f);          // enciende solo el buscador nuevo
    engancharQuitar();
    actualizar();
    renglones.lastElementChild.querySelector(".buscador-texto").focus();
  };

  f.onsubmit = (e) => {
    e.preventDefault();
    const cargados = leerRenglones();
    if (!cargados.length) return aviso("Cargá al menos un cultivo con sus kilos.", true);

    const incompleto = cargados.find((r) => !r.cultivo || !(r.kg > 0));
    if (incompleto) {
      return aviso(incompleto.cultivo
        ? `Faltan los kilos de ${incompleto.cultivo}.`
        : "Hay un renglón sin cultivo elegido.", true);
    }
    // Un mismo cultivo dos veces sería confuso al analizar: se suma.
    const porCultivo = {};
    cargados.forEach((r) => { porCultivo[r.cultivo] = (porCultivo[r.cultivo] || 0) + r.kg; });

    if (f.operador.value && !leer(LS.nombre, "")) escribir(LS.nombre, f.operador.value);
    // Una fila por cultivo, todas con la misma fecha y la misma persona.
    Object.entries(porCultivo).forEach(([cultivo, kg]) => {
      guardarRegistro("cosechas", {
        fecha: f.fecha.value,
        cultivo,
        kg: Math.round(kg * 100) / 100,
        operador: f.operador.value,
      }, `Cosecha guardada: ${Object.keys(porCultivo).length} cultivo(s) ✓`);
    });
    render("inicio");
  };
}

function prepararAjustes() {
  const esScript = (u) => !u || u.startsWith("https://script.google.com/");

  $("#btn-guardar-ajustes").onclick = () => {
    const nuevaChacra = $("#aj-chacra").value;
    if (nuevaChacra && nuevaChacra !== chacraCodigo()) {
      escribir(LS.chacra, nuevaChacra);
      CFG = null;
      escribir(LS.config, null);
      configConfirmada = false;
      escribir(LS.configLeida, false);
      escribir(LS.tareas, []);
      resumen = null;
      escribir(LS.resumen, null);
    }
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

  const desvincular = $("#btn-desvincular");
  if (desvincular) {
    desvincular.onclick = () => {
      if (!confirm("¿Desvincular este teléfono? Vas a necesitar un código nuevo para volver a activarlo.")) return;
      escribir(LS.credencial, "");
      aviso("Teléfono desvinculado. Pedí un código para activarlo de nuevo.");
      render("inicio");
    };
  }

  $("#btn-probar").onclick = async () => {
    const partes = [];
    try {
      const d = await (await fetch(urlHoras())).json();
      partes.push(Array.isArray(d.nombres) ? `horas ✓ (${d.nombres.length} integrantes)` : "horas ✓");
    } catch { partes.push("horas ✗"); }

    try {
      const d = await (await fetch(urlServicio())).json();
      partes.push(d.ok ? "siembras y tareas ✓" : "siembras y tareas ✗");
    } catch { partes.push("siembras y tareas ✗"); }

    const hayFalla = partes.some((p) => p.includes("✗"));
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
  // El catálogo es igual para todas las chacras y viaja con la app.
  try {
    const r = await fetch("catalogo.json", { cache: "no-cache" });
    if (r.ok) CAT = await r.json();
  } catch { /* sin catálogo la app igual arranca, con las listas vacías */ }

  render(chacraActual() ? "inicio" : "inicio");
  refrescarEstado();
  if (horasVanAparte()) await traerDatosHoras();   // nombres del equipo del proyecto
  await traerConfig();
  if (["inicio", "plan"].includes(vistaActual)) render(vistaActual);
  sincronizar();
})();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
