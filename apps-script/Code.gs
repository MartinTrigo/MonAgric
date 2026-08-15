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
    encabezados: ["Id", "Temporada", "Para cuándo", "Tarea", "Importancia", "Personas",
                  "Estado", "Anotó", "Hecha el", "Hecha por", "Cargado por", "Recibido"],
    fila: function (r) {
      var d = r.datos;
      return [r.id, r.temporada || "", d.fecha, d.tarea, d.importancia || "Media",
              d.personas || 1, "Pendiente", d.creada_por || "", "", "",
              r.dispositivo || "", new Date()];
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
                  "Observaciones", "Cargado por", "Recibido"],
    fila: function (r) {
      var d = r.datos;
      return [r.id, r.temporada || "", d.fecha, d.integrante, d.horas, d.actividad || "",
              d.observaciones || "", r.dispositivo || "", new Date()];
    },
  },
};

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

function doGet(e) {
  var p = (e && e.parameter) || {};
  var chacra = p.chacra || "";
  if (p.config) return respuesta({ ok: true, config: leerConfig(chacra) });
  if (p.resumen) return respuesta(calcularResumen(chacra));
  if (p.tareas) return respuesta({ ok: true, tareas: listaDeTareas(chacra) });
  if (p.ranking) return respuesta({ ok: true, ranking: rankingDelJuego(chacra) });
  if (p.panel) return respuesta({ ok: true, chacras: actualizarPanel() });
  if (p.ultimos) return respuesta({ ok: true, hoja: p.ultimos,
                                    filas: ultimosDeHoja(chacra, p.ultimos, Number(p.n) || 15) });
  if (p.exportar) return respuesta({ ok: true, hoja: p.exportar,
                                     filas: exportarHoja(chacra, p.exportar) });
  return respuesta({ ok: true, servicio: "MonAgric", chacras: chacrasConocidas(),
                     hora: new Date().toISOString() });
}

function doPost(e) {
  try {
    var cuerpo = JSON.parse(e.postData.contents);
    var chacra = cuerpo.chacra || "";
    var registros = cuerpo.registros || [];
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
  var libro = planillaDe(chacra);
  var hoja = libro.getSheetByName("Config");
  // La direccion de la planilla viaja con la configuracion: la app la usa para
  // el enlace "ver todo en la planilla".
  var cfg = { chacra: chacra, planilla: libro.getUrl(), temporada: {}, bancal: {},
              sectores: [], integrantes: [], plan: [] };
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
    else if (seccion === "plan") {
      cfg.plan.push({ cultivo: clave, superficie_m2: Number(f[2]) || 0,
                      cosecha_esperada_kg: Number(f[3]) || 0,
                      rinde_kg_m2: Number(f[4]) || 0, lineas: Number(f[5]) || 0,
                      distancia_cm: Number(f[6]) || 0, plantas: Number(f[7]) || 0 });
    }
  });
  return cfg;
}

// Se reescribe entera: la app siempre manda la configuracion completa.
function guardarConfig(libro, cfg) {
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
    if (String(hoja.getRange(fila, 7).getValue()) === "Hecha") return;
    hoja.getRange(fila, 7).setValue("Hecha");
    hoja.getRange(fila, 9, 1, 2).setValues([[r.datos.hecha_el || "", r.datos.hecha_por || ""]]);
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
  hoja.getRange(2, 1, hoja.getLastRow() - 1, 10).getValues().forEach(function (f) {
    if (!f[0]) return;
    var hecha = String(f[6]) === "Hecha";
    if (hecha && texto(f[8]) < corrimientoDias(-10)) return;
    lista.push({
      id: String(f[0]), fecha: texto(f[2]), tarea: String(f[3]),
      importancia: String(f[4] || "Media"), personas: Number(f[5]) || 1,
      hecha: hecha, creada_por: String(f[7] || ""),
      hecha_el: texto(f[8]), hecha_por: String(f[9] || ""),
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

function actualizarPanel() {
  var libro = SpreadsheetApp.openById(PLANILLA_PANEL_ID);
  var chacras = chacrasConocidas();
  var hechas = [];

  chacras.forEach(function (codigo) {
    var cfg = leerConfig(codigo);
    if (!cfg.plan || !cfg.plan.length) return;      // sin plan no hay nada que comparar
    escribirHojaDeChacra(libro, codigo, cfg);
    hechas.push(codigo);
  });

  // La hoja vacía que trae toda planilla nueva, si quedó, estorba.
  var sobrante = libro.getSheetByName("Hoja 1") || libro.getSheetByName("Sheet1");
  if (sobrante && libro.getSheets().length > 1) libro.deleteSheet(sobrante);

  return hechas;
}

function escribirHojaDeChacra(libro, codigo, cfg) {
  var titulo = cfg.nombre || codigo;
  var hoja = libro.getSheetByName(titulo) || libro.insertSheet(titulo);
  hoja.clear();

  var m2Bancal = (cfg.bancal.largo_m || 0) * (cfg.bancal.ancho_m || 0);
  var kg = kgPorCultivo(codigo);
  var siembras = siembrasPorCultivo(codigo);

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
    "Horas de trabajo", Math.round(horasTotales(codigo) * 10) / 10]]);
  hoja.getRange(4, 1).setValue("Actualizado: " +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm"));
  hoja.getRange(2, 1, 3, 1).setFontWeight("bold");

  ponerEncabezadosEn(hoja, 6, PANEL_ENCABEZADOS);
  if (filas.length) hoja.getRange(7, 1, filas.length, PANEL_ENCABEZADOS.length).setValues(filas);
  hoja.setFrozenRows(6);
  hoja.autoResizeColumns(1, PANEL_ENCABEZADOS.length);
}

function kgPorCultivo(chacra) {
  var hoja = planillaDe(chacra).getSheetByName("Cosechas");
  var total = {};
  if (!hoja || hoja.getLastRow() < 2) return total;
  hoja.getRange(2, 4, hoja.getLastRow() - 1, 2).getValues().forEach(function (f) {
    if (f[0]) total[f[0]] = (total[f[0]] || 0) + (Number(f[1]) || 0);
  });
  return total;
}

function siembrasPorCultivo(chacra) {
  var hoja = planillaDe(chacra).getSheetByName("Siembras");
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

function horasTotales(chacra) {
  var res = { horas: 0, horas_por_integrante: {} };
  sumarHoras(chacra, planillaDe(chacra), res);
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
