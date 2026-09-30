// js/arranque.js      — AMA Producción
//
// Arranque: engancha la barra de secciones, carga el catálogo, dibuja Inicio y
// sincroniza. Va último: usa todo lo anterior.
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos. Se partió app.js el 30/09/2026 sin cambiar código.

// ==========================================================
// ARRANQUE
// ==========================================================
document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => render(t.dataset.vista)));
$("#btn-ajustes").addEventListener("click", () => render("ajustes"));
window.addEventListener("online", () => sincronizar());

(async function iniciar() {
  // El catálogo es igual para todas las chacras y viaja con la app.
  try {
    const r = await fetch("catalogo.json", { cache: "no-cache" });
    if (r.ok) CAT = await r.json();
  } catch { /* sin catálogo la app igual arranca, con las listas vacías */ }

  render(chacraActual() ? "inicio" : "inicio");
  refrescarEstado();
  // La configuración primero: dice si las horas de Tica ya van por el servicio
  // (y trae los nombres) o si hay que pedirlos al script de horas aparte.
  await traerConfig();
  if (horasVanAparte()) await traerDatosHoras();   // nombres del equipo del proyecto
  await traerCatalogo();
  if (["inicio", "plan"].includes(vistaActual)) redibujarConDatos(vistaActual);
  sincronizar();
})();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
