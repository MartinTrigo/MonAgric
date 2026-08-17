// ============================================================
// BIOMA · Chacra Tica — Receptor de registros de horas
//
// Este codigo va en la planilla de horas del proyecto (la que usaba la app
// bioma-horas), en Extensiones > Apps Script. NO es el mismo script que el de
// MonAgric: son dos, cada uno en su planilla.
//
// Chacra Tica sigue cargando sus horas aca para no partir el historial de
// julio en adelante. La novedad es la columna Proyecto: MonAgric ahora pide en
// que area de trabajo se aplicaron las horas, y sin esta columna ese dato se
// perdia solo para Tica, mientras las demas chacras si lo guardaban.
// ============================================================

// Nombre de la pestaña donde caen los registros (la misma del formulario)
var HOJA_RESPUESTAS = "Respuestas de formulario 1";
// Nombre de la pestaña con la lista de trabajadores
var HOJA_CONFIG = "Config";
// Columna donde se escribe el proyecto. Va despues de Observaciones, al final
// de lo que ya existia, asi no se corre ninguna columna anterior.
var COL_PROYECTO = 7;

// --- La app pide la lista de trabajadores y los últimos registros ---
function doGet(e) {
  var respuesta = {
    nombres: listaDeNombres(),
    ultimas: ultimosRegistros(10)
  };
  return ContentService
    .createTextOutput(JSON.stringify(respuesta))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- La app manda un registro nuevo ---
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000); // espera si hay otro envío al mismo tiempo
  try {
    var datos = JSON.parse(e.postData.contents);

    var hoja = buscarHojaRespuestas();
    var marca = datos.marca ? new Date(datos.marca) : new Date();

    // La fecha llega como "2026-08-02"; la convertimos a fecha real.
    // Se usa mediodía (12:00) para que una diferencia de zona horaria
    // entre el script y la planilla nunca cambie el día.
    var partes = String(datos.fecha).split("-");
    var fecha = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]), 12, 0, 0);

    hoja.appendRow([
      marca,                       // Marca temporal
      fecha,                       // Fecha
      String(datos.nombre),        // Trabajador
      Number(datos.horas),         // Horas
      String(datos.actividad || ""), // Actividad (se dejo de usar, queda vacia)
      String(datos.obs || ""),     // Observaciones: que hizo
      String(datos.proyecto || "") // Proyecto: en que area se aplicaron
    ]);

    return responderJSON({ ok: true });
  } catch (err) {
    return responderJSON({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// --- Ayudantes ---
function buscarHojaRespuestas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_RESPUESTAS);
  if (!hoja) {
    // Si el nombre exacto no está, buscamos una que empiece parecido
    var hojas = ss.getSheets();
    for (var i = 0; i < hojas.length; i++) {
      if (hojas[i].getName().indexOf("Respuestas de formulario") === 0) { hoja = hojas[i]; break; }
    }
  }
  if (!hoja) {
    throw new Error("No encuentro la pestaña de respuestas. Revisá el nombre arriba del código.");
  }
  // El encabezado de la columna nueva, la primera vez
  if (!hoja.getRange(1, COL_PROYECTO).getValue()) {
    hoja.getRange(1, COL_PROYECTO).setValue("Proyecto").setFontWeight("bold");
  }
  return hoja;
}

function listaDeNombres() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_CONFIG);
  var nombres = [];
  if (!hoja) return nombres;
  var valores = hoja.getRange(1, 1, hoja.getLastRow(), 1).getValues();
  for (var i = 0; i < valores.length; i++) {
    var v = String(valores[i][0]).trim();
    if (!v) continue;
    if (v === "Trabajador") continue;                          // encabezado
    if (v.indexOf("Configuración") === 0) continue;            // título
    if (v.indexOf("Editá") === 0 || v.indexOf("Editár") === 0) continue; // nota al pie
    if (/^Trabajador \d+$/.test(v)) continue;                  // genéricos sin renombrar
    nombres.push(v);
  }
  return nombres;
}

function ultimosRegistros(cuantos) {
  var hoja = buscarHojaRespuestas();
  var total = hoja.getLastRow();
  if (total < 2) return []; // solo encabezado
  var n = Math.min(cuantos, total - 1);
  var valores = hoja.getRange(total - n + 1, 1, n, COL_PROYECTO).getValues();
  var tz = Session.getScriptTimeZone();
  var lista = [];
  // Recorremos de abajo hacia arriba: el más reciente primero
  for (var i = valores.length - 1; i >= 0; i--) {
    var f = valores[i][1]; // columna Fecha
    var fechaTxt = (f instanceof Date) ? Utilities.formatDate(f, tz, "dd/MM") : String(f);
    var h = valores[i][3]; // columna Horas
    lista.push({
      fecha: fechaTxt,
      nombre: String(valores[i][2]),
      horas: (typeof h === "number") ? h : String(h),
      // Se muestra el proyecto; si el registro es viejo y no lo tiene, la
      // actividad, que es lo que se usaba antes.
      actividad: String(valores[i][6] || valores[i][4] || "")
    });
  }
  return lista;
}

function responderJSON(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
