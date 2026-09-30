// js/plan-grafico.js  — AMA Producción
//
// Plan estratégico: el calendario de barras (tramosDe calcula las etapas de
// cada generación), el panel de detalle, arrastrar para correr fechas, y la
// barra de secciones de Plan.
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos. Se partió app.js el 30/09/2026 sin cambiar código.

// "G1", o "G1b" cuando una generación se partió para ubicarla en bancales
// separados: son la misma siembra, así que comparten el número.
function nombreGen(g, todas = leer(LS.generaciones, []) || []) {
  const hermanas = todas.filter((x) => claveArea(x.cultivo) === claveArea(g.cultivo)
    && Number(x.generacion) === Number(g.generacion));
  if (hermanas.length < 2) return `G${g.generacion}`;
  const orden = hermanas.map((x) => x.id).sort((a, b) => a.length - b.length || a.localeCompare(b));
  return `G${g.generacion}${"abcdefghij"[orden.indexOf(g.id)] || ""}`;
}

// Lo que se supone cuando el catálogo no dice nada: solo para poder dibujar
// la barra, que queda marcada como estimada. No se guarda en ningún lado.
const DIAS_SUPUESTOS = { almacigo: 28, cosecha: 60 };

// Los cuatro momentos de una generación. En siembra directa no hay tramo de
// almácigo: la planta arranca en el bancal.
function tramosDe(g) {
  const p = perfil(g.cultivo) || {};
  const directa = !g.fecha_almacigo;
  const inicioTodo = g.fecha_almacigo || g.fecha_campo;
  if (!inicioTodo) return null;

  const aCampo = g.fecha_campo || "";
  // De la bandeja al bancal: si el plan trae la fecha se respeta, porque es
  // una decisión; si no, se estima con los días de almácigo de la estación.
  //
  // Si el catálogo no tiene los días, la barra igual se dibuja, con un largo
  // supuesto y marcada como estimada. Antes la fila quedaba vacía —el nombre
  // sin barra, como pasó con Pak choi el 28/09— y no se entendía por qué.
  const faltan = [];
  let enBandeja = directa || aCampo ? 0 : diasAlmacigo(g.cultivo, inicioTodo);
  if (!directa && !aCampo && !enBandeja) { enBandeja = DIAS_SUPUESTOS.almacigo; faltan.push("días de almácigo"); }
  const campo = aCampo || sumarDias(inicioTodo, enBandeja) || inicioTodo;
  let aCosecha = directa
    ? (p.dias_a_cosecha || 0)
    : (p.dias_trasplante_cosecha || 0);
  if (!aCosecha) { aCosecha = DIAS_SUPUESTOS.cosecha; faltan.push("días a cosecha"); }
  const inicioCosecha = sumarDias(campo, aCosecha);
  const dura = p.dias_en_cosecha_max || p.dias_en_cosecha || 0;
  // Sin ventana de cosecha la barra termina donde empieza a cosecharse: no se
  // inventa cuánto dura, pero se avisa que falta.
  if (!dura) faltan.push("días en cosecha");
  const finCosecha = inicioCosecha && dura ? sumarDias(inicioCosecha, dura) : inicioCosecha;

  return { inicio: inicioTodo, campo, inicioCosecha, fin: finCosecha || campo, directa,
           faltan };
}

function generacionesParaElPlan() {
  const todas = leer(LS.generaciones, []) || [];
  // Vale lo que dice la hoja Siembras, no la columna Estado del plan. Si el
  // servicio todavía no manda el cruce, se cae en esa columna.
  const sembrada = (g) => ("sembrada" in g) ? g.sembrada : g.estado === "Sembrado";
  const filtradas = todas.filter((g) =>
    filtroPlan === "todas" ? true
      : filtroPlan === "sembradas" ? sembrada(g) : !sembrada(g));
  return filtradas
    .map((g) => Object.assign({}, g, { tramos: tramosDe(g) }))
    .filter((g) => g.tramos)
    .sort((a, b) => ordenPlan === "fecha"
      ? String(a.tramos.inicioCosecha || a.tramos.inicio)
          .localeCompare(String(b.tramos.inicioCosecha || b.tramos.inicio))
      // Por cultivo, y dentro de cada uno por la fecha en que arranca: al
      // correr una generación en el gráfico, se reacomoda sola en su lugar.
      : a.cultivo.localeCompare(b.cultivo)
        || String(a.tramos.inicio).localeCompare(String(b.tramos.inicio))
        || a.generacion - b.generacion);
}

function planEstrategico() {
  const gens = generacionesParaElPlan();
  const total = (leer(LS.generaciones, []) || []).length;

  const cabecera = `
    ${barraDePlan("grafico")}`;

  if (!gens.length) {
    return `<div class="tarjeta">
      <h2>Plan estratégico</h2>
      ${cabecera}
      <p class="nota">${total
        ? "Ningún generación coincide con el filtro elegido."
        : `Todavía no hay generaciones planificadas. Se cargan desde la
           planificación de la temporada con <code>tools/cargar_generaciones.py</code>.`}</p>
    </div>`;
  }

  // El eje arranca en julio y llega hasta donde termina la última cosecha, no
  // solo hasta junio. Antes se cortaba en junio para que una acelga de 200 días
  // no achicara todo; pero así no se podía ver cómo sigue lo que se cosecha
  // después (30/09). Ahora el ancho es fijo por mes —el gráfico se desplaza de
  // costado en vez de achicarse— y el fin de la temporada queda marcado con
  // una línea, con lo de después sombreado.
  //
  // Tope: un año más. Lo que siga todavía después llega al borde y se marca.
  const d0 = inicioDeTemporada();
  const finTemporada = new Date(d0); finTemporada.setFullYear(finTemporada.getFullYear() + 1);
  const ultimaCosecha = gens.reduce((m, g) => (g.tramos.fin > m ? g.tramos.fin : m), isoDe(finTemporada));
  let d1 = new Date(ultimaCosecha + "T00:00:00");
  d1.setDate(1); d1.setMonth(d1.getMonth() + 1);               // hasta fin de ese mes
  const tope = new Date(finTemporada); tope.setFullYear(tope.getFullYear() + 1);
  if (d1 < finTemporada) d1 = new Date(finTemporada);
  if (d1 > tope) d1 = tope;
  const ini = Math.floor(d0.getTime() / 86400000);
  const fin = Math.floor(d1.getTime() / 86400000);
  const dias = Math.max(1, fin - ini);
  const pct = (iso) => ((diaDe(iso) - ini) / dias) * 100;

  // Los meses del encabezado
  const meses = [];
  const cur = new Date(d0);
  while (cur < d1) {
    const desdeMes = Math.floor(cur.getTime() / 86400000);
    const sig = new Date(cur); sig.setMonth(sig.getMonth() + 1);
    const hastaMes = Math.min(fin, Math.floor(sig.getTime() / 86400000));
    meses.push({
      nombre: MESES_CORTOS[cur.getMonth()],
      anio: cur.getFullYear(),
      izq: ((desdeMes - ini) / dias) * 100,
      ancho: ((hastaMes - desdeMes) / dias) * 100,
      fuera: cur >= finTemporada,          // ya es la temporada siguiente
    });
    cur.setMonth(cur.getMonth() + 1);
  }

  const hoyPct = pct(hoy());
  // Dónde termina la temporada, si el eje sigue después.
  const finPct = pct(isoDe(finTemporada));
  const posicion = (p) => `calc(var(--sangria) + var(--hueco) + (100% - var(--sangria) - var(--hueco)) * ${p / 100})`;
  const enPantalla = hoyPct >= 0 && hoyPct <= 100;
  // Cuánto tiene que medir un tramo, en porcentaje del eje, para que le entre
  // una fecha como "16/8". Depende del ancho real del gráfico, no de un número
  // fijo: en el teléfono el mismo tramo es mucho más angosto.
  const anchoGrafico = Math.max(720, meses.length * 96);
  const anchoMinimoFecha = (34 / anchoGrafico) * 100;

  const todasGens = leer(LS.generaciones, []) || [];
  const filas = gens.map((g, i) => {
    const t = g.tramos;
    // Recortado a la temporada: lo que empieza antes de julio o sigue después
    // de junio se dibuja hasta el borde, no fuera de él.
    // Cada tramo lleva su fecha de arranque escrita adentro, que es lo que
    // permite leer el calendario sin pasar el mouse por encima. Si el tramo es
    // muy angosto la fecha no entra y se omite: mejor sin texto que con un
    // número cortado a la mitad.
    const seg = (a, b, clase, titulo, etiqueta) => {
      const i = Math.max(0, pct(a)), f = Math.min(100, pct(b));
      if (f <= i) return "";
      const ancho = f - i;
      const cabe = ancho >= anchoMinimoFecha;
      return `<div class="${clase}" style="left:${i}%;width:${ancho}%;background:${
        colorEtapa(g.cultivo, clase.split(" ")[1])}" title="${esc(titulo)}">${
        cabe && etiqueta ? `<b>${esc(etiqueta)}</b>` : ""}</div>`;
    };
    const sigue = t.fin > isoDe(d1);
    // Una generación ya sembrada no se puede correr: su fecha es un hecho, no
    // una intención. Las planificadas sí, arrastrándolas.
    const movible = !(("sembrada" in g) ? g.sembrada : g.estado === "Sembrado");
    // Una línea algo más marcada donde empieza otro cultivo: separa los grupos.
    const nuevoCultivo = ordenPlan === "cultivo" && i > 0 && gens[i - 1].cultivo !== g.cultivo;
    const nombre = nombreGen(g, todasGens);
    // Si al catálogo le faltan días, la barra es una estimación y se ve así.
    const estimada = t.faltan && t.faltan.length;
    return `<div class="plan-gen${movible ? " movible" : ""}${g.id === genPanel ? " abierta" : ""}${
                 nuevoCultivo ? " nuevo-cultivo" : ""}${estimada ? " estimada" : ""}"
                 data-gen="${esc(g.id)}" ${movible ? `data-mover="${esc(g.id)}"` : ""}>
      <div class="plan-nombre" title="${esc(g.cultivo)} ${nombre}${g.camas ? ` · ${num(g.camas, 1)} bancal(es)` : ""}${
        estimada ? ` · barra estimada: faltan en el catálogo los ${t.faltan.join(" y los ")}` : ""}">
        ${esc(g.cultivo)} <span>${nombre}</span>${estimada ? ` <span class="estimada-marca">≈</span>` : ""}
      </div>
      <div class="plan-pista${
        (("sembrada" in g) ? g.sembrada : g.estado === "Sembrado") ? " sembrada" : ""}">
        ${t.directa ? "" : seg(t.inicio, t.campo, "tramo almacigo",
          `almácigo: ${fechaCorta(t.inicio)} a ${fechaCorta(t.campo)}`, diaMes(t.inicio))}
        ${seg(t.campo, t.inicioCosecha || t.fin, "tramo campo",
          `${t.directa ? "sembrado" : "trasplantado"} el ${fechaCorta(t.campo)}`, diaMes(t.campo))}
        ${t.inicioCosecha ? seg(t.inicioCosecha, t.fin, "tramo cosecha",
          `cosecha: ${fechaCorta(t.inicioCosecha)} a ${fechaCorta(t.fin)}`,
          diaMes(t.inicioCosecha)) : ""}
        ${sigue ? `<div class="sigue" title="sigue en cosecha hasta el ${
          fechaCorta(t.fin)}, ya fuera de esta temporada">›</div>` : ""}
      </div>
    </div>`;
  }).join("");

  return `<div class="tarjeta">
    <h2>Plan estratégico <small>${gens.length} de ${total} generaciones</small></h2>
    ${cabecera}

    <div class="plan-controles">
      <div class="chips">
        ${[["cultivo", "Por cultivo"], ["fecha", "Por fecha de cosecha"]].map(([v, t]) =>
          `<label class="chip"><input type="radio" name="orden-plan" value="${v}"${
            ordenPlan === v ? " checked" : ""}><span>${t}</span></label>`).join("")}
      </div>
      <div class="chips">
        ${[["todas", "Todas"], ["planificadas", "Sin sembrar"], ["sembradas", "Sembradas"]]
          .map(([v, t]) => `<label class="chip"><input type="radio" name="filtro-plan" value="${v}"${
            filtroPlan === v ? " checked" : ""}><span>${t}</span></label>`).join("")}
      </div>
    </div>

    <p class="nota">Almácigo, tiempo en el bancal y ventana de cosecha. Los dos
    últimos tramos los calcula la app con los días del catálogo: cuando esos
    días se corrigen con lo que pasa acá, el plan se corrige solo.</p>

    <div class="plan-scroll">
      <div class="plan-grafico" style="--ancho:${anchoGrafico}px">
        <div class="plan-meses">
          <div class="plan-nombre"></div>
          <div class="plan-pista">
            ${meses.map((m) => `<div class="mes${m.fuera ? " fuera" : ""}" style="left:${m.izq}%;width:${m.ancho}%">
              ${m.nombre}${m.nombre === "ene" ? " " + String(m.anio).slice(2) : ""}</div>`).join("")}
          </div>
        </div>
        <div class="plan-cuerpo">
          <!-- La cuadrícula: una línea por mes, de arriba abajo, para seguir con
               la vista dónde empieza y termina cada barra. -->
          ${meses.slice(1).map((m) => `<i class="plan-linea-mes" style="left:calc(var(--sangria) + var(--hueco)
              + (100% - var(--sangria) - var(--hueco)) * ${m.izq / 100})"></i>`).join("")}
          ${finPct < 99.9 ? `<div class="fuera-temporada" style="left:${posicion(finPct)}"
              title="Después del 30 de junio: temporada siguiente"></div>
            <div class="fin-temporada" style="left:${posicion(finPct)}"></div>` : ""}
          ${enPantalla ? `<div class="linea-hoy" style="left:${posicion(hoyPct)}"></div>` : ""}
          ${filas}
        </div>
      </div>
    </div>

    <div class="plan-leyenda">
      <span><i class="m-almacigo"></i> en almácigo</span>
      <span><i class="m-campo"></i> en el bancal</span>
      <span><i class="m-cosecha"></i> en cosecha</span>
      ${enPantalla ? `<span><i class="m-hoy"></i> hoy</span>` : ""}
    </div>
  </div>
  ${(() => {
    const g = (leer(LS.generaciones, []) || []).find((x) => x.id === genPanel);
    return g ? panelGeneracion(g) : "";
  })()}`;
}

// ---- El detalle de una generación, al tocar su barra ----
// Todo lo que se sabe de esa generación y en qué etapa está. Qué se hizo lo
// dicen las hojas de registros —Siembras y Trasplantes—, no un tilde: el panel
// muestra lo que hay, y para marcar algo como hecho lleva al formulario que lo
// registra con los datos ya puestos.
let genPanel = "";
// Lo elegido en el panel para cargar como trasplante; lo usa el formulario.
let trasplanteSugerido = null;

function panelGeneracion(g) {
  const t = tramosDe(g) || {};
  const p = perfil(g.cultivo) || {};
  const sembrada = ("sembrada" in g) ? g.sembrada : g.estado === "Sembrado";

  // El trasplante sale de la ficha del cultivo, que trae todos sus registros.
  const ficha = (leer(LS.fichas, {}) || {})[g.cultivo];
  const tr = (ficha?.trasplantes || []).filter((x) =>
    Number(x.generacion) === Number(g.generacion)
    || (g.siembra_id && x.siembra_id === g.siembra_id));
  const trasplantada = tr.length > 0;
  const cosechado = ficha?.kg_cosechados || 0;
  const hoyIso = hoy();

  // Cada etapa: hecha, en curso, atrasada o por venir. Lo que ya pasó sin
  // registro se marca atrasado: es lo único de la lista que pide hacer algo.
  const estado = (hecha, desde, hasta) => hecha ? ["hecha", "hecho"]
    : (desde && desde < hoyIso && (!hasta || hasta < hoyIso)) ? ["atrasada", "sin registrar"]
    : (desde && desde <= hoyIso) ? ["curso", "en curso"]
    : ["futura", "por venir"];

  const etapas = [
    !t.directa && {
      nombre: "Siembra en bandeja", fecha: t.inicio,
      e: estado(sembrada, t.inicio),
      detalle: sembrada && g.sembrada_el ? `registrada el ${fechaCorta(g.sembrada_el)}` : "",
      boton: sembrada ? "" : `<button type="button" class="secundario" data-panel-sembrar>Registrar siembra</button>`,
    },
    {
      nombre: t.directa ? "Siembra directa" : "Trasplante al bancal", fecha: t.campo,
      e: t.directa ? estado(sembrada, t.campo) : estado(trasplantada, t.campo),
      detalle: t.directa
        ? (sembrada && g.sembrada_el ? `registrada el ${fechaCorta(g.sembrada_el)}` : "")
        : (trasplantada ? `registrado el ${fechaCorta(tr[0].fecha)}${
            tr[0].dias_reales ? ` · ${tr[0].dias_reales} días en bandeja` : ""}` : ""),
      boton: t.directa
        ? (sembrada ? "" : `<button type="button" class="secundario" data-panel-sembrar>Registrar siembra</button>`)
        : (trasplantada ? "" : `<button type="button" class="secundario" data-panel-trasplantar>Registrar trasplante</button>`),
    },
    t.inicioCosecha && {
      nombre: "Cosecha", fecha: t.inicioCosecha, hasta: t.fin,
      e: estado(false, t.inicioCosecha, t.fin),
      // Las cosechas se cargan por cultivo, no por generación: lo que hay es
      // el total del cultivo, y se dice así para no inventar un número.
      detalle: cosechado ? `${num(cosechado, 1)} kg cosechados de ${esc(g.cultivo)} en total` : "",
      boton: "",
    },
  ].filter(Boolean);

  const lugar = g.sector && bancalesDe(g).length
    ? `${esc(g.sector)} · bancal${bancalesDe(g).length > 1 ? "es" : ""} ${bancalesDe(g).join(", ")}`
    : "sin ubicar en el mapa";

  return `<aside class="panel-gen" role="dialog" aria-label="${esc(g.cultivo)} ${nombreGen(g)}">
    <div class="panel-cab">
      <div>
        <h3>${esc(g.cultivo)} <span>${nombreGen(g)}</span></h3>
        <span class="etiqueta ${sembrada ? "ok" : ""}">${sembrada ? "sembrada" : "planificada"}</span>
      </div>
      <button type="button" class="cerrar-panel" id="cerrar-panel" aria-label="Cerrar">&times;</button>
    </div>

    <div class="panel-etapas">
      ${etapas.map((x) => `<div class="etapa ${x.e[0]}">
        <div class="etapa-marca"></div>
        <div class="etapa-texto">
          <b>${x.nombre}</b>
          <span>${fechaCorta(x.fecha)}${x.hasta ? ` al ${fechaCorta(x.hasta)}` : ""} · ${x.e[1]}</span>
          ${x.detalle ? `<small>${x.detalle}</small>` : ""}
          ${x.boton}
        </div>
      </div>`).join("")}
    </div>

    <div class="datos">
      <div class="dato"><span>Dónde</span><b>${lugar}</b></div>
      <div class="dato"><span>Camas</span><b>${num(Number(g.camas) || 0, 1)}</b></div>
      <div class="dato"><span>Método</span><b>${esc(g.metodo || (t.directa ? "Siembra directa" : "Trasplante"))}</b></div>
      ${p.lineas_bancal ? `<div class="dato"><span>Marco</span><b>${num(p.lineas_bancal)} líneas a ${num(p.distancia_cm)} cm</b></div>` : ""}
    </div>

    <div class="panel-acciones">
      <button type="button" class="secundario" data-editar-gen="${esc(g.id)}">Editar</button>
      <button type="button" class="secundario" data-panel-ficha>Ver ficha del cultivo</button>
      ${sembrada ? "" : `<button type="button" class="secundario peligro" data-panel-quitar>Sacar del plan</button>`}
    </div>
    <p class="nota">Para correr las fechas, arrastrá la barra en el gráfico.</p>
  </aside>`;
}

function prepararPanelGeneracion() {
  // Tocar una barra abre su detalle; tocarla de nuevo lo cierra.
  document.querySelectorAll("[data-gen]").forEach((fila) => {
    fila.addEventListener("click", () => {
      if (fila.dataset.recienMovida) { delete fila.dataset.recienMovida; return; }
      genPanel = genPanel === fila.dataset.gen ? "" : fila.dataset.gen;
      const g = (leer(LS.generaciones, []) || []).find((x) => x.id === genPanel);
      render("plan", true);
      // El estado del trasplante sale de la ficha del cultivo.
      if (g) traerFicha(g.cultivo);
    });
  });

  const panel = $(".panel-gen");
  if (!panel) return;
  const g = (leer(LS.generaciones, []) || []).find((x) => x.id === genPanel);
  if (!g) return;

  $("#cerrar-panel").onclick = () => { genPanel = ""; render("plan", true); };
  // Escape también cierra, que es lo que se espera de un panel así.
  document.onkeydown = (e) => {
    if (e.key === "Escape" && genPanel) { genPanel = ""; render("plan", true); }
  };

  // Registrar algo lleva al formulario con los datos puestos. Lo que marca la
  // etapa como hecha es ese registro, no un tilde en el plan.
  panel.querySelectorAll("[data-panel-sembrar]").forEach((b) => {
    b.onclick = () => {
      const lugar = bancalesPlanificados(g.cultivo, g.generacion)[0] || {};
      siembraSugerida = { cultivo: g.cultivo, generacion: g.generacion,
                          directa: !g.fecha_almacigo, camas: Number(g.camas) || 0,
                          variedad: g.variedad || "", sector: lugar.sector || g.sector || "",
                          bancal: lugar.bancal || "", cuando: g.fecha_almacigo || g.fecha_campo };
      genPanel = "";
      render("siembras");
    };
  });
  panel.querySelectorAll("[data-panel-trasplantar]").forEach((b) => {
    b.onclick = () => {
      trasplanteSugerido = { cultivo: g.cultivo, generacion: g.generacion,
                             siembra_id: g.siembra_id || "" };
      genPanel = "";
      render("trasplantes");
    };
  });
  const ficha = panel.querySelector("[data-panel-ficha]");
  if (ficha) ficha.onclick = () => {
    cultivoAbierto = g.cultivo; genPanel = "";
    render("plan");
  };
  const quitar = panel.querySelector("[data-panel-quitar]");
  if (quitar) quitar.onclick = () => {
    if (!confirm(`¿Sacar ${g.cultivo} ${nombreGen(g)} del plan?`)) return;
    guardarRegistro("generacion_borrar", { generacion_id: g.id }, "Sacada del plan ✓");
    const quedan = (leer(LS.generaciones, []) || []).filter((x) => x.id !== g.id);
    escribir(LS.generaciones, quedan);
    replanearCultivo(g.cultivo, quedan);
    genPanel = "";
    render("plan", true);
  };
}

// Correr una generación arrastrándola en el gráfico. Es la forma natural de
// decir "esto va dos semanas más tarde": se ve contra qué queda, que es
// justamente lo que no se ve escribiendo una fecha en un formulario.
//
// Va con eventos de puntero, que son los mismos para el mouse y para el dedo.
// Durante el arrastre solo se mueve la barra; recién al soltar se guarda, para
// que corregir la mano no mande veinte registros.
function engancharArrastre() {
  const grafico = $(".plan-grafico");
  if (!grafico) return;
  const pista = grafico.querySelector(".plan-gen .plan-pista");
  if (!pista) return;

  // Cuántos días mide un píxel, para traducir el movimiento a fechas.
  const meses = grafico.querySelectorAll(".plan-meses .mes").length || 12;
  const diasTotales = Math.round(meses * 30.44);
  const porPixel = diasTotales / pista.getBoundingClientRect().width;

  document.querySelectorAll("[data-mover]").forEach((fila) => {
    const barra = fila.querySelector(".plan-pista");
    let x0 = 0, corrido = 0, arrastrando = false;

    barra.onpointerdown = (e) => {
      // Con el botón derecho no, y en el teléfono sin robarle el scroll a la
      // página: solo se toma el gesto si es claramente horizontal.
      if (e.button !== 0 && e.pointerType === "mouse") return;
      arrastrando = true;
      x0 = e.clientX;
      corrido = 0;
      try { barra.setPointerCapture(e.pointerId); } catch (_) { /* sin captura igual anda */ }
      fila.classList.add("arrastrando");
    };

    barra.onpointermove = (e) => {
      if (!arrastrando) return;
      corrido = Math.round((e.clientX - x0) * porPixel);
      barra.style.transform = `translateX(${e.clientX - x0}px)`;
      fila.querySelector(".plan-nombre").dataset.corrido = corrido
        ? `${corrido > 0 ? "+" : ""}${corrido} d` : "";
    };

    const soltar = (e) => {
      if (!arrastrando) return;
      arrastrando = false;
      fila.classList.remove("arrastrando");
      barra.style.transform = "";
      delete fila.querySelector(".plan-nombre").dataset.corrido;
      try { barra.releasePointerCapture(e.pointerId); } catch (_) { /* ya soltado */ }
      if (!corrido) return;
      // Si se movio, el clic que el navegador dispara al soltar no abre el
      // panel: se arrastraba, no se queria ver el detalle.
      fila.dataset.recienMovida = "1";
      correrGeneracion(fila.dataset.mover, corrido);
    };
    barra.onpointerup = soltar;
    barra.onpointercancel = soltar;
  });
}

// Guarda la generación con sus fechas corridas. Se piden las dos porque una
// siembra directa no tiene fecha de bandeja y un trasplante sí.
function correrGeneracion(id, dias) {
  const gens = leer(LS.generaciones, []) || [];
  const g = gens.find((x) => x.id === id);
  if (!g || !dias) return;

  const corrida = (f) => (f ? sumarDias(f, dias) : "");
  const nueva = {
    ...g,
    fecha_almacigo: corrida(g.fecha_almacigo),
    fecha_campo: corrida(g.fecha_campo),
  };
  const antes = g.fecha_almacigo || g.fecha_campo;
  const despues = nueva.fecha_almacigo || nueva.fecha_campo;

  guardarRegistro("generaciones", {
    generacion_id: g.id, cultivo: g.cultivo, generacion: g.generacion,
    metodo: g.metodo, fecha_almacigo: nueva.fecha_almacigo,
    fecha_campo: nueva.fecha_campo, camas: g.camas, sector: g.sector,
    // Solo números: si la planilla alguna vez convirtió "4, 5, 6" en una
    // fecha, reenviarlo tal cual lo volvía a guardar dañado.
    bancales: bancalesDe(g).join(", "), estado: g.estado, origen: "AMA",
  }, `${g.cultivo} ${nombreGen(g)}: ${fechaCorta(antes)} → ${fechaCorta(despues)} ✓`);

  // Se mueve en la copia local para que el gráfico responda al instante.
  escribir(LS.generaciones, gens.map((x) => (x.id === id ? nueva : x)));
  render("plan", true);
}

// La barra de la sección Plan. Estaba repetida en cada pantalla, con el
// formato variando un poco en cada una: se escribe una sola vez acá.
//
// En el teléfono es una fila de pestañas; en pantallas anchas es una columna a
// la izquierda que se pliega a solo iconos. Planificar y mirar el campo es
// trabajo de notebook, y en columna quedan a la vista todas las secciones sin
// comerle ancho al gráfico.
const SECCIONES_PLAN = [
  { id: "lista", nombre: "Resumen", icono: "☰", siempre: true },
  { id: "planificar", nombre: "Cultivos", icono: "🌱", siempre: true },
  { id: "grafico", nombre: "Plan estratégico", icono: "▤", soloAncha: true },
  { id: "mapa", nombre: "Mapa", icono: "▦", soloAncha: true },
];

// Ancho mínimo para planificar de verdad. Debajo de eso, el gráfico y el mapa
// no se leen: veinticinco bancales en 375 px son columnas de quince píxeles.
const ANCHO_PLANIFICAR = 900;
const pantallaAncha = () => window.innerWidth >= ANCHO_PLANIFICAR;

function barraDePlan(activa) {
  return `<nav class="plan-nav${leer(LS.planPlegado, false) ? " plegada" : ""}">
    <button type="button" class="plan-nav-btn plegar" id="plegar-plan"
            title="Mostrar u ocultar los nombres">
      <span class="ico">☰</span><span class="txt">Ocultar</span>
    </button>
    ${SECCIONES_PLAN.filter((s) => s.siempre || pantallaAncha()).map((s) => `
      <button type="button" class="plan-nav-btn${s.id === activa ? " activa" : ""}"
              data-plan-vista="${s.id}">
        <span class="ico">${s.icono}</span><span class="txt">${esc(s.nombre)}</span>
      </button>`).join("")}
    <button type="button" class="plan-nav-btn" data-ir-configuracion>
      <span class="ico">⚙</span><span class="txt">Configuración</span>
    </button>
  </nav>`;
}

// El gráfico y el mapa no se muestran en pantalla angosta, y se dice por qué.
const tarjetaSoloNotebook = (que) => `<div class="tarjeta">
  <h2>${esc(que)}</h2>
  <p class="nota">Esta pantalla es para la computadora. ${esc(que)} necesita
  ancho para leerse: veinticinco bancales en la pantalla de un teléfono quedan
  en columnas de quince píxeles, y las fechas no entran.</p>
  <p class="nota">Desde el teléfono, <b>Resumen</b> tiene todo lo planificado:
  los cultivos, los sectores y lo que toca sembrar.</p>
</div>`;

// La sección Plan tiene tres pantallas y cada una engancha lo suyo.
function prepararPlan() {
  prepararInicio();
  prepararGeneraciones();
  prepararMapa();
  prepararEdicionCultivos();
}
