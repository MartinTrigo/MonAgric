// ==========================================================
// AMA Producción — servicio Apps Script (varias chacras)
// AMA = Aplicaciones para el Manejo Agroecológico. El repositorio y la
// dirección de la app siguen llamándose MonAgric a propósito: cambiarlos le
// borraría a cada teléfono su credencial. Lo que se ve dice AMA.
//
// Un solo servicio atiende a todas las chacras: cada registro dice de que
// chacra viene y se escribe en la planilla de esa chacra. Asi cada colectivo
// tiene sus datos en su propio archivo, pero todos usan el mismo enlace y no
// hay que publicar un servicio por chacra.
//
// PARA SUMAR UNA CHACRA (no hace falta tocar este codigo):
//   1. Crear una planilla nueva en Drive, por ejemplo "AMA Producción · Chacra X".
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
    encabezados: ["Id", "Temporada", "Área", "Para cuándo", "Tarea", "Importancia",
                  "Personas", "Estado", "Quién la toma", "Anotó", "Hecha el", "Hecha por",
                  "Cargado por", "Recibido"],
    fila: function (r) {
      var d = r.datos;
      return [r.id, r.temporada || "", d.area || d.proyecto || "", d.fecha, d.tarea,
              d.importancia || "Media", d.personas || 1, "Pendiente", d.asignada || "",
              d.creada_por || "", "", "", r.dispositivo || "", new Date()];
    },
  },
  // El trasplante es el momento en que una siembra deja la bandeja y ocupa un
  // lugar en el campo. Guarda el id de la siembra de origen: es lo que permite
  // seguir un cultivo desde el almacigo hasta la cosecha, y saber el rinde real
  // de cada bancal. Sin esta hoja, las siembras de almacigo no tienen lugar.
  //
  // Va UNA FILA POR BANCAL. Un mismo dia se puede plantar la misma variedad en
  // cuatro bancales distintos, y cada uno rinde distinto: si fueran una sola
  // fila con un contador, el rinde por bancal no se podria calcular nunca. Las
  // filas de una misma tanda comparten siembra de origen y fecha.
  /* Las generaciones planificadas de la temporada: cuando se decide sembrar
     cada una. Es lo unico que se guarda de la planificacion; el trasplante
     estimado, el inicio y el fin de cosecha NO se guardan, se calculan con el
     catalogo cada vez que se dibuja. Asi, cuando los dias del catalogo se
     corrigen con lo que pasa en la chacra, el plan entero se corrige solo.

     "Planificado" es lo que todavia no se sembro; cuando se carga la siembra
     de verdad, esa generacion pasa a tener su registro en Siembras y el plan
     queda como lo que era: una intencion contra la cual comparar. */
  generaciones: {
    nombre: "Plan generaciones",
    // "Variedad" va al final (29/09): agregarla en el medio habria corrido
    // las columnas de las filas que ya estaban escritas.
    encabezados: ["Id", "Temporada", "Cultivo", "Generación", "Método",
                  "Fecha almácigo", "Fecha a campo", "Camas", "Sector",
                  "Bancales", "Estado", "Origen", "Recibido", "Variedad"],
    fila: function (r) {
      var d = r.datos;
      // El id es estable y lo arma quien planifica: "gen-brocoli-4". Volver a
      // guardar esa generacion la pisa en vez de dejar dos versiones.
      return [d.generacion_id || r.id, r.temporada || "", d.cultivo, d.generacion || 1,
              d.metodo || "", d.fecha_almacigo || "", d.fecha_campo || "",
              d.camas || "", d.sector || "", d.bancales || "",
              d.estado || "Planificado", d.origen || "", new Date(), d.variedad || ""];
    },
  },
  trasplantes: {
    nombre: "Trasplantes",
    encabezados: ["Id", "Temporada", "Fecha", "Siembra origen", "Fecha siembra",
                  "Días en almácigo", "Días teóricos", "Diferencia días",
                  "Cultivo", "Variedad", "Generación", "Sector", "Bancal",
                  "Líneas", "Distancia cm", "Disposición", "Marco", "Plantines",
                  "Operador", "Observaciones", "Cargado por", "Recibido"],
    fila: function (r) {
      var d = r.datos;
      return [r.id, r.temporada || "", d.fecha, d.siembra_id || "",
              d.fecha_siembra || "", d.dias_almacigo_real || "",
              d.dias_almacigo_teorico || "", d.diferencia_dias === 0 ? 0 : (d.diferencia_dias || ""),
              d.cultivo, d.variedad || "", d.generacion || 1, d.sector || "", d.bancal || "",
              d.lineas || "", d.distancia_cm || "", d.disposicion || "",
              d.marco || "", d.plantines || "",
              d.operador || "", d.observaciones || "", r.dispositivo || "", new Date()];
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
                  "Área", "Observaciones", "Cargado por", "Recibido"],
    fila: function (r) {
      var d = r.datos;
      return [r.id, r.temporada || "", d.fecha, d.integrante, d.horas, d.actividad || "",
              d.area || d.proyecto || "", d.observaciones || "", r.dispositivo || "", new Date()];
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
//
// Se recuerda dos minutos: antes cada pedido abria la planilla de accesos y
// leia todos los dispositivos, y al abrir la app son ocho o diez pedidos. Solo
// se recuerdan los SI: un telefono recien activado entra en el acto. El costo:
// dar de baja un telefono tarda hasta dos minutos en aplicarse.
function permitido(chacra, credencial, dispositivo) {
  if (!credencial) return rechazo("Este teléfono todavía no tiene acceso.");
  var cache = CacheService.getScriptCache();
  var llave = "acceso_" + huella(credencial).slice(0, 40) + "_" + String(chacra).toLowerCase();
  var guardado = cache.get(llave);
  if (guardado) { try { return JSON.parse(guardado); } catch (e) { /* se vuelve a mirar */ } }
  var r = permitidoEnLaPlanilla_(chacra, credencial, dispositivo);
  if (r.ok) cache.put(llave, JSON.stringify(r), 120);
  return r;
}

function permitidoEnLaPlanilla_(chacra, credencial, dispositivo) {
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
    return { ok: true, fila: i + 2, persona: String(filas[i][2] || ""), huella: buscada };
  }
  return rechazo("Credencial desconocida. Pedí un código nuevo.");
}

// Deja constancia de que ese telefono estuvo activo y cuanto cargo. Con el
// acceso recordado, la fila puede haberse corrido si alguien borro una de
// arriba: se confirma que sea la de ese telefono antes de escribir.
function marcarActividad(fila, cuantos, laHuella) {
  try {
    var hoja = SpreadsheetApp.openById(PLANILLA_ACCESOS_ID).getSheetByName("Dispositivos");
    if (laHuella && String(hoja.getRange(fila, 8).getValue()) !== laHuella) return;
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
  if (p.panel || p.exportar || p.diagfechas) {
    if (!esAdmin(p.clave)) return respuesta(rechazo("Esto es solo para la administración."));
    if (p.diagfechas) return respuesta(diagnosticoFechas());
    if (p.panel) return respuesta(actualizarPanel(chacra));
    return respuesta({ ok: true, hoja: p.exportar, filas: exportarHoja(chacra, p.exportar) });
  }

  // La proyeccion la pide el servidor de AMA Economia, no un telefono: no tiene
  // credencial de dispositivo sino una clave propia que solo abre esto.
  if (p.proyeccion) {
    if (!esAdmin(p.clave) && !tokenDeProyeccionValido(chacra, p.token)) {
      return respuesta(rechazo("Esta clave no abre la proyección de esta chacra."));
    }
    return respuesta(proyeccionDe(chacra));
  }

  // Todo lo que entregue datos de una chacra exige credencial de esa chacra.
  // La clave de administracion tambien sirve: es la que usan las herramientas
  // de escritorio, que no tienen un telefono asociado.
  if (p.config || p.resumen || p.tareas || p.ranking || p.ultimos || p.micuenta
      || p.catalogo || p.almacigos || p.ficha || p.generaciones || p.columnas) {
    var permiso = esAdmin(p.clave) ? { ok: true }
                                   : permitido(chacra, p.credencial, p.dispositivo);
    if (!permiso.ok) return respuesta(permiso);

    // Las cuentas de sueldos van con la persona del telefono, que sale de la
    // credencial: nadie puede pedir la cuenta de otro escribiendo otro nombre.
    // Con clave de admin no hay persona asociada, asi que se pide el nombre.
    if (p.micuenta) {
      var quien = permiso.persona || p.persona || "";
      if (!quien) return respuesta(rechazo("No se pudo saber de quién es este teléfono."));
      try {
        return respuesta(cuentasParaElTelefono(chacra, quien,
                                               p.refrescar && esAdmin(p.clave)));
      } catch (err) {
        return respuesta({ ok: false, error: "No se pudieron leer las cuentas: " + err });
      }
    }

    if (p.catalogo) {
      return respuesta(Object.assign({ ok: true },
        cultivosAgregados(p.refrescar && esAdmin(p.clave))));
    }

    if (p.almacigos) {
      return respuesta({ ok: true, almacigos: recordado_("almacigos", chacra, almacigosEsperando) });
    }

    if (p.ficha) {
      return respuesta(fichaDeCultivo(chacra, p.ficha));
    }

    if (p.generaciones) {
      return respuesta({ ok: true, generaciones: recordado_("plan", chacra, generacionesDelPlan) });
    }

    // Diagnostico para las herramientas: las hojas cuyas columnas no estan
    // donde el codigo las espera (ver revisarColumnas).
    if (p.columnas) {
      if (!esAdmin(p.clave)) return respuesta(rechazo("Solo con clave de administración."));
      return respuesta({ ok: true, chacra: chacra, hojas: revisarColumnas(chacra) });
    }

    if (p.config) {
      var cfg = leerConfig(chacra);
      // Le avisa a la app si esta chacra tiene cuentas de sueldos. Las que no,
      // ni siquiera ven la seccion.
      cfg.cuentas = !!urlCuentasDe(chacra);
      // Este servicio sabe corregir y borrar registros. La app muestra los
      // botones solo si lo dice: contra una version anterior quedarian en la
      // cola, fallando para siempre.
      cfg.corregir = true;
      // Sabe guardar la configuracion de a una parte (config_plan,
      // config_sector). Contra una version anterior la app guarda entera.
      cfg.parcial = true;
      // Los encabezados de cada hoja, como los escribe este codigo. La app
      // lee los datos por esos nombres: si alguno que usa no esta, avisa en
      // vez de mostrar huecos en silencio.
      cfg.esquema = {};
      Object.keys(HOJAS).forEach(function (k) { cfg.esquema[k] = HOJAS[k].encabezados; });
      // Tica: sus horas entran por este servicio, y los nombres del equipo
      // salen de la planilla de horas, como antes los daba el script aparte.
      if (String(chacra).toLowerCase() === CHACRA_CON_HORAS_APARTE) {
        cfg.horas_por_servicio = true;
        try { cfg.nombres_horas = nombresDeHorasTica(); } catch (e) { cfg.nombres_horas = []; }
      }
      return respuesta({ ok: true, config: cfg });
    }
    if (p.resumen) return respuesta(calcularResumen(chacra));
    if (p.tareas) return respuesta({ ok: true, tareas: listaDeTareas(chacra) });
    if (p.ranking) return respuesta({ ok: true, ranking: rankingDelJuego(chacra) });
    return respuesta({ ok: true, hoja: p.ultimos,
                       filas: ultimosDeHoja(chacra, p.ultimos, Number(p.n) || 15) });
  }

  // Sin credencial solo se sabe que el servicio existe.
  return respuesta({ ok: true, servicio: "AMA Producción", chacras: chacrasConocidas(),
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
      // Cada uno en su propio try: si uno falla, los demas se guardan igual.
      // Antes un solo registro problematico tumbaba el lote entero, y como la
      // app no borra nada de la cola cuando la respuesta no es ok, ese telefono
      // dejaba de poder subir siembras, cosechas y tareas hasta que alguien
      // arreglara la causa. Los que fallan viajan de vuelta por id para que la
      // app los conserve y reintente, en lugar de perderlos en silencio.
      var noGuardados = [];
      registros.forEach(function (r) {
        try {
          if (r.tipo === "tareas_hecha") { marcarTareaHecha(libro, r); guardados++; }
          else if (r.tipo === "tareas_reabrir") { reabrirTarea(libro, r); guardados++; }
          else if (r.tipo === "config") { guardarConfig(libro, r.datos); guardados++; }
          else if (r.tipo === "puntaje") { guardarPuntaje(chacra, r); guardados++; }
          else if (r.tipo === "sugerencia") { guardarSugerencia(chacra, r); guardados++; }
          else if (r.tipo === "cultivo") { guardarCultivo(chacra, r, esAdmin(cuerpo.clave)); guardados++; }
          // Las generaciones del plan no se agregan: se pisan por id. Un plan
          // se corrige muchas veces antes de ejecutarse, y si cada correccion
          // dejara una fila nueva, la hoja terminaria con cinco versiones de
          // la misma generacion y nadie sabria cual vale.
          else if (r.tipo === "generaciones") { guardarGeneracion(libro, r); guardados++; }
          else if (r.tipo === "generacion_borrar") { borrarGeneracion(libro, r); guardados++; }
          // Corregir o borrar un registro ya cargado: desde la lista de
          // "ultimos movimientos" de cada seccion.
          else if (r.tipo === "registro_editar") { corregirRegistro(chacra, libro, r, false); guardados++; }
          // La configuracion de a una parte: un cultivo del plan, o donde esta
          // un sector en el mapa. Ver cambiarPlanDeCultivo.
          else if (r.tipo === "config_plan") { cambiarPlanDeCultivo(libro, r.datos || {}); guardados++; }
          else if (r.tipo === "config_sector") { cambiarPosicionDeSector(libro, r.datos || {}); guardados++; }
          else if (r.tipo === "registro_borrar") { corregirRegistro(chacra, libro, r, true); guardados++; }
        } catch (err) {
          noGuardados.push({ id: r.id, tipo: r.tipo, error: String(err) });
        }
      });

      // Los tipos que ya atendio el bucle de arriba no vuelven a pasar por la
      // escritura por hoja: o no tienen hoja propia, o se escriben distinto.
      var SIN_HOJA = { tareas_hecha: 1, tareas_reabrir: 1, config: 1,
                       puntaje: 1, sugerencia: 1, cultivo: 1,
                       generaciones: 1, generacion_borrar: 1,
                       registro_editar: 1, registro_borrar: 1,
                       config_plan: 1, config_sector: 1 };
      var porTipo = {};
      registros.forEach(function (r) {
        if (SIN_HOJA[r.tipo]) return;
        if (HOJAS[r.tipo]) { (porTipo[r.tipo] = porTipo[r.tipo] || []).push(r); return; }
        // Un tipo desconocido se descartaba en silencio: no entraba en
        // guardados ni en no_guardados, la respuesta salia ok, y la app lo
        // borraba de la cola dandolo por enviado. Se perdia sin que nadie se
        // enterara. Ahora vuelve por id, la app lo conserva y muestra por que.
        noGuardados.push({ id: r.id, tipo: r.tipo,
                           error: "El servicio no conoce el tipo '" + r.tipo +
                                  "'. Puede estar corriendo una version anterior." });
      });

      Object.keys(porTipo).forEach(function (tipo) {
        // Las horas de Tica van a la planilla de Bioma, pero ahora entran por
        // aca, con credencial, en vez de por el script de horas abierto.
        // Si la planilla de Bioma falla, vuelven como no guardadas y el resto
        // del lote se guarda igual.
        if (tipo === "horas" && String(chacra).toLowerCase() === CHACRA_CON_HORAS_APARTE) {
          try {
            guardados += escribirHorasDeTica(porTipo[tipo], permiso.persona);
          } catch (err) {
            porTipo[tipo].forEach(function (r) {
              noGuardados.push({ id: r.id, tipo: r.tipo, error: String(err) });
            });
          }
          return;
        }
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
    if (permiso.fila) marcarActividad(permiso.fila, guardados, permiso.huella);
    // El plan y los almacigos se recuerdan unos minutos (ver recordado_):
    // cualquier cosa que los cambie los borra para que el proximo pedido los
    // lea de nuevo.
    var CAMBIAN_EL_PLAN = { siembras: 1, trasplantes: 1, generaciones: 1, generacion_borrar: 1,
                            registro_editar: 1, registro_borrar: 1 };
    if (registros.some(function (r) { return CAMBIAN_EL_PLAN[r.tipo]; })) olvidarPlan_(chacra);
    return respuesta({ ok: true, recibidos: registros.length, guardados: guardados,
                       no_guardados: noGuardados });
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
              sectores: [], integrantes: [], areas: [], plan: [] };
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
      /* Fila y columna dicen donde esta el sector en el lienzo del mapa, en
         pasos de 25 px: columna = x / 25 + 1, fila = y / 25 + 1 (desde el
         28/09; antes eran fila y columna de una grilla, que nadie llego a
         usar). 0 = nunca se acomodo: el mapa lo pone solo. */
      cfg.sectores.push({ sector: clave, bancales: Number(f[2]) || 0,
                          tipo_riego: String(f[3] || ""),
                          fila: Number(f[4]) || 0, columna: Number(f[5]) || 0 });
    } else if (seccion === "integrante") cfg.integrantes.push(clave);
    // "proyecto" es como se llamaba antes: las filas viejas se siguen leyendo.
    else if (seccion === "area" || seccion === "proyecto") {
      cfg.areas.push({
        nombre: clave, tipo: String(f[2] || ""), estado: String(f[3] || "activo"),
        actividades: String(f[4] || "").split(";").map(function (a) { return a.trim(); })
                     .filter(function (a) { return a; }),
      });
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
    filas.push(vacios(["sector", s.sector, s.bancales || 0, s.tipo_riego || "",
                       s.fila || 0, s.columna || 0]));
  });
  (cfg.integrantes || []).forEach(function (n) {
    filas.push(vacios(["integrante", n]));
  });
  // Solo las areas propias de la chacra. Las seis estandar viven en la app,
  // iguales para todos, asi que no se guardan aca ni se pueden editar.
  (cfg.areas || cfg.proyectos || []).forEach(function (a) {
    filas.push(vacios(["area", a.nombre, a.tipo || "", a.estado || "activo",
                       (a.actividades || []).join("; ")]));
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
              horas: 0, horas_por_integrante: {}, horas_por_area: {}, actualizado: new Date().toISOString() };

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

// "Choclo" y "choclos", "Hortícola" y "Horticolas": lo mismo escrito por
// personas distintas. Para comparar cultivos y areas se usa UNA regla, la misma
// que la app (claveArea en js/catalogo.js) y que las herramientas: sin tildes,
// sin mayusculas y sin la s final. Para mostrar se usa el nombre como esta.
//
// Hasta el 01/10 habia dos: esta, y claveNombre (que no saca la s) en el cruce
// de siembras con el plan, la ficha y la proyeccion. Una siembra de "Choclos"
// no marcaba sembrada una generacion de "Choclo", y la app si los juntaba.
//
// claveNombre sigue para PERSONAS: ahi la s no se saca ("Andrés", "Andre").
function claveCultivo(nombre) {
  var s = String(nombre || "").trim().toLowerCase();
  s = s.replace(/[áàä]/g, "a").replace(/[éèë]/g, "e").replace(/[íìï]/g, "i")
       .replace(/[óòö]/g, "o").replace(/[úùü]/g, "u").replace(/ñ/g, "n");
  // Cualquier otra marca sobre una letra, igual que la app.
  if (s.normalize) s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return s.replace(/s$/, "");
}
function claveArea(nombre) { return claveCultivo(nombre); }

// Las seis areas estandar. Viven en la app, que es donde se eligen, pero el
// servidor necesita la lista para escribir bien el nombre al agrupar: en las
// planillas viejas el area se tipeo a mano y viene de mil formas.
var AREAS_FIJAS = ["Hortícola", "Frutícola", "Fungis", "Comercialización",
                   "Administración", "Mantenimiento"];

// Diccionario clave comparable -> nombre para mostrar, armado con los proyectos
// que la chacra tiene cargados. Lo que no figure ahi se muestra como vino.
function nombresDeArea(libro, chacra) {
  var mapa = {};
  AREAS_FIJAS.forEach(function (n) { mapa[claveArea(n)] = n; });
  try {
    var cfg = leerConfigDe(libro, chacra);
    (cfg.areas || cfg.proyectos || []).forEach(function (a) {
      if (a && a.nombre) mapa[claveArea(a.nombre)] = a.nombre;
    });
  } catch (err) { /* sin configuracion se muestra el texto crudo */ }
  return mapa;
}

// Tica lee la planilla del proyecto; el resto, su propia hoja Horas.
function sumarHoras(chacra, libro, res) {
  try {
    var hoja = null, colNombre = 3, colHoras = 4, colProyecto = 7;
    if (String(chacra).toLowerCase() === CHACRA_CON_HORAS_APARTE) {
      var hojas = SpreadsheetApp.openById(PLANILLA_HORAS_TICA).getSheets();
      for (var i = 0; i < hojas.length; i++) {
        if (hojas[i].getName().indexOf("Respuestas de formulario") === 0) { hoja = hojas[i]; break; }
      }
    } else {
      hoja = libro.getSheetByName("Horas");
      colNombre = 4; colHoras = 5; colProyecto = 7;
    }
    if (!hoja || hoja.getLastRow() < 2) return;

    var nombres = nombresDeArea(libro, chacra);
    var ancho = colProyecto - colNombre + 1;
    var filas = hoja.getRange(2, colNombre, hoja.getLastRow() - 1, ancho).getValues();
    var iHoras = colHoras - colNombre, iProyecto = colProyecto - colNombre;
    filas.forEach(function (f) {
      var quien = String(f[0]).trim();
      var n = Number(f[iHoras]) || 0;
      if (!quien || !n) return;
      res.horas += n;
      res.horas_por_integrante[quien] = (res.horas_por_integrante[quien] || 0) + n;
      // Los registros anteriores a los proyectos no tienen ninguno: se agrupan
      // aparte para que el total por proyecto siga cerrando con el total.
      var crudo = String(f[iProyecto] || "").trim();
      var proy = crudo ? (nombres[claveArea(crudo)] || crudo) : "Sin área";
      res.horas_por_area[proy] = (res.horas_por_area[proy] || 0) + n;
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

// Alguien se arrepintio: la tarea vuelve a estar pendiente.
function reabrirTarea(libro, r) {
  var hoja = libro.getSheetByName(HOJAS.tareas.nombre);
  if (!hoja || hoja.getLastRow() < 2) return;
  var ids = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) !== String(r.datos.tarea_id)) continue;
    var fila = i + 2;
    hoja.getRange(fila, 8).setValue("Pendiente");
    hoja.getRange(fila, 11, 1, 2).setValues([["", ""]]);
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
      // Tica ademas mantiene su copia local de las horas de Bioma. Va aparte:
      // si la planilla de Bioma no responde, el panel se arma igual.
      if (codigo === CHACRA_CON_HORAS_APARTE) {
        try { espejarHorasDeTica(); } catch (e) { fallaron["espejo-horas"] = String(e); }

      }
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
/* Guarda una generacion del plan pisando la que ya estuviera con ese id. El
   plan se corrige muchas veces antes de ejecutarse: correr una fecha dos
   semanas, cambiar los bancales, sacar una generacion. Si cada correccion
   agregara una fila, quedarian cinco versiones de la misma y ninguna manera de
   saber cual manda. */
function guardarGeneracion(libro, r) {
  var def = HOJAS.generaciones;
  var hoja = obtenerHoja(libro, def);
  var fila = def.fila(r);
  var n = def.encabezados.length;
  var id = String((r.datos && r.datos.generacion_id) || r.id);

  /* La columna de bancales va como texto a la fuerza. Guarda listas como
     "1, 2, 3" y la planilla, librada a su criterio, las interpreta como una
     fecha: "1, 2, 3" se convertia en el 1 de febrero de 2003 y la generacion
     quedaba sin lugar asignado aunque tuviera sector. */
  hoja.getRange(1, 10, hoja.getMaxRows(), 1).setNumberFormat("@");
  // La hoja ya existia sin la columna Variedad: se le pone el encabezado.
  if (!hoja.getRange(1, n).getValue()) hoja.getRange(1, n).setValue(def.encabezados[n - 1]);

  if (hoja.getLastRow() > 1) {
    var ids = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === id) {
        hoja.getRange(i + 2, 1, 1, n).setValues([fila]);
        return;
      }
    }
  }
  hoja.getRange(hoja.getLastRow() + 1, 1, 1, n).setValues([fila]);
}

/* Saca una generacion del plan. Se borra la fila entera y no se marca como
   anulada: el plan es una intencion, no un registro historico. Lo que de
   verdad paso vive en Siembras y eso no se toca nunca. */
function borrarGeneracion(libro, r) {
  var def = HOJAS.generaciones;
  var hoja = libro.getSheetByName(def.nombre);
  if (!hoja || hoja.getLastRow() < 2) return;
  var id = String((r.datos && r.datos.generacion_id) || r.id);
  var ids = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === id) { hoja.deleteRow(i + 2); return; }
  }
}

/* El plan de generaciones entero. Son unas ochenta filas por temporada, asi
   que viaja completo: no tiene sentido paginarlo, y el grafico las necesita
   todas para dibujar la temporada. */
function generacionesDelPlan(chacra) {
  var def = HOJAS.generaciones;
  var libro = planillaDe(chacra);
  var hoja = libro.getSheetByName(def.nombre);
  if (!hoja || hoja.getLastRow() < 2) return [];
  var tz = Session.getScriptTimeZone();
  var texto = function (v) {
    return (v instanceof Date) ? Utilities.formatDate(v, tz, "yyyy-MM-dd") : String(v || "");
  };

  /* Que una generacion este sembrada no lo dice el plan sino la hoja Siembras.
     La columna Estado es una foto del dia en que se importo el plan: si se
     sigue creyendo en ella, una generacion ya sembrada queda pidiendo que la
     siembren para siempre. Se cruza por cultivo y generacion, que es la unica
     llave que comparten las dos hojas. */
  /* Cruzar el plan con lo sembrado: manda el NUMERO DE GENERACION y la fecha
     queda de respaldo.

     Se probaron las dos reglas por separado y ninguna sola alcanza. Cruzando
     solo por fecha, una siembra de habas cargada con 29 dias de atraso quedo
     pegada a las generaciones 3 y 4 -las mas cercanas en el calendario- y la
     1, que era la que decia el registro, siguio figurando como pendiente. La
     persona habia escrito "generacion 1" y el cruce ignoraba ese dato, que es
     el unico explicito que hay.

     Asi que: si quien carga la siembra anoto la generacion, se le cree. La
     fecha solo decide cuando nadie anoto ninguna generacion de ese cultivo,
     que es el caso de los registros viejos. */
  var ANTES = 10, DESPUES = 25;
  var siembras = [];
  var hs = libro.getSheetByName(HOJAS.siembras.nombre);
  if (hs && hs.getLastRow() > 1) {
    hs.getRange(2, 1, hs.getLastRow() - 1, HOJAS.siembras.encabezados.length)
      .getValues().forEach(function (f) {
        if (!f[0] || !f[3] || !f[2]) return;
        siembras.push({ id: String(f[0]), cultivo: claveCultivo(f[3]),
                        fecha: texto(f[2]), generacion: Number(f[6]) || 0 });
      });
  }
  // De que cultivos se anoto al menos una generacion: ahi la fecha no decide.
  var conGeneracion = {};
  siembras.forEach(function (s) {
    if (s.generacion) conGeneracion[s.cultivo] = true;
  });

  var buscarSiembra = function (cultivo, gen, cuando) {
    var k = claveCultivo(cultivo);
    var i;
    // 1) por numero de generacion, que es lo que alguien escribio a proposito
    for (i = 0; i < siembras.length; i++) {
      if (siembras[i].cultivo === k && siembras[i].generacion === gen) return siembras[i];
    }
    // 2) si de este cultivo nadie anoto generacion, se cae en la fecha
    if (conGeneracion[k] || !cuando) return null;
    var objetivo = new Date(cuando + "T12:00:00").getTime();
    for (i = 0; i < siembras.length; i++) {
      if (siembras[i].cultivo !== k || !siembras[i].fecha) continue;
      var d = (new Date(siembras[i].fecha + "T12:00:00").getTime() - objetivo) / 86400000;
      if (d >= -ANTES && d <= DESPUES) return siembras[i];
    }
    return null;
  };

  return hoja.getRange(2, 1, hoja.getLastRow() - 1, def.encabezados.length)
    .getValues()
    .filter(function (f) { return f[0] && f[2]; })
    .map(function (f) {
      var gen = Number(f[3]) || 1;
      // El dia que toca sembrar: la bandeja si va por almacigo, el bancal si
      // es siembra directa.
      var real = buscarSiembra(String(f[2]), gen, texto(f[5]) || texto(f[6]));
      return {
        id: String(f[0]), cultivo: String(f[2]), generacion: gen,
        metodo: String(f[4] || ""), fecha_almacigo: texto(f[5]),
        fecha_campo: texto(f[6]), camas: Number(f[7]) || 0,
        sector: String(f[8] || ""),
        // Si una fila vieja quedo con la fecha que invento la planilla al leer
        // "1, 2, 3", se devuelve vacia: mejor sin lugar que con uno falso.
        // Solo una lista de numeros. Una celda que la planilla convirtio en
        // fecha, o el texto de esa fecha guardado despues, se devuelve vacia:
        // mejor sin lugar que con uno falso.
        bancales: /^\s*\d+(\s*,\s*\d+)*\s*$/.test(String(f[9] instanceof Date ? "x" : f[9] || ""))
          ? String(f[9]) : "",
        estado: String(f[10] || "Planificado"),
        // Lo que de verdad paso, calculado contra la hoja Siembras.
        sembrada: !!real,
        siembra_id: real ? real.id : "",
        sembrada_el: real ? real.fecha : "",
        variedad: String(f[13] || ""),
      };
    });
}

/* Todo lo que la chacra hizo con UN cultivo esta temporada: sus siembras, sus
   trasplantes y sus cosechas. Es lo que alimenta la ficha del cultivo.

   Va aca y no en la app por lo de siempre: el telefono recibe las ultimas 15
   filas de cada hoja, y la ficha tiene que mirar la temporada entera. Se pide
   de a un cultivo, asi que lo que viaja es chico aunque la planilla crezca. */
function fichaDeCultivo(chacra, cultivo) {
  var libro = planillaDe(chacra);
  var k = claveCultivo(cultivo);
  var tz = Session.getScriptTimeZone();
  var texto = function (v) {
    return (v instanceof Date) ? Utilities.formatDate(v, tz, "yyyy-MM-dd") : String(v || "");
  };

  var leer = function (def, columnaCultivo, armar) {
    var hoja = libro.getSheetByName(def.nombre);
    if (!hoja || hoja.getLastRow() < 2) return [];
    return hoja.getRange(2, 1, hoja.getLastRow() - 1, def.encabezados.length)
      .getValues()
      .filter(function (f) { return f[0] && claveCultivo(f[columnaCultivo]) === k; })
      .map(armar);
  };

  var siembras = leer(HOJAS.siembras, 3, function (f) {
    return {
      id: String(f[0]), fecha: texto(f[2]), variedad: String(f[4] || ""),
      tipo: String(f[5] || ""), generacion: Number(f[6]) || 1,
      plantines: Number(f[9]) || 0, sector: String(f[10] || ""),
      bancal: String(f[11] || ""), trasplante_estimado: texto(f[12]),
      cosecha_estimada: texto(f[13]), operador: String(f[14] || ""),
    };
  });

  var trasplantes = leer(HOJAS.trasplantes, 8, function (f) {
    return {
      id: String(f[0]), fecha: texto(f[2]), siembra_id: String(f[3] || ""),
      dias_reales: Number(f[5]) || 0, dias_teoricos: Number(f[6]) || 0,
      diferencia: Number(f[7]) || 0, variedad: String(f[9] || ""),
      generacion: Number(f[10]) || 1, sector: String(f[11] || ""),
      bancal: String(f[12] || ""), lineas: Number(f[13]) || 0,
      distancia_cm: Number(f[14]) || 0, marco: String(f[16] || ""),
      plantines: Number(f[17]) || 0,
    };
  });

  var cosechas = leer(HOJAS.cosechas, 3, function (f) {
    return { id: String(f[0]), fecha: texto(f[2]), kg: Number(f[4]) || 0,
             operador: String(f[5] || "") };
  });

  var kg = 0;
  cosechas.forEach(function (c) { kg += c.kg; });

  return { ok: true, cultivo: cultivo, siembras: siembras,
           trasplantes: trasplantes, cosechas: cosechas,
           kg_cosechados: Math.round(kg * 100) / 100 };
}

/* Los almacigos que todavia esperan trasplante, mirando la hoja ENTERA.
   La app no puede calcularlo: solo recibe las ultimas 15 siembras, y un
   almacigo de agosto que se trasplanta en septiembre queda afuera de esa
   ventana. Es el mismo error que tenian las horas cuando se sumaban las
   ultimas diez. Lo que se cuenta sobre todo el historial se cuenta aca. */
function almacigosEsperando(chacra) {
  var libro = planillaDe(chacra);
  var siembras = libro.getSheetByName(HOJAS.siembras.nombre);
  if (!siembras || siembras.getLastRow() < 2) return [];

  // Las siembras que ya tienen trasplante salen de la lista. La hoja puede no
  // existir todavia: la primera temporada no hay ninguno.
  var hechos = {};
  var tras = libro.getSheetByName(HOJAS.trasplantes.nombre);
  if (tras && tras.getLastRow() > 1) {
    tras.getRange(2, 4, tras.getLastRow() - 1, 1).getValues()
        .forEach(function (f) { if (f[0]) hechos[String(f[0])] = true; });
  }

  var tz = Session.getScriptTimeZone();
  var texto = function (v) {
    return (v instanceof Date) ? Utilities.formatDate(v, tz, "yyyy-MM-dd") : String(v || "");
  };

  var cols = HOJAS.siembras.encabezados.length;
  return siembras.getRange(2, 1, siembras.getLastRow() - 1, cols).getValues()
    .filter(function (f) {
      return f[0] && !hechos[String(f[0])] && /alm.cigo/i.test(String(f[5] || ""));
    })
    .map(function (f) {
      return {
        Id: String(f[0]), Fecha: texto(f[2]), Cultivo: String(f[3] || ""),
        Variedad: String(f[4] || ""), Tipo: String(f[5] || ""),
        "Generación": Number(f[6]) || 1, Plantines: Number(f[9]) || 0,
        "Trasplante estimado": texto(f[12]),
      };
    });
}

function ultimosDeHoja(chacra, cual, cuantos) {
  var def = HOJAS[String(cual).toLowerCase()];
  if (!def) return [];
  // Las horas de Tica viven en la planilla de Bioma: se leen de ahi, con los
  // mismos encabezados que las de las demas chacras.
  if (def === HOJAS.horas && String(chacra).toLowerCase() === CHACRA_CON_HORAS_APARTE) {
    return ultimasHorasDeTica(cuantos);
  }
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

// ---------- Corregir y borrar registros ----------
//
// Antes, para arreglar una siembra mal cargada habia que abrir la planilla.
// Ahora se corrige desde la lista de "ultimos movimientos" de cada seccion.
//
// Nada se pierde: cada cambio deja la fila COMO ESTABA en la hoja "Cambios"
// de la chacra, con quien lo hizo y cuando. Si alguien borra algo por error,
// se recupera copiando esa fila de vuelta.
var CORREGIBLES = { siembras: 1, trasplantes: 1, cosechas: 1, horas: 1 };
var CAMBIOS = { nombre: "Cambios",
                encabezados: ["Cuándo", "Hoja", "Id", "Qué", "Quién", "Cómo estaba"] };

function anotarCambio(libro, cual, id, que, quien, antes) {
  var hoja = obtenerHoja(libro, CAMBIOS);
  hoja.appendRow([new Date(), cual, id, que, quien || "", JSON.stringify(antes)]);
}

function corregirRegistro(chacra, libro, r, borrar) {
  var d = r.datos || {};
  var cual = String(d.hoja || "").toLowerCase();
  var id = String(d.id || "");
  if (!CORREGIBLES[cual] || !id) throw new Error("Ese registro no se puede corregir desde la app.");
  if (cual === "horas" && String(chacra).toLowerCase() === CHACRA_CON_HORAS_APARTE) {
    return corregirHoraDeTica(libro, id, d.datos || {}, borrar, r.dispositivo);
  }
  var def = HOJAS[cual];
  var hoja = libro.getSheetByName(def.nombre);
  if (!hoja || hoja.getLastRow() < 2) throw new Error("No encontré la hoja " + def.nombre + ".");
  var n = def.encabezados.length;

  /* TODAS las filas con ese id, no solo la primera. Hasta el 01/10 se
     corregía o borraba la primera y se paraba: en Tica había dos cosechas de
     prueba cargadas dos veces con el mismo id (del 24/09), y al borrarlas se
     iba una copia y la otra quedaba. En la app parecía que el borrado no
     andaba: "intenté borrarlos pero regresan". Ahora borrar saca todas las
     copias, y corregir arregla la primera y saca las sobrantes. Cada fila que
     se toca queda anotada en Cambios, como estaba. */
  var ids = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues();
  var filas = [];
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) filas.push(i + 2);
  }
  // Ya no esta: otro telefono lo borro antes. No es un error que haya que
  // reintentar para siempre.
  if (!filas.length) return;

  var comoEstaba = function (fila) {
    var antes = hoja.getRange(fila, 1, 1, n).getValues()[0];
    var obj = {};
    def.encabezados.forEach(function (c, j) { obj[c] = antes[j]; });
    return { valores: antes, obj: obj };
  };
  var sobran = borrar ? filas : filas.slice(1);
  if (!borrar) {
    var primera = comoEstaba(filas[0]);
    anotarCambio(libro, def.nombre, id, "corregido", r.dispositivo, primera.obj);
    // La fila se rearma con la misma receta que al cargarla. Se conservan el
    // id, la temporada y quien la cargo: corregir no es cargar de nuevo.
    var iCargado = def.encabezados.indexOf("Cargado por");
    var nueva = def.fila({ id: id, temporada: primera.valores[1], datos: d.datos || {},
                           dispositivo: iCargado >= 0 ? primera.valores[iCargado] : "" });
    hoja.getRange(filas[0], 1, 1, n).setValues([nueva]);
  }
  // De abajo hacia arriba, así los números de fila no se corren.
  sobran.slice().reverse().forEach(function (fila) {
    anotarCambio(libro, def.nombre, id, borrar ? "borrado" : "borrado (copia repetida)",
                 r.dispositivo, comoEstaba(fila).obj);
    hoja.deleteRow(fila);
  });
}

// Las horas de Tica estan en la planilla de Bioma, en la hoja de respuestas:
// Marca(1) Fecha(2) Trabajador(3) Horas(4) Actividad(5) Obs(6) Area(7). Se
// identifican por la marca temporal, que no cambia aunque se reordenen.
function hojaHorasDeTica() {
  var hojas = SpreadsheetApp.openById(PLANILLA_HORAS_TICA).getSheets();
  for (var i = 0; i < hojas.length; i++) {
    if (hojas[i].getName().indexOf("Respuestas de formulario") === 0) return hojas[i];
  }
  throw new Error("No encontré las horas de Bioma.");
}

function ultimasHorasDeTica(cuantos) {
  var hoja = hojaHorasDeTica();
  if (hoja.getLastRow() < 2) return [];
  var n = Math.min(Math.max(cuantos, 1), Math.min(hoja.getLastRow() - 1, 30));
  var tz = Session.getScriptTimeZone();
  var fecha = function (v) { return (v instanceof Date) ? Utilities.formatDate(v, tz, "yyyy-MM-dd") : String(v || ""); };
  return hoja.getRange(hoja.getLastRow() - n + 1, 1, n, 8).getValues().map(function (f) {
    return { "Id": (f[0] instanceof Date) ? "bioma-" + f[0].getTime() : "",
             "Fecha": fecha(f[1]), "Integrante": String(f[2] || ""), "Horas": f[3],
             "Actividad": String(f[4] || ""), "Área": String(f[6] || ""),
             "Observaciones": String(f[5] || ""), "Cargado por": String(f[7] || "planilla de horas") };
  }).reverse();
}

function corregirHoraDeTica(libro, id, datos, borrar, quien) {
  var marca = Number(String(id).replace("bioma-", ""));
  if (!marca) throw new Error("Esa hora no tiene marca: se corrige en la planilla.");
  var hoja = hojaHorasDeTica();
  var filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, 7).getValues();
  for (var i = filas.length - 1; i >= 0; i--) {
    var m = filas[i][0];
    if (!(m instanceof Date) || m.getTime() !== marca) continue;
    anotarCambio(libro, "Horas (planilla de Bioma)", id, borrar ? "borrado" : "corregido", quien,
                 { marca: m, fecha: filas[i][1], trabajador: filas[i][2], horas: filas[i][3],
                   actividad: filas[i][4], obs: filas[i][5], area: filas[i][6] });
    if (borrar) { hoja.deleteRow(i + 2); return; }
    var p = String(datos.fecha || "").split("-");
    var f = p.length === 3 ? new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0) : filas[i][1];
    hoja.getRange(i + 2, 1, 1, 7).setValues([[m, f, String(datos.integrante || filas[i][2]),
      Number(datos.horas) || filas[i][3], String(datos.actividad || ""),
      String(datos.observaciones || ""), String(datos.area || "")]]);
    return;
  }
}

// ---------- Lo que se recuerda unos minutos ----------
//
// El plan (generaciones cruzadas con la hoja Siembras) y los almacigos que
// esperan trasplante releian la hoja Siembras entera en cada pedido, y son lo
// que mas se pide: Inicio, Plan, Proyeccion de Economia. Se recuerdan cinco
// minutos por chacra; doPost los olvida apenas llega algo que los cambia.
// Lo que alguien edite a mano en la planilla tarda hasta cinco minutos en
// verse. Si no entra en la cache (100 KB por llave), se calcula siempre.
function recordado_(que, chacra, calcular) {
  var cache = CacheService.getScriptCache();
  var llave = que + "_" + String(chacra).toLowerCase();
  var guardado = cache.get(llave);
  if (guardado) { try { return JSON.parse(guardado); } catch (e) { /* se recalcula */ } }
  var valor = calcular(chacra);
  var texto = JSON.stringify(valor);
  if (texto.length < 95000) { try { cache.put(llave, texto, 300); } catch (e) { /* no entra */ } }
  return valor;
}

function olvidarPlan_(chacra) {
  var c = String(chacra).toLowerCase();
  CacheService.getScriptCache().removeAll(["plan_" + c, "almacigos_" + c]);
}

// ---------- Columnas en su lugar ----------
//
// Este codigo lee y escribe las hojas POR POSICION: la columna 4 de Siembras
// es el cultivo porque asi lo dice HOJAS.siembras. Si alguien inserta o mueve
// una columna a mano en la planilla, los datos se leen y se escriben corridos,
// sin ningun error. Esto lo detecta: compara la fila 1 de cada hoja con los
// encabezados esperados. Lo usa tools/version_servicio.py.
//
// Columnas de mas al final no molestan. Que falten al final tampoco: las
// filas nuevas las completan. Lo grave es un nombre distinto en una posicion.
function revisarColumnas(chacra) {
  var libro = planillaDe(chacra);
  var salida = [];
  Object.keys(HOJAS).forEach(function (k) {
    var def = HOJAS[k];
    var hoja = libro.getSheetByName(def.nombre);
    if (!hoja || !hoja.getLastColumn()) return;
    var ancho = Math.min(hoja.getLastColumn(), def.encabezados.length);
    var reales = hoja.getRange(1, 1, 1, ancho).getValues()[0];
    var distintas = [];
    for (var i = 0; i < ancho; i++) {
      if (claveCultivo(reales[i]) !== claveCultivo(def.encabezados[i])) {
        distintas.push({ columna: i + 1, espera: def.encabezados[i], hay: String(reales[i]) });
      }
    }
    // Ids repetidos: una misma fila cargada dos veces. Corregir y borrar ya
    // tocan todas las copias, pero conviene saber si aparecen, y de dónde.
    var repetidos = [];
    if (hoja.getLastRow() > 1) {
      var vistos = {};
      hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues().forEach(function (f) {
        var id = String(f[0] || "");
        if (!id) return;
        if (vistos[id] === 1) repetidos.push(id);
        vistos[id] = (vistos[id] || 0) + 1;
      });
    }
    salida.push({ hoja: def.nombre, filas: Math.max(hoja.getLastRow() - 1, 0),
                  faltan_al_final: Math.max(def.encabezados.length - hoja.getLastColumn(), 0),
                  distintas: distintas, repetidos: repetidos });
  });
  return salida;
}

// ---------- La configuracion de a una parte ----------
//
// Guardar la configuracion reescribe la hoja Config entera con la copia del
// telefono. Para lo que se edita a cada rato —el plan de un cultivo, que se
// recalcula con cada generacion, y la posicion de un sector en el mapa— eso
// era un riesgo: un telefono con una copia de la mañana, al guardar su
// cultivo, borraba lo que otro habia cambiado despues (un sector movido, el
// plan de otro cultivo). Estas dos tocan una sola fila y nada mas.

function filasDeConfig_(libro) {
  var hoja = hojaConfig(libro);
  var n = hoja.getLastRow();
  return { hoja: hoja, filas: n > 1 ? hoja.getRange(2, 1, n - 1, 2).getValues() : [] };
}

// Un cultivo del plan: se reemplaza su fila, se agrega si no estaba, o se
// saca si viene { borrar: true }.
function cambiarPlanDeCultivo(libro, p) {
  if (!p.cultivo) throw new Error("Falta el cultivo.");
  var c = filasDeConfig_(libro);
  var fila = ["plan", p.cultivo, p.superficie_m2 || 0, p.cosecha_esperada_kg || 0,
              p.rinde_kg_m2 || 0, p.lineas || 0, p.distancia_cm || 0, p.plantas || 0];
  for (var i = 0; i < c.filas.length; i++) {
    if (String(c.filas[i][0]) !== "plan" || claveCultivo(c.filas[i][1]) !== claveCultivo(p.cultivo)) continue;
    if (p.borrar) c.hoja.deleteRow(i + 2);
    else c.hoja.getRange(i + 2, 1, 1, CONFIG_COLS).setValues([fila]);
    return;
  }
  if (!p.borrar) c.hoja.getRange(c.hoja.getLastRow() + 1, 1, 1, CONFIG_COLS).setValues([fila]);
}

// Donde esta un sector en el mapa: solo su fila y columna. El resto del
// sector (bancales, riego) se cambia en Configuracion.
function cambiarPosicionDeSector(libro, s) {
  var c = filasDeConfig_(libro);
  for (var i = 0; i < c.filas.length; i++) {
    if (String(c.filas[i][0]) !== "sector" || String(c.filas[i][1]) !== String(s.sector)) continue;
    c.hoja.getRange(i + 2, 5, 1, 2).setValues([[Number(s.fila) || 0, Number(s.columna) || 0]]);
    return;
  }
}

// ---------- Las horas de Tica, por este servicio ----------
//
// Antes el telefono las mandaba directo al script de la planilla de horas,
// que no pedia credencial y cuya direccion estaba en el codigo publico: con
// ella cualquiera podia cargar horas, y de las horas salen los sueldos. Ahora
// entran por aca, que ya sabe de que telefono vienen, y se escriben en la
// misma hoja y con el mismo formato: bioma-db las sigue importando igual.
//
// Suma una columna: "Cargado por", la persona del telefono. bioma-db ubica
// las columnas por nombre, asi que una mas al final no le cambia nada.
function escribirHorasDeTica(registros, persona) {
  var hoja = hojaHorasDeTica();
  if (!hoja.getRange(1, 8).getValue()) hoja.getRange(1, 8).setValue("Cargado por").setFontWeight("bold");

  // Un reintento no duplica: se miran las marcas de las ultimas filas.
  var n = Math.min(hoja.getLastRow() - 1, 300);
  var ya = {};
  if (n > 0) {
    hoja.getRange(hoja.getLastRow() - n + 1, 1, n, 3).getValues().forEach(function (f) {
      if (f[0] instanceof Date) ya[Math.round(f[0].getTime() / 1000) + "|" + String(f[2])] = true;
    });
  }
  var filas = [];
  registros.forEach(function (r) {
    var d = r.datos || {};
    var marca = r.creado_en ? new Date(r.creado_en) : new Date();
    // Al segundo: la planilla no siempre devuelve los milisegundos iguales.
    var clave = Math.round(marca.getTime() / 1000) + "|" + String(d.integrante || "");
    if (ya[clave]) return;
    ya[clave] = true;
    // Mediodia: una diferencia de zona horaria nunca cambia el dia.
    var p = String(d.fecha || "").split("-");
    var fecha = p.length === 3 ? new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0) : new Date();
    filas.push([marca, fecha, String(d.integrante || ""), Number(d.horas) || 0,
                String(d.actividad || ""), String(d.observaciones || ""),
                String(d.area || d.proyecto || ""), persona || r.dispositivo || ""]);
  });
  if (filas.length) hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, 8).setValues(filas);
  return filas.length;
}

// Los nombres del equipo: la hoja Config de la planilla de horas, como los
// daba el script aparte (sin los de relleno de la plantilla vieja).
function nombresDeHorasTica() {
  var hoja = SpreadsheetApp.openById(PLANILLA_HORAS_TICA).getSheetByName("Config");
  if (!hoja || hoja.getLastRow() < 1) return [];
  return hoja.getRange(1, 1, hoja.getLastRow(), 1).getValues()
    .map(function (f) { return String(f[0]).trim(); })
    .filter(function (v) {
      return v && v !== "Trabajador" && v.indexOf("Configuración") !== 0
        && v.indexOf("Editá") !== 0 && v.indexOf("Editár") !== 0
        && !/^(Trabajador|Operador|Encargado|Integrante|Persona)\s*\d+$/i.test(v);
    });
}

// ---------- Espejo de las horas de Chacra Tica ----------
//
// Tica carga sus horas en la planilla del proyecto Bioma, que es donde esta el
// historial desde julio, y eso se mantiene: es la fuente. Pero era la unica
// chacra sin sus horas en su propia planilla, asi que su carpeta no se parecia
// a la de las demas y no se podia leer todo de un solo lado.
//
// Esta funcion copia las filas de Bioma a la hoja Horas de Tica, con los
// mismos encabezados que usan las otras chacras. Es una COPIA: se reescribe
// entera en cada pasada, asi que lo que se edite ahi a mano se pierde. Para
// corregir una hora hay que hacerlo en la planilla de Bioma.
//
// El resumen sigue sumando desde Bioma, no desde esta hoja: si sumara las dos,
// las horas de Tica se contarian dos veces.
function espejarHorasDeTica() {
  var origen = null;
  var hojas = SpreadsheetApp.openById(PLANILLA_HORAS_TICA).getSheets();
  for (var i = 0; i < hojas.length; i++) {
    if (hojas[i].getName().indexOf("Respuestas de formulario") === 0) { origen = hojas[i]; break; }
  }
  if (!origen || origen.getLastRow() < 2) return { ok: false, error: "No encontre las horas de Bioma." };

  // Bioma: Marca(1) Fecha(2) Trabajador(3) Horas(4) Actividad(5) Obs(6) Area(7)
  // Cargado por(8), desde el 30/09: las anteriores lo tienen vacio.
  var filas = origen.getRange(2, 1, origen.getLastRow() - 1, 8).getValues();
  var libro = planillaDe(CHACRA_CON_HORAS_APARTE);
  var cfg = leerConfigDe(libro, CHACRA_CON_HORAS_APARTE);
  var temporada = (cfg.temporada && cfg.temporada.nombre) || "";
  var desde = (cfg.temporada && cfg.temporada.inicio) ? new Date(cfg.temporada.inicio) : null;
  var tz = Session.getScriptTimeZone();
  var comoFecha = function (v) {
    return (v instanceof Date) ? Utilities.formatDate(v, tz, "yyyy-MM-dd") : String(v || "");
  };

  var salida = [];
  filas.forEach(function (f) {
    var quien = String(f[2] || "").trim();
    var horas = Number(f[3]) || 0;
    if (!quien || !horas) return;                       // filas vacias o de relleno
    var fecha = f[1];
    // El id sale de la marca temporal: es estable aunque se reordenen las filas.
    var marca = (f[0] instanceof Date) ? f[0].getTime() : 0;
    salida.push([
      "bioma-" + (marca || Utilities.getUuid().slice(0, 8)),
      (desde && fecha instanceof Date && fecha < desde) ? "" : temporada,
      comoFecha(fecha), quien, horas,
      String(f[4] || ""), String(f[6] || ""), String(f[5] || ""),
      String(f[7] || "planilla de horas"), f[0] instanceof Date ? f[0] : ""
    ]);
  });

  var def = HOJAS.horas;
  var hoja = libro.getSheetByName(def.nombre);
  if (!hoja) {
    hoja = libro.insertSheet(def.nombre);
    ponerEncabezados(hoja, def.encabezados);
  }
  // Se borra y se reescribe entera: asi una fila corregida o borrada en Bioma
  // queda igual de este lado, sin duplicados ni sobrantes.
  if (hoja.getLastRow() > 1) {
    hoja.getRange(2, 1, hoja.getLastRow() - 1, def.encabezados.length).clearContent();
  }
  if (salida.length) hoja.getRange(2, 1, salida.length, def.encabezados.length).setValues(salida);
  return { ok: true, copiadas: salida.length };
}

// ---------- Cuentas de sueldos, leidas del proyecto Bioma ----------
//
// La deuda la calcula bioma-db, que es el unico lugar que tiene los dos lados:
// las horas y los pagos. AMA no calcula ni guarda nada de esto: lo pide y
// lo muestra. Llevar la cuenta en dos lados daria dos verdades sobre la misma
// plata, que es justo lo que este arreglo viene a evitar.
//
// Esto es SOLO de Chacra Tica. Las demas chacras no tienen esta seccion: sus
// horas van a su propia planilla y no hay ninguna economia compartida. Por eso
// la direccion vive en una propiedad con el codigo de chacra adelante, y si una
// chacra no figura ahi, para ella la seccion no existe.
//
// Propiedades del script (Configuracion del proyecto > Propiedades):
//   CUENTAS_URLS      {"tica":"https://script.google.com/macros/s/..../exec"}
//   CUENTAS_VEN_TODO  {"tica":["Marto","Tomi"]}
//
// La direccion NO va en el codigo: el repositorio es publico.
function urlCuentasDe(chacra) {
  try {
    var p = PropertiesService.getScriptProperties().getProperty("CUENTAS_URLS");
    if (!p) return "";
    return JSON.parse(p)[String(chacra).toLowerCase()] || "";
  } catch (e) { return ""; }
}

// Quienes pueden ver las cuentas de todo el equipo. El resto ve la suya y nada
// mas. El endpoint de Bioma no puede distinguir quien pregunta, pero AMA
// si: sabe de quien es cada telefono por su credencial, no por el nombre que
// eligio en una lista. Por eso el filtro se hace aca.
function puedeVerTodasLasCuentas(chacra, persona) {
  try {
    var p = PropertiesService.getScriptProperties().getProperty("CUENTAS_VEN_TODO");
    if (!p) return false;
    var lista = JSON.parse(p)[String(chacra).toLowerCase()] || [];
    for (var i = 0; i < lista.length; i++) {
      if (claveNombre(lista[i]) === claveNombre(persona)) return true;
    }
  } catch (e) { /* si la propiedad esta mal escrita, nadie ve de mas */ }
  return false;
}

// ---------- Resumen economico del proyecto ----------
//
// Mismo trato que las cuentas: bioma-db calcula, AMA muestra. Otro endpoint de
// solo lectura, otra propiedad, y solo para las chacras que lo tengan.
//   ECONOMIA_URLS      {"tica":"https://script.google.com/macros/s/..../exec"}
//   ECONOMIA_VEN_TODO  {"tica":["Marto","Tomi"]}
//
// Si ECONOMIA_VEN_TODO no esta, vale la lista de las cuentas: quien ya ve la
// plata de todo el equipo no descubre nada nuevo viendo el balance. Se puede
// separar despues sin tocar codigo.
function urlEconomiaDe(chacra) {
  try {
    var p = PropertiesService.getScriptProperties().getProperty("ECONOMIA_URLS");
    if (!p) return "";
    return JSON.parse(p)[String(chacra).toLowerCase()] || "";
  } catch (e) { return ""; }
}

function puedeVerLaEconomia(chacra, persona) {
  try {
    var p = PropertiesService.getScriptProperties().getProperty("ECONOMIA_VEN_TODO");
    if (p) {
      var lista = JSON.parse(p)[String(chacra).toLowerCase()] || [];
      for (var i = 0; i < lista.length; i++) {
        if (claveNombre(lista[i]) === claveNombre(persona)) return true;
      }
      return false;
    }
  } catch (e) { /* mal escrita: se cae a la lista de las cuentas */ }
  return puedeVerTodasLasCuentas(chacra, persona);
}

function traerEconomiaDeBioma(chacra, forzar) {
  var url = urlEconomiaDe(chacra);
  if (!url) return null;
  var cache = CacheService.getScriptCache();
  var llave = "economia_" + chacra;
  var guardado = forzar ? null : cache.get(llave);
  if (guardado) return JSON.parse(guardado);

  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  var datos = JSON.parse(r.getContentText());
  if (!datos || datos.api !== 1) {
    throw new Error(datos && datos.error ? datos.error : "Respuesta inesperada de Bioma.");
  }
  cache.put(llave, JSON.stringify(datos), 600);
  return datos;
}

// Lo que ve este telefono del estado economico. Quien no esta habilitado ve
// como viene la liquidacion de sueldos y en que se trabajo: eso responde "el
// proyecto esta pagando?" y "en que se nos fue la temporada?", que es lo que
// legitimamente le importa a alguien que trabaja, sin abrir ingresos, egresos
// ni margen.
function economiaParaElTelefono(chacra, persona, forzar) {
  var d = traerEconomiaDeBioma(chacra, forzar);
  if (!d) return null;
  var todo = puedeVerLaEconomia(chacra, persona);
  var base = {
    actualizado: d.actualizado, moneda: d.moneda || "ARS",
    temporada: d.temporada || "", ve_todo: todo,
    sueldos: d.sueldos || null, horas: d.horas || null,
  };
  if (!todo) return base;
  base.resumen = d.resumen || null;
  base.meses = d.meses || [];
  base.ingresos_por_concepto = d.ingresosPorConcepto || [];
  base.egresos_por_concepto = d.egresosPorConcepto || [];
  return base;
}

// ---------- Proyeccion de la temporada, para AMA Economia ----------
//
// El camino inverso al de las cuentas: aca AMA Produccion es quien sabe y
// Economia quien pregunta. Produccion dice que se planto, cuanto y con que
// rinde; Economia le pone los precios. Cada lado decide lo suyo y ninguno
// copia al otro, asi no hay dos verdades.
//
// Lo pide el SERVIDOR de bioma-db con UrlFetchApp, nunca un navegador. La clave
// va en una propiedad del script, una por chacra, y solo abre esta respuesta:
//   PROYECCION_TOKENS  {"tica":"<clave larga al azar>"}
// Una chacra sin clave no se puede consultar, que es lo que corresponde a las
// cuatro que no tienen nada que ver con la economia de Bioma.
function tokenDeProyeccionValido(chacra, token) {
  if (!token) return false;
  try {
    var p = PropertiesService.getScriptProperties().getProperty("PROYECCION_TOKENS");
    if (!p) return false;
    // Sin espacios de los costados: al pegar en la propiedad se cuelan solos.
    var esperado = String(JSON.parse(p)[String(chacra).toLowerCase()] || "").trim();
    return !!esperado && esperado === String(token).trim();
  } catch (e) { return false; }
}

// Se ejecuta A MANO desde el editor cuando AMA Economia dice que la clave no
// abre la proyeccion. Dice que tiene la propiedad sin mostrar la clave entera,
// para compararla con tools/token_proyeccion.txt. No hace falta implementar
// para correrla: alcanza con guardar.
function revisarClaveProyeccion() {
  var p = PropertiesService.getScriptProperties().getProperty("PROYECCION_TOKENS");
  if (p === null) {
    Logger.log("No existe la propiedad PROYECCION_TOKENS (revisar el nombre, en mayusculas).");
    return;
  }
  var datos;
  try { datos = JSON.parse(p); } catch (e) {
    Logger.log("PROYECCION_TOKENS no es un JSON. Tiene que ser {\"tica\": \"<clave>\"}, con");
    Logger.log("llaves y comillas rectas. Hoy empieza con: " + String(p).slice(0, 6) + "...");
    return;
  }
  Object.keys(datos).forEach(function (k) {
    var t = String(datos[k] || "");
    Logger.log("chacra '" + k + "': clave de " + t.trim().length + " caracteres, empieza con "
               + t.trim().slice(0, 4) + " y termina con " + t.trim().slice(-4)
               + (t !== t.trim() ? " (tiene espacios de mas)" : ""));
  });
  if (!datos.tica) Logger.log("OJO: no hay clave para 'tica' (en minusculas).");
}

// Lo que la chacra decidio producir: el plan de la configuracion, cultivo por
// cultivo. Viaja la superficie, el rinde y los kilos ya calculados: si Economia
// rehiciera la cuenta, algun dia daria distinto que la pantalla de Plan.
function proyeccionDe(chacra) {
  var libro = planillaDe(chacra);
  var cfg = leerConfigDe(libro, chacra);
  var b = cfg.bancal || {};
  var m2Bancal = (Number(b.largo_m) || 0) * (Number(b.ancho_m) || 0);

  // Cuantas generaciones tiene cada cultivo en el plan: dice si el numero es
  // una siembra grande o varias escalonadas.
  var gens = {};
  try {
    generacionesDelPlan(chacra).forEach(function (g) {
      var k = claveCultivo(g.cultivo);
      gens[k] = (gens[k] || 0) + 1;
    });
  } catch (e) { /* sin hoja de generaciones la proyeccion igual sirve */ }

  var redondo = function (n, d) { var f = Math.pow(10, d); return Math.round(n * f) / f; };
  var plan = (cfg.plan || []).map(function (p) {
    var sup = Number(p.superficie_m2) || 0;
    var rinde = Number(p.rinde_kg_m2) || 0;
    return {
      cultivo: p.cultivo,
      superficie_m2: redondo(sup, 2),
      bancales: m2Bancal ? redondo(sup / m2Bancal, 2) : 0,
      rinde_kg_m2: rinde,
      kg: Number(p.cosecha_esperada_kg) || Math.round(sup * rinde),
      generaciones: gens[claveCultivo(p.cultivo)] || 0,
    };
  });

  return {
    ok: true, api: 1,
    chacra: chacra, nombre: cfg.nombre || chacra,
    temporada: (cfg.temporada || {}).nombre || "",
    bancal_m2: m2Bancal,
    plan: plan,
    actualizado: new Date().toISOString(),
  };
}

// Se cachea unos minutos: los numeros cambian cuando se importan horas o se
// registra un pago, no a cada rato, y asi seis telefonos abriendo la seccion no
// son seis viajes a Bioma.
function traerCuentasDeBioma(chacra, forzar) {
  var url = urlCuentasDe(chacra);
  if (!url) return null;
  var cache = CacheService.getScriptCache();
  var llave = "cuentas_" + chacra;
  // Al corregir algo en Bioma se quiere ver el efecto ya, no dentro de diez
  // minutos. Forzar es solo para la administracion: si cualquiera pudiera, seis
  // telefonos abriendo la seccion serian seis viajes y la cache no serviria.
  var guardado = forzar ? null : cache.get(llave);
  if (guardado) return JSON.parse(guardado);

  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  var datos = JSON.parse(r.getContentText());
  // Si no viene "api", la respuesta no es del contrato que conocemos.
  if (!datos || datos.api !== 1) {
    throw new Error(datos && datos.error ? datos.error : "Respuesta inesperada de Bioma.");
  }
  cache.put(llave, JSON.stringify(datos), 600);
  return datos;
}

// Lo que ve este telefono. Devuelve siempre la cuenta propia; las demas solo si
// la persona esta habilitada.
function cuentasParaElTelefono(chacra, persona, forzar) {
  var datos = traerCuentasDeBioma(chacra, forzar);
  if (!datos) return { ok: false, error: "Esta chacra no tiene cuentas de sueldos." };

  var todo = puedeVerTodasLasCuentas(chacra, persona);
  var mios = (datos.trabajadores || []).filter(function (t) {
    return claveNombre(t.nombre) === claveNombre(persona);
  });

  return {
    ok: true,
    api: datos.api,
    actualizado: datos.actualizado,
    moneda: datos.moneda || "ARS",
    yo: persona,
    ve_todo: todo,
    trabajadores: todo ? (datos.trabajadores || []) : mios,
    // Los totales del proyecto y los pagos sin dueño son del colectivo: solo
    // los ve quien puede ver todo. Al lado de una sola cuenta confundirian.
    totales: todo ? datos.totales : null,
    pagos_sin_persona: todo ? (datos.pagosSinPersona || []) : null,
    // Va en el mismo viaje para no hacer dos pedidos desde un celular con mala
    // señal, pero en su propio try: si la economia falla, las cuentas se ven.
    economia: (function () {
      try { return economiaParaElTelefono(chacra, persona, forzar); }
      catch (e) { return { error: String(e) }; }
    })(),
  };
}

// Se ejecuta A MANO desde el editor, una sola vez, para dos cosas:
//
// 1. Autorizar el permiso de pedidos externos. El script nunca habia llamado a
//    una URL de afuera, y Apps Script no deja hacerlo hasta que alguien aprueba
//    el permiso en el editor. Sin esto la seccion Cuentas responde
//    "No cuentas con el permiso para llamar a UrlFetchApp.fetch".
//
// 2. Avisar si los nombres de Bioma coinciden con las personas registradas en
//    AMA. Es la unica llave que une las dos cosas: si un telefono figura
//    como "Lucas" y en las horas dice "Luqui", esa persona abre Cuentas y no ve
//    nada. Mejor descubrirlo aca que en el celular de alguien.
//
// Elegir probarCuentas en la lista de funciones, Ejecutar, y mirar el registro.
function probarCuentas() {
  var chacra = CHACRA_CON_HORAS_APARTE;
  if (!urlCuentasDe(chacra)) {
    Logger.log("Falta la propiedad CUENTAS_URLS con la direccion de " + chacra + ".");
    return;
  }
  var datos = traerCuentasDeBioma(chacra);
  var nombres = (datos.trabajadores || []).map(function (t) { return t.nombre; });
  Logger.log("Bioma respondio: " + nombres.length + " cuentas, actualizado "
             + datos.actualizado);
  Logger.log("  " + nombres.join(", "));
  if (datos.totales) Logger.log("  totales: " + JSON.stringify(datos.totales));

  // Personas con telefono activo en esta chacra
  var hoja = SpreadsheetApp.openById(PLANILLA_ACCESOS_ID).getSheetByName("Dispositivos");
  var personas = [], vistos = {};
  if (hoja && hoja.getLastRow() > 1) {
    hoja.getRange(2, 1, hoja.getLastRow() - 1, DISPOSITIVOS_ENCABEZADOS.length)
        .getValues().forEach(function (f) {
      var quien = String(f[2] || "").trim();
      if (!quien) return;
      if (String(f[1]).toLowerCase() !== chacra) return;
      if (String(f[3]).toUpperCase().indexOf("S") !== 0) return;
      if (!vistos[claveNombre(quien)]) { vistos[claveNombre(quien)] = true; personas.push(quien); }
    });
  }

  var enBioma = {};
  nombres.forEach(function (n) { enBioma[claveNombre(n)] = true; });
  var sueltos = personas.filter(function (q) { return !enBioma[claveNombre(q)]; });

  Logger.log("Telefonos activos en " + chacra + ": " + personas.join(", "));
  if (sueltos.length) {
    Logger.log("OJO: estas personas tienen telefono pero no tienen cuenta en Bioma,");
    Logger.log("asi que al abrir Cuentas no van a ver nada: " + sueltos.join(", "));
    Logger.log("Se arregla igualando el nombre en la hoja Dispositivos o en la de horas.");
  } else {
    Logger.log("Todos los telefonos activos tienen su cuenta en Bioma.");
  }
}


// Nombre comparable: sin tildes ni mayusculas, para que "Luqui" encuentre su
// tarifa aunque en Config este escrito distinto. Se llama claveNombre y no
// clave porque 'clave' ya se usa como variable en varias funciones de aca.
function claveNombre(n) {
  return String(n || "").trim().toLowerCase()
    .replace(/[áàä]/g, "a").replace(/[éèë]/g, "e").replace(/[íìï]/g, "i")
    .replace(/[óòö]/g, "o").replace(/[úùü]/g, "u").replace(/ñ/g, "n");
}

// ---------- Catalogo de cultivos que aportan las chacras ----------
//
// El catalogo base (docs/catalogo.json) lo definimos nosotros y viaja con la
// app, asi que anda sin señal. Lo que se agrega desde los telefonos vive en una
// planilla aparte y se suma a ese base: un cultivo que carga Huerma queda
// disponible para todas, que es el punto de que lo carguen ellos.
//
// Propiedad del script:  PLANILLA_CATALOGO  <id de la planilla>
// Si no esta, todo sigue funcionando con el catalogo base y nada mas.
// Las dos ultimas se agregaron el 24/09 y van AL FINAL a proposito: la planilla
// ya tenia 38 cultivos cargados, y meter columnas en el medio habria corrido de
// lugar todos los datos que ya estaban.
//
// "Dias en almacigo" sigue siendo el valor unico de siempre, y es el respaldo
// de los cultivos que no tengan los estacionales.
var CATALOGO_ENCABEZADOS = [
  "Cultivo", "Tipo de siembra", "Días en almácigo", "Días de trasplante a cosecha",
  "Días a cosecha", "Días en cosecha", "Líneas por bancal", "Distancia cm",
  "Rinde kg/m²", "Agregado por", "Chacra", "Fecha", "Observaciones",
  "Almácigo otoño-invierno", "Almácigo primavera-verano"];

function idCatalogo() {
  try {
    return PropertiesService.getScriptProperties().getProperty("PLANILLA_CATALOGO") || "";
  } catch (e) { return ""; }
}

function hojaCatalogo() {
  var id = idCatalogo();
  if (!id) return null;
  return hojaSuelta(id, "Cultivos", CATALOGO_ENCABEZADOS);
}

// Los cultivos aportados, con su perfil. Se cachea: cambian muy de vez en
// cuando y los piden todos los telefonos al arrancar.
function cultivosAgregados(forzar) {
  var cache = CacheService.getScriptCache();
  if (!forzar) {
    var guardado = cache.get("catalogo_aportado");
    if (guardado) return JSON.parse(guardado);
  }
  var hoja = hojaCatalogo();
  var salida = { cultivos: [], perfiles: {} };
  if (hoja && hoja.getLastRow() > 1) {
    var filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, CATALOGO_ENCABEZADOS.length)
                    .getValues();
    filas.forEach(function (f) {
      var nombre = String(f[0] || "").trim();
      if (!nombre) return;
      // Si el mismo cultivo se cargo dos veces, vale el ultimo: alguien lo
      // corrigio. Se compara sin tildes para que "Ají" y "Aji" no convivan.
      salida.perfiles[nombre] = {
        tipo_siembra: String(f[1] || ""),
        dias_almacigo: Number(f[2]) || 0,
        dias_trasplante_cosecha: Number(f[3]) || 0,
        dias_a_cosecha: Number(f[4]) || 0,
        dias_en_cosecha: Number(f[5]) || 0,
        lineas_bancal: Number(f[6]) || 0,
        distancia_cm: Number(f[7]) || 0,
        rinde_ref_kg_m2: Number(f[8]) || 0,
        aportado_por: String(f[9] || ""),
        chacra: String(f[10] || ""),
        dias_almacigo_oi: Number(f[13]) || 0,
        dias_almacigo_pv: Number(f[14]) || 0,
      };
    });
    var vistos = {};
    Object.keys(salida.perfiles).forEach(function (n) {
      var k = claveCultivo(n);
      if (!vistos[k]) { vistos[k] = true; salida.cultivos.push(n); }
    });
    salida.cultivos.sort();
  }
  cache.put("catalogo_aportado", JSON.stringify(salida), 600);
  return salida;
}

// Alta de un cultivo desde la app. Se rechaza el repetido antes de escribirlo:
// dos filas del mismo cultivo con datos distintos serian dos verdades.
function guardarCultivo(chacra, r, esAdministrador) {
  var hoja = hojaCatalogo();
  if (!hoja) throw new Error("Falta la propiedad PLANILLA_CATALOGO.");
  var d = r.datos || {};
  var nombre = String(d.cultivo || "").trim();
  if (!nombre) return;

  // Si el cultivo ya esta, se completa en su lugar en vez de agregar otra fila,
  // pero SOLO si estaba sin datos. Los cinco que entraron con el catalogo base
  // (cilantro, pepino, pepinillo, aji, mizuna) existen sin un solo numero, y
  // quien los cultiva tiene que poder llenarlos desde el telefono.
  //
  // Un cultivo con datos NO se sobreescribe: dos chacras discutiendo el marco
  // de plantacion desde sus celulares, sin que nadie vea el cambio, es peor que
  // no poder corregirlo. Esas correcciones van a mano en la planilla.
  var filaExistente = 0;
  if (hoja.getLastRow() > 1) {
    var ya = hoja.getRange(2, 1, hoja.getLastRow() - 1, CATALOGO_ENCABEZADOS.length)
                 .getValues();
    for (var i = 0; i < ya.length; i++) {
      if (claveCultivo(ya[i][0]) !== claveCultivo(nombre)) continue;
      // Columnas 5 a 9: dias a cosecha, dias en cosecha, lineas, distancia, rinde
      var tieneDatos = false;
      for (var c = 4; c <= 8; c++) if (Number(ya[i][c]) > 0) tieneDatos = true;
      // La clave de administracion si puede corregir: la regla es para que dos
      // chacras no se pisen el marco de plantacion desde el celular, no para
      // trabar a quien mantiene el catalogo desde las herramientas.
      if (tieneDatos && !esAdministrador) return;
      filaExistente = i + 2;
      // Se conserva como estaba escrito en el catalogo. Si alguien tipea
      // "cilantro" para completarlo, no tiene por que renombrarlo en minuscula
      // para las seis chacras.
      nombre = String(ya[i][0]).trim();
      break;
    }
  }

  var fila = [
    nombre, String(d.tipo_siembra || ""), d.dias_almacigo || "",
    d.dias_trasplante_cosecha || "", d.dias_a_cosecha || "", d.dias_en_cosecha || "",
    d.lineas_bancal || "", d.distancia_cm || "", d.rinde_ref_kg_m2 || "",
    r.dispositivo || "", String(d.origen || chacra), new Date(),
    String(d.observaciones || ""),
    d.dias_almacigo_oi || "", d.dias_almacigo_pv || "",
  ];
  if (filaExistente) {
    hoja.getRange(filaExistente, 1, 1, CATALOGO_ENCABEZADOS.length).setValues([fila]);
    CacheService.getScriptCache().remove("catalogo_aportado");
    return;
  }
  // El origen marca de donde salio: una chacra, o el catalogo base que venia de
  // la app vieja. Sin eso, los 38 originales figurarian como aportados por
  // Chacra Tica, que no es lo que paso.
  hoja.appendRow(fila);
  CacheService.getScriptCache().remove("catalogo_aportado");
}

// ---------- Diagnostico de las fechas de Registro Horas ----------
//
// En las cuentas de Bioma, julio de Marto daba 32 h cuando el registro tiene
// 45,5. Agosto y septiembre cerraban exactos. Como la columna Fecha se muestra
// sin año en muchas filas ("15/7"), desde afuera no se puede saber que hay
// adentro de la celda. Esto lo dice: si es texto o fecha, y de que año.
function diagnosticoFechas() {
  var bioma = SpreadsheetApp.openById(PLANILLA_HORAS_TICA);
  var hoja = bioma.getSheetByName("Registro Horas");
  if (!hoja) return { ok: false, error: "No encontre 'Registro Horas'." };

  var datos = hoja.getDataRange().getValues();
  var iCab = -1, iFecha = -1, iQuien = -1, iHoras = -1;
  for (var i = 0; i < Math.min(datos.length, 10) && iCab < 0; i++) {
    for (var j = 0; j < datos[i].length; j++) {
      var c = String(datos[i][j]).trim().toLowerCase();
      if (c === "fecha") { iCab = i; iFecha = j; }
      if (c === "trabajador") iQuien = j;
      if (c === "horas") iHoras = j;
    }
  }
  if (iCab < 0) return { ok: false, error: "No encontre la fila de encabezados." };

  var porAnio = {}, textos = [], horasPorAnio = {};
  for (var k = iCab + 1; k < datos.length; k++) {
    var v = datos[k][iFecha];
    var h = Number(datos[k][iHoras]) || 0;
    if (!datos[k][iQuien] && !h) continue;
    if (v instanceof Date) {
      var a = v.getFullYear() + "-" + ("0" + (v.getMonth() + 1)).slice(-2);
      porAnio[a] = (porAnio[a] || 0) + 1;
      horasPorAnio[a] = (horasPorAnio[a] || 0) + h;
    } else {
      porAnio["TEXTO"] = (porAnio["TEXTO"] || 0) + 1;
      horasPorAnio["TEXTO"] = (horasPorAnio["TEXTO"] || 0) + h;
      if (textos.length < 12) {
        textos.push({ fila: k + 1, valor: String(v), quien: String(datos[k][iQuien]), horas: h });
      }
    }
  }
  return { ok: true, filas_por_mes: porAnio, horas_por_mes: horasPorAnio,
           ejemplos_de_texto: textos };
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
