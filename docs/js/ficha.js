// js/ficha.js         — AMA Producción
//
// La ficha de un cultivo: lo que dice el catálogo, el plan de esta chacra, lo
// que pasó en el campo y la referencia ("Saber más").
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos. Se partió app.js el 30/09/2026 sin cambiar código.

// ---- Ficha de un cultivo ----
// Todo lo que la app sabe de un cultivo, junto. Hoy, para responder "¿cuánto
// tarda el brócoli?" o "¿cuánto llevamos cosechado?" hay que abrir la planilla.
// Lo que se muestra sale de tres lados distintos y conviene no mezclarlos: el
// catálogo (común a las seis chacras), el plan de esta chacra, y lo que de
// verdad pasó en el campo.
function fichaCultivo(cultivo) {
  const p = perfil(cultivo) || {};
  const enElPlan = enPlan(cultivo);
  const f = (leer(LS.fichas, {}) || {})[cultivo];
  const m2 = bancalM2();

  const dato = (etiqueta, valor) => valor
    ? `<div class="dato"><span>${etiqueta}</span><b>${valor}</b></div>` : "";

  // --- lo que dice el catálogo ---
  const almacigo = (p.dias_almacigo_oi && p.dias_almacigo_pv)
    ? `${p.dias_almacigo_pv} a ${p.dias_almacigo_oi} días <small>(verano / invierno)</small>`
    : (p.dias_almacigo ? `${p.dias_almacigo} días` : "");
  const cosechaDura = p.dias_en_cosecha_max
    ? (p.dias_en_cosecha_min && p.dias_en_cosecha_min !== p.dias_en_cosecha_max
        ? `${p.dias_en_cosecha_min} a ${p.dias_en_cosecha_max} días`
        : `${p.dias_en_cosecha_max} días`)
    : (p.dias_en_cosecha ? `${p.dias_en_cosecha} días` : "");

  // --- las generaciones sembradas, con su ventana de cosecha ---
  const siembras = (f?.siembras || []).slice().sort((a, b) =>
    String(a.fecha).localeCompare(String(b.fecha)));
  const trasplantes = f?.trasplantes || [];
  const porSiembra = {};
  trasplantes.forEach((t) => { (porSiembra[t.siembra_id] = porSiembra[t.siembra_id] || []).push(t); });

  const generaciones = siembras.map((s) => {
    const suyos = porSiembra[s.id] || [];
    // Las fechas, de lo más firme a lo menos: lo que pasó (el trasplante
    // registrado), lo que dice hoy el plan, y lo que se estimó el día de la
    // siembra. Las estimadas de la hoja Siembras son una foto de ese día: si
    // el plan se corrió después, mostrarlas contradecía al Plan estratégico.
    // Una siembra directa no tiene trasplante: su cosecha sale de la siembra.
    const plan = EN_BANDEJA.has(s.tipo)
      ? trasplanteDelPlan({ cultivo, generacion: s.generacion, id: s.id }) : "";
    const aCampo = suyos.length ? suyos[0].fecha : plan;
    const inicio = aCampo && p.dias_trasplante_cosecha
      ? sumarDias(aCampo, p.dias_trasplante_cosecha) : (s.cosecha_estimada || "");
    const dura = p.dias_en_cosecha_max || p.dias_en_cosecha || 0;
    const fin = inicio && dura ? sumarDias(inicio, dura) : "";
    const real = suyos.length
      ? `trasplantado el ${fechaCorta(suyos[0].fecha)} · ${suyos[0].dias_reales} días en bandeja`
        + (suyos[0].diferencia
            ? ` <b>(${suyos[0].diferencia > 0 ? "+" : ""}${suyos[0].diferencia} vs. lo teórico)</b>`
            : "")
      : plan ? `el plan lo trasplanta el ${fechaCorta(plan)}`
      : (s.trasplante_estimado ? `trasplante estimado ${fechaCorta(s.trasplante_estimado)}` : "");
    const donde = suyos.length
      ? suyos.map((t) => `${t.sector} ${t.bancal}`).join(", ")
      : (s.sector ? `${s.sector} ${s.bancal}` : "");
    return `<div class="registro">
      <div>
        <div class="detalle">G${s.generacion}${s.variedad ? " · " + esc(s.variedad) : ""}
          ${donde ? `<small>${esc(donde)}</small>` : ""}</div>
        <div class="cuando">sembrado el ${fechaCorta(s.fecha)}${
          s.plantines ? " · " + num(s.plantines) + " plantines" : ""}<br>${real}</div>
      </div>
      ${inicio ? `<span class="etiqueta ok">cosecha ${fechaCorta(inicio)}${
        fin ? " a " + fechaCorta(fin) : ""}</span>` : ""}
    </div>`;
  }).join("");

  // --- variedades que de verdad se usaron acá ---
  const variedades = [...new Set(siembras.map((s) => s.variedad).filter(Boolean))];

  const cosechado = f?.kg_cosechados || 0;
  const esperado = enElPlan?.cosecha_esperada_kg || 0;

  // --- la ficha de referencia, si ya se bajó ---
  const ref = FICHAS?.fichas?.[cultivo];
  const fuentes = FICHAS?._fuentes || [];
  // Va abajo y plegado: quien abre la ficha suele venir a ver cómo viene el
  // cultivo esta temporada, no a leer sobre la especie. Lo de leer queda a un
  // toque de distancia para cuando sí se lo busca.
  const bloqueRef = ref ? `
    <details class="saber-mas" data-recordar="saber-mas"${estaDesplegado("saber-mas") ? " open" : ""}>
    <summary>Saber más sobre ${esc(cultivo)}</summary>
    <div class="ficha-ref">
      <div class="ficha-titulo">
        <span class="ficha-emoji">${ref.emoji || "🌱"}</span>
        <div>
          <b>${esc(ref.familia)}</b>
          <div class="especie">${esc(ref.especie)}</div>
        </div>
      </div>
      ${ref.resumen.split("\n\n").map((t) => `<p>${esc(t)}</p>`).join("")}
      ${ref.manejo?.length ? `<h4>Manejo</h4><ul>${
        ref.manejo.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
      ${ref.problemas?.length ? `<h4>Plagas y enfermedades</h4><ul>${
        ref.problemas.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
      ${ref.presentacion ? `<h4>Cómo se presenta</h4><p>${esc(ref.presentacion)}</p>` : ""}
      <p class="nota">Información general, no receta: lo que pasa en tu chacra manda.
      ${fuentes.length ? "Referencias regionales: " + fuentes.map((f) =>
        `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.autores)}</a>`
      ).join(" · ") : ""}</p>
    </div>
    </details>` : "";

  return `
  <div class="tarjeta">
    <h2>${esc(cultivo)}</h2>
    <button type="button" class="secundario" id="volver-plan">← Volver al plan</button>
    <button type="button" class="secundario" data-editar-cultivo="${esc(cultivo)}">Editar generaciones y bancales</button>

    <h3 class="sub">Lo que sabe el catálogo</h3>
    <p class="nota">Común a las seis chacras. Se corrige en Plan → Agregar o completar un cultivo.</p>
    <div class="datos">
      ${dato("Cómo se siembra", esc(p.tipo_siembra || ""))}
      ${dato("En almácigo", almacigo)}
      ${dato("De trasplante a cosecha", p.dias_trasplante_cosecha ? p.dias_trasplante_cosecha + " días" : "")}
      ${dato("De siembra a cosecha", p.dias_a_cosecha ? p.dias_a_cosecha + " días" : "")}
      ${dato("Dura la cosecha", cosechaDura)}
      ${dato("Marco de plantación", p.lineas_bancal
        ? `${num(p.lineas_bancal)} líneas a ${num(p.distancia_cm)} cm` : "")}
      ${dato("Rinde de referencia", p.rinde_ref_kg_m2 ? num(p.rinde_ref_kg_m2, 2) + " kg/m²" : "")}
    </div>

    ${enElPlan ? `
    <h3 class="sub">En el plan de ${esc(chacraActual()?.nombre || "la chacra")}</h3>
    <div class="datos">
      ${dato("Superficie", num(enElPlan.superficie_m2) + " m²")}
      ${dato("Bancales", m2 ? num(enElPlan.superficie_m2 / m2, 1) : "")}
      ${dato("Plantas", enElPlan.plantas ? num(enElPlan.plantas) : "")}
      ${dato("Cosecha esperada", esperado ? num(esperado) + " kg" : "")}
      ${dato("Cosechado", `${num(cosechado, 1)} kg`)}
    </div>
    ${esperado ? barra((cosechado / esperado) * 100) : ""}` : `
    <p class="nota">Este cultivo no está en el plan de la temporada.</p>`}

    ${variedades.length ? `
    <h3 class="sub">Variedades sembradas</h3>
    <p class="nota">${variedades.map(esc).join(" · ")}</p>` : ""}

    <h3 class="sub">Generaciones <small>${siembras.length}</small></h3>
    ${siembras.length ? generaciones : `<p class="nota">${f
      ? "Todavía no se sembró ninguna generación de este cultivo esta temporada."
      : "Buscando los registros…"}</p>`}

    ${(f?.cosechas || []).length ? `
    <h3 class="sub">Cosechas <small>${f.cosechas.length}</small></h3>
    ${f.cosechas.slice().reverse().slice(0, 12).map((c) => `<div class="registro">
      <div><div class="detalle">${fechaCorta(c.fecha)}</div>
        <div class="cuando">${esc(c.operador || "")}</div></div>
      <span class="etiqueta ok">${num(c.kg, 1)} kg</span>
    </div>`).join("")}` : ""}

    ${bloqueRef}
  </div>`;
}

const filaPlan = (p, i) => {
  const b = bancalM2();
  const detalle = [
    b ? `${num(p.superficie_m2 / b, 1)} bancales` : "",
    `${num(p.superficie_m2)} m²`,
    p.plantas ? `${num(p.plantas)} plantas` : "",
    p.rinde_kg_m2 ? `${num(p.rinde_kg_m2, 2)} kg/m²` : "",
  ].filter(Boolean).join(" · ");

  return `<div class="registro">
    <div><div class="detalle">${esc(p.cultivo)}</div>
      <div class="cuando">${detalle}</div></div>
    <span class="etiqueta ok">${num(p.cosecha_esperada_kg)} kg</span>
    <!-- Sin botón de editar: estos totales ya no se escriben a mano, salen de
         sumar las generaciones. Se corrigen en Plan → Planificar. -->
    <button type="button" class="quitar" data-plan="${i}" aria-label="Quitar">&times;</button>
  </div>`;
};
