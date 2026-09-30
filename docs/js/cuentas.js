// js/cuentas.js       — AMA Producción
//
// Cuentas de sueldos y resumen económico: los calcula Bioma, acá se dibujan.
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos. Se partió app.js el 30/09/2026 sin cambiar código.

/* El flujo mes a mes, en tres series sobre el mismo par de ejes.

   - Barras: el saldo del mes. Verdes hacia arriba, rojas hacia abajo. Van de
     fondo y translúcidas para que las líneas se lean por encima.
   - Línea verde: lo que entró. Línea ámbar: lo que salió.

   Comparten un solo eje a propósito. Como el saldo es la resta, la distancia
   vertical entre las dos líneas es la altura de la barra: las dos cosas
   cuentan lo mismo y se refuerzan, y donde la línea verde cruza por debajo de
   la ámbar la barra se pone roja sola.

   Los números vienen calculados de Bioma; acá solo se dibujan. SVG a mano,
   sin librerías, igual que el resto de la app.

   La lista llega del mes más nuevo al más viejo: se da vuelta para dibujar,
   porque el tiempo en un gráfico va hacia la derecha. */
function graficoDelFlujo(meses) {
  const lista = (meses || []).slice().reverse();
  if (lista.length < 2) return "";   // con un solo mes no hay nada que comparar

  const ANCHO_MES = 46, ALTO = 150, ARRIBA = 12, ABAJO = 20;
  const util = ALTO - ARRIBA - ABAJO;
  const ancho = lista.length * ANCHO_MES;
  const v = (m, k) => Number(m[k]) || 0;

  const techo = Math.max(...lista.map((m) =>
    Math.max(v(m, "ingresos"), v(m, "egresos"), v(m, "balance"))), 1);
  const piso = Math.min(0, ...lista.map((m) => v(m, "balance")));
  const y = (n) => ARRIBA + ((techo - n) / ((techo - piso) || 1)) * util;
  const x = (i) => i * ANCHO_MES + ANCHO_MES / 2;
  const cero = y(0);

  const barras = lista.map((m, i) => {
    const b = v(m, "balance"), pos = b >= 0;
    return `<g><title>${esc(m.mes)}
${pesos(v(m, "ingresos"))} entró · ${pesos(v(m, "egresos"))} salió
saldo ${conSigno(b)}</title>
      <rect class="gf-barra${pos ? "" : " neg"}" x="${x(i) - 11}"
        y="${(pos ? y(b) : cero).toFixed(1)}" width="22"
        height="${Math.max(Math.abs(cero - y(b)), 1).toFixed(1)}" rx="2"/></g>`;
  }).join("");

  const serie = (clave, clase) =>
    `<polyline class="gf-linea ${clase}" points="${
      lista.map((m, i) => `${x(i)},${y(v(m, clave)).toFixed(1)}`).join(" ")}"/>` +
    lista.map((m, i) => `<circle class="gf-punto ${clase}" cx="${x(i)}"
      cy="${y(v(m, clave)).toFixed(1)}" r="2.5"/>`).join("");

  return `
  <div class="gf-leyenda">
    <span><i class="gf-m-barra"></i> saldo del mes</span>
    <span><i class="gf-m-in"></i> entró</span>
    <span><i class="gf-m-out"></i> salió</span>
  </div>
  <div class="gf-scroll">
    <svg viewBox="0 0 ${ancho} ${ALTO}" width="${ancho}" height="${ALTO}"
         role="img" aria-label="Flujo de fondos mes a mes">
      <line class="gf-cero" x1="0" y1="${cero.toFixed(1)}" x2="${ancho}" y2="${cero.toFixed(1)}"/>
      ${barras}
      ${serie("egresos", "out")}
      ${serie("ingresos", "in")}
      ${lista.map((m, i) => `<text class="gf-lbl" x="${x(i)}" y="${ALTO - 6}"
        text-anchor="middle">${esc(String(m.mes).slice(5))}/${esc(String(m.mes).slice(2, 4))}</text>`).join("")}
    </svg>
  </div>`;
}

// En qué etapa del ciclo estamos. Sin esto, un balance de septiembre se lee
// como una alarma: los ingresos por venta recién llegan en noviembre, mientras
// que las horas y los insumos se gastan desde julio. La plata que entra antes
// suele ser préstamos, y eso es parte del plan, no un problema.
const ETAPAS = [
  [7, "julio: se planifica la temporada. Todavía no hay nada para vender, así que lo que entra suele ser préstamos para semillas, fertilizantes y horas."],
  [8, "agosto: primeras siembras. Se gasta en insumos y horas; las ventas todavía no empiezan."],
  [9, "septiembre: almácigos y primeros trasplantes. El balance negativo en esta etapa es lo esperable."],
  [10, "octubre: trasplantes. Sigue siendo mes de gasto más que de ingreso."],
  [11, "noviembre: primeras cosechas, empiezan a entrar las ventas."],
  [12, "diciembre: cosecha y venta en marcha."],
  [1, "enero: plena cosecha, el mes fuerte de ingresos."],
  [2, "febrero: plena cosecha."],
  [3, "marzo: cosecha y venta."],
  [4, "abril: últimas cosechas de la temporada."],
  [5, "mayo: cierre de la temporada de venta."],
  [6, "junio: receso de invierno."],
];

function etapaDeLaTemporada() {
  const mes = new Date().getMonth() + 1;
  const e = ETAPAS.find(([m]) => m === mes);
  return e ? e[1] : "";
}

// El estado economico del proyecto. Quien no esté habilitado ve solo cómo viene
// la liquidación de sueldos y en qué se trabajó; el resto no le llega ni al
// teléfono, porque el filtro se hace en el servicio.
function tarjetasDeEconomia(e) {
  if (!e || e.error) return "";
  const barras = (lista, clave) => (lista || []).map((x) => `
    <div class="linea-barra">
      <div class="linea-barra-tope">
        <span>${esc(x[clave])}</span>
        <b>${clave === "area" ? num(x.horas, 1) + " h" : pesos(x.monto)}</b>
      </div>
      <div class="barra"><div class="barra-llena" style="width:${Math.min(100, Number(x.porcentaje) || 0)}%"></div></div>
      ${(x.actividades || []).length ? `<div class="cuando">${
        x.actividades.map((a) => `${esc(a.actividad)} ${num(a.horas, 1)} h`).join(" · ")
      }</div>` : ""}
    </div>`).join("");

  const s = e.sueldos;
  const liq = s && s.devengado ? (s.pagado / s.devengado) * 100 : 0;

  return `
  ${s ? `<div class="tarjeta">
    <h2>Sueldos del proyecto</h2>
    <div class="cifras">
      ${cifraClara(pesos(s.devengado), "devengado")}
      ${cifraClara(pesos(s.pagado), "pagado")}
      ${cifraClara(pesos(s.saldo), "se debe")}
    </div>
    <div class="barra" style="margin-top:10px"><div class="barra-llena" style="width:${liq}%"></div></div>
    <p class="nota">${num(liq, 1)}% de lo trabajado ya está pago.</p>
  </div>` : ""}

  ${e.horas && (e.horas.porArea || []).length ? `<div class="tarjeta">
    <h2>En qué se trabajó <small>${num(e.horas.total, 1)} h</small></h2>
    ${barras(e.horas.porArea, "area")}
  </div>` : ""}

  ${e.resumen ? `<div class="tarjeta">
    <h2>Balance de la temporada <small>${esc(e.temporada || "")}</small></h2>
    <div class="cifras">
      ${cifraClara(pesos(e.resumen.ingresos), "ingresos")}
      ${cifraClara(pesos(e.resumen.egresos), "egresos")}
      ${cifraClara(conSigno(e.resumen.balance), Number(e.resumen.balance) < 0 ? "en rojo" : "balance")}
    </div>
    ${e.resumen.disponible === null || e.resumen.disponible === undefined ? ""
      : `<p class="nota">Disponible hoy: <b>${pesos(e.resumen.disponible)}</b></p>`}
    <p class="nota">${etapaDeLaTemporada()}</p>
  </div>` : ""}

  ${(e.meses || []).length ? `<div class="tarjeta">
    <h2>Ingresos y egresos, mes a mes</h2>
    ${graficoDelFlujo(e.meses)}
    ${e.meses.map((m) => `<div class="registro">
      <div><div class="detalle">${esc(m.mes)}</div>
        <div class="cuando">${pesos(m.ingresos)} entró · ${pesos(m.egresos)} salió${
          m.acumulado === undefined || m.acumulado === null ? ""
            : ` · acumulado ${conSigno(m.acumulado)}`}</div></div>
      <div class="saldo${Number(m.balance) < 0 ? " alerta" : ""}">${conSigno(m.balance)}</div>
    </div>`).join("")}
  </div>` : ""}

  ${(e.ingresos_por_concepto || []).length ? `<div class="tarjeta">
    <h2>De dónde vino la plata</h2>
    ${barras(e.ingresos_por_concepto, "concepto")}
  </div>` : ""}

  ${(e.egresos_por_concepto || []).length ? `<div class="tarjeta">
    <h2>En qué se fue</h2>
    ${barras(e.egresos_por_concepto, "concepto")}
  </div>` : ""}`;
}

// La cuenta de una persona: qué ganó, qué cobró y qué le queda.
function detalleDeCuenta(x, d) {
  const propia = claveArea(x.nombre) === claveArea(d.yo || "");
  const liquidado = Math.max(0, Math.min(100, Number(x.liquidado) || 0));
  const saldo = Number(x.saldo) || 0;

  // horasPagadas puede venir nula: si alguien cobró antes de cargar horas, no
  // hay tarifa con qué convertir y el contrato pide no inventar el número.
  const enHoras = (v) => (v === null || v === undefined)
    ? "" : ` <small>(~${num(v, 1)} h)</small>`;

  return `
  <div class="tarjeta">
    ${d.ve_todo && (d.trabajadores || []).length > 1
      ? `<button type="button" class="secundario" id="btn-volver-cuentas">← Todas las cuentas</button>`
      : ""}
    <h2>${propia ? `Tu cuenta <small>${esc(x.nombre)}</small>` : esc(x.nombre)}</h2>

    <div class="cifras">
      ${cifraClara(num(x.horas, 1), "horas")}
      ${cifraClara(pesos(x.devengado), "ganado")}
      ${cifraClara(pesos(x.pagado), "cobrado")}
    </div>

    <div class="saldo-grande${saldo < 0 ? " alerta" : ""}">
      ${saldo < 0 ? "Cobraste de más" : "Te queda por cobrar"}
      <b>${conSigno(saldo)}</b>${enHoras(saldo < 0 ? null : x.horasAdeudadas)}
    </div>
    <div class="barra"><div class="barra-llena" style="width:${liquidado}%"></div></div>
    <p class="nota">${num(liquidado, 1)}% de lo ganado ya está cobrado.
      Tarifa ${pesos(x.tarifa)} por hora.
      ${x.ultimoPago ? `Último pago el ${fechaCorta(x.ultimoPago)}.` : "Todavía sin pagos."}</p>
    ${saldo < 0 ? `<p class="nota">Es un adelanto: cobraste antes de trabajar
      esas horas. Se descuenta solo a medida que las cargues.</p>` : ""}
  </div>

  <div class="tarjeta">
    <h2>Mes a mes</h2>
    ${(x.meses || []).length ? (x.meses || []).map((m) => `<div class="registro">
      <div><div class="detalle">${esc(m.mes)} — ${num(m.horas, 1)} h</div>
        <div class="cuando">${(m.areas || []).map((a) =>
          `${esc(a.area)} ${num(a.horas, 1)} h`).join(" · ")}</div></div>
      <div class="saldo">${pesos(m.devengado)}</div>
    </div>`).join("") : `<p class="nota">Todavía no hay horas cargadas.</p>`}
  </div>

  <div class="tarjeta">
    <h2>Pagos recibidos <small>${(x.pagos || []).length}</small></h2>
    ${(x.pagos || []).length ? (x.pagos || []).map((g) => `<div class="registro">
      <div><div class="detalle">${pesos(g.monto)}</div>
        <div class="cuando">${fechaCorta(g.fecha)}${g.obs ? " · " + esc(g.obs) : ""}</div></div>
    </div>`).join("") : `<p class="nota">Todavía no recibiste pagos.</p>`}
    <p class="nota">Los pagos se registran en la app de Bioma. Si falta alguno o
    hay un número que no cierra, avisá: se corrige allá, no acá.</p>
  </div>`;
}

function prepararCuentas() {
  document.querySelectorAll("[data-cuenta]").forEach((fila) => {
    fila.onclick = () => { cuentaAbierta = fila.dataset.cuenta; render("cuentas"); };
  });
  const volver = $("#btn-volver-cuentas");
  if (volver) volver.onclick = () => { cuentaAbierta = ""; render("cuentas"); };
}
