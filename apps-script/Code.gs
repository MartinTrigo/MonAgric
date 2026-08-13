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
  cosechas: {
    nombre: "Cosechas",
    encabezados: ["Id", "Temporada", "Fecha", "Cultivo", "Kg", "Sector", "Bancal", "Cosechó",
                  "Cargado por", "Recibido"],
    fila: function (r) {
      var d = r.datos;
      return [r.id, r.temporada || "", d.fecha, d.cultivo, d.kg, d.sector || "", d.bancal || "",
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

var CONFIG_ENCABEZADOS = ["Sección", "Clave", "Valor 1", "Valor 2", "Valor 3"];

function hojaConfig(libro) {
  var hoja = libro.getSheetByName("Config");
  if (!hoja) {
    hoja = libro.insertSheet("Config");
    hoja.appendRow(CONFIG_ENCABEZADOS);
    hoja.getRange(1, 1, 1, CONFIG_ENCABEZADOS.length)
        .setFontWeight("bold").setBackground("#DCE9DD");
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function leerConfig(chacra) {
  var hoja = planillaDe(chacra).getSheetByName("Config");
  var cfg = { chacra: chacra, temporada: {}, bancal: {}, sectores: [], integrantes: [], plan: [] };
  if (!hoja || hoja.getLastRow() < 2) return cfg;

  hoja.getRange(2, 1, hoja.getLastRow() - 1, 5).getValues().forEach(function (f) {
    var seccion = String(f[0]), clave = String(f[1]);
    if (!seccion) return;
    if (seccion === "chacra") cfg[clave] = f[2];
    else if (seccion === "temporada") cfg.temporada[clave] = String(f[2] || "");
    else if (seccion === "bancal") cfg.bancal[clave] = Number(f[2]) || 0;
    else if (seccion === "sector") {
      cfg.sectores.push({ sector: clave, bancales: Number(f[2]) || 0, tipo_riego: String(f[3] || "") });
    } else if (seccion === "integrante") cfg.integrantes.push(clave);
    else if (seccion === "plan") {
      cfg.plan.push({ cultivo: clave, superficie_m2: Number(f[2]) || 0,
                      cosecha_esperada_kg: Number(f[3]) || 0 });
    }
  });
  return cfg;
}

// Se reescribe entera: la app siempre manda la configuracion completa.
function guardarConfig(libro, cfg) {
  var hoja = hojaConfig(libro);
  var filas = [];
  filas.push(["chacra", "nombre", cfg.nombre || "", "", ""]);
  ["nombre", "inicio", "fin"].forEach(function (k) {
    filas.push(["temporada", k, (cfg.temporada || {})[k] || "", "", ""]);
  });
  ["largo_m", "ancho_m", "pasillo_m", "n_bancales"].forEach(function (k) {
    filas.push(["bancal", k, (cfg.bancal || {})[k] || 0, "", ""]);
  });
  (cfg.sectores || []).forEach(function (s) {
    filas.push(["sector", s.sector, s.bancales || 0, s.tipo_riego || "", ""]);
  });
  (cfg.integrantes || []).forEach(function (n) {
    filas.push(["integrante", n, "", "", ""]);
  });
  (cfg.plan || []).forEach(function (p) {
    filas.push(["plan", p.cultivo, p.superficie_m2 || 0, p.cosecha_esperada_kg || 0, ""]);
  });

  if (hoja.getLastRow() > 1) {
    hoja.getRange(2, 1, hoja.getLastRow() - 1, 5).clearContent();
  }
  if (filas.length) hoja.getRange(2, 1, filas.length, 5).setValues(filas);
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
    hoja.appendRow(def.encabezados);
    hoja.getRange(1, 1, 1, def.encabezados.length).setFontWeight("bold").setBackground("#DCE9DD");
    hoja.setFrozenRows(1);
    hoja.autoResizeColumns(1, def.encabezados.length);
  }
  return hoja;
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
