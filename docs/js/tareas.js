// js/tareas.js        — AMA Producción
//
// Tareas: lista, por área, marcar hecha y reabrir.
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos. Se partió app.js el 30/09/2026 sin cambiar código.

// ---- Tareas ----
// Se juntan las que ya están en la planilla con las que se cargaron en este
// teléfono y todavía no viajaron, y se aplican las marcas de "hecha" que están
// esperando. Así la lista se ve al día aunque no haya señal.
function tareasParaMostrar() {
  const deLaPlanilla = leer(LS.tareas, []);
  const nuevasLocales = pendientes.filter((r) => r.tipo === "tareas")
    .map((r) => ({ ...r.datos, id: r.id, sinEnviar: true }));
  // La cola se recorre en orden: si alguien marcó, se arrepintió y volvió a
  // marcar, vale lo último que hizo.
  // Se guarda también el día en que se marcó, no solo que está hecha: es lo que
  // la ordena en "Hechas hace poco". Sin eso, una tarea recién marcada acá se
  // iba al fondo hasta que viajaba a la planilla.
  const estadoLocal = {};
  pendientes.forEach((r) => {
    if (r.tipo === "tareas_hecha") {
      estadoLocal[r.datos.tarea_id] = {
        hecha: true,
        hecha_el: r.datos.hecha_el || hoy(),
        hecha_por: r.datos.hecha_por || "",
      };
    } else if (r.tipo === "tareas_reabrir") {
      estadoLocal[r.datos.tarea_id] = { hecha: false, hecha_el: "", hecha_por: "" };
    }
  });

  const todas = [...nuevasLocales, ...deLaPlanilla]
    .filter((t, i, arr) => arr.findIndex((o) => o.id === t.id) === i)
    .map((t) => (estadoLocal[t.id] ? { ...t, ...estadoLocal[t.id] } : t));

  const peso = { Alta: 0, Media: 1, Baja: 2 };
  return todas.sort((a, b) =>
    (a.fecha || "").localeCompare(b.fecha || "") ||
    (peso[a.importancia] ?? 1) - (peso[b.importancia] ?? 1));
}

// Una tarjeta por área: cómo viene de tareas y cuántas horas se le
// dedicaron. Es la respuesta a "¿cuánto nos llevó la plantinera?".
function tarjetasDeAreas(tareas) {
  const horas = horasPorArea();
  // El área de una tarea puede venir con otra escritura que la de la lista, así
  // que se compara igual que en todos lados: sin tildes ni mayúsculas.
  const areaDe = (t) => t.area || t.proyecto || "";
  const sinArea = tareas.filter((t) => !areaDe(t) && !t.hecha).length;

  return areas().map((a) => {
    const suyas = tareas.filter((t) => claveArea(areaDe(t)) === claveArea(a.nombre));
    const pend = suyas.filter((t) => !t.hecha && t.estado !== "En curso").length;
    const curso = suyas.filter((t) => !t.hecha && t.estado === "En curso").length;
    const listas = suyas.filter((t) => t.hecha).length;
    const hs = horas[a.nombre] || 0;
    const pausada = (a.estado || "activo") !== "activo";

    // Un área fija sin nada cargado no aporta nada a la vista: se muestra solo
    // si tiene tareas u horas. Las seis están siempre para elegir igual.
    if (!suyas.length && !hs && esAreaFija(a.nombre)) return "";

    return `<div class="tarjeta proyecto${pausada ? " pausado" : ""}">
      <h2>${esc(a.nombre)} <small>${esAreaFija(a.nombre) ? "" : "propia"}${
        pausada ? " · " + esc(a.estado) : ""}</small></h2>
      <div class="cifras">
        ${cifraClara(pend, "pendientes")}
        ${cifraClara(curso, "en curso")}
        ${cifraClara(listas, "hechas")}
      </div>
      <p class="nota" style="margin-top:8px">
        ${hs ? `<b>${num(hs, 1)} horas</b> cargadas` : "Sin horas cargadas todavía"}
      </p>
      ${suyas.filter((t) => !t.hecha).slice(0, 4).map(filaTarea).join("")}
    </div>`;
  }).join("") + (sinArea ? `<div class="tarjeta">
    <h2>Sin área <small>${sinArea}</small></h2>
    ${tareas.filter((t) => !areaDe(t) && !t.hecha).map(filaTarea).join("")}
  </div>` : "");
}

// El total de la temporada lo suma el servidor leyendo la planilla entera: acá
// solo se le agregan las horas que todavía están en la cola sin viajar.
function horasPorArea() {
  const total = Object.assign({}, resumen?.horas_por_area || resumen?.horas_por_proyecto || {});
  pendientes.filter((r) => r.tipo === "horas").forEach((r) => {
    const p = r.datos.area || r.datos.proyecto || "Sin área";
    total[p] = (total[p] || 0) + (Number(r.datos.horas) || 0);
  });
  return total;
}

function filaTarea(t) {
  const vencida = !t.hecha && t.fecha && t.fecha < hoy();
  const cuando = t.fecha === hoy() ? "hoy" : fechaCorta(t.fecha);
  const meta = [
    `<span class="punto-imp imp-${esc(t.importancia || "Media")}"></span>${esc(t.importancia || "Media")}`,
    // En una tarea hecha, "para cuándo" ya no dice nada: lo que importa es
    // cuándo se hizo, que además es lo que la ordena en la lista de abajo.
    t.hecha ? "" : (vencida ? `atrasada desde el ${cuando}` : `para ${cuando}`),
    (t.proyecto ? esc(t.proyecto) : ""),
    (t.estado === "En curso" ? "<b>en curso</b>" : ""),
    (t.asignada ? `la toma ${esc(t.asignada)}` : ""),
    (t.personas > 1 ? `${t.personas} personas` : ""),
    (t.hecha
      ? "hecha" + (t.hecha_el
          ? (t.hecha_el === hoy() ? " hoy" : ` el ${fechaCorta(t.hecha_el)}`) : "")
        + (t.hecha_por ? ` por ${esc(t.hecha_por)}` : "")
      : ""),
    (t.sinEnviar ? "sin enviar" : ""),
  ].filter(Boolean).join(" · ");

  return `<div class="tarea${t.hecha ? " lista" : ""}${vencida ? " vencida" : ""}">
    <button class="tarea-check${t.hecha ? " hecha" : ""}" data-tarea="${esc(t.id)}"
            data-hecha="${t.hecha ? "1" : ""}"
            aria-label="${t.hecha ? "Volver a pendiente" : "Marcar como hecha"}"
            title="${t.hecha ? "Tocá para volverla a pendiente" : "Marcar como hecha"}"
            >${t.hecha ? "&#10003;" : ""}</button>
    <div class="tarea-texto">
      <div class="titulo">${esc(t.tarea)}</div>
      <div class="tarea-meta">${meta}</div>
    </div>
  </div>`;
}

function prepararTareas() {
  const f = $("#form-tareas");
  // Si el teléfono todavía no está activado, la vista muestra la tarjeta
  // del código y este formulario no existe.
  if (!f) return;
  f.onsubmit = (e) => {
    e.preventDefault();
    const texto = f.tarea.value.trim();
    if (!texto) return aviso("Escribí qué hay que hacer.", true);
    escribir(LS.nombre, f.creada_por.value);
    guardarRegistro("tareas", {
      tarea: texto,
      area: f.area.value,
      fecha: f.fecha.value,
      importancia: f.querySelector("input[name=importancia]:checked").value,
      personas: parseInt(f.personas.value, 10) || 1,
      creada_por: f.creada_por.value,
      asignada: f.asignada.value,
      estado: "Pendiente",
      hecha: false,
    });
    render("tareas");
  };

  document.querySelectorAll("[data-vista-tareas]").forEach((b) => {
    b.onclick = () => { vistaTareas = b.dataset.vistaTareas; render("tareas"); };
  });

  document.querySelectorAll(".tarea-check").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.tarea;
      if (b.dataset.hecha) {
        // Se arrepintió: la tarea vuelve a estar pendiente. Si la marca de
        // hecha todavía no viajó, alcanza con sacarla de la cola.
        const esperando = pendientes.some((r) => r.tipo === "tareas_hecha" && r.datos.tarea_id === id);
        if (esperando) {
          pendientes = pendientes.filter(
            (r) => !(r.tipo === "tareas_hecha" && r.datos.tarea_id === id));
          escribir(LS.pendientes, pendientes);
          refrescarEstado();
          aviso("Volvió a pendiente");
        } else {
          guardarRegistro("tareas_reabrir", { tarea_id: id }, "Volvió a pendiente");
        }
      } else {
        const esperaReabrir = pendientes.some(
          (r) => r.tipo === "tareas_reabrir" && r.datos.tarea_id === id);
        if (esperaReabrir) {
          pendientes = pendientes.filter(
            (r) => !(r.tipo === "tareas_reabrir" && r.datos.tarea_id === id));
          escribir(LS.pendientes, pendientes);
          refrescarEstado();
          aviso("Marcada como hecha");
        } else {
          guardarRegistro("tareas_hecha", {
            tarea_id: id, hecha_el: hoy(), hecha_por: leer(LS.nombre, ""),
          });
        }
      }
      // Tildar una tarea de abajo no tiene que llevar la lista al principio.
      render("tareas", true);
    };
  });
}
