// js/plan-cultivos.js — AMA Producción
//
// Plan → Cultivos: alta de series de generaciones, edición de cada una
// (fechas, bancales, variedad, partir), marco y rinde por cultivo.
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos. Se partió app.js el 30/09/2026 sin cambiar código.

// ---- Planificar generaciones desde la app ----
// Escalonar un cultivo es la decisión central de la temporada: nueve
// generaciones de brócoli cada dos semanas dan cosecha continua, y una sola
// grande da un pico y después nada. Se carga así, como serie, porque es como
// se piensa; cargar nueve fechas a mano invita a equivocarse.
// ---- Editar lo planificado ----
// Qué cultivo está desplegado en la lista, qué generación se está editando y
// de qué cultivo se está cambiando el marco. Fuera del render para que un
// redibujado no cierre lo que se estaba mirando.
let cultivoEditando = "";
let genEditando = "";
let marcoEditando = "";

// El día en que arranca una generación: la bandeja, o el bancal si es directa.
const arranqueDe = (g) => g.fecha_almacigo || g.fecha_campo || "";
const esSembrada = (g) => (("sembrada" in g) ? g.sembrada : g.estado === "Sembrado");

/* Cuántos días pasa en bandeja este cultivo EN ESTE PLAN: los que ya tienen
   sus generaciones con fecha a campo. Si todas dicen lo mismo, ese es el dato;
   si no coinciden, se toma el que más se repite. Sirve para que las
   generaciones nuevas salgan iguales a las que ya estaban: antes las nuevas
   se calculaban con el catálogo por estación (30 días en primavera) y las
   que venían del plan tenían 40, así que el mismo repollo trasplantaba en
   fechas distintas según cuándo se lo había cargado (28/09). */
function diasBandejaDelCultivo(cultivo, gens = leer(LS.generaciones, []) || []) {
  const cuenta = {};
  gens.filter((g) => claveArea(g.cultivo) === claveArea(cultivo) && g.fecha_almacigo && g.fecha_campo)
    .forEach((g) => {
      const d = diaDe(g.fecha_campo) - diaDe(g.fecha_almacigo);
      if (d > 0) cuenta[d] = (cuenta[d] || 0) + 1;
    });
  const [dias] = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0] || [];
  return dias ? Number(dias) : 0;
}

// En cuántas partes iguales se puede partir: las que dejan bancales enteros.
function partesPosibles(g) {
  const c = Number(g.camas) || 0;
  if (c < 2 || !Number.isInteger(c)) return [];
  return Array.from({ length: c - 1 }, (_, i) => i + 2).filter((k) => c % k === 0);
}

function formularioGeneracion(g) {
  const sembrada = esSembrada(g);
  const directa = g.metodo === "Siembra directa" || (!g.fecha_almacigo && g.fecha_campo);
  const bloqueo = sembrada ? " disabled" : "";
  return `<form class="editar-gen" data-form-gen="${esc(g.id)}">
    <div class="fila">
      <div>
        <label>¿Cómo se siembra?</label>
        <select name="metodo"${bloqueo}>
          <option value="Trasplante"${directa ? "" : " selected"}>En almácigo</option>
          <option value="Siembra directa"${directa ? " selected" : ""}>Siembra directa</option>
        </select>
      </div>
      <div>
        <label>Bancales</label>
        <input type="text" name="camas" inputmode="decimal" value="${esc(String(g.camas || ""))}">
      </div>
    </div>
    <label>Variedad</label>
    <input type="text" name="variedad" maxlength="40" value="${esc(g.variedad || "")}">
    <div class="fila">
      <div class="solo-almacigo"${directa ? " hidden" : ""}>
        <label>Siembra en bandeja</label>
        <input type="date" name="almacigo" value="${esc(g.fecha_almacigo || "")}"${bloqueo}>
      </div>
      <div>
        <label class="rotulo-campo">${directa ? "Siembra en el bancal" : "A campo <small>(opcional)</small>"}</label>
        <input type="date" name="campo" value="${esc(g.fecha_campo || "")}"${bloqueo}>
      </div>
    </div>
    <!-- Dónde va. Antes solo se podía elegir en el mapa, que en el teléfono no
         está: una generación cargada sin sector no tenía cómo recibirlo y había
         que borrarla y cargarla de nuevo (03/10, un productor). -->
    <div class="fila">
      <div>
        <label>Sector</label>
        <select name="sector">
          <option value="">Sin asignar</option>
          ${sectores().map((s) => `<option${claveArea(s.sector) === claveArea(g.sector) ? " selected" : ""}>${esc(s.sector)}</option>`).join("")}
        </select>
      </div>
      <div>
        <label>Desde el bancal <small>(opcional)</small></label>
        <input type="text" name="desde" inputmode="numeric" value="${bancalesDe(g).length ? Math.min(...bancalesDe(g)) : ""}">
      </div>
    </div>
    ${sembrada ? `<p class="nota">Ya se sembró: las fechas y el método son un hecho y no se cambian.</p>` : ""}
    <div class="editar-gen-botones">
      <button class="principal">Guardar</button>
      <button type="button" class="secundario" data-cancelar-gen>Cancelar</button>
    </div>
    ${partesPosibles(g).length ? `<div class="partir">
      <span>Partir para ubicarla en bancales separados:</span>
      ${partesPosibles(g).map((k) => `<button type="button" class="secundario"
        data-partir="${esc(g.id)}" data-partes="${k}">${k} de ${(Number(g.camas) || 0) / k}</button>`).join("")}
    </div>` : ""}
  </form>`;
}

function cultivoEditable(cultivo, lista, todas) {
  const bancales = lista.reduce((a, g) => a + (Number(g.camas) || 0), 0);
  const ya = enPlan(cultivo) || {};
  const p = perfil(cultivo) || {};
  const abierto = claveArea(cultivoEditando) === claveArea(cultivo) || estaDesplegado("cultivo:" + claveArea(cultivo));
  return `<details class="gen-cultivo" data-cultivo-lista="${esc(cultivo)}"
    data-recordar="${esc("cultivo:" + claveArea(cultivo))}"${abierto ? " open" : ""}>
    <summary><i class="lz-color" style="background:${colorEtapa(cultivo, "campo")}"></i>${
      esc(cultivo)} <span>${lista.length} generación(es) · ${num(bancales, 1)} bancales${
      ya.cosecha_esperada_kg ? ` · ${num(ya.cosecha_esperada_kg)} kg` : ""}</span></summary>
    <div class="cultivo-acciones">
      <button type="button" class="secundario" data-sumar-a="${esc(cultivo)}">+ Generaciones</button>
      <button type="button" class="secundario" data-marco="${esc(cultivo)}">Marco y rinde</button>
      <button type="button" class="secundario" data-ficha="${esc(cultivo)}">Ficha</button>
    </div>
    ${claveArea(marcoEditando) === claveArea(cultivo) ? `<form class="editar-gen" data-form-marco="${esc(cultivo)}">
      <div class="fila">
        <div><label>Líneas por bancal</label>
          <input type="text" name="lineas" inputmode="numeric" value="${esc(String(ya.lineas || p.lineas_bancal || ""))}"></div>
        <div><label>Distancia (cm)</label>
          <input type="text" name="distancia" inputmode="numeric" value="${esc(String(ya.distancia_cm || p.distancia_cm || ""))}"></div>
      </div>
      <label>Rinde esperado (kg/m²)</label>
      <input type="text" name="rinde" inputmode="decimal" value="${esc(String(ya.rinde_kg_m2 || p.rinde_ref_kg_m2 || ""))}">
      ${lista.some((g) => g.fecha_almacigo) ? `
      <label>Días en almácigo <small>(todas las generaciones sin sembrar)</small></label>
      <input type="text" name="bandeja" inputmode="numeric" value="${
        diasBandejaDelCultivo(cultivo, todas) || diasAlmacigo(cultivo, arranqueDe(lista[0])) || ""}">
      <p class="nota">De la siembra en bandeja al bancal. Se escribe la fecha a campo de
      cada generación, así todas trasplantan igual. De ahí a la cosecha van
      ${p.dias_trasplante_cosecha ? `${p.dias_trasplante_cosecha} días` : "los días"} del catálogo.</p>` : ""}
      <div class="editar-gen-botones">
        <button class="principal">Guardar</button>
        <button type="button" class="secundario" data-cancelar-marco>Cancelar</button>
      </div>
    </form>` : ""}
    ${lista.map((g) => {
      const sembrada = esSembrada(g);
      const directa = !g.fecha_almacigo;
      return `<div class="registro${g.id === genEditando ? " editando" : ""}" data-fila-gen="${esc(g.id)}">
        <div>
          <div class="detalle">${nombreGen(g, todas)}${
            sembrada ? ` <span class="etiqueta ok">sembrada</span>` : ""}</div>
          <div class="cuando">${fechaCorta(arranqueDe(g))}${directa ? " · directa" : " · en bandeja"}${
            g.camas ? ` · ${num(g.camas, 1)} bancal(es)` : ""}${
            g.sector ? ` · ${esc(g.sector)}${bancalesDe(g).length ? " " + bancalesDe(g).join(", ") : ""}` : ""}</div>
        </div>
        <button type="button" class="quitar editar" data-editar-gen="${esc(g.id)}"
          aria-label="Editar" title="Editar">✎</button>
        ${sembrada ? "" : `<button type="button" class="quitar"
          data-borrar-gen="${esc(g.id)}" aria-label="Quitar del plan" title="Quitar del plan">&times;</button>`}
      </div>
      ${g.id === genEditando ? formularioGeneracion(g) : ""}`;
    }).join("")}
  </details>`;
}

function pantallaPlanificar() {
  // Dentro de cada cultivo, por fecha: el orden en que se siembran, que es el
  // que importa al mirar la lista. El número de generación queda en el nombre.
  const gens = (leer(LS.generaciones, []) || [])
    .slice()
    .sort((a, b) => a.cultivo.localeCompare(b.cultivo)
      || arranqueDe(a).localeCompare(arranqueDe(b)) || a.generacion - b.generacion);

  const porCultivo = new Map();
  gens.forEach((g) => {
    if (!porCultivo.has(g.cultivo)) porCultivo.set(g.cultivo, []);
    porCultivo.get(g.cultivo).push(g);
  });

  return `
  <div class="tarjeta">
    <h2>Cultivos de la temporada</h2>
    ${barraDePlan("planificar")}

    <!-- El formulario a la izquierda y lo planificado a la derecha, cada uno
         con su scroll: se carga una serie mirando qué hay. En el teléfono se
         apilan. -->
    <div class="planificar-dos">
    <div class="planificar-form">
    <p class="nota">Todo lo de un cultivo se decide acá: el marco de plantación,
    cuántas generaciones y cada cuánto. La superficie, las plantas y los kilos
    esperados salen de esos números, no se cargan aparte.</p>

    <form id="form-generaciones">
      <label>Cultivo</label>
      ${buscadorCultivo("", "cultivo")}
      <p class="nota" id="tiempos-cultivo"></p>
      <label>Variedad <small>(opcional)</small></label>
      <input type="text" name="variedad" maxlength="40" autocomplete="off" placeholder="Ej: Corazón de buey">

      <h3 class="sub">Marco de plantación</h3>
      <p class="nota">Viene del catálogo. Si acá se hace distinto, cambialo:
      queda para esta chacra y de acá salen las plantas y los kilos.</p>
      <div class="fila">
        <div>
          <label>Líneas por bancal</label>
          <input type="text" name="lineas" inputmode="numeric">
        </div>
        <div>
          <label>Distancia (cm)</label>
          <input type="text" name="distancia" inputmode="numeric">
        </div>
      </div>
      <label>Rinde esperado (kg/m²)</label>
      <input type="text" name="rinde" inputmode="decimal">

      <h3 class="sub">Generaciones</h3>
      <label>¿Cómo se siembra?</label>
      <select name="metodo">
        <option value="Trasplante">En almácigo, para trasplantar</option>
        <option value="Siembra directa">Siembra directa</option>
      </select>

      <div class="fila">
        <div>
          <label>Primera siembra</label>
          <input type="date" name="desde" value="${hoy()}" required>
        </div>
        <div>
          <label>Generaciones</label>
          <input type="number" name="cuantas" value="1" min="1" max="30"
                 inputmode="numeric" required>
        </div>
      </div>

      <div class="fila">
        <div>
          <label>Cada cuántos días</label>
          <input type="number" name="cada" value="14" min="1" max="120"
                 inputmode="numeric">
        </div>
        <div>
          <label>Camas por generación</label>
          <input type="text" name="camas" inputmode="decimal" value="1">
        </div>
      </div>

      <label>Sector <small>(opcional, se ubica después en el mapa)</small></label>
      <select name="sector" data-parte="plan-op-sector" data-parte-modo="opciones">
        <option value="">Sin asignar</option>
        ${sectores().map((s) => `<option>${esc(s.sector)}</option>`).join("")}
      </select>

      <div class="calculo" id="calculo-generaciones"></div>

      <button class="principal">Agregar al plan</button>
    </form>
    ${tarjetaCultivoNuevo()}
    </div>

    <div class="planificar-lista">
    <h3 class="sub">En el plan <small data-parte="plan-cuenta">${gens.length} generaciones</small></h3>
    <!-- Parte de contenido: al llegar datos cambia la lista y la caja queda, con
         su scroll. El formulario de la izquierda no se toca (ver actualizarPartes). -->
    <div class="lista-scroll" data-parte="plan-lista" data-parte-modo="contenido">
    ${porCultivo.size ? [...porCultivo.entries()].map(([cultivo, lista]) =>
        cultivoEditable(cultivo, lista, gens)).join("")
      : `<p class="nota">Todavía no hay generaciones planificadas.</p>`}
    </div>
    <p class="nota">✎ edita una generación: método, fechas, bancales, o partirla
    para ubicar sus bancales por separado. De las ya sembradas solo se cambian
    los bancales: la siembra es un hecho.</p>
    </div>
    </div>
  </div>`;
}

// Ir a Cultivos con un cultivo desplegado (y una generación abierta para
// editar). Es el único lugar donde se edita: el panel del gráfico y la ficha
// llevan acá, en vez de tener cada uno su propio formulario.
function irAEditar(cultivo, genId = "") {
  vistaPlan = "planificar";
  cultivoAbierto = "";
  genPanel = "";
  cultivoEditando = cultivo;
  genEditando = genId;
  marcoEditando = "";
  render("plan");
  const destino = document.querySelector(genId
    ? `[data-fila-gen="${CSS.escape(genId)}"]`
    : `[data-cultivo-lista="${CSS.escape(cultivo)}"]`);
  if (destino) destino.scrollIntoView({ block: "center" });
}

function prepararEdicionCultivos() {
  const todas = () => leer(LS.generaciones, []) || [];

  // Desde el panel del gráfico, desde la ficha y desde la misma lista.
  document.querySelectorAll("[data-editar-gen]").forEach((b) => {
    b.onclick = (e) => {
      e.preventDefault();
      const g = todas().find((x) => x.id === b.dataset.editarGen);
      if (!g) return;
      if (vistaPlan === "planificar" && !cultivoAbierto) {
        genEditando = genEditando === g.id ? "" : g.id;
        cultivoEditando = g.cultivo;
        render("plan", true);
      } else {
        irAEditar(g.cultivo, g.id);
      }
    };
  });
  document.querySelectorAll("[data-editar-cultivo]").forEach((b) => {
    b.onclick = () => irAEditar(b.dataset.editarCultivo);
  });

  // Qué cultivos quedan desplegados: lo recuerda el escucha de "toggle" de
  // render.js (data-recordar y data-cultivo-lista), una sola vez para todos.

  // "+ Generaciones": el formulario de arriba, con el cultivo ya elegido.
  document.querySelectorAll("[data-sumar-a]").forEach((b) => {
    b.onclick = () => {
      const f = $("#form-generaciones");
      if (!f) return;
      const cultivo = b.dataset.sumarA;
      const caja = f.querySelector('[data-buscador="cultivo"]');
      if (caja) {
        caja.querySelector(".buscador-texto").value = cultivo;
        caja.querySelector('input[type="hidden"]').value = cultivo;
      }
      f.dispatchEvent(new Event("change"));
      f.scrollIntoView({ block: "start", behavior: "smooth" });
      f.desde.focus({ preventScroll: true });
    };
  });

  // Marco y rinde: son del cultivo, no de cada generación.
  document.querySelectorAll("[data-marco]").forEach((b) => {
    b.onclick = () => {
      marcoEditando = claveArea(marcoEditando) === claveArea(b.dataset.marco) ? "" : b.dataset.marco;
      cultivoEditando = b.dataset.marco;
      render("plan", true);
    };
  });
  document.querySelectorAll("[data-cancelar-marco]").forEach((b) => {
    b.onclick = () => { marcoEditando = ""; render("plan", true); };
  });
  document.querySelectorAll("[data-form-marco]").forEach((f) => {
    f.onsubmit = (e) => {
      e.preventDefault();
      const cultivo = f.dataset.formMarco;
      const rinde = aNumero(f.rinde.value) || 0;
      const lineas = parseInt(f.lineas.value, 10) || 0;
      const distancia = aNumero(f.distancia.value) || 0;
      // Se escribe en el plan y se recalcula con sus generaciones: los kilos
      // salen de la superficie por el rinde, no se cargan.
      const k = claveArea(cultivo);
      const plan = (CFG.plan || []).slice();
      const i = plan.findIndex((p) => claveArea(p.cultivo) === k);
      const nuevo = { ...(i >= 0 ? plan[i] : { cultivo }), rinde_kg_m2: rinde, lineas, distancia_cm: distancia };
      if (i >= 0) plan[i] = nuevo; else plan.push(nuevo);
      CFG = { ...CFG, plan };
      replanearCultivo(cultivo, todas());
      // Los días en bandeja se aplican a todas las generaciones sin sembrar:
      // su fecha a campo pasa a ser la de bandeja más esos días. Las ya
      // sembradas no se tocan: lo que pasó con ellas es un hecho.
      const bandeja = f.bandeja ? parseInt(f.bandeja.value, 10) || 0 : 0;
      let corridas = 0;
      if (bandeja > 0) {
        todas().filter((g) => claveArea(g.cultivo) === k && g.fecha_almacigo && !esSembrada(g))
          .forEach((g) => {
            const campo = sumarDias(g.fecha_almacigo, bandeja);
            if (campo && campo !== g.fecha_campo) {
              guardarGeneracion({ ...g, fecha_campo: campo }, "");
              corridas++;
            }
          });
      }
      marcoEditando = "";
      aviso(`${cultivo}: guardado ✓${corridas ? ` · ${corridas} generación(es) con ${bandeja} días en almácigo` : ""}`);
      render("plan", true);
    };
  });

  // Sacar una del plan. Va acá y no con el formulario: está dentro de la
  // lista, que se reemplaza por partes y se vuelve a enganchar con esto.
  document.querySelectorAll("[data-borrar-gen]").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.borrarGen;
      if (!confirm("¿Sacar esta generación del plan?")) return;
      guardarRegistro("generacion_borrar", { generacion_id: id }, "Sacada del plan ✓");
      // Se saca de la copia local para que no siga a la vista hasta sincronizar.
      const todas = leer(LS.generaciones, []) || [];
      const sacada = todas.find((g) => g.id === id);
      const quedan = todas.filter((g) => g.id !== id);
      escribir(LS.generaciones, quedan);
      if (sacada) replanearCultivo(sacada.cultivo, quedan);
      render("plan", true);
    };
  });

  // Editar una generación.
  document.querySelectorAll("[data-cancelar-gen]").forEach((b) => {
    b.onclick = () => { genEditando = ""; render("plan", true); };
  });
  document.querySelectorAll("[data-form-gen]").forEach((f) => {
    const g = todas().find((x) => x.id === f.dataset.formGen);
    if (!g) return;
    // Con siembra directa no hay bandeja: el campo se esconde y la fecha que
    // queda es la de siembra en el bancal.
    f.metodo.onchange = () => {
      const directa = f.metodo.value === "Siembra directa";
      f.querySelector(".solo-almacigo").hidden = directa;
      f.querySelector(".rotulo-campo").innerHTML = directa
        ? "Siembra en el bancal" : "A campo <small>(opcional)</small>";
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      const camas = aNumero(f.camas.value);
      if (!(camas > 0)) return aviso("Poné cuántos bancales ocupa.", true);
      let metodo = g.metodo, almacigo = g.fecha_almacigo || "", campo = g.fecha_campo || "";
      if (!esSembrada(g)) {
        metodo = f.metodo.value;
        const directa = metodo === "Siembra directa";
        almacigo = directa ? "" : f.almacigo.value;
        campo = f.campo.value;
        if (directa && !campo) return aviso("Falta la fecha de siembra en el bancal.", true);
        if (!directa && !almacigo) return aviso("Falta la fecha de siembra en bandeja.", true);
      }
      // Dónde va: el sector elegido y, si se dice, desde qué bancal. Si sigue
      // en el mismo sector sin decir bancal, conserva los suyos (corridos si
      // cambió la cantidad). Un sector sin bancal es válido: se ubica después.
      const sector = f.sector.value;
      const desde = parseInt(f.desde.value, 10) || 0;
      if (desde && !sector) return aviso("Elegí el sector de ese bancal.", true);
      const antes = bancalesDe(g);
      const n = Number((sectores().find((s) => claveArea(s.sector) === claveArea(sector)) || {}).bancales) || 0;
      const mismoSector = claveArea(sector) === claveArea(g.sector || "");
      let bancales = [];
      if (sector && n) {
        if (desde) bancales = bancalesQueOcuparia({ camas }, desde, n);
        else if (mismoSector && antes.length) {
          bancales = camas === Number(g.camas) ? antes : bancalesQueOcuparia({ camas }, Math.min(...antes), n);
        }
      }
      if (sector && bancales.length) {
        const choques = chocanCon({ ...g, camas, fecha_almacigo: almacigo, fecha_campo: campo },
          sector, bancales, todas());
        if (choques.length && !confirm(`En ${sector} ${bancales.join(", ")} se superpone con ${
          choques.slice(0, 3).map((x) => `${x.cultivo} G${x.generacion}`).join(", ")}.\n¿Ponerla igual?`)) return;
      }
      guardarGeneracion({ ...g, metodo, fecha_almacigo: almacigo, fecha_campo: campo,
                          camas, sector, bancales: bancales.join(", "),
                          variedad: f.variedad.value.trim() },
        `${g.cultivo} ${nombreGen(g)} actualizada ✓`);
      replanearCultivo(g.cultivo, todas());
      genEditando = "";
      render("plan", true);
    };
  });

  // Partir una generación en partes iguales, para ubicar cada una por su
  // lado: el tomate de cuatro bancales en dos de dos, o en cuatro de uno. Son
  // la misma siembra —mismo número de generación, mismas fechas—, así que al
  // registrarla quedan sembradas todas juntas.
  document.querySelectorAll("[data-partir]").forEach((b) => {
    b.onclick = () => {
      const lista = todas();
      const g = lista.find((x) => x.id === b.dataset.partir);
      if (!g) return;
      const k = Number(b.dataset.partes);
      const cada = (Number(g.camas) || 0) / k;
      if (!confirm(`¿Partir ${g.cultivo} ${nombreGen(g, lista)} en ${k} partes de ${num(cada, 1)} bancal(es)?\n`
                   + "Quedan con las mismas fechas, y cada una se ubica por su lado en el mapa.")) return;
      const bs = bancalesDe(g);
      const usados = new Set(lista.map((x) => x.id));
      const idNuevo = () => {
        for (const l of "bcdefghij") {
          const id = `${g.id}-${l}`;
          if (!usados.has(id)) { usados.add(id); return id; }
        }
        return `${g.id}-${uid()}`;
      };
      for (let i = 0; i < k; i++) {
        // Si estaba ubicada, cada parte se queda con su tramo de bancales.
        const tramo = bs.length >= (Number(g.camas) || 0) ? bs.slice(i * cada, (i + 1) * cada) : [];
        guardarGeneracion({ ...g, id: i === 0 ? g.id : idNuevo(), camas: cada,
                            bancales: tramo.join(", "), sector: bs.length && !tramo.length ? "" : g.sector },
          `${g.cultivo} ${nombreGen(g, lista)} partida en ${k} ✓`);
      }
      genEditando = "";
      render("plan", true);
    };
  });
}

// La cuenta que se ve debajo del formulario de series. Se vuelve a hacer
// cuando llegan generaciones nuevas (engancharPartes), sin tocar el formulario:
// si otro teléfono agregó una, la numeración que se anuncia tiene que seguirla.
let recalcularSerie = null;

function prepararGeneraciones() {
  const f = $("#form-generaciones");
  recalcularSerie = null;
  if (!f) return;
  enlazarBuscadores(f);
  const calculo = $("#calculo-generaciones");
  // Se lee cada vez, no al dibujar: la lista de la derecha se actualiza por
  // partes sin volver a preparar el formulario, y con la copia del momento de
  // dibujar la numeración de una serie nueva podía repetir una generación que
  // llegó después —y pisarla, porque el id sale del cultivo y el número—.
  const existentes = () => leer(LS.generaciones, []) || [];

  // Las fechas de la serie: la primera, y después cada tantos días.
  const fechas = () => {
    const desde = f.desde.value;
    const cuantas = Math.max(1, parseInt(f.cuantas.value, 10) || 1);
    const cada = Math.max(1, parseInt(f.cada.value, 10) || 14);
    if (!desde) return [];
    // La primera va tal cual: sumarDias devuelve vacío con 0 días, y hace bien
    // —un perfil sin dato no debe inventar una fecha—, pero acá 0 es un
    // desplazamiento legítimo.
    return Array.from({ length: cuantas },
      (_, i) => (i === 0 ? desde : sumarDias(desde, i * cada)));
  };

  // Al elegir el cultivo se trae su marco: primero lo que ya decidió esta
  // chacra, y si no, lo que dice el catálogo.
  let ultimoCultivo = "";
  const alElegirCultivo = () => {
    const c = f.cultivo.value;
    if (!c || c === ultimoCultivo) return;
    ultimoCultivo = c;
    const ya = enPlan(c) || {};
    const p = perfil(c) || {};
    f.lineas.value = ya.lineas || p.lineas_bancal || "";
    f.distancia.value = ya.distancia_cm || p.distancia_cm || "";
    f.rinde.value = ya.rinde_kg_m2 || p.rinde_ref_kg_m2 || "";
    const tipo = /almácigo|almacigo/i.test(p.tipo_siembra || "")
      ? "Trasplante" : "Siembra directa";
    f.metodo.value = tipo;
    $("#tiempos-cultivo").innerHTML = tiemposDelCultivo(c);
    actualizar();
  };

  // Lo que la serie va a ocupar y a dar. Es la cuenta que antes había que
  // hacer aparte en Configuración.
  const cuentas = () => {
    const bancales = (aNumero(f.camas.value) || 0)
      * Math.max(1, parseInt(f.cuantas.value, 10) || 1);
    // Con el largo de bancal del sector elegido (o el de la chacra).
    const m2 = bancalM2(f.sector.value);
    const superficie = bancales * m2;
    const rinde = aNumero(f.rinde.value) || 0;
    return {
      bancales, superficie,
      kg: Math.round(superficie * rinde),
      plantas: plantasDe({ bancales, sector: f.sector.value,
        lineas: parseInt(f.lineas.value, 10) || 0,
        distancia_cm: aNumero(f.distancia.value) || 0 }),
    };
  };

  const actualizar = () => {
    const cultivo = f.cultivo.value;
    const fs = fechas();
    if (!cultivo || !fs.length) {
      calculo.innerHTML = "Elegí el cultivo y cuándo arranca.";
      return;
    }
    // La numeración sigue donde quedó: si ya hay tres generaciones de brócoli,
    // la próxima serie empieza en la cuatro.
    const ya = existentes().filter((g) => claveArea(g.cultivo) === claveArea(cultivo));
    const desdeN = ya.length ? Math.max(...ya.map((g) => g.generacion)) + 1 : 1;
    const directa = f.metodo.value === "Siembra directa";
    const p = perfil(cultivo) || {};
    const aCosecha = directa ? p.dias_a_cosecha : p.dias_trasplante_cosecha;

    const primera = fs[0], ultima = fs[fs.length - 1];
    // Cuándo estaría cosechándose la última, que es lo que dice si la serie
    // entra en la temporada o se va de largo.
    const campoUlt = directa ? ultima : sumarDias(ultima,
      diasBandejaDelCultivo(cultivo, existentes()) || diasAlmacigo(cultivo, ultima));
    const cosechaUlt = aCosecha ? sumarDias(campoUlt, aCosecha) : "";

    const c = cuentas();
    calculo.innerHTML = `<b>${fs.length} generación(es)</b> de ${esc(cultivo)},`
      + ` G${desdeN}${fs.length > 1 ? ` a G${desdeN + fs.length - 1}` : ""}`
      + (c.bancales ? ` · <b>${num(c.bancales, 1)} bancales</b> (${num(c.superficie)} m²)` : "")
      + (c.kg ? ` · <b>${num(c.kg)} kg</b> esperados` : "")
      + `<br><small>de ${fechaCorta(primera)}${fs.length > 1 ? ` a ${fechaCorta(ultima)}` : ""}`
      + (cosechaUlt ? ` · la última se cosecharía cerca del ${fechaCorta(cosechaUlt)}` : "")
      + (c.plantas ? ` · ${num(c.plantas)} plantas` : "")
      + (ya.length ? `<br>Ya hay ${ya.length} de este cultivo en el plan: esto se suma.` : "")
      + (bancalM2() ? "" : "<br>Faltan las medidas del bancal, en Configuración: sin eso no hay m² ni kilos.")
      + "</small>";
  };

  ["desde", "cuantas", "cada", "metodo", "camas", "lineas", "distancia", "rinde"]
    .forEach((n) => f[n].addEventListener("input", actualizar));
  f.addEventListener("change", () => { alElegirCultivo(); actualizar(); });
  actualizar();
  recalcularSerie = actualizar;

  f.onsubmit = (e) => {
    e.preventDefault();
    const cultivo = f.cultivo.value;
    if (!cultivo) return aviso("Elegí qué cultivo estás planificando.", true);
    const fs = fechas();
    if (!fs.length) return aviso("Falta la fecha de la primera siembra.", true);

    const ya = existentes().filter((g) => claveArea(g.cultivo) === claveArea(cultivo));
    const desdeN = ya.length ? Math.max(...ya.map((g) => g.generacion)) + 1 : 1;
    const directa = f.metodo.value === "Siembra directa";
    const camas = aNumero(f.camas.value) || "";

    const rinde = aNumero(f.rinde.value) || 0;
    const lineas = parseInt(f.lineas.value, 10) || 0;
    const distancia = aNumero(f.distancia.value) || 0;

    // Las nuevas trasplantan igual que las que ya hay de este cultivo.
    const bandeja = directa ? 0 : diasBandejaDelCultivo(cultivo, existentes());
    fs.forEach((fecha, i) => {
      const n = desdeN + i;
      guardarGeneracion({
        // El id lleva cultivo y número: volver a cargar la misma generación la
        // pisa en vez de duplicarla.
        id: `gen-${claveArea(cultivo)}-${n}`,
        cultivo, generacion: n,
        metodo: f.metodo.value,
        // En siembra directa la planta arranca en el bancal: no hay bandeja.
        fecha_almacigo: directa ? "" : fecha,
        fecha_campo: directa ? fecha : (bandeja ? sumarDias(fecha, bandeja) : ""),
        camas, sector: f.sector.value, variedad: f.variedad.value.trim(),
        estado: "Planificado",
      }, `${fs.length} generación(es) de ${cultivo} al plan ✓`);
    });
    // El plan por cultivo se recalcula con TODAS sus generaciones, las que ya
    // había y las nuevas, cada una con el largo de bancal de su sector. Antes
    // ese total se cargaba aparte en Configuración y podía quedar diciendo una
    // cosa mientras las generaciones decían otra.
    const fila = bancalM2() ? filaDelPlan(cultivo, existentes(), { rinde, lineas, distancia }) : null;
    if (fila) {
      const plan = [...(CFG?.plan || [])].filter((p) => claveArea(p.cultivo) !== claveArea(cultivo));
      plan.push(fila);
      plan.sort((a, b) => a.cultivo.localeCompare(b.cultivo));
      guardarPartesDeConfig({ plan }, [["config_plan", fila]], "", "");
    }

    // Aparece ya en la lista y en el gráfico: sale de la copia local, que
    // incluye lo que todavía está en camino a la planilla.
    cultivoEditando = cultivo;
    render("plan", true);
    const nuevo = document.querySelector(`[data-cultivo-lista="${CSS.escape(cultivo)}"]`);
    if (nuevo) nuevo.scrollIntoView({ block: "nearest" });
  };

}
