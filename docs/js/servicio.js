// js/servicio.js      — AMA Producción
//
// Todo lo que habla con el servidor: la cola de registros (guardarRegistro,
// sincronizar), y cada pedido de datos (traer*). Lo que llega se guarda en el
// teléfono; si cambió algo, se redibuja con redibujarConDatos.
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos. Se partió app.js el 30/09/2026 sin cambiar código.

// forzar: false lo saltea si se pidió hace menos de 20 s. Al abrir la app,
// el arranque y la primera sincronización lo pedían los dos (01/10).
async function traerCatalogo(forzar = true) {
  if (!chacraCodigo() || !tieneAcceso() || !navigator.onLine) return;
  if (!forzar && Date.now() - (pedidoReciente.catalogo || 0) < 20000) return;
  pedidoReciente.catalogo = Date.now();
  try {
    const d = await (await fetch(
      `${urlServicio()}?${conCredenciales("catalogo=1")}`)).json();
    if (d.ok && Array.isArray(d.cultivos)) {
      escribir(LS.catalogoExtra, { cultivos: d.cultivos, perfiles: d.perfiles || {} });
    }
  } catch { /* sin señal: queda lo último que se bajó */ }
}
// ---- Estado de sincronización ----
function refrescarEstado() {
  const el = $("#estado-sync");
  const ch = chacraActual();
  if (!ch) { el.textContent = "Elegí tu chacra para empezar"; return; }
  if (!tieneAcceso()) { el.textContent = `${ch.nombre} · falta activar el teléfono`; return; }
  const t = CFG?.temporada?.nombre;
  const base = t ? `${ch.nombre} · ${t}` : ch.nombre;
  if (pendientes.length) el.textContent = `${base} · ${pendientes.length} por enviar`;
  else el.textContent = `${base} · al día ✓`;
}

// ---- Envío a las planillas ----
// Todo va en un solo pedido al servicio de AMA, que reparte cada registro a
// su hoja (las horas de Tica, a la planilla de Bioma). Lo que falle queda en
// la cola.
//
// Una sola sincronización a la vez. Cada guardado pide una, y si la anterior
// no había terminado las dos mandaban la misma cola: partir una generación en
// tres viajaba seis veces (01/10). El servicio no duplicaba —reconoce cada
// registro por su id— pero era el doble de pedidos. Ahora, si hay una en
// curso, se anota que hace falta otra y corre una sola al terminar. Si una
// quedó colgada más de un minuto (una red que no contesta), no traba a las
// siguientes.
let sincronizando = null, sincronizandoDesde = 0;
let otraSincronizacion = false, otraEsSilenciosa = true;
function sincronizar(silencioso = true) {
  if (sincronizando && Date.now() - sincronizandoDesde < 60000) {
    otraSincronizacion = true;
    otraEsSilenciosa = otraEsSilenciosa && silencioso;
    return sincronizando;
  }
  sincronizandoDesde = Date.now();
  const esta = (async () => {
    let s = silencioso;
    try {
      do {
        otraSincronizacion = false;
        await sincronizarUnaVez(s);
        s = otraEsSilenciosa;
        otraEsSilenciosa = true;
      } while (otraSincronizacion);
    } finally {
      if (sincronizando === esta) sincronizando = null;
    }
  })();
  sincronizando = esta;
  return esta;
}

async function sincronizarUnaVez(silencioso) {
  if (!navigator.onLine) { refrescarEstado(); return; }
  // Sin credencial no se manda nada: queda todo en la cola del teléfono hasta
  // que se active con un código.
  if (!tieneAcceso()) { refrescarEstado(); return; }

  const enviadosAhora = [];
  const fallaron = [];

  // Una COPIA de la cola, no la cola: lo que se guarde mientras este pedido
  // está en viaje no va en él, y no puede darse por enviado al volver. Del
  // 30/09 al 01/10 fue la cola misma, y un registro guardado en ese momento
  // salía de la cola sin haber viajado.
  const otros = pendientes.slice();
  if (otros.length) {
    try {
      const resp = await fetch(urlServicio(), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign(credenciales(), { registros: otros })),
      });
      const datos = await resp.json();
      // Si el teléfono fue dado de baja, lo cargado no se pierde: queda en la
      // cola y se avisa que hay que activar de nuevo con un código.
      if (datos.sin_permiso) {
        escribir(LS.credencial, "");
        aviso(datos.error || "Este teléfono ya no tiene acceso.", true);
        refrescarEstado();
        return;
      }
      if (!datos.ok) throw new Error(datos.error || "respuesta inválida");
      // El servicio dice cuáles no pudo guardar. Esos quedan en la cola para
      // el próximo intento; borrarlos sería perderlos sin que nadie se enterara.
      const fallidos = new Set((datos.no_guardados || []).map((x) => String(x.id)));
      otros.forEach((r) => {
        if (fallidos.has(String(r.id))) fallaron.push(r);
        else enviadosAhora.push(r);
      });
      if (fallidos.size) {
        const primero = (datos.no_guardados || [])[0] || {};
        aviso(`${fallidos.size} registro(s) no se pudieron guardar. ${
          String(primero.error || "").slice(0, 80)}`, true);
      }
    } catch (e) {
      fallaron.push(...otros);
      if (!silencioso) aviso("No se pudo enviar: " + e.message, true);
    }
  }

  const tipos = new Set(enviadosAhora.map((r) => r.tipo));
  if (enviadosAhora.length) {
    // Lo recién enviado ya está en la planilla: se vuelve a pedir para que
    // aparezca en la lista de la chacra y no solo como "por enviar".
    ["siembras", "cosechas", "horas", "trasplantes", "tareas"]
      .filter((t) => tipos.has(t)).forEach((t) => traerUltimos(t, true));
    // Las generaciones tienen su propio pedido: el plan entero.
    if (tipos.has("generaciones") || tipos.has("generacion_borrar")) traerGeneraciones(true);
    // Una corrección o un borrado: se vuelve a pedir esa hoja, y si fue una
    // siembra, también lo que depende de ella (lo sembrado del plan, los
    // almácigos que esperan).
    const corregidas = new Set(enviadosAhora
      .filter((r) => r.tipo === "registro_editar" || r.tipo === "registro_borrar")
      .map((r) => r.datos.hoja));
    corregidas.forEach((h) => traerUltimos(h, true));
    if (corregidas.has("siembras") || corregidas.has("trasplantes")) {
      traerGeneraciones(true); traerAlmacigos(true);
    }
    // Un trasplante recién subido saca su almácigo de la lista de pendientes,
    // y una siembra nueva puede sumar uno: las dos cosas cambian esa lista.
    if (tipos.has("trasplantes") || tipos.has("siembras")) traerAlmacigos(true);
    const ids = new Set(enviadosAhora.map((r) => r.id));
    enviados = enviadosAhora.map((r) => ({ ...r, enviado_en: ahora() })).concat(enviados).slice(0, 60);
    pendientes = pendientes.filter((r) => !ids.has(r.id));
    escribir(LS.pendientes, pendientes);
    escribir(LS.enviados, enviados);
    if (!silencioso) aviso(`${enviadosAhora.length} registro(s) enviado(s) ✓`);
  } else if (!silencioso && fallaron.length) {
    aviso("No se pudo enviar. Revisá la señal y los Ajustes.", true);
  }

  // La configuración y el catálogo, solo si cambiaron desde acá o si hace
  // más de 20 s que no se piden.
  const cambioConfig = ["config", "config_plan", "config_sector"].some((t) => tipos.has(t));
  await Promise.all([traerResumen(), traerTareas(),
                     traerConfig(cambioConfig), traerCatalogo(tipos.has("cultivo"))]);
  refrescarEstado();
  if (["inicio", "plan", "horas", "tareas"].includes(vistaActual)) redibujarConDatos(vistaActual);
}

// Totales de toda la chacra (lo que cargaron todos los teléfonos).
async function traerResumen() {
  if (!navigator.onLine) return;
  try {
    const r = await fetch(
      `${urlServicio()}?${conCredenciales("resumen=1")}`);
    const d = await r.json();
    if (d.ok) { resumen = d; escribir(LS.resumen, resumen); }
  } catch { /* sin conexión: se sigue mostrando el último resumen guardado */ }
}

function guardarRegistro(tipo, datos, mensaje = "Registro guardado ✓") {
  // La configuración no se acumula: si hay una esperando, la nueva la reemplaza.
  if (tipo === "config") pendientes = pendientes.filter((r) => r.tipo !== "config");
  pendientes.push({
    id: uid(),
    tipo,
    datos,
    temporada: CFG?.temporada?.nombre || "",
    creado_en: ahora(),
    dispositivo: leer(LS.nombre, ""),
  });
  escribir(LS.pendientes, pendientes);
  refrescarEstado();
  aviso(mensaje);
  sincronizar();
}

// Las fichas de referencia viven en su propio archivo y se bajan la primera
// vez que se abre una, no al arrancar: son texto y nadie las mira todos los
// días. El service worker las guarda, así que después funcionan sin señal.
let FICHAS = null;
let bajandoFichas = false;
async function traerFichasTexto() {
  if (FICHAS || bajandoFichas) return;
  bajandoFichas = true;
  try {
    const r = await fetch("fichas.json");
    FICHAS = await r.json();
    if (vistaActual === "plan" && cultivoAbierto) redibujarConDatos("plan");
  } catch { /* sin señal la primera vez: se muestra el resto de la ficha */ }
  finally { bajandoFichas = false; }
}

// ---- Plan estratégico ----
// El calendario de la temporada: una barra por generación, con sus tres
// tramos. Lo único que se guarda de cada generación es CUÁNDO se decidió
// sembrarla; el trasplante, el inicio y el fin de cosecha se calculan acá con
// los días del catálogo. Así, cuando esos días se corrigen con lo que de
// verdad pasa en la chacra, el plan entero se corrige solo.
async function traerGeneraciones(forzar = false) {
  if (!chacraCodigo() || !tieneAcceso() || !navigator.onLine) return;
  if (!forzar && Date.now() - (pedidoReciente.generaciones || 0) < 20000) return;
  pedidoReciente.generaciones = Date.now();
  try {
    const d = await (await fetch(
      `${urlServicio()}?${conCredenciales("generaciones=1")}`)).json();
    if (!d.ok || !Array.isArray(d.generaciones)) return;
    const lista = conPendientesDelPlan(d.generaciones);
    const cambio = JSON.stringify(leer(LS.generaciones, null)) !== JSON.stringify(lista);
    escribir(LS.generaciones, lista);
    if (!cambio) return;
    // También Resumen: sus croquis muestran qué bancales ocupa el plan. Si lo
    // que llegó no cambia nada en pantalla, redibujarConDatos no la toca.
    if (vistaActual === "inicio") redibujarConDatos("inicio");
    else if (vistaActual === "plan") redibujarConDatos("plan");
  } catch { /* sin señal: se usa lo último que se bajó */ }
}

/* Lo que está en la cola del teléfono todavía no llegó a la planilla, así que
   el servicio no lo devuelve. Se aplica encima de su respuesta: si no, un
   cultivo recién agregado desaparecía de la lista y del gráfico hasta cerrar y
   abrir la app (28/09), y una generación recién movida volvía a su lugar
   viejo por unos segundos. */
function conPendientesDelPlan(lista) {
  let out = lista.slice();
  pendientes.forEach((r) => {
    const d = r.datos || {};
    const id = d.generacion_id;
    if (!id) return;
    if (r.tipo === "generacion_borrar") { out = out.filter((x) => x.id !== id); return; }
    if (r.tipo !== "generaciones") return;
    const previa = out.find((x) => x.id === id);
    // Una parte nueva de una generación partida es la misma siembra: si la
    // original ya estaba sembrada, esta también.
    const hermanaSembrada = out.some((x) => claveArea(x.cultivo) === claveArea(d.cultivo)
      && Number(x.generacion) === (Number(d.generacion) || 1) && x.sembrada);
    const nueva = {
      ...(previa || { sembrada: hermanaSembrada }), id, cultivo: d.cultivo,
      generacion: Number(d.generacion) || 1, metodo: d.metodo || "",
      fecha_almacigo: d.fecha_almacigo || "", fecha_campo: d.fecha_campo || "",
      camas: Number(d.camas) || 0, sector: d.sector || "", bancales: d.bancales || "",
      estado: d.estado || "Planificado", variedad: d.variedad || "",
    };
    out = previa ? out.map((x) => (x.id === id ? nueva : x)) : out.concat(nueva);
  });
  return out;
}

// Guardar una generación: a la cola, y en la copia local al instante para que
// la pantalla responda sin esperar a la planilla.
function guardarGeneracion(g, mensaje) {
  guardarRegistro("generaciones", {
    generacion_id: g.id, cultivo: g.cultivo, generacion: g.generacion,
    metodo: g.metodo, fecha_almacigo: g.fecha_almacigo || "",
    fecha_campo: g.fecha_campo || "", camas: g.camas || "",
    sector: g.sector || "", variedad: g.variedad || "",
    // Solo números: si la planilla alguna vez convirtió "4, 5, 6" en una
    // fecha, reenviarlo tal cual lo volvía a guardar dañado.
    bancales: bancalesDe(g).join(", "), estado: g.estado || "Planificado", origen: "AMA",
  }, mensaje);
  escribir(LS.generaciones, conPendientesDelPlan(leer(LS.generaciones, []) || []));
}

// Trae del servicio las últimas filas de una hoja y las guarda para verlas
// aunque después no haya señal.
const pedidoReciente = {};
// Todo lo que la chacra hizo con un cultivo: lo calcula el servicio sobre las
// hojas enteras, porque el teléfono solo recibe las últimas 15 filas de cada
// una. Se pide de a un cultivo y se guarda, así abrir la ficha de nuevo no
// vuelve a pedirlo.
async function traerFicha(cultivo, forzar = false) {
  if (!chacraCodigo() || !tieneAcceso() || !navigator.onLine) return;
  const marca = "ficha:" + cultivo;
  if (!forzar && Date.now() - (pedidoReciente[marca] || 0) < 20000) return;
  pedidoReciente[marca] = Date.now();
  try {
    const d = await (await fetch(`${urlServicio()}?${
      conCredenciales("ficha=" + encodeURIComponent(cultivo))}`)).json();
    if (!d.ok) return;
    const fichas = leer(LS.fichas, {});
    const cambio = JSON.stringify(fichas[cultivo] || null) !== JSON.stringify(d);
    fichas[cultivo] = d;
    escribir(LS.fichas, fichas);
    const delPanel = (leer(LS.generaciones, []) || []).find((x) => x.id === genPanel);
    if (cambio && vistaActual === "plan"
        && (cultivoAbierto === cultivo || delPanel?.cultivo === cultivo)) {
      redibujarConDatos("plan");
    }
  } catch { /* sin señal: se muestra lo último que se bajó */ }
}

// Los almácigos que esperan trasplante los cuenta el servicio sobre la hoja
// entera, no sobre las últimas 15 siembras que recibe el teléfono.
async function traerAlmacigos(forzar = false) {
  if (!chacraCodigo() || !tieneAcceso() || !navigator.onLine) return;
  if (!forzar && Date.now() - (pedidoReciente.almacigos || 0) < 20000) return;
  pedidoReciente.almacigos = Date.now();
  try {
    const d = await (await fetch(
      `${urlServicio()}?${conCredenciales("almacigos=1")}`)).json();
    if (!d.ok || !Array.isArray(d.almacigos)) return;
    const cambio = JSON.stringify(leer(LS.almacigos, null)) !== JSON.stringify(d.almacigos);
    escribir(LS.almacigos, d.almacigos);
    if (cambio && vistaActual === "trasplantes") redibujarConDatos("trasplantes");
  } catch { /* sin conexión: se usa lo último que se bajó */ }
}

async function traerUltimos(tipo, forzar = false) {
  if (!chacraCodigo() || !navigator.onLine) return;
  // Sin esto, cada render pediría de nuevo y el redibujado se volvería un lazo.
  if (!forzar && Date.now() - (pedidoReciente[tipo] || 0) < 20000) return;
  pedidoReciente[tipo] = Date.now();
  try {
    const d = await (await fetch(
      `${urlServicio()}?${conCredenciales("ultimos=" + encodeURIComponent(tipo))}&n=15`)).json();
    if (!d.ok || !Array.isArray(d.filas)) return;
    const guardado = leer(LS.ultimos, {});
    const cambio = JSON.stringify(guardado[tipo] || []) !== JSON.stringify(d.filas);
    guardado[tipo] = d.filas;
    escribir(LS.ultimos, guardado);
    if (cambio && vistaActual === tipo) redibujarConDatos(tipo);
  } catch { /* sin conexión: se muestra lo último que se bajó */ }
}

// ---- Configuración de la chacra ----
// Se guarda entera cada vez: la app manda la configuración completa y el
// servicio reescribe la hoja Config. Así no hay estados a medias.
// `volverA` es la vista donde se queda después de guardar. Por defecto es
// Configuración, que es de donde se guarda casi siempre; el mapa y la
// planificación también guardan configuración y no tienen por qué sacarte de
// donde estabas.
function guardarConfig(cambios, mensaje = "Configuración guardada ✓", volverA = "configuracion") {
  // Red de seguridad: guardar reescribe la hoja Config entera. Si todavía no
  // pudimos leer lo que la chacra tenía cargado, guardar borraría sus datos.
  if (!configConfirmada) {
    return aviso("Esperá: todavía no pude leer la configuración de la chacra.", true);
  }
  CFG = Object.assign({
    nombre: chacraActual()?.nombre || "", temporada: {}, bancal: {},
    sectores: [], integrantes: [], areas: [], plan: [],
  }, CFG || {}, cambios);
  escribir(LS.config, CFG);
  guardarRegistro("config", CFG, mensaje);
  if (volverA) render(volverA, volverA === vistaActual);
}

/* La configuración de a una parte (desde el 30/09). guardarConfig manda la
   copia entera del teléfono y el servicio reescribe la hoja con ella: si otro
   teléfono había movido un sector o replaneado otro cultivo después de que
   este bajó su copia, lo pisaba sin avisar. Lo que se toca a cada rato —el
   plan de un cultivo, que se rehace con cada generación, y dónde está un
   sector en el mapa— viaja ahora como una parte suelta (config_plan,
   config_sector), y el servicio cambia esa fila y nada más.

   partes: [["config_plan", {cultivo, superficie_m2, …} | {cultivo, borrar}],
            ["config_sector", {sector, fila, columna}], …]
   Contra un servicio anterior, o con una configuración entera esperando en la
   cola, se guarda entera como siempre. */
function guardarPartesDeConfig(cambios, partes, mensaje = "Configuración guardada ✓", volverA = "configuracion") {
  if (!CFG?.parcial || pendientes.some((r) => r.tipo === "config")) {
    return guardarConfig(cambios, mensaje, volverA);
  }
  CFG = Object.assign({}, CFG, cambios);
  escribir(LS.config, CFG);
  const mismaParte = (tipo, a, b) => (tipo === "config_plan"
    ? claveArea(a.cultivo) === claveArea(b.cultivo) : a.sector === b.sector);
  partes.forEach(([tipo, datos]) => {
    // Una parte nueva de lo mismo reemplaza a la que esperaba enviarse.
    pendientes = pendientes.filter((r) => !(r.tipo === tipo && mismaParte(tipo, r.datos || {}, datos)));
    pendientes.push({
      id: uid(), tipo, datos,
      temporada: CFG?.temporada?.nombre || "",
      creado_en: ahora(),
      dispositivo: leer(LS.nombre, ""),
    });
  });
  escribir(LS.pendientes, pendientes);
  refrescarEstado();
  if (mensaje) aviso(mensaje);
  sincronizar();
  if (volverA) render(volverA, volverA === vistaActual);
}

// Las partes que siguen en la cola, encima de lo que devolvió el servicio:
// si no, un sector recién movido volvía a su lugar viejo hasta que llegaran.
function conPendientesDeConfig(cfg) {
  pendientes.forEach((r) => {
    const d = r.datos || {};
    if (r.tipo === "config_plan") {
      const k = claveArea(d.cultivo);
      cfg.plan = (cfg.plan || []).filter((p) => claveArea(p.cultivo) !== k);
      if (!d.borrar) {
        cfg.plan.push({ cultivo: d.cultivo, superficie_m2: d.superficie_m2 || 0,
          cosecha_esperada_kg: d.cosecha_esperada_kg || 0, rinde_kg_m2: d.rinde_kg_m2 || 0,
          lineas: d.lineas || 0, distancia_cm: d.distancia_cm || 0, plantas: d.plantas || 0 });
        cfg.plan.sort((a, b) => a.cultivo.localeCompare(b.cultivo));
      }
    } else if (r.tipo === "config_sector") {
      cfg.sectores = (cfg.sectores || []).map((s) => (s.sector === d.sector
        ? { ...s, fila: Number(d.fila) || 0, columna: Number(d.columna) || 0 } : s));
    }
  });
  return cfg;
}

// Trae del servicio la configuración de esta chacra. forzar: como en
// traerCatalogo.
async function traerConfig(forzar = true) {
  if (!chacraCodigo() || !navigator.onLine) return;
  if (!forzar && Date.now() - (pedidoReciente.config || 0) < 20000) return;
  pedidoReciente.config = Date.now();
  try {
    const d = await (await fetch(
      `${urlServicio()}?${conCredenciales("config=1")}`)).json();
    if (!d.ok || !d.config) return;
    avisarSiFaltanColumnas(d.config.esquema);
    // Tica: los nombres del equipo, de la planilla de horas (servicio nuevo).
    if (Array.isArray(d.config.nombres_horas) && d.config.nombres_horas.length) {
      escribir(LS.nombresPlanilla, d.config.nombres_horas);
    }

    // Si hay cosas esperando enviarse, lo del teléfono es más nuevo: no se pisa.
    if (!pendientes.some((r) => r.tipo === "config")) {
      if (d.config.sectores?.length || d.config.plan?.length) {
        const t = d.config.temporada || {};
        t.inicio = aFechaISO(t.inicio);
        t.fin = aFechaISO(t.fin);
        CFG = conPendientesDeConfig(d.config);
        escribir(LS.config, CFG);
      }
    }
    // Ya sabemos qué tenía la chacra: recién ahora es seguro guardar.
    const eraDesconocida = !configConfirmada;
    configConfirmada = true;
    escribir(LS.configLeida, true);
    if (eraDesconocida && vistaActual === "configuracion") render("configuracion");
  } catch { /* sin conexión: se usa la última configuración guardada */ }
}

// ---- Cuentas de sueldos ----
// Los números los calcula el proyecto Bioma; acá solo se piden y se dibujan.
// El servicio decide qué puede ver este teléfono según de quién es, así que la
// app no filtra nada: muestra lo que le llega.
const hayCuentas = () => !!CFG?.cuentas;

// Devuelve true solo si llegaron datos DISTINTOS de los que ya estaban. Quien
// llama usa eso para decidir si vale la pena redibujar: redibujar por gusto
// manda la pantalla arriba y, si encima vuelve a pedir, queda en un lazo.
let ultimoPedidoCuentas = 0;
async function traerCuentas(forzar = false) {
  if (!chacraCodigo() || !tieneAcceso() || !navigator.onLine) return false;
  if (!forzar && Date.now() - ultimoPedidoCuentas < 20000) return false;
  ultimoPedidoCuentas = Date.now();
  try {
    const d = await (await fetch(
      `${urlServicio()}?${conCredenciales("micuenta=1")}`)).json();
    if (!d.ok) {
      escribir(LS.cuentasError, d.error || "No se pudieron leer las cuentas.");
      return true;
    }
    escribir(LS.cuentasError, "");
    // Se compara sin la marca de bajada, que cambia siempre y haria parecer
    // que hay novedades en cada pedido.
    const antes = JSON.stringify(leer(LS.cuentas, null));
    escribir(LS.cuentas, d);
    return JSON.stringify(d) !== antes;
  } catch {
    // Sin señal se conserva lo último bueno: una pantalla en blanco es peor
    // que un número de ayer, sobre todo si alguien está por cobrar.
    return false;
  }
}

// Trae del servicio la lista de tareas del equipo.
async function traerTareas() {
  if (!navigator.onLine) return;
  try {
    const d = await (await fetch(
      `${urlServicio()}?${conCredenciales("tareas=1")}`)).json();
    if (Array.isArray(d.tareas)) escribir(LS.tareas, d.tareas);
  } catch { /* sin conexión: se usa la última lista guardada */ }
}
