// js/pendientes.js    — AMA Producción
//
// Lo que el plan dice que toca hacer: siembras y trasplantes pendientes, la
// tarjeta de Inicio y las listas desplegables que completan los formularios.
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos. Se partió app.js el 30/09/2026 sin cambiar código.

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
    estimado: f["Trasplante estimado"] || "", origen: f.Origen || "",
  }));
  const locales = pendientes.concat(enviados)
    .filter((r) => r.tipo === "siembras")
    .map((r) => ({
      id: String(r.id), cultivo: r.datos.cultivo, variedad: r.datos.variedad || "",
      generacion: Number(r.datos.generacion) || 1, tipo: r.datos.tipo,
      plantines: Number(r.datos.plantines) || 0, fecha: r.datos.fecha,
      estimado: r.datos.trasplante_estimado || "", origen: r.datos.origen || "",
    }));

  const vistos = new Set();
  const lista = [...locales, ...deLaPlanilla]
    .filter((s) => /almácigo|almacigo/i.test(s.tipo || ""))
    .filter((s) => !yaHechos.has(s.id))
    .filter((s) => (vistos.has(s.id) ? false : vistos.add(s.id)))
    // Cuándo va al bancal: la siembra real más los días en bandeja del plan
    // (ver trasplantePrevisto), no lo que se estimó el día que se cargó.
    .map((s) => Object.assign(s, { objetivo: trasplantePrevisto(s) }))
    // Primero lo que hace más tiempo que espera: es lo que corre riesgo de
    // pasarse de punto en la bandeja.
    .sort((a, b) => String(a.objetivo || a.fecha).localeCompare(String(b.objetivo || b.fecha)))
    .map((s) => Object.assign(s, { etiqueta: etiquetaAlmacigo(s) }));
  // De dónde salió la lista, para que se vea en pantalla. Cuando faltaba un
  // almácigo de agosto no había ningún error: simplemente no estaba, y desde
  // afuera no se podía saber si el teléfono hablaba con el servicio o se había
  // quedado con las últimas siembras.
  lista.completa = hayRespuesta;
  lista.yaTrasplantados = yaHechos.size;
  return lista;
}

/* La generación del plan a la que pertenece una siembra: la que el servicio
   cruzó con ella o, si no, la del mismo cultivo y número (la generación que
   anotó quien sembró manda, igual que en el servidor). Si se partió en varias
   partes, la primera que va a campo. */
function generacionDeSiembra(cultivo, generacion, id = "") {
  const k = claveArea(cultivo);
  const mismas = (leer(LS.generaciones, []) || [])
    .filter((g) => claveArea(g.cultivo) === k && Number(g.generacion) === Number(generacion));
  return mismas.find((g) => id && g.siembra_id === id && g.fecha_campo)
    || mismas.filter((g) => g.fecha_campo)
         .sort((a, b) => String(a.fecha_campo).localeCompare(String(b.fecha_campo)))[0]
    || null;
}

/* ---- Planificado, real y previsto ----
   Cada etapa de una generación tiene tres fechas (decidido con Martín, 03/10):
   - PLANIFICADA: la del plan (Plan generaciones). Se mueve libremente
     mientras la etapa no se hizo; después queda como línea de base, y además
     se congela en el registro (columna "Fecha planificada").
   - REAL: la registrada en Siembras o Trasplantes. Solo cambia con Corregir.
   - PREVISTA: para lo que falta, la última fecha real más los días teóricos.
     La calcula la app; nadie la escribe.
   Los días teóricos de lo ya sembrado son los del CATÁLOGO para la estación
   de la siembra real (09/10; antes, los del plan de esa generación: ver
   diasBandejaPrevistos). Lo planificado sigue usando los días del plan. */
function diasBandejaDe(cultivo, g, fechaSiembra) {
  const delPlan = g && g.fecha_almacigo && g.fecha_campo ? diasEntre(g.fecha_almacigo, g.fecha_campo) : 0;
  return delPlan > 0 ? delPlan : diasAlmacigo(cultivo, fechaSiembra || g?.fecha_almacigo);
}

/* Los días en bandeja de lo que YA SE SEMBRÓ (09/10, decidido con Martín):
   los del CATÁLOGO para la estación de la siembra real, no los del plan.
   El plan es lo que se pensó al planificar y queda como línea de base; el
   catálogo es lo que hoy se sabe del cultivo, y corregirlo (planilla «AMA -
   Catálogo de cultivos») tiene que mover todo lo que está en bandeja. Pasó
   con la coliflor: plan de 35 días, la G1 tardó 41 y la G2 pedía trasplante
   antes de estar lista. Si el catálogo no tiene el dato, el del plan. */
function diasBandejaPrevistos(cultivo, g, fechaSiembra) {
  return diasAlmacigo(cultivo, fechaSiembra) || diasBandejaDe(cultivo, g, fechaSiembra);
}

/* Cuándo va al bancal un almácigo ya sembrado:
   - Encargado o comprado: el día que llega listo (columna "Trasplante
     estimado"). Su fecha de siembra es teórica, y contarle días de catálogo
     lo daría por atrasado (la berenjena "atrasada 31 días" del 03/10).
   - Propio: la siembra real más los días de catálogo de esa estación.
   La columna "Trasplante estimado" de un propio es una foto del día en que
   se cargó: queda solo de respaldo si no hay con qué calcular. */
function previstoDesdeSiembra(cultivo, g, fecha, origen, estimado) {
  if (!esPropio(origen) && estimado) return aFechaISO(estimado);
  const dias = fecha ? diasBandejaPrevistos(cultivo, g, fecha) : 0;
  return (dias && sumarDias(fecha, dias)) || aFechaISO(estimado) || "";
}

function trasplantePrevisto(s) {
  const g = generacionDeSiembra(s.cultivo, s.generacion, s.id);
  return previstoDesdeSiembra(s.cultivo, g, s.fecha, s.origen, s.estimado);
}

/* La siembra que espera en bandeja de una generación del plan, para saber
   su origen y su llegada: la lista del servicio o, si recién se cargó, la
   cola de este teléfono. */
function almacigoDeGeneracion(g) {
  const id = String(g.siembra_id || "");
  if (!id) return {};
  const f = (leer(LS.almacigos, []) || []).find((x) => String(x.Id) === id);
  if (f) return { origen: f.Origen || "", estimado: f["Trasplante estimado"] || "" };
  const r = pendientes.concat(enviados).find((x) => x.tipo === "siembras" && String(x.id) === id);
  return r ? { origen: r.datos.origen || "", estimado: r.datos.trasplante_estimado || "" } : {};
}

/* Cuándo se trasplantó de verdad una generación. Lo manda el servicio
   (trasplantada_el); mientras no llegue —un trasplante recién cargado, o un
   servicio anterior— se busca en lo que este teléfono tiene: la cola y los
   últimos trasplantes. Vale el primer día: es cuando empezó a ocupar campo. */
function trasplantadaEl(g) {
  if (g.trasplantada_el) return g.trasplantada_el;
  const k = claveArea(g.cultivo);
  const esDeEsta = (siembra, cultivo, gen) => (g.siembra_id && siembra === g.siembra_id)
    || (claveArea(cultivo) === k && Number(gen) === Number(g.generacion));
  const fechas = [
    ...pendientes.concat(enviados).filter((r) => r.tipo === "trasplantes"
      && esDeEsta(r.datos.siembra_id, r.datos.cultivo, r.datos.generacion)).map((r) => r.datos.fecha),
    ...((leer(LS.ultimos, {}) || {}).trasplantes || []).filter((f) =>
      esDeEsta(String(f["Siembra origen"] || ""), f.Cultivo, f["Generación"])).map((f) => aFechaISO(f.Fecha)),
  ].filter(Boolean).sort();
  return fechas[0] || "";
}

// Diferencia en días, con signo y escrita para leerla de un vistazo.
const textoDiferencia = (d) => (d === null || d === undefined || d === "" ? ""
  : d === 0 ? "justo a tiempo" : `${d > 0 ? "+" : "−"}${Math.abs(d)} día${Math.abs(d) === 1 ? "" : "s"}`);

// Cuánto le falta o hace cuánto se pasó, según el plan (o lo estimado). Es lo
// que convierte la lista en una sugerencia y no en un archivo: se ve de un
// vistazo qué hay que sacar de la bandeja esta semana.
function estadoAlmacigo(s) {
  const cuando = s.objetivo ?? s.estimado;
  const dias = diasEntre(hoy(), cuando);
  if (dias === null) return { texto: "sin fecha estimada", orden: 3, dias: null };
  if (dias < 0) return { texto: `atrasado ${Math.abs(dias)} días`, orden: 0, dias };
  if (dias === 0) return { texto: "es hoy", orden: 0, dias };
  if (dias <= DIAS_AVISO) return { texto: `en ${dias} días`, orden: 1, dias };
  return { texto: `para ${fechaCorta(cuando)}`, orden: 2, dias };
}

function etiquetaAlmacigo(s) {
  const partes = [s.cultivo];
  if (s.variedad) partes.push(s.variedad);
  partes.push(`G${s.generacion}`);
  if (s.plantines) partes.push(`${num(s.plantines)} plantines`);
  return `${partes.join(" ")} · ${estadoAlmacigo(s).texto}`;
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

// ---- Lo que el plan dice que toca hacer ----
// La planificación y la carga de datos eran dos mundos: el plan se miraba en
// Heirloom y en AMA se anotaba. Ahora el plan dice qué toca, y tocarlo deja el
// formulario completo con lo que ya se sabe —cultivo, variedad, generación,
// bandejas, bancales, marco—. Quien carga solo confirma o corrige.
let abiertoParaSembrar = false;
let abiertoParaTrasplantar = false;

// Cuántas plantas pide el plan para esa cantidad de bancales, y en cuántas
// bandejas entran. Sin esta cuenta había que salir a buscar el marco de
// plantación y hacerla a mano antes de sembrar.
function bandejasDelPlan(cultivo, bancales, alveolos, sector = "") {
  const plan = enPlan(cultivo) || {};
  const p = perfil(cultivo) || {};
  const lineas = plan.lineas || p.lineas_bancal || 0;
  const distancia = plan.distancia_cm || p.distancia_cm || 0;
  const plantas = plantasDe({ bancales, lineas, distancia_cm: distancia, sector });
  if (!plantas || !alveolos) return null;
  return { plantas, lineas, distancia, bancales, alveolos,
           bandejas: Math.ceil(plantas / alveolos) };
}

// La última variedad que se sembró de un cultivo: si el plan no la dice, es
// la mejor apuesta.
function ultimaVariedad(cultivo) {
  const k = claveArea(cultivo);
  const locales = pendientes.concat(enviados)
    .filter((r) => r.tipo === "siembras" && claveArea(r.datos.cultivo) === k && r.datos.variedad)
    .map((r) => r.datos.variedad);
  if (locales.length) return locales[0];
  const fila = (leer(LS.ultimos, {}).siembras || [])
    .find((f) => claveArea(f.Cultivo) === k && f.Variedad);
  return fila ? fila.Variedad : "";
}

// "G3", "G2 a G4" si son seguidas, o "G2, G3, G4 y G6" si falta alguna: "G2 a
// G6" hacía creer que la G5 también estaba en el grupo.
function etiquetaGeneraciones(gs) {
  const o = [...gs].sort((a, b) => a - b);
  if (o.length === 1) return `G${o[0]}`;
  const seguidas = o.every((n, i) => i === 0 || n === o[i - 1] + 1);
  const texto = seguidas ? `G${o[0]} a G${o[o.length - 1]}`
    : `${o.slice(0, -1).map((n) => `G${n}`).join(", ")} y G${o[o.length - 1]}`;
  return `${texto} <small>(${o.length} juntas)</small>`;
}

const cuandoTexto = (d) => (d === 0 ? "hoy"
  : d < 0 ? `atrasada ${Math.abs(d)} día${Math.abs(d) === 1 ? "" : "s"}`
  : `en ${d} día${d === 1 ? "" : "s"}`);

// Inicio: solo cuántas hay y un botón a cada lista. Las listas viven en su
// sección, al lado del formulario donde se cargan.
function tarjetaParaHacer() {
  const siembras = siembrasAgrupadas();
  const almacigos = almacigosPendientes()
    .filter((s) => { const d = estadoAlmacigo(s).dias; return d !== null && d <= DIAS_AVISO; });
  if (!siembras.length && !almacigos.length) return "";
  const atrasadas = siembras.filter((g) => g.cuando < hoy()).length;
  const listos = almacigos.filter((s) => (estadoAlmacigo(s).dias ?? 99) <= 0).length;
  return `<div class="tarjeta para-hacer">
    <h2>Para hacer <small>según el plan</small></h2>
    <div class="para-hacer-botones">
      ${siembras.length ? `<button type="button" class="secundario" data-ir-pendientes="siembras">
        &#127793; ${siembras.length} para sembrar${atrasadas ? ` <span class="etiqueta alerta">${atrasadas} atrasada${atrasadas === 1 ? "" : "s"}</span>` : ""}
      </button>` : ""}
      ${almacigos.length ? `<button type="button" class="secundario" data-ir-pendientes="trasplantes">
        &#127807; ${almacigos.length} para trasplantar${listos ? ` <span class="etiqueta alerta">${listos} listo${listos === 1 ? "" : "s"}</span>` : ""}
      </button>` : ""}
    </div>
  </div>`;
}

function tarjetaParaSembrar() {
  const pend = siembrasAgrupadas();
  if (!pend.length) return "";
  const atrasadas = pend.filter((g) => g.cuando < hoy()).length;
  const semana = pend.filter((g) => g.cuando >= hoy() && diasEntre(hoy(), g.cuando) <= 7).length;
  return `<details class="tarjeta desplegable" id="lista-para-sembrar"${abiertoParaSembrar ? " open" : ""}>
    <summary>
      <h2>&#127793; Para sembrar <small>${pend.length}</small></h2>
      <span class="desplegable-resumen">${
        atrasadas ? `<span class="etiqueta alerta">${atrasadas} atrasada${atrasadas === 1 ? "" : "s"}</span>` : ""}${
        semana ? `<span class="etiqueta ok">${semana} esta semana</span>` : ""}</span>
    </summary>
    <p class="nota">Del plan de la temporada. Tocá una y el formulario se completa
    con lo que dice el plan: revisá, cambiá lo que haga falta y guardá.</p>
    ${pend.map((g) => {
      const d = diasEntre(hoy(), g.cuando);
      const b = g.fecha_almacigo ? bandejasDelPlan(g.cultivo, g.camasTotal || 1, 128, g.sector) : null;
      const etiqueta = etiquetaGeneraciones(g.generaciones);
      return `<div class="registro abre-siembra" role="button" tabindex="0"
                   data-sembrar="${esc(JSON.stringify({ cultivo: g.cultivo, cuando: g.cuando }))}">
        <div>
          <div class="detalle">${esc(g.cultivo)}${g.variedad ? ` <span class="gen">${esc(g.variedad)}</span>` : ""}
            <span class="gen">${etiqueta}</span></div>
          <div class="cuando">${g.fecha_almacigo ? "en bandeja" : "siembra directa"}${
            g.camasTotal ? ` · ${num(g.camasTotal, 1)} bancal(es)` : ""}${
            b ? ` · ${b.bandejas} bandeja${b.bandejas === 1 ? "" : "s"}` : ""}${
            g.sector ? ` · ${esc(g.sector)}` : ""} · ${fechaCorta(g.cuando)}</div>
        </div>
        <span class="etiqueta ${d < 0 ? "alerta" : "ok"}">${cuandoTexto(d)}</span>
      </div>`;
    }).join("")}
  </details>`;
}

function tarjetaParaTrasplantar(pend, listos, pronto) {
  if (!pend.length) return "";
  const despues = pend.filter((s) => !listos.includes(s) && !pronto.includes(s));
  const fila = (s, alerta) => `<div class="registro abre-trasplante" role="button" tabindex="0"
      data-trasplantar="${esc(s.id)}">
    <div><div class="detalle">${esc(s.cultivo)}${s.variedad ? ` <span class="gen">${esc(s.variedad)}</span>` : ""}
      <span class="gen">G${s.generacion}</span></div>
      <div class="cuando">${esPropio(s.origen)
          ? `sembrado el ${fechaCorta(s.fecha)}${
              diasEntre(s.fecha, hoy()) > 0 ? ` <small>(${diasEntre(s.fecha, hoy())} días en bandeja)</small>` : ""}`
          : `${esc(String(s.origen).toLowerCase())}, llega listo`}${
        s.plantines ? ` · ${num(s.plantines)} plantines` : ""}${
        (() => {
          const bs = bancalesPlanificados(s.cultivo, s.generacion);
          return bs.length ? ` · ${esc(bs[0].sector)} ${bs.map((x) => x.bancal).join(", ")}` : "";
        })()}</div></div>
    <span class="etiqueta ${alerta ? "alerta" : "ok"}">${esc(estadoAlmacigo(s).texto)}</span>
  </div>`;
  return `<details class="tarjeta desplegable" id="lista-para-trasplantar"${abiertoParaTrasplantar ? " open" : ""}>
    <summary>
      <h2>&#127807; Para trasplantar <small>${pend.length}</small></h2>
      <span class="desplegable-resumen">${
        listos.length ? `<span class="etiqueta alerta">${listos.length} listo${listos.length === 1 ? "" : "s"}</span>` : ""}${
        pronto.length ? `<span class="etiqueta ok">${pronto.length} esta semana</span>` : ""}</span>
    </summary>
    <p class="nota">Los almácigos que esperan. La fecha es la siembra más los
    días en bandeja que les dio el plan (si no están en el plan, los del
    catálogo). Es una guía: manda lo que se ve en la bandeja. Tocá uno y el
    formulario se completa con el plan —bancales, marco, generación—.</p>
    ${listos.map((s) => fila(s, true)).join("")}
    ${pronto.map((s) => fila(s, false)).join("")}
    ${despues.map((s) => fila(s, false)).join("")}
  </details>`;
}

// Dónde puso el plan a una generación: sector y bancales, uno por renglón.
// Si se partió en varias partes, se juntan todas: son la misma siembra.
function bancalesPlanificados(cultivo, generacion) {
  const k = claveArea(cultivo);
  const out = [];
  (leer(LS.generaciones, []) || [])
    .filter((g) => claveArea(g.cultivo) === k && Number(g.generacion) === Number(generacion) && g.sector)
    .forEach((g) => bancalesDe(g).forEach((b) => out.push({ sector: g.sector, bancal: b })));
  return out;
}
