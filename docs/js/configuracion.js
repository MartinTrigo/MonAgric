// js/configuracion.js — AMA Producción
//
// Configuración de la chacra: datos, bancal, sectores, integrantes, áreas
// propias y catálogo.
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos. Se partió app.js el 30/09/2026 sin cambiar código.

function prepararConfiguracion() {
  // Volver a donde se estaba. Configuración se abre desde el engranaje y no
  // desde la barra de secciones, así que sin esto hay que adivinar la salida.
  const volver = $("#volver-de-config");
  if (volver) volver.onclick = () => render(vistaPrevia || "inicio");

  const reintentar = $("#btn-reintentar-config");
  if (reintentar) {
    reintentar.onclick = async () => {
      await traerConfig();
      render("configuracion");
      if (!configConfirmada) aviso("Sigo sin poder leerla. Revisá la señal.", true);
    };
  }
  const general = $("#form-config-general");
  if (!general) return;

  const calculoBancal = $("#calculo-bancal");
  const verBancal = () => {
    const m2 = aNumero(general.largo.value) * aNumero(general.ancho.value);
    calculoBancal.innerHTML = m2 > 0
      ? `Cada bancal mide <b>${num(m2, 1)} m²</b>`
      : "Cargá largo y ancho para ver la superficie del bancal.";
  };
  general.addEventListener("input", verBancal);
  verBancal();

  general.onsubmit = (e) => {
    e.preventDefault();
    guardarConfig({
      nombre: general.nombre.value.trim(),
      temporada: { nombre: general.temporada.value.trim(), inicio: general.inicio.value, fin: "" },
      bancal: {
        largo_m: aNumero(general.largo.value) || 0,
        ancho_m: aNumero(general.ancho.value) || 0,
        pasillo_m: aNumero(general.pasillo.value) || 0,
        n_bancales: (CFG?.sectores || []).reduce((a, s) => a + (s.bancales || 0), 0),
      },
    });
  };

  // ---- sectores (agregar y editar)
  const fSector = $("#form-sector");
  let editandoSector = -1;

  const salirDeSector = () => {
    fSector.reset();
    editandoSector = -1;
    $("#titulo-sector").innerHTML = "";
    $("#btn-sector").textContent = "Agregar sector";
    $("#btn-cancelar-sector").hidden = true;
  };
  $("#btn-cancelar-sector").onclick = salirDeSector;

  fSector.onsubmit = (e) => {
    e.preventDefault();
    // El nombre queda como lo escriben: puede ser "A", "3" o "Verano".
    const nombre = fSector.sector.value.trim();
    if (!nombre) return aviso("Ponele un nombre al sector.", true);
    const secs = [...(CFG?.sectores || [])];
    const repetido = secs.findIndex((s) =>
      s.sector.toLowerCase() === nombre.toLowerCase());
    if (repetido !== -1 && repetido !== editandoSector) {
      return aviso(`Ya hay un sector que se llama ${nombre}.`, true);
    }

    const datos = { sector: nombre, bancales: parseInt(fSector.bancales.value, 10) || 1,
                    tipo_riego: fSector.tipo_riego.value,
                    // Vacío = el largo de la chacra (ver largoDe en catalogo.js).
                    largo_m: fSector.largo_m ? (aNumero(fSector.largo_m.value) || "") : "" };
    let mensaje;
    if (editandoSector >= 0) {
      const antes = secs[editandoSector].sector;
      // Se conserva lo que el formulario no muestra: dónde está en el mapa.
      // Antes se reemplazaba el sector entero y editarlo lo mandaba al rincón.
      secs[editandoSector] = Object.assign({}, secs[editandoSector], datos);
      mensaje = `${antes === nombre ? nombre : `${antes} → ${nombre}`} actualizado ✓`;
    } else {
      secs.push(datos);
      mensaje = `${nombre} agregado ✓`;
    }
    secs.sort((a, b) => a.sector.localeCompare(b.sector, "es", { numeric: true }));
    guardarConfig({ sectores: secs, bancal: Object.assign({}, CFG?.bancal,
      { n_bancales: secs.reduce((a, s) => a + s.bancales, 0) }) }, mensaje);
  };

  document.querySelectorAll("[data-editar-sector]").forEach((b) => {
    b.onclick = () => {
      const i = Number(b.dataset.editarSector);
      const s = (CFG.sectores || [])[i];
      if (!s) return;
      editandoSector = i;
      fSector.sector.value = s.sector;
      fSector.bancales.value = s.bancales;
      fSector.tipo_riego.value = s.tipo_riego || tiposRiego()[0];
      if (fSector.largo_m) fSector.largo_m.value = s.largo_m || "";
      $("#titulo-sector").innerHTML = `<div class="editando">Editando <b>${esc(s.sector)}</b></div>`;
      $("#btn-sector").textContent = "Guardar cambios";
      $("#btn-cancelar-sector").hidden = false;
      fSector.scrollIntoView({ behavior: "smooth", block: "center" });
    };
  });

  // ---- áreas propias de la chacra
  const fArea = $("#form-area");
  fArea.onsubmit = (e) => {
    e.preventDefault();
    const nombre = fArea.nombre.value.trim();
    if (!nombre) return aviso("Ponele un nombre al área.", true);
    // Se compara sin tildes ni mayúsculas: sin esto "Horticola" entraría como
    // un área nueva al lado de "Hortícola" y las horas quedarían partidas.
    if (esAreaFija(nombre)) {
      return aviso(`${nombre} ya viene con la app.`, true);
    }
    const lista = [...areasPropias()];
    if (lista.some((a) => claveArea(a.nombre) === claveArea(nombre))) {
      return aviso(`Ya hay un área que se llama ${nombre}.`, true);
    }
    lista.push({
      nombre, estado: fArea.estado.value,
      actividades: fArea.actividades.value.split(",")
        .map((a) => a.trim()).filter(Boolean),
    });
    guardarConfig({ areas: lista }, `${nombre} agregada ✓`);
  };

  // ---- integrantes
  const fInt = $("#form-integrante");
  fInt.onsubmit = (e) => {
    e.preventDefault();
    const nombre = fInt.nombre.value.trim();
    if (!nombre) return;
    const equipo = [...(CFG?.integrantes || [])];
    if (equipo.includes(nombre)) return aviso(`${nombre} ya está en la lista.`, true);
    equipo.push(nombre);
    guardarConfig({ integrantes: equipo }, `${nombre} agregado ✓`);
  };

  // ---- un cultivo nuevo para el catálogo de todas las chacras
  prepararFormularioCultivo();

  // El formulario del plan por cultivo se mudo a Plan → Planificar, donde se
  // carga junto con sus generaciones. Editar el total por separado ya no tiene
  // sentido: ahora sale de sumar las generaciones.

  // ---- quitar cosas
  document.querySelectorAll(".quitar").forEach((b) => {
    b.onclick = () => {
      if (b.dataset.sector !== undefined) {
        const secs = (CFG.sectores || []).filter((_, i) => i !== Number(b.dataset.sector));
        guardarConfig({ sectores: secs }, "Sector quitado");
      } else if (b.dataset.plan !== undefined) {
        const plan = (CFG.plan || []).filter((_, i) => i !== Number(b.dataset.plan));
        guardarConfig({ plan }, "Cultivo quitado del plan");
      } else if (b.dataset.area !== undefined) {
        const lista = areasPropias().filter((_, i) => i !== Number(b.dataset.area));
        guardarConfig({ areas: lista }, "Área quitada");
      } else if (b.dataset.integrante) {
        const equipo = (CFG.integrantes || []).filter((n) => n !== b.dataset.integrante);
        guardarConfig({ integrantes: equipo }, "Integrante quitado");
      }
    };
  });
}

/* El formulario para sumar un cultivo a la lista (tarjetaCultivoNuevo, en
   componentes.js). Está en Configuración y en Plan → Cultivos. */
function prepararFormularioCultivo() {
  const fCult = $("#form-cultivo");
  if (!fCult) return;
  // Qué se pregunta depende de cómo se siembra. Un cultivo de siembra
  // directa no tiene días en almácigo, y obligar a llenarlo empuja a poner
  // un cero inventado, que es peor que un vacío: después no se distingue de
  // un dato medido.
  const conAlmacigo = () => /almácigo|almacigo/i.test(fCult.tipo_siembra.value);
  const yaPlantado = () => /trasplante|esqueje/i.test(fCult.tipo_siembra.value);
  const blAlm = $("#bloque-almacigo"), blDir = $("#bloque-directa");
  const suma = $("#suma-cosecha");

  const acomodar = () => {
    const alm = conAlmacigo();
    blAlm.hidden = !(alm || yaPlantado());
    // Los días a cosecha nunca se preguntan cuando se pueden deducir: con
    // almácigo son la suma de las dos etapas, y con un plantín ya hecho son
    // los del trasplante a la cosecha. Preguntarlos igual abriría la puerta
    // a que dos números de la misma fila se contradigan.
    blDir.hidden = alm || yaPlantado();
    fCult.dias_almacigo.parentElement.hidden = !alm;
    // Los estacionales solo tienen sentido si el cultivo pasa por bandeja.
    $("#bloque-estacion").hidden = !alm;
    recalcular();
  };

  const recalcular = () => {
    const b = aNumero(fCult.dias_trasplante_cosecha.value) || 0;
    if (conAlmacigo()) {
      const a = aNumero(fCult.dias_almacigo.value) || 0;
      suma.textContent = (a && b)
        ? `Días a cosecha: ${a + b}, contando desde la siembra.` : "";
    } else if (yaPlantado()) {
      suma.textContent = b
        ? `Días a cosecha: ${b}, contando desde que se planta.` : "";
    } else {
      suma.textContent = "";
    }
  };

  fCult.tipo_siembra.addEventListener("change", acomodar);
  ["dias_almacigo", "dias_trasplante_cosecha"].forEach((n) =>
    fCult[n].addEventListener("input", recalcular));
  acomodar();

  fCult.onsubmit = (e) => {
  e.preventDefault();
  const nombre = fCult.cultivo.value.trim();
  if (!nombre) return aviso("Escribí el nombre del cultivo.", true);
  // Se compara sin tildes ni mayúsculas: "Ají" y "aji" son el mismo. Un
  // cultivo que ya tiene datos no se puede pisar desde el teléfono; uno que
  // está sin datos sí se completa, que es el caso de los cinco que vinieron
  // del catálogo viejo.
  const yaEsta = cultivosDisponibles().find((c) => claveArea(c) === claveArea(nombre));
  if (yaEsta && !cultivoSinDatos(yaEsta)) {
    return aviso(`${yaEsta} ya está cargado con sus datos.`, true);
  }
  // Todo lo que se pregunta es obligatorio: un cultivo a medio cargar en el
  // catálogo de seis chacras sirve menos que no tenerlo, porque nadie sabe
  // si el hueco es un olvido o un dato que no aplica.
  const alm = conAlmacigo();
  const pedidos = [
    ["dias_en_cosecha", "cuántos días dura la cosecha"],
    ["lineas_bancal", "cuántas líneas por bancal"],
    ["distancia_cm", "la distancia entre plantas"],
    ["rinde_ref_kg_m2", "el rinde de referencia"],
  ];
  if (alm) pedidos.unshift(["dias_almacigo", "cuántos días lleva el almácigo"]);
  if (alm || yaPlantado()) {
    pedidos.push(["dias_trasplante_cosecha", "cuántos días del trasplante a la cosecha"]);
  } else {
    pedidos.push(["dias_a_cosecha", "cuántos días hasta la cosecha"]);
  }
  for (const [campo, comoSeLlama] of pedidos) {
    if (!(aNumero(fCult[campo].value) > 0)) {
      return aviso(`Falta ${comoSeLlama}.`, true);
    }
  }

  const aCosecha = alm
    ? (aNumero(fCult.dias_almacigo.value) || 0) + (aNumero(fCult.dias_trasplante_cosecha.value) || 0)
    : yaPlantado()
      ? aNumero(fCult.dias_trasplante_cosecha.value) || 0
      : aNumero(fCult.dias_a_cosecha.value) || 0;

  const datosCultivo = {
    cultivo: yaEsta || nombre,
    tipo_siembra: fCult.tipo_siembra.value,
    dias_almacigo: alm ? aNumero(fCult.dias_almacigo.value) : "",
    // Opcionales: si vienen vacíos se usa el de arriba en las dos estaciones.
    dias_almacigo_oi: alm ? aNumero(fCult.dias_almacigo_oi.value) : "",
    dias_almacigo_pv: alm ? aNumero(fCult.dias_almacigo_pv.value) : "",
    dias_trasplante_cosecha: (alm || yaPlantado())
      ? aNumero(fCult.dias_trasplante_cosecha.value) : "",
    dias_a_cosecha: aCosecha,
    dias_en_cosecha: aNumero(fCult.dias_en_cosecha.value),
    lineas_bancal: aNumero(fCult.lineas_bancal.value),
    distancia_cm: aNumero(fCult.distancia_cm.value),
    rinde_ref_kg_m2: aNumero(fCult.rinde_ref_kg_m2.value),
    observaciones: fCult.observaciones.value.trim(),
  };
  guardarRegistro("cultivo", datosCultivo,
    yaEsta ? `${yaEsta} completado ✓` : `${nombre} agregado a la lista ✓`);
  // Se muestra ya, sin esperar a que vuelva del servicio: quien lo carga
  // suele querer usarlo en el mismo momento.
  const extra = catalogoExtra();
  extra.cultivos = [...new Set([...(extra.cultivos || []), yaEsta || nombre])];
  // Y sus datos, para que el plan ya pueda usar sus días y su marco.
  extra.perfiles = Object.assign({}, extra.perfiles, { [yaEsta || nombre]: datosCultivo });
  escribir(LS.catalogoExtra, extra);
  // En Configuración se queda ahí; en Plan → Cultivos, el cultivo nuevo
  // queda elegido en el formulario de series: es lo que se iba a hacer.
  if (vistaActual === "plan") {
    render("plan", true);
    const f = $("#form-generaciones");
    const caja = f && f.querySelector('[data-buscador="cultivo"]');
    if (caja) {
      caja.querySelector(".buscador-texto").value = yaEsta || nombre;
      caja.querySelector('input[type="hidden"]').value = yaEsta || nombre;
      f.dispatchEvent(new Event("change"));
      f.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  } else {
    render("configuracion");
  }
  };
}
