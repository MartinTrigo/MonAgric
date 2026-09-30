// js/vistas.js        — AMA Producción
//
// Las plantillas de cada sección: devuelven el HTML de la pantalla. No
// enganchan eventos: eso lo hace el preparar* de cada una, después de dibujar.
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos. Se partió app.js el 30/09/2026 sin cambiar código.

// ==========================================================
// VISTAS
// ==========================================================
const plantillas = {

  inicio() {
    if (!chacraActual()) return tarjetaElegirChacra();
    if (!tieneAcceso()) return tarjetaCanje();
    if (!hayConfig()) return tarjetaSinConfig();
    const t = CFG.temporada || {};
    const plan = CFG.plan || [];
    const supPlan = plan.reduce((a, p) => a + p.superficie_m2, 0);
    const kgPlan = plan.reduce((a, p) => a + p.cosecha_esperada_kg, 0);
    const local = totalesLocales();
    const kgLogrado = resumen ? resumen.kg_cosechados : local.kg;
    const pct = kgPlan ? (kgLogrado / kgPlan) * 100 : 0;

    return `
    <div class="tarjeta temporada-cab">
      <h2>Temporada ${esc(t.nombre || "sin nombre")}</h2>
      <div class="chacra">${esc(CFG.nombre || chacraActual().nombre)}</div>
      <div class="rango">${t.inicio ? "Inicio " + fechaCorta(t.inicio) : "Sin fecha de inicio"}${t.fin ? " · fin " + fechaCorta(t.fin) : ""}
        · ${plan.length} cultivos planificados</div>
      <div class="cifras">
        <div class="cifra"><b>${num(supPlan)}</b><span>m² planificados</span></div>
        <div class="cifra"><b>${num(kgPlan)}</b><span>kg esperados</span></div>
        <div class="cifra"><b>${num(kgLogrado)}</b><span>kg cosechados</span></div>
      </div>
      ${barra(pct, true)}
      <div class="rango" style="margin-top:6px">
        ${num(pct, 1)}% de lo esperado ·
        ${resumen ? "datos de toda la chacra" : "solo este teléfono"}
      </div>
    </div>

    ${tarjetaParaHacer()}

    <div class="tarjeta">
      <h2>Lo cargado ${resumen ? "desde la chacra" : "<small>(solo este teléfono)</small>"}</h2>
      <div class="cifras">
        ${cifraClara(num(resumen ? resumen.siembras : local.siembras), "siembras")}
        ${cifraClara(num(resumen ? resumen.plantines : local.plantines), "plantines")}
        ${cifraClara(num(resumen ? resumen.horas : local.horas, 1), "horas de trabajo")}
      </div>
      ${pendientes.length
        ? `<button class="secundario" id="btn-enviar">Enviar ${pendientes.length} registro(s) ahora</button>`
        : ""}
    </div>

    <div class="tarjeta">
      <h2>&#128172; ¿Qué mejorarías de la app?</h2>
      <p class="nota">Lo que te falte, lo que te moleste o algo que se te ocurra.
      Lo leo yo y lo vamos arreglando.</p>
      <form id="form-sugerencia">
        <textarea name="texto" rows="3" maxlength="600"
                  placeholder="Ej: estaría bueno poder anotar el riego de cada sector"></textarea>
        <button class="secundario">Enviar</button>
      </form>
    </div>

    <a class="acceso-juego" href="juego/" aria-label="Jugar a Pac-Farm">
      ${IMG_PACFARM}
      <span>Un rato de Pac-Farm</span>
    </a>`;
  },

  siembras() {
    if (!chacraActual()) return tarjetaElegirChacra();
    if (!tieneAcceso()) return tarjetaCanje();
    if (!hayConfig()) return tarjetaSinConfig();
    const yo = leer(LS.nombre, "");
    return `
    ${tarjetaParaSembrar()}
    <div class="tarjeta" id="tarjeta-form-siembra">
      <h2>&#127793; Registrar siembra</h2>
      <div id="desde-el-plan"></div>
      <form id="form-siembras">
        <label>Fecha</label>
        <input type="date" name="fecha" value="${hoy()}" required>

        <label>Cultivo</label>
        ${buscadorCultivo()}

        <div class="fila">
          <div>
            <label>Variedad</label>
            <input type="text" name="variedad" placeholder="Ej: criolla">
          </div>
          <div>
            <label>Generación</label>
            <input type="number" name="generacion" value="1" min="1" max="99" inputmode="numeric" required>
          </div>
        </div>

        <label>Tipo</label>
        <select name="tipo" required>
          ${tiposSiembra().map((t) => `<option${t === "Siembra almácigo" ? " selected" : ""}>${esc(t)}</option>`).join("")}
        </select>

        <div id="bloque-bandejas">
          <div class="fila">
            <div>
              <label>Bandejas</label>
              <input type="number" name="bandejas" value="1" min="1" max="999" inputmode="numeric">
            </div>
            <div>
              <label>Alvéolos por bandeja</label>
              <select name="tipo_bandeja">
                ${tiposBandeja().map((v) => `<option${String(v) === "72" ? " selected" : ""}>${v}</option>`).join("")}
              </select>
            </div>
          </div>
        </div>

        <div id="bloque-lugar">${camposSectorBancal()}</div>

        <div class="calculo" id="calculo-siembra"></div>

        <label>Operador</label>
        <select name="operador" required>${opcionesIntegrante(yo)}</select>

        <label>Observaciones</label>
        <textarea name="observaciones" rows="2" placeholder="Opcional"></textarea>

        <button class="principal">Guardar siembra</button>
      </form>
    </div>
    ${historialDe("siembras")}`;
  },

  // El trasplante parte SIEMPRE de una siembra de almácigo ya cargada: así el
  // cultivo, la variedad y la generación no se vuelven a tipear (ni a tipear
  // distinto), y queda el vínculo que después permite calcular el rinde real
  // del bancal. Por eso lo primero que se elige es cuál almácigo se está
  // sacando de la bandeja.
  trasplantes() {
    if (!chacraActual()) return tarjetaElegirChacra();
    if (!tieneAcceso()) return tarjetaCanje();
    if (!hayConfig()) return tarjetaSinConfig();
    const yo = leer(LS.nombre, "");
    const pend = almacigosPendientes();

    // Si la lista salió de las últimas siembras y no del servicio, se dice:
    // faltan los almácigos viejos, que son justo los que hay que trasplantar.
    const origen = pend.completa ? "" : `<p class="nota alerta">Esta lista puede
      estar incompleta: el teléfono no pudo pedirle al servicio los almácigos
      que esperan, así que muestra solo los de las últimas siembras. Los
      sembrados hace más de un mes pueden faltar. Revisá la señal; si sigue
      igual, el Apps Script puede estar corriendo una versión anterior.</p>`;

    // Sin almácigos en la lista el formulario se muestra igual: se puede
    // trasplantar algo que no se cargó como siembra, o plantines comprados.
    const listos = pend.filter((s) => (estadoAlmacigo(s).dias ?? 99) <= 0);
    const pronto = pend.filter((s) => {
      const d = estadoAlmacigo(s).dias;
      return d !== null && d > 0 && d <= DIAS_AVISO;
    });

    return `
    ${tarjetaParaTrasplantar(pend, listos, pronto)}

    <div class="tarjeta" id="tarjeta-form-trasplante">
      <h2>&#127807; Registrar trasplante${
        pend.length ? ` <small>${pend.length} almácigos esperando</small>` : ""}</h2>
      ${origen}
      <div id="desde-el-plan"></div>
      <form id="form-trasplantes">
        <label>¿Qué cultivo?</label>
        ${buscadorCultivo("", "cultivo")}

        <div class="fila">
          <div>
            <label>Variedad <small>(opcional)</small></label>
            <input type="text" name="variedad" maxlength="40" autocomplete="off">
          </div>
          <div>
            <label>Generación</label>
            <input type="number" name="generacion" value="1" min="1" max="20" inputmode="numeric">
          </div>
        </div>

        <label>Fecha</label>
        <input type="date" name="fecha" value="${hoy()}" required>

        <!-- El almácigo es opcional: elegirlo completa el resto solo y permite
             medir cuántos días estuvo de verdad en la bandeja contra los
             teóricos, que es el dato con el que después se corrige el
             catálogo. Sin él el trasplante se registra igual. -->
        <label>¿Viene de un almácigo cargado? <small>(opcional)</small></label>
        <select name="siembra_id">
          <option value="">No, o no está en la lista</option>
          ${pend.map((s) => `<option value="${esc(s.id)}">${esc(s.etiqueta)}</option>`).join("")}
        </select>
        <p class="nota" id="nota-almacigo"></p>

        <label>¿A qué bancales fue?</label>
        <div id="renglones-bancal">${renglonBancal(0)}</div>
        <button type="button" class="secundario mas" id="btn-mas-bancal">
          + Agregar otro bancal</button>

        <h3 class="sub">Marco de plantación</h3>
        <p class="nota">Viene sugerido del plan de la temporada. Si en el campo
        se hizo distinto, cambialo acá y queda registrado como fue de verdad.</p>
        <div class="fila">
          <div>
            <label>Líneas por bancal</label>
            <input type="text" name="lineas" inputmode="numeric">
          </div>
          <div>
            <label>Distancia (cm)</label>
            <input type="text" name="distancia_cm" inputmode="numeric">
          </div>
        </div>
        <label>Disposición</label>
        <select name="disposicion">
          ${DISPOSICIONES.map((d) => `<option>${esc(d)}</option>`).join("")}
        </select>

        <!-- Los plantines salen del marco y de los bancales, pero a veces se
             contaron de verdad y ese número vale más que la cuenta. -->
        <label>Plantines por bancal <small>(si los contaste)</small></label>
        <input type="text" name="plantines" inputmode="numeric"
               placeholder="lo calcula solo con el marco">

        <div class="calculo" id="calculo-trasplante"></div>

        <label>Operador</label>
        <select name="operador" required>${opcionesIntegrante(yo)}</select>

        <label>Observaciones</label>
        <textarea name="observaciones" rows="2" placeholder="Opcional"></textarea>

        <button class="principal">Guardar trasplante</button>
      </form>
    </div>
    ${historialDe("trasplantes")}`;
  },

  // Cada uno ve su cuenta; quien esté habilitado ve la de todo el equipo. Eso
  // lo decide el servicio a partir de la credencial del teléfono, no de un
  // nombre elegido en una lista.
  cuentas() {
    if (!chacraActual()) return tarjetaElegirChacra();
    if (!tieneAcceso()) return tarjetaCanje();

    const d = leer(LS.cuentas, null);
    const error = leer(LS.cuentasError, "");
    if (!d) {
      return `<div class="tarjeta">
        <h2>Cuentas</h2>
        <p class="nota">${error ? esc(error)
          : "Buscando tus cuentas… Si no aparecen, revisá la señal."}</p>
      </div>`;
    }

    const gente = d.trabajadores || [];
    const abierta = gente.find((x) => claveArea(x.nombre) === claveArea(cuentaAbierta))
      || (gente.length === 1 ? gente[0] : null);

    const aviso_ = error ? `<p class="nota alerta">${esc(error)} Estás viendo los
      últimos números que se pudieron bajar.</p>` : "";
    const cuando = d.actualizado
      ? `<p class="nota">Calculado por Bioma el ${fechaCorta(String(d.actualizado).slice(0,10))}.</p>`
      : "";

    if (abierta) return `${detalleDeCuenta(abierta, d)}
      ${(d.trabajadores || []).length === 1 ? tarjetasDeEconomia(d.economia) : ""}
      ${aviso_}${cuando}`;

    if (!gente.length) {
      return `<div class="tarjeta"><h2>Cuentas</h2>
        <p class="nota">Todavía no hay cuenta a tu nombre. Aparece en cuanto se
        carguen tus horas o un pago.</p>${aviso_}</div>`;
    }

    const orden = [...gente].sort((a, b) => (b.saldo || 0) - (a.saldo || 0));
    return `
    <div class="tarjeta">
      <h2>Cuentas del equipo <small>${orden.length}</small></h2>
      <p class="nota">Lo que el proyecto le debe a cada une. Tocá para ver el detalle.</p>
      ${orden.map((x) => `<div class="registro cuenta-fila" data-cuenta="${esc(x.nombre)}">
        <div><div class="detalle">${esc(x.nombre)}</div>
          <div class="cuando">${num(x.horas, 1)} h · ${pesos(x.devengado)} ganado</div></div>
        <div class="saldo${(x.saldo || 0) < 0 ? " alerta" : ""}">${conSigno(x.saldo)}</div>
      </div>`).join("")}
    </div>
    ${d.totales ? `<div class="tarjeta">
      <h2>Todo el proyecto</h2>
      <div class="cifras">
        ${cifraClara(num(d.totales.horas, 1), "horas")}
        ${cifraClara(pesos(d.totales.pagado), "pagado")}
        ${cifraClara(pesos(d.totales.saldo), "se debe")}
      </div>
    </div>` : ""}
    ${(d.pagos_sin_persona || []).length ? `<div class="tarjeta">
      <h2>Pagos sin dueño <small>${d.pagos_sin_persona.length}</small></h2>
      <p class="nota">Salieron como sueldo pero sin nombre, así que no entran en
      ninguna cuenta. O le falta la persona, o no era un sueldo y va en otro
      concepto: un honorario, por ejemplo. Se corrige en la app de Bioma.</p>
      ${d.pagos_sin_persona.map((g) => `<div class="registro">
        <div><div class="detalle">${pesos(g.monto)}</div>
          <div class="cuando">${fechaCorta(g.fecha)}${g.obs ? " · " + esc(g.obs) : ""}</div></div>
      </div>`).join("")}
    </div>` : ""}
    ${tarjetasDeEconomia(d.economia)}
    ${aviso_}${cuando}`;
  },

  horas() {
    if (!chacraActual()) return tarjetaElegirChacra();
    if (!tieneAcceso()) return tarjetaCanje();
    const yo = leer(LS.nombre, "");
    const equipo = leer(LS.ultimasHoras, []);
    const pendientesHoras = pendientes.filter((r) => r.tipo === "horas");
    return `
    <div class="tarjeta">
      <h2>&#9201; Registrar horas de trabajo</h2>
      <form id="form-horas">
        <label>Fecha</label>
        <input type="date" name="fecha" value="${hoy()}" required>

        <label>¿Quién trabajó?</label>
        <select name="integrante" required>${opcionesIntegrante(yo)}</select>

        <label>¿En qué área?</label>
        <select name="area" required>
          <option value="" disabled selected>Elegí el área…</option>
          ${opcionesArea("", false)}
        </select>

        <div id="bloque-actividad" hidden>
          <label>¿Qué actividad?</label>
          <select name="actividad"></select>
        </div>

        <label>Horas trabajadas</label>
        <!-- texto y no "number": con type=number el navegador descarta "5,5" y
             en el celular el teclado en español ofrece coma. -->
        <input type="text" name="horas" inputmode="decimal" autocomplete="off"
               placeholder="Ej: 4 o 2,5" required>

        <label>¿Qué hiciste?</label>
        <textarea name="observaciones" rows="2"
                  placeholder="Ej: armado de mesadas y colocación de la pollera"></textarea>

        <button class="principal">Guardar horas</button>
      </form>
    </div>

    ${horasVanAparte() && !CFG?.corregir ? `
    <div class="tarjeta">
      <h2>Últimos movimientos <small>planilla del proyecto</small></h2>
      ${pendientesHoras.map((r) => `<div class="registro">
        <div><div class="detalle">${esc(r.datos.integrante)} — ${r.datos.horas} h</div>
          <div class="cuando">${fechaCorta(r.datos.fecha)} · ${esc(r.datos.actividad)}</div></div>
        <span class="etiqueta espera">Por enviar</span>
      </div>`).join("")}
      ${equipo.length
        ? equipo.map((f) => `<div class="registro">
            <div><div class="detalle">${esc(f.nombre)} — ${esc(String(f.horas))} h</div>
              <div class="cuando">${esc(f.fecha)} · ${esc(f.actividad)}</div></div>
          </div>`).join("")
        : (pendientesHoras.length ? "" : `<p class="nota">Cuando haya conexión se van a ver
            acá los últimos registros de todo el equipo.</p>`)}
      <a class="enlace-planilla" target="_blank" rel="noopener"
         href="https://docs.google.com/spreadsheets/d/1tx8V0VLciiTLFvAmSViAR6KV9LL9hXzvX6-qy30Ubpg/edit">
        Ver la planilla de horas completa</a>
    </div>` : historialDe("horas")}`;
  },

  tareas() {
    if (!chacraActual()) return tarjetaElegirChacra();
    if (!tieneAcceso()) return tarjetaCanje();
    const yo = leer(LS.nombre, "");
    const lista = tareasParaMostrar();
    const pendientes_ = lista.filter((t) => !t.hecha);
    // Las hechas se ordenan por cuándo se marcaron, al revés que las pendientes
    // —que van por fecha de vencimiento, lo más urgente arriba—. Antes salían de
    // esa misma lista, así que mostraban las ocho más viejas y no se movían
    // nunca: la fecha "para cuándo" ya no cambia después de hacerla.
    const hechas = lista.filter((t) => t.hecha)
      .sort((a, b) => (b.hecha_el || "").localeCompare(a.hecha_el || ""))
      .slice(0, 8);
    const porArea = vistaTareas === "areas";

    return `
    <div class="pestanas-tareas">
      <button class="pestana${porArea ? "" : " activa"}" data-vista-tareas="hoy">Hoy</button>
      <button class="pestana${porArea ? " activa" : ""}" data-vista-tareas="areas">Por área</button>
    </div>

    ${porArea ? tarjetasDeAreas(lista) : `
    <div class="tarjeta">
      <h2>&#9745; Tareas pendientes <small>${pendientes_.length}</small></h2>
      ${pendientes_.length
        ? pendientes_.map(filaTarea).join("")
        : `<p class="nota">No hay tareas pendientes. Agregá una acá abajo.</p>`}
    </div>`}

    <div class="tarjeta">
      <h2>Anotar una tarea</h2>
      <form id="form-tareas">
        <label>¿Qué hay que hacer?</label>
        <input type="text" name="tarea" maxlength="140" autocomplete="off"
               placeholder="Ej: desyuyar el sector B" required>

        <label>Área</label>
        <select name="area">${opcionesArea()}</select>

        <div class="fila">
          <div>
            <label>¿Para cuándo?</label>
            <input type="date" name="fecha" value="${hoy()}" required>
          </div>
          <div>
            <label>Personas</label>
            <input type="number" name="personas" value="1" min="1" max="30" inputmode="numeric">
          </div>
        </div>

        <label>Importancia</label>
        <div class="chips">
          ${importancias().map((i) => `<label class="chip">
            <input type="radio" name="importancia" value="${i}"${i === "Media" ? " checked" : ""}>
            <span><span class="punto-imp imp-${i}"></span>${i}</span>
          </label>`).join("")}
        </div>

        <div class="fila">
          <div>
            <label>Quién la anota</label>
            <select name="creada_por" required>${opcionesIntegrante(yo)}</select>
          </div>
          <div>
            <label>Quién la toma <small>(opcional)</small></label>
            <select name="asignada">
              <option value="">Cualquiera</option>
              ${integrantes().map((n) => `<option>${esc(n)}</option>`).join("")}
            </select>
          </div>
        </div>

        <button class="principal">Agregar tarea</button>
      </form>
    </div>

    ${hechas.length ? `<div class="tarjeta">
      <h2>Hechas hace poco <small>lo último arriba</small></h2>
      ${hechas.map(filaTarea).join("")}
      <a class="enlace-planilla" href="${esc(enlacePlanilla())}" target="_blank" rel="noopener">
        Ver el historial completo en la planilla</a>
    </div>` : ""}`;
  },

  cosechas() {
    if (!chacraActual()) return tarjetaElegirChacra();
    if (!tieneAcceso()) return tarjetaCanje();
    const yo = leer(LS.nombre, "");
    const delPlan = cultivosDelPlan();
    // Sin plan de temporada no hay pizarra posible: no habría qué poner. Pasa
    // en las chacras que todavía no lo cargaron.
    const pizarra = modoCosecha === "pizarra" && delPlan.length > 0;

    return `
    <div class="tarjeta">
      <h2>&#127807; Registrar cosecha</h2>

      <div class="pestanas-tareas">
        <button type="button" class="pestana${pizarra ? "" : " activa"}"
                data-modo-cosecha="lista">Lista</button>
        <button type="button" class="pestana${pizarra ? " activa" : ""}"
                data-modo-cosecha="pizarra">Pizarra</button>
      </div>

      <p class="nota">${pizarra
        ? `Todos los cultivos del plan, como en la pizarra: escribí los kilos
           solo en los que cosechaste y dejá el resto vacío.`
        : `Los kilos totales de cada cultivo, de todos los bancales juntos.
           Un renglón por cultivo: con el + sumás otro, y con el × sacás el que sobre.`}</p>

      ${modoCosecha === "pizarra" && !delPlan.length ? `<p class="nota alerta">
        El modo pizarra muestra los cultivos del plan de la temporada, y esta
        chacra todavía no tiene ninguno cargado. Cargalos en Plan, o usá el
        modo lista.</p>` : ""}

      <form id="form-cosechas">
        <label>Fecha</label>
        <input type="date" name="fecha" value="${hoy()}" required>

        ${pizarra ? `
        <div id="pizarra-cosecha">
          ${delPlan.map((c, i) => renglonPizarra(c, i)).join("")}
        </div>` : `
        <!-- Los encabezados van una sola vez, no uno por renglón. -->
        <div class="cosecha-cab"><span>Cultivo</span><span>Kilos</span></div>
        <div id="renglones-cosecha">${renglonCosecha(0)}</div>

        <button type="button" class="secundario mas" id="btn-mas-cultivo"
                aria-label="Agregar otro cultivo">+</button>`}

        <div class="calculo" id="calculo-cosecha"></div>

        <label>Cosechó</label>
        <select name="operador">${opcionesIntegrante(yo)}</select>

        <button class="principal">Guardar cosecha</button>
      </form>
    </div>
    ${historialDe("cosechas")}`;
  },

  plan() {
    if (!chacraActual()) return tarjetaElegirChacra();
    if (!tieneAcceso()) return tarjetaCanje();
    if (!hayConfig()) return tarjetaSinConfig();
    const b = CFG.bancal || {}, m2 = bancalM2();
    const plan = CFG.plan || [];
    const porCultivo = resumen?.kg_por_cultivo || kgLocalesPorCultivo();

    // Un cultivo abierto reemplaza la lista: en el teléfono no hay lugar para
    // las dos cosas, y en la notebook la ficha se lee mejor sola.
    if (cultivoAbierto) return fichaCultivo(cultivoAbierto);
    // Planificar es trabajo de notebook. En el teléfono estas dos pantallas no
    // se leen, así que se avisa en vez de mostrarlas rotas.
    if (vistaPlan === "mapa") {
      return pantallaAncha() ? mapaDeCultivos()
        : barraDePlan("mapa") + tarjetaSoloNotebook("El mapa de cultivos");
    }
    if (vistaPlan === "grafico") {
      return pantallaAncha() ? planEstrategico()
        : barraDePlan("grafico") + tarjetaSoloNotebook("El plan estratégico");
    }
    if (vistaPlan === "planificar") return pantallaPlanificar();

    return `
    <div class="tarjeta">
      <h2>Plan de la temporada <small>${plan.length} cultivos</small></h2>
      ${barraDePlan("lista")}
      ${plan.length ? plan.map((p) => {
        const logrado = porCultivo[p.cultivo] || 0;
        const pct = p.cosecha_esperada_kg ? (logrado / p.cosecha_esperada_kg) * 100 : 0;
        const perf = perfil(p.cultivo);
        return `<div class="plan-fila abre-ficha" data-ficha="${esc(p.cultivo)}"
                     role="button" tabindex="0">
          <div class="plan-cab">
            <b>${esc(p.cultivo)}</b>
            <span>${num(logrado)} / ${num(p.cosecha_esperada_kg)} kg</span>
          </div>
          <div class="plan-detalle">
            ${num(p.superficie_m2)} m²${m2 ? ` (${num(p.superficie_m2 / m2, 1)} bancales)` : ""}
            ${perf.tipo_siembra ? ` · ${esc(perf.tipo_siembra)}` : ""}
            ${perf.lineas_bancal ? ` · ${num(perf.lineas_bancal)} líneas a ${num(perf.distancia_cm)} cm` : ""}
            ${perf.dias_a_cosecha ? ` · ${perf.dias_a_cosecha} días a cosecha` : ""}
          </div>
          ${barra(pct)}
        </div>`;
      }).join("") : `<p class="nota">Todavía no hay cultivos planificados.</p>`}
    </div>

    <div class="tarjeta">
      <h2>Sectores <small>${num(sectores().reduce((a, s) => a + (Number(s.bancales) || 0), 0))} bancales</small></h2>
      <p class="nota">Cada croquis muestra los bancales del sector y cuántos
      están ocupados por el plan. Desde el teléfono es la forma de ver cómo
      quedó el campo sin abrir el mapa.</p>
      <!-- En el orden del campo —de arriba abajo y de izquierda a derecha, como
           quedaron en el mapa— pero acomodándose al ancho que haya. Antes se
           copiaba la grilla del mapa con columnas fijas, y en media pantalla
           de notebook los croquis se salían de la tarjeta y pisaban la de al
           lado. -->
      <div class="croquis-sectores">
        ${bloquesDelMapa().slice()
          .sort((a, z) => (a.y - z.y) || (a.x - z.x))
          .map((bq) => sectores().find((s) => s.sector === bq.sector))
          .map((s) => {
          const n = Number(s.bancales) || 0;
          // Qué bancales del sector tienen algo asignado. Es lo mismo que
          // dibuja el mapa, resumido a una miniatura que entra en un teléfono.
          const tomados = new Set();
          (leer(LS.generaciones, []) || [])
            .filter((g) => claveArea(g.sector) === claveArea(s.sector))
            .forEach((g) => bancalesDe(g).forEach((x) => tomados.add(x)));
          const sup = n * m2;
          return `<div class="croquis">
            <div class="croquis-cab">
              <b>${esc(s.sector)}</b>
              <span>${tomados.size} de ${n} ocupados</span>
            </div>
            <div class="croquis-camas" style="--cols:${Math.min(n, 13)}">
              ${Array.from({ length: n }, (_, i) => `<i class="${
                tomados.has(i + 1) ? "lleno" : ""}" title="Bancal ${i + 1}"></i>`).join("")}
            </div>
            <div class="croquis-pie">
              ${num(sup)} m²${s.tipo_riego ? ` · ${esc(s.tipo_riego)}` : ""}
            </div>
          </div>`;
        }).join("")}
      </div>
      <p class="nota" style="margin-top:10px">
        Bancal de ${num(b.largo_m, 1)} × ${num(b.ancho_m, 1)} m (${num(m2, 1)} m²)
        ${b.pasillo_m ? ` · pasillo ${num(b.pasillo_m, 1)} m` : ""}
        · ${num(b.n_bancales)} bancales en total
      </p>
    </div>

    <div class="tarjeta">
      <h2>La temporada</h2>
      <div class="datos">
        <div class="dato"><span>Chacra</span><b>${
          esc(CFG?.nombre || chacraActual()?.nombre || "")}</b></div>
        ${CFG?.temporada?.nombre
          ? `<div class="dato"><span>Temporada</span><b>${esc(CFG.temporada.nombre)}</b></div>` : ""}
        ${CFG?.temporada?.inicio
          ? `<div class="dato"><span>Empezó</span><b>${fechaCorta(CFG.temporada.inicio)}</b></div>` : ""}
        ${CFG?.temporada?.fin
          ? `<div class="dato"><span>Termina</span><b>${fechaCorta(CFG.temporada.fin)}</b></div>` : ""}
        <div class="dato"><span>Cultivos</span><b>${plan.length}</b></div>
        <div class="dato"><span>Generaciones</span><b>${(leer(LS.generaciones, []) || []).length}</b></div>
        <div class="dato"><span>Superficie</span><b>${
          num(plan.reduce((a, p) => a + (p.superficie_m2 || 0), 0))} m²</b></div>
        <div class="dato"><span>Cosecha esperada</span><b>${
          num(plan.reduce((a, p) => a + (p.cosecha_esperada_kg || 0), 0))} kg</b></div>
      </div>

      <h3 class="sub">Quiénes trabajan <small>${integrantes().length}</small></h3>
      <div class="chips-nombres">
        ${integrantes().map((n) => `<span class="chip-nombre">${esc(n)}</span>`).join("")}
      </div>

      <h3 class="sub">Áreas de trabajo</h3>
      <p class="nota">${areas().map((a) => esc(a.nombre)).join(" · ")}</p>
    </div>

    <div class="tarjeta">
      <button class="secundario" id="btn-ir-config">&#128736;&#65039; Configuración</button>
      <p class="nota" style="margin-top:8px">Todo esto se carga y se corrige desde el
      teléfono. Los cultivos disponibles son los mismos para todas las chacras, para
      que después se puedan comparar.</p>
    </div>`;
  },

  // Cada chacra carga acá lo suyo. Los cultivos NO se editan: salen del catálogo
  // común, que es lo que después permite comparar entre chacras.
  configuracion() {
    if (!chacraActual()) return tarjetaElegirChacra();
    if (!tieneAcceso()) return tarjetaCanje();
    // Sin haber leído lo que la chacra tiene guardado no se muestran los
    // formularios: si alguien guardara con la pantalla en blanco, borraría todo.
    if (!configConfirmada) {
      return `<div class="tarjeta">
        <h2>No pude leer la configuración</h2>
        <p class="nota">Para no pisar lo que la chacra ya tenga cargado, primero hay
        que leerlo del servidor, y para eso hace falta señal. ${navigator.onLine
          ? "Estamos reintentando…" : "Ahora no hay conexión."}</p>
        <button class="principal" id="btn-reintentar-config" style="margin-top:12px">
          Reintentar</button>
      </div>`;
    }
    const c = CFG || {};
    const t = c.temporada || {};
    const b = c.bancal || {};
    const plan = c.plan || [];
    const equipo = c.integrantes || [];
    const secs = c.sectores || [];

    return `
    <div class="tarjeta">
      <!-- A Configuración se entra desde el engranaje de arriba, que no es una
           sección de la barra: sin una salida clara quedaba como un callejón. -->
      <button type="button" class="secundario" id="volver-de-config">← Volver</button>
      <h2>&#127962; La chacra y la temporada</h2>
      <form id="form-config-general">
        <label>Nombre de la chacra</label>
        <input type="text" name="nombre" value="${esc(c.nombre || chacraActual().nombre)}"
               maxlength="60" required>

        <div class="fila">
          <div>
            <label>Temporada</label>
            <input type="text" name="temporada" value="${esc(t.nombre || "")}"
                   placeholder="Ej: 2026-27" maxlength="20" required>
          </div>
          <div>
            <label>Empieza el</label>
            <input type="date" name="inicio" value="${esc(t.inicio || "")}">
          </div>
        </div>

        <h3 class="sub">Medidas del bancal</h3>
        <div class="fila">
          <div>
            <label>Largo (m)</label>
            <input type="text" name="largo" inputmode="decimal" value="${b.largo_m || ""}"
                   placeholder="Ej: 30">
          </div>
          <div>
            <label>Ancho (m)</label>
            <input type="text" name="ancho" inputmode="decimal" value="${b.ancho_m || ""}"
                   placeholder="Ej: 1">
          </div>
          <div>
            <label>Pasillo (m)</label>
            <input type="text" name="pasillo" inputmode="decimal" value="${b.pasillo_m || ""}"
                   placeholder="Ej: 0,6">
          </div>
        </div>
        <div class="calculo" id="calculo-bancal"></div>

        <button class="principal">Guardar</button>
      </form>
    </div>

    <div class="tarjeta">
      <h2>Sectores <small>${secs.length}</small></h2>
      <p class="nota">Cada sector con cuántos bancales tiene. Es lo que aparece después
      al cargar las siembras. El nombre lo elegís vos: puede ser una letra, un número
      o un nombre (Verano, Otoño…).</p>
      <div id="lista-sectores">
        ${secs.length ? secs.map((s, i) => filaSector(s, i)).join("")
                      : `<p class="nota">Todavía no cargaste ninguno.</p>`}
      </div>
      <form id="form-sector" class="alta">
        <div id="titulo-sector"></div>
        <div class="fila">
          <div>
            <label>Nombre</label>
            <input type="text" name="sector" maxlength="24" placeholder="Ej: A o Verano" required>
          </div>
          <div>
            <label>Bancales</label>
            <input type="number" name="bancales" min="1" max="500" value="10" required>
          </div>
          <div>
            <label>Riego</label>
            <select name="tipo_riego">
              ${tiposRiego().map((r) => `<option>${esc(r)}</option>`).join("")}
            </select>
          </div>
        </div>
        <button class="secundario" id="btn-sector">Agregar sector</button>
        <button type="button" class="secundario" id="btn-cancelar-sector" hidden>Cancelar</button>
      </form>
    </div>

    <div class="tarjeta">
      <h2>Quiénes trabajan <small>${equipo.length}</small></h2>
      <div class="chips-nombres" id="lista-integrantes">
        ${equipo.length ? equipo.map((n) => `<span class="chip-nombre">${esc(n)}
            <button type="button" class="quitar" data-integrante="${esc(n)}"
                    aria-label="Quitar">&times;</button></span>`).join("")
                        : `<p class="nota">Todavía no cargaste a nadie.</p>`}
      </div>
      <form id="form-integrante" class="alta">
        <label>Nombre</label>
        <input type="text" name="nombre" maxlength="40" placeholder="Ej: Marto" required>
        <button class="secundario">Agregar</button>
      </form>
    </div>

    <div class="tarjeta">
      <h2>Áreas de trabajo <small>${areas().length}</small></h2>
      <p class="nota">Con qué se clasifica cada hora y cada tarea. Las seis primeras
      vienen con la app y son iguales en todas las chacras: así las horas se pueden
      comparar entre colectivos. Abajo podés sumar las propias de tu espacio.</p>

      <div class="lista-areas">
        ${AREAS_FIJAS.map((a) => `<div class="registro">
            <div><div class="detalle">${esc(a.nombre)}</div>
              <div class="cuando">${a.actividades.map(esc).join(" · ")}</div></div>
          </div>`).join("")}
      </div>

      <h3 class="sub">Propias de esta chacra</h3>
      <div id="lista-areas-propias">
        ${areasPropias().length ? areasPropias().map((a, i) => `<div class="registro">
            <div><div class="detalle">${esc(a.nombre)}${
                (a.estado || "activo") !== "activo" ? ` <small>${esc(a.estado)}</small>` : ""}</div>
              <div class="cuando">${(a.actividades || []).length
                ? (a.actividades || []).map(esc).join(" · ")
                : "sin actividades: se escribe en Observaciones"}</div></div>
            <button type="button" class="quitar" data-area="${i}" aria-label="Quitar">&times;</button>
          </div>`).join("")
          : `<p class="nota">Ninguna todavía. Las seis de arriba ya alcanzan para empezar.</p>`}
      </div>
      <form id="form-area" class="alta">
        <div class="fila">
          <div>
            <label>Nombre</label>
            <input type="text" name="nombre" maxlength="40" placeholder="Ej: Plantinera" required>
          </div>
          <div>
            <label>Estado</label>
            <select name="estado">
              ${ESTADOS_AREA.map((e) => `<option>${e}</option>`).join("")}
            </select>
          </div>
        </div>
        <label>Actividades <small>(separadas por coma)</small></label>
        <input type="text" name="actividades" maxlength="240"
               placeholder="Ej: Diseño, Ejecución, Mejoras">
        <button class="secundario">Agregar área</button>
      </form>
    </div>

    <div class="tarjeta">
      <h2>Plan de cultivos <small>${plan.length}</small></h2>
      <p class="nota">Se carga en <b>bancales</b>, que es como se planifica en el campo.
      Los metros, los kilos esperados y las plantas los calcula solo. Los cultivos salen
      de una lista común a todas las chacras: si falta alguno, escribime y lo agregamos.</p>
      ${bancalM2() ? "" : `<p class="nota" style="color:#b06a00">Primero cargá las medidas
        del bancal, acá arriba: sin eso no se puede pasar de bancales a metros.</p>`}
      <div id="lista-plan">
        ${plan.length ? plan.map((p, i) => filaPlan(p, i)).join("")
                      : `<p class="nota">Todavía no planificaste ningún cultivo.</p>`}
      </div>

      <details id="alta-cultivo">
        <summary>Agregar o completar un cultivo</summary>
        <p class="nota">Queda disponible para todas las chacras, no solo para la
        tuya. Por eso conviene escribirlo como se lo conoce, y hay que cargar
        todos los datos: un cultivo a medias no le sirve a nadie.</p>
        ${cultivosPorCompletar().length ? `<p class="nota">Estos están en el
        catálogo pero sin datos. Si cultivás alguno, escribí su nombre acá y
        completalo: <b>${cultivosPorCompletar().map(esc).join(", ")}</b>.</p>` : ""}
        <form id="form-cultivo">
          <label>Nombre del cultivo</label>
          <input type="text" name="cultivo" maxlength="40" placeholder="Ej: Cilantro" required>

          <label>¿Cómo se siembra?</label>
          <select name="tipo_siembra">
            ${tiposSiembra().map((s) => `<option>${esc(s)}</option>`).join("")}
          </select>

          <div id="bloque-almacigo" class="fila">
            <div>
              <label>Días en almácigo</label>
              <input type="text" name="dias_almacigo" inputmode="numeric" placeholder="Ej: 35">
            </div>
            <div>
              <label>De trasplante a cosecha</label>
              <input type="text" name="dias_trasplante_cosecha" inputmode="numeric" placeholder="Ej: 52">
            </div>
          </div>
          <!-- Opcionales a propósito: nadie sabe de memoria, parado en la
               huerta, cuántos días tarda un pepinillo en invierno. Si quedan
               vacíos el cultivo entra igual y se usa el número de arriba. -->
          <div id="bloque-estacion" class="fila">
            <div>
              <label>Almácigo en invierno <small>(opcional)</small></label>
              <input type="text" name="dias_almacigo_oi" inputmode="numeric" placeholder="Ej: 45">
            </div>
            <div>
              <label>Almácigo en verano <small>(opcional)</small></label>
              <input type="text" name="dias_almacigo_pv" inputmode="numeric" placeholder="Ej: 30">
            </div>
          </div>
          <div class="fila">
            <div id="bloque-directa">
              <label>Días a cosecha <small>(desde la siembra)</small></label>
              <input type="text" name="dias_a_cosecha" inputmode="numeric" placeholder="Ej: 87">
            </div>
            <div>
              <label>Días en cosecha</label>
              <input type="text" name="dias_en_cosecha" inputmode="numeric" placeholder="Ej: 30">
            </div>
          </div>
          <p class="nota" id="suma-cosecha"></p>

          <h3 class="sub">Marco de plantación</h3>
          <div class="fila">
            <div>
              <label>Líneas por bancal</label>
              <input type="text" name="lineas_bancal" inputmode="numeric" placeholder="Ej: 3">
            </div>
            <div>
              <label>Distancia (cm)</label>
              <input type="text" name="distancia_cm" inputmode="numeric" placeholder="Ej: 40">
            </div>
          </div>

          <label>Rinde de referencia <small>(kg por m²)</small></label>
          <input type="text" name="rinde_ref_kg_m2" inputmode="decimal" placeholder="Ej: 5,5">

          <label>Observaciones <small>(lo único opcional)</small></label>
          <input type="text" name="observaciones" maxlength="120"
                 placeholder="Variedad, de dónde salen los datos">

          <button class="secundario">Agregar al catálogo</button>
        </form>
      </details>

      <!-- El plan por cultivo se arma en Plan → Planificar, junto con sus
           generaciones y sus fechas. Estaba también acá, y eran las dos
           mitades de una misma decisión cargadas por separado: el total podía
           decir seis bancales de acelga mientras las generaciones decían tres,
           sin que nada avisara. Ahora el total sale de las generaciones. -->
      <p class="nota">Los cultivos de la temporada —con su marco, su rinde y
      sus generaciones— se cargan en <b>Plan → Planificar</b>. Acá se define
      cómo es la chacra; allá, qué se va a hacer esta temporada.</p>
    </div>`;
  },

  ajustes() {
    return `
    <div class="tarjeta">
      <h2>Versión de la app</h2>
      <p class="nota">Si algo que te dijeron que estaba arreglado no aparece, el
      teléfono puede haber quedado con una copia vieja guardada. Este botón la
      tira y vuelve a bajar todo.</p>
      <p class="nota">Tenés la <b>${esc(VERSION_APP)}</b></p>
      <button class="secundario" id="btn-actualizar-app">Buscar actualización</button>
    </div>

    <div class="tarjeta">
      <h2>&#9881; Ajustes</h2>
      <label>Chacra</label>
      <select id="aj-chacra">
        <option value="" disabled${chacraCodigo() ? "" : " selected"}>Elegí tu chacra…</option>
        ${CHACRAS.map((c) => `<option value="${esc(c.codigo)}"${c.codigo === chacraCodigo() ? " selected" : ""}>
          ${esc(c.nombre)}</option>`).join("")}
      </select>
      <p class="nota" style="margin-top:6px">Cambiarla hace que los registros vayan a
      la planilla de otra chacra. Se elige una vez y no se toca más.</p>

      <label>Tu nombre (queda en cada registro que cargues)</label>
      <select id="aj-nombre">${opcionesIntegrante(leer(LS.nombre, ""))}</select>

      <p class="nota">Con elegir tu nombre alcanza: las dos planillas ya vienen
      conectadas. Los campos de abajo son para cuando cambie algún servicio.</p>

      <label>Servicio de siembras, cosechas y tareas <small>(planilla de la chacra)</small></label>
      <input type="url" id="aj-url" value="${esc(leer(LS.scriptUrl, ""))}"
             placeholder="ya viene configurado — dejalo vacío">

      <label>Servicio de horas <small>(planilla del proyecto)</small></label>
      <input type="url" id="aj-url-horas" value="${esc(leer(LS.urlHoras, ""))}"
             placeholder="ya viene configurado — dejalo vacío">

      <button class="principal" id="btn-guardar-ajustes">Guardar ajustes</button>
      <button class="secundario" id="btn-probar">Probar conexión</button>
    </div>

    ${tieneAcceso() ? `<div class="tarjeta">
      <h2>Este teléfono</h2>
      <p class="nota">Activado para <b>${esc(chacraActual()?.nombre || "")}</b>
      como <b>${esc(leer(LS.nombre, "—"))}</b>.</p>
      <button class="secundario" id="btn-desvincular">Desvincular este teléfono</button>
      <p class="nota" style="margin-top:8px">Vuelve a pedir un código de acceso.
      Lo que tengas sin enviar no se pierde: se manda cuando lo actives de nuevo.</p>
    </div>` : ""}
    <div class="tarjeta">
      <h2>Acerca de</h2>
      <p class="nota"><b>AMA Producción</b> — Aplicaciones para el Manejo Agroecológico.
      Los registros se guardan en este teléfono (funciona sin señal) y se envían a la
      planilla de la chacra cuando hay conexión.</p>
      <p class="nota" style="margin-top:8px">
        Chacra: ${esc(chacraActual()?.nombre || "sin elegir")} ·
        ${hayConfig() ? `temporada ${esc(CFG.temporada?.nombre || "")},
          ${(CFG.plan || []).length} cultivos` : "sin configurar"} ·
        catálogo de ${cultivosDisponibles().length} cultivos.</p>
    </div>`;
  },
};
