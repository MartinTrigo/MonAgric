# AMA · App de Monitoreo Agrícola Agroecológico — contexto del proyecto

Se lee solo al abrir el proyecto. Es la memoria: qué es esto, cómo está hecho,
qué se decidió y qué errores ya cometimos. Antes de proponer cambios, leer
también `PENDIENTES.md` (dónde quedamos) y `DECISIONES.md` (por qué las cosas
son como son).

## Qué es

App de monitoreo productivo para emprendimientos agroecológicos, usada por
**cinco chacras de la Comarca Andina**: Chacra Tica, Huerma, Foco Verde,
La Milpa y La Huertota. Cada una tiene su planilla, su configuración y su
gente; comparten el catálogo de cultivos y las áreas de trabajo.

- **App publicada:** <https://martintrigo.github.io/MonAgric/>
- **Repositorio: PÚBLICO**, AGPL-3.0. Nunca subir URLs de Web App ni claves.
- **El nombre es AMA · Aplicaciones para el Manejo Agroecológico** (28/9/2026),
  con tres versiones: **AMA Producción** (esta), **AMA Economía** (bioma-mov) y
  **AMA Salud** (a futuro). La carpeta, el repositorio y las claves internas
  siguen siendo `monagric`: renombrarlas le borraría a cada teléfono su
  credencial y lo que tenga sin enviar. **No tocar.**

## El ecosistema

| Proyecto | Qué hace | Relación |
|---|---|---|
| **AMA** (esta) | Producción: siembras, trasplantes, cosechas, tareas, horas | — |
| **Bioma/movimientos** (`bioma-mov`) | Economía de Proyecto Bioma | Calcula las cuentas y el resumen que AMA muestra |
| **Bioma/registro-horas** | Planilla histórica de horas | Tica sigue cargando ahí |
| **Cocina Viva** | Ventas y stock de fermentos | Misma arquitectura, más madura |

**Las dos apps se gestionan desde la misma conversación** (desde el 15/9/2026).
Antes eran dos y había que llevar mensajes entre ellas. El contexto de
bioma-mov está en `C:\MARTO\INFORMATICA\Bioma\movimientos\CLAUDE.md`, que es
tan importante como este archivo: leerlo antes de tocar economía.

## Arquitectura

PWA en HTML + CSS + JavaScript puro. **Sin frameworks, sin compilación.**

```
docs/index.html     las pantallas, la barra de secciones y los <script> en orden
docs/styles.css     estilo
docs/js/*.js        el frontend, 17 archivos por tema (antes un app.js de 6.200
                    líneas; se partió el 30/09 sin cambiar código). Ver
                    ARQUITECTURA.md: qué hay en cada uno y el orden de carga
docs/pruebas.html   pruebas de las cuentas (etapas, plantas, bandejas, cola…):
                    abrirla antes de publicar, tiene que dar todo en verde
docs/sw.js          service worker: red primero, caché de respaldo
docs/catalogo.json  cultivos y perfiles, iguales para todas las chacras
docs/juego/         Pac-Farm, el juego
apps-script/Code.gs            el "servidor" de las cinco chacras
apps-script/Codigo-horas-bioma.gs  script aparte, vive en la planilla de horas
                    (Web App archivado el 30/09: Code.gs escribe esas horas)
tools/*.py          herramientas de administración (usan clave de admin)
```

**Dónde vive el servidor:** `Code.gs` está dentro de la planilla
**MonAgric Datos 2026-27** (que es también la de Chacra Tica), en Extensiones →
Apps Script. Atiende a las cinco chacras. Es una fragilidad conocida: si esa
planilla se rompe, se cae la app para todos. Mover el script a un proyecto
propio está pendiente y no es urgente.

**Publicación:** GitHub Pages sirve desde `/docs`. Cada push publica. Al
cambiar archivos hay que subir `CACHE` en `sw.js` y `VERSION_APP` en
`js/base.js`. Un archivo nuevo en `docs/js/` va en `index.html`, en la lista
`ARCHIVOS` de `sw.js` y en `pruebas.html`, en el mismo orden.

La revisión de arquitectura del 30/09 (zonas críticas y el plan de
refactorización en pasos) está en `ARQUITECTURA.md`.

## Reglas duras (romperlas ya causó problemas reales)

1. **Nunca cambiar las claves de `localStorage`** (`monagric_*`) ni la
   dirección del repositorio. Doce teléfonos perderían su credencial y los
   registros sin enviar.
2. **Al actualizar el Apps Script**: Implementar → Administrar implementaciones
   → ✏ → **Nueva versión**. Nunca "Nueva implementación": crea otra URL y la
   app sigue hablando con la vieja. Pasó dos veces.
3. **Guardar y pegar el código no alcanza**: el Web App sirve la versión
   congelada al implementar. `python tools/version_servicio.py` dice si el
   servicio corre código viejo.
4. **Verificar en el navegador antes de publicar.** Levantar el preview y
   ejercitar el cambio de verdad. Los peores errores del proyecto —horas y
   tareas sin poder guardarse durante dos días— pasaron por leer el código en
   vez de probarlo.
5. **Nunca escribir datos de prueba en las planillas de producción.** Usar
   datos simulados en el navegador, interceptando `guardarRegistro`.
6. **Nada de secretos en el repo.** Las URLs de los endpoints de Bioma van en
   las propiedades del script, nunca en el código.
7. **Al pedir datos dentro de `render()`, poner guard.** Sin él, la respuesta
   redibuja, redibujar vuelve a pedir, y queda un lazo que manda la pantalla
   arriba y golpea el servicio. Pasó con `traerCuentas`.
8. **Lo que redibuja porque llegaron datos va por `redibujarConDatos()`,
   nunca `render(vista)` a secas.** `render` sin `true` vuelve la pantalla
   arriba y borra los formularios; al terminar cada sincronización eso hacía
   saltar la pantalla después de cada cosa guardada (28/09, "no me deja
   trabajar"). `redibujarConDatos` conserva el scroll y no redibuja si la
   persona tocó un campo o está arrastrando en el mapa.
9. **En una pantalla nueva, lo que muestra datos del servicio va en una
   parte** (`parte()` o `data-parte`, ver ARQUITECTURA 4.5) y el formulario
   afuera: así al llegar datos se cambia la lista y no se borra lo que la
   persona está cargando.

## El plan y la carga de datos, juntos (29/09)

- **"Para sembrar" y "Para trasplantar" viven en su sección**, arriba del
  formulario, como listas desplegables. Inicio solo muestra cuántas hay.
  Tocar una completa el formulario con el plan: fecha de hoy (contra ella se
  compara después lo planificado), cultivo, variedad, generación, bandejas
  (plantas del marco ÷ alvéolos, una planta por alvéolo), y en trasplantes los
  bancales que el plan le dio en el mapa. Todo queda editable.
- **Lo que se registra es lo que se hizo, tal cual**: fecha real, marco real.
  La diferencia con el plan sale de comparar las hojas, no se anota aparte.
- **Corregir y borrar registros** desde "Últimos movimientos" (siembras,
  trasplantes, cosechas, horas; las de Tica en la planilla de Bioma). El
  servicio rearma la fila con la misma receta que al cargarla y deja copia de
  cómo estaba en la hoja **Cambios** de la chacra: un borrado por error se
  recupera de ahí. Los botones aparecen solo si la configuración trae
  `corregir: true` (servicio nuevo); contra uno viejo quedarían en la cola.
- La generación del plan tiene **Variedad** (columna al final de la hoja).

## Multi-chacra: lo que no hay que romper

Cuatro de las cinco chacras no tienen nada que ver con la economía de Bioma.

- Las direcciones de los endpoints viven en propiedades **con el código de
  chacra adelante**: `CUENTAS_URLS`, `ECONOMIA_URLS`. Si una chacra no figura,
  el servicio le responde que no tiene cuentas y **la pestaña ni se le
  muestra**. No es que se oculte en pantalla: no le llegan los datos.
- `CHACRA_CON_HORAS_APARTE` = `tica`: es la única que manda sus horas a la
  planilla de Bioma en vez de a la suya. Las demás usan su hoja `Horas`.
  **Desde el 30/09 esas horas entran por `Code.gs`** (con credencial, columna
  "Cargado por"), no por el script de la planilla de horas, que no pedía
  nada y cuyo Web App se archivó ese día. La app ya no tiene su dirección.

## La configuración, entera o por partes (30/09)

`guardarConfig` reescribe la hoja Config entera con la copia del teléfono:
queda para la pantalla Configuración, que es deliberada. Lo que se toca a
cada rato —el plan de un cultivo (se rehace con cada generación) y la
posición de un sector en el mapa— va por `guardarPartesDeConfig`, que manda
`config_plan` / `config_sector` y el servicio cambia esa fila sola. Así dos
teléfonos no se pisan. **Algo nuevo que se edite seguido en la configuración
va por partes**, no por `guardarConfig`.
- Al agregar una función que toque plata o economía, preguntarse siempre si
  vale para una chacra o para todas.

## Nombres y columnas: una sola regla (01/10)

- **¿Es el mismo cultivo?** Sin tildes, sin mayúsculas, sin "s" final:
  `claveArea` en la app, `claveCultivo` en `Code.gs`, `clave()` en las
  herramientas. Las tres tienen que dar lo mismo. `claveNombre` (servidor) es
  para **personas** y no saca la "s".
- **Las hojas se leen y escriben por posición** según `HOJAS` en `Code.gs`.
  La app lee las filas por nombre (`DE_LA_HOJA` en `registros.js`). Al cambiar
  un encabezado, cambiarlo en los dos lados; `python tools/version_servicio.py`
  avisa si no coinciden y si alguna planilla tiene columnas fuera de lugar.
- El plan y los almácigos se recuerdan 5 minutos en el servidor, y los accesos
  2: lo editado a mano en la planilla tarda eso en verse.

## Áreas de trabajo

Seis **fijas**, definidas en `AREAS_FIJAS` dentro de `js/catalogo.js`, iguales para
todos los colectivos: Hortícola, Frutícola, Fungis, Comercialización,
Administración y Mantenimiento. Cada una con su lista de actividades.

No se agregan ni se borran a propósito: si cada chacra inventara sus nombres,
las horas no se podrían comparar entre colectivos, que era el punto. Lo propio
de cada espacio —Biofábrica, Plantinera, Sala de lavado en Tica— se suma
aparte y sí se guarda en su planilla.

Antes de agosto de 2026 el área era un campo libre llamado "Proyecto" y la
actividad salía de una lista global sin relación con él, así que hay registros
viejos con combinaciones imposibles. **No son un error del código de hoy**: el
formulario actual no puede producirlas.

## Acceso: cómo sabe quién es cada teléfono

- Cada persona canjea **una vez** un código de invitación y su teléfono guarda
  una credencial. Los códigos se generan con `tools/crear_invitaciones.py` y se
  **pegan a mano** en la hoja Invitaciones: el script solo los imprime.
- El servicio sabe de quién es cada teléfono por la credencial, no por el
  nombre que alguien elige en una lista. **Eso es lo que permite el filtro de
  privacidad de las cuentas**, que el endpoint de Bioma no puede hacer.
- El nombre es hoy la llave que une AMA, la planilla de horas y bioma-db. Ya
  falló una vez (un teléfono quedó como "Lucas" con las horas bajo "Luqui").
  Migrar a identificadores por persona está pendiente.

## Cuentas y economía

El camino tiene tres saltos:

```
AMA  →  planilla de horas  →  bioma-db  →  AMA
(carga)   (recibe)            (calcula)   (muestra)
```

- **bioma-db calcula, AMA muestra.** AMA no guarda ni recalcula saldos: los
  pide y los dibuja. Llevar la cuenta en dos lados daría dos verdades.
- **La consulta la hace el servidor de AMA con `UrlFetchApp`, nunca el
  navegador.** Si el teléfono pidiera la URL directo, cualquiera vería las
  cuentas de todos y el filtro no serviría de nada.
- Los pagos se registran **solo en bioma-mov**. AMA no los toca.
- Contratos: `apps-script/CUENTAS.md` y `apps-script/ECONOMIA.md`, ambos del
  lado de bioma-mov, que es quien sirve los endpoints. **Esos son los
  canónicos.**

### Proyección: el camino inverso

AMA Economía muestra cuánto podría dar la temporada. Acá **AMA sabe y
Economía pregunta**: `?proyeccion=1&chacra=tica&token=…` devuelve el plan de
la configuración (cultivo, m², bancales, rinde, kg). El script de bioma-db lo
pide con `UrlFetchApp` y la app de Economía le pone los precios.

- La clave es `PROYECCION_TOKENS` (una por chacra, en las propiedades) y solo
  abre esa respuesta. La genera `tools/token_proyeccion.py`.
- **Los kilos se calculan acá y viajan hechos**: si Economía rehiciera la
  cuenta, algún día diría otra cosa que la pantalla de Plan.
- Los precios nunca vienen para este lado: quien trabaja en la chacra no ve
  plata por AMA Producción.

## Estado actual

Secciones que andan: Inicio, Horas, Tareas, Siembras, Trasplantes, Cosechas,
Plan/Configuración, Cuentas (solo Tica) y el juego.

Faltan del original: **Sanidad** (aplicaciones y monitoreo), **Riego** y
**Stock**. También **editar y borrar registros**, que es lo que hoy obliga a
compartir las planillas como Lector.

**Lo que sigue está en `PENDIENTES.md`** — leerlo antes de proponer nada.
