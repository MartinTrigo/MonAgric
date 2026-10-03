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
      <div class="cuando">sembrado el ${fechaCorta(s.fecha)}${s.plantines ? ` · ${num(s.plantines)} plantines` : ""}${
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
    <p class="nota">Los almácigos que esperan, según sus días en bandeja: es una
    guía, manda lo que se ve en la bandeja. Tocá uno y el formulario se completa
    con el plan —bancales, marco, generación—.</p>
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
