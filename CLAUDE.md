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
- **El nombre visible es AMA** (sept 2026). La carpeta, el repositorio y las
  claves internas siguen siendo `monagric`: renombrarlas le borraría a cada
  teléfono su credencial y lo que tenga sin enviar. **No tocar.**

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
docs/index.html     las pantallas y la barra de secciones
docs/styles.css     estilo
docs/app.js         TODO el frontend, ~2700 líneas, un solo archivo
docs/sw.js          service worker: red primero, caché de respaldo
docs/catalogo.json  cultivos y perfiles, iguales para todas las chacras
docs/juego/         Pac-Farm, el juego
apps-script/Code.gs            el "servidor" de las cinco chacras
apps-script/Codigo-horas-bioma.gs  script aparte, vive en la planilla de horas
tools/*.py          herramientas de administración (usan clave de admin)
```

**Dónde vive el servidor:** `Code.gs` está dentro de la planilla
**MonAgric Datos 2026-27** (que es también la de Chacra Tica), en Extensiones →
Apps Script. Atiende a las cinco chacras. Es una fragilidad conocida: si esa
planilla se rompe, se cae la app para todos. Mover el script a un proyecto
propio está pendiente y no es urgente.

**Publicación:** GitHub Pages sirve desde `/docs`. Cada push publica. Al
cambiar archivos hay que subir `CACHE` en `sw.js` y `VERSION_APP` en `app.js`.

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

## Multi-chacra: lo que no hay que romper

Cuatro de las cinco chacras no tienen nada que ver con la economía de Bioma.

- Las direcciones de los endpoints viven en propiedades **con el código de
  chacra adelante**: `CUENTAS_URLS`, `ECONOMIA_URLS`. Si una chacra no figura,
  el servicio le responde que no tiene cuentas y **la pestaña ni se le
  muestra**. No es que se oculte en pantalla: no le llegan los datos.
- `CHACRA_CON_HORAS_APARTE` = `tica`: es la única que manda sus horas a la
  planilla de Bioma en vez de a la suya. Las demás usan su hoja `Horas`.
- Al agregar una función que toque plata o economía, preguntarse siempre si
  vale para una chacra o para todas.

## Áreas de trabajo

Seis **fijas**, definidas en `AREAS_FIJAS` dentro de `app.js`, iguales para
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

## Estado actual

Secciones que andan: Inicio, Horas, Tareas, Siembras, Trasplantes, Cosechas,
Plan/Configuración, Cuentas (solo Tica) y el juego.

Faltan del original: **Sanidad** (aplicaciones y monitoreo), **Riego** y
**Stock**. También **editar y borrar registros**, que es lo que hoy obliga a
compartir las planillas como Lector.

**Lo que sigue está en `PENDIENTES.md`** — leerlo antes de proponer nada.
