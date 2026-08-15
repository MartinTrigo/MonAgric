// ==========================================================
// PAC-FARM — un clásico de laberinto con temática de huerta
//
// El cosechador junta rabanitos y nabos, las frutillas de las esquinas lo
// vuelven temible por unos segundos y cada tanto aparece un tomate de regalo.
// Las plagas (vaquita, pulgón, mosca blanca y babosa) lo persiguen.
//
// Todo se dibuja en un lienzo de 224x288 píxeles que después se agranda por
// múltiplos enteros: así el pixel art queda nítido en cualquier pantalla.
// ==========================================================

"use strict";

// ---------- El laberinto ----------
// # pared · . rabanito/nabo · o frutilla · = puerta de la madriguera · espacio libre
const LAB_ORIGINAL = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.##### ## #####.######",
  "######.##### ## #####.######",
  "######.##          ##.######",
  "######.## ###==### ##.######",
  "######.## #      # ##.######",
  "      .   #      #   .      ",
  "######.## #      # ##.######",
  "######.## ######## ##.######",
  "######.##          ##.######",
  "######.## ######## ##.######",
  "######.##############.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#.####.#####.##.#####.####.#",
  "#o..##.......  .......##..o#",
  "###.##.##.########.##.##.###",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################",
];

const COLS = 28, FILAS = 31, T = 8;      // celda de 8x8 píxeles
const MARGEN_ARRIBA = 24;                // franja del marcador
const ANCHO = COLS * T;                  // 224
const ALTO = FILAS * T + MARGEN_ARRIBA + 16;

const IZQ = { x: -1, y: 0 }, DER = { x: 1, y: 0 };
const ARR = { x: 0, y: -1 }, ABA = { x: 0, y: 1 };

// ---------- Colores ----------
const COLOR = {
  fondo: "#0b1410",
  pared: "#101d15",   // el relleno del cantero, apenas más claro que el fondo
  borde: "#4ec97e",   // el contorno luminoso, como en los recreativos
  puerta: "#c8a165",
  texto: "#d9f2de",
  ambar: "#f5b324",
  tomate: "#e4483c",
};

// ---------- Utilidades de pixel art ----------
function lienzo(ancho, alto) {
  const c = document.createElement("canvas");
  c.width = ancho;
  c.height = alto;
  return c;
}

// Convierte filas de texto en un dibujo: cada letra es un píxel de la paleta.
function dibujoDe(filas, paleta) {
  const c = lienzo(filas[0].length, filas.length);
  const g = c.getContext("2d");
  filas.forEach((fila, y) => {
    for (let x = 0; x < fila.length; x++) {
      const color = paleta[fila[x]];
      if (color) { g.fillStyle = color; g.fillRect(x, y, 1, 1); }
    }
  });
  return c;
}

// ---------- Las verduras ----------
const RABANITO = dibujoDe([
  ".g..g.",
  "..gg..",
  ".rRRr.",
  "rRRRRr",
  ".rRRr.",
  "..rr..",
], { g: "#5fbf5a", R: "#e85c5c", r: "#b83a3a" });

const NABO = dibujoDe([
  ".g..g.",
  "..gg..",
  ".pppp.",
  "pWWWWp",
  ".WWWW.",
  "..WW..",
], { g: "#5fbf5a", W: "#f2f2e8", p: "#b08bd1" });

// Más grande que las verduras: es el premio del tablero y se la ve latir.
const FRUTILLA = dibujoDe([
  "...g.g...",
  "..ggggg..",
  ".gg...gg.",
  ".rRRRRRr.",
  "rRsRRRsRr",
  "rRRRsRRRr",
  "rRsRRRsRr",
  ".rRRRRRr.",
  "..rrrrr..",
  "...rrr...",
], { g: "#5fbf5a", R: "#f2564a", r: "#b8281f", s: "#ffe9a8" });

const TOMATE = dibujoDe([
  "....g.g....",
  "...ggggg...",
  "..rRRRRRr..",
  ".rRRRRRRRr.",
  "rRRhRRRRRRr",
  "rRRRRRRRRRr",
  "rRRRRRRRRRr",
  ".rRRRRRRRr.",
  "..rRRRRRr..",
  "...rrrrr...",
], { g: "#5fbf5a", R: "#e4483c", r: "#a82a20", h: "#ff9b9b" });

// ---------- El cosechador ----------
// Se calcula píxel por píxel: un círculo al que se le recorta la boca, y encima
// el sombrero de paja de agricultor. Así la animación de masticar sale sola en
// las cuatro direcciones sin tener que dibujar cada cuadro a mano.
const ANCHO_COS = 17, ALTO_COS = 23;
const CX_COS = 8, CY_COS = 11, R_COS = 7;      // centro y radio de la cabeza
// Medio ancho del sombrero en cada fila: arriba la punta, abajo el ala. Se
// apoya en la coronilla y no baja más, para que la cara se siga viendo.
const SOMBRERO = [0, 1, 2, 4, 7];

function dibujarCosechador(anguloBoca, dir) {
  const c = lienzo(ANCHO_COS, ALTO_COS);
  const g = c.getContext("2d");
  const rumbo = Math.atan2(dir.y, dir.x);
  const haciaArriba = dir.y < 0;

  // Yendo hacia arriba la boca se abre justo donde está el sombrero, así que el
  // sombrero se dibuja primero y queda detrás de la cabeza: se lo ve asomar por
  // atrás, como cuando alguien camina de espaldas, y la boca queda libre.
  const pintarSombrero = () => {
    const ala = SOMBRERO[SOMBRERO.length - 1];

    // De espaldas no se ve el cono, solo el ala asomando por detrás de la
    // cabeza: si se dibujara entero, la punta aparecería dentro de la boca.
    if (haciaArriba) {
      for (let x = CX_COS - ala; x <= CX_COS + ala; x++) {
        const punta = x === CX_COS - ala || x === CX_COS + ala;
        g.fillStyle = punta ? "#a8814a" : "#e2c07c";
        g.fillRect(x, 4, 1, 1);          // el ala, apoyada en la coronilla
        g.fillStyle = "#a8814a";
        g.fillRect(x, 5, 1, 1);          // el canto del ala
        if (Math.abs(x - CX_COS) <= 3) { // la copa asomando por detrás
          g.fillStyle = "#e2c07c";
          g.fillRect(x, 3, 1, 1);
        }
      }
      return;
    }

    SOMBRERO.forEach((medio, fila) => {
      const desde = CX_COS - medio, hasta = CX_COS + medio;
      const ultima = fila === SOMBRERO.length - 1;
      for (let x = desde; x <= hasta; x++) {
        const borde = ultima || x === desde || x === hasta;
        g.fillStyle = borde ? "#a8814a" : "#e2c07c";
        g.fillRect(x, fila, 1, 1);
      }
    });
    g.fillStyle = "#8c6a3a";     // el hilito de sombra bajo el ala
    g.fillRect(CX_COS - 6, SOMBRERO.length, 13, 1);
  };

  if (haciaArriba) pintarSombrero();

  for (let y = 0; y < ALTO_COS; y++) {
    for (let x = 0; x < ANCHO_COS; x++) {
      const dx = x - CX_COS, dy = y - CY_COS;
      const dist = Math.hypot(dx, dy);
      if (dist > R_COS) continue;
      // recorte de la boca: un cono que se abre hacia donde mira
      let dif = Math.abs(Math.atan2(dy, dx) - rumbo);
      if (dif > Math.PI) dif = 2 * Math.PI - dif;
      if (dif < anguloBoca) continue;
      g.fillStyle = dist > R_COS - 1.6 ? "#c8811a" : "#f5b324";
      g.fillRect(x, y, 1, 1);
    }
  }

  if (!haciaArriba) pintarSombrero();
  return c;
}

const BOCAS = [0.05, 0.45, 0.9];   // cerrada, media, abierta
const COSECHADOR = {};
[["der", DER], ["izq", IZQ], ["arr", ARR], ["aba", ABA]].forEach(([nombre, dir]) => {
  COSECHADOR[nombre] = BOCAS.map((a) => dibujarCosechador(a, dir));
});

// ---------- Las plagas ----------
// Los bichos se ven desde arriba, como un escarabajo: cabeza con antenas,
// las alas con la costura al medio y las seis patas asomando a los costados.
// Al caminar, las patas alternan de fila y parece que se mueven.
const CUERPO = "...dccssccd...";     // sin patas
const PATAS  = ".lldccssccdll.";     // las patas salen pegadas al cuerpo

const cuerpoPlaga = (patasArriba) => [
  "...a......a...",
  "....a....a....",
  ".....hhhh.....",
  "....hhhhhh....",
  patasArriba ? PATAS : CUERPO,
  patasArriba ? CUERPO : PATAS,
  patasArriba ? PATAS : CUERPO,
  patasArriba ? CUERPO : PATAS,
  patasArriba ? PATAS : CUERPO,
  patasArriba ? CUERPO : PATAS,
  CUERPO,
  "....dccccd....",
  ".....dccd.....",
  "......dd......",
];

function dibujarPlaga(claro, oscuro, cabeza) {
  return [false, true].map((patasArriba) =>
    dibujoDe(cuerpoPlaga(patasArriba), {
      c: claro,        // las alas
      d: oscuro,       // el borde del cuerpo
      s: oscuro,       // la costura del medio
      h: cabeza,       // la cabeza
      a: oscuro,       // antenas
      l: oscuro,       // patas
    }));
}

const PLAGAS_INFO = [
  { nombre: "Vaquita",      claro: "#e4483c", oscuro: "#8f241c", cabeza: "#3a1410",
    esquina: { c: 25, f: 0 },  casa: null },
  { nombre: "Pulgón",       claro: "#7bc94e", oscuro: "#3f7a22", cabeza: "#2b5416",
    esquina: { c: 2,  f: 0 },  casa: { c: 13, f: 14 } },
  { nombre: "Mosca blanca", claro: "#7fd4e8", oscuro: "#2f7d92", cabeza: "#1d5568",
    esquina: { c: 25, f: 30 }, casa: { c: 11, f: 14 } },
  { nombre: "Babosa",       claro: "#e08a3c", oscuro: "#96521a", cabeza: "#603210",
    esquina: { c: 2,  f: 30 }, casa: { c: 16, f: 14 } },
];
PLAGAS_INFO.forEach((p) => { p.dibujos = dibujarPlaga(p.claro, p.oscuro, p.cabeza); });

const PLAGA_ASUSTADA = dibujarPlaga("#3b53c4", "#1d2a70", "#141d52");
const PLAGA_PARPADEO = dibujarPlaga("#e8ecff", "#8f9ad0", "#6c78ae");

// ---------- Estado ----------
const pantalla = document.getElementById("pantalla");
const ctx = pantalla.getContext("2d");
ctx.imageSmoothingEnabled = false;

let lab = [];                 // copia del laberinto: se le van sacando las verduras
let capaParedes = null;       // las paredes se dibujan una sola vez
let puntaje = 0, vidas = 3, nivel = 1;
let record = Number(localStorage.getItem("pacfarm_record") || 0);
let verdurasQuedan = 0, verdurasComidas = 0;
let escena = "listo";         // listo | jugando | muriendo | fin | nivel
let reloj = 0, relojEscena = 0;
let modoIndice = 0, modoReloj = 0, modo = "dispersar";
let asustadasReloj = 0, plagasComidas = 0;
let tomate = null;            // { x, y, reloj }
let sonidoActivo = true, pausado = false;

const cosechador = {
  x: 0, y: 0, dir: IZQ, dirDeseada: null, animacion: 0, muerte: 0,
};
let plagas = [];

// Cada tanto un nabo en lugar de un rabanito: siempre los mismos, para que el
// laberinto se vea igual en cada partida.
const esNabo = (c, f) => (c * 7 + f * 13) % 9 === 0;

// ---------- Laberinto ----------
const enRango = (c, f) => f >= 0 && f < FILAS;
const envolver = (c) => (c + COLS) % COLS;

function celda(c, f) {
  if (!enRango(c, f)) return "#";
  return lab[f][envolver(c)];
}

// La puerta de la madriguera solo la cruzan las plagas que entran o salen.
function bloqueado(c, f, quien) {
  const ch = celda(c, f);
  if (ch === "#") return true;
  if (ch === "=") {
    return !(quien && ["saliendo", "ojos", "entrando"].includes(quien.estado));
  }
  return false;
}

function prepararLaberinto() {
  lab = LAB_ORIGINAL.map((f) => f.split(""));
  verdurasQuedan = 0;
  for (let f = 0; f < FILAS; f++) {
    for (let c = 0; c < COLS; c++) {
      if (lab[f][c] === "." || lab[f][c] === "o") verdurasQuedan++;
    }
  }
  verdurasComidas = 0;
  dibujarParedes();
}

// Las paredes no cambian: se dibujan una vez y después solo se copian.
function dibujarParedes() {
  capaParedes = lienzo(ANCHO, FILAS * T);
  const g = capaParedes.getContext("2d");
  for (let f = 0; f < FILAS; f++) {
    for (let c = 0; c < COLS; c++) {
      const ch = LAB_ORIGINAL[f][c];
      if (ch === "=") {
        g.fillStyle = COLOR.puerta;
        g.fillRect(c * T, f * T + 3, T, 2);
        continue;
      }
      if (ch !== "#") continue;
      g.fillStyle = COLOR.pared;
      g.fillRect(c * T, f * T, T, T);

      // Solo se ilumina el lado que da a un pasillo: así el laberinto se lee
      // como líneas y no como bloques macizos.
      const pared = (cc, ff) => LAB_ORIGINAL[ff]?.[cc] === "#" || LAB_ORIGINAL[ff]?.[cc] === undefined;
      g.fillStyle = COLOR.borde;
      if (!pared(c, f - 1)) g.fillRect(c * T, f * T, T, 1);
      if (!pared(c, f + 1)) g.fillRect(c * T, f * T + T - 1, T, 1);
      if (!pared(c - 1, f)) g.fillRect(c * T, f * T, 1, T);
      if (!pared(c + 1, f)) g.fillRect(c * T + T - 1, f * T, 1, T);
      // esquinas interiores: completan el trazo en los recodos
      if (pared(c, f - 1) && pared(c - 1, f) && !pared(c - 1, f - 1)) g.fillRect(c * T, f * T, 1, 1);
      if (pared(c, f - 1) && pared(c + 1, f) && !pared(c + 1, f - 1)) g.fillRect(c * T + T - 1, f * T, 1, 1);
      if (pared(c, f + 1) && pared(c - 1, f) && !pared(c - 1, f + 1)) g.fillRect(c * T, f * T + T - 1, 1, 1);
      if (pared(c, f + 1) && pared(c + 1, f) && !pared(c + 1, f + 1)) g.fillRect(c * T + T - 1, f * T + T - 1, 1, 1);
    }
  }
}

// ---------- Posiciones ----------
const centroX = (c) => c * T + T / 2;
const centroY = (f) => f * T + T / 2;
const colDe = (e) => Math.floor(e.x / T);
const filaDe = (e) => Math.floor(e.y / T);

function ubicarPersonajes() {
  cosechador.x = centroX(13);
  cosechador.y = centroY(23);
  cosechador.dir = IZQ;
  cosechador.dirDeseada = null;
  cosechador.muerte = 0;

  plagas = PLAGAS_INFO.map((info, i) => ({
    info,
    x: info.casa ? centroX(info.casa.c) : centroX(13),
    y: info.casa ? centroY(info.casa.f) : centroY(11),
    dir: i % 2 ? ARR : IZQ,
    estado: info.casa ? "casa" : "normal",
    soltarEn: [0, 8, 24, 50][i],     // sale cuando se juntaron tantas verduras
    animacion: 0,
    vaiven: 0,
  }));

  modoIndice = 0; modoReloj = 0; modo = "dispersar";
  asustadasReloj = 0; plagasComidas = 0;
  tomate = null;
}

// Lo que tarda un bicho comido en rearmarse dentro de la madriguera. Es a
// propósito generoso: hay que poder disfrutar el rato en que la huerta quedó
// tranquila después de comérselos.
const SEGUNDOS_REGENERA = 10;

// ---------- Velocidades ----------
const velCosechador = () => 66 + Math.min(nivel - 1, 4) * 4;
function velPlaga(p) {
  if (p.estado === "ojos") return 150;
  if (p.estado === "casa" || p.estado === "saliendo" || p.estado === "entrando") return 44;
  if (asustadasReloj > 0) return 40 + Math.min(nivel - 1, 4) * 2;
  return 58 + Math.min(nivel - 1, 6) * 4;
}

// ---------- Movimiento ----------
function avanzar(e, velocidad, dt) {
  const col = colDe(e), fila = filaDe(e);
  const cx = centroX(col), cy = centroY(fila);
  let paso = velocidad * dt;

  // frena en el centro de la celda si lo que sigue es pared
  if (bloqueado(col + e.dir.x, fila + e.dir.y, e)) {
    if (e.dir.x > 0) paso = Math.min(paso, Math.max(0, cx - e.x));
    if (e.dir.x < 0) paso = Math.min(paso, Math.max(0, e.x - cx));
    if (e.dir.y > 0) paso = Math.min(paso, Math.max(0, cy - e.y));
    if (e.dir.y < 0) paso = Math.min(paso, Math.max(0, e.y - cy));
  }
  e.x += e.dir.x * paso;
  e.y += e.dir.y * paso;

  // el túnel de los costados
  if (e.x < -T / 2) e.x = ANCHO + T / 2 - 1;
  if (e.x > ANCHO + T / 2) e.x = -T / 2 + 1;
  return paso;
}

function intentarGiro(e) {
  const d = e.dirDeseada;
  if (!d) return;
  if (d.x === e.dir.x && d.y === e.dir.y) { e.dirDeseada = null; return; }
  // dar la vuelta se puede en cualquier momento
  if (d.x === -e.dir.x && d.y === -e.dir.y) { e.dir = d; e.dirDeseada = null; return; }

  const col = colDe(e), fila = filaDe(e);
  const cerca = Math.abs(e.x - centroX(col)) < 2.5 && Math.abs(e.y - centroY(fila)) < 2.5;
  if (cerca && !bloqueado(col + d.x, fila + d.y, e)) {
    e.x = centroX(col); e.y = centroY(fila);
    e.dir = d; e.dirDeseada = null;
  }
}

// ---------- Verduras ----------
function comer() {
  const col = colDe(cosechador), fila = filaDe(cosechador);
  if (Math.abs(cosechador.x - centroX(col)) > 3 || Math.abs(cosechador.y - centroY(fila)) > 3) return;
  const ch = celda(col, fila);
  if (ch !== "." && ch !== "o") return;

  lab[fila][envolver(col)] = " ";
  verdurasQuedan--;
  verdurasComidas++;

  if (ch === "o") {
    sumar(50);
    asustadasReloj = Math.max(2, 7 - nivel * 0.5);
    plagasComidas = 0;
    plagas.forEach((p) => {
      if (p.estado === "normal") { p.dir = { x: -p.dir.x, y: -p.dir.y }; }
    });
    sonar("frutilla");
  } else {
    sumar(esNabo(col, fila) ? 25 : 10);
    sonar("mordisco");
  }

  // el tomate de regalo aparece dos veces por nivel
  if (verdurasComidas === 70 || verdurasComidas === 170) {
    tomate = { x: centroX(13), y: centroY(17), reloj: 10 };
  }
  if (verdurasQuedan === 0) {
    escena = "nivel";
    relojEscena = 0;
  }
}

const puntosTomate = () => Math.min(100 + (nivel - 1) * 100, 500);

function sumar(p) {
  puntaje += p;
  if (puntaje > record) {
    record = puntaje;
    localStorage.setItem("pacfarm_record", String(record));
  }
}

// ---------- Las plagas piensan ----------
const MODOS = [
  ["dispersar", 7], ["perseguir", 20], ["dispersar", 7], ["perseguir", 20],
  ["dispersar", 5], ["perseguir", 20], ["dispersar", 5], ["perseguir", Infinity],
];

function actualizarModo(dt) {
  if (asustadasReloj > 0) return;
  modoReloj += dt;
  const [nombre, dura] = MODOS[modoIndice];
  modo = nombre;
  if (modoReloj >= dura && modoIndice < MODOS.length - 1) {
    modoIndice++;
    modoReloj = 0;
    modo = MODOS[modoIndice][0];
    // al cambiar de humor, las plagas se dan vuelta (como en el clásico)
    plagas.forEach((p) => { if (p.estado === "normal") p.dir = { x: -p.dir.x, y: -p.dir.y }; });
  }
}

function objetivoDe(p, indice) {
  if (p.estado === "ojos") return { c: 13, f: 11 };
  if (modo === "dispersar") return p.info.esquina;

  const pc = colDe(cosechador), pf = filaDe(cosechador);
  const d = cosechador.dir;
  if (indice === 0) return { c: pc, f: pf };                                  // va derecho
  if (indice === 1) return { c: pc + d.x * 4, f: pf + d.y * 4 };              // se adelanta
  if (indice === 2) {                                                         // rebota sobre la vaquita
    const v = plagas[0];
    const mc = pc + d.x * 2, mf = pf + d.y * 2;
    return { c: mc * 2 - colDe(v), f: mf * 2 - filaDe(v) };
  }
  const lejos = Math.hypot(colDe(p) - pc, filaDe(p) - pf) > 8;               // tímida
  return lejos ? { c: pc, f: pf } : p.info.esquina;
}

function decidirPlaga(p, indice) {
  const col = colDe(p), fila = filaDe(p);
  if (Math.abs(p.x - centroX(col)) > 1.5 || Math.abs(p.y - centroY(fila)) > 1.5) return;
  if (p.ultimaCelda === col + "," + fila) return;
  p.ultimaCelda = col + "," + fila;

  const opciones = [ARR, IZQ, ABA, DER].filter((d) => {
    if (d.x === -p.dir.x && d.y === -p.dir.y) return false;   // no se da vuelta sola
    return !bloqueado(col + d.x, fila + d.y, p);
  });
  if (!opciones.length) { p.dir = { x: -p.dir.x, y: -p.dir.y }; return; }

  if (asustadasReloj > 0 && p.estado === "normal") {
    p.dir = opciones[Math.floor(Math.random() * opciones.length)];
    return;
  }
  const meta = objetivoDe(p, indice);
  let mejor = opciones[0], mejorDist = Infinity;
  for (const d of opciones) {
    const dist = Math.hypot(col + d.x - meta.c, fila + d.y - meta.f);
    if (dist < mejorDist) { mejorDist = dist; mejor = d; }
  }
  p.dir = mejor;
}

function moverPlaga(p, indice, dt) {
  const vel = velPlaga(p);

  if (p.estado === "casa") {
    // se mueve de arriba abajo esperando su turno
    p.vaiven += dt * 3;
    p.y = centroY(p.info.casa.f) + Math.sin(p.vaiven) * 3;
    if (verdurasComidas >= p.soltarEn) p.estado = "saliendo";
    return;
  }

  if (p.estado === "saliendo") {
    const metaX = centroX(13), metaY = centroY(11);
    if (Math.abs(p.x - metaX) > 1) {
      p.x += Math.sign(metaX - p.x) * vel * dt;
    } else {
      p.x = metaX;
      p.y -= vel * dt;
      if (p.y <= metaY) { p.y = metaY; p.estado = "normal"; p.dir = Math.random() < 0.5 ? IZQ : DER; }
    }
    return;
  }

  // Comido: quedan los ojos, que vuelven solos a la madriguera.
  if (p.estado === "ojos") {
    const metaX = centroX(13), metaY = centroY(11);
    // El margen tiene que ser al menos el paso de este cuadro: los ojos van
    // rápido y si no se pasan de largo la puerta y no vuelven nunca más.
    const margen = Math.max(3, vel * dt);
    if (Math.hypot(p.x - metaX, p.y - metaY) <= margen) {
      p.x = metaX; p.y = metaY;
      p.estado = "entrando";
      return;
    }
    decidirPlaga(p, indice);
    avanzar(p, vel, dt);
    return;
  }

  // Baja al cuadro del medio a rearmarse.
  if (p.estado === "entrando") {
    p.x = centroX(13);
    p.y = Math.min(p.y + vel * dt, centroY(14));
    if (p.y >= centroY(14)) {
      p.estado = "regenerando";
      p.regenera = SEGUNDOS_REGENERA;
      p.vaiven = 0;
    }
    return;
  }

  // El rato de gracia: el bicho se rehace despacio y recién después vuelve.
  if (p.estado === "regenerando") {
    p.regenera -= dt;
    p.vaiven += dt * 3;
    p.y = centroY(14) + Math.sin(p.vaiven) * 3;
    p.animacion += dt * 8;
    if (p.regenera <= 0) {
      p.estado = "saliendo";
      p.ultimaCelda = null;
    }
    return;
  }

  decidirPlaga(p, indice);
  avanzar(p, vel, dt);
  p.animacion += dt * 8;
}

// ---------- Choques ----------
// Dentro de la madriguera no pasa nada: ni te comen ni los comés.
const A_SALVO = ["ojos", "casa", "entrando", "regenerando"];

function revisarChoques() {
  for (const p of plagas) {
    if (A_SALVO.includes(p.estado)) continue;
    if (Math.hypot(p.x - cosechador.x, p.y - cosechador.y) > 7) continue;

    if (asustadasReloj > 0 && p.estado === "normal") {
      plagasComidas++;
      sumar(200 * Math.pow(2, Math.min(plagasComidas - 1, 3)));
      p.estado = "ojos";
      p.ultimaCelda = null;
      sonar("plaga");
    } else if (p.estado === "normal") {
      escena = "muriendo";
      relojEscena = 0;
      cosechador.muerte = 0;
      sonar("muerte");
      return;
    }
  }
}

// ---------- Sonido ----------
let audio = null;
function sonar(que) {
  if (!sonidoActivo) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const notas = {
      mordisco: [[220, 0.04]],
      frutilla: [[440, 0.06], [660, 0.08]],
      plaga: [[520, 0.06], [780, 0.06], [1040, 0.1]],
      muerte: [[400, 0.12], [300, 0.12], [200, 0.16], [120, 0.25]],
      nivel: [[523, 0.1], [659, 0.1], [784, 0.16]],
      tomate: [[700, 0.07], [900, 0.1]],
    }[que];
    if (!notas) return;
    let cuando = audio.currentTime;
    for (const [frec, dur] of notas) {
      const osc = audio.createOscillator();
      const vol = audio.createGain();
      osc.type = "square";
      osc.frequency.value = frec;
      vol.gain.setValueAtTime(0.05, cuando);
      vol.gain.exponentialRampToValueAtTime(0.001, cuando + dur);
      osc.connect(vol).connect(audio.destination);
      osc.start(cuando);
      osc.stop(cuando + dur);
      cuando += dur;
    }
  } catch { /* si el navegador no deja sonar, el juego sigue igual */ }
}

// ---------- Dibujo ----------
function dibujarCentrado(img, x, y) {
  ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
}

// ---------- Tipografía de píxeles ----------
// El texto del sistema, dibujado a 8 px y después agrandado con el resto del
// lienzo, quedaba empastado e ilegible. Estas letras son mapas de píxeles de
// 5x7: se agrandan sin perder el filo, como en las recreativas.
const LETRAS = {
  A: "01110 10001 10001 11111 10001 10001 10001",
  B: "11110 10001 10001 11110 10001 10001 11110",
  C: "01110 10001 10000 10000 10000 10001 01110",
  D: "11110 10001 10001 10001 10001 10001 11110",
  E: "11111 10000 10000 11110 10000 10000 11111",
  F: "11111 10000 10000 11110 10000 10000 10000",
  G: "01110 10001 10000 10111 10001 10001 01111",
  H: "10001 10001 10001 11111 10001 10001 10001",
  I: "11111 00100 00100 00100 00100 00100 11111",
  J: "00111 00010 00010 00010 00010 10010 01100",
  K: "10001 10010 10100 11000 10100 10010 10001",
  L: "10000 10000 10000 10000 10000 10000 11111",
  M: "10001 11011 10101 10001 10001 10001 10001",
  N: "10001 11001 10101 10011 10001 10001 10001",
  O: "01110 10001 10001 10001 10001 10001 01110",
  P: "11110 10001 10001 11110 10000 10000 10000",
  Q: "01110 10001 10001 10001 10101 10010 01101",
  R: "11110 10001 10001 11110 10100 10010 10001",
  S: "01111 10000 10000 01110 00001 00001 11110",
  T: "11111 00100 00100 00100 00100 00100 00100",
  U: "10001 10001 10001 10001 10001 10001 01110",
  V: "10001 10001 10001 10001 10001 01010 00100",
  W: "10001 10001 10001 10101 10101 11011 10001",
  X: "10001 10001 01010 00100 01010 10001 10001",
  Y: "10001 10001 01010 00100 00100 00100 00100",
  Z: "11111 00001 00010 00100 01000 10000 11111",
  0: "01110 10011 10011 10101 11001 11001 01110",
  1: "00100 01100 00100 00100 00100 00100 01110",
  2: "01110 10001 00001 00010 00100 01000 11111",
  3: "11111 00010 00100 00010 00001 10001 01110",
  4: "00010 00110 01010 10010 11111 00010 00010",
  5: "11111 10000 11110 00001 00001 10001 01110",
  6: "00110 01000 10000 11110 10001 10001 01110",
  7: "11111 00001 00010 00100 01000 01000 01000",
  8: "01110 10001 10001 01110 10001 10001 01110",
  9: "01110 10001 10001 01111 00001 00010 01100",
  " ": "00000 00000 00000 00000 00000 00000 00000",
  "!": "00100 00100 00100 00100 00100 00000 00100",
  "¡": "00100 00000 00100 00100 00100 00100 00100",
  ".": "00000 00000 00000 00000 00000 01100 01100",
  ",": "00000 00000 00000 00000 01100 01100 11000",
  ":": "00000 01100 01100 00000 01100 01100 00000",
  "-": "00000 00000 00000 01110 00000 00000 00000",
  "·": "00000 00000 01100 01100 00000 00000 00000",
};

const ANCHO_LETRA = 5, ALTO_LETRA = 7, SEPARACION = 1;

// Las recreativas no tenían tildes ni minúsculas: se normaliza todo.
const aMayusculas = (txt) => String(txt)
  .normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

const anchoTexto = (txt, escala) =>
  aMayusculas(txt).length * (ANCHO_LETRA + SEPARACION) * escala - SEPARACION * escala;

function texto(txt, x, y, color = COLOR.texto, alineado = "left", escala = 1) {
  const limpio = aMayusculas(txt);
  let cursor = x;
  if (alineado === "center") cursor = Math.round(x - anchoTexto(txt, escala) / 2);
  else if (alineado === "right") cursor = Math.round(x - anchoTexto(txt, escala));

  ctx.fillStyle = color;
  for (const letra of limpio) {
    const mapa = LETRAS[letra] || LETRAS[" "];
    mapa.split(" ").forEach((fila, f) => {
      for (let c = 0; c < ANCHO_LETRA; c++) {
        if (fila[c] === "1") {
          ctx.fillRect(cursor + c * escala, y + f * escala, escala, escala);
        }
      }
    });
    cursor += (ANCHO_LETRA + SEPARACION) * escala;
  }
}

function dibujar() {
  ctx.fillStyle = COLOR.fondo;
  ctx.fillRect(0, 0, ANCHO, ALTO);

  // marcador
  texto("PUNTOS", 4, 2, "#7aa981");
  texto(String(puntaje), 4, 11, COLOR.texto);
  texto("RÉCORD", ANCHO - 4, 2, "#7aa981", "right");
  texto(String(record), ANCHO - 4, 11, COLOR.ambar, "right");

  ctx.save();
  ctx.translate(0, MARGEN_ARRIBA);

  // el laberinto parpadea al terminar el nivel
  const parpadeo = escena === "nivel" && Math.floor(relojEscena * 6) % 2 === 0;
  if (parpadeo) {
    ctx.globalAlpha = 0.35;
    ctx.drawImage(capaParedes, 0, 0);
    ctx.globalAlpha = 1;
  } else {
    ctx.drawImage(capaParedes, 0, 0);
  }

  // verduras
  for (let f = 0; f < FILAS; f++) {
    for (let c = 0; c < COLS; c++) {
      const ch = lab[f][c];
      if (ch === ".") {
        dibujarCentrado(esNabo(c, f) ? NABO : RABANITO, centroX(c), centroY(f));
      } else if (ch === "o") {
        // Late en vez de parpadear: así siempre se ve dónde están.
        const latido = 1 + Math.sin(reloj * 5) * 0.22;
        const lado = Math.round(FRUTILLA.width * latido);
        ctx.drawImage(FRUTILLA, Math.round(centroX(c) - lado / 2),
                      Math.round(centroY(f) - lado / 2), lado, lado);
      }
    }
  }

  if (tomate) dibujarCentrado(TOMATE, tomate.x, tomate.y);

  // plagas
  if (escena !== "muriendo") {
    plagas.forEach((p) => dibujarPlaga1(p));
  }

  // cosechador
  if (escena === "muriendo") {
    const abre = Math.min(cosechador.muerte * 1.6, 1);
    const img = dibujarCosechador(0.05 + abre * 3.0, cosechador.dir);
    ctx.globalAlpha = Math.max(0, 1 - cosechador.muerte * 0.55);
    dibujarCentrado(img, cosechador.x, cosechador.y);
    ctx.globalAlpha = 1;
  } else if (escena !== "fin") {
    const cuadro = escena === "listo" ? 1 : BOCAS.length - 1 - Math.abs(
      (Math.floor(cosechador.animacion) % (BOCAS.length * 2 - 2)) - (BOCAS.length - 1));
    const rumbo = cosechador.dir === IZQ ? "izq" : cosechador.dir === DER ? "der"
      : cosechador.dir === ARR ? "arr" : "aba";
    dibujarCentrado(COSECHADOR[rumbo][cuadro], cosechador.x, cosechador.y);
  }

  // carteles
  if (escena === "listo") {
    cartel(["¡A COSECHAR!"], COLOR.ambar);
  } else if (escena === "fin") {
    cartel(["SE COMIERON", "LA HUERTA"], COLOR.tomate);
    texto(`${puntaje} PUNTOS`, ANCHO / 2, centroY(17) + 16, COLOR.texto, "center");
    // El aviso recién aparece cuando ya se puede reiniciar, así nadie vuelve a
    // empezar sin querer con el dedo apoyado.
    if (puedeReiniciar()) {
      texto("TOCA PARA JUGAR DE NUEVO", ANCHO / 2, centroY(17) + 28, "#7aa981", "center");
    }
  } else if (pausado) {
    cartel(["PAUSA"], COLOR.ambar);
  }

  ctx.restore();

  // vidas y nivel
  const base = ALTO - 14;
  for (let i = 0; i < vidas - 1; i++) {
    dibujarCentrado(COSECHADOR.der[2], 12 + i * 14, base + 3);
  }
  texto("NIVEL " + nivel, ANCHO - 4, base, "#7aa981", "right");
}

// Los mensajes grandes del medio, sobre una franja oscura para que se lean
// aunque abajo haya laberinto, verduras o bichos.
function cartel(lineas, color) {
  const escala = 2;
  const alto = lineas.length * (ALTO_LETRA + 3) * escala;
  const arriba = centroY(17) - alto / 2 - 3;
  const ancho = Math.max(...lineas.map((l) => anchoTexto(l, escala))) + 14;

  ctx.fillStyle = "rgba(11, 20, 16, .85)";
  ctx.fillRect(Math.round(ANCHO / 2 - ancho / 2), arriba - 3, ancho, alto + 6);

  lineas.forEach((linea, i) => {
    texto(linea, ANCHO / 2, arriba + i * (ALTO_LETRA + 3) * escala, color, "center", escala);
  });
}

function dibujarPlaga1(p) {
  const cuadro = Math.floor(p.animacion) % 2;
  if (p.estado === "ojos" || p.estado === "entrando") {
    dibujarOjos(p, 0);
    return;
  }

  // Rearmándose: primero solo los ojos y, en los últimos 3 segundos, el cuerpo
  // que aparece y desaparece. Es el aviso de que está por salir de nuevo.
  if (p.estado === "regenerando") {
    const porSalir = p.regenera <= 3;
    if (porSalir && Math.floor(reloj * 5) % 2 === 0) {
      dibujarCentrado(p.info.dibujos[cuadro], p.x, p.y);
    } else {
      ctx.globalAlpha = porSalir ? 0.5 : 0.28;
      dibujarCentrado(p.info.dibujos[cuadro], p.x, p.y);
      ctx.globalAlpha = 1;
    }
    dibujarOjos(p, 0);
    return;
  }
  let img;
  if (asustadasReloj > 0 && p.estado === "normal") {
    const porTerminar = asustadasReloj < 2 && Math.floor(reloj * 6) % 2 === 0;
    img = (porTerminar ? PLAGA_PARPADEO : PLAGA_ASUSTADA)[cuadro];
    dibujarCentrado(img, p.x, p.y);
    dibujarOjos(p, 1);
    return;
  }
  dibujarCentrado(p.info.dibujos[cuadro], p.x, p.y);
  dibujarOjos(p, 0);
}

// Los ojos van sobre la cabeza del bicho (arriba del cuerpo) y la pupila mira
// hacia donde va, que es lo que le da la sensación de que te persigue.
function dibujarOjos(p, asustada) {
  const ojoY = Math.round(p.y - 4);
  const dx = p.dir.x, dy = p.dir.y;
  [-2, 2].forEach((lado) => {
    const ox = Math.round(p.x + lado);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(ox - 1, ojoY, 2, 2);
    ctx.fillStyle = asustada ? "#ff9bb0" : "#101828";
    ctx.fillRect(ox - 1 + (dx > 0 ? 1 : 0), ojoY + (dy > 0 ? 1 : 0), 1, 1);
  });
}

// ---------- Bucle ----------
function actualizar(dt) {
  reloj += dt;
  if (pausado) return;

  if (escena === "listo") {
    relojEscena += dt;
    if (relojEscena > 1.8) { escena = "jugando"; relojEscena = 0; }
    return;
  }

  if (escena === "fin") {
    relojEscena += dt;      // para no dejar reiniciar apenas aparece el cartel
    return;
  }

  if (escena === "muriendo") {
    relojEscena += dt;
    cosechador.muerte += dt;
    if (relojEscena > 1.8) {
      vidas--;
      relojEscena = 0;
      if (vidas <= 0) { escena = "fin"; guardarPuntaje(); }
      else { ubicarPersonajes(); escena = "listo"; }
    }
    return;
  }

  if (escena === "nivel") {
    relojEscena += dt;
    if (relojEscena > 2) {
      nivel++;
      prepararLaberinto();
      ubicarPersonajes();
      escena = "listo";
      relojEscena = 0;
      sonar("nivel");
    }
    return;
  }

  if (escena !== "jugando") return;

  // cosechador
  intentarGiro(cosechador);
  const paso = avanzar(cosechador, velCosechador(), dt);
  if (paso > 0.01) cosechador.animacion += dt * 14;
  comer();

  // tomate
  if (tomate) {
    tomate.reloj -= dt;
    if (tomate.reloj <= 0) tomate = null;
    else if (Math.hypot(tomate.x - cosechador.x, tomate.y - cosechador.y) < 7) {
      sumar(puntosTomate());
      tomate = null;
      sonar("tomate");
    }
  }

  // plagas
  if (asustadasReloj > 0) asustadasReloj = Math.max(0, asustadasReloj - dt);
  actualizarModo(dt);
  plagas.forEach((p, i) => moverPlaga(p, i, dt));

  revisarChoques();
}

let anterior = performance.now();
function bucle(ahora) {
  const dt = Math.min((ahora - anterior) / 1000, 0.05);
  anterior = ahora;
  actualizar(dt);
  dibujar();
  requestAnimationFrame(bucle);
}

// ==========================================================
// RANKING
// El juego vive en el mismo dominio que MonAgric, así que puede leer de ahí
// quién está usando el teléfono y de qué chacra es: no hay que preguntar nada.
// Los puntajes van a la planilla de esa chacra, como un registro más.
// Sin conexión (o sin MonAgric configurado) el juego anda igual y guarda el
// récord de este teléfono.
// ==========================================================

const URL_SERVICIO =
  "https://script.google.com/macros/s/AKfycbxCe17bpyv_sOsJAdkyKSr87kwpSnCBSejS4e913m6zmjxSHEuMxiKEVRVaa8uRt85O/exec";

const leerDeMonAgric = (clave, sino = null) => {
  try {
    const v = localStorage.getItem(clave);
    return v === null ? sino : JSON.parse(v);
  } catch { return sino; }
};

const servicio = () => leerDeMonAgric("monagric_script_url", "") || URL_SERVICIO;
const chacra = () => leerDeMonAgric("monagric_chacra", "");
const jugador = () => leerDeMonAgric("pacfarm_jugador", "") ||
                      leerDeMonAgric("monagric_nombre", "");
const hayEquipo = () => !!(chacra() && jugador());

let ranking = leerDeMonAgric("pacfarm_ranking", []);
let enviandoPuntaje = false;

async function guardarPuntaje() {
  const nombre = jugador();
  if (!nombre || !chacra() || puntaje <= 0 || enviandoPuntaje) return;
  enviandoPuntaje = true;
  try {
    const resp = await fetch(servicio(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        chacra: chacra(),
        registros: [{
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          tipo: "puntaje",
          datos: { jugador: nombre, puntos: puntaje, nivel: nivel, fecha: fechaDeHoy() },
          dispositivo: nombre,
        }],
      }),
    });
    const datos = await resp.json();
    if (datos.ok) await traerRanking();
  } catch { /* sin señal: queda el récord de este teléfono */ }
  enviandoPuntaje = false;
  pintarRanking();
}

async function traerRanking() {
  if (!chacra() || !navigator.onLine) return;
  try {
    const r = await fetch(`${servicio()}?ranking=1&chacra=${encodeURIComponent(chacra())}`);
    const d = await r.json();
    if (Array.isArray(d.ranking)) {
      ranking = d.ranking;
      localStorage.setItem("pacfarm_ranking", JSON.stringify(ranking));
    }
  } catch { /* se sigue mostrando el último que se bajó */ }
}

function fechaDeHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function pintarRanking() {
  const caja = document.getElementById("tabla-ranking");
  if (!caja) return;
  const yo = jugador();

  if (!hayEquipo()) {
    caja.innerHTML = `<p class="vacio">Tu récord en este teléfono:
      <b>${record}</b> puntos.<br>Para competir con el equipo, abrí el juego
      desde MonAgric y elegí tu nombre.</p>`;
    return;
  }
  if (!ranking.length) {
    caja.innerHTML = `<p class="vacio">Todavía no hay partidas cargadas.
      ¡Jugá una y estrenás la tabla!</p>`;
    return;
  }
  caja.innerHTML = ranking.map((r, i) => `
    <div class="puesto${r.jugador === yo ? " yo" : ""}">
      <span class="n">${i + 1}</span>
      <span class="quien">${r.jugador}</span>
      <span class="datos">nivel ${r.nivel} · ${r.partidas} partida${r.partidas > 1 ? "s" : ""}</span>
      <span class="pts">${r.puntos}</span>
    </div>`).join("");
}

// ---------- Controles ----------
// Girar NUNCA reinicia la partida. Antes sí lo hacía, y como el dedo queda
// apoyado en el joystick, al perder la última vida el menor temblor volvía a
// empezar sin que se llegara a ver el cartel de fin: parecía que el juego se
// reiniciaba solo.
function girar(dir) {
  if (escena === "fin") return;
  cosechador.dirDeseada = dir;
  if (audio && audio.state === "suspended") audio.resume();
}

// Para volver a jugar hace falta un toque nuevo y a propósito, y recién después
// de que el cartel estuvo un rato en pantalla.
const ESPERA_FIN = 1.5;
const puedeReiniciar = () => escena === "fin" && relojEscena > ESPERA_FIN;

function intentarReiniciar() {
  if (puedeReiniciar()) reiniciar();
}

const TECLAS = {
  ArrowLeft: IZQ, ArrowRight: DER, ArrowUp: ARR, ArrowDown: ABA,
  a: IZQ, d: DER, w: ARR, s: ABA, A: IZQ, D: DER, W: ARR, S: ABA,
};

document.addEventListener("keydown", (e) => {
  const dir = TECLAS[e.key];
  if (dir) { e.preventDefault(); girar(dir); return; }
  if (e.key === "p" || e.key === "P") alternarPausa();
  if (e.key === "Enter") intentarReiniciar();
});

// ---------- El joystick ----------
// Se apoya el dedo en cualquier parte de la rueda y se lo desliza hacia donde
// se quiere ir: la bola lo sigue y el cosechador gira apenas puede. Con un solo
// dedo se juega toda la partida, sin levantarlo entre giro y giro.
const rueda = document.getElementById("rueda");
const perilla = document.getElementById("perilla");
const flechas = {
  arriba: rueda.querySelector(".arriba"), abajo: rueda.querySelector(".abajo"),
  izquierda: rueda.querySelector(".izquierda"), derecha: rueda.querySelector(".derecha"),
};
const NOMBRE_DIR = new Map([[ARR, "arriba"], [ABA, "abajo"], [IZQ, "izquierda"], [DER, "derecha"]]);

let dedoEnRueda = false;

function marcarFlecha(dir) {
  const cual = dir ? NOMBRE_DIR.get(dir) : null;
  Object.entries(flechas).forEach(([n, el]) => el.classList.toggle("activa", n === cual));
}

function moverPerilla(dx, dy) {
  perilla.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

function usarRueda(ev) {
  const caja = rueda.getBoundingClientRect();
  if (!caja.width) return;                 // la rueda está oculta: no hay nada que mover
  const cx = caja.left + caja.width / 2, cy = caja.top + caja.height / 2;
  let dx = ev.clientX - cx, dy = ev.clientY - cy;

  // la bola no se sale de la base
  const dist = Math.hypot(dx, dy);
  const tope = Math.max(caja.width / 2 - 34, 12);
  if (dist > tope) { dx *= tope / dist; dy *= tope / dist; }
  moverPerilla(dx, dy);

  if (dist < 14) { marcarFlecha(null); return; }   // en el centro no se gira
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DER : IZQ) : (dy > 0 ? ABA : ARR);
  marcarFlecha(dir);
  girar(dir);
}

rueda.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  dedoEnRueda = true;
  rueda.setPointerCapture(e.pointerId);
  intentarReiniciar();      // solo al apoyar el dedo, nunca al deslizarlo
  usarRueda(e);
});
rueda.addEventListener("pointermove", (e) => { if (dedoEnRueda) usarRueda(e); });
["pointerup", "pointercancel", "lostpointercapture"].forEach((evento) => {
  rueda.addEventListener(evento, () => {
    dedoEnRueda = false;
    moverPerilla(0, 0);       // la bola vuelve sola al centro, como las de arcade
    marcarFlecha(null);
  });
});

// deslizar el dedo sobre el tablero
// ---------- Los botones de los pulgares ----------
// La alternativa al joystick: arriba/abajo de un lado, izquierda/derecha del
// otro. Se mantienen apretados sin problema porque girar() no reinicia nada.
const DIR_POR_NOMBRE = { arriba: ARR, abajo: ABA, izquierda: IZQ, derecha: DER };

document.querySelectorAll(".tecla").forEach((b) => {
  const dir = DIR_POR_NOMBRE[b.dataset.dir];
  const apretar = (ev) => {
    ev.preventDefault();
    b.classList.add("activa");
    intentarReiniciar();
    girar(dir);
  };
  const soltar = () => b.classList.remove("activa");
  b.addEventListener("pointerdown", apretar);
  ["pointerup", "pointercancel", "pointerleave"].forEach((e) => b.addEventListener(e, soltar));
});

let toqueX = 0, toqueY = 0;
pantalla.addEventListener("touchstart", (e) => {
  toqueX = e.touches[0].clientX; toqueY = e.touches[0].clientY;
  intentarReiniciar();
}, { passive: true });
pantalla.addEventListener("touchend", (e) => {
  const t = e.changedTouches[0];
  const dx = t.clientX - toqueX, dy = t.clientY - toqueY;
  if (Math.hypot(dx, dy) < 18) return;
  girar(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DER : IZQ) : (dy > 0 ? ABA : ARR));
}, { passive: true });

function alternarPausa() {
  if (escena === "fin") return;
  pausado = !pausado;
  document.getElementById("btn-pausa").textContent = pausado ? "Seguir" : "Pausa";
}

document.getElementById("btn-ranking").addEventListener("click", async () => {
  const panel = document.getElementById("ranking");
  panel.hidden = !panel.hidden;
  if (!panel.hidden) {
    pintarRanking();
    await traerRanking();     // se refresca por si alguien jugó en otro teléfono
    pintarRanking();
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
});

document.getElementById("btn-pausa").addEventListener("click", alternarPausa);
document.getElementById("btn-sonido").addEventListener("click", (e) => {
  sonidoActivo = !sonidoActivo;
  e.target.textContent = "Sonido: " + (sonidoActivo ? "sí" : "no");
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && escena === "jugando") { pausado = true; }
});

// ---------- Tamaño de la pantalla ----------
function ajustarTamano() {
  const tactil = window.matchMedia("(pointer: coarse)").matches;
  const anchoDisponible = Math.min(window.innerWidth - 20, 620);
  // En el celular hay que dejarle lugar al joystick, que es grande a propósito:
  // con el dedo apoyado se juega mejor que con botones chicos.
  const altoDisponible = window.innerHeight - (tactil ? 250 : 115);
  let escala = Math.min(anchoDisponible / ANCHO, altoDisponible / ALTO);

  // De 2x para arriba conviene una escala entera: cada píxel del dibujo ocupa
  // la misma cantidad de píxeles de pantalla y no se deforma nada. Abajo de 2x
  // se usa la escala justa, porque si no el tablero queda diminuto en el celular.
  if (escala >= 2) escala = Math.floor(escala);
  escala = Math.max(1, escala);

  pantalla.style.width = Math.round(ANCHO * escala) + "px";
  pantalla.style.height = Math.round(ALTO * escala) + "px";
}
window.addEventListener("resize", ajustarTamano);

// ---------- Arranque ----------
function reiniciar() {
  puntaje = 0; vidas = 3; nivel = 1;
  prepararLaberinto();
  ubicarPersonajes();
  escena = "listo";
  relojEscena = 0;
  pausado = false;
}

reiniciar();
ajustarTamano();
pintarRanking();
traerRanking().then(pintarRanking);
requestAnimationFrame(bucle);

