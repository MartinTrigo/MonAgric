// js/plan-mapa.js     — AMA Producción
//
// Mapa de cultivos: el lienzo con sectores y generaciones, zoom y
// desplazamiento, arrastrar sectores y ubicar generaciones en bancales.
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos. Se partió app.js el 30/09/2026 sin cambiar código.

// ---- Mapa de cultivos ----
// Dónde va cada generación y por cuánto tiempo. Es la otra mitad de la
// planificación: el plan estratégico dice CUÁNDO, el mapa dice DÓNDE, y hasta
// que las dos coinciden no se sabe si el plan entra en el campo que hay.
//
// Un bancal se ocupa desde que la planta va a tierra hasta que termina la
// cosecha. El tiempo en bandeja no cuenta: ese no ocupa bancal.
let genSeleccionada = "";

const bancalesDe = (g) => String(g.bancales || "")
  .split(",").map((x) => parseInt(x, 10)).filter((n) => n > 0);

function ocupacionDe(g) {
  const t = tramosDe(g);
  if (!t) return null;
  return { desde: t.campo, hasta: t.fin };
}

// Los bancales que una generación tomaría si se la pone empezando en `inicio`.
// Se usa tanto para dibujar la vista previa como para guardar.
function bancalesQueOcuparia(g, inicio, cuantosHay) {
  const n = Math.max(1, Math.round(Number(g.camas) || 1));
  const desde = Math.min(inicio, Math.max(1, cuantosHay - n + 1));
  return Array.from({ length: n }, (_, i) => desde + i).filter((b) => b <= cuantosHay);
}

// Qué generaciones chocarían con esta si se la pusiera en esos bancales: mismo
// sector, bancal compartido y fechas superpuestas.
function chocanCon(g, sector, bancales, todas) {
  const o = ocupacionDe(g);
  if (!o) return [];
  const set = new Set(bancales);
  return todas.filter((x) => {
    if (x.id === g.id || claveArea(x.sector) !== claveArea(sector)) return false;
    if (!bancalesDe(x).some((b) => set.has(b))) return false;
    const ox = ocupacionDe(x);
    return ox && ox.desde <= o.hasta && o.desde <= ox.hasta;
  });
}

// Medidas del lienzo, en píxeles a zoom 100 %. Un bancal es una columna y un
// mes una fila; el tiempo va hacia abajo, como en la planilla de Heirloom.
const LZ = { bancal: 22, mes: 36, cab: 50, meses: 34, borde: 8, paso: 25, hueco: 50 };

// Dónde está mirando el mapa: desplazamiento y zoom. Vive fuera del render para
// que no se pierda al redibujar después de ubicar algo. null = todavía no se
// acomodó: la primera vez se ajusta para que entre todo el campo.
let vistaMapa = null;

// La temporada en píxeles: de julio a junio, un día mide lo mismo siempre.
function escalaTemporada() {
  const d0 = inicioDeTemporada();
  const d1 = new Date(d0); d1.setFullYear(d1.getFullYear() + 1);
  const ini = Math.floor(d0.getTime() / 86400000);
  const dias = Math.max(1, Math.floor(d1.getTime() / 86400000) - ini);
  const alto = 12 * LZ.mes;
  return { d0, d1, ini, dias, alto, y: (iso) => ((diaDe(iso) - ini) * alto) / dias };
}

/* Dónde va cada sector en el lienzo.
   La posición se guarda en las columnas "fila" y "columna" del sector, en
   pasos de 25 px: columna = x / 25 + 1 y fila = y / 25 + 1. El +1 mantiene el
   0 como "nunca se acomodó", que es lo que tienen todos los sectores cargados
   antes (se revisaron las seis chacras el 28/09: ninguno había usado la
   disposición en filas y columnas que había antes). Así no hizo falta tocar el
   servidor ni la planilla. Los que nunca se movieron van en fila, debajo de los
   que sí. */
function bloquesDelMapa() {
  const alto = escalaTemporada().alto;
  const lista = sectores().map((s) => {
    const n = Number(s.bancales) || 0;
    return {
      sector: s.sector, n,
      w: LZ.meses + n * LZ.bancal + 2 * LZ.borde,
      h: LZ.cab + alto + LZ.borde,
      x: Number(s.columna) > 0 ? (Number(s.columna) - 1) * LZ.paso : null,
      y: Number(s.fila) > 0 ? (Number(s.fila) - 1) * LZ.paso : null,
    };
  });
  const puestos = lista.filter((b) => b.x !== null && b.y !== null);
  // En filas de hasta ~2000 px: todos en una sola fila, "Ajustar" los dejaba
  // en un 25 % ilegible con media ventana vacía abajo.
  const ANCHO_FILA = 2000;
  let x = 0, altoFila = 0;
  let y = puestos.length ? Math.max(...puestos.map((b) => b.y + b.h)) + LZ.hueco : 0;
  lista.forEach((b) => {
    if (b.x !== null && b.y !== null) return;
    if (x > 0 && x + b.w > ANCHO_FILA) { x = 0; y += altoFila + LZ.hueco; altoFila = 0; }
    b.x = x; b.y = y;
    x += b.w + LZ.hueco;
    altoFila = Math.max(altoFila, b.h);
  });
  return lista;
}

// Los bancales de un sector que están libres en las fechas de una generación.
// Es la franja verde que aparece al arrastrarla: se ve el hueco antes de soltar.
function bancalesLibres(g, sector, n, todas) {
  const libres = [];
  for (let b = 1; b <= n; b++) {
    if (!chocanCon(g, sector, [b], todas).length) libres.push(b);
  }
  return libres;
}

// La franja de bancales libres, en tramos seguidos para no dibujar veinticinco
// cajitas sueltas.
function franjaLibre(g, sector, n, todas, e) {
  const o = ocupacionDe(g);
  if (!o) return "";
  const top = Math.max(0, e.y(o.desde));
  const alto = Math.min(e.alto, e.y(o.hasta)) - top;
  if (alto <= 0) return "";
  const libres = bancalesLibres(g, sector, n, todas);
  const tramos = [];
  libres.forEach((b) => {
    const t = tramos[tramos.length - 1];
    if (t && t[1] === b - 1) t[1] = b; else tramos.push([b, b]);
  });
  return tramos.map(([a, z]) => `<i class="lz-libre" style="left:${(a - 1) * LZ.bancal}px;
    width:${(z - a + 1) * LZ.bancal}px;top:${top}px;height:${alto}px"></i>`).join("");
}

function mapaDeCultivos() {
  const todas = (leer(LS.generaciones, []) || []);
  const asignadas = todas.filter((g) => g.sector && bancalesDe(g).length);
  const sueltas = todas.filter((g) => !(g.sector && bancalesDe(g).length));
  const sel = todas.find((g) => g.id === genSeleccionada);
  const e = escalaTemporada();
  const bloques = bloquesDelMapa();

  if (!bloques.length) {
    return `<div class="tarjeta">
      <h2>Mapa de cultivos</h2>
      ${barraDePlan("mapa")}
      <p class="nota">Todavía no hay sectores. Cargalos en Configuración y
      aparecen acá para ubicar las generaciones.</p>
    </div>`;
  }

  // Los meses del eje vertical, con su línea.
  const meses = [];
  const cur = new Date(e.d0);
  while (cur < e.d1) {
    const sig = new Date(cur); sig.setMonth(sig.getMonth() + 1);
    const top = e.y(isoDe(cur));
    meses.push({ nombre: MESES_CORTOS[cur.getMonth()], top, alto: e.y(isoDe(sig)) - top });
    cur.setMonth(cur.getMonth() + 1);
  }
  const hoyY = e.y(hoy());

  const puesta = (g) => {
    const o = ocupacionDe(g);
    if (!o) return "";
    const bs = bancalesDe(g);
    const desdeB = Math.min(...bs), hastaB = Math.max(...bs);
    const top = Math.max(0, e.y(o.desde));
    const fin = Math.min(e.alto, e.y(o.hasta));
    if (fin <= top) return "";
    const sembrada = ("sembrada" in g) ? g.sembrada : g.estado === "Sembrado";
    const ancho = (hastaB - desdeB + 1) * LZ.bancal;
    // Con dos bancales o más entra el nombre acostado; con uno, va parado.
    const acostado = ancho >= 2 * LZ.bancal;
    return `<div class="lz-puesta${sembrada ? " sembrada" : ""}${acostado ? " acostada" : ""}${
      g.id === genSeleccionada ? " elegida" : ""}" data-puesta="${esc(g.id)}"
      style="left:${(desdeB - 1) * LZ.bancal}px;width:${ancho - 1}px;top:${top}px;
             height:${fin - top}px;background:${colorEtapa(g.cultivo, sembrada ? "cosecha" : "campo")}"
      title="${esc(g.cultivo)} ${nombreGen(g)} · bancal ${bs.join(", ")} · ${
        fechaCorta(o.desde)} a ${fechaCorta(o.hasta)}${sembrada ? " · sembrada" : ""}">
      <span>${esc(g.cultivo)} ${nombreGen(g)}${acostado
        ? `<small>${fechaCorta(o.desde)} – ${fechaCorta(o.hasta)}</small>` : ""}</span>
    </div>`;
  };

  const bloque = (b) => {
    const aqui = asignadas.filter((g) => claveArea(g.sector) === claveArea(b.sector));
    return `<div class="lz-bloque" data-bloque="${esc(b.sector)}"
                 style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px">
      <div class="lz-cab" data-agarrar="${esc(b.sector)}" title="Arrastrá para mover el sector">
        <span class="lz-asa">⠿</span><b>${esc(b.sector)}</b>
        <span class="lz-dato">${b.n} bancales · ${aqui.length} generaciones</span>
      </div>
      <!-- Los números de bancal arriba: sin ellos hay que contar columnas
           para saber cuál es el 17. -->
      <div class="lz-numeros" style="left:${LZ.borde + LZ.meses}px">
        ${Array.from({ length: b.n }, (_, i) => `<span${
          (i + 1) % 5 === 0 || i === 0 ? ' class="marcado"' : ""}>${i + 1}</span>`).join("")}
      </div>
      <div class="lz-meses" style="left:${LZ.borde}px;top:${LZ.cab}px;height:${e.alto}px">
        ${meses.map((m) => `<span style="top:${m.top}px;height:${m.alto}px">${m.nombre}</span>`).join("")}
      </div>
      <div class="lz-grilla" data-grilla="${esc(b.sector)}" data-n="${b.n}"
           style="left:${LZ.borde + LZ.meses}px;top:${LZ.cab}px;width:${b.n * LZ.bancal}px;
                  height:${e.alto}px;--bancal:${LZ.bancal}px">
        ${meses.slice(1).map((m) => `<i class="lz-linea-mes" style="top:${m.top}px"></i>`).join("")}
        ${sel ? franjaLibre(sel, b.sector, b.n, todas, e) : ""}
        ${aqui.map(puesta).join("")}
        ${hoyY >= 0 && hoyY <= e.alto ? `<i class="lz-hoy" style="top:${hoyY}px"></i>` : ""}
        <div class="lz-previa"></div>
      </div>
    </div>`;
  };

  const porCultivo = new Map();
  sueltas.forEach((g) => {
    if (!porCultivo.has(g.cultivo)) porCultivo.set(g.cultivo, []);
    porCultivo.get(g.cultivo).push(g);
  });

  const o = sel ? ocupacionDe(sel) : null;
  return `
  <div class="tarjeta">
    <h2>Mapa de cultivos <small>${asignadas.length} de ${todas.length} ubicadas</small></h2>
    ${barraDePlan("mapa")}

    <div class="lz-estado">${sel
      ? `<b>${esc(sel.cultivo)} ${nombreGen(sel)}</b>
         <span>${Math.max(1, Math.round(Number(sel.camas) || 1))} bancal(es)${
           o ? ` · ${fechaCorta(o.desde)} a ${fechaCorta(o.hasta)}` : ""}${
           sel.sector ? ` · ${esc(sel.sector)} ${bancalesDe(sel).join(", ")}` : " · sin ubicar"}</span>
         <span class="lz-ayuda">En verde, los bancales libres en esas fechas: tocá uno o arrastrala.</span>
         ${sel.sector ? `<button type="button" class="secundario" id="sacar-del-mapa">Sacar del mapa</button>` : ""}
         <button type="button" class="secundario" id="cancelar-eleccion">Listo</button>`
      : `<span class="lz-ayuda">Arrastrá un sector por su título para acomodarlo como está
         en el campo. Arrastrá una generación de la lista a un bancal, o una ya puesta a
         otro. La rueda del mouse acerca y aleja; arrastrando un lugar vacío se mueve el mapa.</span>`}
    </div>

    <div class="mapa-con-lista">
      <div class="mapa-panel">
        <div class="mapa-zoom">
          <button type="button" class="secundario" data-zoom="-" title="Alejar">−</button>
          <span id="nivel-zoom">100%</span>
          <button type="button" class="secundario" data-zoom="+" title="Acercar">+</button>
          <button type="button" class="secundario ajustar" id="ajustar-mapa"
                  title="Que entre todo el campo">Ajustar</button>
        </div>
        <div class="lz-vista" id="lz-vista">
          <div class="lz-lienzo" id="lz-lienzo">${bloques.map(bloque).join("")}</div>
        </div>
      </div>

      <div class="lista-panel">
        <h3 class="sub">Sin ubicar <small>${sueltas.length}</small></h3>
        <div class="lista-scroll">
    ${porCultivo.size ? [...porCultivo.entries()].map(([cultivo, lista]) => `
      <details class="gen-cultivo"${sel && sel.cultivo === cultivo ? " open" : ""}>
        <summary><i class="lz-color" style="background:${colorEtapa(cultivo, "campo")}"></i>${
          esc(cultivo)} <span>${lista.length}</span></summary>
        ${lista.map((g) => {
          const oc = ocupacionDe(g);
          return `<div class="registro elegible lz-arrastrable${g.id === genSeleccionada ? " elegida" : ""}"
                       data-elegir="${esc(g.id)}" role="button" tabindex="0"
                       title="Arrastrala a un bancal, o tocala y después tocá el bancal">
            <div>
              <div class="detalle">${nombreGen(g, todas)} <span class="gen">${
                Math.max(1, Math.round(Number(g.camas) || 1))} bancal(es)</span></div>
              <div class="cuando">${oc ? `ocupa del ${fechaCorta(oc.desde)} al ${fechaCorta(oc.hasta)}`
                : "sin fechas suficientes"}</div>
            </div>
            <span class="lz-asa">⠿</span>
          </div>`;
        }).join("")}
      </details>`).join("")
      : `<p class="nota">Están todas ubicadas.</p>`}
        </div>
      </div>
    </div>
  </div>`;
}

// Un arrastre con el mouse o el dedo. Se escucha en la ventana y no en el
// elemento: al arrastrar una generación desde la lista, el puntero sale de la
// lista y tiene que seguir llegando. `umbral` son los píxeles que hay que mover
// para que cuente como arrastre y no como un toque.
function seguirArrastre(ev, { alEmpezar, alMover, alSoltar, alTocar, umbral = 5 }) {
  const x0 = ev.clientX, y0 = ev.clientY;
  let arrastrando = false;
  const mover = (e) => {
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (!arrastrando) {
      if (Math.abs(dx) < umbral && Math.abs(dy) < umbral) return;
      arrastrando = true;
      if (alEmpezar) alEmpezar(e);
    }
    e.preventDefault();
    alMover(e, dx, dy);
  };
  const soltar = (e) => {
    window.removeEventListener("pointermove", mover);
    window.removeEventListener("pointerup", soltar);
    window.removeEventListener("pointercancel", soltar);
    if (arrastrando) alSoltar(e, e.type === "pointercancel");
    else if (alTocar) alTocar(e);
  };
  window.addEventListener("pointermove", mover, { passive: false });
  window.addEventListener("pointerup", soltar);
  window.addEventListener("pointercancel", soltar);
}

function prepararMapa() {
  const vista = $("#lz-vista");
  if (!vista) return;
  const lienzo = $("#lz-lienzo");
  const todas = leer(LS.generaciones, []) || [];
  const e = escalaTemporada();
  const bloques = bloquesDelMapa();

  // ---- zoom y desplazamiento ----
  const aplicar = () => {
    lienzo.style.transform = `translate(${vistaMapa.x}px, ${vistaMapa.y}px) scale(${vistaMapa.s})`;
    $("#nivel-zoom").textContent = `${Math.round(vistaMapa.s * 100)}%`;
  };
  // Que entre todo el campo en la vista, centrado.
  const ajustar = () => {
    const minX = Math.min(...bloques.map((b) => b.x)), minY = Math.min(...bloques.map((b) => b.y));
    const maxX = Math.max(...bloques.map((b) => b.x + b.w)), maxY = Math.max(...bloques.map((b) => b.y + b.h));
    const vw = vista.clientWidth, vh = vista.clientHeight;
    const s = Math.max(0.25, Math.min(1.5, (vw - 40) / (maxX - minX), (vh - 40) / (maxY - minY)));
    vistaMapa = { s, x: (vw - (maxX - minX) * s) / 2 - minX * s, y: 20 - minY * s };
  };
  if (!vistaMapa) ajustar();
  aplicar();

  const zoomEn = (px, py, factor) => {
    const s = Math.max(0.25, Math.min(3, vistaMapa.s * factor));
    const k = s / vistaMapa.s;
    vistaMapa = { s, x: px - (px - vistaMapa.x) * k, y: py - (py - vistaMapa.y) * k };
    aplicar();
  };
  // La rueda acerca y aleja sobre el puntero, como en cualquier mapa: lo que
  // está bajo el mouse se queda quieto.
  vista.onwheel = (ev) => {
    ev.preventDefault();
    const r = vista.getBoundingClientRect();
    zoomEn(ev.clientX - r.left - vista.clientLeft, ev.clientY - r.top - vista.clientTop,
      ev.deltaY < 0 ? 1.1 : 1 / 1.1);
  };
  document.querySelectorAll("[data-zoom]").forEach((b) => {
    b.onclick = () => zoomEn(vista.clientWidth / 2, vista.clientHeight / 2,
      b.dataset.zoom === "+" ? 1.25 : 1 / 1.25);
  });
  $("#ajustar-mapa").onclick = () => { ajustar(); aplicar(); };

  // Del punto de la pantalla al punto del lienzo, deshaciendo zoom y desplazamiento.
  const aLienzo = (cx, cy) => {
    // El lienzo arranca adentro del borde de la ventana, no en su canto.
    const r = vista.getBoundingClientRect();
    const x = cx - r.left - vista.clientLeft, y = cy - r.top - vista.clientTop;
    return { x: (x - vistaMapa.x) / vistaMapa.s, y: (y - vistaMapa.y) / vistaMapa.s };
  };
  // Qué sector y qué bancal hay bajo el puntero. Se mira el sector entero, no
  // solo la grilla: soltar un poco arriba o abajo igual cae en su bancal.
  const bancalBajo = (cx, cy) => {
    const p = aLienzo(cx, cy);
    for (const b of bloques) {
      const gx = b.x + LZ.borde + LZ.meses;
      if (p.x >= gx && p.x < gx + b.n * LZ.bancal && p.y >= b.y && p.y <= b.y + b.h) {
        return { b, bancal: Math.floor((p.x - gx) / LZ.bancal) + 1 };
      }
    }
    return null;
  };

  // ---- ubicar generaciones ----
  const guardarUbicacion = (g, sector, bancales) => {
    guardarRegistro("generaciones", {
      generacion_id: g.id, cultivo: g.cultivo, generacion: g.generacion,
      metodo: g.metodo, fecha_almacigo: g.fecha_almacigo,
      fecha_campo: g.fecha_campo, camas: g.camas,
      sector, bancales: bancales.join(", "),
      estado: g.estado, origen: "AMA",
    }, sector
      ? `${g.cultivo} ${nombreGen(g)} → ${sector} ${bancales.join(", ")} ✓`
      : `${g.cultivo} ${nombreGen(g)} sacada del mapa ✓`);
    // Se mueve en la copia local para que el mapa responda al instante.
    escribir(LS.generaciones, todas.map((x) => x.id === g.id
      ? { ...x, sector, bancales: bancales.join(", ") } : x));
    genSeleccionada = "";
    render("plan", true);
  };

  // Ponerla en un bancal. Se avisa si choca pero no se prohíbe: dos cultivos
  // pueden compartir un bancal a propósito, y quien está en el campo sabe mejor
  // que la cuenta.
  const ubicar = (g, sector, n, desde) => {
    const bs = bancalesQueOcuparia(g, desde, n);
    if (!bs.length) return aviso("Ese sector no tiene bancales suficientes.", true);
    if (claveArea(g.sector) === claveArea(sector) && bancalesDe(g).join() === bs.join()) {
      render("plan", true);           // quedó donde estaba
      return;
    }
    const choques = chocanCon(g, sector, bs, todas);
    if (choques.length) {
      const cuales = choques.slice(0, 3).map((x) => `${x.cultivo} G${x.generacion}`).join(", ");
      if (!confirm(`Ahí se superpone con ${cuales}` +
        `${choques.length > 3 ? ` y ${choques.length - 3} más` : ""}.\n¿Ponerla igual?`)) {
        render("plan", true);
        return;
      }
    }
    guardarUbicacion(g, sector, bs);
  };

  // Lo que se ve mientras se arrastra una generación: en el sector de abajo,
  // la franja de bancales libres en sus fechas y dónde caería. Verde si entra,
  // rojo si pisa a otra.
  const limpiarPrevia = () => document.querySelectorAll(".lz-previa")
    .forEach((p) => { p.innerHTML = ""; });
  const mostrarPrevia = (g, destino, agarre) => {
    limpiarPrevia();
    if (!destino) return;
    const { b, bancal } = destino;
    const o = ocupacionDe(g);
    if (!o) return;
    const bs = bancalesQueOcuparia(g, Math.max(1, bancal - agarre), b.n);
    if (!bs.length) return;
    const top = Math.max(0, e.y(o.desde));
    const alto = Math.min(e.alto, e.y(o.hasta)) - top;
    const choca = chocanCon(g, b.sector, bs, todas).length > 0;
    const previa = document.querySelector(`.lz-grilla[data-grilla="${CSS.escape(b.sector)}"] .lz-previa`);
    previa.innerHTML = franjaLibre(g, b.sector, b.n, todas, e)
      + `<i class="lz-destino${choca ? " choca" : ""}" style="left:${(bs[0] - 1) * LZ.bancal}px;
          width:${bs.length * LZ.bancal}px;top:${top}px;height:${Math.max(alto, 4)}px"></i>`;
  };

  // Arrastrar una generación: desde la lista o desde el mapa. Lo que sigue al
  // puntero es una etiqueta; la ubicación se decide por el bancal bajo el
  // puntero, y la altura no se toca porque la fijan las fechas del plan.
  const arrastrarGeneracion = (ev, g, agarre, original) => {
    let flotante = null, destino = null;
    seguirArrastre(ev, {
      alEmpezar: () => {
        flotante = document.createElement("div");
        flotante.className = "lz-flotante";
        flotante.style.background = colorEtapa(g.cultivo, "campo");
        flotante.textContent = `${g.cultivo} ${nombreGen(g)} · ${
          Math.max(1, Math.round(Number(g.camas) || 1))} bancal(es)`;
        document.body.appendChild(flotante);
        document.body.classList.add("lz-arrastrando");
        if (original) original.classList.add("levantada");
      },
      alMover: (m) => {
        flotante.style.left = `${m.clientX + 14}px`;
        flotante.style.top = `${m.clientY + 10}px`;
        destino = bancalBajo(m.clientX, m.clientY);
        mostrarPrevia(g, destino, agarre);
      },
      alSoltar: (_, cancelado) => {
        flotante.remove();
        document.body.classList.remove("lz-arrastrando");
        limpiarPrevia();
        if (original) original.classList.remove("levantada");
        if (cancelado || !destino) return;
        ubicar(g, destino.b.sector, destino.b.n, Math.max(1, destino.bancal - agarre));
      },
      alTocar: () => {
        genSeleccionada = genSeleccionada === g.id ? "" : g.id;
        render("plan", true);
      },
    });
  };

  // Desde la lista de las que faltan ubicar.
  document.querySelectorAll("[data-elegir]").forEach((el) => {
    const g = todas.find((x) => x.id === el.dataset.elegir);
    if (!g) return;
    el.onpointerdown = (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      arrastrarGeneracion(ev, g, 0, null);
    };
    el.onkeydown = (k) => {
      if (k.key === "Enter" || k.key === " ") {
        k.preventDefault();
        genSeleccionada = genSeleccionada === g.id ? "" : g.id;
        render("plan", true);
      }
    };
  });

  // ---- un solo punto de entrada para el lienzo ----
  // Según dónde se aprieta: una generación puesta se arrastra, el título de un
  // sector mueve el sector, y cualquier otro lugar mueve el mapa. Un toque sin
  // arrastrar sobre un bancal ubica la generación elegida.
  vista.onpointerdown = (ev) => {
    if (ev.button !== 0) return;
    const puestaEl = ev.target.closest("[data-puesta]");
    const agarre = ev.target.closest("[data-agarrar]");

    if (puestaEl) {
      ev.preventDefault();
      const g = todas.find((x) => x.id === puestaEl.dataset.puesta);
      if (!g) return;
      // Cuántos bancales a la derecha de su primer bancal se la agarró: así,
      // agarrando un brócoli de tres bancales por el del medio, al soltar queda
      // donde se ve y no corrida.
      const aqui = bancalBajo(ev.clientX, ev.clientY);
      const primero = Math.min(...bancalesDe(g));
      arrastrarGeneracion(ev, g, aqui ? Math.max(0, aqui.bancal - primero) : 0, puestaEl);
      return;
    }

    if (agarre) {
      ev.preventDefault();
      const b = bloques.find((x) => x.sector === agarre.dataset.agarrar);
      const el = agarre.closest(".lz-bloque");
      seguirArrastre(ev, {
        alEmpezar: () => el.classList.add("levantado"),
        alMover: (_, dx, dy) => {
          el.style.left = `${b.x + dx / vistaMapa.s}px`;
          el.style.top = `${b.y + dy / vistaMapa.s}px`;
        },
        alSoltar: (m, cancelado) => {
          el.classList.remove("levantado");
          if (cancelado) { render("plan", true); return; }
          const dx = (m.clientX - ev.clientX) / vistaMapa.s;
          const dy = (m.clientY - ev.clientY) / vistaMapa.s;
          moverSector(b.sector, b.x + dx, b.y + dy);
        },
      });
      return;
    }

    // Mover el mapa. Sin esto el navegador selecciona texto al arrastrar.
    ev.preventDefault();
    const x0 = vistaMapa.x, y0 = vistaMapa.y;
    seguirArrastre(ev, {
      umbral: 3,
      alEmpezar: () => vista.classList.add("moviendo"),
      alMover: (_, dx, dy) => { vistaMapa.x = x0 + dx; vistaMapa.y = y0 + dy; aplicar(); },
      alSoltar: () => vista.classList.remove("moviendo"),
      alTocar: (t) => {
        // Un toque sobre un bancal con una generación elegida: va ahí.
        const g = todas.find((x) => x.id === genSeleccionada);
        const d = g && bancalBajo(t.clientX, t.clientY);
        if (d) ubicar(g, d.b.sector, d.b.n, d.bancal);
      },
    });
  };

  // Guarda la posición nueva de un sector. Se redondea a pasos de 25 px, que es
  // lo que hace que alinearlos a ojo sea fácil. Si quedó algo a la izquierda o
  // arriba del cero, se corre todo el campo junto: las posiciones se guardan
  // desde 1 y un número negativo se perdería.
  const moverSector = (nombre, x, y) => {
    const pos = bloques.map((b) => ({
      sector: b.sector,
      x: Math.round((b.sector === nombre ? x : b.x) / LZ.paso) * LZ.paso,
      y: Math.round((b.sector === nombre ? y : b.y) / LZ.paso) * LZ.paso,
    }));
    const minX = Math.min(...pos.map((p) => p.x)), minY = Math.min(...pos.map((p) => p.y));
    // La vista se corre lo mismo, así en pantalla no salta nada.
    vistaMapa.x += minX * vistaMapa.s;
    vistaMapa.y += minY * vistaMapa.s;
    const lista = sectores().map((s) => {
      const p = pos.find((q) => q.sector === s.sector);
      return { ...s, columna: (p.x - minX) / LZ.paso + 1, fila: (p.y - minY) / LZ.paso + 1 };
    });
    // Solo viajan los sectores que cambiaron de lugar: casi siempre uno, todos
    // cuando el campo entero se corrió para no quedar en negativo.
    const movidos = lista.filter((s) => {
      const antes = sectores().find((x) => x.sector === s.sector) || {};
      return antes.fila !== s.fila || antes.columna !== s.columna;
    }).map((s) => ["config_sector", { sector: s.sector, fila: s.fila, columna: s.columna }]);
    guardarPartesDeConfig({ sectores: lista }, movidos, `${nombre} movido ✓`, "plan");
  };

  const cancelar = $("#cancelar-eleccion");
  if (cancelar) cancelar.onclick = () => { genSeleccionada = ""; render("plan", true); };
  const sacar = $("#sacar-del-mapa");
  if (sacar) sacar.onclick = () => {
    const g = todas.find((x) => x.id === genSeleccionada);
    if (g && confirm(`¿Sacar ${g.cultivo} ${nombreGen(g)} del mapa?\n` +
                     "Queda en el plan, solo sin lugar asignado.")) {
      guardarUbicacion(g, "", []);
    }
  };
}
