// js/catalogo.js      — AMA Producción
//
// La chacra y sus cultivos: catálogo común y perfiles, días de almácigo por
// estación, sectores y bancales, áreas de trabajo fijas, integrantes, y el plan
// por cultivo de la configuración (replanearCultivo).
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos. Se partió app.js el 30/09/2026 sin cambiar código.

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

function cultivosOrdenados() {
  const delPlan = (CFG?.plan || []).map((p) => p.cultivo);
  const otros = cultivosDisponibles().filter((c) => !delPlan.includes(c));
  return { lista: [...delPlan, ...otros], delPlan };
}

// Los cultivos de la pizarra: los del plan de la temporada de esta chacra, que
// son los que se sembraron y por lo tanto los únicos que se pueden cosechar.
// No el catálogo entero: son 38 y la mayoría no los cultiva nadie acá.
const cultivosDelPlan = () => (CFG?.plan || [])
  .map((p) => p.cultivo)
  .filter(Boolean);

// Cuántas plantas entran: las líneas del bancal por lo que da la distancia a lo
// largo, por la cantidad de bancales.
function plantasDe({ bancales, lineas, distancia_cm }) {
  const largoCm = (CFG?.bancal?.largo_m || 0) * 100;
  if (!largoCm || !lineas || !distancia_cm) return 0;
  return Math.round(lineas * Math.floor(largoCm / distancia_cm) * bancales);
}
