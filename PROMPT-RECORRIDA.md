# Prompt de trabajo — La Recorrida: el campo, bancal por bancal, desde el teléfono

Escrito el 12/11/2026. Es la consigna de la próxima tarea grande de AMA
Producción. Se pega (o se cita) al abrir una conversación nueva en la carpeta
`AMA`. Está pensada para trabajarla de punta a punta en esa conversación.

---

## El encargo

Vas a construir **La Recorrida**: una pantalla de AMA Producción para el
teléfono que muestra un sector con sus bancales tal como están en el campo y
permite, parado frente a cada bancal, **confirmar o corregir en dos toques lo
que la app cree que hay ahí**. Es la pieza que falta para que el plan, el mapa
y el tablero digan la verdad sin que nadie tenga que acordarse de cargar cada
cosa en su sección.

Trabajás para Martín, agroecólogo, no programador: explicale en castellano
rioplatense, sin jerga, y mostrale las cosas andando. Antes de programar,
proponele el diseño (ver «Decisiones que son de Martín») y esperá su visto
bueno; después avanzá sin frenar en cada paso.

## Por qué esta tarea y no otra

En tres días de uso real del tablero (10 al 12/11) salió siempre lo mismo: **los
relojes fallan por el dato, no por la cuenta.**

- Había 31 almácigos «esperando trasplante» y varios ya estaban en el campo.
- Las 8 generaciones de Puerro debían estar en el campo el 7/11 y ninguna
  tiene trasplante cargado.
- Hubo trasplantes mal cargados porque el bancal 23 de 27 era difícil de
  contar: por eso Tica partió sus sectores en A y B de 12 bancales.
- La rúcula tapada de yuyos, el hakusai que se fue en flor y los brócolis con
  plaga se supieron por conversación, no por la app.
- El mapa de cultivos solo existe en la notebook: quien está en el campo no
  ve qué debería haber en el bancal que tiene adelante.

Hoy cada hecho se carga en una sección distinta (Siembras, Trasplantes,
Cosechas, Stock, Cosechas → Terminar una generación) y hay que saber de
memoria la generación y el número de bancal. La Recorrida da vuelta eso: **se
parte del lugar**, y la app ya sabe qué generación hay ahí.

## Lo que ya existe y tenés que usar (no rehacer)

Leé primero, en este orden: `AMA\CLAUDE.md`, `produccion\CLAUDE.md`
(completo: tiene las reglas duras y cada decisión con su porqué),
`produccion\PENDIENTES.md`, `produccion\ARQUITECTURA.md`. Después el código:

- `docs/js/plan-mapa.js`: `estaUbicada`, `bancalesDe`, `ocupacionDe`,
  `chocanCon`, `bloquesDelMapa`. Qué generación ocupa cada bancal y cuándo.
- `docs/js/plan-grafico.js`: `tramosDe` (planificado, real y previsto de cada
  etapa; corta en la fecha de cierre).
- `docs/js/cierres.js`: `cierresVigentes`, `generacionesAbiertas`,
  `formularioCierre`, `rindeLogrado`. Terminar una generación ya está hecho.
- `docs/js/pendientes.js`: `almacigosPendientes`, `bancalesPlanificados`,
  `generacionQueSigue`.
- `docs/js/stock.js`: el stock es una FOTO por lugar (último registro, nunca
  suma); `stockAl`, la vista por semana. En PENDIENTES figura el «modo
  recorrida» de Stock como versión 2: esta tarea lo absorbe.
- `docs/js/tablero.js`: los relojes. La Recorrida los alimenta; no cambies
  sus cuentas salvo para sumar un dato nuevo.
- `docs/js/formularios.js`: cómo se arma un trasplante (una fila por bancal,
  siembra de origen, marco, días en almácigo).
- `apps-script/Code.gs`: `HOJAS`, `seguimientoDe`, `stockDe`, `doPost`.

## Qué tiene que poder hacer quien recorre

1. **Elegir un sector** y ver sus bancales en orden, cada uno con lo que la
   app cree que tiene hoy: cultivo y generación, en qué etapa está (por
   trasplantar, creciendo, en cosecha, pasado de fecha, vacío), y desde cuándo.
   Tiene que leerse al sol, con una mano, sin contar columnas.
2. **Confirmar con un toque** que el bancal está como dice («está bien»), y
   que eso quede registrado como visto ese día.
3. **Corregir lo que no coincide**, desde el mismo bancal y con el formulario
   ya completo:
   - «Ya se trasplantó acá» → registra el trasplante de esa generación en ese
     bancal (hoy, o la fecha que diga), con el marco del plan.
   - «Hay cosecha para sacar» → estimación de kilos (stock en campo), con el
     número sugerido por el rinde del plan para corregir y no escribir.
   - «Se terminó / se perdió» → el cierre que ya existe, con su motivo.
   - «Acá hay otra cosa» o «está vacío» → corrige el lugar REAL de esa
     generación. El plan no se toca: queda como lo que se había decidido, para
     comparar.
4. **Anotar lo que se ve**: una observación corta por bancal con categoría
   (plaga o enfermedad, malezas, falta de agua, se está yendo en flor, buen
   estado) y gravedad. Es la semilla de Sanidad, que falta desde la app
   original, pero acá entra solo como observación, sin recetas ni
   aplicaciones.
5. **Ver al terminar qué quedó**: cuántos bancales se recorrieron, qué se
   corrigió, y qué observaciones pide atención. Poder compartirlo por
   WhatsApp, como ya se comparte el stock.
6. **Funcionar sin señal**: la recorrida se hace en el campo. Todo va a la
   cola del teléfono como el resto de la app.

Y del otro lado, **el tablero tiene que enterarse**: un reloj o una señal de
«hace cuánto que no se recorre cada sector», y las observaciones graves
abiertas a la vista en Inicio.

## Decisiones que son de Martín (preguntalas juntas, al principio)

No las supongas. Llevale una propuesta para cada una, con tu recomendación:

1. **Qué se guarda al confirmar «está bien»**: ¿una fila por bancal visto, o
   una por sector recorrido? (Afecta cuánto crece la planilla.)
2. **Las categorías de observación** y si la gravedad va en dos o tres niveles.
3. **Si la estimación de cosecha escribe en Stock** tal cual (misma hoja, tipo
   «En campo») o en un lugar propio.
4. **Qué pasa con una generación partida en bancales separados** cuando solo
   uno se perdió: hoy el cierre es de la generación entera. ¿Hace falta cerrar
   por bancal?
5. **Cómo se llama** la sección y dónde va en la barra del teléfono, que ya
   tiene muchas pestañas.

## Cómo tiene que estar hecho

- **Todas las reglas duras de `produccion\CLAUDE.md` valen**, en particular:
  no cambiar claves `monagric_*`; lo que se cuenta sobre todo el historial lo
  calcula el servidor; las columnas nuevas van al final y las hojas nuevas
  aparte; lo que muestra datos del servicio va en una `parte()` y el
  formulario afuera; `redibujarConDatos`, nunca `render` a secas, cuando
  llegan datos; guardas de 20 s en cada `traer*`.
- **Nada nuevo se ofrece si el servicio no lo sabe guardar**: una bandera en
  `?config=1` (como `cfg.cierres`), y contra un servicio anterior la app queda
  como hoy.
- **No dupliques cuentas**: qué hay en un bancal a una fecha sale de las
  funciones del mapa y de `tramosDe`. Si hace falta una función nueva, que sea
  pura y vaya con sus pruebas en `docs/pruebas.html`.
- **Pensado para el teléfono primero**: 375 px de ancho, dedos, sol. Un bancal
  es una fila o una tarjeta grande, no una columna de 22 px. Claro y oscuro,
  todo color por variables.
- **Vale para las seis chacras**: nada de esto toca plata ni depende de Bioma.
  Una chacra sin generaciones ubicadas en el mapa ve la recorrida vacía con
  una explicación, no un error.
- **El dato viejo no se pierde**: los trasplantes y el stock ya cargados con
  nombres de sector anteriores siguen en la planilla; no los migres sin
  preguntarle a Martín.

## Cómo se verifica (no lo des por hecho sin esto)

1. `docs/pruebas.html` en verde, con las pruebas nuevas.
2. El servidor, ejercitado contra una planilla simulada en el navegador (el
   método está en la conversación del 10 al 12/11: se carga `Code.gs` con
   `SpreadsheetApp` simulado). **Nunca datos de prueba en una planilla real.**
3. La pantalla, en el preview `ama-produccion` con la chacra de ejemplo
   (`docs/ayuda/capturas/datos-ejemplo.js`, que hay que ampliar con sectores
   de 12 bancales y generaciones ubicadas): recorrer un sector entero,
   confirmar, corregir cada caso, anotar una observación, y ver el resumen.
   En 375 px, claro y oscuro. Borrar el `localStorage` al terminar.
4. Con los datos reales de Tica, en solo lectura (las herramientas de
   `tools/` con la clave de administración): que lo que la recorrida mostraría
   en cada bancal coincida con el mapa.
5. Decirle a Martín, sin adornos, qué se probó y qué no.

## Cuándo está terminado

- Martín puede recorrer un sector de Tica con el teléfono y dejarlo al día en
  menos tiempo del que hoy le lleva cargar dos trasplantes.
- Después de una recorrida completa, «Para trasplantar» y el reloj de
  Confianza del dato no reclaman nada de ese sector.
- Las observaciones quedan en la planilla de la chacra y se ven en Inicio.
- Publicado (subir `CACHE` en `sw.js` y `VERSION_APP`; archivo nuevo en
  `index.html`, `sw.js` y `pruebas.html`), con los pasos de la **Nueva
  versión** del Apps Script escritos para Martín y `tools/version_servicio.py`
  reconociendo lo nuevo.
- `CLAUDE.md`, `PENDIENTES.md` y `ARQUITECTURA.md` actualizados, y la guía de
  uso (`docs/ayuda/`) con la sección nueva.

## Antes de empezar: dos cosas que tienen que estar hechas

Preguntale a Martín si ya están; si no, ayudalo con eso primero.

1. **La Nueva versión del Apps Script** con lo del 11 y 12/11 (resiembras,
   cierres, rinde logrado). `python tools/version_servicio.py`, desde
   `produccion`, tiene que decir todo «al día».
2. **El lugar real en el mapa** (ver «El lugar: planificado y real» en
   `PENDIENTES.md`). El mapa es el PLAN de dónde va cada generación; dónde se
   plantó de verdad sale de Trasplantes y Siembras. La Recorrida ratifica o
   rectifica: «está donde decía el plan» o «se plantó en otro lado». Sin esa
   distinción la Recorrida pisaría el plan con lo real, o al revés. Lo ya
   plantado no se reubica a mano.

## Lo que queda afuera, a propósito

- Sanidad completa (aplicaciones, productos, dosis) y Riego.
- Ajustar el catálogo con los datos de primavera: Martín lo quiere hacer
  cuando empiece el verano.
- La pantalla Seguimiento por cultivo y la comparación entre chacras (etapas
  2 y 4 de `PROMPT-TABLERO.md`).
- Fotos de los bancales: suman mucho, pero piden resolver dónde se guardan.
  Anotalo como idea si sale en la conversación.
