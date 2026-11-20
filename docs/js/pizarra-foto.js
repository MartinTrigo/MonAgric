// js/pizarra-foto.js     — AMA Producción
//
// Foto de la pizarra de cosecha (20/11), EN PRUEBA.
//
// Se saca una foto a la pizarra escrita a mano en el campo. Sirve para dos
// cosas:
//   1. Verla en la app mientras se carga la cosecha a mano (es lo seguro).
//   2. Probar si Tesseract (el mismo lector que usa la app Hogar con los
//      tickets) entiende algo. Corre EN el teléfono: la foto no sale a ningún
//      lado. Tesseract está hecho para letra impresa; con letra a mano puede
//      leer poco. Por eso lo que entiende NUNCA se guarda solo: se pasa a la
//      pizarra de la pantalla, la persona revisa y toca Guardar.
//
// Las fotos se guardan solo en este teléfono (IndexedDB, base
// «monagric-fotos»), no en la planilla. Para no juntar peso, la primera foto
// de una semana nueva borra las de las semanas anteriores (semanas de lunes
// a domingo, como Stock).
//
// Cómo se escribe la pizarra: una fila por cultivo, con
//   CULTIVO · ATADOS (o unidades) · PESO DEL ATADO · KG
// llenando ATADOS + PESO, o KG.

const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

// ---- dónde se guardan ----
function baseFotos() {
  return new Promise((ok, mal) => {
    if (!window.indexedDB) return mal(new Error("este navegador no guarda fotos"));
    const pedido = indexedDB.open("monagric-fotos", 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore("pizarras", { keyPath: "id" });
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => mal(pedido.error);
  });
}
async function conFotos(modo, hacer) {
  const db = await baseFotos();
  return new Promise((ok, mal) => {
    const tx = db.transaction("pizarras", modo);
    const res = hacer(tx.objectStore("pizarras"));
    tx.oncomplete = () => { db.close(); ok(res && "result" in res ? res.result : undefined); };
    tx.onerror = () => { db.close(); mal(tx.error); };
  });
}
const todasLasFotos = async () => ((await conFotos("readonly", (s) => s.getAll())) || [])
  .sort((a, b) => (a.tomada < b.tomada ? 1 : -1));
const guardarFotoPizarra = (foto) => conFotos("readwrite", (s) => s.put(foto));
const borrarFotoPizarra = (id) => conFotos("readwrite", (s) => s.delete(id));

// El lunes de la semana de una fecha ISO.
function lunesDe(iso) {
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDe(d);
}

// ---- la foto ----
function abrirImagen(archivo) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => mal(new Error("la foto no se pudo abrir"));
    img.src = URL.createObjectURL(archivo);
  });
}
function lienzo(img, lado) {
  const k = Math.min(1, lado / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c;
}
// Para guardar: lado mayor 1600 px en JPEG, unos 200 a 400 KB.
const fotoParaGuardar = (img) => new Promise((ok) => lienzo(img, 1600).toBlob(ok, "image/jpeg", 0.72));
// Para leer: en gris y con el contraste estirado (fibrón sobre pizarra).
function fotoParaLeer(img) {
  const c = lienzo(img, 2000);
  const ctx = c.getContext("2d");
  const d = ctx.getImageData(0, 0, c.width, c.height), px = d.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000 | 0;
    px[i] = g; hist[g]++;
  }
  const n = px.length / 4;
  let lo = 0, hi = 255, acum = 0;
  while (lo < 255 && (acum += hist[lo]) < n * 0.02) lo++;
  acum = 0;
  while (hi > 0 && (acum += hist[hi]) < n * 0.02) hi--;
  const rango = Math.max(hi - lo, 1);
  for (let i = 0; i < px.length; i += 4) {
    const g = Math.max(0, Math.min(255, (px[i] - lo) * 255 / rango));
    px[i] = px[i + 1] = px[i + 2] = g;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

let cargaTesseract = null;
function cargarTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (cargaTesseract) return cargaTesseract;
  cargaTesseract = new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = TESSERACT_URL;
    s.onload = ok;
    s.onerror = () => { cargaTesseract = null; mal(new Error("hace falta señal la primera vez")); };
    document.head.appendChild(s);
  });
  return cargaTesseract;
}
async function leerConTesseract(lienzoFoto, estado) {
  await cargarTesseract();
  estado("Bajando el lector (solo la primera vez, unos 5 MB)…");
  const worker = await Tesseract.createWorker("spa", 1, {
    logger: (m) => { if (m.status === "recognizing text") estado(`Leyendo… ${Math.round(m.progress * 100)}%`); },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
    const { data } = await worker.recognize(lienzoFoto);
    return data.text || "";
  } finally {
    worker.terminate();
  }
}

// ---- entender lo leído ----
const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* Una línea por cultivo. Se busca el nombre del cultivo (el más largo que
   aparezca; si no, una palabra de cuatro letras o más con la que empiece) y
   después los números:
     «12,5 kg» o un solo número .......... kilos
     «500 g» ............................. peso de cada atado
     dos números (33 500) ................ atados y peso (en g si es 50 o más)
     tres números (33 500 16,5) .......... atados, peso y kilos
   Devuelve [{ cultivo, cantidad, formato, peso_g, kg, linea }]. */
function interpretarPizarra(texto, cultivos) {
  const nombres = cultivos.map((c) => ({ c, n: sinTildes(c) })).sort((a, b) => b.n.length - a.n.length);
  const out = [];
  String(texto || "").split(/\n+/).forEach((linea) => {
    const l = sinTildes(linea).replace(/[|_—–]/g, " ");
    if (!/\d/.test(l)) return;
    let cultivo = (nombres.find((x) => l.includes(x.n)) || {}).c;
    if (!cultivo) {
      const palabra = (l.match(/[a-zñ]{4,}/) || [])[0];
      cultivo = palabra && (nombres.find((x) => x.n.startsWith(palabra) || palabra.startsWith(x.n.split(" ")[0])) || {}).c;
    }
    if (!cultivo) return;
    const nums = [...l.matchAll(/(\d+(?:[.,]\d+)?)\s*(kgs?|kilos?|k|grs?|g)?\b/g)]
      .map((m) => ({ v: parseFloat(m[1].replace(",", ".")), u: (m[2] || "").replace(/s$/, "") }));
    const kgs = nums.filter((x) => /^k/.test(x.u)), gramos = nums.filter((x) => /^g/.test(x.u));
    const solos = nums.filter((x) => !x.u);
    let cantidad = 0, peso_g = 0, kg = 0;
    if (gramos.length) { peso_g = gramos[0].v; cantidad = solos[0]?.v || 0; }
    if (kgs.length) kg = kgs[kgs.length - 1].v;
    if (!gramos.length && !kgs.length) {
      if (solos.length === 1) kg = solos[0].v;
      else if (solos.length >= 2) {
        cantidad = solos[0].v;
        peso_g = solos[1].v >= 50 ? solos[1].v : solos[1].v * 1000;
        if (solos.length >= 3) kg = solos[2].v;
      }
    }
    const porUnidad = cantidad > 0 && peso_g > 0;
    if (!porUnidad && !(kg > 0)) return;
    out.push(porUnidad
      ? { cultivo, cantidad, formato: "atado", peso_g, kg: kgDeCosecha(cantidad, "atado", peso_g), linea: linea.trim() }
      : { cultivo, cantidad: kg, formato: "kg", peso_g: 0, kg, linea: linea.trim() });
  });
  return out;
}

// ---- la pantalla ----
// Lo que hay que pasar a la pizarra después de redibujar Cosechas.
let pizarraPorLlenar = null;
let fotoAbierta = "";

function tarjetaFotoPizarra() {
  return `<details class="tarjeta desplegable foto-pizarra" data-recordar="foto-pizarra"${estaDesplegado("foto-pizarra") ? " open" : ""}>
    <summary><h2>&#128247; Foto de la pizarra <small>en prueba</small></h2></summary>
    <p class="nota">Sacale una foto a la pizarra para tenerla a mano mientras cargás. La app
      además intenta leerla: con letra a mano puede fallar, así que revisá siempre lo que
      pasa a la pizarra antes de guardar. La foto queda solo en este teléfono, y la primera
      de una semana nueva borra las de la semana anterior.</p>
    <p class="nota">Cómo escribir la pizarra: una fila por cultivo, con
      <b>cultivo · atados · peso del atado · kg</b>. Se llena atados y peso, o kg.</p>
    <label class="secundario boton-archivo">&#128247; Sacar foto a la pizarra
      <input type="file" id="foto-pizarra" accept="image/*" capture="environment" hidden>
    </label>
    <div id="fotos-pizarra"><p class="nota">Buscando las fotos guardadas…</p></div>
  </details>`;
}

async function pintarFotosPizarra() {
  const caja = $("#fotos-pizarra");
  if (!caja) return;
  let fotos = [];
  try { fotos = await todasLasFotos(); } catch (e) {
    caja.innerHTML = `<p class="nota alerta">No se pueden guardar fotos en este navegador (${esc(e.message || e)}).</p>`;
    return;
  }
  if (!$("#fotos-pizarra")) return;
  if (!fotos.length) { caja.innerHTML = `<p class="nota">Todavía no hay fotos.</p>`; return; }
  const abierta = fotos.find((f) => f.id === fotoAbierta) || fotos[0];
  fotoAbierta = abierta.id;
  // Las direcciones de las fotos viven mientras se ve la pantalla.
  (window.urlsFotos || []).forEach((u) => URL.revokeObjectURL(u));
  window.urlsFotos = [];
  const url = (f) => { const u = URL.createObjectURL(f.foto); window.urlsFotos.push(u); return u; };
  const cultivos = cultivosOrdenados().lista;
  const filas = interpretarPizarra(abierta.texto, cultivos);
  caja.innerHTML = `
    ${fotos.length > 1 ? `<div class="fotos-miniaturas">${fotos.map((f) => `
      <button type="button" class="miniatura${f.id === abierta.id ? " elegida" : ""}" data-foto="${esc(f.id)}"
              title="${esc(fechaCorta(String(f.tomada).slice(0, 10)))}"><img src="${url(f)}" alt="Pizarra del ${esc(fechaCorta(String(f.tomada).slice(0, 10)))}"></button>`).join("")}</div>` : ""}
    <figure class="foto-grande">
      <a href="${url(abierta)}" target="_blank" rel="noopener" title="Abrir grande">
        <img src="${url(abierta)}" alt="Pizarra del ${esc(fechaCorta(String(abierta.tomada).slice(0, 10)))}"></a>
      <figcaption>${esc(fechaCorta(String(abierta.tomada).slice(0, 10)))} · ${esc(String(abierta.tomada).slice(11, 16))}
        <button type="button" class="enlace" data-borrar-foto="${esc(abierta.id)}">borrar esta foto</button></figcaption>
    </figure>
    ${abierta.texto === undefined ? `<p class="nota">No se intentó leerla.</p>`
      : `<div class="lectura-pizarra">
        <b>Lo que entendió:</b>
        ${filas.length ? `<ul>${filas.map((r) => `<li>${esc(r.cultivo)}: ${r.formato === "kg"
            ? `${num(r.kg, 1)} kg` : `${esc(cantidadCosechaTexto(r.cantidad, r.formato, r.peso_g))} = ${num(r.kg, 1)} kg`}
            <small>(«${esc(r.linea)}»)</small></li>`).join("")}</ul>
          <button type="button" class="secundario" id="pasar-a-pizarra">Pasar a la pizarra para revisar</button>`
          : `<p class="nota">No reconoció ningún cultivo con números. Cargá a mano mirando la foto.</p>`}
        <details><summary>Texto leído, tal cual</summary><pre>${esc(abierta.texto || "(nada)")}</pre></details>
      </div>`}`;

  caja.querySelectorAll("[data-foto]").forEach((b) => {
    b.onclick = () => { fotoAbierta = b.dataset.foto; pintarFotosPizarra(); };
  });
  caja.querySelectorAll("[data-borrar-foto]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm("¿Borrar esta foto del teléfono?")) return;
      await borrarFotoPizarra(b.dataset.borrarFoto);
      fotoAbierta = "";
      pintarFotosPizarra();
    };
  });
  const pasar = $("#pasar-a-pizarra");
  if (pasar) pasar.onclick = () => {
    pizarraPorLlenar = filas;
    if (modoCosecha !== "pizarra") { modoCosecha = "pizarra"; escribir(LS.modoCosecha, modoCosecha); }
    render("cosechas", true);
  };
}

// Después de dibujar Cosechas: si hay algo leído para pasar, va a la pizarra.
function llenarPizarraLeida() {
  const filas = pizarraPorLlenar;
  pizarraPorLlenar = null;
  const pizarra = $("#pizarra-cosecha");
  if (!filas || !pizarra) return;
  const fuera = [];
  filas.forEach((r) => {
    const inp = [...pizarra.querySelectorAll("input[data-cultivo]")]
      .find((x) => claveArea(x.dataset.cultivo) === claveArea(r.cultivo));
    if (!inp) { fuera.push(r.cultivo); return; }
    const div = inp.parentElement;
    inp.value = String(r.cantidad).replace(".", ",");
    div.querySelector(".formato-cosecha").value = r.formato;
    div.querySelector(".peso-cosecha input").value = r.formato === "kg" ? "" : String(r.peso_g);
    div.classList.add("leido");
  });
  $("#form-cosechas").dispatchEvent(new Event("input", { bubbles: true }));
  aviso(fuera.length
    ? `Pasado a la pizarra. No están en el plan: ${fuera.join(", ")} (cargalos en Lista). Revisá antes de guardar.`
    : "Pasado a la pizarra. Revisá cada renglón antes de guardar.");
}

function prepararFotoPizarra() {
  const input = $("#foto-pizarra");
  if (!input) return;
  pintarFotosPizarra();
  llenarPizarraLeida();
  input.onchange = async () => {
    const archivo = input.files[0];
    input.value = "";
    if (!archivo) return;
    const caja = $("#fotos-pizarra");
    const estado = (t) => { if (caja) caja.innerHTML = `<p class="nota">${esc(t)}</p>`; };
    try {
      estado("Guardando la foto…");
      const img = await abrirImagen(archivo);
      const ahora = new Date();
      const tomada = `${hoy()}T${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
      const foto = { id: "pz" + ahora.getTime(), tomada, semana: lunesDe(hoy()), foto: await fotoParaGuardar(img) };
      // La primera de una semana nueva borra las de antes.
      const viejas = (await todasLasFotos()).filter((f) => f.semana < foto.semana);
      for (const f of viejas) await borrarFotoPizarra(f.id);
      await guardarFotoPizarra(foto);
      fotoAbierta = foto.id;
      try {
        foto.texto = await leerConTesseract(fotoParaLeer(img), estado);
        await guardarFotoPizarra(foto);
      } catch (e) {
        aviso(`La foto quedó guardada, pero no se pudo leer: ${e.message || e}`, true);
      }
      URL.revokeObjectURL(img.src);
      pintarFotosPizarra();
    } catch (e) {
      aviso(`No se pudo guardar la foto: ${e.message || e}`, true);
      pintarFotosPizarra();
    }
  };
}
