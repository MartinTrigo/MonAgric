// ==========================================================
// MonAgric — servicio Apps Script (varias chacras)
//
// Un solo servicio atiende a todas las chacras: cada registro dice de que
// chacra viene y se escribe en la planilla de esa chacra. Asi cada colectivo
// tiene sus datos en su propio archivo, pero todos usan el mismo enlace y no
// hay que publicar un servicio por chacra.
//
// PARA SUMAR UNA CHACRA (no hace falta tocar este codigo):
//   1. Crear una planilla nueva en Drive, por ejemplo "MonAgric · Chacra X".
//   2. En el editor: Configuracion del proyecto (engranaje) → Propiedades del
//      script → agregar/editar la propiedad CHACRAS con un JSON asi:
//        {"tica":"1PrP0F…","vega":"1AbC…"}
//      (la clave es el codigo corto de la chacra; el valor, el id de su planilla)
//   3. Implementar → Administrar implementaciones → lapiz → Nueva version.
//
// Si CHACRAS no esta definida, todo va a la planilla donde vive el script, que
// es como funcionaba antes.
//
// Como publicarlo: ver docs/README.md.
// ==========================================================

// Las horas de Chacra Tica siguen yendo a la planilla del proyecto Bioma, donde
// estan cargadas desde julio. Las demas chacras las guardan en su propia hoja.
var PLANILLA_HORAS_TICA = "1tx8V0VLciiTLFvAmSViAR6KV9LL9hXzvX6-qy30Ubpg";
var CHACRA_CON_HORAS_APARTE = "tica";

// Los puntajes del juego (Pac-Farm) van a su propia planilla, aparte de los
// datos productivos: es un juego, no tiene por que mezclarse con la produccion.
// Todas las chacras escriben ahi, cada fila dice de cual es, y el ranking de
// cada chacra sale filtrando por esa columna.
var PLANILLA_JUEGO_ID = "1FdOqQXgnHbNUOq8-v2vgBYqGIjhpxT-NLhNU1dWJOJU";
var JUEGO_ENCABEZADOS = ["Id", "Chacra", "Jugador", "Puntos", "Nivel", "Fecha",
                         "Cargado por", "Recibido"];

// Lo que la gente propone mejorar de la app, de todas las chacras juntas: es
// para leerlo y arreglar, no es un dato productivo.
var PLANILLA_SUGERENCIAS_ID = "1h8_pLYZ3jkm_1qfT6c0_XBK-oPoOnwms3gb97zMLW0E";
var SUGERENCIAS_ENCABEZADOS = ["Id", "Chacra", "Quién", "Fecha", "Qué mejoraría",
                               "Cargado por", "Recibido"];

// El panel que ven TODAS las chacras, una hoja por cada una. Va solo lo
// comparable —lo planificado contra lo cosechado, por cultivo— y nunca el
// detalle de las personas: quien trabajo cuantas horas es asunto de cada
// chacra. Se comparte como lectores, para que nadie dependa de que otro le
// pase los numeros.
var PLANILLA_PANEL_ID = "1JMFhJIeTB9aPhTwQLqKolChh23WdMgaWEtqOz-yabx0";

// ==========================================================
// ACCESOS
// Sin esto, cualquiera con la direccion del servicio —que esta en el codigo
// publico— podia leer los datos de todas las chacras, inventar registros y
// hasta borrar la configuracion de una temporada entera.
//
// Como funciona: cada persona canjea UNA VEZ un codigo de invitacion y su
// telefono recibe una credencial larga y al azar. De ahi en mas cada pedido
// viaja con esa credencial. Si un telefono se pierde o alguien se va, se pone
// NO en su fila y ese telefono deja de poder cargar, sin tocar a los demas.
//
// De la credencial se guarda solo la huella (SHA-256): sirve para comprobarla
// pero no permite reconstruirla.
// ==========================================================
var PLANILLA_ACCESOS_ID = "183J8UGFKGOOwZVWlA4qO_Mb7BMXS_i_435BR4hOBiYc";

var INVITACIONES_ENCABEZADOS = ["Código", "Chacra", "Para quién", "Estado", "Creada",
                                "Usada el", "Dispositivo"];
var DISPOSITIVOS_ENCABEZADOS = ["Dispositivo", "Chacra", "Persona", "Activo", "Alta",
                                "Última actividad", "Registros", "Huella"];

// Entradas que puede usar cualquiera: solo dicen que el servicio esta vivo.
var ABIERTAS = ["ping", "canjear"];
var PANEL_ENCABEZADOS = ["Cultivo", "Bancales", "m² planificados", "Kg esperados",
                         "Kg cosechados", "% de lo esperado", "Rinde real kg/m²",
                         "Siembras", "Plantines"];

var HOJAS = {
  siembras: {
    nombre: "Siembras",
    encabezados: ["Id", "Temporada", "Fecha", "Cultivo", "Variedad", "Tipo", "Generación",
                  "Bandejas", "Alvéolos", "Plantines", "Sector", "Bancal",
                  "Trasplante estimado", "Cosecha estimada", "Operador", "Observaciones",
                  "Cargado por", "Recibido"],
    fila: function (r) {
      var d = r.datos;
      return [r.id, r.temporada || "", d.fecha, d.cultivo, d.variedad || "", d.tipo, d.generacion,
              d.bandejas || "", d.tipo_bandeja || "", d.plantines || "", d.sector || "", d.bancal || "",
              d.trasplante_estimado || "", d.cosecha_estimada || "", d.operador || "",
              d.observaciones || "", r.dispositivo || "", new Date()];
    },
  },
  tareas: {
    nombre: "Tareas",
    encabezados: ["Id", "Temporada", "Proyecto", "Para cuándo", "Tarea", "Importancia",
                  "Personas", "Estado", "Quién la toma", "Anotó", "Hecha el", "Hecha por",
                  "Cargado por", "Recibido"],
    fila: function (r) {
      var d = r.datos;
      return [r.id, r.temporada || "", d.proyecto || "", d.fecha, d.tarea,
              d.importancia || "Media", d.personas || 1, "Pendiente", d.asignada || "",
              d.creada_por || "", "", "", r.dispositivo || "", new Date()];
    },
  },
  // Se cosecha de varios bancales a la vez, asi que se registran los kilos
  // totales por cultivo; el rendimiento sale despues contra el plan.
  cosechas: {
    nombre: "Cosechas",
    encabezados: ["Id", "Temporada", "Fecha", "Cultivo", "Kg", "Cosechó",
                  "Cargado por", "Recibido"],
    fila: function (r) {
      var d = r.datos;
      return [r.id, r.temporada || "", d.fecha, d.cultivo, d.kg,
              d.operador || "", r.dispositivo || "", new Date()];
    },
  },
  horas: {
    nombre: "Horas",
    encabezados: ["Id", "Temporada", "Fecha", "Integrante", "Horas", "Actividad",
                  "Proyecto", "Observaciones", "Cargado por", "Recibido"],
    fila: function (r) {
      var d = r.datos;
      return [r.id, r.temporada || "", d.fecha, d.integrante, d.horas, d.actividad || "",
              d.proyecto || "", d.observaciones || "", r.dispositivo || "", new Date()];
    },
  },
};

// ---------- Accesos: canje, validacion y bajas ----------

function hojaAccesos(nombre, encabezados) {
  return hojaSuelta(PLANILLA_ACCESOS_ID, nombre, encabezados);
}

// La huella: de la credencial sale siempre la misma, pero de la huella no se
// puede volver a la credencial. Asi, ni leyendo la planilla se saca nada util.
function huella(texto) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
                                      String(texto), Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    return ("0" + (b < 0 ? b + 256 : b).toString(16)).slice(-2);
  }).join("");
}

function alAzar(largo) {
  var letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // sin I, O, 0 ni 1: se confunden
  var s = "";
  for (var i = 0; i < largo; i++) s += letras.charAt(Math.floor(Math.random() * letras.length));
  return s;
}

function esAdmin(clave) {
  var guardada = PropertiesService.getScriptProperties().getProperty("CLAVE_ADMIN");
  return !!guardada && String(clave || "") === guardada;
}

// Canjea el codigo por una credencial. El codigo queda usado y no sirve mas.
function canjearInvitacion(chacra, codigo, persona, dispositivo) {
  codigo = String(codigo || "").trim().toUpperCase();
  if (!codigo || !chacra) return rechazo("Falta el código o la chacra.");
  if (!dispositivo) return rechazo("Falta el identificador del teléfono.");

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var hoja = hojaAccesos("Invitaciones", INVITACIONES_ENCABEZADOS);
    if (hoja.getLastRow() < 2) return rechazo("Ese código no existe.");

    var filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, INVITACIONES_ENCABEZADOS.length)
                    .getValues();
    for (var i = 0; i < filas.length; i++) {
      if (String(filas[i][0]).trim().toUpperCase() !== codigo) continue;

      if (String(filas[i][1]).toLowerCase() !== String(chacra).toLowerCase()) {
        return rechazo("Ese código es de otra chacra.");
      }
      if (String(filas[i][3]).toLowerCase() === "usado") {
        return rechazo("Ese código ya se usó en otro teléfono.");
      }

      var credencial = alAzar(8) + "-" + alAzar(8) + "-" + alAzar(8);
      var quien = persona || String(filas[i][2] || "");
      registrarDispositivo(chacra, dispositivo, quien, credencial);

      var fila = i + 2;
      hoja.getRange(fila, 4, 1, 4).setValues([["Usado", filas[i][4], new Date(), dispositivo]]);
      return { ok: true, credencial: credencial, persona: quien };
    }
    return rechazo("Ese código no existe.");
  } finally {
    lock.releaseLock();
  }
}

function registrarDispositivo(chacra, dispositivo, persona, credencial) {
  var hoja = hojaAccesos("Dispositivos", DISPOSITIVOS_ENCABEZADOS);
  hoja.appendRow([dispositivo, chacra, persona, "SÍ", new Date(), new Date(), 0,
                  huella(credencial)]);
}

// Comprueba que el telefono este registrado, activo y sea de esa chacra.
function permitido(chacra, credencial, dispositivo) {
  if (!credencial) return rechazo("Este teléfono todavía no tiene acceso.");

  var hoja = SpreadsheetApp.openById(PLANILLA_ACCESOS_ID).getSheetByName("Dispositivos");
  if (!hoja || hoja.getLastRow() < 2) return rechazo("Este teléfono todavía no tiene acceso.");

  var buscada = huella(credencial);
  var filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, DISPOSITIVOS_ENCABEZADOS.length)
                  .getValues();
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][7]) !== buscada) continue;
    if (String(filas[i][1]).toLowerCase() !== String(chacra).toLowerCase()) {
      return rechazo("Esa credencial no es de esta chacra.");
    }
    if (String(filas[i][3]).toUpperCase().indexOf("S") !== 0) {
      return rechazo("Este teléfono fue dado de baja. Pedí un código nuevo.");
    }
    return { ok: true, fila: i + 2, persona: String(filas[i][2] || "") };
  }
  return rechazo("Credencial desconocida. Pedí un código nuevo.");
}

// Deja constancia de que ese telefono estuvo activo y cuanto cargo.
function marcarActividad(fila, cuantos) {
  try {
    var hoja = SpreadsheetApp.openById(PLANILLA_ACCESOS_ID).getSheetByName("Dispositivos");
    hoja.getRange(fila, 6).setValue(new Date());
    if (cuantos) {
      var previos = Number(hoja.getRange(fila, 7).getValue()) || 0;
      hoja.getRange(fila, 7).setValue(previos + cuantos);
    }
  } catch (err) { /* que no se caiga el registro por no poder anotar la visita */ }
}

// ---------- A que planilla escribe cada chacra ----------

function planillaDe(chacra) {
  var mapa = {};
  try {
    mapa = JSON.parse(PropertiesService.getScriptProperties().getProperty("CHACRAS") || "{}");
  } catch (err) { mapa = {}; }

  var id = mapa[String(chacra || "").toLowerCase()];
  if (!id) return SpreadsheetApp.getActiveSpreadsheet();   // sin tabla: la de siempre
  return SpreadsheetApp.openById(id);
}

function chacrasConocidas() {
  try {
    return Object.keys(JSON.parse(
      PropertiesService.getScriptProperties().getProperty("CHACRAS") || "{}"));
  } catch (err) { return []; }
}

// ---------- Entradas del servicio ----------

// Todo va envuelto: si algo falla, Apps Script devuelve una pagina HTML de
// error que no dice nada. Asi al menos vuelve el motivo en el JSON.
function doGet(e) {
  try {
    return atender((e && e.parameter) || {});
  } catch (err) {
    return respuesta({ ok: false, error: String(err), donde: "doGet" });
  }
}

function atender(p) {
  var chacra = p.chacra || "";

  // Canjear el codigo de invitacion por la credencial de este telefono.
  if (p.canjear) {
    return respuesta(canjearInvitacion(chacra, p.canjear, p.persona || "", p.dispositivo || ""));
  }

  // El panel y exportar son cosa de la administracion: van con la clave de
  // admin, que solo esta en las herramientas de escritorio de Martin.
  if (p.panel || p.exportar) {
    if (!esAdmin(p.clave)) return respuesta(rechazo("Esto es solo para la administración."));
    if (p.panel) return respuesta(actualizarPanel(chacra));
    return respuesta({ ok: true, hoja: p.exportar, filas: exportarHoja(chacra, p.exportar) });
  }

  // Todo lo que entregue datos de una chacra exige credencial de esa chacra.
  // La clave de administracion tambien sirve: es la que usan las herramientas
  // de escritorio, que no tienen un telefono asociado.
  if (p.config || p.resumen || p.tareas || p.ranking || p.ultimos) {
    var permiso = esAdmin(p.clave) ? { ok: true }
                                   : permitido(chacra, p.credencial, p.dispositivo);
    if (!permiso.ok) return respuesta(permiso);

    if (p.config) return respuesta({ ok: true, config: leerConfig(chacra) });
    if (p.resumen) return respuesta(calcularResumen(chacra));
    if (p.tareas) return respuesta({ ok: true, tareas: listaDeTareas(chacra) });
    if (p.ranking) return respuesta({ ok: true, ranking: rankingDelJuego(chacra) });
    return respuesta({ ok: true, hoja: p.ultimos,
                       filas: ultimosDeHoja(chacra, p.ultimos, Number(p.n) || 15) });
  }

  // Sin credencial solo se sabe que el servicio existe.
  return respuesta({ ok: true, servicio: "MonAgric", chacras: chacrasConocidas(),
                     hora: new Date().toISOString() });
}

function rechazo(motivo) {
  return { ok: false, sin_permiso: true, error: motivo };
}

function doPost(e) {
  try {
    var cuerpo = JSON.parse(e.postData.contents);
    var chacra = cuerpo.chacra || "";
    var registros = cuerpo.registros || [];

    // Nada se escribe sin credencial. Antes, cualquiera con la direccion podia
    // inventar registros o borrar la configuracion de una temporada entera.
    var permiso = esAdmin(cuerpo.clave)
      ? { ok: true, fila: 0 }
      : permitido(chacra, cuerpo.credencial, cuerpo.dispositivo);
    if (!permiso.ok) return respuesta(permiso);

    var libro = planillaDe(chacra);
    var guardados = 0;

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      registros.forEach(function (r) {
        if (r.tipo === "tareas_hecha") { marcarTareaHecha(libro, r); guardados++; }
        else if (r.tipo === "config") { guardarConfig(libro, r.datos); guardados++; }
        else if (r.tipo === "puntaje") { guardarPuntaje(chacra, r); guardados++; }
        else if (r.tipo === "sugerencia") { guardarSugerencia(chacra, r); guardados++; }
      });

      var porTipo = {};
      registros.forEach(function (r) {
        if (!HOJAS[r.tipo]) return;
        (porTipo[r.tipo] = porTipo[r.tipo] || []).push(r);
      });

      Object.keys(porTipo).forEach(function (tipo) {
        var def = HOJAS[tipo];
        var hoja = obtenerHoja(libro, def);
        var existentes = idsExistentes(hoja);
        var filas = [];
        porTipo[tipo].forEach(function (r) {
          if (existentes[r.id]) return;      // reintento de algo que ya llego
          existentes[r.id] = true;
          filas.push(def.fila(r));
        });
        if (filas.length) {
          hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, def.encabezados.length)
              .setValues(filas);
          guardados += filas.length;
        }
      });
    } finally {
      lock.releaseLock();
    }
    CacheService.getScriptCache().remove("resumen_" + chacra);
    if (permiso.fila) marcarActividad(permiso.fila, guardados);
    return respuesta({ ok: true, recibidos: registros.length, guardados: guardados });
  } catch (err) {
    return respuesta({ ok: false, error: String(err) });
  }
}

// ---------- Configuracion de la chacra (hoja Config) ----------
// Formato plano y legible, una fila por dato:
//   Sección | Clave | Valor 1 | Valor 2 | Valor 3
// Ejemplos:
//   chacra     | nombre    | Chacra Tica
//   temporada  | nombre    | 2026-27
//   bancal     | largo_m   | 30
//   sector     | A         | 10      | Aspersión
//   integrante | Marto     |
//   plan       | Lechuga   | 150     | 720

// Las filas de "plan" usan todos los valores:
//   plan | Lechuga | superficie m2 | kg esperados | rinde kg/m2 | lineas | distancia cm | plantas
var CONFIG_ENCABEZADOS = ["Sección", "Clave", "Valor 1", "Valor 2", "Valor 3",
                          "Valor 4", "Valor 5", "Valor 6"];
var CONFIG_COLS = CONFIG_ENCABEZADOS.length;

function hojaConfig(libro) {
  var hoja = libro.getSheetByName("Config");
  if (!hoja) hoja = libro.insertSheet("Config");
  // El encabezado se rehace siempre: la configuracion se reescribe entera, asi
  // que no hay datos que se puedan correr de lugar.
  ponerEncabezados(hoja, CONFIG_ENCABEZADOS);
  return hoja;
}

function leerConfig(chacra) {
  return leerConfigDe(planillaDe(chacra), chacra);
}

// Igual que leerConfig, pero con la planilla ya abierta. Abrirla una sola vez
// hace toda la diferencia cuando hay que recorrer varias chacras seguidas.
function leerConfigDe(libro, chacra) {
  var hoja = libro.getSheetByName("Config");
  // La direccion de la planilla viaja con la configuracion: la app la usa para
  // el enlace "ver todo en la planilla".
  var cfg = { chacra: chacra, planilla: libro.getUrl(), temporada: {}, bancal: {},
              sectores: [], integrantes: [], proyectos: [], plan: [] };
  if (!hoja || hoja.getLastRow() < 2) return cfg;

  // Las fechas la planilla las guarda como fecha de verdad, no como texto: hay
  // que devolverlas como 2026-07-07 y no como "Tue Jul 07 2026 00:00:00 GMT…".
  var tz = Session.getScriptTimeZone();
  var texto = function (v) {
    return (v instanceof Date) ? Utilities.formatDate(v, tz, "yyyy-MM-dd") : String(v || "");
  };

  hoja.getRange(2, 1, hoja.getLastRow() - 1, CONFIG_COLS).getValues().forEach(function (f) {
    var seccion = String(f[0]), clave = String(f[1]);
    if (!seccion) return;
    if (seccion === "chacra") cfg[clave] = texto(f[2]);
    else if (seccion === "temporada") cfg.temporada[clave] = texto(f[2]);
    else if (seccion === "bancal") cfg.bancal[clave] = Number(f[2]) || 0;
    else if (seccion === "sector") {
      cfg.sectores.push({ sector: clave, bancales: Number(f[2]) || 0, tipo_riego: String(f[3] || "") });
    } else if (seccion === "integrante") cfg.integrantes.push(clave);
    else if (seccion === "proyecto") {
      cfg.proyectos.push({ nombre: clave, tipo: String(f[2] || ""),
                           estado: String(f[3] || "activo") });
    }
    else if (seccion === "plan") {
      cfg.plan.push({ cultivo: clave, superficie_m2: Number(f[2]) || 0,
                      cosecha_esperada_kg: Number(f[3]) || 0,
                      rinde_kg_m2: Number(f[4]) || 0, lineas: Number(f[5]) || 0,
                      distancia_cm: Number(f[6]) || 0, plantas: Number(f[7]) || 0 });
    }
  });
  return cfg;
}

// Se reescribe entera: la app siempre manda la configuracion completa. Por eso
// antes se guarda una copia: si algo llega mal —o alguien manda una vacia— la
// anterior queda a un clic, sin depender del historial de Google.
function respaldarConfig(libro) {
  try {
    var hoja = libro.getSheetByName("Config");
    if (!hoja || hoja.getLastRow() < 2) return;

    var vieja = libro.getSheetByName("Config anterior");
    if (vieja) libro.deleteSheet(vieja);
    var copia = hoja.copyTo(libro).setName("Config anterior");
    copia.hideSheet();
  } catch (err) { /* si no se puede respaldar, igual se guarda la nueva */ }
}

function guardarConfig(libro, cfg) {
  respaldarConfig(libro);
  var hoja = hojaConfig(libro);
  var filas = [];
  var vacios = function (fila) {                 // completa hasta CONFIG_COLS
    while (fila.length < CONFIG_COLS) fila.push("");
    return fila;
  };

  filas.push(vacios(["chacra", "nombre", cfg.nombre || ""]));
  ["nombre", "inicio", "fin"].forEach(function (k) {
    filas.push(vacios(["temporada", k, (cfg.temporada || {})[k] || ""]));
  });
  ["largo_m", "ancho_m", "pasillo_m", "n_bancales"].forEach(function (k) {
    filas.push(vacios(["bancal", k, (cfg.bancal || {})[k] || 0]));
  });
  (cfg.sectores || []).forEach(function (s) {
    filas.push(vacios(["sector", s.sector, s.bancales || 0, s.tipo_riego || ""]));
  });
  (cfg.integrantes || []).forEach(function (n) {
    filas.push(vacios(["integrante", n]));
  });
  // Los proyectos: las areas de trabajo de la chacra. Sirven para agrupar las
  // tareas y para saber cuantas horas se lleva cada una.
  (cfg.proyectos || []).forEach(function (p) {
    filas.push(vacios(["proyecto", p.nombre, p.tipo || "", p.estado || "activo"]));
  });
  (cfg.plan || []).forEach(function (p) {
    filas.push(vacios(["plan", p.cultivo, p.superficie_m2 || 0, p.cosecha_esperada_kg || 0,
                       p.rinde_kg_m2 || 0, p.lineas || 0, p.distancia_cm || 0, p.plantas || 0]));
  });

  if (hoja.getLastRow() > 1) {
    hoja.getRange(2, 1, hoja.getLastRow() - 1, CONFIG_COLS).clearContent();
  }
  if (filas.length) hoja.getRange(2, 1, filas.length, CONFIG_COLS).setValues(filas);
}

// ---------- Resumen de la temporada ----------

function calcularResumen(chacra) {
  var cache = CacheService.getScriptCache();
  var clave = "resumen_" + chacra;
  var guardado = cache.get(clave);
  if (guardado) return JSON.parse(guardado);

  var libro = planillaDe(chacra);
  var res = { ok: true, kg_cosechados: 0, kg_por_cultivo: {}, siembras: 0, plantines: 0,
              horas: 0, horas_por_integrante: {}, actualizado: new Date().toISOString() };

  var cosechas = libro.getSheetByName("Cosechas");
  if (cosechas && cosechas.getLastRow() > 1) {
    var c = cosechas.getRange(2, 4, cosechas.getLastRow() - 1, 2).getValues();  // Cultivo, Kg
    c.forEach(function (f) {
      var kg = Number(f[1]) || 0;
      res.kg_cosechados += kg;
      res.kg_por_cultivo[f[0]] = (res.kg_por_cultivo[f[0]] || 0) + kg;
    });
  }

  var siembras = libro.getSheetByName("Siembras");
  if (siembras && siembras.getLastRow() > 1) {
    var s = siembras.getRange(2, 10, siembras.getLastRow() - 1, 1).getValues();  // Plantines
    res.siembras = s.length;
    s.forEach(function (f) { res.plantines += Number(f[0]) || 0; });
  }

  sumarHoras(chacra, libro, res);

  res.kg_cosechados = Math.round(res.kg_cosechados * 100) / 100;
  res.horas = Math.round(res.horas * 100) / 100;
  cache.put(clave, JSON.stringify(res), 300);   // 5 minutos
  return res;
}

// Tica lee la planilla del proyecto; el resto, su propia hoja Horas.
function sumarHoras(chacra, libro, res) {
  try {
    var hoja = null, colNombre = 3, colHoras = 4;
    if (String(chacra).toLowerCase() === CHACRA_CON_HORAS_APARTE) {
      var hojas = SpreadsheetApp.openById(PLANILLA_HORAS_TICA).getSheets();
      for (var i = 0; i < hojas.length; i++) {
        if (hojas[i].getName().indexOf("Respuestas de formulario") === 0) { hoja = hojas[i]; break; }
      }
    } else {
      hoja = libro.getSheetByName("Horas");
      colNombre = 4; colHoras = 5;
    }
    if (!hoja || hoja.getLastRow() < 2) return;

    var filas = hoja.getRange(2, colNombre, hoja.getLastRow() - 1, colHoras - colNombre + 1)
                    .getValues();
    filas.forEach(function (f) {
      var quien = String(f[0]).trim();
      var n = Number(f[f.length - 1]) || 0;
      if (!quien || !n) return;
      res.horas += n;
      res.horas_por_integrante[quien] = (res.horas_por_integrante[quien] || 0) + n;
    });
  } catch (err) {
    res.horas_error = String(err);
  }
}

// ---------- Tareas ----------

function marcarTareaHecha(libro, r) {
  var hoja = libro.getSheetByName(HOJAS.tareas.nombre);
  if (!hoja || hoja.getLastRow() < 2) return;
  var ids = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) !== String(r.datos.tarea_id)) continue;
    var fila = i + 2;
    if (String(hoja.getRange(fila, 8).getValue()) === "Hecha") return;
    hoja.getRange(fila, 8).setValue("Hecha");
    hoja.getRange(fila, 11, 1, 2).setValues([[r.datos.hecha_el || "", r.datos.hecha_por || ""]]);
    return;
  }
}

function listaDeTareas(chacra) {
  var hoja = planillaDe(chacra).getSheetByName(HOJAS.tareas.nombre);
  if (!hoja || hoja.getLastRow() < 2) return [];
  var tz = Session.getScriptTimeZone();
  var texto = function (v) {
    return (v instanceof Date) ? Utilities.formatDate(v, tz, "yyyy-MM-dd") : String(v || "");
  };
  var lista = [];
  // Columnas: 1 Id · 3 Proyecto · 4 Para cuando · 5 Tarea · 6 Importancia
  // 7 Personas · 8 Estado · 9 Quien la toma · 10 Anoto · 11 Hecha el · 12 Hecha por
  hoja.getRange(2, 1, hoja.getLastRow() - 1, 12).getValues().forEach(function (f) {
    if (!f[0]) return;
    var estado = String(f[7] || "Pendiente");
    var hecha = estado === "Hecha";
    if (hecha && texto(f[10]) < corrimientoDias(-10)) return;
    lista.push({
      id: String(f[0]), proyecto: String(f[2] || ""), fecha: texto(f[3]),
      tarea: String(f[4]), importancia: String(f[5] || "Media"),
      personas: Number(f[6]) || 1, estado: estado, hecha: hecha,
      asignada: String(f[8] || ""), creada_por: String(f[9] || ""),
      hecha_el: texto(f[10]), hecha_por: String(f[11] || ""),
    });
  });
  return lista;
}

function corrimientoDias(dias) {
  var d = new Date();
  d.setDate(d.getDate() + dias);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

// ---------- El juego (Pac-Farm) ----------

// ---------- Panel compartido entre chacras ----------
// Se puede llamar a mano (?panel=1) o con un activador diario desde el editor.

// Con ?panel=1 se actualizan todas; con ?panel=1&chacra=tica, solo esa. Cada
// chacra va en su propio try: si una falla, las demas igual se actualizan y el
// motivo vuelve en la respuesta.
function actualizarPanel(soloChacra) {
  var libro = SpreadsheetApp.openById(PLANILLA_PANEL_ID);
  var codigos = soloChacra ? [soloChacra] : chacrasConocidas();
  var hechas = [], sinPlan = [], fallaron = {};

  codigos.forEach(function (codigo) {
    try {
      // La planilla de la chacra se abre UNA vez y se reusa: abrirla de nuevo
      // en cada cuenta hacia que el panel tardara una eternidad.
      var origen = planillaDe(codigo);
      var cfg = leerConfigDe(origen, codigo);
      if (!cfg.plan || !cfg.plan.length) { sinPlan.push(codigo); return; }
      escribirHojaDeChacra(libro, codigo, cfg, origen);
      hechas.push(codigo);
    } catch (err) {
      fallaron[codigo] = String(err);
    }
  });

  var sobrante = libro.getSheetByName("Hoja 1") || libro.getSheetByName("Sheet1");
  if (sobrante && libro.getSheets().length > 1) libro.deleteSheet(sobrante);

  return { ok: true, actualizadas: hechas, sin_plan: sinPlan, fallaron: fallaron };
}

function escribirHojaDeChacra(libro, codigo, cfg, origen) {
  var titulo = cfg.nombre || codigo;
  var hoja = libro.getSheetByName(titulo) || libro.insertSheet(titulo);
  hoja.clear();

  var m2Bancal = (cfg.bancal.largo_m || 0) * (cfg.bancal.ancho_m || 0);
  var kg = kgPorCultivo(origen);
  var siembras = siembrasPorCultivo(origen);

  var filas = cfg.plan.map(function (p) {
    var cosechado = kg[p.cultivo] || 0;
    var s = siembras[p.cultivo] || { veces: 0, plantines: 0 };
    return [
      p.cultivo,
      m2Bancal ? Math.round((p.superficie_m2 / m2Bancal) * 10) / 10 : "",
      p.superficie_m2,
      p.cosecha_esperada_kg,
      Math.round(cosechado * 100) / 100,
      p.cosecha_esperada_kg ? Math.round((cosechado / p.cosecha_esperada_kg) * 1000) / 10 : "",
      p.superficie_m2 ? Math.round((cosechado / p.superficie_m2) * 100) / 100 : "",
      s.veces, s.plantines,
    ];
  });

  var totalEsperado = 0, totalCosechado = 0, totalM2 = 0;
  cfg.plan.forEach(function (p) {
    totalEsperado += p.cosecha_esperada_kg || 0;
    totalM2 += p.superficie_m2 || 0;
    totalCosechado += kg[p.cultivo] || 0;
  });

  // Encabezado de la chacra: el resumen de un vistazo
  hoja.getRange(1, 1, 1, 2).setValues([[titulo, "temporada " + (cfg.temporada.nombre || "")]]);
  hoja.getRange(1, 1).setFontWeight("bold").setFontSize(13);
  hoja.getRange(2, 1, 1, 6).setValues([[
    "Superficie", totalM2 + " m²",
    "Esperado", Math.round(totalEsperado) + " kg",
    "Cosechado", Math.round(totalCosechado) + " kg",
  ]]);
  hoja.getRange(3, 1, 1, 2).setValues([[
    "Horas de trabajo", Math.round(horasTotales(codigo, origen) * 10) / 10]]);
  hoja.getRange(4, 1).setValue("Actualizado: " +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm"));
  hoja.getRange(2, 1, 3, 1).setFontWeight("bold");

  ponerEncabezadosEn(hoja, 6, PANEL_ENCABEZADOS);
  if (filas.length) hoja.getRange(7, 1, filas.length, PANEL_ENCABEZADOS.length).setValues(filas);
  hoja.setFrozenRows(6);
  hoja.autoResizeColumns(1, PANEL_ENCABEZADOS.length);
}

function kgPorCultivo(origen) {
  var hoja = origen.getSheetByName("Cosechas");
  var total = {};
  if (!hoja || hoja.getLastRow() < 2) return total;
  hoja.getRange(2, 4, hoja.getLastRow() - 1, 2).getValues().forEach(function (f) {
    if (f[0]) total[f[0]] = (total[f[0]] || 0) + (Number(f[1]) || 0);
  });
  return total;
}

function siembrasPorCultivo(origen) {
  var hoja = origen.getSheetByName("Siembras");
  var total = {};
  if (!hoja || hoja.getLastRow() < 2) return total;
  // Columnas: 4 Cultivo · 10 Plantines
  hoja.getRange(2, 4, hoja.getLastRow() - 1, 7).getValues().forEach(function (f) {
    var c = f[0];
    if (!c) return;
    if (!total[c]) total[c] = { veces: 0, plantines: 0 };
    total[c].veces++;
    total[c].plantines += Number(f[6]) || 0;
  });
  return total;
}

function horasTotales(chacra, origen) {
  var res = { horas: 0, horas_por_integrante: {} };
  sumarHoras(chacra, origen, res);
  return res.horas;
}

function ponerEncabezadosEn(hoja, fila, encabezados) {
  hoja.getRange(fila, 1, 1, encabezados.length).setValues([encabezados])
      .setFontWeight("bold").setBackground("#DCE9DD");
}

// ---------- Sugerencias ----------

function guardarSugerencia(chacra, r) {
  var hoja = hojaSuelta(PLANILLA_SUGERENCIAS_ID, "Sugerencias", SUGERENCIAS_ENCABEZADOS);
  var d = r.datos;
  hoja.appendRow([r.id, chacra, String(d.quien || ""), d.fecha, String(d.texto || ""),
                  r.dispositivo || "", new Date()]);
}

// ---------- El juego (Pac-Farm) ----------

function hojaDelJuego() {
  return hojaSuelta(PLANILLA_JUEGO_ID, "Puntajes", JUEGO_ENCABEZADOS);
}

// Una hoja en una planilla que no es la de la chacra (el juego, las
// sugerencias): si la planilla esta recien creada se aprovecha su hoja vacia.
function hojaSuelta(planillaId, nombre, encabezados) {
  var libro = SpreadsheetApp.openById(planillaId);
  var hoja = libro.getSheetByName(nombre);
  if (!hoja) {
    var primera = libro.getSheets()[0];
    hoja = (libro.getSheets().length === 1 && primera.getLastRow() === 0)
      ? primera.setName(nombre)
      : libro.insertSheet(nombre);
    ponerEncabezados(hoja, encabezados);
    hoja.autoResizeColumns(1, encabezados.length);
  }
  return hoja;
}

function guardarPuntaje(chacra, r) {
  var hoja = hojaDelJuego();
  var d = r.datos;
  hoja.appendRow([r.id, chacra, String(d.jugador), Number(d.puntos) || 0,
                  Number(d.nivel) || 1, d.fecha, r.dispositivo || "", new Date()]);
}

// El mejor puntaje de cada jugador de esa chacra, de mayor a menor. Se guardan
// todas las partidas, pero en el ranking cada uno figura una sola vez.
function rankingDelJuego(chacra) {
  var hoja = SpreadsheetApp.openById(PLANILLA_JUEGO_ID).getSheetByName("Puntajes");
  if (!hoja || hoja.getLastRow() < 2) return [];
  var tz = Session.getScriptTimeZone();
  var mejores = {};

  // Columnas: 2 Chacra · 3 Jugador · 4 Puntos · 5 Nivel · 6 Fecha
  hoja.getRange(2, 2, hoja.getLastRow() - 1, 5).getValues().forEach(function (f) {
    if (String(f[0]).toLowerCase() !== String(chacra).toLowerCase()) return;
    var jugador = String(f[1]).trim();
    var puntos = Number(f[2]) || 0;
    if (!jugador) return;
    var fecha = (f[4] instanceof Date) ? Utilities.formatDate(f[4], tz, "yyyy-MM-dd")
                                       : String(f[4] || "");
    if (!mejores[jugador]) mejores[jugador] = { jugador: jugador, puntos: 0, nivel: 1,
                                                fecha: "", partidas: 0 };
    mejores[jugador].partidas++;
    if (puntos > mejores[jugador].puntos) {
      mejores[jugador].puntos = puntos;
      mejores[jugador].nivel = Number(f[3]) || 1;
      mejores[jugador].fecha = fecha;
    }
  });

  return Object.keys(mejores).map(function (k) { return mejores[k]; })
    .sort(function (a, b) { return b.puntos - a.puntos; });
}

// ---------- Los últimos movimientos de cada sección ----------
// Para que en el celular se vea lo que viene cargando todo el equipo, no solo
// lo de ese teléfono. Se leen nada más las últimas filas: no importa cuánto
// crezca la planilla, siempre pesa lo mismo.
function ultimosDeHoja(chacra, cual, cuantos) {
  var def = HOJAS[String(cual).toLowerCase()];
  if (!def) return [];
  var hoja = planillaDe(chacra).getSheetByName(def.nombre);
  if (!hoja || hoja.getLastRow() < 2) return [];

  var disponibles = hoja.getLastRow() - 1;
  var n = Math.min(Math.max(cuantos, 1), Math.min(disponibles, 30));
  var desde = hoja.getLastRow() - n + 1;
  var tz = Session.getScriptTimeZone();

  return hoja.getRange(desde, 1, n, def.encabezados.length).getValues().map(function (f) {
    var obj = {};
    def.encabezados.forEach(function (c, i) {
      var v = f[i];
      obj[c] = (v instanceof Date) ? Utilities.formatDate(v, tz, "yyyy-MM-dd") : v;
    });
    return obj;
  }).reverse();          // el más nuevo primero
}

// ---------- Exportar a la app de escritorio ----------

function exportarHoja(chacra, cual) {
  var def = HOJAS[String(cual).toLowerCase()];
  if (!def) return [];
  var hoja = planillaDe(chacra).getSheetByName(def.nombre);
  if (!hoja || hoja.getLastRow() < 2) return [];
  var tz = Session.getScriptTimeZone();
  var datos = hoja.getRange(1, 1, hoja.getLastRow(), def.encabezados.length).getValues();
  var cabeceras = datos.shift();
  return datos.map(function (f) {
    var obj = {};
    cabeceras.forEach(function (c, i) {
      var v = f[i];
      obj[c] = (v instanceof Date) ? Utilities.formatDate(v, tz, "yyyy-MM-dd") : v;
    });
    return obj;
  });
}

// ---------- Auxiliares ----------

function obtenerHoja(libro, def) {
  var hoja = libro.getSheetByName(def.nombre);
  if (!hoja) {
    hoja = libro.insertSheet(def.nombre);
    ponerEncabezados(hoja, def.encabezados);
    hoja.autoResizeColumns(1, def.encabezados.length);
    return hoja;
  }
  // Si las columnas cambiaron y la hoja todavia no tiene datos, se rehace el
  // encabezado: si no, las filas nuevas entrarian corridas de lugar.
  if (hoja.getLastRow() <= 1) {
    var actuales = hoja.getLastColumn()
      ? hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].join("|") : "";
    if (actuales !== def.encabezados.join("|")) {
      hoja.clear();
      ponerEncabezados(hoja, def.encabezados);
    }
  }
  return hoja;
}

function ponerEncabezados(hoja, encabezados) {
  hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados])
      .setFontWeight("bold").setBackground("#DCE9DD");
  hoja.setFrozenRows(1);
}

function idsExistentes(hoja) {
  var mapa = {};
  var ultima = hoja.getLastRow();
  if (ultima < 2) return mapa;
  var desde = Math.max(2, ultima - 1000);
  hoja.getRange(desde, 1, ultima - desde + 1, 1).getValues().forEach(function (f) {
    if (f[0]) mapa[f[0]] = true;
  });
  return mapa;
}

function respuesta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
