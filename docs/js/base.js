// js/base.js          — AMA Producción
//
// Núcleo: constantes, almacenamiento en el teléfono (LS, leer, escribir), el
// estado global de la app, el acceso (credencial) y las utilidades de fechas,
// números y texto. Todo lo demás depende de esto: va primero.
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos. Se partió app.js el 30/09/2026 sin cambiar código.

// ==========================================================
// AMA Producción — Aplicaciones para el Manejo Agroecológico, desde el celular.
// El nombre interno sigue siendo monagric: las claves de almacenamiento, la
// direccion del repositorio y las planillas no se tocan, porque cambiarlas le
// borraria a cada telefono su credencial y lo que tenga sin enviar.
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
// Se muestra en Ajustes: sirve para saber por telefono si alguien quedo con
// una copia vieja, que es dificil de adivinar de otro modo.
const VERSION_APP = "versión 77 · 7/10/2026";

const CHACRAS = [
  { codigo: "tica", nombre: "Chacra Tica", horasAparte: true },
  { codigo: "milpa", nombre: "La Milpa" },
  { codigo: "focoverde", nombre: "Foco Verde" },
  { codigo: "huerma", nombre: "Huerma" },
  { codigo: "huertota", nombre: "La Huertota" },
  { codigo: "tierralinda", nombre: "Tierra Linda" },
];

// Los tipos que nacen en bandeja: el formulario pide bandejas en vez de bancal.
const EN_BANDEJA = new Set(["Siembra almácigo", "Esqueje"]);

// Las horas de Tica van a la planilla de horas de Bioma, donde está el
// historial desde julio. Hasta el 30/09 el teléfono las mandaba directo a un
// script de esa planilla, sin credencial; ahora las escribe el servicio de AMA
// y ese script se archivó. La planilla misma, para el enlace "ver todo" de Horas en Tica. Abrirla pide
// tener permiso en Drive: la dirección sola no da acceso a nada.
const PLANILLA_HORAS_BIOMA =
  "https://docs.google.com/spreadsheets/d/1tx8V0VLciiTLFvAmSViAR6KV9LL9hXzvX6-qy30Ubpg/edit";

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
  urlHoras: "monagric_url_horas",            // ya no se usa (script de horas archivado)
  resumen: "monagric_resumen",
  nombresPlanilla: "monagric_nombres_planilla",
  cuentas: "monagric_cuentas",
  cuentasError: "monagric_cuentas_error",
  catalogoExtra: "monagric_catalogo_extra",
  ultimasHoras: "monagric_ultimas_horas",    // ya no se usa (script de horas archivado)
  tareas: "monagric_tareas",
  ultimos: "monagric_ultimos",
  almacigos: "monagric_almacigos",
  modoCosecha: "monagric_modo_cosecha",
  planPlegado: "monagric_plan_plegado",
  fichas: "monagric_fichas",
  generaciones: "monagric_generaciones",
};

/* Lo leído mientras se dibuja una pantalla queda en memoria hasta que el
   dibujo termina (enMemoria, más abajo). Antes cada leer() volvía a sacar el
   texto del almacenamiento y a interpretarlo: el mapa, con 240 generaciones,
   leía el plan ~480 veces por dibujo —25 MB de texto, 116 ms en una
   notebook, varias veces eso en un teléfono— porque nombreGen() lo lee por
   defecto y se llama una vez por generación (01/10).

   Solo durante un dibujo, y se vacía si algo escribe: fuera de eso cada
   leer() devuelve una copia nueva, como siempre, y quien la modifica antes
   de guardarla (fichas, últimos) no le cambia nada a nadie. Que dibujar no
   modifique lo leído lo comprueba pruebas.html (VIGILAR_LECTURAS). */
let lecturasEnMemoria = null;
let VIGILAR_LECTURAS = false;
const AUSENTE = Symbol("ausente");
const leer = (k, def) => {
  if (lecturasEnMemoria && lecturasEnMemoria.has(k)) {
    const v = lecturasEnMemoria.get(k);
    return v === AUSENTE ? def : v;
  }
  let v;
  try { const crudo = localStorage.getItem(k); v = crudo === null ? AUSENTE : JSON.parse(crudo); }
  catch { v = AUSENTE; }
  if (lecturasEnMemoria) {
    if (VIGILAR_LECTURAS && v && typeof v === "object") v = vigilado(v, k);
    lecturasEnMemoria.set(k, v);
  }
  return v === AUSENTE ? def : v;
};
// Hace fn() con las lecturas en memoria. Si ya se estaba dentro de una, la
// comparte (un render que vuelve a dibujar desde adentro).
const enMemoria = (fn) => {
  if (lecturasEnMemoria) return fn();
  lecturasEnMemoria = new Map();
  try { return fn(); } finally { lecturasEnMemoria = null; }
};
// Solo para las pruebas: lo leído en memoria no se puede modificar. Si algún
// dibujo lo hiciera, la copia en memoria dejaría de ser igual a la guardada.
const vigilados = new WeakMap();
function vigilado(obj, k) {
  if (vigilados.has(obj)) return vigilados.get(obj);
  const error = () => { throw new Error(`Se modificó lo leído de ${k} mientras se dibujaba`); };
  const p = new Proxy(obj, {
    get: (t, prop) => { const x = t[prop]; return x && typeof x === "object" ? vigilado(x, k) : x; },
    set: error, deleteProperty: error, defineProperty: error,
  });
  vigilados.set(obj, p);
  return p;
}
// Si el almacenamiento del teléfono se llena (las fichas y el plan crecen), el
// error cortaba a mitad de camino lo que se estaba guardando. Ahora se avisa
// una vez y la app sigue: lo que no entra se vuelve a bajar del servicio.
let avisoLleno = false;
const escribir = (k, v) => {
  if (lecturasEnMemoria) lecturasEnMemoria.delete(k);
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {
    console.warn("No se pudo guardar en el teléfono:", k, e);
    if (!avisoLleno && typeof aviso === "function") {
      avisoLleno = true;
      aviso("El almacenamiento del teléfono está lleno: algunos datos no quedan guardados sin señal.", true);
    }
  }
};

let pendientes = leer(LS.pendientes, []);
let enviados = leer(LS.enviados, []);
let resumen = leer(LS.resumen, null);   // totales de la chacra (desde su planilla)
let CAT = null;                         // catálogo común (catalogo.json)
let CFG = leer(LS.config, null);        // configuración de esta chacra
let vistaActual = "inicio";
// De dónde se venía antes de entrar a Configuración, para poder volver ahí.
let vistaPrevia = "inicio";
// Qué cuenta de sueldos se está mirando. Vacío = la lista.
let cuentaAbierta = "";
// Qué cultivo del plan se está mirando en detalle. Vacío = el plan entero.
let cultivoAbierto = "";
// Lo que se eligió en "Para sembrar" y todavía no se cargó. Lleva el cultivo,
// la generación y la fecha al formulario de Siembras, para que tocar el aviso
// y registrar sea un solo movimiento. No marca nada como hecho: lo que marca
// hecho es la siembra guardada, y nada más.
let siembraSugerida = null;

// El plan estratégico: el calendario de barras de toda la temporada.
let vistaPlan = "lista";       // "lista", "grafico" o "planificar"
let ordenPlan = "cultivo";      // "cultivo" o "fecha"
let filtroPlan = "todas";       // "todas", "planificadas" o "sembradas"
let vistaTareas = "hoy";        // "hoy" o "areas"

// Dos maneras de cargar una cosecha, porque son dos situaciones distintas.
// "lista": se van eligiendo los cultivos de a uno, que sirve cuando se
// cosecharon tres o cuatro. "pizarra": todos los del plan de la temporada a la
// vista con su casillero, que sirve para pasar la lista entera de una jornada
// sin buscar cada nombre. Queda elegido en el teléfono: cada chacra trabaja
// distinto y no tiene sentido preguntarlo cada vez.
let modoCosecha = leer(LS.modoCosecha, "lista");

// Hasta no haber leído la configuración de la chacra en el servicio no se puede
// guardar nada: guardar reescribe la hoja Config entera, así que hacerlo con la
// configuración a medio cargar borraría lo que ya tenía la chacra.
// Si en este teléfono ya se leyó alguna vez, lo guardado sirve de base y se
// puede seguir editando sin señal.
let configConfirmada = leer(LS.configLeida, false);

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
// Solo Chacra Tica tiene sus horas en la planilla del proyecto Bioma, donde
// está el historial desde julio. Viajan con todo lo demás al servicio de AMA,
// que las escribe ahí. Las demás chacras las guardan en su propia hoja Horas.
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

// Días entre dos fechas ISO. Se usa mediodía para que un cambio de horario de
// verano no reste ni sume un día de más.
function diasEntre(desdeISO, hastaISO) {
  if (!desdeISO || !hastaISO) return null;
  const a = new Date(desdeISO + "T12:00:00"), b = new Date(hastaISO + "T12:00:00");
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

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

// Día y mes, sin año: es lo que entra dentro de una barra del plan.
const diaMes = (iso) => {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
};

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

const diaDe = (iso) => Math.floor(new Date(iso + "T00:00:00").getTime() / 86400000);

// Una fecha de JavaScript a "aaaa-mm-dd", que es como viajan todas acá.
const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  + `-${String(d.getDate()).padStart(2, "0")}`;

// El primer día de la temporada: el 1° de julio del año que corresponda. Sale
// de la fecha de inicio que cargó la chacra; si no está, se deduce de hoy.
function inicioDeTemporada() {
  const cargada = CFG?.temporada?.inicio;
  if (cargada && /^\d{4}-\d{2}/.test(cargada)) {
    const d = new Date(cargada + "T00:00:00");
    // Si arrancó en junio o antes, la temporada es la que empezó el julio
    // anterior; el campo guarda el día real de arranque, no el del calendario.
    const anio = d.getMonth() + 1 >= 7 ? d.getFullYear() : d.getFullYear() - 1;
    return new Date(anio, 6, 1);
  }
  const h = new Date();
  return new Date(h.getMonth() + 1 >= 7 ? h.getFullYear() : h.getFullYear() - 1, 6, 1);
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun",
                      "jul", "ago", "sep", "oct", "nov", "dic"];

const pesos = (n) => {
  const v = Number(n) || 0;
  return "$" + Math.round(Math.abs(v)).toLocaleString("es-AR") ;
};
const conSigno = (n) => (Number(n) < 0 ? "-" : "") + pesos(n);
