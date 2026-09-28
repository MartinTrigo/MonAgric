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
const VERSION_APP = "versión 60 · 28/9/2026";

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
  cuentas: "monagric_cuentas",
  cuentasError: "monagric_cuentas_error",
  catalogoExtra: "monagric_catalogo_extra",
  ultimasHoras: "monagric_ultimas_horas",
  tareas: "monagric_tareas",
  ultimos: "monagric_ultimos",
  almacigos: "monagric_almacigos",
  modoCosecha: "monagric_modo_cosecha",
  planPlegado: "monagric_plan_plegado",
  fichas: "monagric_fichas",
  generaciones: "monagric_generaciones",
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

// Del catálogo común (igual para todas las chacras)
// Lo que aportaron las chacras se suma al catálogo base. Queda guardado para
// que la app siga conociendo esos cultivos sin señal: el base viaja con la
// app, pero un cultivo que cargó Huerma no.
const catalogoExtra = () => leer(LS.catalogoExtra, { cultivos: [], perfiles: {} });

// Cultivos que existen pero sin un solo dato agronómico. Vinieron así del
// catálogo viejo y quien los cultiva puede completarlos desde el teléfono.
const cultivoSinDatos = (nombre) => {
  const p = perfil(nombre);
  if (!Object.keys(p).length) return true;
  return !["dias_a_cosecha", "lineas_bancal", "distancia_cm", "rinde_ref_kg_m2"]
    .some((k) => Number(p[k]) > 0);
};
const cultivosPorCompletar = () => cultivosDisponibles().filter(cultivoSinDatos);

// Se juntan el catálogo base y lo aportado, descartando las formas repetidas
// del mismo nombre: gana la primera que aparece, que es la del catálogo base.
// Sin esto, alguien que completa "cilantro" en minúscula deja dos entradas en
// el desplegable y nadie sabe cuál elegir.
const cultivosDisponibles = () => {
  const vistos = new Map();
  [...(CAT?.cultivos || []), ...(catalogoExtra().cultivos || [])].forEach((c) => {
    const k = claveArea(c);
    if (k && !vistos.has(k)) vistos.set(k, c);
  });
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, "es"));
};

// Gana el aportado: si alguien cargó el perfil de un cultivo que estaba sin
// datos, eso es más nuevo que el catálogo base.
// El perfil que viene de la planilla completa al del catálogo base, pero no lo
// pisa con vacíos: una celda sin llenar quiere decir "no sé", no "cero". Sin
// esto, agregar una columna nueva a la planilla —que arranca vacía para los 38
// cultivos que ya estaban— borraría ese dato en todos los teléfonos.
const perfil = (cultivo) => {
  const base = (CAT?.perfiles || {})[cultivo] || {};
  const aportado = (catalogoExtra().perfiles || {})[cultivo] || {};
  const salida = Object.assign({}, base);
  Object.keys(aportado).forEach((k) => {
    const v = aportado[k];
    if (v === "" || v === null || v === undefined || v === 0) return;
    salida[k] = v;
  });
  return salida;
};

async function traerCatalogo() {
  if (!chacraCodigo() || !tieneAcceso() || !navigator.onLine) return;
  try {
    const d = await (await fetch(
      `${urlServicio()}?${conCredenciales("catalogo=1")}`)).json();
    if (d.ok && Array.isArray(d.cultivos)) {
      escribir(LS.catalogoExtra, { cultivos: d.cultivos, perfiles: d.perfiles || {} });
    }
  } catch { /* sin señal: queda lo último que se bajó */ }
}
const actividades = () => CAT?.actividades || [];
const tiposSiembra = () => CAT?.tipos_siembra || [];
const tiposBandeja = () => CAT?.tipos_bandeja || [72, 128];
const tiposRiego = () => CAT?.tipos_riego || ["Aspersión", "Goteo"];
const importancias = () => CAT?.importancias || ["Alta", "Media", "Baja"];

// De la configuración de esta chacra
const enPlan = (cultivo) => (CFG?.plan || []).find((p) => p.cultivo === cultivo);

// Los días que un cultivo pasa en la bandeja no son uno solo: en otoño-invierno
// tarda más que en primavera-verano, y la diferencia llega a 20 días (Albahaca
// 50 contra 30, Apio 60 contra 45). Usar el promedio se equivoca en las dos
// estaciones: en septiembre sugería trasplantar 6 días tarde en promedio, y el
// Hakusai sembrado en agosto tardó 42 días contra los 38 que estimaba.
//
// Se elige por el mes en que se sembró, que es cuando empieza a contar. De
// abril a septiembre manda el valor de invierno; de octubre a marzo, el de
// verano. Si el cultivo no tiene los dos valores, queda el de siempre.
function diasAlmacigo(cultivo, fecha) {
  const p = perfil(cultivo) || {};
  const mes = Number(String(fecha || hoy()).slice(5, 7)) || 0;
  const invierno = mes >= 4 && mes <= 9;
  const elegido = invierno ? p.dias_almacigo_oi : p.dias_almacigo_pv;
  return Number(elegido || p.dias_almacigo) || 0;
}

// Los dos extremos, para mostrar que la fecha es un rango y no un dato exacto.
function rangoAlmacigo(cultivo) {
  const p = perfil(cultivo) || {};
  const a = Number(p.dias_almacigo_pv) || 0;
  const b = Number(p.dias_almacigo_oi) || 0;
  return (a && b && a !== b) ? { min: Math.min(a, b), max: Math.max(a, b) } : null;
}

// ---- Trasplantes ----
// Cómo se acomodan las plantas dentro del bancal. En tresbolillo entran más
// plantas en la misma superficie, así que el dato cambia el calculo y no es
// decoración.
const DISPOSICIONES = ["En línea", "Tresbolillo"];

// Con cuánta anticipación se avisa que un almácigo va a estar en fecha.
// Diez días cubre la semana que viene, que es como se planifica el trabajo.
const DIAS_AVISO = 10;

// Las siembras de almácigo que todavía no se trasplantaron. Se cruzan las dos
// listas por el id de la siembra: lo que ya tiene trasplante sale de la lista.
// Se miran también las que esperan en la cola de este teléfono, para que un
// trasplante recién cargado no ofrezca de nuevo el mismo almácigo.
function almacigosPendientes() {
  const ultimos = leer(LS.ultimos, {});
  const yaHechos = new Set([
    ...(ultimos.trasplantes || []).map((f) => String(f["Siembra origen"] || "")),
    ...pendientes.concat(enviados).filter((r) => r.tipo === "trasplantes")
                 .map((r) => String(r.datos.siembra_id || "")),
  ].filter(Boolean));

  // El servicio manda los almácigos que esperan mirando la hoja entera. Hace
  // falta: "últimos" trae solo 15 siembras, y lo sembrado en agosto que se
  // trasplanta en septiembre ya quedó afuera de esa ventana. Si el servicio
  // todavía no la conoce, se cae a las últimas, que es lo que había antes.
  //
  // null es "todavía no contestó"; una lista vacía es "contestó que no hay
  // ninguno", y entonces hay que creerle en vez de volver a la ventana vieja.
  const delServicio = leer(LS.almacigos, null);
  const hayRespuesta = Array.isArray(delServicio);
  const fuente = hayRespuesta ? delServicio : (ultimos.siembras || []);

  const deLaPlanilla = fuente.map((f) => ({
    id: String(f.Id), cultivo: f.Cultivo, variedad: f.Variedad || "",
    generacion: Number(f["Generación"]) || 1, tipo: f.Tipo,
    plantines: Number(f.Plantines) || 0, fecha: f.Fecha,
    estimado: f["Trasplante estimado"] || "",
  }));
  const locales = pendientes.concat(enviados)
    .filter((r) => r.tipo === "siembras")
    .map((r) => ({
      id: String(r.id), cultivo: r.datos.cultivo, variedad: r.datos.variedad || "",
      generacion: Number(r.datos.generacion) || 1, tipo: r.datos.tipo,
      plantines: Number(r.datos.plantines) || 0, fecha: r.datos.fecha,
      estimado: r.datos.trasplante_estimado || "",
    }));

  const vistos = new Set();
  const lista = [...locales, ...deLaPlanilla]
    .filter((s) => /almácigo|almacigo/i.test(s.tipo || ""))
    .filter((s) => !yaHechos.has(s.id))
    .filter((s) => (vistos.has(s.id) ? false : vistos.add(s.id)))
    // Primero lo que hace más tiempo que espera: es lo que corre riesgo de
    // pasarse de punto en la bandeja.
    .sort((a, b) => String(a.estimado || a.fecha).localeCompare(String(b.estimado || b.fecha)))
    .map((s) => Object.assign(s, { etiqueta: etiquetaAlmacigo(s) }));
  // De dónde salió la lista, para que se vea en pantalla. Cuando faltaba un
  // almácigo de agosto no había ningún error: simplemente no estaba, y desde
  // afuera no se podía saber si el teléfono hablaba con el servicio o se había
  // quedado con las últimas siembras.
  lista.completa = hayRespuesta;
  lista.yaTrasplantados = yaHechos.size;
  return lista;
}

// Cuánto le falta o hace cuánto se pasó, según la fecha estimada. Es lo que
// convierte la lista en una sugerencia y no en un archivo: se ve de un vistazo
// qué hay que sacar de la bandeja esta semana.
function estadoAlmacigo(s) {
  const dias = diasEntre(hoy(), s.estimado);
  if (dias === null) return { texto: "sin fecha estimada", orden: 3, dias: null };
  if (dias < 0) return { texto: `atrasado ${Math.abs(dias)} días`, orden: 0, dias };
  if (dias === 0) return { texto: "es hoy", orden: 0, dias };
  if (dias <= DIAS_AVISO) return { texto: `en ${dias} días`, orden: 1, dias };
  return { texto: `para ${fechaCorta(s.estimado)}`, orden: 2, dias };
}

// Un renglon de destino: a que sector y a que bancal fue esta parte del
// almacigo. Se repite tantas veces como bancales se hayan plantado, porque
// cada bancal termina siendo una fila propia en la planilla.
function renglonBancal(i) {
  const secs = sectores();
  if (!secs.length) return "";
  return `<div class="renglon-bancal fila" data-renglon="${i}">
    <div>
      ${i === 0 ? "<label>Sector</label>" : ""}
      <select name="sector_${i}" data-sector>
        ${secs.map((s) => `<option value="${esc(s.sector)}">${esc(s.sector)} (${s.bancales})</option>`).join("")}
      </select>
    </div>
    <div>
      ${i === 0 ? "<label>Bancal</label>" : ""}
      <select name="bancal_${i}" data-bancal>${opcionesBancal(secs[0].sector)}</select>
    </div>
    ${i === 0 ? "" : `<button type="button" class="quitar" data-quitar-bancal
        aria-label="Quitar este bancal">&times;</button>`}
  </div>`;
}

function etiquetaAlmacigo(s) {
  const partes = [s.cultivo];
  if (s.variedad) partes.push(s.variedad);
  partes.push(`G${s.generacion}`);
  if (s.plantines) partes.push(`${num(s.plantines)} plantines`);
  return `${partes.join(" ")} · ${estadoAlmacigo(s).texto}`;
}

// Cuántas plantas entran en un bancal con ese marco. En tresbolillo las filas
// se intercalan y entra unas 15% más de plantas en la misma superficie.
function plantasPorBancal(lineas, distanciaCm, disposicion) {
  const largoCm = (CFG?.bancal?.largo_m || 0) * 100;
  if (!largoCm || !lineas || !distanciaCm) return 0;
  const porLinea = Math.floor(largoCm / distanciaCm);
  const total = porLinea * lineas;
  return disposicion === "Tresbolillo" ? Math.round(total * 1.15) : total;
}
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

// El plan por cultivo de la configuración sale de sus generaciones (decidido el
// 28/09): superficie = camas × m² del bancal, kilos = superficie × rinde. Se
// rehace cada vez que las generaciones cambian, así Inicio y la Proyección de
// AMA Economía no pueden quedar diciendo otra cosa que el plan estratégico.
// El rinde, las líneas y la distancia son decisiones del cultivo: se conservan.
// Sin generaciones, el cultivo sale del plan.
function replanearCultivo(cultivo, generaciones) {
  const m2 = bancalM2();
  if (!m2 || !CFG) return;
  const k = claveArea(cultivo);
  const ya = (CFG.plan || []).find((p) => claveArea(p.cultivo) === k) || {};
  const plan = (CFG.plan || []).filter((p) => claveArea(p.cultivo) !== k);
  const bancales = generaciones.filter((g) => claveArea(g.cultivo) === k)
    .reduce((a, g) => a + (Number(g.camas) || 0), 0);
  if (bancales) {
    const p = perfil(cultivo) || {};
    const superficie = Math.round(bancales * m2 * 100) / 100;
    const rinde = ya.rinde_kg_m2 || p.rinde_ref_kg_m2 || 0;
    const lineas = ya.lineas || p.lineas_bancal || 0;
    const distancia = ya.distancia_cm || p.distancia_cm || 0;
    plan.push({
      cultivo: ya.cultivo || cultivo, superficie_m2: superficie,
      cosecha_esperada_kg: Math.round(superficie * rinde),
      rinde_kg_m2: rinde, lineas, distancia_cm: distancia,
      plantas: plantasDe({ bancales, lineas, distancia_cm: distancia }),
    });
  }
  plan.sort((a, b) => a.cultivo.localeCompare(b.cultivo));
  guardarConfig({ plan }, "", "");
}

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
      // El servicio dice cuáles no pudo guardar. Esos quedan en la cola para
      // el próximo intento; borrarlos sería perderlos sin que nadie se enterara.
      const fallidos = new Set((datos.no_guardados || []).map((x) => String(x.id)));
      otros.forEach((r) => {
        if (fallidos.has(String(r.id))) fallaron.push(r);
        else enviadosAhora.push(r);
      });
      if (fallidos.size) {
        const primero = (datos.no_guardados || [])[0] || {};
        aviso(`${fallidos.size} registro(s) no se pudieron guardar. ${
          String(primero.error || "").slice(0, 80)}`, true);
      }
    } catch (e) {
      fallaron.push(...otros);
      if (!silencioso) aviso("No se pudo enviar: " + e.message, true);
    }
  }

  if (enviadosAhora.length) {
    // Lo recién enviado ya está en la planilla: se vuelve a pedir para que
    // aparezca en la lista de la chacra y no solo como "por enviar".
    const tipos = new Set(enviadosAhora.map((r) => r.tipo));
    ["siembras", "cosechas", "horas", "trasplantes", "tareas"]
      .filter((t) => tipos.has(t)).forEach((t) => traerUltimos(t, true));
    // Las generaciones tienen su propio pedido: el plan entero.
    if (tipos.has("generaciones") || tipos.has("generacion_borrar")) traerGeneraciones(true);
    // Un trasplante recién subido saca su almácigo de la lista de pendientes,
    // y una siembra nueva puede sumar uno: las dos cosas cambian esa lista.
    if (tipos.has("trasplantes") || tipos.has("siembras")) traerAlmacigos(true);
    const ids = new Set(enviadosAhora.map((r) => r.id));
    enviados = enviadosAhora.map((r) => ({ ...r, enviado_en: ahora() })).concat(enviados).slice(0, 60);
    pendientes = pendientes.filter((r) => !ids.has(r.id));
    escribir(LS.pendientes, pendientes);
    escribir(LS.enviados, enviados);
    if (!silencioso) aviso(`${enviadosAhora.length} registro(s) enviado(s) ✓`);
  } else if (!silencioso && fallaron.length) {
    aviso("No se pudo enviar. Revisá la señal y los Ajustes.", true);
  }

  await Promise.all([traerResumen(), traerDatosHoras(), traerTareas(),
                     traerConfig(), traerCatalogo()]);
  refrescarEstado();
  if (["inicio", "plan", "horas", "tareas"].includes(vistaActual)) redibujarConDatos(vistaActual);
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
  const otros = cultivosDisponibles().filter((c) => !delPlan.includes(c));
  return { lista: [...delPlan, ...otros], delPlan };
}

function buscadorCultivo(valor = "", nombre = "cultivo") {
  const { lista, delPlan } = cultivosOrdenados();
  return buscador(nombre, lista, {
    placeholder: "Elegí el cultivo (escribí para buscar)…",
    valor, destacadas: delPlan,
  });
}

// Los cultivos de la pizarra: los del plan de la temporada de esta chacra, que
// son los que se sembraron y por lo tanto los únicos que se pueden cosechar.
// No el catálogo entero: son 38 y la mayoría no los cultiva nadie acá.
const cultivosDelPlan = () => (CFG?.plan || [])
  .map((p) => p.cultivo)
  .filter(Boolean);

// Un renglón de pizarra: el nombre ya puesto y solo el casillero del número.
// Sin buscador, que es lo que hace lenta la carga cuando son veinte.
function renglonPizarra(cultivo, i) {
  return `<div class="renglon-pizarra">
    <label for="pz_${i}">${esc(cultivo)}</label>
    <input type="text" id="pz_${i}" name="pz_${i}" data-cultivo="${esc(cultivo)}"
           inputmode="decimal" autocomplete="off" placeholder="kg">
  </div>`;
}

// Un cultivo con sus kilos, en un solo renglón. Una cosecha de pizarra son
// veinte cultivos: con el formato anterior —dos etiquetas y dos campos apilados
// por cultivo— eran veinte pantallas de scroll. Acá cada uno ocupa una línea y
// los encabezados se escriben una sola vez, arriba de la lista.
function renglonCosecha(i, valor = "", kg = "") {
  return `<div class="renglon-cosecha" data-renglon="${i}">
    ${buscadorCultivo(valor, "cultivo_" + i)}
    <input type="text" name="kg_${i}" inputmode="decimal" autocomplete="off"
           value="${esc(kg)}" placeholder="kg" aria-label="Kilos cosechados">
    <button type="button" class="quitar" data-quitar-renglon="${i}"
            aria-label="Quitar este cultivo">&times;</button>
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
      // En un renglón de cosecha el paso siguiente es siempre el número, así
      // que el foco va solo: pasar una pizarra de veinte es escribir cultivo,
      // Enter, kilos, Enter, sin levantar la mano del teclado ni buscar el
      // campo con el dedo. Fuera de esos renglones no se toca el foco.
      const renglon = caja.closest(".renglon-cosecha");
      const kg = renglon?.querySelector("input[name^=kg_]");
      if (kg) setTimeout(() => kg.focus(), 0);
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

// Cada sector tiene su propia cantidad de bancales, asi que la lista se rearma
// al elegir sector. Antes salia siempre la del primero: en Chacra Tica eso
// dejaba elegir solo del 1 al 6 (los del Frutillar) en sectores de 25 bancales.
function opcionesBancal(sector, seleccionado = "") {
  const s = sectores().find((x) => x.sector === sector) || sectores()[0];
  const n = s ? s.bancales : 0;
  return Array.from({ length: n }, (_, i) => i + 1)
    .map((b) => `<option${String(b) === String(seleccionado) ? " selected" : ""}>${b}</option>`)
    .join("");
}

function camposSectorBancal(idPrefijo = "") {
  const secs = sectores();
  if (!secs.length) return "";
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
        ${opcionesBancal(secs[0].sector)}
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

    ${tarjetaSiembrasPendientes()}

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

  // El trasplante parte SIEMPRE de una siembra de almácigo ya cargada: así el
  // cultivo, la variedad y la generación no se vuelven a tipear (ni a tipear
  // distinto), y queda el vínculo que después permite calcular el rinde real
  // del bancal. Por eso lo primero que se elige es cuál almácigo se está
  // sacando de la bandeja.
  trasplantes() {
    if (!chacraActual()) return tarjetaElegirChacra();
    if (!tieneAcceso()) return tarjetaCanje();
    if (!hayConfig()) return tarjetaSinConfig();
    const yo = leer(LS.nombre, "");
    const pend = almacigosPendientes();

    // Si la lista salió de las últimas siembras y no del servicio, se dice:
    // faltan los almácigos viejos, que son justo los que hay que trasplantar.
    const origen = pend.completa ? "" : `<p class="nota alerta">Esta lista puede
      estar incompleta: el teléfono no pudo pedirle al servicio los almácigos
      que esperan, así que muestra solo los de las últimas siembras. Los
      sembrados hace más de un mes pueden faltar. Revisá la señal; si sigue
      igual, el Apps Script puede estar corriendo una versión anterior.</p>`;

    // Sin almácigos en la lista el formulario se muestra igual: se puede
    // trasplantar algo que no se cargó como siembra, o plantines comprados.
    const listos = pend.filter((s) => (estadoAlmacigo(s).dias ?? 99) <= 0);
    const pronto = pend.filter((s) => {
      const d = estadoAlmacigo(s).dias;
      return d !== null && d > 0 && d <= DIAS_AVISO;
    });

    return `
    ${listos.length || pronto.length ? `<div class="tarjeta">
      <h2>Para trasplantar</h2>
      <p class="nota">Según los días en almácigo de cada cultivo, contados desde
      que se sembró. Es una guía: manda lo que se ve en la bandeja.</p>
      ${listos.map((s) => `<div class="registro">
        <div><div class="detalle">${esc(s.cultivo)}${s.variedad ? " " + esc(s.variedad) : ""} · G${s.generacion}</div>
          <div class="cuando alerta">${esc(estadoAlmacigo(s).texto)}</div></div>
      </div>`).join("")}
      ${pronto.map((s) => `<div class="registro">
        <div><div class="detalle">${esc(s.cultivo)}${s.variedad ? " " + esc(s.variedad) : ""} · G${s.generacion}</div>
          <div class="cuando">${esc(estadoAlmacigo(s).texto)}</div></div>
      </div>`).join("")}
    </div>` : ""}

    <div class="tarjeta">
      <h2>&#127807; Registrar trasplante${
        pend.length ? ` <small>${pend.length} almácigos esperando</small>` : ""}</h2>
      ${origen}
      <form id="form-trasplantes">
        <label>¿Qué cultivo?</label>
        ${buscadorCultivo("", "cultivo")}

        <div class="fila">
          <div>
            <label>Variedad <small>(opcional)</small></label>
            <input type="text" name="variedad" maxlength="40" autocomplete="off">
          </div>
          <div>
            <label>Generación</label>
            <input type="number" name="generacion" value="1" min="1" max="20" inputmode="numeric">
          </div>
        </div>

        <label>Fecha</label>
        <input type="date" name="fecha" value="${hoy()}" required>

        <!-- El almácigo es opcional: elegirlo completa el resto solo y permite
             medir cuántos días estuvo de verdad en la bandeja contra los
             teóricos, que es el dato con el que después se corrige el
             catálogo. Sin él el trasplante se registra igual. -->
        <label>¿Viene de un almácigo cargado? <small>(opcional)</small></label>
        <select name="siembra_id">
          <option value="">No, o no está en la lista</option>
          ${pend.map((s) => `<option value="${esc(s.id)}">${esc(s.etiqueta)}</option>`).join("")}
        </select>
        <p class="nota" id="nota-almacigo"></p>

        <label>¿A qué bancales fue?</label>
        <div id="renglones-bancal">${renglonBancal(0)}</div>
        <button type="button" class="secundario mas" id="btn-mas-bancal">
          + Agregar otro bancal</button>

        <h3 class="sub">Marco de plantación</h3>
        <p class="nota">Viene sugerido del plan de la temporada. Si en el campo
        se hizo distinto, cambialo acá y queda registrado como fue de verdad.</p>
        <div class="fila">
          <div>
            <label>Líneas por bancal</label>
            <input type="text" name="lineas" inputmode="numeric">
          </div>
          <div>
            <label>Distancia (cm)</label>
            <input type="text" name="distancia_cm" inputmode="numeric">
          </div>
        </div>
        <label>Disposición</label>
        <select name="disposicion">
          ${DISPOSICIONES.map((d) => `<option>${esc(d)}</option>`).join("")}
        </select>

        <!-- Los plantines salen del marco y de los bancales, pero a veces se
             contaron de verdad y ese número vale más que la cuenta. -->
        <label>Plantines por bancal <small>(si los contaste)</small></label>
        <input type="text" name="plantines" inputmode="numeric"
               placeholder="lo calcula solo con el marco">

        <div class="calculo" id="calculo-trasplante"></div>

        <label>Operador</label>
        <select name="operador" required>${opcionesIntegrante(yo)}</select>

        <label>Observaciones</label>
        <textarea name="observaciones" rows="2" placeholder="Opcional"></textarea>

        <button class="principal">Guardar trasplante</button>
      </form>
    </div>
    ${historialDe("trasplantes")}`;
  },

  // Cada uno ve su cuenta; quien esté habilitado ve la de todo el equipo. Eso
  // lo decide el servicio a partir de la credencial del teléfono, no de un
  // nombre elegido en una lista.
  cuentas() {
    if (!chacraActual()) return tarjetaElegirChacra();
    if (!tieneAcceso()) return tarjetaCanje();

    const d = leer(LS.cuentas, null);
    const error = leer(LS.cuentasError, "");
    if (!d) {
      return `<div class="tarjeta">
        <h2>Cuentas</h2>
        <p class="nota">${error ? esc(error)
          : "Buscando tus cuentas… Si no aparecen, revisá la señal."}</p>
      </div>`;
    }

    const gente = d.trabajadores || [];
    const abierta = gente.find((x) => claveArea(x.nombre) === claveArea(cuentaAbierta))
      || (gente.length === 1 ? gente[0] : null);

    const aviso_ = error ? `<p class="nota alerta">${esc(error)} Estás viendo los
      últimos números que se pudieron bajar.</p>` : "";
    const cuando = d.actualizado
      ? `<p class="nota">Calculado por Bioma el ${fechaCorta(String(d.actualizado).slice(0,10))}.</p>`
      : "";

    if (abierta) return `${detalleDeCuenta(abierta, d)}
      ${(d.trabajadores || []).length === 1 ? tarjetasDeEconomia(d.economia) : ""}
      ${aviso_}${cuando}`;

    if (!gente.length) {
      return `<div class="tarjeta"><h2>Cuentas</h2>
        <p class="nota">Todavía no hay cuenta a tu nombre. Aparece en cuanto se
        carguen tus horas o un pago.</p>${aviso_}</div>`;
    }

    const orden = [...gente].sort((a, b) => (b.saldo || 0) - (a.saldo || 0));
    return `
    <div class="tarjeta">
      <h2>Cuentas del equipo <small>${orden.length}</small></h2>
      <p class="nota">Lo que el proyecto le debe a cada une. Tocá para ver el detalle.</p>
      ${orden.map((x) => `<div class="registro cuenta-fila" data-cuenta="${esc(x.nombre)}">
        <div><div class="detalle">${esc(x.nombre)}</div>
          <div class="cuando">${num(x.horas, 1)} h · ${pesos(x.devengado)} ganado</div></div>
        <div class="saldo${(x.saldo || 0) < 0 ? " alerta" : ""}">${conSigno(x.saldo)}</div>
      </div>`).join("")}
    </div>
    ${d.totales ? `<div class="tarjeta">
      <h2>Todo el proyecto</h2>
      <div class="cifras">
        ${cifraClara(num(d.totales.horas, 1), "horas")}
        ${cifraClara(pesos(d.totales.pagado), "pagado")}
        ${cifraClara(pesos(d.totales.saldo), "se debe")}
      </div>
    </div>` : ""}
    ${(d.pagos_sin_persona || []).length ? `<div class="tarjeta">
      <h2>Pagos sin dueño <small>${d.pagos_sin_persona.length}</small></h2>
      <p class="nota">Salieron como sueldo pero sin nombre, así que no entran en
      ninguna cuenta. O le falta la persona, o no era un sueldo y va en otro
      concepto: un honorario, por ejemplo. Se corrige en la app de Bioma.</p>
      ${d.pagos_sin_persona.map((g) => `<div class="registro">
        <div><div class="detalle">${pesos(g.monto)}</div>
          <div class="cuando">${fechaCorta(g.fecha)}${g.obs ? " · " + esc(g.obs) : ""}</div></div>
      </div>`).join("")}
    </div>` : ""}
    ${tarjetasDeEconomia(d.economia)}
    ${aviso_}${cuando}`;
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
    // Las hechas se ordenan por cuándo se marcaron, al revés que las pendientes
    // —que van por fecha de vencimiento, lo más urgente arriba—. Antes salían de
    // esa misma lista, así que mostraban las ocho más viejas y no se movían
    // nunca: la fecha "para cuándo" ya no cambia después de hacerla.
    const hechas = lista.filter((t) => t.hecha)
      .sort((a, b) => (b.hecha_el || "").localeCompare(a.hecha_el || ""))
      .slice(0, 8);
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
      <h2>Hechas hace poco <small>lo último arriba</small></h2>
      ${hechas.map(filaTarea).join("")}
      <a class="enlace-planilla" href="${esc(enlacePlanilla())}" target="_blank" rel="noopener">
        Ver el historial completo en la planilla</a>
    </div>` : ""}`;
  },

  cosechas() {
    if (!chacraActual()) return tarjetaElegirChacra();
    if (!tieneAcceso()) return tarjetaCanje();
    const yo = leer(LS.nombre, "");
    const delPlan = cultivosDelPlan();
    // Sin plan de temporada no hay pizarra posible: no habría qué poner. Pasa
    // en las chacras que todavía no lo cargaron.
    const pizarra = modoCosecha === "pizarra" && delPlan.length > 0;

    return `
    <div class="tarjeta">
      <h2>&#127807; Registrar cosecha</h2>

      <div class="pestanas-tareas">
        <button type="button" class="pestana${pizarra ? "" : " activa"}"
                data-modo-cosecha="lista">Lista</button>
        <button type="button" class="pestana${pizarra ? " activa" : ""}"
                data-modo-cosecha="pizarra">Pizarra</button>
      </div>

      <p class="nota">${pizarra
        ? `Todos los cultivos del plan, como en la pizarra: escribí los kilos
           solo en los que cosechaste y dejá el resto vacío.`
        : `Los kilos totales de cada cultivo, de todos los bancales juntos.
           Un renglón por cultivo: con el + sumás otro, y con el × sacás el que sobre.`}</p>

      ${modoCosecha === "pizarra" && !delPlan.length ? `<p class="nota alerta">
        El modo pizarra muestra los cultivos del plan de la temporada, y esta
        chacra todavía no tiene ninguno cargado. Cargalos en Plan, o usá el
        modo lista.</p>` : ""}

      <form id="form-cosechas">
        <label>Fecha</label>
        <input type="date" name="fecha" value="${hoy()}" required>

        ${pizarra ? `
        <div id="pizarra-cosecha">
          ${delPlan.map((c, i) => renglonPizarra(c, i)).join("")}
        </div>` : `
        <!-- Los encabezados van una sola vez, no uno por renglón. -->
        <div class="cosecha-cab"><span>Cultivo</span><span>Kilos</span></div>
        <div id="renglones-cosecha">${renglonCosecha(0)}</div>

        <button type="button" class="secundario mas" id="btn-mas-cultivo"
                aria-label="Agregar otro cultivo">+</button>`}

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

    // Un cultivo abierto reemplaza la lista: en el teléfono no hay lugar para
    // las dos cosas, y en la notebook la ficha se lee mejor sola.
    if (cultivoAbierto) return fichaCultivo(cultivoAbierto);
    // Planificar es trabajo de notebook. En el teléfono estas dos pantallas no
    // se leen, así que se avisa en vez de mostrarlas rotas.
    if (vistaPlan === "mapa") {
      return pantallaAncha() ? mapaDeCultivos()
        : barraDePlan("mapa") + tarjetaSoloNotebook("El mapa de cultivos");
    }
    if (vistaPlan === "grafico") {
      return pantallaAncha() ? planEstrategico()
        : barraDePlan("grafico") + tarjetaSoloNotebook("El plan estratégico");
    }
    if (vistaPlan === "planificar") return pantallaPlanificar();

    return `
    <div class="tarjeta">
      <h2>Plan de la temporada <small>${plan.length} cultivos</small></h2>
      ${barraDePlan("lista")}
      ${plan.length ? plan.map((p) => {
        const logrado = porCultivo[p.cultivo] || 0;
        const pct = p.cosecha_esperada_kg ? (logrado / p.cosecha_esperada_kg) * 100 : 0;
        const perf = perfil(p.cultivo);
        return `<div class="plan-fila abre-ficha" data-ficha="${esc(p.cultivo)}"
                     role="button" tabindex="0">
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
      <h2>Sectores <small>${num(sectores().reduce((a, s) => a + (Number(s.bancales) || 0), 0))} bancales</small></h2>
      <p class="nota">Cada croquis muestra los bancales del sector y cuántos
      están ocupados por el plan. Desde el teléfono es la forma de ver cómo
      quedó el campo sin abrir el mapa.</p>
      <!-- En el orden del campo —de arriba abajo y de izquierda a derecha, como
           quedaron en el mapa— pero acomodándose al ancho que haya. Antes se
           copiaba la grilla del mapa con columnas fijas, y en media pantalla
           de notebook los croquis se salían de la tarjeta y pisaban la de al
           lado. -->
      <div class="croquis-sectores">
        ${bloquesDelMapa().slice()
          .sort((a, z) => (a.y - z.y) || (a.x - z.x))
          .map((bq) => sectores().find((s) => s.sector === bq.sector))
          .map((s) => {
          const n = Number(s.bancales) || 0;
          // Qué bancales del sector tienen algo asignado. Es lo mismo que
          // dibuja el mapa, resumido a una miniatura que entra en un teléfono.
          const tomados = new Set();
          (leer(LS.generaciones, []) || [])
            .filter((g) => claveArea(g.sector) === claveArea(s.sector))
            .forEach((g) => bancalesDe(g).forEach((x) => tomados.add(x)));
          const sup = n * m2;
          return `<div class="croquis">
            <div class="croquis-cab">
              <b>${esc(s.sector)}</b>
              <span>${tomados.size} de ${n} ocupados</span>
            </div>
            <div class="croquis-camas" style="--cols:${Math.min(n, 13)}">
              ${Array.from({ length: n }, (_, i) => `<i class="${
                tomados.has(i + 1) ? "lleno" : ""}" title="Bancal ${i + 1}"></i>`).join("")}
            </div>
            <div class="croquis-pie">
              ${num(sup)} m²${s.tipo_riego ? ` · ${esc(s.tipo_riego)}` : ""}
            </div>
          </div>`;
        }).join("")}
      </div>
      <p class="nota" style="margin-top:10px">
        Bancal de ${num(b.largo_m, 1)} × ${num(b.ancho_m, 1)} m (${num(m2, 1)} m²)
        ${b.pasillo_m ? ` · pasillo ${num(b.pasillo_m, 1)} m` : ""}
        · ${num(b.n_bancales)} bancales en total
      </p>
    </div>

    <div class="tarjeta">
      <h2>La temporada</h2>
      <div class="datos">
        <div class="dato"><span>Chacra</span><b>${
          esc(CFG?.nombre || chacraActual()?.nombre || "")}</b></div>
        ${CFG?.temporada?.nombre
          ? `<div class="dato"><span>Temporada</span><b>${esc(CFG.temporada.nombre)}</b></div>` : ""}
        ${CFG?.temporada?.inicio
          ? `<div class="dato"><span>Empezó</span><b>${fechaCorta(CFG.temporada.inicio)}</b></div>` : ""}
        ${CFG?.temporada?.fin
          ? `<div class="dato"><span>Termina</span><b>${fechaCorta(CFG.temporada.fin)}</b></div>` : ""}
        <div class="dato"><span>Cultivos</span><b>${plan.length}</b></div>
        <div class="dato"><span>Generaciones</span><b>${(leer(LS.generaciones, []) || []).length}</b></div>
        <div class="dato"><span>Superficie</span><b>${
          num(plan.reduce((a, p) => a + (p.superficie_m2 || 0), 0))} m²</b></div>
        <div class="dato"><span>Cosecha esperada</span><b>${
          num(plan.reduce((a, p) => a + (p.cosecha_esperada_kg || 0), 0))} kg</b></div>
      </div>

      <h3 class="sub">Quiénes trabajan <small>${integrantes().length}</small></h3>
      <div class="chips-nombres">
        ${integrantes().map((n) => `<span class="chip-nombre">${esc(n)}</span>`).join("")}
      </div>

      <h3 class="sub">Áreas de trabajo</h3>
      <p class="nota">${areas().map((a) => esc(a.nombre)).join(" · ")}</p>
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
      <!-- A Configuración se entra desde el engranaje de arriba, que no es una
           sección de la barra: sin una salida clara quedaba como un callejón. -->
      <button type="button" class="secundario" id="volver-de-config">← Volver</button>
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

      <details id="alta-cultivo">
        <summary>Agregar o completar un cultivo</summary>
        <p class="nota">Queda disponible para todas las chacras, no solo para la
        tuya. Por eso conviene escribirlo como se lo conoce, y hay que cargar
        todos los datos: un cultivo a medias no le sirve a nadie.</p>
        ${cultivosPorCompletar().length ? `<p class="nota">Estos están en el
        catálogo pero sin datos. Si cultivás alguno, escribí su nombre acá y
        completalo: <b>${cultivosPorCompletar().map(esc).join(", ")}</b>.</p>` : ""}
        <form id="form-cultivo">
          <label>Nombre del cultivo</label>
          <input type="text" name="cultivo" maxlength="40" placeholder="Ej: Cilantro" required>

          <label>¿Cómo se siembra?</label>
          <select name="tipo_siembra">
            ${tiposSiembra().map((s) => `<option>${esc(s)}</option>`).join("")}
          </select>

          <div id="bloque-almacigo" class="fila">
            <div>
              <label>Días en almácigo</label>
              <input type="text" name="dias_almacigo" inputmode="numeric" placeholder="Ej: 35">
            </div>
            <div>
              <label>De trasplante a cosecha</label>
              <input type="text" name="dias_trasplante_cosecha" inputmode="numeric" placeholder="Ej: 52">
            </div>
          </div>
          <!-- Opcionales a propósito: nadie sabe de memoria, parado en la
               huerta, cuántos días tarda un pepinillo en invierno. Si quedan
               vacíos el cultivo entra igual y se usa el número de arriba. -->
          <div id="bloque-estacion" class="fila">
            <div>
              <label>Almácigo en invierno <small>(opcional)</small></label>
              <input type="text" name="dias_almacigo_oi" inputmode="numeric" placeholder="Ej: 45">
            </div>
            <div>
              <label>Almácigo en verano <small>(opcional)</small></label>
              <input type="text" name="dias_almacigo_pv" inputmode="numeric" placeholder="Ej: 30">
            </div>
          </div>
          <div class="fila">
            <div id="bloque-directa">
              <label>Días a cosecha <small>(desde la siembra)</small></label>
              <input type="text" name="dias_a_cosecha" inputmode="numeric" placeholder="Ej: 87">
            </div>
            <div>
              <label>Días en cosecha</label>
              <input type="text" name="dias_en_cosecha" inputmode="numeric" placeholder="Ej: 30">
            </div>
          </div>
          <p class="nota" id="suma-cosecha"></p>

          <h3 class="sub">Marco de plantación</h3>
          <div class="fila">
            <div>
              <label>Líneas por bancal</label>
              <input type="text" name="lineas_bancal" inputmode="numeric" placeholder="Ej: 3">
            </div>
            <div>
              <label>Distancia (cm)</label>
              <input type="text" name="distancia_cm" inputmode="numeric" placeholder="Ej: 40">
            </div>
          </div>

          <label>Rinde de referencia <small>(kg por m²)</small></label>
          <input type="text" name="rinde_ref_kg_m2" inputmode="decimal" placeholder="Ej: 5,5">

          <label>Observaciones <small>(lo único opcional)</small></label>
          <input type="text" name="observaciones" maxlength="120"
                 placeholder="Variedad, de dónde salen los datos">

          <button class="secundario">Agregar al catálogo</button>
        </form>
      </details>

      <!-- El plan por cultivo se arma en Plan → Planificar, junto con sus
           generaciones y sus fechas. Estaba también acá, y eran las dos
           mitades de una misma decisión cargadas por separado: el total podía
           decir seis bancales de acelga mientras las generaciones decían tres,
           sin que nada avisara. Ahora el total sale de las generaciones. -->
      <p class="nota">Los cultivos de la temporada —con su marco, su rinde y
      sus generaciones— se cargan en <b>Plan → Planificar</b>. Acá se define
      cómo es la chacra; allá, qué se va a hacer esta temporada.</p>
    </div>`;
  },

  ajustes() {
    return `
    <div class="tarjeta">
      <h2>Versión de la app</h2>
      <p class="nota">Si algo que te dijeron que estaba arreglado no aparece, el
      teléfono puede haber quedado con una copia vieja guardada. Este botón la
      tira y vuelve a bajar todo.</p>
      <p class="nota">Tenés la <b>${esc(VERSION_APP)}</b></p>
      <button class="secundario" id="btn-actualizar-app">Buscar actualización</button>
    </div>

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

      <label>Servicio de siembras, cosechas y tareas <small>(planilla de la chacra)</small></label>
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
      <p class="nota"><b>AMA Producción</b> — Aplicaciones para el Manejo Agroecológico.
      Los registros se guardan en este teléfono (funciona sin señal) y se envían a la
      planilla de la chacra cuando hay conexión.</p>
      <p class="nota" style="margin-top:8px">
        Chacra: ${esc(chacraActual()?.nombre || "sin elegir")} ·
        ${hayConfig() ? `temporada ${esc(CFG.temporada?.nombre || "")},
          ${(CFG.plan || []).length} cultivos` : "sin configurar"} ·
        catálogo de ${cultivosDisponibles().length} cultivos.</p>
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

// Las fichas de referencia viven en su propio archivo y se bajan la primera
// vez que se abre una, no al arrancar: son texto y nadie las mira todos los
// días. El service worker las guarda, así que después funcionan sin señal.
let FICHAS = null;
let bajandoFichas = false;
async function traerFichasTexto() {
  if (FICHAS || bajandoFichas) return;
  bajandoFichas = true;
  try {
    const r = await fetch("fichas.json");
    FICHAS = await r.json();
    if (vistaActual === "plan" && cultivoAbierto) redibujarConDatos("plan");
  } catch { /* sin señal la primera vez: se muestra el resto de la ficha */ }
  finally { bajandoFichas = false; }
}

// Las siembras que toca hacer, según el plan de la temporada. Una generación
// entra acá si su fecha ya llegó o está cerca y todavía no se cargó la siembra.
//
// "Todavía no se cargó" lo dice el servicio cruzando el plan con la hoja
// Siembras, no la columna Estado del plan: esa es una foto del día en que se
// importó, y creyéndole, una generación ya sembrada seguiría reclamando para
// siempre. Mientras el servicio no lo mande, se cae en esa columna y se suma
// lo que haya en la cola de este teléfono.
function siembrasPendientes(dias = DIAS_AVISO) {
  const gens = leer(LS.generaciones, []) || [];
  if (!gens.length) return [];

  // Lo cargado en este teléfono y todavía sin viajar también cuenta como hecho.
  const enLaCola = new Set(pendientes.concat(enviados)
    .filter((r) => r.tipo === "siembras")
    .map((r) => `${claveArea(r.datos.cultivo)}|${Number(r.datos.generacion) || 1}`));

  const limite = sumarDias(hoy(), dias);
  return gens
    .map((g) => {
      // El día que toca sembrar: la bandeja si va por almácigo, el bancal si
      // es siembra directa.
      const cuando = g.fecha_almacigo || g.fecha_campo;
      const hecha = ("sembrada" in g) ? g.sembrada : g.estado === "Sembrado";
      return { ...g, cuando, hecha: hecha || enLaCola.has(`${claveArea(g.cultivo)}|${g.generacion}`) };
    })
    .filter((g) => g.cuando && !g.hecha && g.cuando <= limite)
    .sort((a, b) => String(a.cuando).localeCompare(String(b.cuando)));
}

// Varias generaciones del plan pueden salir de una sola siembra: el puerro son
// ocho plantaciones escalonadas que arrancan en la misma bandeja, el mismo día.
// Para quien tiene que sembrar eso es UNA tarea, no ocho, así que se juntan.
function siembrasAgrupadas(dias = DIAS_AVISO) {
  const juntas = new Map();
  siembrasPendientes(dias).forEach((g) => {
    const k = `${claveArea(g.cultivo)}|${g.cuando}`;
    if (!juntas.has(k)) juntas.set(k, { ...g, generaciones: [], camasTotal: 0 });
    const j = juntas.get(k);
    // Una generación partida en bancales separados es una sola siembra: su
    // número va una vez, y los bancales se suman.
    if (!j.generaciones.includes(g.generacion)) j.generaciones.push(g.generacion);
    j.camasTotal += Number(g.camas) || 0;
  });
  return [...juntas.values()]
    .sort((a, b) => String(a.cuando).localeCompare(String(b.cuando)));
}

function tarjetaSiembrasPendientes() {
  const pend = siembrasAgrupadas();
  if (!pend.length) return "";
  const atrasadas = pend.filter((g) => g.cuando < hoy());

  return `<div class="tarjeta">
    <h2>&#127793; Para sembrar <small>${pend.length}</small></h2>
    <p class="nota">Del plan de la temporada. Tocá una para cargarla: se abre
    Siembras con el cultivo y la generación puestos. Desaparece de acá cuando
    la siembra queda guardada, no antes.</p>
    ${pend.slice(0, 8).map((g) => {
      const d = diasEntre(hoy(), g.cuando);
      const cuando = d === 0 ? "hoy"
        : d < 0 ? `atrasada ${Math.abs(d)} día${Math.abs(d) === 1 ? "" : "s"}`
        : `en ${d} día${d === 1 ? "" : "s"}`;
      const gs = g.generaciones;
      const etiqueta = gs.length === 1 ? `G${gs[0]}`
        : `G${Math.min(...gs)} a G${Math.max(...gs)} <small>(${gs.length} juntas)</small>`;
      return `<div class="registro abre-siembra" role="button" tabindex="0"
                   data-sembrar="${esc(JSON.stringify({
                     cultivo: g.cultivo, generacion: Math.min(...gs),
                     directa: !g.fecha_almacigo }))}">
        <div>
          <div class="detalle">${esc(g.cultivo)} <span class="gen">${etiqueta}</span></div>
          <div class="cuando">${g.fecha_almacigo ? "en bandeja" : "siembra directa"}${
            g.camasTotal ? ` · ${num(g.camasTotal, 1)} cama(s)` : ""}${
            g.sector ? ` · ${esc(g.sector)}` : ""} · ${fechaCorta(g.cuando)}</div>
        </div>
        <span class="etiqueta ${d < 0 ? "alerta" : "ok"}">${cuando}</span>
      </div>`;
    }).join("")}
    ${pend.length > 8 ? `<p class="nota">y ${pend.length - 8} más en el plan estratégico.</p>` : ""}
    ${atrasadas.length ? `<p class="nota">${atrasadas.length} ya pasó su fecha.
      Si no se van a sembrar, conviene sacarlas de la hoja «Plan generaciones»
      para que dejen de aparecer.</p>` : ""}
  </div>`;
}

// ---- Plan estratégico ----
// El calendario de la temporada: una barra por generación, con sus tres
// tramos. Lo único que se guarda de cada generación es CUÁNDO se decidió
// sembrarla; el trasplante, el inicio y el fin de cosecha se calculan acá con
// los días del catálogo. Así, cuando esos días se corrigen con lo que de
// verdad pasa en la chacra, el plan entero se corrige solo.
async function traerGeneraciones(forzar = false) {
  if (!chacraCodigo() || !tieneAcceso() || !navigator.onLine) return;
  if (!forzar && Date.now() - (pedidoReciente.generaciones || 0) < 20000) return;
  pedidoReciente.generaciones = Date.now();
  try {
    const d = await (await fetch(
      `${urlServicio()}?${conCredenciales("generaciones=1")}`)).json();
    if (!d.ok || !Array.isArray(d.generaciones)) return;
    const lista = conPendientesDelPlan(d.generaciones);
    const cambio = JSON.stringify(leer(LS.generaciones, null)) !== JSON.stringify(lista);
    escribir(LS.generaciones, lista);
    if (!cambio) return;
    if (vistaActual === "inicio") redibujarConDatos("inicio");
    else if (vistaActual === "plan" && vistaPlan !== "lista") redibujarConDatos("plan");
  } catch { /* sin señal: se usa lo último que se bajó */ }
}

/* Lo que está en la cola del teléfono todavía no llegó a la planilla, así que
   el servicio no lo devuelve. Se aplica encima de su respuesta: si no, un
   cultivo recién agregado desaparecía de la lista y del gráfico hasta cerrar y
   abrir la app (28/09), y una generación recién movida volvía a su lugar
   viejo por unos segundos. */
function conPendientesDelPlan(lista) {
  let out = lista.slice();
  pendientes.forEach((r) => {
    const d = r.datos || {};
    const id = d.generacion_id;
    if (!id) return;
    if (r.tipo === "generacion_borrar") { out = out.filter((x) => x.id !== id); return; }
    if (r.tipo !== "generaciones") return;
    const previa = out.find((x) => x.id === id);
    // Una parte nueva de una generación partida es la misma siembra: si la
    // original ya estaba sembrada, esta también.
    const hermanaSembrada = out.some((x) => claveArea(x.cultivo) === claveArea(d.cultivo)
      && Number(x.generacion) === (Number(d.generacion) || 1) && x.sembrada);
    const nueva = {
      ...(previa || { sembrada: hermanaSembrada }), id, cultivo: d.cultivo,
      generacion: Number(d.generacion) || 1, metodo: d.metodo || "",
      fecha_almacigo: d.fecha_almacigo || "", fecha_campo: d.fecha_campo || "",
      camas: Number(d.camas) || 0, sector: d.sector || "", bancales: d.bancales || "",
      estado: d.estado || "Planificado",
    };
    out = previa ? out.map((x) => (x.id === id ? nueva : x)) : out.concat(nueva);
  });
  return out;
}

// Guardar una generación: a la cola, y en la copia local al instante para que
// la pantalla responda sin esperar a la planilla.
function guardarGeneracion(g, mensaje) {
  guardarRegistro("generaciones", {
    generacion_id: g.id, cultivo: g.cultivo, generacion: g.generacion,
    metodo: g.metodo, fecha_almacigo: g.fecha_almacigo || "",
    fecha_campo: g.fecha_campo || "", camas: g.camas || "",
    sector: g.sector || "",
    // Solo números: si la planilla alguna vez convirtió "4, 5, 6" en una
    // fecha, reenviarlo tal cual lo volvía a guardar dañado.
    bancales: bancalesDe(g).join(", "), estado: g.estado || "Planificado", origen: "AMA",
  }, mensaje);
  escribir(LS.generaciones, conPendientesDelPlan(leer(LS.generaciones, []) || []));
}

// "G1", o "G1b" cuando una generación se partió para ubicarla en bancales
// separados: son la misma siembra, así que comparten el número.
function nombreGen(g, todas = leer(LS.generaciones, []) || []) {
  const hermanas = todas.filter((x) => claveArea(x.cultivo) === claveArea(g.cultivo)
    && Number(x.generacion) === Number(g.generacion));
  if (hermanas.length < 2) return `G${g.generacion}`;
  const orden = hermanas.map((x) => x.id).sort((a, b) => a.length - b.length || a.localeCompare(b));
  return `G${g.generacion}${"abcdefghij"[orden.indexOf(g.id)] || ""}`;
}

// Lo que se supone cuando el catálogo no dice nada: solo para poder dibujar
// la barra, que queda marcada como estimada. No se guarda en ningún lado.
const DIAS_SUPUESTOS = { almacigo: 28, cosecha: 60 };

// Los cuatro momentos de una generación. En siembra directa no hay tramo de
// almácigo: la planta arranca en el bancal.
function tramosDe(g) {
  const p = perfil(g.cultivo) || {};
  const directa = !g.fecha_almacigo;
  const inicioTodo = g.fecha_almacigo || g.fecha_campo;
  if (!inicioTodo) return null;

  const aCampo = g.fecha_campo || "";
  // De la bandeja al bancal: si el plan trae la fecha se respeta, porque es
  // una decisión; si no, se estima con los días de almácigo de la estación.
  //
  // Si el catálogo no tiene los días, la barra igual se dibuja, con un largo
  // supuesto y marcada como estimada. Antes la fila quedaba vacía —el nombre
  // sin barra, como pasó con Pak choi el 28/09— y no se entendía por qué.
  const faltan = [];
  let enBandeja = directa || aCampo ? 0 : diasAlmacigo(g.cultivo, inicioTodo);
  if (!directa && !aCampo && !enBandeja) { enBandeja = DIAS_SUPUESTOS.almacigo; faltan.push("días de almácigo"); }
  const campo = aCampo || sumarDias(inicioTodo, enBandeja) || inicioTodo;
  let aCosecha = directa
    ? (p.dias_a_cosecha || 0)
    : (p.dias_trasplante_cosecha || 0);
  if (!aCosecha) { aCosecha = DIAS_SUPUESTOS.cosecha; faltan.push("días a cosecha"); }
  const inicioCosecha = sumarDias(campo, aCosecha);
  const dura = p.dias_en_cosecha_max || p.dias_en_cosecha || 0;
  // Sin ventana de cosecha la barra termina donde empieza a cosecharse: no se
  // inventa cuánto dura, pero se avisa que falta.
  if (!dura) faltan.push("días en cosecha");
  const finCosecha = inicioCosecha && dura ? sumarDias(inicioCosecha, dura) : inicioCosecha;

  return { inicio: inicioTodo, campo, inicioCosecha, fin: finCosecha || campo, directa,
           faltan };
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

function generacionesParaElPlan() {
  const todas = leer(LS.generaciones, []) || [];
  // Vale lo que dice la hoja Siembras, no la columna Estado del plan. Si el
  // servicio todavía no manda el cruce, se cae en esa columna.
  const sembrada = (g) => ("sembrada" in g) ? g.sembrada : g.estado === "Sembrado";
  const filtradas = todas.filter((g) =>
    filtroPlan === "todas" ? true
      : filtroPlan === "sembradas" ? sembrada(g) : !sembrada(g));
  return filtradas
    .map((g) => Object.assign({}, g, { tramos: tramosDe(g) }))
    .filter((g) => g.tramos)
    .sort((a, b) => ordenPlan === "fecha"
      ? String(a.tramos.inicioCosecha || a.tramos.inicio)
          .localeCompare(String(b.tramos.inicioCosecha || b.tramos.inicio))
      // Por cultivo, y dentro de cada uno por la fecha en que arranca: al
      // correr una generación en el gráfico, se reacomoda sola en su lugar.
      : a.cultivo.localeCompare(b.cultivo)
        || String(a.tramos.inicio).localeCompare(String(b.tramos.inicio))
        || a.generacion - b.generacion);
}

function planEstrategico() {
  const gens = generacionesParaElPlan();
  const total = (leer(LS.generaciones, []) || []).length;

  const cabecera = `
    ${barraDePlan("grafico")}`;

  if (!gens.length) {
    return `<div class="tarjeta">
      <h2>Plan estratégico</h2>
      ${cabecera}
      <p class="nota">${total
        ? "Ningún generación coincide con el filtro elegido."
        : `Todavía no hay generaciones planificadas. Se cargan desde la
           planificación de la temporada con <code>tools/cargar_generaciones.py</code>.`}</p>
    </div>`;
  }

  // El eje es la temporada, de julio a junio, no el rango de los datos. Sin
  // ese límite una sola generación de acelga —200 días de cosecha— estiraba el
  // gráfico hasta septiembre del año siguiente y achicaba todo lo demás.
  //
  // Lo que sigue después de junio no se borra: la barra llega al borde y se
  // marca, que es distinto de decir que ahí se termina.
  const d0 = inicioDeTemporada();
  const d1 = new Date(d0); d1.setFullYear(d1.getFullYear() + 1);
  const ini = Math.floor(d0.getTime() / 86400000);
  const fin = Math.floor(d1.getTime() / 86400000);
  const dias = Math.max(1, fin - ini);
  const pct = (iso) => ((diaDe(iso) - ini) / dias) * 100;

  // Los meses del encabezado
  const meses = [];
  const cur = new Date(d0);
  while (cur < d1) {
    const desdeMes = Math.floor(cur.getTime() / 86400000);
    const sig = new Date(cur); sig.setMonth(sig.getMonth() + 1);
    const hastaMes = Math.min(fin, Math.floor(sig.getTime() / 86400000));
    meses.push({
      nombre: MESES_CORTOS[cur.getMonth()],
      anio: cur.getFullYear(),
      izq: ((desdeMes - ini) / dias) * 100,
      ancho: ((hastaMes - desdeMes) / dias) * 100,
    });
    cur.setMonth(cur.getMonth() + 1);
  }

  const hoyPct = pct(hoy());
  const enPantalla = hoyPct >= 0 && hoyPct <= 100;
  // Cuánto tiene que medir un tramo, en porcentaje del eje, para que le entre
  // una fecha como "16/8". Depende del ancho real del gráfico, no de un número
  // fijo: en el teléfono el mismo tramo es mucho más angosto.
  const anchoGrafico = Math.max(720, meses.length * 96);
  const anchoMinimoFecha = (34 / anchoGrafico) * 100;

  const todasGens = leer(LS.generaciones, []) || [];
  const filas = gens.map((g, i) => {
    const t = g.tramos;
    // Recortado a la temporada: lo que empieza antes de julio o sigue después
    // de junio se dibuja hasta el borde, no fuera de él.
    // Cada tramo lleva su fecha de arranque escrita adentro, que es lo que
    // permite leer el calendario sin pasar el mouse por encima. Si el tramo es
    // muy angosto la fecha no entra y se omite: mejor sin texto que con un
    // número cortado a la mitad.
    const seg = (a, b, clase, titulo, etiqueta) => {
      const i = Math.max(0, pct(a)), f = Math.min(100, pct(b));
      if (f <= i) return "";
      const ancho = f - i;
      const cabe = ancho >= anchoMinimoFecha;
      return `<div class="${clase}" style="left:${i}%;width:${ancho}%;background:${
        colorEtapa(g.cultivo, clase.split(" ")[1])}" title="${esc(titulo)}">${
        cabe && etiqueta ? `<b>${esc(etiqueta)}</b>` : ""}</div>`;
    };
    const sigue = t.fin > isoDe(d1);
    // Una generación ya sembrada no se puede correr: su fecha es un hecho, no
    // una intención. Las planificadas sí, arrastrándolas.
    const movible = !(("sembrada" in g) ? g.sembrada : g.estado === "Sembrado");
    // Una línea algo más marcada donde empieza otro cultivo: separa los grupos.
    const nuevoCultivo = ordenPlan === "cultivo" && i > 0 && gens[i - 1].cultivo !== g.cultivo;
    const nombre = nombreGen(g, todasGens);
    // Si al catálogo le faltan días, la barra es una estimación y se ve así.
    const estimada = t.faltan && t.faltan.length;
    return `<div class="plan-gen${movible ? " movible" : ""}${g.id === genPanel ? " abierta" : ""}${
                 nuevoCultivo ? " nuevo-cultivo" : ""}${estimada ? " estimada" : ""}"
                 data-gen="${esc(g.id)}" ${movible ? `data-mover="${esc(g.id)}"` : ""}>
      <div class="plan-nombre" title="${esc(g.cultivo)} ${nombre}${g.camas ? ` · ${num(g.camas, 1)} bancal(es)` : ""}${
        estimada ? ` · barra estimada: faltan en el catálogo los ${t.faltan.join(" y los ")}` : ""}">
        ${esc(g.cultivo)} <span>${nombre}</span>${estimada ? ` <span class="estimada-marca">≈</span>` : ""}
      </div>
      <div class="plan-pista${
        (("sembrada" in g) ? g.sembrada : g.estado === "Sembrado") ? " sembrada" : ""}">
        ${t.directa ? "" : seg(t.inicio, t.campo, "tramo almacigo",
          `almácigo: ${fechaCorta(t.inicio)} a ${fechaCorta(t.campo)}`, diaMes(t.inicio))}
        ${seg(t.campo, t.inicioCosecha || t.fin, "tramo campo",
          `${t.directa ? "sembrado" : "trasplantado"} el ${fechaCorta(t.campo)}`, diaMes(t.campo))}
        ${t.inicioCosecha ? seg(t.inicioCosecha, t.fin, "tramo cosecha",
          `cosecha: ${fechaCorta(t.inicioCosecha)} a ${fechaCorta(t.fin)}`,
          diaMes(t.inicioCosecha)) : ""}
        ${sigue ? `<div class="sigue" title="sigue en cosecha hasta el ${
          fechaCorta(t.fin)}, ya fuera de esta temporada">›</div>` : ""}
      </div>
    </div>`;
  }).join("");

  return `<div class="tarjeta">
    <h2>Plan estratégico <small>${gens.length} de ${total} generaciones</small></h2>
    ${cabecera}

    <div class="plan-controles">
      <div class="chips">
        ${[["cultivo", "Por cultivo"], ["fecha", "Por fecha de cosecha"]].map(([v, t]) =>
          `<label class="chip"><input type="radio" name="orden-plan" value="${v}"${
            ordenPlan === v ? " checked" : ""}><span>${t}</span></label>`).join("")}
      </div>
      <div class="chips">
        ${[["todas", "Todas"], ["planificadas", "Sin sembrar"], ["sembradas", "Sembradas"]]
          .map(([v, t]) => `<label class="chip"><input type="radio" name="filtro-plan" value="${v}"${
            filtroPlan === v ? " checked" : ""}><span>${t}</span></label>`).join("")}
      </div>
    </div>

    <p class="nota">Almácigo, tiempo en el bancal y ventana de cosecha. Los dos
    últimos tramos los calcula la app con los días del catálogo: cuando esos
    días se corrigen con lo que pasa acá, el plan se corrige solo.</p>

    <div class="plan-scroll">
      <div class="plan-grafico" style="--ancho:${anchoGrafico}px">
        <div class="plan-meses">
          <div class="plan-nombre"></div>
          <div class="plan-pista">
            ${meses.map((m) => `<div class="mes" style="left:${m.izq}%;width:${m.ancho}%">
              ${m.nombre}${m.nombre === "ene" ? " " + String(m.anio).slice(2) : ""}</div>`).join("")}
          </div>
        </div>
        <div class="plan-cuerpo">
          <!-- La cuadrícula: una línea por mes, de arriba abajo, para seguir con
               la vista dónde empieza y termina cada barra. -->
          ${meses.slice(1).map((m) => `<i class="plan-linea-mes" style="left:calc(var(--sangria) + var(--hueco)
              + (100% - var(--sangria) - var(--hueco)) * ${m.izq / 100})"></i>`).join("")}
          ${enPantalla ? `<div class="linea-hoy" style="left:calc(var(--sangria) + var(--hueco) + (100% - var(--sangria) - var(--hueco)) * ${hoyPct / 100})"></div>` : ""}
          ${filas}
        </div>
      </div>
    </div>

    <div class="plan-leyenda">
      <span><i class="m-almacigo"></i> en almácigo</span>
      <span><i class="m-campo"></i> en el bancal</span>
      <span><i class="m-cosecha"></i> en cosecha</span>
      ${enPantalla ? `<span><i class="m-hoy"></i> hoy</span>` : ""}
    </div>
  </div>
  ${(() => {
    const g = (leer(LS.generaciones, []) || []).find((x) => x.id === genPanel);
    return g ? panelGeneracion(g) : "";
  })()}`;
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun",
                      "jul", "ago", "sep", "oct", "nov", "dic"];

// Un color propio para cada cultivo, sacado de su nombre. Con veintiún
// cultivos en el mismo gráfico, el color es lo que deja seguir uno con la
// vista sin leer cada renglón. El tono sale del nombre —siempre el mismo para
// el mismo cultivo, en cualquier chacra y sin tener que elegirlo a mano— y las
// tres etapas son el mismo tono en tres claridades, así se distinguen entre
// ellas sin perder de qué cultivo son.
function tonoDe(cultivo) {
  let h = 0;
  const s = claveArea(cultivo);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  // Se esquivan los rojos puros, que en esta app significan alerta y atraso.
  return (h < 20 || h > 340) ? (h + 40) % 360 : h;
}
const colorEtapa = (cultivo, etapa) => {
  const h = tonoDe(cultivo);
  if (etapa === "almacigo") return `hsl(${h} 38% 72%)`;
  if (etapa === "campo") return `hsl(${h} 42% 55%)`;
  return `hsl(${h} 52% 34%)`;           // cosecha, la más saturada y oscura
};

// ---- El detalle de una generación, al tocar su barra ----
// Todo lo que se sabe de esa generación y en qué etapa está. Qué se hizo lo
// dicen las hojas de registros —Siembras y Trasplantes—, no un tilde: el panel
// muestra lo que hay, y para marcar algo como hecho lleva al formulario que lo
// registra con los datos ya puestos.
let genPanel = "";
// Lo elegido en el panel para cargar como trasplante; lo usa el formulario.
let trasplanteSugerido = null;

function panelGeneracion(g) {
  const t = tramosDe(g) || {};
  const p = perfil(g.cultivo) || {};
  const sembrada = ("sembrada" in g) ? g.sembrada : g.estado === "Sembrado";

  // El trasplante sale de la ficha del cultivo, que trae todos sus registros.
  const ficha = (leer(LS.fichas, {}) || {})[g.cultivo];
  const tr = (ficha?.trasplantes || []).filter((x) =>
    Number(x.generacion) === Number(g.generacion)
    || (g.siembra_id && x.siembra_id === g.siembra_id));
  const trasplantada = tr.length > 0;
  const cosechado = ficha?.kg_cosechados || 0;
  const hoyIso = hoy();

  // Cada etapa: hecha, en curso, atrasada o por venir. Lo que ya pasó sin
  // registro se marca atrasado: es lo único de la lista que pide hacer algo.
  const estado = (hecha, desde, hasta) => hecha ? ["hecha", "hecho"]
    : (desde && desde < hoyIso && (!hasta || hasta < hoyIso)) ? ["atrasada", "sin registrar"]
    : (desde && desde <= hoyIso) ? ["curso", "en curso"]
    : ["futura", "por venir"];

  const etapas = [
    !t.directa && {
      nombre: "Siembra en bandeja", fecha: t.inicio,
      e: estado(sembrada, t.inicio),
      detalle: sembrada && g.sembrada_el ? `registrada el ${fechaCorta(g.sembrada_el)}` : "",
      boton: sembrada ? "" : `<button type="button" class="secundario" data-panel-sembrar>Registrar siembra</button>`,
    },
    {
      nombre: t.directa ? "Siembra directa" : "Trasplante al bancal", fecha: t.campo,
      e: t.directa ? estado(sembrada, t.campo) : estado(trasplantada, t.campo),
      detalle: t.directa
        ? (sembrada && g.sembrada_el ? `registrada el ${fechaCorta(g.sembrada_el)}` : "")
        : (trasplantada ? `registrado el ${fechaCorta(tr[0].fecha)}${
            tr[0].dias_reales ? ` · ${tr[0].dias_reales} días en bandeja` : ""}` : ""),
      boton: t.directa
        ? (sembrada ? "" : `<button type="button" class="secundario" data-panel-sembrar>Registrar siembra</button>`)
        : (trasplantada ? "" : `<button type="button" class="secundario" data-panel-trasplantar>Registrar trasplante</button>`),
    },
    t.inicioCosecha && {
      nombre: "Cosecha", fecha: t.inicioCosecha, hasta: t.fin,
      e: estado(false, t.inicioCosecha, t.fin),
      // Las cosechas se cargan por cultivo, no por generación: lo que hay es
      // el total del cultivo, y se dice así para no inventar un número.
      detalle: cosechado ? `${num(cosechado, 1)} kg cosechados de ${esc(g.cultivo)} en total` : "",
      boton: "",
    },
  ].filter(Boolean);

  const lugar = g.sector && bancalesDe(g).length
    ? `${esc(g.sector)} · bancal${bancalesDe(g).length > 1 ? "es" : ""} ${bancalesDe(g).join(", ")}`
    : "sin ubicar en el mapa";

  return `<aside class="panel-gen" role="dialog" aria-label="${esc(g.cultivo)} ${nombreGen(g)}">
    <div class="panel-cab">
      <div>
        <h3>${esc(g.cultivo)} <span>${nombreGen(g)}</span></h3>
        <span class="etiqueta ${sembrada ? "ok" : ""}">${sembrada ? "sembrada" : "planificada"}</span>
      </div>
      <button type="button" class="cerrar-panel" id="cerrar-panel" aria-label="Cerrar">&times;</button>
    </div>

    <div class="panel-etapas">
      ${etapas.map((x) => `<div class="etapa ${x.e[0]}">
        <div class="etapa-marca"></div>
        <div class="etapa-texto">
          <b>${x.nombre}</b>
          <span>${fechaCorta(x.fecha)}${x.hasta ? ` al ${fechaCorta(x.hasta)}` : ""} · ${x.e[1]}</span>
          ${x.detalle ? `<small>${x.detalle}</small>` : ""}
          ${x.boton}
        </div>
      </div>`).join("")}
    </div>

    <div class="datos">
      <div class="dato"><span>Dónde</span><b>${lugar}</b></div>
      <div class="dato"><span>Camas</span><b>${num(Number(g.camas) || 0, 1)}</b></div>
      <div class="dato"><span>Método</span><b>${esc(g.metodo || (t.directa ? "Siembra directa" : "Trasplante"))}</b></div>
      ${p.lineas_bancal ? `<div class="dato"><span>Marco</span><b>${num(p.lineas_bancal)} líneas a ${num(p.distancia_cm)} cm</b></div>` : ""}
    </div>

    <div class="panel-acciones">
      <button type="button" class="secundario" data-editar-gen="${esc(g.id)}">Editar</button>
      <button type="button" class="secundario" data-panel-ficha>Ver ficha del cultivo</button>
      ${sembrada ? "" : `<button type="button" class="secundario peligro" data-panel-quitar>Sacar del plan</button>`}
    </div>
    <p class="nota">Para correr las fechas, arrastrá la barra en el gráfico.</p>
  </aside>`;
}

function prepararPanelGeneracion() {
  // Tocar una barra abre su detalle; tocarla de nuevo lo cierra.
  document.querySelectorAll("[data-gen]").forEach((fila) => {
    fila.addEventListener("click", () => {
      if (fila.dataset.recienMovida) { delete fila.dataset.recienMovida; return; }
      genPanel = genPanel === fila.dataset.gen ? "" : fila.dataset.gen;
      const g = (leer(LS.generaciones, []) || []).find((x) => x.id === genPanel);
      render("plan", true);
      // El estado del trasplante sale de la ficha del cultivo.
      if (g) traerFicha(g.cultivo);
    });
  });

  const panel = $(".panel-gen");
  if (!panel) return;
  const g = (leer(LS.generaciones, []) || []).find((x) => x.id === genPanel);
  if (!g) return;

  $("#cerrar-panel").onclick = () => { genPanel = ""; render("plan", true); };
  // Escape también cierra, que es lo que se espera de un panel así.
  document.onkeydown = (e) => {
    if (e.key === "Escape" && genPanel) { genPanel = ""; render("plan", true); }
  };

  // Registrar algo lleva al formulario con los datos puestos. Lo que marca la
  // etapa como hecha es ese registro, no un tilde en el plan.
  panel.querySelectorAll("[data-panel-sembrar]").forEach((b) => {
    b.onclick = () => {
      siembraSugerida = { cultivo: g.cultivo, generacion: g.generacion,
                          directa: !g.fecha_almacigo };
      genPanel = "";
      render("siembras");
    };
  });
  panel.querySelectorAll("[data-panel-trasplantar]").forEach((b) => {
    b.onclick = () => {
      trasplanteSugerido = { cultivo: g.cultivo, generacion: g.generacion,
                             siembra_id: g.siembra_id || "" };
      genPanel = "";
      render("trasplantes");
    };
  });
  const ficha = panel.querySelector("[data-panel-ficha]");
  if (ficha) ficha.onclick = () => {
    cultivoAbierto = g.cultivo; genPanel = "";
    render("plan");
  };
  const quitar = panel.querySelector("[data-panel-quitar]");
  if (quitar) quitar.onclick = () => {
    if (!confirm(`¿Sacar ${g.cultivo} ${nombreGen(g)} del plan?`)) return;
    guardarRegistro("generacion_borrar", { generacion_id: g.id }, "Sacada del plan ✓");
    const quedan = (leer(LS.generaciones, []) || []).filter((x) => x.id !== g.id);
    escribir(LS.generaciones, quedan);
    replanearCultivo(g.cultivo, quedan);
    genPanel = "";
    render("plan", true);
  };
}

// Correr una generación arrastrándola en el gráfico. Es la forma natural de
// decir "esto va dos semanas más tarde": se ve contra qué queda, que es
// justamente lo que no se ve escribiendo una fecha en un formulario.
//
// Va con eventos de puntero, que son los mismos para el mouse y para el dedo.
// Durante el arrastre solo se mueve la barra; recién al soltar se guarda, para
// que corregir la mano no mande veinte registros.
function engancharArrastre() {
  const grafico = $(".plan-grafico");
  if (!grafico) return;
  const pista = grafico.querySelector(".plan-gen .plan-pista");
  if (!pista) return;

  // Cuántos días mide un píxel, para traducir el movimiento a fechas.
  const meses = grafico.querySelectorAll(".plan-meses .mes").length || 12;
  const diasTotales = Math.round(meses * 30.44);
  const porPixel = diasTotales / pista.getBoundingClientRect().width;

  document.querySelectorAll("[data-mover]").forEach((fila) => {
    const barra = fila.querySelector(".plan-pista");
    let x0 = 0, corrido = 0, arrastrando = false;

    barra.onpointerdown = (e) => {
      // Con el botón derecho no, y en el teléfono sin robarle el scroll a la
      // página: solo se toma el gesto si es claramente horizontal.
      if (e.button !== 0 && e.pointerType === "mouse") return;
      arrastrando = true;
      x0 = e.clientX;
      corrido = 0;
      try { barra.setPointerCapture(e.pointerId); } catch (_) { /* sin captura igual anda */ }
      fila.classList.add("arrastrando");
    };

    barra.onpointermove = (e) => {
      if (!arrastrando) return;
      corrido = Math.round((e.clientX - x0) * porPixel);
      barra.style.transform = `translateX(${e.clientX - x0}px)`;
      fila.querySelector(".plan-nombre").dataset.corrido = corrido
        ? `${corrido > 0 ? "+" : ""}${corrido} d` : "";
    };

    const soltar = (e) => {
      if (!arrastrando) return;
      arrastrando = false;
      fila.classList.remove("arrastrando");
      barra.style.transform = "";
      delete fila.querySelector(".plan-nombre").dataset.corrido;
      try { barra.releasePointerCapture(e.pointerId); } catch (_) { /* ya soltado */ }
      if (!corrido) return;
      // Si se movio, el clic que el navegador dispara al soltar no abre el
      // panel: se arrastraba, no se queria ver el detalle.
      fila.dataset.recienMovida = "1";
      correrGeneracion(fila.dataset.mover, corrido);
    };
    barra.onpointerup = soltar;
    barra.onpointercancel = soltar;
  });
}

// Guarda la generación con sus fechas corridas. Se piden las dos porque una
// siembra directa no tiene fecha de bandeja y un trasplante sí.
function correrGeneracion(id, dias) {
  const gens = leer(LS.generaciones, []) || [];
  const g = gens.find((x) => x.id === id);
  if (!g || !dias) return;

  const corrida = (f) => (f ? sumarDias(f, dias) : "");
  const nueva = {
    ...g,
    fecha_almacigo: corrida(g.fecha_almacigo),
    fecha_campo: corrida(g.fecha_campo),
  };
  const antes = g.fecha_almacigo || g.fecha_campo;
  const despues = nueva.fecha_almacigo || nueva.fecha_campo;

  guardarRegistro("generaciones", {
    generacion_id: g.id, cultivo: g.cultivo, generacion: g.generacion,
    metodo: g.metodo, fecha_almacigo: nueva.fecha_almacigo,
    fecha_campo: nueva.fecha_campo, camas: g.camas, sector: g.sector,
    // Solo números: si la planilla alguna vez convirtió "4, 5, 6" en una
    // fecha, reenviarlo tal cual lo volvía a guardar dañado.
    bancales: bancalesDe(g).join(", "), estado: g.estado, origen: "AMA",
  }, `${g.cultivo} ${nombreGen(g)}: ${fechaCorta(antes)} → ${fechaCorta(despues)} ✓`);

  // Se mueve en la copia local para que el gráfico responda al instante.
  escribir(LS.generaciones, gens.map((x) => (x.id === id ? nueva : x)));
  render("plan", true);
}

// La barra de la sección Plan. Estaba repetida en cada pantalla, con el
// formato variando un poco en cada una: se escribe una sola vez acá.
//
// En el teléfono es una fila de pestañas; en pantallas anchas es una columna a
// la izquierda que se pliega a solo iconos. Planificar y mirar el campo es
// trabajo de notebook, y en columna quedan a la vista todas las secciones sin
// comerle ancho al gráfico.
const SECCIONES_PLAN = [
  { id: "lista", nombre: "Resumen", icono: "☰", siempre: true },
  { id: "planificar", nombre: "Cultivos", icono: "🌱", siempre: true },
  { id: "grafico", nombre: "Plan estratégico", icono: "▤", soloAncha: true },
  { id: "mapa", nombre: "Mapa", icono: "▦", soloAncha: true },
];

// Ancho mínimo para planificar de verdad. Debajo de eso, el gráfico y el mapa
// no se leen: veinticinco bancales en 375 px son columnas de quince píxeles.
const ANCHO_PLANIFICAR = 900;
const pantallaAncha = () => window.innerWidth >= ANCHO_PLANIFICAR;

function barraDePlan(activa) {
  return `<nav class="plan-nav${leer(LS.planPlegado, false) ? " plegada" : ""}">
    <button type="button" class="plan-nav-btn plegar" id="plegar-plan"
            title="Mostrar u ocultar los nombres">
      <span class="ico">☰</span><span class="txt">Ocultar</span>
    </button>
    ${SECCIONES_PLAN.filter((s) => s.siempre || pantallaAncha()).map((s) => `
      <button type="button" class="plan-nav-btn${s.id === activa ? " activa" : ""}"
              data-plan-vista="${s.id}">
        <span class="ico">${s.icono}</span><span class="txt">${esc(s.nombre)}</span>
      </button>`).join("")}
    <button type="button" class="plan-nav-btn" data-ir-configuracion>
      <span class="ico">⚙</span><span class="txt">Configuración</span>
    </button>
  </nav>`;
}

// El gráfico y el mapa no se muestran en pantalla angosta, y se dice por qué.
const tarjetaSoloNotebook = (que) => `<div class="tarjeta">
  <h2>${esc(que)}</h2>
  <p class="nota">Esta pantalla es para la computadora. ${esc(que)} necesita
  ancho para leerse: veinticinco bancales en la pantalla de un teléfono quedan
  en columnas de quince píxeles, y las fechas no entran.</p>
  <p class="nota">Desde el teléfono, <b>Resumen</b> tiene todo lo planificado:
  los cultivos, los sectores y lo que toca sembrar.</p>
</div>`;

// ---- Mapa de cultivos ----
// Dónde va cada generación y por cuánto tiempo. Es la otra mitad de la
// planificación: el plan estratégico dice CUÁNDO, el mapa dice DÓNDE, y hasta
// que las dos coinciden no se sabe si el plan entra en el campo que hay.
//
// Un bancal se ocupa desde que la planta va a tierra hasta que termina la
// cosecha. El tiempo en bandeja no cuenta: ese no ocupa bancal.
let genSeleccionada = "";

const bancalesDe = (g) => String(g.bancales || "")
  .split(",").map((x) => parseInt(x, 10)).filter((n) => n > 0);

function ocupacionDe(g) {
  const t = tramosDe(g);
  if (!t) return null;
  return { desde: t.campo, hasta: t.fin };
}

// Los bancales que una generación tomaría si se la pone empezando en `inicio`.
// Se usa tanto para dibujar la vista previa como para guardar.
function bancalesQueOcuparia(g, inicio, cuantosHay) {
  const n = Math.max(1, Math.round(Number(g.camas) || 1));
  const desde = Math.min(inicio, Math.max(1, cuantosHay - n + 1));
  return Array.from({ length: n }, (_, i) => desde + i).filter((b) => b <= cuantosHay);
}

// Qué generaciones chocarían con esta si se la pusiera en esos bancales: mismo
// sector, bancal compartido y fechas superpuestas.
function chocanCon(g, sector, bancales, todas) {
  const o = ocupacionDe(g);
  if (!o) return [];
  const set = new Set(bancales);
  return todas.filter((x) => {
    if (x.id === g.id || claveArea(x.sector) !== claveArea(sector)) return false;
    if (!bancalesDe(x).some((b) => set.has(b))) return false;
    const ox = ocupacionDe(x);
    return ox && ox.desde <= o.hasta && o.desde <= ox.hasta;
  });
}

// Medidas del lienzo, en píxeles a zoom 100 %. Un bancal es una columna y un
// mes una fila; el tiempo va hacia abajo, como en la planilla de Heirloom.
const LZ = { bancal: 22, mes: 36, cab: 50, meses: 34, borde: 8, paso: 25, hueco: 50 };

// Dónde está mirando el mapa: desplazamiento y zoom. Vive fuera del render para
// que no se pierda al redibujar después de ubicar algo. null = todavía no se
// acomodó: la primera vez se ajusta para que entre todo el campo.
let vistaMapa = null;

// La temporada en píxeles: de julio a junio, un día mide lo mismo siempre.
function escalaTemporada() {
  const d0 = inicioDeTemporada();
  const d1 = new Date(d0); d1.setFullYear(d1.getFullYear() + 1);
  const ini = Math.floor(d0.getTime() / 86400000);
  const dias = Math.max(1, Math.floor(d1.getTime() / 86400000) - ini);
  const alto = 12 * LZ.mes;
  return { d0, d1, ini, dias, alto, y: (iso) => ((diaDe(iso) - ini) * alto) / dias };
}

/* Dónde va cada sector en el lienzo.
   La posición se guarda en las columnas "fila" y "columna" del sector, en
   pasos de 25 px: columna = x / 25 + 1 y fila = y / 25 + 1. El +1 mantiene el
   0 como "nunca se acomodó", que es lo que tienen todos los sectores cargados
   antes (se revisaron las seis chacras el 28/09: ninguno había usado la
   disposición en filas y columnas que había antes). Así no hizo falta tocar el
   servidor ni la planilla. Los que nunca se movieron van en fila, debajo de los
   que sí. */
function bloquesDelMapa() {
  const alto = escalaTemporada().alto;
  const lista = sectores().map((s) => {
    const n = Number(s.bancales) || 0;
    return {
      sector: s.sector, n,
      w: LZ.meses + n * LZ.bancal + 2 * LZ.borde,
      h: LZ.cab + alto + LZ.borde,
      x: Number(s.columna) > 0 ? (Number(s.columna) - 1) * LZ.paso : null,
      y: Number(s.fila) > 0 ? (Number(s.fila) - 1) * LZ.paso : null,
    };
  });
  const puestos = lista.filter((b) => b.x !== null && b.y !== null);
  // En filas de hasta ~2000 px: todos en una sola fila, "Ajustar" los dejaba
  // en un 25 % ilegible con media ventana vacía abajo.
  const ANCHO_FILA = 2000;
  let x = 0, altoFila = 0;
  let y = puestos.length ? Math.max(...puestos.map((b) => b.y + b.h)) + LZ.hueco : 0;
  lista.forEach((b) => {
    if (b.x !== null && b.y !== null) return;
    if (x > 0 && x + b.w > ANCHO_FILA) { x = 0; y += altoFila + LZ.hueco; altoFila = 0; }
    b.x = x; b.y = y;
    x += b.w + LZ.hueco;
    altoFila = Math.max(altoFila, b.h);
  });
  return lista;
}

// Los bancales de un sector que están libres en las fechas de una generación.
// Es la franja verde que aparece al arrastrarla: se ve el hueco antes de soltar.
function bancalesLibres(g, sector, n, todas) {
  const libres = [];
  for (let b = 1; b <= n; b++) {
    if (!chocanCon(g, sector, [b], todas).length) libres.push(b);
  }
  return libres;
}

// La franja de bancales libres, en tramos seguidos para no dibujar veinticinco
// cajitas sueltas.
function franjaLibre(g, sector, n, todas, e) {
  const o = ocupacionDe(g);
  if (!o) return "";
  const top = Math.max(0, e.y(o.desde));
  const alto = Math.min(e.alto, e.y(o.hasta)) - top;
  if (alto <= 0) return "";
  const libres = bancalesLibres(g, sector, n, todas);
  const tramos = [];
  libres.forEach((b) => {
    const t = tramos[tramos.length - 1];
    if (t && t[1] === b - 1) t[1] = b; else tramos.push([b, b]);
  });
  return tramos.map(([a, z]) => `<i class="lz-libre" style="left:${(a - 1) * LZ.bancal}px;
    width:${(z - a + 1) * LZ.bancal}px;top:${top}px;height:${alto}px"></i>`).join("");
}

function mapaDeCultivos() {
  const todas = (leer(LS.generaciones, []) || []);
  const asignadas = todas.filter((g) => g.sector && bancalesDe(g).length);
  const sueltas = todas.filter((g) => !(g.sector && bancalesDe(g).length));
  const sel = todas.find((g) => g.id === genSeleccionada);
  const e = escalaTemporada();
  const bloques = bloquesDelMapa();

  if (!bloques.length) {
    return `<div class="tarjeta">
      <h2>Mapa de cultivos</h2>
      ${barraDePlan("mapa")}
      <p class="nota">Todavía no hay sectores. Cargalos en Configuración y
      aparecen acá para ubicar las generaciones.</p>
    </div>`;
  }

  // Los meses del eje vertical, con su línea.
  const meses = [];
  const cur = new Date(e.d0);
  while (cur < e.d1) {
    const sig = new Date(cur); sig.setMonth(sig.getMonth() + 1);
    const top = e.y(isoDe(cur));
    meses.push({ nombre: MESES_CORTOS[cur.getMonth()], top, alto: e.y(isoDe(sig)) - top });
    cur.setMonth(cur.getMonth() + 1);
  }
  const hoyY = e.y(hoy());

  const puesta = (g) => {
    const o = ocupacionDe(g);
    if (!o) return "";
    const bs = bancalesDe(g);
    const desdeB = Math.min(...bs), hastaB = Math.max(...bs);
    const top = Math.max(0, e.y(o.desde));
    const fin = Math.min(e.alto, e.y(o.hasta));
    if (fin <= top) return "";
    const sembrada = ("sembrada" in g) ? g.sembrada : g.estado === "Sembrado";
    const ancho = (hastaB - desdeB + 1) * LZ.bancal;
    // Con dos bancales o más entra el nombre acostado; con uno, va parado.
    const acostado = ancho >= 2 * LZ.bancal;
    return `<div class="lz-puesta${sembrada ? " sembrada" : ""}${acostado ? " acostada" : ""}${
      g.id === genSeleccionada ? " elegida" : ""}" data-puesta="${esc(g.id)}"
      style="left:${(desdeB - 1) * LZ.bancal}px;width:${ancho - 1}px;top:${top}px;
             height:${fin - top}px;background:${colorEtapa(g.cultivo, sembrada ? "cosecha" : "campo")}"
      title="${esc(g.cultivo)} ${nombreGen(g)} · bancal ${bs.join(", ")} · ${
        fechaCorta(o.desde)} a ${fechaCorta(o.hasta)}${sembrada ? " · sembrada" : ""}">
      <span>${esc(g.cultivo)} ${nombreGen(g)}${acostado
        ? `<small>${fechaCorta(o.desde)} – ${fechaCorta(o.hasta)}</small>` : ""}</span>
    </div>`;
  };

  const bloque = (b) => {
    const aqui = asignadas.filter((g) => claveArea(g.sector) === claveArea(b.sector));
    return `<div class="lz-bloque" data-bloque="${esc(b.sector)}"
                 style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px">
      <div class="lz-cab" data-agarrar="${esc(b.sector)}" title="Arrastrá para mover el sector">
        <span class="lz-asa">⠿</span><b>${esc(b.sector)}</b>
        <span class="lz-dato">${b.n} bancales · ${aqui.length} generaciones</span>
      </div>
      <!-- Los números de bancal arriba: sin ellos hay que contar columnas
           para saber cuál es el 17. -->
      <div class="lz-numeros" style="left:${LZ.borde + LZ.meses}px">
        ${Array.from({ length: b.n }, (_, i) => `<span${
          (i + 1) % 5 === 0 || i === 0 ? ' class="marcado"' : ""}>${i + 1}</span>`).join("")}
      </div>
      <div class="lz-meses" style="left:${LZ.borde}px;top:${LZ.cab}px;height:${e.alto}px">
        ${meses.map((m) => `<span style="top:${m.top}px;height:${m.alto}px">${m.nombre}</span>`).join("")}
      </div>
      <div class="lz-grilla" data-grilla="${esc(b.sector)}" data-n="${b.n}"
           style="left:${LZ.borde + LZ.meses}px;top:${LZ.cab}px;width:${b.n * LZ.bancal}px;
                  height:${e.alto}px;--bancal:${LZ.bancal}px">
        ${meses.slice(1).map((m) => `<i class="lz-linea-mes" style="top:${m.top}px"></i>`).join("")}
        ${sel ? franjaLibre(sel, b.sector, b.n, todas, e) : ""}
        ${aqui.map(puesta).join("")}
        ${hoyY >= 0 && hoyY <= e.alto ? `<i class="lz-hoy" style="top:${hoyY}px"></i>` : ""}
        <div class="lz-previa"></div>
      </div>
    </div>`;
  };

  const porCultivo = new Map();
  sueltas.forEach((g) => {
    if (!porCultivo.has(g.cultivo)) porCultivo.set(g.cultivo, []);
    porCultivo.get(g.cultivo).push(g);
  });

  const o = sel ? ocupacionDe(sel) : null;
  return `
  <div class="tarjeta">
    <h2>Mapa de cultivos <small>${asignadas.length} de ${todas.length} ubicadas</small></h2>
    ${barraDePlan("mapa")}

    <div class="lz-estado">${sel
      ? `<b>${esc(sel.cultivo)} ${nombreGen(sel)}</b>
         <span>${Math.max(1, Math.round(Number(sel.camas) || 1))} bancal(es)${
           o ? ` · ${fechaCorta(o.desde)} a ${fechaCorta(o.hasta)}` : ""}${
           sel.sector ? ` · ${esc(sel.sector)} ${bancalesDe(sel).join(", ")}` : " · sin ubicar"}</span>
         <span class="lz-ayuda">En verde, los bancales libres en esas fechas: tocá uno o arrastrala.</span>
         ${sel.sector ? `<button type="button" class="secundario" id="sacar-del-mapa">Sacar del mapa</button>` : ""}
         <button type="button" class="secundario" id="cancelar-eleccion">Listo</button>`
      : `<span class="lz-ayuda">Arrastrá un sector por su título para acomodarlo como está
         en el campo. Arrastrá una generación de la lista a un bancal, o una ya puesta a
         otro. La rueda del mouse acerca y aleja; arrastrando un lugar vacío se mueve el mapa.</span>`}
    </div>

    <div class="mapa-con-lista">
      <div class="mapa-panel">
        <div class="mapa-zoom">
          <button type="button" class="secundario" data-zoom="-" title="Alejar">−</button>
          <span id="nivel-zoom">100%</span>
          <button type="button" class="secundario" data-zoom="+" title="Acercar">+</button>
          <button type="button" class="secundario ajustar" id="ajustar-mapa"
                  title="Que entre todo el campo">Ajustar</button>
        </div>
        <div class="lz-vista" id="lz-vista">
          <div class="lz-lienzo" id="lz-lienzo">${bloques.map(bloque).join("")}</div>
        </div>
      </div>

      <div class="lista-panel">
        <h3 class="sub">Sin ubicar <small>${sueltas.length}</small></h3>
        <div class="lista-scroll">
    ${porCultivo.size ? [...porCultivo.entries()].map(([cultivo, lista]) => `
      <details class="gen-cultivo"${sel && sel.cultivo === cultivo ? " open" : ""}>
        <summary><i class="lz-color" style="background:${colorEtapa(cultivo, "campo")}"></i>${
          esc(cultivo)} <span>${lista.length}</span></summary>
        ${lista.map((g) => {
          const oc = ocupacionDe(g);
          return `<div class="registro elegible lz-arrastrable${g.id === genSeleccionada ? " elegida" : ""}"
                       data-elegir="${esc(g.id)}" role="button" tabindex="0"
                       title="Arrastrala a un bancal, o tocala y después tocá el bancal">
            <div>
              <div class="detalle">${nombreGen(g, todas)} <span class="gen">${
                Math.max(1, Math.round(Number(g.camas) || 1))} bancal(es)</span></div>
              <div class="cuando">${oc ? `ocupa del ${fechaCorta(oc.desde)} al ${fechaCorta(oc.hasta)}`
                : "sin fechas suficientes"}</div>
            </div>
            <span class="lz-asa">⠿</span>
          </div>`;
        }).join("")}
      </details>`).join("")
      : `<p class="nota">Están todas ubicadas.</p>`}
        </div>
      </div>
    </div>
  </div>`;
}

// ---- Planificar generaciones desde la app ----
// Escalonar un cultivo es la decisión central de la temporada: nueve
// generaciones de brócoli cada dos semanas dan cosecha continua, y una sola
// grande da un pico y después nada. Se carga así, como serie, porque es como
// se piensa; cargar nueve fechas a mano invita a equivocarse.
// ---- Editar lo planificado ----
// Qué cultivo está desplegado en la lista, qué generación se está editando y
// de qué cultivo se está cambiando el marco. Fuera del render para que un
// redibujado no cierre lo que se estaba mirando.
let cultivoEditando = "";
let genEditando = "";
let marcoEditando = "";

// El día en que arranca una generación: la bandeja, o el bancal si es directa.
const arranqueDe = (g) => g.fecha_almacigo || g.fecha_campo || "";
const esSembrada = (g) => (("sembrada" in g) ? g.sembrada : g.estado === "Sembrado");

/* Cuántos días pasa en bandeja este cultivo EN ESTE PLAN: los que ya tienen
   sus generaciones con fecha a campo. Si todas dicen lo mismo, ese es el dato;
   si no coinciden, se toma el que más se repite. Sirve para que las
   generaciones nuevas salgan iguales a las que ya estaban: antes las nuevas
   se calculaban con el catálogo por estación (30 días en primavera) y las
   que venían del plan tenían 40, así que el mismo repollo trasplantaba en
   fechas distintas según cuándo se lo había cargado (28/09). */
function diasBandejaDelCultivo(cultivo, gens = leer(LS.generaciones, []) || []) {
  const cuenta = {};
  gens.filter((g) => claveArea(g.cultivo) === claveArea(cultivo) && g.fecha_almacigo && g.fecha_campo)
    .forEach((g) => {
      const d = diaDe(g.fecha_campo) - diaDe(g.fecha_almacigo);
      if (d > 0) cuenta[d] = (cuenta[d] || 0) + 1;
    });
  const [dias] = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0] || [];
  return dias ? Number(dias) : 0;
}

// En cuántas partes iguales se puede partir: las que dejan bancales enteros.
function partesPosibles(g) {
  const c = Number(g.camas) || 0;
  if (c < 2 || !Number.isInteger(c)) return [];
  return Array.from({ length: c - 1 }, (_, i) => i + 2).filter((k) => c % k === 0);
}

function formularioGeneracion(g) {
  const sembrada = esSembrada(g);
  const directa = g.metodo === "Siembra directa" || (!g.fecha_almacigo && g.fecha_campo);
  const bloqueo = sembrada ? " disabled" : "";
  return `<form class="editar-gen" data-form-gen="${esc(g.id)}">
    <div class="fila">
      <div>
        <label>¿Cómo se siembra?</label>
        <select name="metodo"${bloqueo}>
          <option value="Trasplante"${directa ? "" : " selected"}>En almácigo</option>
          <option value="Siembra directa"${directa ? " selected" : ""}>Siembra directa</option>
        </select>
      </div>
      <div>
        <label>Bancales</label>
        <input type="text" name="camas" inputmode="decimal" value="${esc(String(g.camas || ""))}">
      </div>
    </div>
    <div class="fila">
      <div class="solo-almacigo"${directa ? " hidden" : ""}>
        <label>Siembra en bandeja</label>
        <input type="date" name="almacigo" value="${esc(g.fecha_almacigo || "")}"${bloqueo}>
      </div>
      <div>
        <label class="rotulo-campo">${directa ? "Siembra en el bancal" : "A campo <small>(opcional)</small>"}</label>
        <input type="date" name="campo" value="${esc(g.fecha_campo || "")}"${bloqueo}>
      </div>
    </div>
    ${sembrada ? `<p class="nota">Ya se sembró: las fechas y el método son un hecho y no se cambian.</p>` : ""}
    <div class="editar-gen-botones">
      <button class="principal">Guardar</button>
      <button type="button" class="secundario" data-cancelar-gen>Cancelar</button>
    </div>
    ${partesPosibles(g).length ? `<div class="partir">
      <span>Partir para ubicarla en bancales separados:</span>
      ${partesPosibles(g).map((k) => `<button type="button" class="secundario"
        data-partir="${esc(g.id)}" data-partes="${k}">${k} de ${(Number(g.camas) || 0) / k}</button>`).join("")}
    </div>` : ""}
  </form>`;
}

function cultivoEditable(cultivo, lista, todas) {
  const bancales = lista.reduce((a, g) => a + (Number(g.camas) || 0), 0);
  const ya = enPlan(cultivo) || {};
  const p = perfil(cultivo) || {};
  const abierto = claveArea(cultivoEditando) === claveArea(cultivo);
  return `<details class="gen-cultivo" data-cultivo-lista="${esc(cultivo)}"${abierto ? " open" : ""}>
    <summary><i class="lz-color" style="background:${colorEtapa(cultivo, "campo")}"></i>${
      esc(cultivo)} <span>${lista.length} generación(es) · ${num(bancales, 1)} bancales${
      ya.cosecha_esperada_kg ? ` · ${num(ya.cosecha_esperada_kg)} kg` : ""}</span></summary>
    <div class="cultivo-acciones">
      <button type="button" class="secundario" data-sumar-a="${esc(cultivo)}">+ Generaciones</button>
      <button type="button" class="secundario" data-marco="${esc(cultivo)}">Marco y rinde</button>
      <button type="button" class="secundario" data-ficha="${esc(cultivo)}">Ficha</button>
    </div>
    ${claveArea(marcoEditando) === claveArea(cultivo) ? `<form class="editar-gen" data-form-marco="${esc(cultivo)}">
      <div class="fila">
        <div><label>Líneas por bancal</label>
          <input type="text" name="lineas" inputmode="numeric" value="${esc(String(ya.lineas || p.lineas_bancal || ""))}"></div>
        <div><label>Distancia (cm)</label>
          <input type="text" name="distancia" inputmode="numeric" value="${esc(String(ya.distancia_cm || p.distancia_cm || ""))}"></div>
      </div>
      <label>Rinde esperado (kg/m²)</label>
      <input type="text" name="rinde" inputmode="decimal" value="${esc(String(ya.rinde_kg_m2 || p.rinde_ref_kg_m2 || ""))}">
      ${lista.some((g) => g.fecha_almacigo) ? `
      <label>Días en almácigo <small>(todas las generaciones sin sembrar)</small></label>
      <input type="text" name="bandeja" inputmode="numeric" value="${
        diasBandejaDelCultivo(cultivo, todas) || diasAlmacigo(cultivo, arranqueDe(lista[0])) || ""}">
      <p class="nota">De la siembra en bandeja al bancal. Se escribe la fecha a campo de
      cada generación, así todas trasplantan igual. De ahí a la cosecha van
      ${p.dias_trasplante_cosecha ? `${p.dias_trasplante_cosecha} días` : "los días"} del catálogo.</p>` : ""}
      <div class="editar-gen-botones">
        <button class="principal">Guardar</button>
        <button type="button" class="secundario" data-cancelar-marco>Cancelar</button>
      </div>
    </form>` : ""}
    ${lista.map((g) => {
      const sembrada = esSembrada(g);
      const directa = !g.fecha_almacigo;
      return `<div class="registro${g.id === genEditando ? " editando" : ""}" data-fila-gen="${esc(g.id)}">
        <div>
          <div class="detalle">${nombreGen(g, todas)}${
            sembrada ? ` <span class="etiqueta ok">sembrada</span>` : ""}</div>
          <div class="cuando">${fechaCorta(arranqueDe(g))}${directa ? " · directa" : " · en bandeja"}${
            g.camas ? ` · ${num(g.camas, 1)} bancal(es)` : ""}${
            g.sector ? ` · ${esc(g.sector)}${bancalesDe(g).length ? " " + bancalesDe(g).join(", ") : ""}` : ""}</div>
        </div>
        <button type="button" class="quitar editar" data-editar-gen="${esc(g.id)}"
          aria-label="Editar" title="Editar">✎</button>
        ${sembrada ? "" : `<button type="button" class="quitar"
          data-borrar-gen="${esc(g.id)}" aria-label="Quitar del plan" title="Quitar del plan">&times;</button>`}
      </div>
      ${g.id === genEditando ? formularioGeneracion(g) : ""}`;
    }).join("")}
  </details>`;
}

function pantallaPlanificar() {
  // Dentro de cada cultivo, por fecha: el orden en que se siembran, que es el
  // que importa al mirar la lista. El número de generación queda en el nombre.
  const gens = (leer(LS.generaciones, []) || [])
    .slice()
    .sort((a, b) => a.cultivo.localeCompare(b.cultivo)
      || arranqueDe(a).localeCompare(arranqueDe(b)) || a.generacion - b.generacion);

  const porCultivo = new Map();
  gens.forEach((g) => {
    if (!porCultivo.has(g.cultivo)) porCultivo.set(g.cultivo, []);
    porCultivo.get(g.cultivo).push(g);
  });

  return `
  <div class="tarjeta">
    <h2>Cultivos de la temporada</h2>
    ${barraDePlan("planificar")}

    <!-- El formulario a la izquierda y lo planificado a la derecha, cada uno
         con su scroll: se carga una serie mirando qué hay. En el teléfono se
         apilan. -->
    <div class="planificar-dos">
    <div class="planificar-form">
    <p class="nota">Todo lo de un cultivo se decide acá: el marco de plantación,
    cuántas generaciones y cada cuánto. La superficie, las plantas y los kilos
    esperados salen de esos números, no se cargan aparte.</p>

    <form id="form-generaciones">
      <label>Cultivo</label>
      ${buscadorCultivo("", "cultivo")}

      <h3 class="sub">Marco de plantación</h3>
      <p class="nota">Viene del catálogo. Si acá se hace distinto, cambialo:
      queda para esta chacra y de acá salen las plantas y los kilos.</p>
      <div class="fila">
        <div>
          <label>Líneas por bancal</label>
          <input type="text" name="lineas" inputmode="numeric">
        </div>
        <div>
          <label>Distancia (cm)</label>
          <input type="text" name="distancia" inputmode="numeric">
        </div>
      </div>
      <label>Rinde esperado (kg/m²)</label>
      <input type="text" name="rinde" inputmode="decimal">

      <h3 class="sub">Generaciones</h3>
      <label>¿Cómo se siembra?</label>
      <select name="metodo">
        <option value="Trasplante">En almácigo, para trasplantar</option>
        <option value="Siembra directa">Siembra directa</option>
      </select>

      <div class="fila">
        <div>
          <label>Primera siembra</label>
          <input type="date" name="desde" value="${hoy()}" required>
        </div>
        <div>
          <label>Generaciones</label>
          <input type="number" name="cuantas" value="1" min="1" max="30"
                 inputmode="numeric" required>
        </div>
      </div>

      <div class="fila">
        <div>
          <label>Cada cuántos días</label>
          <input type="number" name="cada" value="14" min="1" max="120"
                 inputmode="numeric">
        </div>
        <div>
          <label>Camas por generación</label>
          <input type="text" name="camas" inputmode="decimal" value="1">
        </div>
      </div>

      <label>Sector <small>(opcional, se ubica después en el mapa)</small></label>
      <select name="sector">
        <option value="">Sin asignar</option>
        ${sectores().map((s) => `<option>${esc(s.sector)}</option>`).join("")}
      </select>

      <div class="calculo" id="calculo-generaciones"></div>

      <button class="principal">Agregar al plan</button>
    </form>
    </div>

    <div class="planificar-lista">
    <h3 class="sub">En el plan <small>${gens.length} generaciones</small></h3>
    <div class="lista-scroll">
    ${porCultivo.size ? [...porCultivo.entries()].map(([cultivo, lista]) =>
        cultivoEditable(cultivo, lista, gens)).join("")
      : `<p class="nota">Todavía no hay generaciones planificadas.</p>`}
    </div>
    <p class="nota">✎ edita una generación: método, fechas, bancales, o partirla
    para ubicar sus bancales por separado. De las ya sembradas solo se cambian
    los bancales: la siembra es un hecho.</p>
    </div>
    </div>
  </div>`;
}

// ---- Ficha de un cultivo ----
// Todo lo que la app sabe de un cultivo, junto. Hoy, para responder "¿cuánto
// tarda el brócoli?" o "¿cuánto llevamos cosechado?" hay que abrir la planilla.
// Lo que se muestra sale de tres lados distintos y conviene no mezclarlos: el
// catálogo (común a las seis chacras), el plan de esta chacra, y lo que de
// verdad pasó en el campo.
function fichaCultivo(cultivo) {
  const p = perfil(cultivo) || {};
  const enElPlan = enPlan(cultivo);
  const f = (leer(LS.fichas, {}) || {})[cultivo];
  const m2 = bancalM2();

  const dato = (etiqueta, valor) => valor
    ? `<div class="dato"><span>${etiqueta}</span><b>${valor}</b></div>` : "";

  // --- lo que dice el catálogo ---
  const almacigo = (p.dias_almacigo_oi && p.dias_almacigo_pv)
    ? `${p.dias_almacigo_pv} a ${p.dias_almacigo_oi} días <small>(verano / invierno)</small>`
    : (p.dias_almacigo ? `${p.dias_almacigo} días` : "");
  const cosechaDura = p.dias_en_cosecha_max
    ? (p.dias_en_cosecha_min && p.dias_en_cosecha_min !== p.dias_en_cosecha_max
        ? `${p.dias_en_cosecha_min} a ${p.dias_en_cosecha_max} días`
        : `${p.dias_en_cosecha_max} días`)
    : (p.dias_en_cosecha ? `${p.dias_en_cosecha} días` : "");

  // --- las generaciones sembradas, con su ventana de cosecha ---
  const siembras = (f?.siembras || []).slice().sort((a, b) =>
    String(a.fecha).localeCompare(String(b.fecha)));
  const trasplantes = f?.trasplantes || [];
  const porSiembra = {};
  trasplantes.forEach((t) => { (porSiembra[t.siembra_id] = porSiembra[t.siembra_id] || []).push(t); });

  const generaciones = siembras.map((s) => {
    const suyos = porSiembra[s.id] || [];
    const inicio = s.cosecha_estimada || "";
    const dura = p.dias_en_cosecha_max || p.dias_en_cosecha || 0;
    const fin = inicio && dura ? sumarDias(inicio, dura) : "";
    const real = suyos.length
      ? `trasplantado el ${fechaCorta(suyos[0].fecha)} · ${suyos[0].dias_reales} días en bandeja`
        + (suyos[0].diferencia
            ? ` <b>(${suyos[0].diferencia > 0 ? "+" : ""}${suyos[0].diferencia} vs. lo teórico)</b>`
            : "")
      : (s.trasplante_estimado ? `trasplante estimado ${fechaCorta(s.trasplante_estimado)}` : "");
    const donde = suyos.length
      ? suyos.map((t) => `${t.sector} ${t.bancal}`).join(", ")
      : (s.sector ? `${s.sector} ${s.bancal}` : "");
    return `<div class="registro">
      <div>
        <div class="detalle">G${s.generacion}${s.variedad ? " · " + esc(s.variedad) : ""}
          ${donde ? `<small>${esc(donde)}</small>` : ""}</div>
        <div class="cuando">sembrado el ${fechaCorta(s.fecha)}${
          s.plantines ? " · " + num(s.plantines) + " plantines" : ""}<br>${real}</div>
      </div>
      ${inicio ? `<span class="etiqueta ok">cosecha ${fechaCorta(inicio)}${
        fin ? " a " + fechaCorta(fin) : ""}</span>` : ""}
    </div>`;
  }).join("");

  // --- variedades que de verdad se usaron acá ---
  const variedades = [...new Set(siembras.map((s) => s.variedad).filter(Boolean))];

  const cosechado = f?.kg_cosechados || 0;
  const esperado = enElPlan?.cosecha_esperada_kg || 0;

  // --- la ficha de referencia, si ya se bajó ---
  const ref = FICHAS?.fichas?.[cultivo];
  const fuentes = FICHAS?._fuentes || [];
  // Va abajo y plegado: quien abre la ficha suele venir a ver cómo viene el
  // cultivo esta temporada, no a leer sobre la especie. Lo de leer queda a un
  // toque de distancia para cuando sí se lo busca.
  const bloqueRef = ref ? `
    <details class="saber-mas">
    <summary>Saber más sobre ${esc(cultivo)}</summary>
    <div class="ficha-ref">
      <div class="ficha-titulo">
        <span class="ficha-emoji">${ref.emoji || "🌱"}</span>
        <div>
          <b>${esc(ref.familia)}</b>
          <div class="especie">${esc(ref.especie)}</div>
        </div>
      </div>
      ${ref.resumen.split("\n\n").map((t) => `<p>${esc(t)}</p>`).join("")}
      ${ref.manejo?.length ? `<h4>Manejo</h4><ul>${
        ref.manejo.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
      ${ref.problemas?.length ? `<h4>Plagas y enfermedades</h4><ul>${
        ref.problemas.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
      ${ref.presentacion ? `<h4>Cómo se presenta</h4><p>${esc(ref.presentacion)}</p>` : ""}
      <p class="nota">Información general, no receta: lo que pasa en tu chacra manda.
      ${fuentes.length ? "Referencias regionales: " + fuentes.map((f) =>
        `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.autores)}</a>`
      ).join(" · ") : ""}</p>
    </div>
    </details>` : "";

  return `
  <div class="tarjeta">
    <h2>${esc(cultivo)}</h2>
    <button type="button" class="secundario" id="volver-plan">← Volver al plan</button>
    <button type="button" class="secundario" data-editar-cultivo="${esc(cultivo)}">Editar generaciones y bancales</button>

    <h3 class="sub">Lo que sabe el catálogo</h3>
    <p class="nota">Común a las seis chacras. Se corrige en Plan → Agregar o completar un cultivo.</p>
    <div class="datos">
      ${dato("Cómo se siembra", esc(p.tipo_siembra || ""))}
      ${dato("En almácigo", almacigo)}
      ${dato("De trasplante a cosecha", p.dias_trasplante_cosecha ? p.dias_trasplante_cosecha + " días" : "")}
      ${dato("De siembra a cosecha", p.dias_a_cosecha ? p.dias_a_cosecha + " días" : "")}
      ${dato("Dura la cosecha", cosechaDura)}
      ${dato("Marco de plantación", p.lineas_bancal
        ? `${num(p.lineas_bancal)} líneas a ${num(p.distancia_cm)} cm` : "")}
      ${dato("Rinde de referencia", p.rinde_ref_kg_m2 ? num(p.rinde_ref_kg_m2, 2) + " kg/m²" : "")}
    </div>

    ${enElPlan ? `
    <h3 class="sub">En el plan de ${esc(chacraActual()?.nombre || "la chacra")}</h3>
    <div class="datos">
      ${dato("Superficie", num(enElPlan.superficie_m2) + " m²")}
      ${dato("Bancales", m2 ? num(enElPlan.superficie_m2 / m2, 1) : "")}
      ${dato("Plantas", enElPlan.plantas ? num(enElPlan.plantas) : "")}
      ${dato("Cosecha esperada", esperado ? num(esperado) + " kg" : "")}
      ${dato("Cosechado", `${num(cosechado, 1)} kg`)}
    </div>
    ${esperado ? barra((cosechado / esperado) * 100) : ""}` : `
    <p class="nota">Este cultivo no está en el plan de la temporada.</p>`}

    ${variedades.length ? `
    <h3 class="sub">Variedades sembradas</h3>
    <p class="nota">${variedades.map(esc).join(" · ")}</p>` : ""}

    <h3 class="sub">Generaciones <small>${siembras.length}</small></h3>
    ${siembras.length ? generaciones : `<p class="nota">${f
      ? "Todavía no se sembró ninguna generación de este cultivo esta temporada."
      : "Buscando los registros…"}</p>`}

    ${(f?.cosechas || []).length ? `
    <h3 class="sub">Cosechas <small>${f.cosechas.length}</small></h3>
    ${f.cosechas.slice().reverse().slice(0, 12).map((c) => `<div class="registro">
      <div><div class="detalle">${fechaCorta(c.fecha)}</div>
        <div class="cuando">${esc(c.operador || "")}</div></div>
      <span class="etiqueta ok">${num(c.kg, 1)} kg</span>
    </div>`).join("")}` : ""}

    ${bloqueRef}
  </div>`;
}

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
    <!-- Sin botón de editar: estos totales ya no se escriben a mano, salen de
         sumar las generaciones. Se corrigen en Plan → Planificar. -->
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
  } else if (tipo === "trasplantes") {
    detalle = `${esc(f.Cultivo)}${f.Variedad ? " " + esc(f.Variedad) : ""} · G${f["Generación"] || 1}`;
    extra = [f.Sector ? `${esc(f.Sector)}${f.Bancal || ""}` : "",
             f.Plantines ? `${num(f.Plantines)} plantines` : "",
             f.Operador ? "por " + esc(f.Operador) : ""].filter(Boolean).join(" · ");
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
// Todo lo que la chacra hizo con un cultivo: lo calcula el servicio sobre las
// hojas enteras, porque el teléfono solo recibe las últimas 15 filas de cada
// una. Se pide de a un cultivo y se guarda, así abrir la ficha de nuevo no
// vuelve a pedirlo.
async function traerFicha(cultivo, forzar = false) {
  if (!chacraCodigo() || !tieneAcceso() || !navigator.onLine) return;
  const marca = "ficha:" + cultivo;
  if (!forzar && Date.now() - (pedidoReciente[marca] || 0) < 20000) return;
  pedidoReciente[marca] = Date.now();
  try {
    const d = await (await fetch(`${urlServicio()}?${
      conCredenciales("ficha=" + encodeURIComponent(cultivo))}`)).json();
    if (!d.ok) return;
    const fichas = leer(LS.fichas, {});
    const cambio = JSON.stringify(fichas[cultivo] || null) !== JSON.stringify(d);
    fichas[cultivo] = d;
    escribir(LS.fichas, fichas);
    const delPanel = (leer(LS.generaciones, []) || []).find((x) => x.id === genPanel);
    if (cambio && vistaActual === "plan"
        && (cultivoAbierto === cultivo || delPanel?.cultivo === cultivo)) {
      redibujarConDatos("plan");
    }
  } catch { /* sin señal: se muestra lo último que se bajó */ }
}

// Los almácigos que esperan trasplante los cuenta el servicio sobre la hoja
// entera, no sobre las últimas 15 siembras que recibe el teléfono.
async function traerAlmacigos(forzar = false) {
  if (!chacraCodigo() || !tieneAcceso() || !navigator.onLine) return;
  if (!forzar && Date.now() - (pedidoReciente.almacigos || 0) < 20000) return;
  pedidoReciente.almacigos = Date.now();
  try {
    const d = await (await fetch(
      `${urlServicio()}?${conCredenciales("almacigos=1")}`)).json();
    if (!d.ok || !Array.isArray(d.almacigos)) return;
    const cambio = JSON.stringify(leer(LS.almacigos, null)) !== JSON.stringify(d.almacigos);
    escribir(LS.almacigos, d.almacigos);
    if (cambio && vistaActual === "trasplantes") redibujarConDatos("trasplantes");
  } catch { /* sin conexión: se usa lo último que se bajó */ }
}

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
    if (cambio && vistaActual === tipo) redibujarConDatos(tipo);
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
  } else if (r.tipo === "trasplantes") {
    titulo = "Trasplante";
    detalle = [esc(d.cultivo), d.generacion ? "G" + d.generacion : "",
               d.sector ? `${esc(d.sector)}${d.bancal || ""}` : "",
               d.plantines ? `${num(d.plantines)} plantines` : ""]
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
// ¿La persona tocó algún campo desde que se dibujó la pantalla? Solo cuentan
// los eventos de verdad (isTrusted): varias pantallas completan campos solas al
// abrirse —la fecha, quién trabajó, lo sugerido— y eso no es estar cargando.
// Guardar el formulario o cambiar de pantalla lo vuelve a cero.
let campoTocado = false;
["input", "change"].forEach((tipo) => document.addEventListener(tipo, (e) => {
  if (e.isTrusted && e.target.closest && e.target.closest("#vista")) campoTocado = true;
}, true));
document.addEventListener("submit", () => { campoTocado = false; }, true);
const formularioEmpezado = () => campoTocado;

/* Redibujar porque llegaron datos, no porque la persona hizo algo. Estos
   pedidos terminan solos, segundos después, y antes redibujaban con la
   pantalla vuelta arriba y el formulario en blanco: al terminar cada
   sincronización —o sea, después de cada cosa guardada— la pantalla saltaba
   al principio y se perdía lo que se estaba escribiendo (28/09: "no me deja
   trabajar"). Ahora se queda donde estaba, y si hay algo a medio cargar o un
   arrastre en el mapa, no se redibuja: los datos nuevos aparecen en el
   próximo cambio de pantalla. */
function redibujarConDatos(vista) {
  if (vistaActual !== vista) return;
  if (document.body.classList.contains("lz-arrastrando")) return;
  if (formularioEmpezado()) return;
  render(vista, true);
}

function render(vista, conservarScroll = false) {
  if (vista === "configuracion" && vistaActual !== "configuracion") {
    vistaPrevia = vistaActual;
  }
  if (vista !== "cuentas") cuentaAbierta = "";
  vistaActual = vista;
  campoTocado = false;           // la pantalla nueva arranca sin nada cargado
  const scroll = window.scrollY;
  // Lo que tiene scroll propio —el plan estratégico, las listas de Cultivos y
  // del mapa— también se queda donde estaba. Redibujar crea todo de nuevo, y
  // sin esto el gráfico volvía arriba después de cada sincronización aunque
  // la página no se moviera.
  const CON_SCROLL = "#vista .plan-scroll, #vista .lista-scroll";
  const internos = conservarScroll
    ? [...document.querySelectorAll(CON_SCROLL)].map((el) => [el.scrollTop, el.scrollLeft])
    : [];
  // El gráfico y el mapa usan todo el ancho de la pantalla. El resto de la app
  // queda con el ancho de siempre: un formulario de 1800 px es incómodo de
  // leer, pero un campo de 106 bancales achicado a 1180 px desperdicia lo que
  // la notebook tiene de sobra.
  document.body.classList.toggle("a-lo-ancho",
    vista === "plan" && !cultivoAbierto && (vistaPlan === "grafico" || vistaPlan === "mapa"));
  $("#vista").innerHTML = plantillas[vista]();
  // Al cambiar de sección se arranca de arriba; al redibujar la misma porque
  // llegaron datos, se deja donde estaba.
  window.scrollTo(0, conservarScroll ? scroll : 0);
  document.querySelectorAll(CON_SCROLL).forEach((el, i) => {
    if (internos[i]) { el.scrollTop = internos[i][0]; el.scrollLeft = internos[i][1]; }
  });
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("activa", t.dataset.vista === vista));

  ({ siembras: prepararSiembras, horas: prepararHoras, cosechas: prepararCosechas,
     tareas: prepararTareas, inicio: prepararInicio, ajustes: prepararAjustes,
     configuracion: prepararConfiguracion, plan: prepararPlan,
     trasplantes: prepararTrasplantes, cuentas: prepararCuentas
   }[vista] || (() => {}))();

  prepararComunes();

  // Las secciones de registro muestran lo último de toda la chacra.
  if (["siembras", "cosechas", "horas", "trasplantes"].includes(vista)) traerUltimos(vista);
  // Para saber qué almácigos siguen pendientes hace falta la lista de siembras,
  // aunque la sección que se está mirando sea Trasplantes.
  if (vista === "trasplantes") { traerUltimos("siembras"); traerAlmacigos(); }

  // Plan: abrir un cultivo muestra su ficha, y con ella se pide su historial.
  document.querySelectorAll("[data-ficha]").forEach((fila) => {
    const abrir = () => {
      cultivoAbierto = fila.dataset.ficha;
      render("plan");
      window.scrollTo(0, 0);
    };
    fila.onclick = abrir;
    fila.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); }
    };
  });
  const volver = $("#volver-plan");
  if (volver) volver.onclick = () => { cultivoAbierto = ""; render("plan"); };
  if (vista === "plan" && cultivoAbierto) { traerFicha(cultivoAbierto); traerFichasTexto(); }

  // Plan estratégico: cambiar de vista, ordenar y filtrar.
  document.querySelectorAll("[data-plan-vista]").forEach((b) => {
    b.onclick = () => {
      vistaPlan = b.dataset.planVista;
      cultivoAbierto = "";
      render("plan");
      window.scrollTo(0, 0);
    };
  });
  const plegar = $("#plegar-plan");
  if (plegar) plegar.onclick = () => {
    escribir(LS.planPlegado, !leer(LS.planPlegado, false));
    render("plan", true);
  };
  document.querySelectorAll("[data-ir-configuracion]").forEach((b) => {
    b.onclick = () => render("configuracion");
  });
  document.querySelectorAll("[name=orden-plan]").forEach((r) => {
    r.onchange = () => { ordenPlan = r.value; render("plan", true); };
  });
  document.querySelectorAll("[name=filtro-plan]").forEach((r) => {
    r.onchange = () => { filtroPlan = r.value; render("plan", true); };
  });
  engancharArrastre();
  prepararPanelGeneracion();
  // El plan también lo necesita Inicio, para avisar qué toca sembrar.
  if (vista === "plan" || vista === "inicio") traerGeneraciones();

  // Tocar un aviso de "Para sembrar" abre el formulario con lo que ya se sabe.
  document.querySelectorAll("[data-sembrar]").forEach((fila) => {
    const ir = () => {
      try { siembraSugerida = JSON.parse(fila.dataset.sembrar); } catch { return; }
      render("siembras");
      window.scrollTo(0, 0);
    };
    fila.onclick = ir;
    fila.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(); }
    };
  });
  // Solo se redibuja si de verdad cambio algo, y sin mover la pantalla: quien
  // estaba leyendo el detalle de su cuenta no tiene por que volver arriba.
  if (vista === "cuentas") traerCuentas().then((cambio) => {
    if (cambio && vistaActual === "cuentas") redibujarConDatos("cuentas");
  });

  // La pestaña de Cuentas solo existe para las chacras que tienen economía
  // compartida. Hoy es solo Chacra Tica: las demás ni la ven.
  const tabCuentas = document.querySelector('[data-vista="cuentas"]');
  if (tabCuentas) tabCuentas.hidden = !hayCuentas();

  // Si la sección quedó fuera de la vista en la barra deslizable, se la acerca.
  const activa = document.querySelector(".tabs-medio .tab.activa");
  if (activa) activa.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
}

// Botones que pueden aparecer en cualquier vista.
function prepararComunes() {
  // Vale para cualquier formulario que tenga el par sector/bancal.
  document.querySelectorAll('select[name="sector"]').forEach((sel) => {
    const bancal = sel.closest("form")?.querySelector('select[name="bancal"]');
    if (!bancal) return;
    sel.addEventListener("change", () => {
      const antes = bancal.value;
      bancal.innerHTML = opcionesBancal(sel.value, antes);
    });
  });

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

  // Si se llegó tocando un aviso de "Para sembrar", el formulario arranca con
  // lo que el plan ya sabe. Queda todo editable: es una ayuda, no un dictado.
  if (siembraSugerida) {
    const s = siembraSugerida;
    siembraSugerida = null;            // se usa una sola vez
    f.cultivo.value = s.cultivo;
    const caja = f.querySelector("[data-buscador] .buscador-texto");
    if (caja) caja.value = s.cultivo;
    f.generacion.value = s.generacion || 1;
    const tipo = s.directa ? "Siembra directa" : "Siembra almácigo";
    if ([...f.tipo.options].some((o) => o.value === tipo)) f.tipo.value = tipo;
    aviso(`${s.cultivo} G${s.generacion}: revisá y guardá`);
  }

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
      // Los días dependen de la estación: se cuentan desde la fecha de siembra.
      const alm = diasAlmacigo(f.cultivo.value, f.fecha.value);
      if (alm) {
        const r = rangoAlmacigo(f.cultivo.value);
        partes.push(`trasplante estimado: <b>${fechaCorta(sumarDias(f.fecha.value, alm))}</b>`
          + (r ? ` <small>(${alm} días; entre ${r.min} y ${r.max} según la estación)</small>` : ""));
      }
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
    datos.trasplante_estimado = conBandeja
      ? sumarDias(datos.fecha, diasAlmacigo(datos.cultivo, datos.fecha)) : "";
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
// `volverA` es la vista donde se queda después de guardar. Por defecto es
// Configuración, que es de donde se guarda casi siempre; el mapa y la
// planificación también guardan configuración y no tienen por qué sacarte de
// donde estabas.
function guardarConfig(cambios, mensaje = "Configuración guardada ✓", volverA = "configuracion") {
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
  if (volverA) render(volverA, volverA === vistaActual);
}

function prepararConfiguracion() {
  // Volver a donde se estaba. Configuración se abre desde el engranaje y no
  // desde la barra de secciones, así que sin esto hay que adivinar la salida.
  const volver = $("#volver-de-config");
  if (volver) volver.onclick = () => render(vistaPrevia || "inicio");

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

  // ---- un cultivo nuevo para el catálogo de todas las chacras
  const fCult = $("#form-cultivo");
  if (fCult) {
    // Qué se pregunta depende de cómo se siembra. Un cultivo de siembra
    // directa no tiene días en almácigo, y obligar a llenarlo empuja a poner
    // un cero inventado, que es peor que un vacío: después no se distingue de
    // un dato medido.
    const conAlmacigo = () => /almácigo|almacigo/i.test(fCult.tipo_siembra.value);
    const yaPlantado = () => /trasplante|esqueje/i.test(fCult.tipo_siembra.value);
    const blAlm = $("#bloque-almacigo"), blDir = $("#bloque-directa");
    const suma = $("#suma-cosecha");

    const acomodar = () => {
      const alm = conAlmacigo();
      blAlm.hidden = !(alm || yaPlantado());
      // Los días a cosecha nunca se preguntan cuando se pueden deducir: con
      // almácigo son la suma de las dos etapas, y con un plantín ya hecho son
      // los del trasplante a la cosecha. Preguntarlos igual abriría la puerta
      // a que dos números de la misma fila se contradigan.
      blDir.hidden = alm || yaPlantado();
      fCult.dias_almacigo.parentElement.hidden = !alm;
      // Los estacionales solo tienen sentido si el cultivo pasa por bandeja.
      $("#bloque-estacion").hidden = !alm;
      recalcular();
    };

    const recalcular = () => {
      const b = aNumero(fCult.dias_trasplante_cosecha.value) || 0;
      if (conAlmacigo()) {
        const a = aNumero(fCult.dias_almacigo.value) || 0;
        suma.textContent = (a && b)
          ? `Días a cosecha: ${a + b}, contando desde la siembra.` : "";
      } else if (yaPlantado()) {
        suma.textContent = b
          ? `Días a cosecha: ${b}, contando desde que se planta.` : "";
      } else {
        suma.textContent = "";
      }
    };

    fCult.tipo_siembra.addEventListener("change", acomodar);
    ["dias_almacigo", "dias_trasplante_cosecha"].forEach((n) =>
      fCult[n].addEventListener("input", recalcular));
    acomodar();

  fCult.onsubmit = (e) => {
    e.preventDefault();
    const nombre = fCult.cultivo.value.trim();
    if (!nombre) return aviso("Escribí el nombre del cultivo.", true);
    // Se compara sin tildes ni mayúsculas: "Ají" y "aji" son el mismo. Un
    // cultivo que ya tiene datos no se puede pisar desde el teléfono; uno que
    // está sin datos sí se completa, que es el caso de los cinco que vinieron
    // del catálogo viejo.
    const yaEsta = cultivosDisponibles().find((c) => claveArea(c) === claveArea(nombre));
    if (yaEsta && !cultivoSinDatos(yaEsta)) {
      return aviso(`${yaEsta} ya está cargado con sus datos.`, true);
    }
    // Todo lo que se pregunta es obligatorio: un cultivo a medio cargar en el
    // catálogo de seis chacras sirve menos que no tenerlo, porque nadie sabe
    // si el hueco es un olvido o un dato que no aplica.
    const alm = conAlmacigo();
    const pedidos = [
      ["dias_en_cosecha", "cuántos días dura la cosecha"],
      ["lineas_bancal", "cuántas líneas por bancal"],
      ["distancia_cm", "la distancia entre plantas"],
      ["rinde_ref_kg_m2", "el rinde de referencia"],
    ];
    if (alm) pedidos.unshift(["dias_almacigo", "cuántos días lleva el almácigo"]);
    if (alm || yaPlantado()) {
      pedidos.push(["dias_trasplante_cosecha", "cuántos días del trasplante a la cosecha"]);
    } else {
      pedidos.push(["dias_a_cosecha", "cuántos días hasta la cosecha"]);
    }
    for (const [campo, comoSeLlama] of pedidos) {
      if (!(aNumero(fCult[campo].value) > 0)) {
        return aviso(`Falta ${comoSeLlama}.`, true);
      }
    }

    const aCosecha = alm
      ? (aNumero(fCult.dias_almacigo.value) || 0) + (aNumero(fCult.dias_trasplante_cosecha.value) || 0)
      : yaPlantado()
        ? aNumero(fCult.dias_trasplante_cosecha.value) || 0
        : aNumero(fCult.dias_a_cosecha.value) || 0;

    guardarRegistro("cultivo", {
      cultivo: yaEsta || nombre,
      tipo_siembra: fCult.tipo_siembra.value,
      dias_almacigo: alm ? aNumero(fCult.dias_almacigo.value) : "",
      // Opcionales: si vienen vacíos se usa el de arriba en las dos estaciones.
      dias_almacigo_oi: alm ? aNumero(fCult.dias_almacigo_oi.value) : "",
      dias_almacigo_pv: alm ? aNumero(fCult.dias_almacigo_pv.value) : "",
      dias_trasplante_cosecha: (alm || yaPlantado())
        ? aNumero(fCult.dias_trasplante_cosecha.value) : "",
      dias_a_cosecha: aCosecha,
      dias_en_cosecha: aNumero(fCult.dias_en_cosecha.value),
      lineas_bancal: aNumero(fCult.lineas_bancal.value),
      distancia_cm: aNumero(fCult.distancia_cm.value),
      rinde_ref_kg_m2: aNumero(fCult.rinde_ref_kg_m2.value),
      observaciones: fCult.observaciones.value.trim(),
    }, yaEsta ? `${yaEsta} completado ✓` : `${nombre} agregado al catálogo ✓`);
    // Se muestra ya, sin esperar a que vuelva del servicio: quien lo carga
    // suele querer usarlo en el mismo momento.
    const extra = catalogoExtra();
    extra.cultivos = [...new Set([...(extra.cultivos || []), yaEsta || nombre])];
    escribir(LS.catalogoExtra, extra);
    render("configuracion");
  };
  }

  // El formulario del plan por cultivo se mudo a Plan → Planificar, donde se
  // carga junto con sus generaciones. Editar el total por separado ya no tiene
  // sentido: ahora sale de sumar las generaciones.

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

// ---- Cuentas de sueldos ----
// Los números los calcula el proyecto Bioma; acá solo se piden y se dibujan.
// El servicio decide qué puede ver este teléfono según de quién es, así que la
// app no filtra nada: muestra lo que le llega.
const hayCuentas = () => !!CFG?.cuentas;

// Devuelve true solo si llegaron datos DISTINTOS de los que ya estaban. Quien
// llama usa eso para decidir si vale la pena redibujar: redibujar por gusto
// manda la pantalla arriba y, si encima vuelve a pedir, queda en un lazo.
let ultimoPedidoCuentas = 0;
async function traerCuentas(forzar = false) {
  if (!chacraCodigo() || !tieneAcceso() || !navigator.onLine) return false;
  if (!forzar && Date.now() - ultimoPedidoCuentas < 20000) return false;
  ultimoPedidoCuentas = Date.now();
  try {
    const d = await (await fetch(
      `${urlServicio()}?${conCredenciales("micuenta=1")}`)).json();
    if (!d.ok) {
      escribir(LS.cuentasError, d.error || "No se pudieron leer las cuentas.");
      return true;
    }
    escribir(LS.cuentasError, "");
    // Se compara sin la marca de bajada, que cambia siempre y haria parecer
    // que hay novedades en cada pedido.
    const antes = JSON.stringify(leer(LS.cuentas, null));
    escribir(LS.cuentas, d);
    return JSON.stringify(d) !== antes;
  } catch {
    // Sin señal se conserva lo último bueno: una pantalla en blanco es peor
    // que un número de ayer, sobre todo si alguien está por cobrar.
    return false;
  }
}

const pesos = (n) => {
  const v = Number(n) || 0;
  return "$" + Math.round(Math.abs(v)).toLocaleString("es-AR") ;
};
const conSigno = (n) => (Number(n) < 0 ? "-" : "") + pesos(n);

/* El flujo mes a mes, en tres series sobre el mismo par de ejes.

   - Barras: el saldo del mes. Verdes hacia arriba, rojas hacia abajo. Van de
     fondo y translúcidas para que las líneas se lean por encima.
   - Línea verde: lo que entró. Línea ámbar: lo que salió.

   Comparten un solo eje a propósito. Como el saldo es la resta, la distancia
   vertical entre las dos líneas es la altura de la barra: las dos cosas
   cuentan lo mismo y se refuerzan, y donde la línea verde cruza por debajo de
   la ámbar la barra se pone roja sola.

   Los números vienen calculados de Bioma; acá solo se dibujan. SVG a mano,
   sin librerías, igual que el resto de la app.

   La lista llega del mes más nuevo al más viejo: se da vuelta para dibujar,
   porque el tiempo en un gráfico va hacia la derecha. */
function graficoDelFlujo(meses) {
  const lista = (meses || []).slice().reverse();
  if (lista.length < 2) return "";   // con un solo mes no hay nada que comparar

  const ANCHO_MES = 46, ALTO = 150, ARRIBA = 12, ABAJO = 20;
  const util = ALTO - ARRIBA - ABAJO;
  const ancho = lista.length * ANCHO_MES;
  const v = (m, k) => Number(m[k]) || 0;

  const techo = Math.max(...lista.map((m) =>
    Math.max(v(m, "ingresos"), v(m, "egresos"), v(m, "balance"))), 1);
  const piso = Math.min(0, ...lista.map((m) => v(m, "balance")));
  const y = (n) => ARRIBA + ((techo - n) / ((techo - piso) || 1)) * util;
  const x = (i) => i * ANCHO_MES + ANCHO_MES / 2;
  const cero = y(0);

  const barras = lista.map((m, i) => {
    const b = v(m, "balance"), pos = b >= 0;
    return `<g><title>${esc(m.mes)}
${pesos(v(m, "ingresos"))} entró · ${pesos(v(m, "egresos"))} salió
saldo ${conSigno(b)}</title>
      <rect class="gf-barra${pos ? "" : " neg"}" x="${x(i) - 11}"
        y="${(pos ? y(b) : cero).toFixed(1)}" width="22"
        height="${Math.max(Math.abs(cero - y(b)), 1).toFixed(1)}" rx="2"/></g>`;
  }).join("");

  const serie = (clave, clase) =>
    `<polyline class="gf-linea ${clase}" points="${
      lista.map((m, i) => `${x(i)},${y(v(m, clave)).toFixed(1)}`).join(" ")}"/>` +
    lista.map((m, i) => `<circle class="gf-punto ${clase}" cx="${x(i)}"
      cy="${y(v(m, clave)).toFixed(1)}" r="2.5"/>`).join("");

  return `
  <div class="gf-leyenda">
    <span><i class="gf-m-barra"></i> saldo del mes</span>
    <span><i class="gf-m-in"></i> entró</span>
    <span><i class="gf-m-out"></i> salió</span>
  </div>
  <div class="gf-scroll">
    <svg viewBox="0 0 ${ancho} ${ALTO}" width="${ancho}" height="${ALTO}"
         role="img" aria-label="Flujo de fondos mes a mes">
      <line class="gf-cero" x1="0" y1="${cero.toFixed(1)}" x2="${ancho}" y2="${cero.toFixed(1)}"/>
      ${barras}
      ${serie("egresos", "out")}
      ${serie("ingresos", "in")}
      ${lista.map((m, i) => `<text class="gf-lbl" x="${x(i)}" y="${ALTO - 6}"
        text-anchor="middle">${esc(String(m.mes).slice(5))}/${esc(String(m.mes).slice(2, 4))}</text>`).join("")}
    </svg>
  </div>`;
}

// En qué etapa del ciclo estamos. Sin esto, un balance de septiembre se lee
// como una alarma: los ingresos por venta recién llegan en noviembre, mientras
// que las horas y los insumos se gastan desde julio. La plata que entra antes
// suele ser préstamos, y eso es parte del plan, no un problema.
const ETAPAS = [
  [7, "julio: se planifica la temporada. Todavía no hay nada para vender, así que lo que entra suele ser préstamos para semillas, fertilizantes y horas."],
  [8, "agosto: primeras siembras. Se gasta en insumos y horas; las ventas todavía no empiezan."],
  [9, "septiembre: almácigos y primeros trasplantes. El balance negativo en esta etapa es lo esperable."],
  [10, "octubre: trasplantes. Sigue siendo mes de gasto más que de ingreso."],
  [11, "noviembre: primeras cosechas, empiezan a entrar las ventas."],
  [12, "diciembre: cosecha y venta en marcha."],
  [1, "enero: plena cosecha, el mes fuerte de ingresos."],
  [2, "febrero: plena cosecha."],
  [3, "marzo: cosecha y venta."],
  [4, "abril: últimas cosechas de la temporada."],
  [5, "mayo: cierre de la temporada de venta."],
  [6, "junio: receso de invierno."],
];

function etapaDeLaTemporada() {
  const mes = new Date().getMonth() + 1;
  const e = ETAPAS.find(([m]) => m === mes);
  return e ? e[1] : "";
}

// El estado economico del proyecto. Quien no esté habilitado ve solo cómo viene
// la liquidación de sueldos y en qué se trabajó; el resto no le llega ni al
// teléfono, porque el filtro se hace en el servicio.
function tarjetasDeEconomia(e) {
  if (!e || e.error) return "";
  const barras = (lista, clave) => (lista || []).map((x) => `
    <div class="linea-barra">
      <div class="linea-barra-tope">
        <span>${esc(x[clave])}</span>
        <b>${clave === "area" ? num(x.horas, 1) + " h" : pesos(x.monto)}</b>
      </div>
      <div class="barra"><div class="barra-llena" style="width:${Math.min(100, Number(x.porcentaje) || 0)}%"></div></div>
      ${(x.actividades || []).length ? `<div class="cuando">${
        x.actividades.map((a) => `${esc(a.actividad)} ${num(a.horas, 1)} h`).join(" · ")
      }</div>` : ""}
    </div>`).join("");

  const s = e.sueldos;
  const liq = s && s.devengado ? (s.pagado / s.devengado) * 100 : 0;

  return `
  ${s ? `<div class="tarjeta">
    <h2>Sueldos del proyecto</h2>
    <div class="cifras">
      ${cifraClara(pesos(s.devengado), "devengado")}
      ${cifraClara(pesos(s.pagado), "pagado")}
      ${cifraClara(pesos(s.saldo), "se debe")}
    </div>
    <div class="barra" style="margin-top:10px"><div class="barra-llena" style="width:${liq}%"></div></div>
    <p class="nota">${num(liq, 1)}% de lo trabajado ya está pago.</p>
  </div>` : ""}

  ${e.horas && (e.horas.porArea || []).length ? `<div class="tarjeta">
    <h2>En qué se trabajó <small>${num(e.horas.total, 1)} h</small></h2>
    ${barras(e.horas.porArea, "area")}
  </div>` : ""}

  ${e.resumen ? `<div class="tarjeta">
    <h2>Balance de la temporada <small>${esc(e.temporada || "")}</small></h2>
    <div class="cifras">
      ${cifraClara(pesos(e.resumen.ingresos), "ingresos")}
      ${cifraClara(pesos(e.resumen.egresos), "egresos")}
      ${cifraClara(conSigno(e.resumen.balance), Number(e.resumen.balance) < 0 ? "en rojo" : "balance")}
    </div>
    ${e.resumen.disponible === null || e.resumen.disponible === undefined ? ""
      : `<p class="nota">Disponible hoy: <b>${pesos(e.resumen.disponible)}</b></p>`}
    <p class="nota">${etapaDeLaTemporada()}</p>
  </div>` : ""}

  ${(e.meses || []).length ? `<div class="tarjeta">
    <h2>Ingresos y egresos, mes a mes</h2>
    ${graficoDelFlujo(e.meses)}
    ${e.meses.map((m) => `<div class="registro">
      <div><div class="detalle">${esc(m.mes)}</div>
        <div class="cuando">${pesos(m.ingresos)} entró · ${pesos(m.egresos)} salió${
          m.acumulado === undefined || m.acumulado === null ? ""
            : ` · acumulado ${conSigno(m.acumulado)}`}</div></div>
      <div class="saldo${Number(m.balance) < 0 ? " alerta" : ""}">${conSigno(m.balance)}</div>
    </div>`).join("")}
  </div>` : ""}

  ${(e.ingresos_por_concepto || []).length ? `<div class="tarjeta">
    <h2>De dónde vino la plata</h2>
    ${barras(e.ingresos_por_concepto, "concepto")}
  </div>` : ""}

  ${(e.egresos_por_concepto || []).length ? `<div class="tarjeta">
    <h2>En qué se fue</h2>
    ${barras(e.egresos_por_concepto, "concepto")}
  </div>` : ""}`;
}

// La cuenta de una persona: qué ganó, qué cobró y qué le queda.
function detalleDeCuenta(x, d) {
  const propia = claveArea(x.nombre) === claveArea(d.yo || "");
  const liquidado = Math.max(0, Math.min(100, Number(x.liquidado) || 0));
  const saldo = Number(x.saldo) || 0;

  // horasPagadas puede venir nula: si alguien cobró antes de cargar horas, no
  // hay tarifa con qué convertir y el contrato pide no inventar el número.
  const enHoras = (v) => (v === null || v === undefined)
    ? "" : ` <small>(~${num(v, 1)} h)</small>`;

  return `
  <div class="tarjeta">
    ${d.ve_todo && (d.trabajadores || []).length > 1
      ? `<button type="button" class="secundario" id="btn-volver-cuentas">← Todas las cuentas</button>`
      : ""}
    <h2>${propia ? `Tu cuenta <small>${esc(x.nombre)}</small>` : esc(x.nombre)}</h2>

    <div class="cifras">
      ${cifraClara(num(x.horas, 1), "horas")}
      ${cifraClara(pesos(x.devengado), "ganado")}
      ${cifraClara(pesos(x.pagado), "cobrado")}
    </div>

    <div class="saldo-grande${saldo < 0 ? " alerta" : ""}">
      ${saldo < 0 ? "Cobraste de más" : "Te queda por cobrar"}
      <b>${conSigno(saldo)}</b>${enHoras(saldo < 0 ? null : x.horasAdeudadas)}
    </div>
    <div class="barra"><div class="barra-llena" style="width:${liquidado}%"></div></div>
    <p class="nota">${num(liquidado, 1)}% de lo ganado ya está cobrado.
      Tarifa ${pesos(x.tarifa)} por hora.
      ${x.ultimoPago ? `Último pago el ${fechaCorta(x.ultimoPago)}.` : "Todavía sin pagos."}</p>
    ${saldo < 0 ? `<p class="nota">Es un adelanto: cobraste antes de trabajar
      esas horas. Se descuenta solo a medida que las cargues.</p>` : ""}
  </div>

  <div class="tarjeta">
    <h2>Mes a mes</h2>
    ${(x.meses || []).length ? (x.meses || []).map((m) => `<div class="registro">
      <div><div class="detalle">${esc(m.mes)} — ${num(m.horas, 1)} h</div>
        <div class="cuando">${(m.areas || []).map((a) =>
          `${esc(a.area)} ${num(a.horas, 1)} h`).join(" · ")}</div></div>
      <div class="saldo">${pesos(m.devengado)}</div>
    </div>`).join("") : `<p class="nota">Todavía no hay horas cargadas.</p>`}
  </div>

  <div class="tarjeta">
    <h2>Pagos recibidos <small>${(x.pagos || []).length}</small></h2>
    ${(x.pagos || []).length ? (x.pagos || []).map((g) => `<div class="registro">
      <div><div class="detalle">${pesos(g.monto)}</div>
        <div class="cuando">${fechaCorta(g.fecha)}${g.obs ? " · " + esc(g.obs) : ""}</div></div>
    </div>`).join("") : `<p class="nota">Todavía no recibiste pagos.</p>`}
    <p class="nota">Los pagos se registran en la app de Bioma. Si falta alguno o
    hay un número que no cierra, avisá: se corrige allá, no acá.</p>
  </div>`;
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
  // Se guarda también el día en que se marcó, no solo que está hecha: es lo que
  // la ordena en "Hechas hace poco". Sin eso, una tarea recién marcada acá se
  // iba al fondo hasta que viajaba a la planilla.
  const estadoLocal = {};
  pendientes.forEach((r) => {
    if (r.tipo === "tareas_hecha") {
      estadoLocal[r.datos.tarea_id] = {
        hecha: true,
        hecha_el: r.datos.hecha_el || hoy(),
        hecha_por: r.datos.hecha_por || "",
      };
    } else if (r.tipo === "tareas_reabrir") {
      estadoLocal[r.datos.tarea_id] = { hecha: false, hecha_el: "", hecha_por: "" };
    }
  });

  const todas = [...nuevasLocales, ...deLaPlanilla]
    .filter((t, i, arr) => arr.findIndex((o) => o.id === t.id) === i)
    .map((t) => (estadoLocal[t.id] ? { ...t, ...estadoLocal[t.id] } : t));

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
    // En una tarea hecha, "para cuándo" ya no dice nada: lo que importa es
    // cuándo se hizo, que además es lo que la ordena en la lista de abajo.
    t.hecha ? "" : (vencida ? `atrasada desde el ${cuando}` : `para ${cuando}`),
    (t.proyecto ? esc(t.proyecto) : ""),
    (t.estado === "En curso" ? "<b>en curso</b>" : ""),
    (t.asignada ? `la toma ${esc(t.asignada)}` : ""),
    (t.personas > 1 ? `${t.personas} personas` : ""),
    (t.hecha
      ? "hecha" + (t.hecha_el
          ? (t.hecha_el === hoy() ? " hoy" : ` el ${fechaCorta(t.hecha_el)}`) : "")
        + (t.hecha_por ? ` por ${esc(t.hecha_por)}` : "")
      : ""),
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
      // Tildar una tarea de abajo no tiene que llevar la lista al principio.
      render("tareas", true);
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

function prepararTrasplantes() {
  const f = $("#form-trasplantes");
  if (!f) return;
  const pend = almacigosPendientes();
  const nota = $("#nota-almacigo");
  const calculo = $("#calculo-trasplante");
  // Se recuerda lo que sugirió el plan para saber si lo cambiaron a mano.
  let sugerido = { lineas: 0, distancia_cm: 0 };

  enlazarBuscadores(f);

  const elegido = () => pend.find((s) => s.id === f.siembra_id.value);

  // El marco sugerido sale del cultivo, no del almácigo: ahora se puede
  // trasplantar algo que no tiene siembra cargada.
  const sugerirMarco = (cultivo) => {
    const plan = enPlan(cultivo) || {};
    const p = perfil(cultivo) || {};
    sugerido = {
      lineas: plan.lineas || p.lineas_bancal || 0,
      distancia_cm: plan.distancia_cm || p.distancia_cm || 0,
    };
    f.lineas.value = sugerido.lineas || "";
    f.distancia_cm.value = sugerido.distancia_cm || "";
  };

  // El buscador avisa con un "change" sobre el FORMULARIO, no sobre su campo
  // oculto, así que se escucha acá y se mira si cambió el cultivo.
  let ultimoCultivo = "";
  f.addEventListener("change", () => {
    if (f.cultivo.value === ultimoCultivo) return;
    ultimoCultivo = f.cultivo.value;
    if (!f.siembra_id.value) sugerirMarco(f.cultivo.value);
    recalcular();
  });

  // Si se elige un almácigo, completa lo demás y habilita la cuenta de días
  // reales en bandeja. Si se saca, lo cargado queda como estaba.
  const alElegir = () => {
    const s = elegido();
    if (!s) { nota.textContent = ""; recalcular(); return; }
    f.cultivo.value = s.cultivo;
    const caja = f.querySelector("[data-buscador] .buscador-texto");
    if (caja) caja.value = s.cultivo;
    f.variedad.value = s.variedad || "";
    f.generacion.value = s.generacion || 1;
    sugerirMarco(s.cultivo);
    const sembrada = s.fecha ? `sembrado el ${fechaCorta(s.fecha)}` : "";
    const espera = s.estimado ? ` · estimado para ${fechaCorta(s.estimado)}` : "";
    nota.innerHTML = `${esc(s.cultivo)}${s.variedad ? " " + esc(s.variedad) : ""}
      · G${s.generacion} · ${sembrada}${espera}`;
    recalcular();
  };

  // Los plantines no se cuentan en el campo: se deducen del marco y de cuántos
  // bancales se ocuparon, que es lo que sí se sabe al terminar de plantar.
  const renglones = $("#renglones-bancal");
  let proximo = 1;

  // Cada renglon es un destino: sector y bancal. Se descartan los repetidos,
  // que serian dos filas iguales para el mismo lugar.
  const destinos = () => {
    const vistos = new Set();
    return [...renglones.querySelectorAll(".renglon-bancal")].map((div) => ({
      sector: div.querySelector("[data-sector]").value,
      bancal: div.querySelector("[data-bancal]").value,
    })).filter((d) => {
      const clave = `${d.sector}|${d.bancal}`;
      return vistos.has(clave) ? false : vistos.add(clave);
    });
  };

  const cuentas = () => {
    const lineas = aNumero(f.lineas.value) || 0;
    const dist = aNumero(f.distancia_cm.value) || 0;
    const bancales = destinos().length;
    // Lo contado gana sobre lo calculado: si alguien los contó de verdad, ese
    // número vale más que multiplicar líneas por distancia.
    const contados = aNumero(f.plantines.value) || 0;
    const porBancal = contados || plantasPorBancal(lineas, dist, f.disposicion.value);
    return { lineas, dist, bancales, porBancal, contados,
             total: Math.round(porBancal * bancales) };
  };

  const recalcular = () => {
    const c = cuentas();
    if (!c.porBancal) { calculo.innerHTML = ""; return; }
    const s = elegido();
    const disponibles = s ? s.plantines : 0;
    const cambiado = c.lineas !== sugerido.lineas || c.dist !== sugerido.distancia_cm;
    calculo.innerHTML = `<b>${num(c.porBancal)} plantines</b> por bancal`
      + (c.contados ? " <small>(contados)</small>" : "")
      + (c.bancales ? ` · ${c.bancales} bancal(es) elegidos = <b>${num(c.total)} plantines</b>` : "")
      + (cambiado && sugerido.lineas && !c.contados
          ? `<br><small>Distinto del plan (${sugerido.lineas} líneas a ${sugerido.distancia_cm} cm): se guarda como lo hiciste.</small>`
          : "")
      // Aviso, no bloqueo: puede sobrar plantines o haberse perdido algunos, y
      // quien está en el campo sabe mejor que la cuenta.
      + (disponibles && c.total > disponibles * 1.1
          ? `<br><small class="alerta">El almácigo tenía ${num(disponibles)} plantines: la cuenta da ${num(c.total)}.</small>`
          : "");
  };

  f.siembra_id.addEventListener("change", alElegir);

  // Si se llegó desde el detalle de una generación en el plan, el formulario
  // arranca con su cultivo y su generación. Si su almácigo está en la lista,
  // se elige también, que es lo que permite medir los días reales en bandeja.
  if (trasplanteSugerido) {
    const s = trasplanteSugerido;
    trasplanteSugerido = null;             // se usa una sola vez
    const op = s.siembra_id && [...f.siembra_id.options].find((o) => o.value === s.siembra_id);
    if (op) {
      f.siembra_id.value = s.siembra_id;
      alElegir();
    } else {
      f.cultivo.value = s.cultivo;
      const caja = f.querySelector("[data-buscador] .buscador-texto");
      if (caja) caja.value = s.cultivo;
      sugerirMarco(s.cultivo);
    }
    f.generacion.value = s.generacion || 1;
    aviso(`${s.cultivo} G${s.generacion}: completá los bancales y guardá`);
  }
  ["lineas", "distancia_cm", "plantines"].forEach((n) =>
    f[n].addEventListener("input", recalcular));
  f.disposicion.addEventListener("change", recalcular);

  // El sector de cada renglon manda sobre su lista de bancales, y agregar o
  // quitar renglones cambia el total: se recalcula ante cualquier cambio.
  const engancharRenglones = () => {
    renglones.querySelectorAll("[data-sector]").forEach((sel) => {
      sel.onchange = () => {
        const b = sel.closest(".renglon-bancal").querySelector("[data-bancal]");
        b.innerHTML = opcionesBancal(sel.value, b.value);
        recalcular();
      };
    });
    renglones.querySelectorAll("[data-bancal]").forEach((sel) => { sel.onchange = recalcular; });
    renglones.querySelectorAll("[data-quitar-bancal]").forEach((b) => {
      b.onclick = () => { b.closest(".renglon-bancal").remove(); recalcular(); };
    });
  };
  engancharRenglones();

  $("#btn-mas-bancal").onclick = () => {
    renglones.insertAdjacentHTML("beforeend", renglonBancal(proximo++));
    engancharRenglones();
    recalcular();
  };

  f.onsubmit = (e) => {
    e.preventDefault();
    const cultivo = f.cultivo.value;
    if (!cultivo) return aviso("Elegí qué cultivo estás trasplantando.", true);
    const c = cuentas();

    // El almácigo es opcional. Si se eligió, se mide cuánto tardó de verdad en
    // la bandeja contra lo que dice la tabla: ese es el dato con el que, en
    // unas temporadas, se corrigen los días del catálogo con lo que pasa en
    // esta chacra y no en un manual. Sin almácigo el trasplante se registra
    // igual, solo que sin esa medición.
    const s = elegido();
    // Los teóricos se cuentan con la estación en que se SEMBRÓ, no con la de
    // hoy: es contra eso que se compara lo que de verdad tardó en la bandeja.
    const teoricos = s ? diasAlmacigo(s.cultivo, s.fecha) : 0;
    const reales = s ? diasEntre(s.fecha, f.fecha.value) : null;
    const lugares = destinos();
    if (!lugares.length) return aviso("Elegí al menos un bancal.", true);
    escribir(LS.nombre, f.operador.value);

    // Una fila por bancal: comparten siembra de origen, fecha y marco, pero
    // cada una tiene su lugar. Es lo que después permite comparar el rinde de
    // un bancal contra otro plantados el mismo día con la misma variedad.
    const comun = {
      fecha: f.fecha.value,
      siembra_id: s ? s.id : "",
      fecha_siembra: s ? (s.fecha || "") : "",
      dias_almacigo_real: reales === null ? "" : reales,
      dias_almacigo_teorico: teoricos || "",
      diferencia_dias: (reales === null || !teoricos) ? "" : reales - teoricos,
      cultivo,
      variedad: f.variedad.value.trim(),
      generacion: parseInt(f.generacion.value, 10) || 1,
      lineas: c.lineas || "",
      distancia_cm: c.dist || "",
      disposicion: f.disposicion.value,
      // Queda escrito si se respetó el plan o se cambió en el campo: es la
      // diferencia entre lo planificado y lo que de verdad pasó.
      marco: (c.lineas !== sugerido.lineas || c.dist !== sugerido.distancia_cm)
        ? "Modificado" : "Sugerido",
      plantines: c.porBancal || "",
      operador: f.operador.value,
      observaciones: f.observaciones.value.trim(),
    };
    const aviso_ = lugares.length === 1
      ? "Trasplante guardado ✓"
      : `Trasplante guardado: ${lugares.length} bancales ✓`;
    lugares.forEach((l) => guardarRegistro("trasplantes",
      Object.assign({}, comun, { sector: l.sector, bancal: l.bancal }), aviso_));
    render("trasplantes");
  };
}

function prepararCuentas() {
  document.querySelectorAll("[data-cuenta]").forEach((fila) => {
    fila.onclick = () => { cuentaAbierta = fila.dataset.cuenta; render("cuentas"); };
  });
  const volver = $("#btn-volver-cuentas");
  if (volver) volver.onclick = () => { cuentaAbierta = ""; render("cuentas"); };
}

function prepararHoras() {
  const f = $("#form-horas");
  if (f) {
    // La lista de actividades cambia con el área: se rearma cada vez.
    const bloque = $("#bloque-actividad");
    const verActividades = () => {
      const lista = actividadesDe(f.area.value);
      bloque.hidden = !lista.length;
      // Hay que elegir una: sin actividad la hora se puede sumar por area pero
      // no se puede analizar en que se fue. La opcion de arriba no es elegible,
      // solo esta para que no quede una preseleccionada por accidente.
      f.actividad.innerHTML = lista.length
        ? `<option value="" disabled selected>Elegí la actividad…</option>` +
          lista.map((a) => `<option>${esc(a)}</option>`).join("")
        : "";
      // Solo se exige cuando el area tiene lista propia: un area sin
      // actividades cargadas no puede frenar el registro.
      f.actividad.required = lista.length > 0;
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
    if (f.actividad && f.actividad.required && !f.actividad.value) {
      return aviso("Elegí la actividad.", true);
    }
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

// La sección Plan tiene tres pantallas y cada una engancha lo suyo.
function prepararPlan() {
  prepararInicio();
  prepararGeneraciones();
  prepararMapa();
  prepararEdicionCultivos();
}

// Ir a Cultivos con un cultivo desplegado (y una generación abierta para
// editar). Es el único lugar donde se edita: el panel del gráfico y la ficha
// llevan acá, en vez de tener cada uno su propio formulario.
function irAEditar(cultivo, genId = "") {
  vistaPlan = "planificar";
  cultivoAbierto = "";
  genPanel = "";
  cultivoEditando = cultivo;
  genEditando = genId;
  marcoEditando = "";
  render("plan");
  const destino = document.querySelector(genId
    ? `[data-fila-gen="${CSS.escape(genId)}"]`
    : `[data-cultivo-lista="${CSS.escape(cultivo)}"]`);
  if (destino) destino.scrollIntoView({ block: "center" });
}

function prepararEdicionCultivos() {
  const todas = () => leer(LS.generaciones, []) || [];

  // Desde el panel del gráfico, desde la ficha y desde la misma lista.
  document.querySelectorAll("[data-editar-gen]").forEach((b) => {
    b.onclick = (e) => {
      e.preventDefault();
      const g = todas().find((x) => x.id === b.dataset.editarGen);
      if (!g) return;
      if (vistaPlan === "planificar" && !cultivoAbierto) {
        genEditando = genEditando === g.id ? "" : g.id;
        cultivoEditando = g.cultivo;
        render("plan", true);
      } else {
        irAEditar(g.cultivo, g.id);
      }
    };
  });
  document.querySelectorAll("[data-editar-cultivo]").forEach((b) => {
    b.onclick = () => irAEditar(b.dataset.editarCultivo);
  });

  // Qué cultivo queda desplegado: se recuerda para el próximo redibujado.
  document.querySelectorAll("[data-cultivo-lista]").forEach((d) => {
    d.addEventListener("toggle", () => {
      if (d.open) cultivoEditando = d.dataset.cultivoLista;
      else if (claveArea(cultivoEditando) === claveArea(d.dataset.cultivoLista)) cultivoEditando = "";
    });
  });

  // "+ Generaciones": el formulario de arriba, con el cultivo ya elegido.
  document.querySelectorAll("[data-sumar-a]").forEach((b) => {
    b.onclick = () => {
      const f = $("#form-generaciones");
      if (!f) return;
      const cultivo = b.dataset.sumarA;
      const caja = f.querySelector('[data-buscador="cultivo"]');
      if (caja) {
        caja.querySelector(".buscador-texto").value = cultivo;
        caja.querySelector('input[type="hidden"]').value = cultivo;
      }
      f.dispatchEvent(new Event("change"));
      f.scrollIntoView({ block: "start", behavior: "smooth" });
      f.desde.focus({ preventScroll: true });
    };
  });

  // Marco y rinde: son del cultivo, no de cada generación.
  document.querySelectorAll("[data-marco]").forEach((b) => {
    b.onclick = () => {
      marcoEditando = claveArea(marcoEditando) === claveArea(b.dataset.marco) ? "" : b.dataset.marco;
      cultivoEditando = b.dataset.marco;
      render("plan", true);
    };
  });
  document.querySelectorAll("[data-cancelar-marco]").forEach((b) => {
    b.onclick = () => { marcoEditando = ""; render("plan", true); };
  });
  document.querySelectorAll("[data-form-marco]").forEach((f) => {
    f.onsubmit = (e) => {
      e.preventDefault();
      const cultivo = f.dataset.formMarco;
      const rinde = aNumero(f.rinde.value) || 0;
      const lineas = parseInt(f.lineas.value, 10) || 0;
      const distancia = aNumero(f.distancia.value) || 0;
      // Se escribe en el plan y se recalcula con sus generaciones: los kilos
      // salen de la superficie por el rinde, no se cargan.
      const k = claveArea(cultivo);
      const plan = (CFG.plan || []).slice();
      const i = plan.findIndex((p) => claveArea(p.cultivo) === k);
      const nuevo = { ...(i >= 0 ? plan[i] : { cultivo }), rinde_kg_m2: rinde, lineas, distancia_cm: distancia };
      if (i >= 0) plan[i] = nuevo; else plan.push(nuevo);
      CFG = { ...CFG, plan };
      replanearCultivo(cultivo, todas());
      // Los días en bandeja se aplican a todas las generaciones sin sembrar:
      // su fecha a campo pasa a ser la de bandeja más esos días. Las ya
      // sembradas no se tocan: lo que pasó con ellas es un hecho.
      const bandeja = f.bandeja ? parseInt(f.bandeja.value, 10) || 0 : 0;
      let corridas = 0;
      if (bandeja > 0) {
        todas().filter((g) => claveArea(g.cultivo) === k && g.fecha_almacigo && !esSembrada(g))
          .forEach((g) => {
            const campo = sumarDias(g.fecha_almacigo, bandeja);
            if (campo && campo !== g.fecha_campo) {
              guardarGeneracion({ ...g, fecha_campo: campo }, "");
              corridas++;
            }
          });
      }
      marcoEditando = "";
      aviso(`${cultivo}: guardado ✓${corridas ? ` · ${corridas} generación(es) con ${bandeja} días en almácigo` : ""}`);
      render("plan", true);
    };
  });

  // Editar una generación.
  document.querySelectorAll("[data-cancelar-gen]").forEach((b) => {
    b.onclick = () => { genEditando = ""; render("plan", true); };
  });
  document.querySelectorAll("[data-form-gen]").forEach((f) => {
    const g = todas().find((x) => x.id === f.dataset.formGen);
    if (!g) return;
    // Con siembra directa no hay bandeja: el campo se esconde y la fecha que
    // queda es la de siembra en el bancal.
    f.metodo.onchange = () => {
      const directa = f.metodo.value === "Siembra directa";
      f.querySelector(".solo-almacigo").hidden = directa;
      f.querySelector(".rotulo-campo").innerHTML = directa
        ? "Siembra en el bancal" : "A campo <small>(opcional)</small>";
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      const camas = aNumero(f.camas.value);
      if (!(camas > 0)) return aviso("Poné cuántos bancales ocupa.", true);
      let metodo = g.metodo, almacigo = g.fecha_almacigo || "", campo = g.fecha_campo || "";
      if (!esSembrada(g)) {
        metodo = f.metodo.value;
        const directa = metodo === "Siembra directa";
        almacigo = directa ? "" : f.almacigo.value;
        campo = f.campo.value;
        if (directa && !campo) return aviso("Falta la fecha de siembra en el bancal.", true);
        if (!directa && !almacigo) return aviso("Falta la fecha de siembra en bandeja.", true);
      }
      // Si estaba ubicada en el mapa y cambian los bancales, se acomoda desde
      // el primero que tenía. Si no entra en el sector, queda sin ubicar.
      let bancales = bancalesDe(g);
      let sector = g.sector || "";
      if (bancales.length && camas !== Number(g.camas)) {
        const n = Number((sectores().find((s) => claveArea(s.sector) === claveArea(sector)) || {}).bancales) || 0;
        bancales = n ? bancalesQueOcuparia({ camas }, Math.min(...bancales), n) : [];
        if (!bancales.length) sector = "";
      }
      guardarGeneracion({ ...g, metodo, fecha_almacigo: almacigo, fecha_campo: campo,
                          camas, sector, bancales: bancales.join(", ") },
        `${g.cultivo} ${nombreGen(g)} actualizada ✓`);
      replanearCultivo(g.cultivo, todas());
      genEditando = "";
      render("plan", true);
    };
  });

  // Partir una generación en partes iguales, para ubicar cada una por su
  // lado: el tomate de cuatro bancales en dos de dos, o en cuatro de uno. Son
  // la misma siembra —mismo número de generación, mismas fechas—, así que al
  // registrarla quedan sembradas todas juntas.
  document.querySelectorAll("[data-partir]").forEach((b) => {
    b.onclick = () => {
      const lista = todas();
      const g = lista.find((x) => x.id === b.dataset.partir);
      if (!g) return;
      const k = Number(b.dataset.partes);
      const cada = (Number(g.camas) || 0) / k;
      if (!confirm(`¿Partir ${g.cultivo} ${nombreGen(g, lista)} en ${k} partes de ${num(cada, 1)} bancal(es)?\n`
                   + "Quedan con las mismas fechas, y cada una se ubica por su lado en el mapa.")) return;
      const bs = bancalesDe(g);
      const usados = new Set(lista.map((x) => x.id));
      const idNuevo = () => {
        for (const l of "bcdefghij") {
          const id = `${g.id}-${l}`;
          if (!usados.has(id)) { usados.add(id); return id; }
        }
        return `${g.id}-${uid()}`;
      };
      for (let i = 0; i < k; i++) {
        // Si estaba ubicada, cada parte se queda con su tramo de bancales.
        const tramo = bs.length >= (Number(g.camas) || 0) ? bs.slice(i * cada, (i + 1) * cada) : [];
        guardarGeneracion({ ...g, id: i === 0 ? g.id : idNuevo(), camas: cada,
                            bancales: tramo.join(", "), sector: bs.length && !tramo.length ? "" : g.sector },
          `${g.cultivo} ${nombreGen(g, lista)} partida en ${k} ✓`);
      }
      genEditando = "";
      render("plan", true);
    };
  });
}

// Un arrastre con el mouse o el dedo. Se escucha en la ventana y no en el
// elemento: al arrastrar una generación desde la lista, el puntero sale de la
// lista y tiene que seguir llegando. `umbral` son los píxeles que hay que mover
// para que cuente como arrastre y no como un toque.
function seguirArrastre(ev, { alEmpezar, alMover, alSoltar, alTocar, umbral = 5 }) {
  const x0 = ev.clientX, y0 = ev.clientY;
  let arrastrando = false;
  const mover = (e) => {
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (!arrastrando) {
      if (Math.abs(dx) < umbral && Math.abs(dy) < umbral) return;
      arrastrando = true;
      if (alEmpezar) alEmpezar(e);
    }
    e.preventDefault();
    alMover(e, dx, dy);
  };
  const soltar = (e) => {
    window.removeEventListener("pointermove", mover);
    window.removeEventListener("pointerup", soltar);
    window.removeEventListener("pointercancel", soltar);
    if (arrastrando) alSoltar(e, e.type === "pointercancel");
    else if (alTocar) alTocar(e);
  };
  window.addEventListener("pointermove", mover, { passive: false });
  window.addEventListener("pointerup", soltar);
  window.addEventListener("pointercancel", soltar);
}

function prepararMapa() {
  const vista = $("#lz-vista");
  if (!vista) return;
  const lienzo = $("#lz-lienzo");
  const todas = leer(LS.generaciones, []) || [];
  const e = escalaTemporada();
  const bloques = bloquesDelMapa();

  // ---- zoom y desplazamiento ----
  const aplicar = () => {
    lienzo.style.transform = `translate(${vistaMapa.x}px, ${vistaMapa.y}px) scale(${vistaMapa.s})`;
    $("#nivel-zoom").textContent = `${Math.round(vistaMapa.s * 100)}%`;
  };
  // Que entre todo el campo en la vista, centrado.
  const ajustar = () => {
    const minX = Math.min(...bloques.map((b) => b.x)), minY = Math.min(...bloques.map((b) => b.y));
    const maxX = Math.max(...bloques.map((b) => b.x + b.w)), maxY = Math.max(...bloques.map((b) => b.y + b.h));
    const vw = vista.clientWidth, vh = vista.clientHeight;
    const s = Math.max(0.25, Math.min(1.5, (vw - 40) / (maxX - minX), (vh - 40) / (maxY - minY)));
    vistaMapa = { s, x: (vw - (maxX - minX) * s) / 2 - minX * s, y: 20 - minY * s };
  };
  if (!vistaMapa) ajustar();
  aplicar();

  const zoomEn = (px, py, factor) => {
    const s = Math.max(0.25, Math.min(3, vistaMapa.s * factor));
    const k = s / vistaMapa.s;
    vistaMapa = { s, x: px - (px - vistaMapa.x) * k, y: py - (py - vistaMapa.y) * k };
    aplicar();
  };
  // La rueda acerca y aleja sobre el puntero, como en cualquier mapa: lo que
  // está bajo el mouse se queda quieto.
  vista.onwheel = (ev) => {
    ev.preventDefault();
    const r = vista.getBoundingClientRect();
    zoomEn(ev.clientX - r.left - vista.clientLeft, ev.clientY - r.top - vista.clientTop,
      ev.deltaY < 0 ? 1.1 : 1 / 1.1);
  };
  document.querySelectorAll("[data-zoom]").forEach((b) => {
    b.onclick = () => zoomEn(vista.clientWidth / 2, vista.clientHeight / 2,
      b.dataset.zoom === "+" ? 1.25 : 1 / 1.25);
  });
  $("#ajustar-mapa").onclick = () => { ajustar(); aplicar(); };

  // Del punto de la pantalla al punto del lienzo, deshaciendo zoom y desplazamiento.
  const aLienzo = (cx, cy) => {
    // El lienzo arranca adentro del borde de la ventana, no en su canto.
    const r = vista.getBoundingClientRect();
    const x = cx - r.left - vista.clientLeft, y = cy - r.top - vista.clientTop;
    return { x: (x - vistaMapa.x) / vistaMapa.s, y: (y - vistaMapa.y) / vistaMapa.s };
  };
  // Qué sector y qué bancal hay bajo el puntero. Se mira el sector entero, no
  // solo la grilla: soltar un poco arriba o abajo igual cae en su bancal.
  const bancalBajo = (cx, cy) => {
    const p = aLienzo(cx, cy);
    for (const b of bloques) {
      const gx = b.x + LZ.borde + LZ.meses;
      if (p.x >= gx && p.x < gx + b.n * LZ.bancal && p.y >= b.y && p.y <= b.y + b.h) {
        return { b, bancal: Math.floor((p.x - gx) / LZ.bancal) + 1 };
      }
    }
    return null;
  };

  // ---- ubicar generaciones ----
  const guardarUbicacion = (g, sector, bancales) => {
    guardarRegistro("generaciones", {
      generacion_id: g.id, cultivo: g.cultivo, generacion: g.generacion,
      metodo: g.metodo, fecha_almacigo: g.fecha_almacigo,
      fecha_campo: g.fecha_campo, camas: g.camas,
      sector, bancales: bancales.join(", "),
      estado: g.estado, origen: "AMA",
    }, sector
      ? `${g.cultivo} ${nombreGen(g)} → ${sector} ${bancales.join(", ")} ✓`
      : `${g.cultivo} ${nombreGen(g)} sacada del mapa ✓`);
    // Se mueve en la copia local para que el mapa responda al instante.
    escribir(LS.generaciones, todas.map((x) => x.id === g.id
      ? { ...x, sector, bancales: bancales.join(", ") } : x));
    genSeleccionada = "";
    render("plan", true);
  };

  // Ponerla en un bancal. Se avisa si choca pero no se prohíbe: dos cultivos
  // pueden compartir un bancal a propósito, y quien está en el campo sabe mejor
  // que la cuenta.
  const ubicar = (g, sector, n, desde) => {
    const bs = bancalesQueOcuparia(g, desde, n);
    if (!bs.length) return aviso("Ese sector no tiene bancales suficientes.", true);
    if (claveArea(g.sector) === claveArea(sector) && bancalesDe(g).join() === bs.join()) {
      render("plan", true);           // quedó donde estaba
      return;
    }
    const choques = chocanCon(g, sector, bs, todas);
    if (choques.length) {
      const cuales = choques.slice(0, 3).map((x) => `${x.cultivo} G${x.generacion}`).join(", ");
      if (!confirm(`Ahí se superpone con ${cuales}` +
        `${choques.length > 3 ? ` y ${choques.length - 3} más` : ""}.\n¿Ponerla igual?`)) {
        render("plan", true);
        return;
      }
    }
    guardarUbicacion(g, sector, bs);
  };

  // Lo que se ve mientras se arrastra una generación: en el sector de abajo,
  // la franja de bancales libres en sus fechas y dónde caería. Verde si entra,
  // rojo si pisa a otra.
  const limpiarPrevia = () => document.querySelectorAll(".lz-previa")
    .forEach((p) => { p.innerHTML = ""; });
  const mostrarPrevia = (g, destino, agarre) => {
    limpiarPrevia();
    if (!destino) return;
    const { b, bancal } = destino;
    const o = ocupacionDe(g);
    if (!o) return;
    const bs = bancalesQueOcuparia(g, Math.max(1, bancal - agarre), b.n);
    if (!bs.length) return;
    const top = Math.max(0, e.y(o.desde));
    const alto = Math.min(e.alto, e.y(o.hasta)) - top;
    const choca = chocanCon(g, b.sector, bs, todas).length > 0;
    const previa = document.querySelector(`.lz-grilla[data-grilla="${CSS.escape(b.sector)}"] .lz-previa`);
    previa.innerHTML = franjaLibre(g, b.sector, b.n, todas, e)
      + `<i class="lz-destino${choca ? " choca" : ""}" style="left:${(bs[0] - 1) * LZ.bancal}px;
          width:${bs.length * LZ.bancal}px;top:${top}px;height:${Math.max(alto, 4)}px"></i>`;
  };

  // Arrastrar una generación: desde la lista o desde el mapa. Lo que sigue al
  // puntero es una etiqueta; la ubicación se decide por el bancal bajo el
  // puntero, y la altura no se toca porque la fijan las fechas del plan.
  const arrastrarGeneracion = (ev, g, agarre, original) => {
    let flotante = null, destino = null;
    seguirArrastre(ev, {
      alEmpezar: () => {
        flotante = document.createElement("div");
        flotante.className = "lz-flotante";
        flotante.style.background = colorEtapa(g.cultivo, "campo");
        flotante.textContent = `${g.cultivo} ${nombreGen(g)} · ${
          Math.max(1, Math.round(Number(g.camas) || 1))} bancal(es)`;
        document.body.appendChild(flotante);
        document.body.classList.add("lz-arrastrando");
        if (original) original.classList.add("levantada");
      },
      alMover: (m) => {
        flotante.style.left = `${m.clientX + 14}px`;
        flotante.style.top = `${m.clientY + 10}px`;
        destino = bancalBajo(m.clientX, m.clientY);
        mostrarPrevia(g, destino, agarre);
      },
      alSoltar: (_, cancelado) => {
        flotante.remove();
        document.body.classList.remove("lz-arrastrando");
        limpiarPrevia();
        if (original) original.classList.remove("levantada");
        if (cancelado || !destino) return;
        ubicar(g, destino.b.sector, destino.b.n, Math.max(1, destino.bancal - agarre));
      },
      alTocar: () => {
        genSeleccionada = genSeleccionada === g.id ? "" : g.id;
        render("plan", true);
      },
    });
  };

  // Desde la lista de las que faltan ubicar.
  document.querySelectorAll("[data-elegir]").forEach((el) => {
    const g = todas.find((x) => x.id === el.dataset.elegir);
    if (!g) return;
    el.onpointerdown = (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      arrastrarGeneracion(ev, g, 0, null);
    };
    el.onkeydown = (k) => {
      if (k.key === "Enter" || k.key === " ") {
        k.preventDefault();
        genSeleccionada = genSeleccionada === g.id ? "" : g.id;
        render("plan", true);
      }
    };
  });

  // ---- un solo punto de entrada para el lienzo ----
  // Según dónde se aprieta: una generación puesta se arrastra, el título de un
  // sector mueve el sector, y cualquier otro lugar mueve el mapa. Un toque sin
  // arrastrar sobre un bancal ubica la generación elegida.
  vista.onpointerdown = (ev) => {
    if (ev.button !== 0) return;
    const puestaEl = ev.target.closest("[data-puesta]");
    const agarre = ev.target.closest("[data-agarrar]");

    if (puestaEl) {
      ev.preventDefault();
      const g = todas.find((x) => x.id === puestaEl.dataset.puesta);
      if (!g) return;
      // Cuántos bancales a la derecha de su primer bancal se la agarró: así,
      // agarrando un brócoli de tres bancales por el del medio, al soltar queda
      // donde se ve y no corrida.
      const aqui = bancalBajo(ev.clientX, ev.clientY);
      const primero = Math.min(...bancalesDe(g));
      arrastrarGeneracion(ev, g, aqui ? Math.max(0, aqui.bancal - primero) : 0, puestaEl);
      return;
    }

    if (agarre) {
      ev.preventDefault();
      const b = bloques.find((x) => x.sector === agarre.dataset.agarrar);
      const el = agarre.closest(".lz-bloque");
      seguirArrastre(ev, {
        alEmpezar: () => el.classList.add("levantado"),
        alMover: (_, dx, dy) => {
          el.style.left = `${b.x + dx / vistaMapa.s}px`;
          el.style.top = `${b.y + dy / vistaMapa.s}px`;
        },
        alSoltar: (m, cancelado) => {
          el.classList.remove("levantado");
          if (cancelado) { render("plan", true); return; }
          const dx = (m.clientX - ev.clientX) / vistaMapa.s;
          const dy = (m.clientY - ev.clientY) / vistaMapa.s;
          moverSector(b.sector, b.x + dx, b.y + dy);
        },
      });
      return;
    }

    // Mover el mapa. Sin esto el navegador selecciona texto al arrastrar.
    ev.preventDefault();
    const x0 = vistaMapa.x, y0 = vistaMapa.y;
    seguirArrastre(ev, {
      umbral: 3,
      alEmpezar: () => vista.classList.add("moviendo"),
      alMover: (_, dx, dy) => { vistaMapa.x = x0 + dx; vistaMapa.y = y0 + dy; aplicar(); },
      alSoltar: () => vista.classList.remove("moviendo"),
      alTocar: (t) => {
        // Un toque sobre un bancal con una generación elegida: va ahí.
        const g = todas.find((x) => x.id === genSeleccionada);
        const d = g && bancalBajo(t.clientX, t.clientY);
        if (d) ubicar(g, d.b.sector, d.b.n, d.bancal);
      },
    });
  };

  // Guarda la posición nueva de un sector. Se redondea a pasos de 25 px, que es
  // lo que hace que alinearlos a ojo sea fácil. Si quedó algo a la izquierda o
  // arriba del cero, se corre todo el campo junto: las posiciones se guardan
  // desde 1 y un número negativo se perdería.
  const moverSector = (nombre, x, y) => {
    const pos = bloques.map((b) => ({
      sector: b.sector,
      x: Math.round((b.sector === nombre ? x : b.x) / LZ.paso) * LZ.paso,
      y: Math.round((b.sector === nombre ? y : b.y) / LZ.paso) * LZ.paso,
    }));
    const minX = Math.min(...pos.map((p) => p.x)), minY = Math.min(...pos.map((p) => p.y));
    // La vista se corre lo mismo, así en pantalla no salta nada.
    vistaMapa.x += minX * vistaMapa.s;
    vistaMapa.y += minY * vistaMapa.s;
    const lista = sectores().map((s) => {
      const p = pos.find((q) => q.sector === s.sector);
      return { ...s, columna: (p.x - minX) / LZ.paso + 1, fila: (p.y - minY) / LZ.paso + 1 };
    });
    guardarConfig({ sectores: lista }, `${nombre} movido ✓`, "plan");
  };

  const cancelar = $("#cancelar-eleccion");
  if (cancelar) cancelar.onclick = () => { genSeleccionada = ""; render("plan", true); };
  const sacar = $("#sacar-del-mapa");
  if (sacar) sacar.onclick = () => {
    const g = todas.find((x) => x.id === genSeleccionada);
    if (g && confirm(`¿Sacar ${g.cultivo} ${nombreGen(g)} del mapa?\n` +
                     "Queda en el plan, solo sin lugar asignado.")) {
      guardarUbicacion(g, "", []);
    }
  };
}

function prepararGeneraciones() {
  const f = $("#form-generaciones");
  if (!f) return;
  enlazarBuscadores(f);
  const calculo = $("#calculo-generaciones");
  const existentes = leer(LS.generaciones, []) || [];

  // Las fechas de la serie: la primera, y después cada tantos días.
  const fechas = () => {
    const desde = f.desde.value;
    const cuantas = Math.max(1, parseInt(f.cuantas.value, 10) || 1);
    const cada = Math.max(1, parseInt(f.cada.value, 10) || 14);
    if (!desde) return [];
    // La primera va tal cual: sumarDias devuelve vacío con 0 días, y hace bien
    // —un perfil sin dato no debe inventar una fecha—, pero acá 0 es un
    // desplazamiento legítimo.
    return Array.from({ length: cuantas },
      (_, i) => (i === 0 ? desde : sumarDias(desde, i * cada)));
  };

  // Al elegir el cultivo se trae su marco: primero lo que ya decidió esta
  // chacra, y si no, lo que dice el catálogo.
  let ultimoCultivo = "";
  const alElegirCultivo = () => {
    const c = f.cultivo.value;
    if (!c || c === ultimoCultivo) return;
    ultimoCultivo = c;
    const ya = enPlan(c) || {};
    const p = perfil(c) || {};
    f.lineas.value = ya.lineas || p.lineas_bancal || "";
    f.distancia.value = ya.distancia_cm || p.distancia_cm || "";
    f.rinde.value = ya.rinde_kg_m2 || p.rinde_ref_kg_m2 || "";
    const tipo = /almácigo|almacigo/i.test(p.tipo_siembra || "")
      ? "Trasplante" : "Siembra directa";
    f.metodo.value = tipo;
    actualizar();
  };

  // Lo que la serie va a ocupar y a dar. Es la cuenta que antes había que
  // hacer aparte en Configuración.
  const cuentas = () => {
    const bancales = (aNumero(f.camas.value) || 0)
      * Math.max(1, parseInt(f.cuantas.value, 10) || 1);
    const m2 = bancalM2();
    const superficie = bancales * m2;
    const rinde = aNumero(f.rinde.value) || 0;
    return {
      bancales, superficie,
      kg: Math.round(superficie * rinde),
      plantas: plantasDe({ bancales,
        lineas: parseInt(f.lineas.value, 10) || 0,
        distancia_cm: aNumero(f.distancia.value) || 0 }),
    };
  };

  const actualizar = () => {
    const cultivo = f.cultivo.value;
    const fs = fechas();
    if (!cultivo || !fs.length) {
      calculo.innerHTML = "Elegí el cultivo y cuándo arranca.";
      return;
    }
    // La numeración sigue donde quedó: si ya hay tres generaciones de brócoli,
    // la próxima serie empieza en la cuatro.
    const ya = existentes.filter((g) => claveArea(g.cultivo) === claveArea(cultivo));
    const desdeN = ya.length ? Math.max(...ya.map((g) => g.generacion)) + 1 : 1;
    const directa = f.metodo.value === "Siembra directa";
    const p = perfil(cultivo) || {};
    const aCosecha = directa ? p.dias_a_cosecha : p.dias_trasplante_cosecha;

    const primera = fs[0], ultima = fs[fs.length - 1];
    // Cuándo estaría cosechándose la última, que es lo que dice si la serie
    // entra en la temporada o se va de largo.
    const campoUlt = directa ? ultima : sumarDias(ultima,
      diasBandejaDelCultivo(cultivo, existentes) || diasAlmacigo(cultivo, ultima));
    const cosechaUlt = aCosecha ? sumarDias(campoUlt, aCosecha) : "";

    const c = cuentas();
    calculo.innerHTML = `<b>${fs.length} generación(es)</b> de ${esc(cultivo)},`
      + ` G${desdeN}${fs.length > 1 ? ` a G${desdeN + fs.length - 1}` : ""}`
      + (c.bancales ? ` · <b>${num(c.bancales, 1)} bancales</b> (${num(c.superficie)} m²)` : "")
      + (c.kg ? ` · <b>${num(c.kg)} kg</b> esperados` : "")
      + `<br><small>de ${fechaCorta(primera)}${fs.length > 1 ? ` a ${fechaCorta(ultima)}` : ""}`
      + (cosechaUlt ? ` · la última se cosecharía cerca del ${fechaCorta(cosechaUlt)}` : "")
      + (c.plantas ? ` · ${num(c.plantas)} plantas` : "")
      + (ya.length ? `<br>Ya hay ${ya.length} de este cultivo en el plan: esto se suma.` : "")
      + (bancalM2() ? "" : "<br>Faltan las medidas del bancal, en Configuración: sin eso no hay m² ni kilos.")
      + "</small>";
  };

  ["desde", "cuantas", "cada", "metodo", "camas", "lineas", "distancia", "rinde"]
    .forEach((n) => f[n].addEventListener("input", actualizar));
  f.addEventListener("change", () => { alElegirCultivo(); actualizar(); });
  actualizar();

  f.onsubmit = (e) => {
    e.preventDefault();
    const cultivo = f.cultivo.value;
    if (!cultivo) return aviso("Elegí qué cultivo estás planificando.", true);
    const fs = fechas();
    if (!fs.length) return aviso("Falta la fecha de la primera siembra.", true);

    const ya = existentes.filter((g) => claveArea(g.cultivo) === claveArea(cultivo));
    const desdeN = ya.length ? Math.max(...ya.map((g) => g.generacion)) + 1 : 1;
    const directa = f.metodo.value === "Siembra directa";
    const camas = aNumero(f.camas.value) || "";

    // El plan por cultivo se recalcula con TODAS sus generaciones, las que ya
    // había y las nuevas. Antes ese total se cargaba aparte en Configuración y
    // podía quedar diciendo una cosa mientras las generaciones decían otra.
    const c = cuentas();
    const bancalesPrevios = ya.reduce((a, g) => a + (Number(g.camas) || 0), 0);
    const bancalesTotal = bancalesPrevios + c.bancales;
    const m2 = bancalM2();
    const superficie = bancalesTotal * m2;
    const rinde = aNumero(f.rinde.value) || 0;
    const lineas = parseInt(f.lineas.value, 10) || 0;
    const distancia = aNumero(f.distancia.value) || 0;
    if (m2 && bancalesTotal) {
      const plan = [...(CFG?.plan || [])].filter((p) => p.cultivo !== cultivo);
      plan.push({
        cultivo,
        superficie_m2: Math.round(superficie * 100) / 100,
        cosecha_esperada_kg: Math.round(superficie * rinde),
        rinde_kg_m2: rinde, lineas, distancia_cm: distancia,
        plantas: plantasDe({ bancales: bancalesTotal, lineas, distancia_cm: distancia }),
      });
      plan.sort((a, b) => a.cultivo.localeCompare(b.cultivo));
      guardarConfig({ plan }, "", "");
    }

    // Las nuevas trasplantan igual que las que ya hay de este cultivo.
    const bandeja = directa ? 0 : diasBandejaDelCultivo(cultivo, existentes);
    fs.forEach((fecha, i) => {
      const n = desdeN + i;
      guardarGeneracion({
        // El id lleva cultivo y número: volver a cargar la misma generación la
        // pisa en vez de duplicarla.
        id: `gen-${claveArea(cultivo)}-${n}`,
        cultivo, generacion: n,
        metodo: f.metodo.value,
        // En siembra directa la planta arranca en el bancal: no hay bandeja.
        fecha_almacigo: directa ? "" : fecha,
        fecha_campo: directa ? fecha : (bandeja ? sumarDias(fecha, bandeja) : ""),
        camas, sector: f.sector.value,
        estado: "Planificado",
      }, `${fs.length} generación(es) de ${cultivo} al plan ✓`);
    });
    // Aparece ya en la lista y en el gráfico: sale de la copia local, que
    // incluye lo que todavía está en camino a la planilla.
    cultivoEditando = cultivo;
    render("plan", true);
    const nuevo = document.querySelector(`[data-cultivo-lista="${CSS.escape(cultivo)}"]`);
    if (nuevo) nuevo.scrollIntoView({ block: "nearest" });
  };

  // Sacar una del plan.
  document.querySelectorAll("[data-borrar-gen]").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.borrarGen;
      if (!confirm("¿Sacar esta generación del plan?")) return;
      guardarRegistro("generacion_borrar", { generacion_id: id }, "Sacada del plan ✓");
      // Se saca de la copia local para que no siga a la vista hasta sincronizar.
      const todas = leer(LS.generaciones, []) || [];
      const sacada = todas.find((g) => g.id === id);
      const quedan = todas.filter((g) => g.id !== id);
      escribir(LS.generaciones, quedan);
      if (sacada) replanearCultivo(sacada.cultivo, quedan);
      render("plan", true);
    };
  });
}

function prepararCosechas() {
  const f = $("#form-cosechas");
  // Si el teléfono todavía no está activado, la vista muestra la tarjeta
  // del código y este formulario no existe.
  if (!f) return;
  const calculo = $("#calculo-cosecha");
  const renglones = $("#renglones-cosecha");
  const pizarra = $("#pizarra-cosecha");
  let proximo = 1;

  // Elegir el modo: queda guardado en el teléfono para la próxima vez.
  document.querySelectorAll("[data-modo-cosecha]").forEach((b) => {
    b.onclick = () => {
      modoCosecha = b.dataset.modoCosecha;
      escribir(LS.modoCosecha, modoCosecha);
      render("cosechas");
    };
  });

  enlazarBuscadores(f);

  // Los dos modos se leen igual de afuera: una lista de cultivo + kilos. En
  // pizarra se descartan los que quedaron vacíos, que son la mayoría.
  const leerRenglones = () => {
    if (pizarra) {
      return [...pizarra.querySelectorAll("input[data-cultivo]")]
        .map((inp) => ({ cultivo: inp.dataset.cultivo, kg: aNumero(inp.value) || 0 }))
        .filter((r) => r.kg > 0);
    }
    return [...renglones.querySelectorAll(".renglon-cosecha")]
      .map((div) => {
        const i = div.dataset.renglon;
        return { cultivo: f["cultivo_" + i]?.value || "", kg: aNumero(f["kg_" + i]?.value) || 0 };
      })
      .filter((r) => r.cultivo || r.kg);
  };

  const actualizar = () => {
    const cargados = leerRenglones().filter((r) => r.cultivo && r.kg > 0);
    if (!cargados.length) {
      calculo.innerHTML = pizarra
        ? "Escribí los kilos en los cultivos que cosechaste. Los vacíos no se guardan."
        : "Cargá el cultivo y los kilos. Con el + sumás más cultivos.";
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

  // En pizarra no hay renglones que agregar ni quitar: la lista es fija y los
  // vacíos simplemente no se guardan. Enter pasa al casillero siguiente.
  if (pizarra) {
    const campos = [...pizarra.querySelectorAll("input[data-cultivo]")];
    campos.forEach((campo, i) => {
      campo.onkeydown = (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        (campos[i + 1] || campo).focus();
      };
    });
    engancharSubmit();
    return;
  }

  const engancharQuitar = () => {
    renglones.querySelectorAll("[data-quitar-renglon]").forEach((b) => {
      b.onclick = () => {
        b.closest(".renglon-cosecha").remove();
        actualizar();
      };
    });
  };
  engancharQuitar();

  const sumarRenglon = () => {
    renglones.insertAdjacentHTML("beforeend", renglonCosecha(proximo++));
    enlazarBuscadores(f);          // enciende solo el buscador nuevo
    engancharQuitar();
    engancharEnter();
    actualizar();
    renglones.lastElementChild.querySelector(".buscador-texto").focus();
  };
  $("#btn-mas-cultivo").onclick = sumarRenglon;

  // Enter en los kilos abre el renglón siguiente. Pasar una pizarra de veinte
  // cultivos es teclear, no apuntar: sin esto hay que bajar la mano al + entre
  // cada uno. El submit del formulario queda para el botón Guardar.
  function engancharEnter() {
    renglones.querySelectorAll("input[name^=kg_]").forEach((campo) => {
      if (campo.dataset.enter) return;
      campo.dataset.enter = "1";
      campo.onkeydown = (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const ultimo = campo.closest(".renglon-cosecha") === renglones.lastElementChild;
        if (ultimo) sumarRenglon();
        else renglones.lastElementChild.querySelector(".buscador-texto").focus();
      };
    });
  }
  engancharEnter();

  engancharSubmit();

  function engancharSubmit() {
  f.onsubmit = (e) => {
    e.preventDefault();
    const cargados = leerRenglones();
    if (!cargados.length) {
      return aviso(pizarra
        ? "Escribí los kilos de al menos un cultivo."
        : "Cargá al menos un cultivo con sus kilos.", true);
    }

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
}

function prepararAjustes() {
  const esScript = (u) => !u || u.startsWith("https://script.google.com/");

  // Borra la copia guardada y vuelve a pedir todo a la red. Los registros que
  // esperan enviarse NO se tocan: viven aparte y se sincronizan igual.
  $("#btn-actualizar-app").onclick = async () => {
    aviso("Buscando actualización…");
    try {
      for (const k of await caches.keys()) await caches.delete(k);
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.update();
    } catch (_) { /* sin service worker igual conviene recargar */ }
    location.reload();
  };

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
  await traerCatalogo();
  if (["inicio", "plan"].includes(vistaActual)) redibujarConDatos(vistaActual);
  sincronizar();
})();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
