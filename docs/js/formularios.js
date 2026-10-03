// js/formularios.js   — AMA Producción
//
// Lo que responde a los formularios de carga: siembras, trasplantes, cosechas,
// horas y ajustes (preparar*).
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos. Se partió app.js el 30/09/2026 sin cambiar código.

function prepararSiembras() {
  const f = $("#form-siembras");
  // Si el teléfono todavía no está activado, la vista muestra la tarjeta
  // del código y este formulario no existe.
  if (!f) return;
  const bandejas = $("#bloque-bandejas");
  const lugar = $("#bloque-lugar");
  const calculo = $("#calculo-siembra");
  enlazarSectorBancal(f);
  enlazarBuscadores(f);

  // Tocar algo de "Para sembrar" deja el formulario completo con lo que el
  // plan ya sabe: la fecha de hoy (es contra ella que después se compara lo
  // planificado), el cultivo, la variedad, la generación, y las bandejas ya
  // calculadas con el marco del plan. Queda todo editable: es una ayuda, no un
  // dictado.
  let bandejasTocadas = false;
  let delPlan = null;
  f.bandejas.addEventListener("input", (e) => { if (e.isTrusted) bandejasTocadas = true; });
  const sugerirBandejas = () => {
    if (!delPlan || bandejasTocadas || !EN_BANDEJA.has(f.tipo.value)) return;
    const b = bandejasDelPlan(delPlan.cultivo, delPlan.camas || 1, parseInt(f.tipo_bandeja.value, 10) || 0, delPlan.sector);
    if (b) f.bandejas.value = b.bandejas;
  };
  if (siembraSugerida) {
    const s = siembraSugerida;
    siembraSugerida = null;            // se usa una sola vez
    delPlan = s;
    f.fecha.value = hoy();
    f.cultivo.value = s.cultivo;
    const caja = f.querySelector("[data-buscador] .buscador-texto");
    if (caja) caja.value = s.cultivo;
    f.variedad.value = s.variedad || ultimaVariedad(s.cultivo);
    f.generacion.value = s.generacion || 1;
    const tipo = s.directa ? "Siembra directa" : "Siembra almácigo";
    if ([...f.tipo.options].some((o) => o.value === tipo)) f.tipo.value = tipo;
    // La bandeja de 128 es la de siempre; si la chacra no la tiene, la primera.
    if ([...f.tipo_bandeja.options].some((o) => o.value === "128")) f.tipo_bandeja.value = "128";
    sugerirBandejas();
    // Siembra directa: el lugar que le dio el plan en el mapa.
    if (s.directa && s.sector && f.sector) {
      f.sector.value = s.sector;
      f.sector.dispatchEvent(new Event("change"));
      if (s.bancal && f.bancal) f.bancal.value = String(s.bancal);
    }
    const gs = s.generaciones || [s.generacion];
    $("#desde-el-plan").innerHTML = `<div class="desde-plan">
      <b>Del plan:</b> ${esc(s.cultivo)} ${etiquetaGeneraciones(gs)}
      · planificada para el ${fechaCorta(s.cuando)}${s.camas ? ` · ${num(s.camas, 1)} bancal(es)` : ""}.
      Revisá y guardá.
      <button type="button" class="secundario" id="limpiar-plan">Cargar otra cosa</button>
    </div>`;
    $("#limpiar-plan").onclick = () => render("siembras");
  }
  f.tipo_bandeja.addEventListener("change", sugerirBandejas);

  const actualizar = () => {
    const tipo = f.tipo.value;
    const conBandeja = EN_BANDEJA.has(tipo);
    bandejas.style.display = conBandeja ? "" : "none";
    lugar.style.display = conBandeja ? "none" : "";

    const p = perfil(f.cultivo.value);
    const partes = [];
    if (conBandeja) {
      const total = (parseInt(f.bandejas.value, 10) || 0) * (parseInt(f.tipo_bandeja.value, 10) || 0);
      partes.push(`<b>${num(total)}</b> plantines`);
      // Lo que pide el plan, para que la cuenta de las bandejas se vea.
      const b = delPlan && claveArea(delPlan.cultivo) === claveArea(f.cultivo.value)
        ? bandejasDelPlan(delPlan.cultivo, delPlan.camas || 1, parseInt(f.tipo_bandeja.value, 10) || 0, delPlan.sector) : null;
      if (b) partes.push(`el plan pide <b>${num(b.plantas)} plantas</b> (${num(b.bancales, 1)} bancal(es),
        ${b.lineas} líneas a ${b.distancia} cm) = ${b.bandejas} bandeja(s) de ${b.alveolos}`);
      // Los días dependen de la estación: se cuentan desde la fecha de siembra.
      const alm = diasAlmacigo(f.cultivo.value, f.fecha.value);
      if (alm) {
        const r = rangoAlmacigo(f.cultivo.value);
        partes.push(`trasplante estimado: <b>${fechaCorta(sumarDias(f.fecha.value, alm))}</b>`
          + (r ? ` <small>(${alm} días; entre ${r.min} y ${r.max} según la estación)</small>` : ""));
      }
      if (p.dias_a_cosecha) partes.push(`cosecha estimada: <b>${fechaCorta(sumarDias(f.fecha.value, p.dias_a_cosecha))}</b>`);
    } else {
      const dias = tipo === "Trasplante" ? p.dias_trasplante_cosecha : p.dias_a_cosecha;
      if (dias) partes.push(`cosecha estimada: <b>${fechaCorta(sumarDias(f.fecha.value, dias))}</b>`);
      const plan = enPlan(f.cultivo.value);
      if (plan) partes.push(`plan: ${num(plan.superficie_m2)} m² · ${num(plan.lineas)} líneas a ${num(plan.distancia_cm)} cm`);
    }
    calculo.innerHTML = partes.length ? partes.join(" · ") : "Elegí el cultivo para ver las fechas estimadas.";
  };

  f.addEventListener("input", actualizar);
  f.addEventListener("change", actualizar);
  actualizar();

  f.onsubmit = (e) => {
    e.preventDefault();
    const tipo = f.tipo.value;
    const conBandeja = EN_BANDEJA.has(tipo);
    const gen = parseInt(f.generacion.value, 10);
    if (!f.cultivo.value) return aviso("Elegí el cultivo.", true);
    if (!(gen >= 1)) return aviso("La generación debe ser 1 o mayor.", true);

    const datos = {
      fecha: f.fecha.value,
      cultivo: f.cultivo.value,
      variedad: f.variedad.value.trim(),
      tipo,
      generacion: gen,
      operador: f.operador.value,
      observaciones: f.observaciones.value.trim(),
      bandejas: 0, tipo_bandeja: 0, plantines: 0, sector: "", bancal: 0,
    };

    if (conBandeja) {
      datos.bandejas = parseInt(f.bandejas.value, 10) || 0;
      datos.tipo_bandeja = parseInt(f.tipo_bandeja.value, 10) || 0;
      datos.plantines = datos.bandejas * datos.tipo_bandeja;
      if (!datos.bandejas) return aviso("Indicá cuántas bandejas sembraste.", true);
    } else if (f.sector) {
      datos.sector = f.sector.value;
      datos.bancal = parseInt(f.bancal.value, 10) || 0;
    }

    const p = perfil(datos.cultivo);
    datos.trasplante_estimado = conBandeja
      ? sumarDias(datos.fecha, diasAlmacigo(datos.cultivo, datos.fecha)) : "";
    datos.cosecha_estimada = sumarDias(datos.fecha,
      tipo === "Trasplante" ? p.dias_trasplante_cosecha : p.dias_a_cosecha);

    if (!leer(LS.nombre, "")) escribir(LS.nombre, datos.operador);
    guardarRegistro("siembras", datos);
    // Se queda en Siembras: lo guardado aparece en los últimos, sale de "Para
    // sembrar", y la siguiente del plan está a un toque.
    render("siembras");
  };
}

function prepararTrasplantes() {
  const f = $("#form-trasplantes");
  if (!f) return;
  const pend = almacigosPendientes();
  const nota = $("#nota-almacigo");
  const calculo = $("#calculo-trasplante");
  // Se recuerda lo que sugirió el plan para saber si lo cambiaron a mano.
  let sugerido = { lineas: 0, distancia_cm: 0 };

  enlazarBuscadores(f);

  const elegido = () => pend.find((s) => s.id === f.siembra_id.value);

  // El marco sugerido sale del cultivo, no del almácigo: ahora se puede
  // trasplantar algo que no tiene siembra cargada.
  const sugerirMarco = (cultivo) => {
    const plan = enPlan(cultivo) || {};
    const p = perfil(cultivo) || {};
    sugerido = {
      lineas: plan.lineas || p.lineas_bancal || 0,
      distancia_cm: plan.distancia_cm || p.distancia_cm || 0,
    };
    f.lineas.value = sugerido.lineas || "";
    f.distancia_cm.value = sugerido.distancia_cm || "";
  };

  // El buscador avisa con un "change" sobre el FORMULARIO, no sobre su campo
  // oculto, así que se escucha acá y se mira si cambió el cultivo.
  let ultimoCultivo = "";
  f.addEventListener("change", () => {
    if (f.cultivo.value === ultimoCultivo) return;
    ultimoCultivo = f.cultivo.value;
    if (!f.siembra_id.value) sugerirMarco(f.cultivo.value);
    recalcular();
  });

  // Si se elige un almácigo, completa lo demás y habilita la cuenta de días
  // reales en bandeja. Si se saca, lo cargado queda como estaba.
  const alElegir = () => {
    const s = elegido();
    if (!s) { nota.textContent = ""; recalcular(); return; }
    f.cultivo.value = s.cultivo;
    const caja = f.querySelector("[data-buscador] .buscador-texto");
    if (caja) caja.value = s.cultivo;
    f.variedad.value = s.variedad || "";
    f.generacion.value = s.generacion || 1;
    sugerirMarco(s.cultivo);
    const sembrada = s.fecha ? `sembrado el ${fechaCorta(s.fecha)}` : "";
    const espera = s.estimado ? ` · estimado para ${fechaCorta(s.estimado)}` : "";
    nota.innerHTML = `${esc(s.cultivo)}${s.variedad ? " " + esc(s.variedad) : ""}
      · G${s.generacion} · ${sembrada}${espera}`;
    recalcular();
  };

  // Los plantines no se cuentan en el campo: se deducen del marco y de cuántos
  // bancales se ocuparon, que es lo que sí se sabe al terminar de plantar.
  const renglones = $("#renglones-bancal");
  let proximo = 1;

  // Cada renglon es un destino: sector y bancal. Se descartan los repetidos,
  // que serian dos filas iguales para el mismo lugar.
  const destinos = () => {
    const vistos = new Set();
    return [...renglones.querySelectorAll(".renglon-bancal")].map((div) => ({
      sector: div.querySelector("[data-sector]").value,
      bancal: div.querySelector("[data-bancal]").value,
    })).filter((d) => {
      const clave = `${d.sector}|${d.bancal}`;
      return vistos.has(clave) ? false : vistos.add(clave);
    });
  };

  const cuentas = () => {
    const lineas = aNumero(f.lineas.value) || 0;
    const dist = aNumero(f.distancia_cm.value) || 0;
    const lugares = destinos();
    const bancales = lugares.length;
    // Lo contado gana sobre lo calculado: si alguien los contó de verdad, ese
    // número vale más que multiplicar líneas por distancia.
    const contados = aNumero(f.plantines.value) || 0;
    // Cada bancal con el largo de su sector: pueden no medir lo mismo.
    const enBancal = (sector) => contados || plantasPorBancal(lineas, dist, f.disposicion.value, sector);
    const porBancal = enBancal(lugares[0] ? lugares[0].sector : "");
    const porSector = lugares.map((l) => enBancal(l.sector));
    const minimo = porSector.length ? Math.min(...porSector) : porBancal;
    const maximo = porSector.length ? Math.max(...porSector) : porBancal;
    return { lineas, dist, bancales, porBancal, contados, enBancal, minimo, maximo,
             total: Math.round(bancales ? lugares.reduce((a, l) => a + enBancal(l.sector), 0) : 0) };
  };

  const recalcular = () => {
    const c = cuentas();
    if (!c.porBancal) { calculo.innerHTML = ""; return; }
    const s = elegido();
    const disponibles = s ? s.plantines : 0;
    const cambiado = c.lineas !== sugerido.lineas || c.dist !== sugerido.distancia_cm;
    calculo.innerHTML = (c.minimo !== c.maximo
        ? `<b>${num(c.minimo)} a ${num(c.maximo)} plantines</b> por bancal <small>(según el largo de cada sector)</small>`
        : `<b>${num(c.porBancal)} plantines</b> por bancal`)
      + (c.contados ? " <small>(contados)</small>" : "")
      + (c.bancales ? ` · ${c.bancales} bancal(es) elegidos = <b>${num(c.total)} plantines</b>` : "")
      + (cambiado && sugerido.lineas && !c.contados
          ? `<br><small>Distinto del plan (${sugerido.lineas} líneas a ${sugerido.distancia_cm} cm): se guarda como lo hiciste.</small>`
          : "")
      // Aviso, no bloqueo: puede sobrar plantines o haberse perdido algunos, y
      // quien está en el campo sabe mejor que la cuenta.
      + (disponibles && c.total > disponibles * 1.1
          ? `<br><small class="alerta">El almácigo tenía ${num(disponibles)} plantines: la cuenta da ${num(c.total)}.</small>`
          : "");
  };

  f.siembra_id.addEventListener("change", alElegir);

  ["lineas", "distancia_cm", "plantines"].forEach((n) =>
    f[n].addEventListener("input", recalcular));
  f.disposicion.addEventListener("change", recalcular);

  // El sector de cada renglon manda sobre su lista de bancales, y agregar o
  // quitar renglones cambia el total: se recalcula ante cualquier cambio.
  const engancharRenglones = () => {
    renglones.querySelectorAll("[data-sector]").forEach((sel) => {
      sel.onchange = () => {
        const b = sel.closest(".renglon-bancal").querySelector("[data-bancal]");
        b.innerHTML = opcionesBancal(sel.value, b.value);
        recalcular();
      };
    });
    renglones.querySelectorAll("[data-bancal]").forEach((sel) => { sel.onchange = recalcular; });
    renglones.querySelectorAll("[data-quitar-bancal]").forEach((b) => {
      b.onclick = () => { b.closest(".renglon-bancal").remove(); recalcular(); };
    });
  };
  engancharRenglones();

  // Deja un renglón por cada bancal del plan, con su sector y su número.
  function ponerDestinos(lista) {
    renglones.innerHTML = lista.map((_, i) => renglonBancal(i)).join("");
    proximo = lista.length;
    [...renglones.querySelectorAll(".renglon-bancal")].forEach((div, i) => {
      const sel = div.querySelector("[data-sector]");
      sel.value = lista[i].sector;
      div.querySelector("[data-bancal]").innerHTML = opcionesBancal(lista[i].sector, lista[i].bancal);
    });
    engancharRenglones();
    recalcular();
  }

  $("#btn-mas-bancal").onclick = () => {
    renglones.insertAdjacentHTML("beforeend", renglonBancal(proximo++));
    engancharRenglones();
    recalcular();
  };

  // Si se llegó desde el detalle de una generación en el plan, el formulario
  // arranca con su cultivo y su generación. Si su almácigo está en la lista,
  // se elige también, que es lo que permite medir los días reales en bandeja.
  if (trasplanteSugerido) {
    const s = trasplanteSugerido;
    trasplanteSugerido = null;             // se usa una sola vez
    const op = s.siembra_id && [...f.siembra_id.options].find((o) => o.value === s.siembra_id);
    if (op) {
      f.siembra_id.value = s.siembra_id;
      alElegir();
    } else {
      f.cultivo.value = s.cultivo;
      const caja = f.querySelector("[data-buscador] .buscador-texto");
      if (caja) caja.value = s.cultivo;
      sugerirMarco(s.cultivo);
    }
    f.generacion.value = s.generacion || 1;
    f.fecha.value = hoy();
    // Los bancales que le dio el plan en el mapa, un renglón por bancal.
    const lugares = bancalesPlanificados(s.cultivo, s.generacion);
    if (lugares.length) ponerDestinos(lugares);
    $("#desde-el-plan").innerHTML = `<div class="desde-plan">
      <b>Del plan:</b> ${esc(s.cultivo)} G${s.generacion}${
        lugares.length ? ` · ${esc(lugares[0].sector)} ${lugares.map((x) => x.bancal).join(", ")}`
          : " · sin lugar en el mapa: elegí los bancales"}.
      Revisá y guardá.
      <button type="button" class="secundario" id="limpiar-plan">Cargar otra cosa</button>
    </div>`;
    $("#limpiar-plan").onclick = () => render("trasplantes");
  }
  f.onsubmit = (e) => {
    e.preventDefault();
    const cultivo = f.cultivo.value;
    if (!cultivo) return aviso("Elegí qué cultivo estás trasplantando.", true);
    const c = cuentas();

    // El almácigo es opcional. Si se eligió, se mide cuánto tardó de verdad en
    // la bandeja contra lo que dice la tabla: ese es el dato con el que, en
    // unas temporadas, se corrigen los días del catálogo con lo que pasa en
    // esta chacra y no en un manual. Sin almácigo el trasplante se registra
    // igual, solo que sin esa medición.
    const s = elegido();
    // Los teóricos se cuentan con la estación en que se SEMBRÓ, no con la de
    // hoy: es contra eso que se compara lo que de verdad tardó en la bandeja.
    const teoricos = s ? diasAlmacigo(s.cultivo, s.fecha) : 0;
    const reales = s ? diasEntre(s.fecha, f.fecha.value) : null;
    const lugares = destinos();
    if (!lugares.length) return aviso("Elegí al menos un bancal.", true);
    escribir(LS.nombre, f.operador.value);

    // Una fila por bancal: comparten siembra de origen, fecha y marco, pero
    // cada una tiene su lugar. Es lo que después permite comparar el rinde de
    // un bancal contra otro plantados el mismo día con la misma variedad.
    const comun = {
      fecha: f.fecha.value,
      siembra_id: s ? s.id : "",
      fecha_siembra: s ? (s.fecha || "") : "",
      dias_almacigo_real: reales === null ? "" : reales,
      dias_almacigo_teorico: teoricos || "",
      diferencia_dias: (reales === null || !teoricos) ? "" : reales - teoricos,
      cultivo,
      variedad: f.variedad.value.trim(),
      generacion: parseInt(f.generacion.value, 10) || 1,
      lineas: c.lineas || "",
      distancia_cm: c.dist || "",
      disposicion: f.disposicion.value,
      // Queda escrito si se respetó el plan o se cambió en el campo: es la
      // diferencia entre lo planificado y lo que de verdad pasó.
      marco: (c.lineas !== sugerido.lineas || c.dist !== sugerido.distancia_cm)
        ? "Modificado" : "Sugerido",
      operador: f.operador.value,
      observaciones: f.observaciones.value.trim(),
    };
    const aviso_ = lugares.length === 1
      ? "Trasplante guardado ✓"
      : `Trasplante guardado: ${lugares.length} bancales ✓`;
    lugares.forEach((l) => guardarRegistro("trasplantes",
      Object.assign({}, comun, { sector: l.sector, bancal: l.bancal,
                                 plantines: c.enBancal(l.sector) || "" }), aviso_));
    render("trasplantes");
  };
}

function prepararHoras() {
  const f = $("#form-horas");
  if (f) {
    // La lista de actividades cambia con el área: se rearma cada vez.
    const bloque = $("#bloque-actividad");
    const verActividades = () => {
      const lista = actividadesDe(f.area.value);
      bloque.hidden = !lista.length;
      // Hay que elegir una: sin actividad la hora se puede sumar por area pero
      // no se puede analizar en que se fue. La opcion de arriba no es elegible,
      // solo esta para que no quede una preseleccionada por accidente.
      f.actividad.innerHTML = lista.length
        ? `<option value="" disabled selected>Elegí la actividad…</option>` +
          lista.map((a) => `<option>${esc(a)}</option>`).join("")
        : "";
      // Solo se exige cuando el area tiene lista propia: un area sin
      // actividades cargadas no puede frenar el registro.
      f.actividad.required = lista.length > 0;
    };
    f.area?.addEventListener("change", verActividades);
    verActividades();
  }
  // Si el teléfono todavía no está activado, la vista muestra la tarjeta
  // del código y este formulario no existe.
  if (!f) return;
  f.onsubmit = (e) => {
    e.preventDefault();
    const horas = aNumero(f.horas.value);
    if (!(horas > 0 && horas <= 24)) return aviso("Las horas deben ser un número entre 0 y 24.", true);
    if (!f.area.value) return aviso("Elegí el área.", true);
    if (f.actividad && f.actividad.required && !f.actividad.value) {
      return aviso("Elegí la actividad.", true);
    }
    // El nombre elegido queda como el de este teléfono: la próxima vez viene puesto.
    escribir(LS.nombre, f.integrante.value);
    guardarRegistro("horas", {
      fecha: f.fecha.value,
      integrante: f.integrante.value,
      horas,
      area: f.area.value,
      actividad: f.actividad ? f.actividad.value : "",
      observaciones: f.observaciones.value.trim(),
    });
    render("horas");
  };
}

function prepararCosechas() {
  const f = $("#form-cosechas");
  // Si el teléfono todavía no está activado, la vista muestra la tarjeta
  // del código y este formulario no existe.
  if (!f) return;
  const calculo = $("#calculo-cosecha");
  const renglones = $("#renglones-cosecha");
  const pizarra = $("#pizarra-cosecha");
  let proximo = 1;

  // Elegir el modo: queda guardado en el teléfono para la próxima vez.
  document.querySelectorAll("[data-modo-cosecha]").forEach((b) => {
    b.onclick = () => {
      modoCosecha = b.dataset.modoCosecha;
      escribir(LS.modoCosecha, modoCosecha);
      render("cosechas");
    };
  });

  enlazarBuscadores(f);

  // Los dos modos se leen igual de afuera: una lista de cultivo + kilos. En
  // pizarra se descartan los que quedaron vacíos, que son la mayoría.
  const leerRenglones = () => {
    if (pizarra) {
      return [...pizarra.querySelectorAll("input[data-cultivo]")]
        .map((inp) => ({ cultivo: inp.dataset.cultivo, kg: aNumero(inp.value) || 0 }))
        .filter((r) => r.kg > 0);
    }
    return [...renglones.querySelectorAll(".renglon-cosecha")]
      .map((div) => {
        const i = div.dataset.renglon;
        return { cultivo: f["cultivo_" + i]?.value || "", kg: aNumero(f["kg_" + i]?.value) || 0 };
      })
      .filter((r) => r.cultivo || r.kg);
  };

  const actualizar = () => {
    const cargados = leerRenglones().filter((r) => r.cultivo && r.kg > 0);
    if (!cargados.length) {
      calculo.innerHTML = pizarra
        ? "Escribí los kilos en los cultivos que cosechaste. Los vacíos no se guardan."
        : "Cargá el cultivo y los kilos. Con el + sumás más cultivos.";
      return;
    }
    const total = cargados.reduce((a, r) => a + r.kg, 0);
    const detalle = cargados.map((r) => {
      const plan = enPlan(r.cultivo);
      if (!plan?.cosecha_esperada_kg) return `${esc(r.cultivo)} ${num(r.kg, 1)} kg`;
      return `${esc(r.cultivo)} ${num(r.kg, 1)} kg (${num((r.kg / plan.cosecha_esperada_kg) * 100, 1)}% de lo esperado)`;
    }).join(" · ");
    calculo.innerHTML = `<b>${num(total, 1)} kg</b> en ${cargados.length} cultivo(s)
      <div class="nota" style="margin-top:4px">${detalle}</div>`;
  };

  f.addEventListener("input", actualizar);
  f.addEventListener("change", actualizar);
  actualizar();

  // En pizarra no hay renglones que agregar ni quitar: la lista es fija y los
  // vacíos simplemente no se guardan. Enter pasa al casillero siguiente.
  if (pizarra) {
    const campos = [...pizarra.querySelectorAll("input[data-cultivo]")];
    campos.forEach((campo, i) => {
      campo.onkeydown = (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        (campos[i + 1] || campo).focus();
      };
    });
    engancharSubmit();
    return;
  }

  const engancharQuitar = () => {
    renglones.querySelectorAll("[data-quitar-renglon]").forEach((b) => {
      b.onclick = () => {
        b.closest(".renglon-cosecha").remove();
        actualizar();
      };
    });
  };
  engancharQuitar();

  const sumarRenglon = () => {
    renglones.insertAdjacentHTML("beforeend", renglonCosecha(proximo++));
    enlazarBuscadores(f);          // enciende solo el buscador nuevo
    engancharQuitar();
    engancharEnter();
    actualizar();
    renglones.lastElementChild.querySelector(".buscador-texto").focus();
  };
  $("#btn-mas-cultivo").onclick = sumarRenglon;

  // Enter en los kilos abre el renglón siguiente. Pasar una pizarra de veinte
  // cultivos es teclear, no apuntar: sin esto hay que bajar la mano al + entre
  // cada uno. El submit del formulario queda para el botón Guardar.
  function engancharEnter() {
    renglones.querySelectorAll("input[name^=kg_]").forEach((campo) => {
      if (campo.dataset.enter) return;
      campo.dataset.enter = "1";
      campo.onkeydown = (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const ultimo = campo.closest(".renglon-cosecha") === renglones.lastElementChild;
        if (ultimo) sumarRenglon();
        else renglones.lastElementChild.querySelector(".buscador-texto").focus();
      };
    });
  }
  engancharEnter();

  engancharSubmit();

  function engancharSubmit() {
  f.onsubmit = (e) => {
    e.preventDefault();
    const cargados = leerRenglones();
    if (!cargados.length) {
      return aviso(pizarra
        ? "Escribí los kilos de al menos un cultivo."
        : "Cargá al menos un cultivo con sus kilos.", true);
    }

    const incompleto = cargados.find((r) => !r.cultivo || !(r.kg > 0));
    if (incompleto) {
      return aviso(incompleto.cultivo
        ? `Faltan los kilos de ${incompleto.cultivo}.`
        : "Hay un renglón sin cultivo elegido.", true);
    }
    // Un mismo cultivo dos veces sería confuso al analizar: se suma.
    const porCultivo = {};
    cargados.forEach((r) => { porCultivo[r.cultivo] = (porCultivo[r.cultivo] || 0) + r.kg; });

    if (f.operador.value && !leer(LS.nombre, "")) escribir(LS.nombre, f.operador.value);
    // Una fila por cultivo, todas con la misma fecha y la misma persona.
    Object.entries(porCultivo).forEach(([cultivo, kg]) => {
      guardarRegistro("cosechas", {
        fecha: f.fecha.value,
        cultivo,
        kg: Math.round(kg * 100) / 100,
        operador: f.operador.value,
      }, `Cosecha guardada: ${Object.keys(porCultivo).length} cultivo(s) ✓`);
    });
    render("inicio");
  };
  }
}

function prepararAjustes() {
  const esScript = (u) => !u || u.startsWith("https://script.google.com/");

  // Borra la copia guardada y vuelve a pedir todo a la red. Los registros que
  // esperan enviarse NO se tocan: viven aparte y se sincronizan igual.
  $("#btn-actualizar-app").onclick = async () => {
    aviso("Buscando actualización…");
    try {
      for (const k of await caches.keys()) await caches.delete(k);
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.update();
    } catch (_) { /* sin service worker igual conviene recargar */ }
    location.reload();
  };

  $("#btn-guardar-ajustes").onclick = () => {
    const nuevaChacra = $("#aj-chacra").value;
    if (nuevaChacra && nuevaChacra !== chacraCodigo()) {
      escribir(LS.chacra, nuevaChacra);
      CFG = null;
      escribir(LS.config, null);
      configConfirmada = false;
      escribir(LS.configLeida, false);
      escribir(LS.tareas, []);
      resumen = null;
      escribir(LS.resumen, null);
    }
    escribir(LS.nombre, $("#aj-nombre").value);
    const url = $("#aj-url").value.trim();
    if (!esScript(url)) {
      return aviso("La dirección debe ser de Apps Script (script.google.com).", true);
    }
    escribir(LS.scriptUrl, url);
    refrescarEstado();
    aviso("Ajustes guardados ✓");
    sincronizar();
  };

  const desvincular = $("#btn-desvincular");
  if (desvincular) {
    desvincular.onclick = () => {
      if (!confirm("¿Desvincular este teléfono? Vas a necesitar un código nuevo para volver a activarlo.")) return;
      escribir(LS.credencial, "");
      aviso("Teléfono desvinculado. Pedí un código para activarlo de nuevo.");
      render("inicio");
    };
  }

  $("#btn-probar").onclick = async () => {
    const partes = [];
    try {
      const d = await (await fetch(urlServicio())).json();
      partes.push(d.ok ? "siembras y tareas ✓" : "siembras y tareas ✗");
    } catch { partes.push("siembras y tareas ✗"); }

    const hayFalla = partes.some((p) => p.includes("✗"));
    aviso(partes.join(" · "), hayFalla);
    sincronizar();
  };
}
