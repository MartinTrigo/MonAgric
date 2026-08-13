// ==========================================================
// MonAgric — servicio Apps Script
//
// Recibe las siembras y cosechas de la app web y las escribe en esta planilla
// (una pestaña por tipo). Ademas devuelve el resumen de la temporada —lo
// logrado por toda la chacra— para que la app compare el plan con lo cosechado.
//
// Las horas NO pasan por aca: siguen yendo a la planilla del proyecto, la misma
// desde julio. Este servicio solo la lee para sumar las horas al resumen.
//
// Cómo publicarlo: ver web/README.md (paso 2).
// ==========================================================

// Las horas del proyecto se cargan en su propia planilla desde julio (la que
// usaba la app bioma-horas) y ahi siguen. Este servicio solo la lee para el
// resumen; si se deja vacio, el resumen no informa horas.
var PLANILLA_HORAS_ID = "1tx8V0VLciiTLFvAmSViAR6KV9LL9hXzvX6-qy30Ubpg";

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
};

// ---------- Entradas del servicio ----------

function doGet(e) {
  if (e && e.parameter && e.parameter.resumen) return respuesta(calcularResumen());
  return respuesta({ ok: true, servicio: "MonAgric", hora: new Date().toISOString() });
}

function doPost(e) {
  try {
    var registros = JSON.parse(e.postData.contents).registros || [];
    var guardados = 0;

    // Un solo lock: evita filas duplicadas si dos teléfonos envían a la vez.
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      // Se agrupan por tipo para escribir cada hoja de una sola vez.
      var porTipo = {};
      registros.forEach(function (r) {
        if (!HOJAS[r.tipo]) return;
        (porTipo[r.tipo] = porTipo[r.tipo] || []).push(r);
      });

      Object.keys(porTipo).forEach(function (tipo) {
        var def = HOJAS[tipo];
        var hoja = obtenerHoja(def);
        var existentes = idsExistentes(hoja);
        var filas = [];
        porTipo[tipo].forEach(function (r) {
          if (existentes[r.id]) return;      // reintento de algo que ya llegó
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
    CacheService.getScriptCache().remove("resumen");
    return respuesta({ ok: true, recibidos: registros.length, guardados: guardados });
  } catch (err) {
    return respuesta({ ok: false, error: String(err) });
  }
}

// ---------- Resumen de la temporada ----------

function calcularResumen() {
  var cache = CacheService.getScriptCache();
  var guardado = cache.get("resumen");
  if (guardado) return JSON.parse(guardado);

  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var res = { ok: true, kg_cosechados: 0, kg_por_cultivo: {}, siembras: 0, plantines: 0,
              horas: 0, horas_por_integrante: {}, actualizado: new Date().toISOString() };

  var cosechas = libro.getSheetByName("Cosechas");
  if (cosechas && cosechas.getLastRow() > 1) {
    // Columnas: 4 = Cultivo, 5 = Kg
    var c = cosechas.getRange(2, 4, cosechas.getLastRow() - 1, 2).getValues();
    c.forEach(function (f) {
      var kg = Number(f[1]) || 0;
      res.kg_cosechados += kg;
      res.kg_por_cultivo[f[0]] = (res.kg_por_cultivo[f[0]] || 0) + kg;
    });
  }

  var siembras = libro.getSheetByName("Siembras");
  if (siembras && siembras.getLastRow() > 1) {
    // Columna 10 = Plantines
    var s = siembras.getRange(2, 10, siembras.getLastRow() - 1, 1).getValues();
    res.siembras = s.length;
    s.forEach(function (f) { res.plantines += Number(f[0]) || 0; });
  }

  sumarHorasDelProyecto(res);

  res.kg_cosechados = Math.round(res.kg_cosechados * 100) / 100;
  res.horas = Math.round(res.horas * 100) / 100;
  cache.put("resumen", JSON.stringify(res), 300);   // 5 minutos
  return res;
}

// Lee la planilla de horas del proyecto (columnas: Marca temporal, Fecha,
// Trabajador, Horas, Actividad, Observaciones) y suma los totales.
function sumarHorasDelProyecto(res) {
  if (!PLANILLA_HORAS_ID) return;
  try {
    var hojas = SpreadsheetApp.openById(PLANILLA_HORAS_ID).getSheets();
    var hoja = null;
    for (var i = 0; i < hojas.length; i++) {
      if (hojas[i].getName().indexOf("Respuestas de formulario") === 0) { hoja = hojas[i]; break; }
    }
    if (!hoja || hoja.getLastRow() < 2) return;

    var filas = hoja.getRange(2, 3, hoja.getLastRow() - 1, 2).getValues();  // Trabajador, Horas
    filas.forEach(function (f) {
      var quien = String(f[0]).trim();
      var n = Number(f[1]) || 0;
      if (!quien || !n) return;
      res.horas += n;
      res.horas_por_integrante[quien] = (res.horas_por_integrante[quien] || 0) + n;
    });
  } catch (err) {
    res.horas_error = String(err);   // la planilla no se pudo abrir: el resto sigue
  }
}

// ---------- Auxiliares ----------

function obtenerHoja(def) {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
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

// Ids ya guardados (últimas 1000 filas): evita duplicar un envío reintentado.
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
