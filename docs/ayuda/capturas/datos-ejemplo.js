// AMA · datos inventados para sacar las capturas de la página de ayuda.
//
// Una "Chacra de ejemplo" con nombres y cifras de fantasía: el repositorio es
// público y en la ayuda no van datos de ninguna chacra real.
//
// Uso (en el preview local, nunca en la app publicada):
//   1. Abrir http://localhost:8080/ y, en la consola:
//        (0, eval)(await (await fetch("ayuda/capturas/datos-ejemplo.js")).text())
//   2. Ir a cada pantalla con mostrar("siembras"), mostrar("plan", "grafico"), …
//   3. Al terminar: localStorage.clear()
//
// Corta la red al servicio y reemplaza guardarRegistro: nada sale del
// navegador, aunque se toque "Guardar".
(() => {
  const f0 = window.fetch;
  window.fetch = (u, o) => (/script\.google|googleusercontent/.test(String(u))
    ? Promise.reject(new Error("sin red: datos de ejemplo")) : f0(u, o));
  sincronizar = async () => {};
  guardarRegistro = (tipo, datos, msg) => aviso(msg || "Guardado ✓");

  if (!CHACRAS.some((c) => c.codigo === "ejemplo")) {
    CHACRAS.push({ codigo: "ejemplo", nombre: "Chacra de ejemplo" });
  }

  const gen = (cultivo, n, alm, campo, sector, bancales, extra = {}) => ({
    id: `gen-${cultivo.toLowerCase()}-${n}`, cultivo, generacion: n,
    metodo: alm ? "Trasplante" : "Siembra directa", fecha_almacigo: alm, fecha_campo: campo,
    camas: bancales.length, sector, bancales: bancales.join(", "), estado: "Planificado",
    sembrada: false, siembra_id: "", sembrada_el: "", trasplantada_el: "", variedad: "", ...extra,
  });
  const sembrada = (id, el, trasplantada = "") => ({ sembrada: true, siembra_id: id, sembrada_el: el,
                                                     trasplantada_el: trasplantada, estado: "Sembrado" });

  const generaciones = [
    gen("Lechuga", 1, "2026-08-10", "2026-09-14", "Huerta A", [1, 2], sembrada("s-lech1", "2026-08-12", "2026-09-18")),
    gen("Lechuga", 2, "2026-09-07", "2026-10-12", "Huerta A", [3, 4], sembrada("s-lech2", "2026-09-09")),
    gen("Lechuga", 3, "2026-10-05", "2026-11-09", "Huerta A", [5, 6]),
    gen("Lechuga", 4, "2026-11-02", "2026-12-07", "Huerta A", [7, 8]),
    gen("Acelga", 1, "2026-08-11", "2026-09-15", "Huerta B", [1, 2], sembrada("s-ace1", "2026-08-13", "2026-09-30")),
    gen("Tomate", 1, "2026-08-17", "2026-10-20", "Invernadero", [1, 2, 3, 4], sembrada("s-tom1", "2026-08-20")),
    gen("Albahaca", 1, "2026-09-15", "2026-10-15", "Invernadero", [5, 6], sembrada("s-alb1", "2026-09-15")),
    gen("Zapallito", 1, "2026-10-08", "2026-11-07", "Huerta B", [5, 6, 7]),
    gen("Habas", 1, "", "2026-07-20", "Huerta B", [10, 11, 12], sembrada("s-hab1", "2026-07-22")),
    gen("Rabanito", 1, "", "2026-10-06", "Huerta A", [9]),
    gen("Rabanito", 2, "", "2026-10-27", "Huerta A", [10]),
    gen("Zanahoria", 1, "", "2026-10-12", "Huerta B", [14, 15]),
  ];

  const CFG_EJEMPLO = {
    nombre: "Chacra de ejemplo",
    temporada: { nombre: "2026-27", inicio: "2026-07-01", fin: "2027-06-30" },
    bancal: { largo_m: 30, ancho_m: 0.8, pasillo_m: 0.5, n_bancales: 50 },
    sectores: [
      { sector: "Invernadero", bancales: 10, tipo_riego: "Goteo", fila: 1, columna: 1, largo_m: 20 },
      { sector: "Huerta A", bancales: 20, tipo_riego: "Aspersión", fila: 1, columna: 9 },
      { sector: "Huerta B", bancales: 20, tipo_riego: "Goteo", fila: 7, columna: 1 },
    ],
    integrantes: ["Ana", "Juan", "Lucía", "Pedro"],
    areas: [{ nombre: "Plantinera", estado: "activo" }],
    plan: [],
    corregir: true, parcial: true, largo_por_sector: true, seguimiento: true,
  };

  const siembra = (Id, Fecha, Cultivo, Variedad, g, Bandejas, Alveolos, Operador, planificada) => ({
    Id, Fecha, Cultivo, Variedad, Tipo: Bandejas ? "Siembra almácigo" : "Siembra directa", "Generación": g,
    Bandejas, "Alvéolos": Alveolos, Plantines: Bandejas * Alveolos || "", Operador, Origen: "Propio",
    "Fecha planificada": planificada, "Diferencia plan": diasEntre(planificada, Fecha),
  });
  const ultimos = {
    siembras: [
      siembra("s-alb1", "2026-09-15", "Albahaca", "Genovesa", 1, 1, 128, "Lucía", "2026-09-15"),
      siembra("s-lech2", "2026-09-09", "Lechuga", "Mantecosa", 2, 2, 128, "Ana", "2026-09-07"),
      siembra("s-tom1", "2026-08-20", "Tomate", "Platense", 1, 2, 72, "Juan", "2026-08-17"),
      siembra("s-ace1", "2026-08-13", "Acelga", "Penca blanca", 1, 2, 128, "Ana", "2026-08-11"),
      siembra("s-lech1", "2026-08-12", "Lechuga", "Crespa", 1, 2, 128, "Lucía", "2026-08-10"),
      siembra("s-hab1", "2026-07-22", "Habas", "", 1, 0, 0, "Pedro", "2026-07-20"),
    ],
    trasplantes: [
      { Id: "t-ace1", Fecha: "2026-09-30", "Siembra origen": "s-ace1", Cultivo: "Acelga", Variedad: "Penca blanca",
        "Generación": 1, Sector: "Huerta B", Bancal: 1, Plantines: 132, Operador: "Juan",
        "Fecha planificada": "2026-09-15", "Diferencia plan": 15, "Días en almácigo": 48, "Días teóricos": 40, "Diferencia días": 8 },
      { Id: "t-lech1", Fecha: "2026-09-18", "Siembra origen": "s-lech1", Cultivo: "Lechuga", Variedad: "Crespa",
        "Generación": 1, Sector: "Huerta A", Bancal: 1, Plantines: 198, Operador: "Ana",
        "Fecha planificada": "2026-09-14", "Diferencia plan": 4, "Días en almácigo": 37, "Días teóricos": 35, "Diferencia días": 2 },
    ],
    cosechas: [
      { Id: "c3", Fecha: "2026-10-03", Cultivo: "Habas", Kg: 18.5, "Cosechó": "Pedro" },
      { Id: "c2", Fecha: "2026-09-29", Cultivo: "Habas", Kg: 12, "Cosechó": "Lucía" },
      { Id: "c1", Fecha: "2026-09-24", Cultivo: "Habas", Kg: 7.5, "Cosechó": "Pedro" },
    ],
    horas: [
      { Id: "h4", Fecha: "2026-10-03", Integrante: "Ana", Horas: 4, Actividad: "Siembras", "Área": "Hortícola", Observaciones: "Lechuga G3 y rabanito" },
      { Id: "h3", Fecha: "2026-10-02", Integrante: "Juan", Horas: 3, Actividad: "Riego", "Área": "Hortícola", Observaciones: "" },
      { Id: "h2", Fecha: "2026-10-02", Integrante: "Lucía", Horas: 2.5, Actividad: "Ventas", "Área": "Comercialización", Observaciones: "Feria" },
      { Id: "h1", Fecha: "2026-10-01", Integrante: "Pedro", Horas: 5, Actividad: "Mantenimiento", "Área": "Mantenimiento", Observaciones: "Arreglo del invernadero" },
    ],
  };

  const tareas = [
    { id: "ta1", area: "Hortícola", fecha: "2026-10-06", tarea: "Preparar bancales para zapallito", importancia: "Alta", personas: 2, estado: "Pendiente", asignada: "Juan" },
    { id: "ta2", area: "Hortícola", fecha: "2026-10-08", tarea: "Sembrar zapallito en bandejas", importancia: "Media", personas: 1, estado: "Pendiente" },
    { id: "ta3", area: "Mantenimiento", fecha: "2026-10-04", tarea: "Cambiar el plástico de la puerta del invernadero", importancia: "Media", personas: 1, estado: "En curso", asignada: "Pedro" },
    { id: "ta4", area: "Comercialización", fecha: "2026-10-10", tarea: "Armar la lista de precios de la feria", importancia: "Baja", personas: 1, estado: "Pendiente" },
    { id: "ta5", area: "Hortícola", fecha: "2026-10-01", tarea: "Trasplantar acelga", importancia: "Alta", personas: 2, estado: "Pendiente", hecha: true, hecha_el: "2026-09-30", hecha_por: "Juan" },
  ];

  const almacigos = ultimos.siembras.filter((s) => s.Bandejas && !["s-lech1", "s-ace1"].includes(s.Id))
    .map((s) => ({ ...s, "Trasplante estimado": sumarDias(s.Fecha, diasAlmacigo(s.Cultivo, s.Fecha)) }));

  const poner = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  poner(LS.credencial, "credencial-de-ejemplo");
  poner(LS.chacra, "ejemplo");
  poner(LS.nombre, "Ana");
  poner(LS.generaciones, generaciones);
  poner(LS.almacigos, almacigos);
  poner(LS.ultimos, ultimos);
  poner(LS.tareas, tareas);

  CFG = CFG_EJEMPLO;
  // El plan de cada cultivo sale de sumar sus generaciones, como en la app.
  const cultivos = [...new Set(generaciones.map((g) => g.cultivo))];
  CFG.plan = cultivos.map((c) => {
    const p = perfil(c) || {};
    return filaDelPlan(c, generaciones.filter((g) => g.cultivo === c), {
      rinde: p.rinde_ref_kg_m2 || 2, lineas: p.lineas_bancal || 3, distancia: p.distancia_cm || 30 });
  });
  poner(LS.config, CFG);
  configConfirmada = true;
  resumen = { kg_cosechados: 38, siembras: 6, plantines: 1168, horas: 214.5,
              kg_por_cultivo: { Habas: 38 },
              horas_por_area: { "Hortícola": 132, "Mantenimiento": 41, "Comercialización": 23.5, "Administración": 18 } };
  pendientes = []; enviados = [];
  // Cuentas es solo de las chacras con economía compartida: no va en la ayuda.
  const estilo = document.createElement("style");
  estilo.textContent = '[data-vista="cuentas"]{display:none!important}';
  document.head.appendChild(estilo);

  // Ir a una pantalla: mostrar("plan", "grafico"), mostrar("siembras"), …
  window.mostrar = (vista, sub) => {
    if (vista === "plan") { vistaPlan = sub || "lista"; cultivoAbierto = ""; genPanel = ""; }
    render(vista);
    window.scrollTo(0, 0);
  };
  window.mostrar("inicio");
  return "Chacra de ejemplo lista";
})();
