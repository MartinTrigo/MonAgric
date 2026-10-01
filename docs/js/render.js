// js/render.js        — AMA Producción
//
// Dibujar una sección (render) y redibujar cuando llegan datos
// (redibujarConDatos: conserva el scroll y no pisa un formulario empezado).
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos. Se partió app.js el 30/09/2026 sin cambiar código.

// ==========================================================
// RENDER Y FORMULARIOS
// ==========================================================
// ¿La persona tocó algún campo desde que se dibujó la pantalla? Solo cuentan
// los eventos de verdad (isTrusted): varias pantallas completan campos solas al
// abrirse —la fecha, quién trabajó, lo sugerido— y eso no es estar cargando.
// Guardar el formulario o cambiar de pantalla lo vuelve a cero.
let campoTocado = false;
["input", "change"].forEach((tipo) => document.addEventListener(tipo, (e) => {
  if (e.isTrusted && e.target.closest && e.target.closest("#vista")) campoTocado = true;
}, true));
document.addEventListener("submit", () => { campoTocado = false; }, true);
const formularioEmpezado = () => campoTocado;

// Las partes donde la persona escribió algo (un formulario de corrección
// dentro de la lista, por ejemplo): esas no se reemplazan al llegar datos.
let partesTocadas = new Set();
["input", "change"].forEach((tipo) => document.addEventListener(tipo, (e) => {
  const p = e.isTrusted && e.target.closest && e.target.closest("#vista [data-parte]");
  if (p && p.dataset.parteModo !== "opciones") partesTocadas.add(p.dataset.parte);
}, true));
// Cómo era cada parte al dibujarla: si lo que llega da lo mismo, no se toca.
let htmlDePartes = new Map();

// Las listas desplegables recuerdan si estaban abiertas. "toggle" no burbujea:
// se escucha en la captura, así vale también para las que se reemplazan.
//
// Un <details data-recordar="clave"> se recuerda solo: la plantilla lo dibuja
// abierto si estaDesplegado(clave). Antes, abrir un grupo de "Sin ubicar" en
// el mapa y que terminara una sincronización lo cerraba (01/10).
const desplegablesAbiertos = new Set();
const estaDesplegado = (clave) => desplegablesAbiertos.has(clave);
document.addEventListener("toggle", (e) => {
  if (e.target.id === "lista-para-sembrar") abiertoParaSembrar = e.target.open;
  if (e.target.id === "lista-para-trasplantar") abiertoParaTrasplantar = e.target.open;
  const clave = e.target.dataset && e.target.dataset.recordar;
  if (clave) {
    if (e.target.open) desplegablesAbiertos.add(clave); else desplegablesAbiertos.delete(clave);
  }
  // Plan → Cultivos: además, cuál es "el" cultivo con el que se está trabajando.
  const cultivo = e.target.dataset && e.target.dataset.cultivoLista;
  if (cultivo) {
    if (e.target.open) cultivoEditando = cultivo;
    else if (claveArea(cultivoEditando) === claveArea(cultivo)) cultivoEditando = "";
  }
}, true);

// ¿Hay algo agarrado con el puntero? Una barra del plan estratégico, una
// generación o un sector del mapa. Redibujar a mitad de camino tira el
// elemento que se está arrastrando y el arrastre se pierde: pasaba en el plan
// estratégico si en ese momento terminaba una sincronización (01/10).
const arrastrandoAlgo = () => document.body.classList.contains("lz-arrastrando")
  || !!document.querySelector("#vista .arrastrando, #vista .levantado");

/* Redibujar porque llegaron datos, no porque la persona hizo algo. Estos
   pedidos terminan solos, segundos después, y antes redibujaban con la
   pantalla vuelta arriba y el formulario en blanco: al terminar cada
   sincronización —o sea, después de cada cosa guardada— la pantalla saltaba
   al principio y se perdía lo que se estaba escribiendo (28/09: "no me deja
   trabajar"). Ahora se queda donde estaba, y si hay algo a medio cargar o un
   arrastre en el mapa, no se redibuja: los datos nuevos aparecen en el
   próximo cambio de pantalla. */
function redibujarConDatos(vista) {
  if (vistaActual !== vista) return;
  if (arrastrandoAlgo()) return;
  // Las secciones con formulario están marcadas por partes: se cambian solo
  // las listas y los números, y el formulario sigue como estaba aunque se lo
  // esté llenando. Así los datos nuevos se ven enseguida (antes, con algo a
  // medio cargar, no aparecían hasta cambiar de pantalla).
  if (actualizarPartes(vista)) return;
  if (formularioEmpezado()) return;
  // Lo que llegó no cambia nada de lo que se ve: no se toca la pantalla. Pasa
  // seguido —cada sincronización vuelve a pedir el plan— y redibujar igual
  // cerraba lo que estuviera abierto y le hacía perder el lugar al mouse.
  const html = plantillas[vista]();
  if (html === ultimoHtml) return;
  render(vista, true, html);
}

/* Reemplaza solo las partes que cambiaron (ver parte(), en componentes.js).
   Devuelve false si la sección no tiene partes o cambió de forma —por
   ejemplo, el teléfono perdió el acceso y ahora va la tarjeta del código—:
   ahí corresponde redibujarla entera.

   Por qué no redibujar todo: render() tira el DOM y lo arma de nuevo. Un
   formulario que se completó solo desde el plan ("Para sembrar") no cuenta
   como tocado, así que la lista de últimos movimientos, al llegar segundos
   después, lo dejaba en blanco (01/10). */
function actualizarPartes(vista) {
  const vivas = [...document.querySelectorAll("#vista [data-parte]")];
  if (!vivas.length) return false;
  const nuevo = document.createElement("div");
  nuevo.innerHTML = plantillas[vista]();
  const nuevas = new Map([...nuevo.querySelectorAll("[data-parte]")].map((el) => [el.dataset.parte, el]));
  if (nuevas.size !== vivas.length || vivas.some((el) => !nuevas.has(el.dataset.parte))) return false;

  let cambio = false;
  vivas.forEach((viva) => {
    const nombre = viva.dataset.parte;
    const n = nuevas.get(nombre);
    const html = n.outerHTML;
    if (htmlDePartes.get(nombre) === html) return;
    // Un desplegable de un formulario: cambian sus opciones, no lo elegido.
    if (viva.dataset.parteModo === "opciones") {
      const elegido = viva.value;
      viva.innerHTML = n.innerHTML;
      if ([...viva.options].some((o) => o.value === elegido)) viva.value = elegido;
    } else if (viva.dataset.parteModo === "contenido") {
      // Cambia lo de adentro y la caja queda: una lista con scroll propio no
      // vuelve arriba.
      if (partesTocadas.has(nombre) || viva.contains(document.activeElement)) return;
      viva.innerHTML = n.innerHTML;
    } else {
      if (partesTocadas.has(nombre) || viva.contains(document.activeElement)) return;
      viva.replaceWith(n);
    }
    htmlDePartes.set(nombre, html);
    cambio = true;
  });
  if (cambio) engancharPartes(vista);
  return true;
}

// Lo que hay que volver a enganchar dentro de las partes. Todo es por
// propiedad (onclick = …), así que repetirlo no duplica nada.
function engancharPartes(vista) {
  prepararCorrecciones();
  engancharFilas();
  if (vista === "tareas") prepararTareas();
  if (vista === "inicio") prepararInicio();
  if (vista === "plan") { prepararEdicionCultivos(); if (recalcularSerie) recalcularSerie(); }
}

// Lo último que se dibujó, para no redibujar si lo que llega da lo mismo.
let ultimoHtml = "";
// Cuántas veces se dibujó. Un preparar* puede volver a dibujar desde adentro
// (el plan estratégico, la primera vez, mide su ancho y se redibuja): ese
// render ya enganchó todo, y si el de afuera seguía, lo enganchaba otra vez.
// Con el clic de las barras enganchado dos veces, tocar una abría el panel y
// lo cerraba en el acto: la primera vez que se abría el plan estratégico, las
// barras no respondían (01/10).
let numeroDeRender = 0;

function render(vista, conservarScroll = false, htmlListo = null) {
  const este = ++numeroDeRender;
  if (vista === "configuracion" && vistaActual !== "configuracion") {
    vistaPrevia = vistaActual;
  }
  if (vista !== "cuentas") cuentaAbierta = "";
  vistaActual = vista;
  campoTocado = false;           // la pantalla nueva arranca sin nada cargado
  partesTocadas = new Set();
  const scroll = window.scrollY;
  // Lo que tiene scroll propio —el plan estratégico, las listas de Cultivos y
  // del mapa— también se queda donde estaba. Redibujar crea todo de nuevo, y
  // sin esto el gráfico volvía arriba después de cada sincronización aunque
  // la página no se moviera.
  const CON_SCROLL = "#vista .plan-scroll, #vista .lista-scroll";
  const internos = conservarScroll
    ? [...document.querySelectorAll(CON_SCROLL)].map((el) => [el.scrollTop, el.scrollLeft])
    : [];
  // El gráfico y el mapa usan todo el ancho de la pantalla. El resto de la app
  // queda con el ancho de siempre: un formulario de 1800 px es incómodo de
  // leer, pero un campo de 106 bancales achicado a 1180 px desperdicia lo que
  // la notebook tiene de sobra.
  document.body.classList.toggle("a-lo-ancho",
    vista === "plan" && !cultivoAbierto && (vistaPlan === "grafico" || vistaPlan === "mapa"));
  ultimoHtml = htmlListo ?? plantillas[vista]();
  $("#vista").innerHTML = ultimoHtml;
  htmlDePartes = new Map([...document.querySelectorAll("#vista [data-parte]")]
    .map((el) => [el.dataset.parte, el.outerHTML]));
  // Al cambiar de sección se arranca de arriba; al redibujar la misma porque
  // llegaron datos, se deja donde estaba.
  window.scrollTo(0, conservarScroll ? scroll : 0);
  document.querySelectorAll(CON_SCROLL).forEach((el, i) => {
    if (internos[i]) { el.scrollTop = internos[i][0]; el.scrollLeft = internos[i][1]; }
  });
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("activa", t.dataset.vista === vista));

  ({ siembras: prepararSiembras, horas: prepararHoras, cosechas: prepararCosechas,
     tareas: prepararTareas, inicio: prepararInicio, ajustes: prepararAjustes,
     configuracion: prepararConfiguracion, plan: prepararPlan,
     trasplantes: prepararTrasplantes, cuentas: prepararCuentas
   }[vista] || (() => {}))();
  if (este !== numeroDeRender) return;     // ya se volvió a dibujar desde adentro

  prepararComunes();
  prepararCorrecciones();

  // Las secciones de registro muestran lo último de toda la chacra.
  if (["siembras", "cosechas", "horas", "trasplantes"].includes(vista)) traerUltimos(vista);
  // Para saber qué almácigos siguen pendientes hace falta la lista de siembras,
  // aunque la sección que se está mirando sea Trasplantes.
  if (vista === "trasplantes") { traerUltimos("siembras"); traerAlmacigos(); }

  engancharFilas();
  const volver = $("#volver-plan");
  if (volver) volver.onclick = () => { cultivoAbierto = ""; render("plan"); };
  if (vista === "plan" && cultivoAbierto) { traerFicha(cultivoAbierto); traerFichasTexto(); }

  // Plan estratégico: cambiar de vista, ordenar y filtrar.
  document.querySelectorAll("[data-plan-vista]").forEach((b) => {
    b.onclick = () => {
      vistaPlan = b.dataset.planVista;
      cultivoAbierto = "";
      render("plan");
      window.scrollTo(0, 0);
    };
  });
  const plegar = $("#plegar-plan");
  if (plegar) plegar.onclick = () => {
    escribir(LS.planPlegado, !leer(LS.planPlegado, false));
    render("plan", true);
  };
  document.querySelectorAll("[data-ir-configuracion]").forEach((b) => {
    b.onclick = () => render("configuracion");
  });
  document.querySelectorAll("[name=orden-plan]").forEach((r) => {
    r.onchange = () => { ordenPlan = r.value; render("plan", true); };
  });
  document.querySelectorAll("[name=filtro-plan]").forEach((r) => {
    r.onchange = () => { filtroPlan = r.value; render("plan", true); };
  });
  engancharArrastre();
  prepararPanelGeneracion();
  // El plan también lo necesita Inicio, para avisar qué toca sembrar.
  if (vista === "plan" || vista === "inicio") traerGeneraciones();

  // Solo se redibuja si de verdad cambio algo, y sin mover la pantalla: quien
  // estaba leyendo el detalle de su cuenta no tiene por que volver arriba.
  if (vista === "cuentas") traerCuentas().then((cambio) => {
    if (cambio && vistaActual === "cuentas") redibujarConDatos("cuentas");
  });

  // La pestaña de Cuentas solo existe para las chacras que tienen economía
  // compartida. Hoy es solo Chacra Tica: las demás ni la ven.
  const tabCuentas = document.querySelector('[data-vista="cuentas"]');
  if (tabCuentas) tabCuentas.hidden = !hayCuentas();

  // Si la sección quedó fuera de la vista en la barra deslizable, se la acerca.
  const activa = document.querySelector(".tabs-medio .tab.activa");
  if (activa) activa.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
}

// Las filas que llevan a otro lado: abrir la ficha de un cultivo, completar el
// formulario desde "Para sembrar" o "Para trasplantar", ir desde Inicio a la
// lista. Van aparte de render porque también se enganchan al reemplazar una
// parte (actualizarPartes); son todas por propiedad, se pueden repetir.
function engancharFilas() {
  // Plan: abrir un cultivo muestra su ficha, y con ella se pide su historial.
  document.querySelectorAll("[data-ficha]").forEach((fila) => {
    const abrir = () => {
      cultivoAbierto = fila.dataset.ficha;
      render("plan");
      window.scrollTo(0, 0);
    };
    fila.onclick = abrir;
    fila.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); }
    };
  });
  // Tocar algo de "Para sembrar" completa el formulario con lo que dice el
  // plan de esas generaciones: cuántos bancales, la variedad, dónde van.
  // "Para trasplantar": el almácigo elegido, y con él el plan de esa generación.
  document.querySelectorAll("[data-trasplantar]").forEach((fila) => {
    const ir = () => {
      const s = almacigosPendientes().find((x) => x.id === fila.dataset.trasplantar);
      if (!s) return;
      trasplanteSugerido = { cultivo: s.cultivo, generacion: s.generacion, siembra_id: s.id };
      abiertoParaTrasplantar = false;
      render("trasplantes");
      const destino = $("#tarjeta-form-trasplante");
      if (destino) destino.scrollIntoView({ block: "start" });
    };
    fila.onclick = ir;
    fila.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(); }
    };
  });
  // Inicio: los botones llevan a la sección con la lista abierta.
  document.querySelectorAll("[data-ir-pendientes]").forEach((b) => {
    b.onclick = () => {
      if (b.dataset.irPendientes === "siembras") abiertoParaSembrar = true;
      else abiertoParaTrasplantar = true;
      render(b.dataset.irPendientes);
    };
  });

  document.querySelectorAll("[data-sembrar]").forEach((fila) => {
    const ir = () => {
      let clave;
      try { clave = JSON.parse(fila.dataset.sembrar); } catch { return; }
      const g = siembrasAgrupadas(9999).find((x) =>
        claveArea(x.cultivo) === claveArea(clave.cultivo) && x.cuando === clave.cuando);
      if (!g) return;
      const lugar = bancalesPlanificados(g.cultivo, Math.min(...g.generaciones))[0] || {};
      siembraSugerida = {
        cultivo: g.cultivo, generacion: Math.min(...g.generaciones), generaciones: g.generaciones,
        directa: !g.fecha_almacigo, camas: g.camasTotal || 0, variedad: g.variedad || "",
        sector: lugar.sector || g.sector || "", bancal: lugar.bancal || "", cuando: g.cuando,
      };
      abiertoParaSembrar = false;
      render("siembras");
      const destino = $("#tarjeta-form-siembra");
      if (destino) destino.scrollIntoView({ block: "start" });
    };
    fila.onclick = ir;
    fila.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(); }
    };
  });
}

// Botones que pueden aparecer en cualquier vista.
function prepararComunes() {
  // Vale para cualquier formulario que tenga el par sector/bancal.
  document.querySelectorAll('select[name="sector"]').forEach((sel) => {
    const bancal = sel.closest("form")?.querySelector('select[name="bancal"]');
    if (!bancal) return;
    sel.addEventListener("change", () => {
      const antes = bancal.value;
      bancal.innerHTML = opcionesBancal(sel.value, antes);
    });
  });

  document.querySelectorAll(".chip-chacra").forEach((b) => {
    b.onclick = async () => {
      escribir(LS.chacra, b.dataset.chacra);
      CFG = null;
      escribir(LS.config, null);
      configConfirmada = false;
      escribir(LS.configLeida, false);
      refrescarEstado();

      // Primero se busca lo que la chacra ya tenga cargado. Recién después se
      // decide qué mostrar: si ya está configurada, el inicio; si no, Config.
      // Cada chacra tiene su propio acceso: al cambiar, hay que canjear de nuevo.
      escribir(LS.credencial, "");
      render("inicio");     // muestra la pantalla del código
    };
  });
  const irConfig = $("#btn-ir-config");
  if (irConfig) irConfig.onclick = () => render("configuracion");

  // ---- canje del código de invitación
  const fc = $("#form-canje");
  if (fc) {
    fc.onsubmit = async (e) => {
      e.preventDefault();
      const codigo = fc.codigo.value.trim().toUpperCase();
      const persona = fc.persona.value.trim();
      if (!codigo || !persona) return aviso("Completá el código y tu nombre.", true);
      if (!navigator.onLine) return aviso("Para activar el teléfono hace falta señal.", true);

      const boton = fc.querySelector("button");
      boton.disabled = true;
      boton.textContent = "Activando…";
      try {
        const d = await canjearCodigo(codigo, persona);
        if (!d.ok) {
          aviso(d.error || "No se pudo activar.", true);
          boton.disabled = false;
          boton.textContent = "Activar este teléfono";
          return;
        }
        escribir(LS.nombre, persona);
        aviso(`¡Listo, ${persona}! Este teléfono ya puede cargar ✓`);
        configConfirmada = false;
        escribir(LS.configLeida, false);
        await traerConfig();
        render(hayConfig() ? "inicio" : "configuracion");
        sincronizar();
      } catch {
        aviso("No se pudo conectar. Revisá la señal.", true);
        boton.disabled = false;
        boton.textContent = "Activar este teléfono";
      }
    };
  }

  const otraChacra = $("#volver-a-chacra");
  if (otraChacra) {
    otraChacra.onclick = (e) => {
      e.preventDefault();
      escribir(LS.chacra, "");
      render("inicio");
    };
  }
}

function prepararInicio() {
  const b = $("#btn-enviar");
  if (b) b.onclick = () => sincronizar(false);

  const f = $("#form-sugerencia");
  if (f) {
    f.onsubmit = (e) => {
      e.preventDefault();
      const texto = f.texto.value.trim();
      if (texto.length < 5) return aviso("Contame un poco más, así se entiende.", true);
      guardarRegistro("sugerencia", {
        texto,
        quien: leer(LS.nombre, ""),
        fecha: hoy(),
      }, "¡Gracias! Tu sugerencia va en camino ✓");
      f.texto.value = "";
    };
  }
}
