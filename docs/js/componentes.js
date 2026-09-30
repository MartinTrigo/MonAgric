// js/componentes.js   — AMA Producción
//
// Piezas de interfaz que se usan en varias pantallas: buscadores, listas de
// integrantes y bancales, barras, tarjetas de estado, colores por cultivo.
//
// Los archivos se cargan en orden (ver index.html) y comparten el espacio
// global: no son módulos. Se partió app.js el 30/09/2026 sin cambiar código.

// Un renglon de destino: a que sector y a que bancal fue esta parte del
// almacigo. Se repite tantas veces como bancales se hayan plantado, porque
// cada bancal termina siendo una fila propia en la planilla.
function renglonBancal(i) {
  const secs = sectores();
  if (!secs.length) return "";
  return `<div class="renglon-bancal fila" data-renglon="${i}">
    <div>
      ${i === 0 ? "<label>Sector</label>" : ""}
      <select name="sector_${i}" data-sector>
        ${secs.map((s) => `<option value="${esc(s.sector)}">${esc(s.sector)} (${s.bancales})</option>`).join("")}
      </select>
    </div>
    <div>
      ${i === 0 ? "<label>Bancal</label>" : ""}
      <select name="bancal_${i}" data-bancal>${opcionesBancal(secs[0].sector)}</select>
    </div>
    ${i === 0 ? "" : `<button type="button" class="quitar" data-quitar-bancal
        aria-label="Quitar este bancal">&times;</button>`}
  </div>`;
}

// ---- Componentes reutilizables ----
// Buscador para listas largas: se escribe para filtrar y se toca para ver todo.
// El valor elegido queda en un campo oculto, así el formulario lo lee como
// cualquier otro campo.
function buscador(nombre, opciones, { placeholder = "Buscá o tocá para ver la lista…",
                                      valor = "", destacadas = [] } = {}) {
  return `<div class="buscador" data-buscador="${nombre}">
    <input type="text" class="buscador-texto" autocomplete="off" enterkeyhint="done"
           placeholder="${esc(placeholder)}" value="${esc(valor)}">
    <input type="hidden" name="${nombre}" value="${esc(valor)}">
    <div class="buscador-lista" hidden
         data-opciones="${esc(JSON.stringify(opciones))}"
         data-destacadas="${esc(JSON.stringify(destacadas))}"></div>
  </div>`;
}

function buscadorCultivo(valor = "", nombre = "cultivo") {
  const { lista, delPlan } = cultivosOrdenados();
  return buscador(nombre, lista, {
    placeholder: "Elegí el cultivo (escribí para buscar)…",
    valor, destacadas: delPlan,
  });
}

// Un renglón de pizarra: el nombre ya puesto y solo el casillero del número.
// Sin buscador, que es lo que hace lenta la carga cuando son veinte.
function renglonPizarra(cultivo, i) {
  return `<div class="renglon-pizarra">
    <label for="pz_${i}">${esc(cultivo)}</label>
    <input type="text" id="pz_${i}" name="pz_${i}" data-cultivo="${esc(cultivo)}"
           inputmode="decimal" autocomplete="off" placeholder="kg">
  </div>`;
}

// Un cultivo con sus kilos, en un solo renglón. Una cosecha de pizarra son
// veinte cultivos: con el formato anterior —dos etiquetas y dos campos apilados
// por cultivo— eran veinte pantallas de scroll. Acá cada uno ocupa una línea y
// los encabezados se escriben una sola vez, arriba de la lista.
function renglonCosecha(i, valor = "", kg = "") {
  return `<div class="renglon-cosecha" data-renglon="${i}">
    ${buscadorCultivo(valor, "cultivo_" + i)}
    <input type="text" name="kg_${i}" inputmode="decimal" autocomplete="off"
           value="${esc(kg)}" placeholder="kg" aria-label="Kilos cosechados">
    <button type="button" class="quitar" data-quitar-renglon="${i}"
            aria-label="Quitar este cultivo">&times;</button>
  </div>`;
}

// Enciende todos los buscadores que haya en un formulario.
function enlazarBuscadores(form) {
  form.querySelectorAll("[data-buscador]").forEach((caja) => {
    if (caja.dataset.encendido) return;    // ya tiene sus eventos (renglones nuevos)
    caja.dataset.encendido = "1";
    const texto = caja.querySelector(".buscador-texto");
    const oculto = caja.querySelector("input[type=hidden]");
    const lista = caja.querySelector(".buscador-lista");
    const opciones = JSON.parse(lista.dataset.opciones);
    const destacadas = new Set(JSON.parse(lista.dataset.destacadas));
    let marcada = -1;

    // Sin tildes ni mayúsculas: "morron" encuentra "Morrón". El rango ̀-ͯ
    // son las tildes que quedan sueltas al separar con NFD.
    const plano = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

    const pintar = (filtro = "") => {
      const f = plano(filtro.trim());
      const hallados = opciones.filter((o) => plano(o).includes(f));
      marcada = hallados.length ? 0 : -1;
      lista.innerHTML = hallados.length
        ? hallados.map((o, i) => `<div class="buscador-op${i === 0 ? " marcada" : ""}" data-valor="${esc(o)}">
             ${esc(o)}${destacadas.has(o) ? '<span class="del-plan">del plan</span>' : ""}
           </div>`).join("")
        : `<div class="buscador-vacio">No hay ningún cultivo con ese nombre.</div>`;
      lista.hidden = false;
    };

    const elegir = (valor) => {
      texto.value = valor;
      oculto.value = valor;
      lista.hidden = true;
      form.dispatchEvent(new Event("change", { bubbles: true }));
      // En un renglón de cosecha el paso siguiente es siempre el número, así
      // que el foco va solo: pasar una pizarra de veinte es escribir cultivo,
      // Enter, kilos, Enter, sin levantar la mano del teclado ni buscar el
      // campo con el dedo. Fuera de esos renglones no se toca el foco.
      const renglon = caja.closest(".renglon-cosecha");
      const kg = renglon?.querySelector("input[name^=kg_]");
      if (kg) setTimeout(() => kg.focus(), 0);
    };

    texto.addEventListener("focus", () => pintar(""));
    texto.addEventListener("input", () => { oculto.value = ""; pintar(texto.value); });
    texto.addEventListener("keydown", (e) => {
      const ops = [...lista.querySelectorAll(".buscador-op")];
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!ops.length) return;
        marcada = (marcada + (e.key === "ArrowDown" ? 1 : -1) + ops.length) % ops.length;
        ops.forEach((o, i) => o.classList.toggle("marcada", i === marcada));
        ops[marcada].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (ops[marcada]) elegir(ops[marcada].dataset.valor);
      } else if (e.key === "Escape") {
        lista.hidden = true;
      }
    });
    lista.addEventListener("mousedown", (e) => {
      const op = e.target.closest(".buscador-op");
      if (op) { e.preventDefault(); elegir(op.dataset.valor); }
    });
    // Al salir del campo: si lo escrito coincide con una opción, se toma.
    texto.addEventListener("blur", () => {
      setTimeout(() => {
        lista.hidden = true;
        if (!oculto.value) {
          const exacta = opciones.find((o) => plano(o) === plano(texto.value));
          if (exacta) elegir(exacta);
          else texto.value = "";
        }
      }, 150);
    });
  });
}

function opcionesIntegrante(seleccionado = "") {
  const lista = integrantes();
  return `<option value="" disabled${seleccionado ? "" : " selected"}>Elegí…</option>
    ${lista.map((n) => `<option${n === seleccionado ? " selected" : ""}>${esc(n)}</option>`).join("")}`;
}

// Cada sector tiene su propia cantidad de bancales, asi que la lista se rearma
// al elegir sector. Antes salia siempre la del primero: en Chacra Tica eso
// dejaba elegir solo del 1 al 6 (los del Frutillar) en sectores de 25 bancales.
function opcionesBancal(sector, seleccionado = "") {
  const s = sectores().find((x) => x.sector === sector) || sectores()[0];
  const n = s ? s.bancales : 0;
  return Array.from({ length: n }, (_, i) => i + 1)
    .map((b) => `<option${String(b) === String(seleccionado) ? " selected" : ""}>${b}</option>`)
    .join("");
}

function camposSectorBancal(idPrefijo = "") {
  const secs = sectores();
  if (!secs.length) return "";
  return `<div class="fila">
    <div>
      <label>Sector</label>
      <select name="sector" id="${idPrefijo}sector">
        ${secs.map((s) => `<option value="${esc(s.sector)}">${esc(s.sector)} (${s.bancales} bancales)</option>`).join("")}
      </select>
    </div>
    <div>
      <label>Bancal</label>
      <select name="bancal" id="${idPrefijo}bancal">
        ${opcionesBancal(secs[0].sector)}
      </select>
    </div>
  </div>`;
}

// El nº de bancales depende del sector elegido.
function enlazarSectorBancal(form) {
  const sel = form.querySelector("select[name=sector]");
  const ban = form.querySelector("select[name=bancal]");
  if (!sel || !ban) return;
  sel.addEventListener("change", () => {
    const s = sectores().find((x) => x.sector === sel.value);
    const n = s ? s.bancales : 15;
    const previo = ban.value;
    ban.innerHTML = Array.from({ length: n }, (_, i) => `<option>${i + 1}</option>`).join("");
    if (Number(previo) <= n) ban.value = previo;
  });
}

function barra(porcentaje, clara = false) {
  const p = Math.max(0, Math.min(100, porcentaje || 0));
  return `<div class="barra${clara ? " clara" : ""}"><i style="width:${p}%"></i></div>`;
}

// El cosechador de Pac-Farm con su sombrero de paja, comiéndose la huerta.
// Es pixel art, así que va como PNG y no como vector: un vector necesitaría un
// rectángulo por píxel, pesaría más y se vería peor. Pesa 1,2 KB.
const IMG_PACFARM =
  `<img src="img/pacfarm.png" alt="" class="dibujo-pacfarm" width="65" height="39">`;

const filaSector = (s, i) => `<div class="registro">
  <div><div class="detalle">${esc(s.sector)}</div>
    <div class="cuando">${esc(s.tipo_riego || "sin riego indicado")}</div></div>
  <span class="etiqueta ok">${s.bancales} bancales</span>
  <button type="button" class="editar" data-editar-sector="${i}" aria-label="Editar">&#9998;</button>
  <button type="button" class="quitar" data-sector="${i}" aria-label="Quitar">&times;</button>
</div>`;

// Un color propio para cada cultivo, sacado de su nombre. Con veintiún
// cultivos en el mismo gráfico, el color es lo que deja seguir uno con la
// vista sin leer cada renglón. El tono sale del nombre —siempre el mismo para
// el mismo cultivo, en cualquier chacra y sin tener que elegirlo a mano— y las
// tres etapas son el mismo tono en tres claridades, así se distinguen entre
// ellas sin perder de qué cultivo son.
function tonoDe(cultivo) {
  let h = 0;
  const s = claveArea(cultivo);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  // Se esquivan los rojos puros, que en esta app significan alerta y atraso.
  return (h < 20 || h > 340) ? (h + 40) % 360 : h;
}
const colorEtapa = (cultivo, etapa) => {
  const h = tonoDe(cultivo);
  if (etapa === "almacigo") return `hsl(${h} 38% 72%)`;
  if (etapa === "campo") return `hsl(${h} 42% 55%)`;
  return `hsl(${h} 52% 34%)`;           // cosecha, la más saturada y oscura
};

function tarjetaElegirChacra() {
  return `<div class="tarjeta">
    <h2>¿De qué chacra sos?</h2>
    <p class="nota">Se elige una sola vez en este teléfono. Cada chacra guarda sus
    datos en su propia planilla.</p>
    <div class="chips" style="margin-top:12px">
      ${CHACRAS.map((c) => `<button type="button" class="chip-chacra" data-chacra="${esc(c.codigo)}">
        ${esc(c.nombre)}</button>`).join("")}
    </div>
  </div>`;
}

function tarjetaCanje() {
  const ch = chacraActual();
  return `<div class="tarjeta">
    <h2>&#128273; Tu código de acceso</h2>
    <p class="nota">Para cargar datos en <b>${esc(ch.nombre)}</b> hace falta el código
    que te dieron. Se escribe una sola vez en este teléfono; después no te lo pide
    más.</p>
    <form id="form-canje">
      <label>Código</label>
      <input type="text" name="codigo" autocomplete="off" autocapitalize="characters"
             spellcheck="false" placeholder="Ej: TICA-4F2K" required>

      <label>Tu nombre</label>
      <input type="text" name="persona" autocomplete="off" maxlength="40"
             placeholder="Ej: Luna" required>

      <button class="principal">Activar este teléfono</button>
    </form>
    <p class="nota" style="margin-top:12px">¿No tenés código? Pedíselo a quien
    administra la app. ¿Te equivocaste de chacra?
    <a href="#" id="volver-a-chacra">Elegir otra</a>.</p>
  </div>`;
}

function tarjetaSinConfig() {
  return `<div class="tarjeta">
    <h2>Falta configurar la temporada</h2>
    <p class="nota">Antes de empezar hay que cargar los sectores, los bancales, quiénes
    trabajan y qué se planifica sembrar. Se hace una vez y se puede corregir cuando
    quieras.</p>
    <button class="principal" id="btn-ir-config" style="margin-top:12px">
      Configurar la temporada</button>
  </div>`;
}

const cifraClara = (valor, etq) =>
  `<div class="cifra" style="background:#E7EFE6;color:var(--sage-dark)">
     <b>${valor}</b><span style="color:var(--sage)">${etq}</span></div>`;

// Mientras no haya planilla conectada, la app muestra lo de este teléfono.
function totalesLocales() {
  const t = { siembras: 0, plantines: 0, horas: 0, kg: 0 };
  pendientes.concat(enviados).forEach((r) => {
    if (r.tipo === "siembras") { t.siembras++; t.plantines += r.datos.plantines || 0; }
    else if (r.tipo === "horas") t.horas += r.datos.horas || 0;
    else if (r.tipo === "cosechas") t.kg += r.datos.kg || 0;
  });
  return t;
}

function kgLocalesPorCultivo() {
  const mapa = {};
  pendientes.concat(enviados).forEach((r) => {
    if (r.tipo === "cosechas") mapa[r.datos.cultivo] = (mapa[r.datos.cultivo] || 0) + (r.datos.kg || 0);
  });
  return mapa;
}

// La dirección de la planilla la manda el servicio junto con la configuración.
const enlacePlanilla = () => CFG?.planilla || "https://drive.google.com/drive/recent";
