# Arquitectura de AMA — revisión del 30/09/2026

Revisión hecha como quien entra a un código que no conoce: primero cómo está
armado y por dónde viajan los datos, después dónde duele, y al final qué se
cambió ya y qué conviene cambiar, en qué orden. Complementa a `CLAUDE.md`
(reglas) y `DECISIONES.md` (por qué).

**Lo que se cambió en esta revisión no altera ninguna función:** se partió
`app.js` en 17 archivos por tema (mismas líneas, verificado), se sumó una
página de pruebas (`docs/pruebas.html`, 23 pruebas en verde) y `escribir()`
dejó de romper si el almacenamiento del teléfono se llena. Todo lo demás está
propuesto abajo, con el código, para hacerlo de a un paso.

---

## 1. El mapa

```
                        ┌──────────────────────────────┐
  teléfonos (12)        │  AMA Producción (PWA)        │  GitHub Pages /docs
  y notebook ──────────►│  docs/js/*.js · sw.js        │  red primero, caché
                        │  localStorage monagric_*     │  de respaldo
                        └──────┬───────────────┬───────┘
             GET ?x=1 (lee)    │               │ POST {registros:[...]}
             con credencial    │               │ (cola del teléfono)
                        ┌──────▼───────────────▼───────┐
                        │  Code.gs (Apps Script)       │  vive dentro de la
                        │  un servicio, 6 chacras      │  planilla de Tica
                        └──┬─────────┬─────────┬───────┘
          SpreadsheetApp   │         │         │ UrlFetchApp (servidor a servidor)
       ┌───────────────────▼┐  ┌─────▼──────┐  ├──────────────► Cuentas.gs / Economia.gs
       │ planilla por chacra │  │ Accesos    │  │                (solo lectura, Bioma)
       │ Config, Siembras,   │  │ Invitac.,  │  └◄────────────── bioma-db Code.gs
       │ Trasplantes, Cos.,  │  │ Dispositiv.│    ?proyeccion   (AMA Economía pide el plan)
       │ Tareas, Plan gen.,  │  └────────────┘
       │ Horas, Cambios      │
       └─────────────────────┘
  Horas de Tica: viajan con todo lo demás a Code.gs, que las escribe en la
  planilla de horas de Bioma (desde el 30/09; antes, POST directo y sin
  credencial a Codigo-horas-bioma.gs, cuya URL estaba en el código público)
```

**AMA Economía (bioma-mov)** es otra PWA con el mismo patrón, pero su
sincronización es distinta: manda y recibe el estado **completo** en cada
sincronización y el servidor reescribe las hojas enteras (ver 3.7).

### 1.1 El frontend de AMA Producción, archivo por archivo

Se cargan en este orden con `<script>` clásicos (no módulos) y comparten el
espacio global. El orden importa solo para lo que se evalúa al cargar
(constantes y el arranque); las funciones se llaman recién después.

| Archivo | Qué tiene | Líneas |
|---|---|---|
| `base.js` | constantes, `LS` + `leer`/`escribir`, **estado global**, acceso, fechas y texto | ~280 |
| `catalogo.js` | catálogo y perfiles, días de almácigo, sectores, áreas, integrantes, plan por cultivo | ~230 |
| `servicio.js` | cola y `sincronizar`, todos los `traer*`, overlay de la cola sobre el plan | ~420 |
| `componentes.js` | buscadores, selects, colores por cultivo, tarjetas de estado | ~310 |
| `pendientes.js` | "Para sembrar" / "Para trasplantar", bandejas del plan | ~270 |
| `plan-grafico.js` | plan estratégico (`tramosDe`), panel, arrastrar fechas, barra de Plan | ~530 |
| `plan-mapa.js` | lienzo del mapa, zoom, arrastres | ~575 |
| `plan-cultivos.js` | alta de series, editor de generaciones, partir, marco y rinde | ~620 |
| `ficha.js` | ficha del cultivo | ~165 |
| `registros.js` | últimos movimientos, corregir y borrar | ~300 |
| `cuentas.js` · `tareas.js` · `configuracion.js` | cada sección | ~230 · 185 · 270 |
| `formularios.js` | `preparar*` de siembras, trasplantes, cosechas, horas, ajustes | ~630 |
| `vistas.js` | `plantillas`: el HTML de cada sección | ~960 |
| `render.js` | `render`, `redibujarConDatos`, enganches comunes | ~290 |
| `arranque.js` | arranque | ~30 |

### 1.2 El ciclo de una pantalla

```
render(vista)
  ├─ plantillas[vista]()  → HTML completo como texto (lee CFG, LS, estado global)
  ├─ #vista.innerHTML = …   (se tira el DOM anterior entero)
  ├─ scroll: arriba, o donde estaba si conservarScroll (y los scroll propios)
  ├─ preparar<Vista>()    → engancha eventos del formulario de esa sección
  ├─ prepararComunes() / prepararCorrecciones() / enganches sueltos en render
  └─ traer*() de lo que esa vista necesita (con guardas de 20 s)
            └─ al volver: guarda en LS; si cambió → redibujarConDatos(vista)
```

### 1.3 El viaje de un dato (una siembra)

```
formulario → datos → guardarRegistro("siembras", datos)
   → pendientes[] (memoria) + LS.pendientes  → aviso → sincronizar()
sincronizar():
   1. todo, también las horas de Tica: POST {credencial, registros} a Code.gs
      Code.gs: permitido() → lock → por tipo: upsert/append en la hoja
      → respuesta {guardados, no_guardados[]}
   3. lo guardado pasa a `enviados`; lo fallido queda en la cola
   4. traerUltimos(tipo) + traerAlmacigos/traerGeneraciones según el tipo
   5. traerResumen, traerDatosHoras, traerTareas, traerConfig, traerCatalogo
   6. redibujarConDatos(vistaActual)
```

Lo que se muestra mientras tanto sale de copias locales: `LS.ultimos` (15
filas por hoja), `LS.generaciones` (el plan entero, con la cola aplicada
encima por `conPendientesDelPlan`), `LS.config`, `LS.almacigos`.

---

## 2. Zonas críticas (de más a menos grave)

| # | Zona | Por qué es crítica | Estado |
|---|---|---|---|
| 1 | **La configuración se guarda entera** (`guardarConfig`) | Cada guardado reescribe la hoja Config completa con la copia del teléfono. Desde que el plan se edita seguido (cada generación rehace el plan del cultivo), dos teléfonos editando a la vez pueden pisarse: gana el último **entero**, no por cultivo. 12 lugares llaman a `guardarConfig`. | **resuelto 30/09** (4.3): el plan de un cultivo y la posición de un sector viajan sueltos |
| 2 | **Script de horas de Tica abierto** | Su URL está en el código público y escribe filas de horas, de donde salen los sueldos. Ya anotado en PENDIENTES 0 bis. | **resuelto en código 30/09**: entran por `Code.gs` con credencial; falta archivar la implementación del script |
| 3 | **Normalizadores de nombres distintos** | Cuatro reglas para "¿es el mismo cultivo?": `claveArea` de la app (saca tildes y la "s" final), `claveArea` del servidor (igual, a mano), `claveNombre` del servidor (**no** saca la "s"), `formaComparable` en Economía, `clave()` en cada herramienta. El cruce siembra↔plan del servidor usa `claveNombre`: una siembra de "Choclo" no marcaría sembrada una generación de "Choclos", y la app sí los junta. | **resuelto 01/10** (4.1): `claveCultivo` en el servidor, igual a la app |
| 4 | **El esquema de las hojas está escrito en varios lados** | Los encabezados viven en `HOJAS` (servidor) y se repiten como texto en la app (`DE_LA_HOJA`, `filaEquipo`, `almacigosPendientes`) y en las herramientas. Renombrar una columna rompe la app en silencio. | **resuelto 01/10** (4.2): el esquema viaja con la config; la app avisa, la herramienta revisa las planillas |
| 5 | **Redibujar todo con `innerHTML`** | Es la causa de raíz de los saltos de pantalla y los formularios borrados (28/09). Se emparchó bien (`redibujarConDatos`, `campoTocado`, scroll propio), pero cada pantalla nueva con estado propio puede volver a caer. | **resuelto 01/10 en las secciones con formulario**: se actualizan por partes; Plan sigue entero (4.5) |
| 6 | **Estado global suelto** | 35 variables `let` de nivel superior, mezcla de datos (`CFG`, `pendientes`) y de interfaz (`genEditando`, `vistaMapa`…), cualquiera las toca desde cualquier archivo. | propuesta 4.5 |
| 7 | **El servidor lee hojas enteras por pedido** | `generacionesDelPlan` recorre Siembras en cada pedido; `fichaDeCultivo` tres hojas; `permitido()` abre la planilla de accesos y lee todos los dispositivos **en cada pedido**. | **mejorado 01/10**: acceso 2 min y plan/almácigos 5 min en caché; la ficha sigue leyendo |
| 8 | **Muchos viajes al arrancar** | `iniciar` pide config y catálogo, y `sincronizar` los vuelve a pedir (duplicados), más resumen, tareas, horas, generaciones, últimos: 8 a 10 ejecuciones de Apps Script, cada una con su `permitido()`. | **mejorado 01/10**: sin duplicados (5 pedidos al abrir); falta `?inicio=1` |
| 9 | **Sin versión de protocolo en AMA** | Economía usa `api: N` y descarta respuestas viejas; AMA usa banderas sueltas (`cuentas`, `corregir`). Una implementación vieja no se detecta sola. | propuesta 4.7 |
| 10 | **El servidor vive en la planilla de Tica** | Si esa planilla se rompe o se comparte mal, se caen las seis chacras. | PENDIENTES |

## 3. Duplicaciones y cuellos de botella, con dónde están

**3.1 Plan por cultivo recalculado en cuatro lados.** `prepararGeneraciones`
(alta, en `plan-cultivos.js`) hace su propia cuenta; `replanearCultivo`
(`catalogo.js`) la otra; el formulario de Marco y rinde la dispara;
`tools/plan_desde_generaciones.py` la repite en Python. Las cuatro dan lo
mismo hoy, pero cualquier cambio de regla hay que hacerlo cuatro veces.

**3.2 Dos funciones de plantas.** `plantasDe` (bancales × líneas × largo/distancia)
y `plantasPorBancal` (con tresbolillo +15 %). Se usan en lugares distintos y no
se sabe a simple vista cuál corresponde.

**3.3 Fechas en el servidor.** La misma clausura `texto = v instanceof Date ?
formatDate(...) : String(v)` está copiada 9 veces en `Code.gs`.

**3.4 Lock de 20 s para todo el POST.** Un lote de 20 registros bloquea a los
demás teléfonos mientras dura. Con 12 teléfonos no se nota; con la gente del
verano cargando al mismo tiempo al final de la jornada, puede.

**3.5 Crecimiento sin techo en el teléfono.** `LS.fichas` guarda una ficha por
cultivo abierto (con todas sus siembras y cosechas) y no se poda nunca. Ahora
`escribir` ya no rompe si se llena, pero conviene podar.

**3.6 `render()` hace de todo.** Además de dibujar, engancha a mano ~15 cosas
de secciones distintas (fichas, plan, sembrar, trasplantar, Inicio). Es el
lugar donde más fácil es romper algo al agregar una pantalla.

**3.7 AMA Economía reescribe todo en cada sincronización.** La app manda todos
los movimientos, deudas, productos y las últimas 300 ventas; el servidor lee
todas las hojas, fusiona, y **borra y reescribe** ingresos, egresos, deudas,
productos, ventas, borrados y conceptos, más el flujo y los gráficos. El costo
crece con cada venta. (El 28/09 se arregló que además repitiera las
migraciones en cada pedido.)

---

## 4. Estrategia de refactorización, en pasos que se pueden verificar

Cada paso deja la app igual por fuera y se prueba con `docs/pruebas.html` más
el recorrido en el navegador. Ninguno depende del siguiente.

### Hecho en esta revisión (paso 0)

- **`app.js` → 17 archivos por tema** (`docs/js/`). Un script movió bloques
  enteros (declaración + sus comentarios) y verificó que el multiconjunto de
  líneas fuera idéntico: 6.267 antes y después. Se comprobó que nada de nivel
  superior se ejecuta al cargar salvo `leer`/`LS` (en `base.js`) y el
  arranque (último). Probado: las 14 pantallas sin errores y los flujos de
  sembrar, trasplantar, correr una barra, ubicar en el mapa, partir, corregir,
  tildar tarea, horas.
- **`docs/pruebas.html`**: carga el mismo código sin el arranque y comprueba
  23 cuentas con casos conocidos (etapas de una generación, días por
  estación, plantas, bandejas, nombres de partes, cola sobre el plan, choques
  en el mapa, corrección de un registro). No escribe en el teléfono ni sale a
  la red. **Abrirla antes de publicar.**
- **`escribir()` resistente**: si el almacenamiento se llena, avisa una vez y
  sigue, en vez de cortar lo que se estaba guardando.

### 4.1 Una sola regla de "mismo cultivo" — HECHO 01/10

Aplicado: `claveCultivo` en `Code.gs` (y `claveArea` la llama). Reemplaza a
`claveNombre` en el cruce siembra↔plan, la ficha, la proyección, el catálogo
aportado y el plan por partes. `claveNombre` quedó solo para personas.
`tools/plan_desde_generaciones.py` también saca la "s". `formaComparable` de
Economía **no** se tocó a propósito: no decide si dos cultivos son el mismo
sino si un producto ("Lechuga mantecosa x kg") corresponde a un cultivo, por
palabras. Prueba en `pruebas.html`.

La propuesta original:

Una función, igual en los tres lados, con prueba. La de la app es la más
completa (tildes por Unicode, "s" final):

```js
// app (catalogo.js) — ya es así
const claveArea = (n) => String(n || "").trim().toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/s$/, "");
```
```js
// Code.gs — reemplaza a claveArea y claveNombre (hoy distintas)
function claveCultivo(n) {
  return String(n || "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/s$/, "");
}
```
**Ojo antes de aplicarlo:** `claveNombre` también compara **personas** (Luqui,
Marto) y tarifas. Para personas no conviene sacar la "s" final ("Andrés" y
"Andre"). Así que: `claveCultivo` para cultivos, `claveNombre` queda para
personas, y el cruce de siembras en `generacionesDelPlan` pasa a
`claveCultivo`. Es el único cambio con efecto visible: siembras cargadas con
singular/plural distinto del plan empezarían a cruzar bien.

### 4.2 El esquema en un solo lugar — HECHO 01/10

Aplicado: la configuración trae `esquema` (los encabezados de `HOJAS`); la app
compara con `DE_LA_HOJA` (`columnasQueFaltan`) y avisa una vez si falta una.
`tools/version_servicio.py` hace la misma comparación y además pide
`?columnas=1` (solo admin) para cada chacra: la fila 1 de cada hoja contra lo
que el código espera. Eso cubre el riesgo más serio, que no estaba en la
propuesta: **el servidor lee y escribe por posición**, así que una columna
insertada a mano en la planilla corre todos los datos sin error. Por ahora
solo se detecta; frenar la escritura cuando no coinciden queda para cuando se
vea el estado real de las seis planillas (las viejas pueden tener nombres
anteriores, como "Proyecto" en vez de "Área", y frenarlas sería peor).

La propuesta original:

El servidor ya tiene `HOJAS` con los encabezados. Que los mande en la
configuración y que la app lea por nombre interno, no por texto:

```js
// Code.gs, en la respuesta de ?config=1
cfg.esquema = {};
Object.keys(HOJAS).forEach(function (k) { cfg.esquema[k] = HOJAS[k].encabezados; });
```
Y un chequeo en `tools/version_servicio.py` que compare esos encabezados con
los que usa la app (`DE_LA_HOJA` en `registros.js`): si alguien renombra una
columna, la herramienta lo dice antes de que se rompa en un teléfono.

### 4.3 Guardar la configuración por partes (la zona crítica #1) — HECHO 30/09

Aplicado así: `config_plan` (`cambiarPlanDeCultivo`) y `config_sector`
(`cambiarPosicionDeSector`, solo fila y columna) en `Code.gs`; la
configuración anuncia `parcial: true`. En la app, `guardarPartesDeConfig`
(servicio.js) lo usan `replanearCultivo`, el alta de series y mover un sector
en el mapa; contra un servicio anterior, o con una configuración entera en la
cola, guarda entera como antes. `conPendientesDeConfig` aplica lo que sigue en
la cola sobre lo que devuelve el servicio. La pantalla Configuración sigue
guardando entera: es rara y deliberada. Por ahora usa `claveArea` del
servidor; cuando exista `claveCultivo` (4.1), pasa a esa.

La propuesta original:

```js
// Code.gs — tipo nuevo en doPost
else if (r.tipo === "config_plan") { guardarPlanDeCultivo(libro, r.datos); guardados++; }

function guardarPlanDeCultivo(libro, p) {
  var hoja = hojaConfig(libro);
  var n = hoja.getLastRow();
  var filas = n > 1 ? hoja.getRange(2, 1, n - 1, 2).getValues() : [];
  var fila = [ "plan", p.cultivo, p.superficie_m2 || 0, p.cosecha_esperada_kg || 0,
               p.rinde_kg_m2 || 0, p.lineas || 0, p.distancia_cm || 0, p.plantas || 0 ];
  for (var i = 0; i < filas.length; i++) {
    if (filas[i][0] === "plan" && claveCultivo(filas[i][1]) === claveCultivo(p.cultivo)) {
      if (p.borrar) hoja.deleteRow(i + 2); else hoja.getRange(i + 2, 1, 1, CONFIG_COLS).setValues([fila]);
      return;
    }
  }
  if (!p.borrar) hoja.getRange(n + 1, 1, 1, CONFIG_COLS).setValues([fila]);
}
```
Y en la app, `replanearCultivo` manda `config_plan` con ese cultivo en lugar
de la configuración entera. Los sectores (el mapa) pueden seguir el mismo
camino con `config_sector`. Con eso, dos personas editando cultivos distintos
no se pisan.

### 4.4 Menos viajes y menos lecturas en el servidor — a), c) y parte de b) HECHOS 01/10

Aplicado: `permitido` recuerda los "sí" 2 minutos (y `marcarActividad`
confirma la huella antes de escribir, por si la fila se corrió); el plan y los
almacigos se recuerdan 5 minutos por chacra (`recordado_`) y `doPost` los
olvida al llegar siembras, trasplantes, generaciones o correcciones; la app ya
no pide configuración y catálogo dos veces al abrir (5 pedidos en vez de 7).
Falta `?inicio=1` (todo en un pedido) y las fechas (d).

La propuesta original:

**a) Recordar el acceso unos minutos.** Hoy cada pedido abre la planilla de
accesos y lee todos los dispositivos:

```js
function permitido(chacra, credencial, dispositivo) {
  if (!credencial) return rechazo("Este teléfono todavía no tiene acceso.");
  var cache = CacheService.getScriptCache();
  var llave = "acceso_" + huella(credencial) + "_" + String(chacra).toLowerCase();
  var guardado = cache.get(llave);
  if (guardado) return JSON.parse(guardado);
  var r = permitidoSinCache_(chacra, credencial, dispositivo);   // la de hoy
  if (r.ok) cache.put(llave, JSON.stringify(r), 120);            // solo los sí, 2 minutos
  return r;
}
```
Consecuencia a aceptar: dar de baja un teléfono tarda hasta 2 minutos en
aplicarse. Los rechazos no se guardan, así que un teléfono nuevo entra en el
acto.

**b) Un solo pedido al abrir la app.** `?inicio=1` que devuelva juntos
config, resumen, tareas, generaciones y almácigos en una ejecución; la app lo
usa si el servicio lo tiene y si no cae a los pedidos de hoy. Y sacar el
pedido duplicado de config y catálogo del arranque (`iniciar` y `sincronizar`
los piden los dos).

**c) Plan en caché.** `generacionesDelPlan` con `CacheService` por chacra (5
minutos), borrado en `guardarGeneracion`, `borrarGeneracion` y cada siembra
nueva. Es lo que más se pide (Inicio, Plan, Proyección de Economía).

**d) Fechas.** Un solo `textoFecha_(v, tz)` en lugar de las 9 copias.

### 4.5 Estado y dibujo (lo más grande; hacerlo por sección) — primer paso HECHO 01/10

Aplicado: **partes**. En las plantillas de Inicio, Siembras, Trasplantes,
Cosechas, Horas y Tareas, lo que depende de datos del servicio (listas,
contadores, opciones de un desplegable) se marca con `parte(nombre, html)`
(componentes.js) o `data-parte`. Cuando llegan datos, `redibujarConDatos` va
a `actualizarPartes` (render.js): arma la plantilla aparte, reemplaza solo las
partes que cambiaron y vuelve a enganchar sus botones (`engancharPartes`, todo
por propiedad, repetible). Los formularios no se tocan nunca, se estén
llenando o no. Un desplegable marcado `data-parte-modo="opciones"` cambia sus
opciones y conserva lo elegido. Una parte con foco o donde se escribió no se
reemplaza. Si la sección cambió de forma (otra cantidad de partes), se
redibuja entera como antes.

Arregló un error real: completar el formulario desde "Para sembrar" no cuenta
como tocarlo, y la lista de últimos movimientos, al llegar segundos después,
lo dejaba en blanco. Pruebas en `pruebas.html`.

**Regla para pantallas nuevas:** todo lo que muestre datos del servicio va en
una parte; el formulario, afuera.

**Plan (01/10).** Cultivos (la única de Plan con formulario) va por partes; la
lista de la derecha es una parte de *contenido* (`data-parte-modo="contenido"`:
cambia lo de adentro y la caja, con su scroll, queda). El gráfico, el mapa,
el resumen y la ficha son dibujos hechos con los datos, sin campos de texto:
se siguen redibujando enteros, pero `redibujarConDatos` no los toca si lo que
llegó da el mismo HTML, ni mientras hay algo agarrado (`arrastrandoAlgo`), y
los desplegables se recuerdan con `data-recordar`. Se arreglaron, todos
reproducidos antes y probados después: el arrastre de una barra se cortaba si
terminaba una sincronización; "+ Generaciones" quedaba en blanco al llegar
datos; los grupos de "Sin ubicar" del mapa se cerraban; la primera vez que se
abría el plan estratégico las barras no respondían (un render anidado
enganchaba el clic dos veces: ver `numeroDeRender`); y la numeración de una
serie nueva salía de la copia del momento de dibujar.

**La cola (01/10).** Una sola sincronización a la vez (`sincronizar` anota
"otra" si hay una en curso). Y se manda una copia de la cola: del 30/09 al
01/10 se mandó la cola misma, y lo guardado durante un envío salía de la cola
sin haber viajado. Hay una prueba en `pruebas.html` que lo detecta.

Falta agrupar el estado de interfaz en objetos por sección.

La propuesta original:

- Agrupar el estado de interfaz en un objeto por sección
  (`ui.plan = { vista, orden, filtro, genPanel, … }`) en vez de 35 variables
  sueltas. Es mecánico y se hace de a un archivo.
- Sacar de `render()` los enganches de cada sección y ponerlos en su
  `preparar*`. `render` queda en dibujar + scroll + `preparar[vista]()`.
- Para las listas largas (plan estratégico, historial), redibujar solo la
  lista y no la sección entera. Es lo que termina con los parches de scroll.

### 4.6 Seguridad e infraestructura (ya en PENDIENTES)

Horas de Tica por el servicio de AMA — **hecho 30/09** (`escribirHorasDeTica`,
con columna "Cargado por"; la app usa el camino viejo si el servicio no
anuncia `horas_por_servicio`). El Web App del script de horas se archivó el
mismo día y la app ya no tiene su dirección ni el camino viejo.
`Code.gs` a un proyecto propio; identificadores por persona en vez del nombre.

### 4.7 Versión de protocolo en AMA

Que el servicio responda `api: N` en cada respuesta (como Economía) y la app
avise "el servicio corre una versión anterior" en vez de depender de banderas
sueltas como `corregir`.

### 4.8 AMA Economía: sincronización por cambios

Mandar solo lo modificado desde la última sincronización (por `mod`) y que el
servidor haga upsert por id en lugar de borrar y reescribir las hojas. La
fusión por `mod` y las tumbas ya están; falta dejar de reescribir todo.

---

## 5. Cómo trabajar con esto

- Un archivo nuevo en `docs/js/` va en **tres** lugares: `index.html`,
  `sw.js` (lista `ARCHIVOS`) y `pruebas.html`, en el mismo orden.
- Una función que se usa al cargar (en el inicializador de una constante) tiene
  que estar en un archivo anterior. Hoy solo `leer` y `LS` cumplen ese papel.
- Antes de publicar: `docs/pruebas.html` en verde y el recorrido en el
  navegador. Si se agrega una cuenta nueva (bandejas, fechas, kilos), sumarle
  una prueba.
