// js/registros.js     — AMA Producción
//
// Últimos movimientos de cada sección, y corregir o borrar lo ya cargado.
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos. Se partió app.js el 30/09/2026 sin cambiar código.

// Cada sección muestra lo último que cargó TODO el equipo, no solo este
// teléfono: primero lo que está esperando enviarse de acá, después lo que ya
// está en la planilla. Para el detalle completo está la planilla.
function historialDe(tipo) {
  const delEquipo = (leer(LS.ultimos, {})[tipo] || []).slice(0, 15);
  const yaEnLaPlanilla = new Set(delEquipo.map((f) => String(f.Id)));

  // Lo cargado en este teléfono que todavía no figura en la lista de la chacra:
  // sea porque falta enviarlo o porque recién se envió y la planilla aún no lo
  // devolvió. Si no, el registro parecía desaparecer apenas se guardaba.
  // Las horas de Tica vuelven de la planilla de Bioma con otro id (su marca
  // temporal): de las locales se muestran solo las que todavía no salieron.
  const soloPorEnviar = tipo === "horas" && horasVanAparte();
  const locales = (soloPorEnviar ? pendientes : pendientes.concat(enviados))
    .filter((r) => r.tipo === tipo && !yaEnLaPlanilla.has(String(r.id)))
    .slice(0, 5);

  const cuerpo = locales.length || delEquipo.length
    ? locales.map(filaRegistro).join("") + delEquipo.map((f) => filaEquipo(tipo, f)).join("")
    : `<p class="nota">Todavía no hay registros cargados.</p>`;

  return `<div class="tarjeta" id="historial-${tipo}">
    <h2>Últimos movimientos <small>de la chacra</small></h2>
    ${CFG?.corregir && delEquipo.length ? `<p class="nota">✎ corrige un registro y 🗑 lo borra.
      Lo que se cambia queda copiado, como estaba, en la hoja «Cambios» de la planilla.</p>` : ""}
    ${cuerpo}
    ${tipo === "horas" && horasVanAparte()
      // Las horas de Tica viven en la planilla de horas de Bioma: la hoja
      // Horas de la chacra es solo una copia que se rehace una vez por día.
      ? `<a class="enlace-planilla" href="${esc(PLANILLA_HORAS_BIOMA)}" target="_blank" rel="noopener">
          Ver todo en la planilla de horas</a>`
      : `<a class="enlace-planilla" href="${esc(enlacePlanilla())}" target="_blank" rel="noopener">
          Ver todo en la planilla</a>`}
  </div>`;
}

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
  const clave = `${tipo}|${f.Id}`;
  const corregible = CFG?.corregir && f.Id && CORRECCION[tipo];
  return `<div class="registro${registroEditando === clave ? " editando" : ""}">
    <div><div class="detalle">${detalle}</div>
      <div class="cuando">${fechaCorta(f.Fecha)}${extra ? " · " + extra : ""}</div></div>
    ${corregible ? `<button type="button" class="quitar editar" data-corregir="${esc(clave)}"
        aria-label="Corregir" title="Corregir">✎</button>
      <button type="button" class="quitar" data-borrar-registro="${esc(clave)}"
        aria-label="Borrar" title="Borrar">🗑</button>` : ""}
  </div>
  ${corregible && registroEditando === clave ? formularioCorreccion(tipo, f) : ""}`;
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

  // Lo que todavía no salió se puede sacar de la cola: un error se arregla
  // antes de que llegue a la planilla.
  const cancelable = esperando && pendientes.some((x) => x.id === r.id)
    && ["siembras", "trasplantes", "cosechas", "horas"].includes(r.tipo);
  return `<div class="registro">
    <div><div class="detalle">${[titulo, detalle].filter(Boolean).join(" — ")}</div>
      <div class="cuando">${fechaCorta(d.fecha || d.hecha_el || "")}</div></div>
    <span class="etiqueta ${esperando ? "espera" : "ok"}">${esperando ? "Por enviar" : "Enviado"}</span>
    ${cancelable ? `<button type="button" class="quitar" data-cancelar-registro="${esc(r.id)}"
      aria-label="No enviar" title="Sacarlo de la cola: no se envía">&times;</button>` : ""}
  </div>`;
}

// ---- Corregir o borrar lo ya cargado ----
// Antes, un error de carga se arreglaba abriendo la planilla. Ahora desde la
// misma lista de "últimos movimientos". El servicio rearma la fila con la
// misma receta que al cargarla y deja copia de cómo estaba en la hoja Cambios.
let registroEditando = "";   // "tipo|id"

// Qué se puede corregir de cada tipo: [dato, rótulo, clase de campo].
const CORRECCION = {
  siembras: [["fecha", "Fecha", "fecha"], ["cultivo", "Cultivo", "cultivo"],
    ["variedad", "Variedad", "texto"], ["generacion", "Generación", "numero"],
    ["tipo", "Tipo", "tipoSiembra"], ["origen", "Plantines", "origen"],
    ["bandejas", "Bandejas o cajones", "numero"],
    ["tipo_bandeja", "Alvéolos", "alveolos"], ["plantines", "Plantines (solo cajón)", "numero"],
    ["sector", "Sector (directa)", "sector"],
    ["bancal", "Bancal (directa)", "numero"], ["operador", "Operador", "persona"],
    ["observaciones", "Observaciones", "texto"]],
  trasplantes: [["fecha", "Fecha", "fecha"], ["cultivo", "Cultivo", "cultivo"],
    ["variedad", "Variedad", "texto"], ["generacion", "Generación", "numero"],
    ["sector", "Sector", "sector"], ["bancal", "Bancal", "numero"],
    ["lineas", "Líneas", "numero"], ["distancia_cm", "Distancia (cm)", "numero"],
    ["disposicion", "Disposición", "disposicion"], ["plantines", "Plantines", "numero"],
    ["operador", "Operador", "persona"], ["observaciones", "Observaciones", "texto"]],
  cosechas: [["fecha", "Fecha", "fecha"], ["cultivo", "Cultivo", "cultivo"],
    ["kg", "Kg", "numero"], ["operador", "Cosechó", "persona"]],
  horas: [["fecha", "Fecha", "fecha"], ["integrante", "Quién", "persona"],
    ["horas", "Horas", "numero"], ["area", "Área", "area"],
    ["actividad", "Actividad", "texto"], ["observaciones", "Qué se hizo", "texto"]],
};
// Todo lo que guarda la hoja de ese tipo: lo que no se corrige viaja como
// estaba, porque el servicio rearma la fila entera. Son también los nombres
// con que la app lee cada fila: ver columnasQueFaltan.
const DE_LA_HOJA = {
  siembras: { fecha: "Fecha", cultivo: "Cultivo", variedad: "Variedad", tipo: "Tipo",
    generacion: "Generación", bandejas: "Bandejas", tipo_bandeja: "Alvéolos",
    plantines: "Plantines", sector: "Sector", bancal: "Bancal",
    trasplante_estimado: "Trasplante estimado", cosecha_estimada: "Cosecha estimada",
    operador: "Operador", observaciones: "Observaciones",
    origen: "Origen", fecha_planificada: "Fecha planificada", diferencia_plan: "Diferencia plan" },
  trasplantes: { fecha: "Fecha", siembra_id: "Siembra origen", fecha_siembra: "Fecha siembra",
    dias_almacigo_real: "Días en almácigo", dias_almacigo_teorico: "Días teóricos",
    diferencia_dias: "Diferencia días", cultivo: "Cultivo", variedad: "Variedad",
    generacion: "Generación", sector: "Sector", bancal: "Bancal", lineas: "Líneas",
    distancia_cm: "Distancia cm", disposicion: "Disposición", marco: "Marco",
    plantines: "Plantines", operador: "Operador", observaciones: "Observaciones",
    fecha_planificada: "Fecha planificada", diferencia_plan: "Diferencia plan" },
  cosechas: { fecha: "Fecha", cultivo: "Cultivo", kg: "Kg", operador: "Cosechó" },
  horas: { fecha: "Fecha", integrante: "Integrante", horas: "Horas", actividad: "Actividad",
    area: "Área", observaciones: "Observaciones" },
};
const datosDeFila = (tipo, f) => Object.fromEntries(
  Object.entries(DE_LA_HOJA[tipo]).map(([k, c]) => [k, f[c] ?? ""]));

function campoCorreccion([k, rotulo, clase], v) {
  const val = v == null ? "" : String(v);
  const opciones = (lista) => {
    const todas = lista.includes(val) || !val ? lista : [val, ...lista];
    return todas.map((o) => `<option${String(o) === val ? " selected" : ""}>${esc(String(o))}</option>`).join("");
  };
  let campo;
  if (clase === "fecha") campo = `<input type="date" name="${k}" value="${esc(val.slice(0, 10))}">`;
  else if (clase === "numero") campo = `<input type="text" name="${k}" inputmode="decimal" value="${esc(val)}">`;
  else if (clase === "cultivo") campo = `<select name="${k}">${opciones(cultivosOrdenados().lista)}</select>`;
  else if (clase === "tipoSiembra") campo = `<select name="${k}">${opciones(tiposSiembra())}</select>`;
  else if (clase === "alveolos") campo = `<select name="${k}">${opciones([...tiposBandeja().map(String), CAJON])}</select>`;
  else if (clase === "origen") campo = `<select name="${k}">${opciones(ORIGENES)}</select>`;
  else if (clase === "disposicion") campo = `<select name="${k}">${opciones(DISPOSICIONES)}</select>`;
  else if (clase === "persona") campo = `<select name="${k}">${opciones(integrantes())}</select>`;
  else if (clase === "sector") campo = `<select name="${k}"><option value="">—</option>${
    sectores().map((s) => `<option${s.sector === val ? " selected" : ""}>${esc(s.sector)}</option>`).join("")}</select>`;
  else if (clase === "area") campo = `<select name="${k}">${opcionesArea(val)}</select>`;
  else campo = `<input type="text" name="${k}" value="${esc(val)}">`;
  return `<div><label>${esc(rotulo)}</label>${campo}</div>`;
}

function formularioCorreccion(tipo, f) {
  const d = datosDeFila(tipo, f);
  const campos = CORRECCION[tipo].map((c) => campoCorreccion(c, d[c[0]]));
  // De a dos por renglón, como el resto de los formularios.
  const filas = [];
  for (let i = 0; i < campos.length; i += 2) filas.push(`<div class="fila">${campos[i]}${campos[i + 1] || ""}</div>`);
  return `<form class="editar-gen" data-form-correccion="${esc(`${tipo}|${f.Id}`)}">
    ${filas.join("")}
    <div class="editar-gen-botones">
      <button class="principal">Guardar corrección</button>
      <button type="button" class="secundario" data-cancelar-correccion>Cancelar</button>
    </div>
  </form>`;
}

// Lo corregido, listo para la hoja: lo que se deduce de otros datos se vuelve
// a calcular, igual que al cargarlo.
function datosCorregidos(tipo, f, form) {
  const d = datosDeFila(tipo, f);
  CORRECCION[tipo].forEach(([k, , clase]) => {
    const v = form.elements[k] ? form.elements[k].value.trim() : d[k];
    d[k] = clase === "numero" ? (v === "" ? "" : aNumero(v)) : v;
  });
  // La diferencia con el plan se recalcula contra la fecha planificada que
  // quedó congelada al cargarlo: corregir la fecha real no mueve la base.
  const contraPlan = () => {
    const base = d.fecha_planificada ? aFechaISO(d.fecha_planificada) : "";
    d.fecha_planificada = base;
    d.diferencia_plan = base && d.fecha ? diasEntre(base, d.fecha) : "";
  };
  if (tipo === "siembras") {
    d.generacion = parseInt(d.generacion, 10) || 1;
    const conBandeja = EN_BANDEJA.has(d.tipo);
    const cajon = d.tipo_bandeja === CAJON;
    d.bandejas = conBandeja ? parseInt(d.bandejas, 10) || 0 : 0;
    d.tipo_bandeja = !conBandeja ? 0 : cajon ? CAJON : parseInt(d.tipo_bandeja, 10) || 0;
    // En un cajón los plantines se cuentan; en bandejas salen de multiplicar.
    d.plantines = !conBandeja ? 0 : cajon ? (parseInt(d.plantines, 10) || 0) : d.bandejas * d.tipo_bandeja;
    if (conBandeja) { d.sector = ""; d.bancal = ""; }
    d.origen = conBandeja ? (d.origen || "Propio") : "Propio";
    const p = perfil(d.cultivo) || {};
    const g = generacionDeSiembra(d.cultivo, d.generacion, f.Id);
    const dias = conBandeja ? diasBandejaDe(d.cultivo, g, d.fecha) : 0;
    d.trasplante_estimado = conBandeja && dias ? sumarDias(d.fecha, dias) : "";
    d.cosecha_estimada = d.trasplante_estimado && p.dias_trasplante_cosecha
      ? sumarDias(d.trasplante_estimado, p.dias_trasplante_cosecha)
      : sumarDias(d.fecha, d.tipo === "Trasplante" ? p.dias_trasplante_cosecha : p.dias_a_cosecha);
    contraPlan();
  } else if (tipo === "trasplantes") {
    d.generacion = parseInt(d.generacion, 10) || 1;
    const real = d.fecha_siembra && d.dias_almacigo_teorico !== ""
      ? diasEntre(String(d.fecha_siembra).slice(0, 10), d.fecha) : null;
    d.dias_almacigo_real = real === null ? "" : real;
    d.diferencia_dias = real === null || !d.dias_almacigo_teorico ? "" : real - Number(d.dias_almacigo_teorico);
    contraPlan();
  }
  return d;
}

/* Los encabezados viven en el servidor (HOJAS en Code.gs) y la app lee cada
   fila por esos nombres. Si alguien renombra uno allá y no acá, el dato
   desaparecía de la pantalla sin ningún error. Desde el 01/10 el servicio
   manda su esquema con la configuración, y esto compara. */
function columnasQueFaltan(esquema) {
  if (!esquema) return [];        // servicio anterior: no lo manda
  // Las columnas de plan contra real (03/10) son nuevas: contra un servicio
  // que todavía no las tiene no es un error, solo no se guardan.
  const anterior = Array.isArray(esquema.siembras) && !esquema.siembras.includes("Origen");
  const NUEVAS = new Set(["Origen", "Fecha planificada", "Diferencia plan"]);
  const faltan = [];
  Object.entries(DE_LA_HOJA).forEach(([hoja, campos]) => {
    if (!Array.isArray(esquema[hoja])) return;
    const hay = new Set(esquema[hoja]);
    ["Id", ...Object.values(campos)].forEach((c) => {
      if (!hay.has(c) && !(anterior && NUEVAS.has(c))) faltan.push(`${hoja} «${c}»`);
    });
  });
  return faltan;
}
let avisoDeColumnasDado = false;
function avisarSiFaltanColumnas(esquema) {
  const faltan = columnasQueFaltan(esquema);
  if (!faltan.length || avisoDeColumnasDado) return;
  avisoDeColumnasDado = true;
  console.warn("Columnas que la app usa y el servicio no tiene:", faltan);
  aviso(`La app y el servicio no coinciden en ${faltan.length} columna(s): ${faltan.slice(0, 2).join(", ")}. `
    + "Avisá a quien mantiene AMA.", true);
}

// La copia local de "últimos", corregida o sin la fila, para que la pantalla
// responda sin esperar a la planilla.
function tocarUltimos(tipo, id, datos) {
  const u = leer(LS.ultimos, {});
  u[tipo] = (u[tipo] || []).flatMap((f) => {
    if (String(f.Id) !== String(id)) return [f];
    if (!datos) return [];
    const nueva = { ...f };
    Object.entries(DE_LA_HOJA[tipo]).forEach(([k, c]) => { nueva[c] = datos[k]; });
    return [nueva];
  });
  escribir(LS.ultimos, u);
}

function prepararCorrecciones() {
  const buscarFila = (clave) => {
    const [tipo, ...resto] = clave.split("|");
    const id = resto.join("|");
    const f = (leer(LS.ultimos, {})[tipo] || []).find((x) => String(x.Id) === id);
    return { tipo, id, f };
  };
  document.querySelectorAll("[data-corregir]").forEach((b) => {
    b.onclick = () => {
      registroEditando = registroEditando === b.dataset.corregir ? "" : b.dataset.corregir;
      render(vistaActual, true);
    };
  });
  document.querySelectorAll("[data-cancelar-correccion]").forEach((b) => {
    b.onclick = () => { registroEditando = ""; render(vistaActual, true); };
  });
  document.querySelectorAll("[data-form-correccion]").forEach((form) => {
    form.onsubmit = (e) => {
      e.preventDefault();
      const { tipo, id, f } = buscarFila(form.dataset.formCorreccion);
      if (!f) return;
      const datos = datosCorregidos(tipo, f, form);
      if (!datos.fecha) return aviso("Falta la fecha.", true);
      guardarRegistro("registro_editar", { hoja: tipo, id, datos }, "Corrección guardada ✓");
      tocarUltimos(tipo, id, datos);
      registroEditando = "";
      render(vistaActual, true);
    };
  });
  document.querySelectorAll("[data-borrar-registro]").forEach((b) => {
    b.onclick = () => {
      const { tipo, id, f } = buscarFila(b.dataset.borrarRegistro);
      if (!f) return;
      const que = [f.Cultivo || f.Integrante, f.Fecha ? fechaCorta(f.Fecha) : ""].filter(Boolean).join(" del ");
      // Una siembra con trasplantes deja a esos trasplantes sin su origen.
      const hijos = tipo === "siembras"
        ? (leer(LS.ultimos, {}).trasplantes || []).filter((x) => String(x["Siembra origen"]) === id).length : 0;
      if (!confirm(`¿Borrar ${que}?` + (hijos ? `\nOJO: tiene ${hijos} trasplante(s) cargado(s) que salen de esta siembra.` : "")
                   + "\nQueda una copia en la hoja «Cambios» de la planilla.")) return;
      guardarRegistro("registro_borrar", { hoja: tipo, id }, "Registro borrado ✓");
      tocarUltimos(tipo, id, null);
      registroEditando = "";
      render(vistaActual, true);
    };
  });
  document.querySelectorAll("[data-cancelar-registro]").forEach((b) => {
    b.onclick = () => {
      if (!confirm("¿Sacarlo de la cola? No se va a enviar.")) return;
      pendientes = pendientes.filter((r) => r.id !== b.dataset.cancelarRegistro);
      escribir(LS.pendientes, pendientes);
      refrescarEstado();
      render(vistaActual, true);
    };
  });
}
