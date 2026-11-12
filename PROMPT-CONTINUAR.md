# Prompt para continuar — AMA Producción

Actualizado el 13/11/2026 por el modelo anterior (Fable 5.2), con el análisis
y las decisiones ya tomadas, para que quien siga tenga que **ejecutar y
verificar**, no volver a decidir. Pegá esto al abrir una conversación nueva en
la carpeta `AMA`.

---

Vas a continuar el trabajo en **AMA Producción** (`AMA\produccion`, repositorio
`MonAgric`). Trabajás para Martín, agroecólogo, no programador: hablale en
castellano rioplatense, sin jerga, y mostrale las cosas andando.

**Antes de tocar nada, leé en este orden:** `AMA\CLAUDE.md`,
`produccion\CLAUDE.md` (entero: reglas duras y cada decisión con su porqué),
`produccion\PENDIENTES.md` (las primeras secciones son lo último),
`produccion\ARQUITECTURA.md`. Lo que no se negocia: nunca datos de prueba en
las planillas reales; nunca cambiar las claves `monagric_*`; en Apps Script,
Nueva versión y nunca Nueva implementación; verificar en el navegador antes
de publicar; cada push publica (subir `CACHE` en `sw.js` y `VERSION_APP` en
`js\base.js`); Martín autorizó el push sin preguntar.

Si este archivo y `PENDIENTES.md` se contradicen, vale **este** en lo que
toca a las tareas de abajo (es posterior).

## Cómo pensar este proyecto (leelo, ahorra errores)

1. **El cuello de botella es el dato, no la cuenta.** Todo lo que falló del
   10 al 13/11 fue por registros faltantes o mal cargados (bancal mal
   contado, generación repetida, trasplante sin cargar). Antes de sumar un
   indicador, preguntate qué dato lo alimenta y quién lo carga, parado dónde.
2. **Cada cosa tiene «planificado» y «real», y no se mezclan.** Fechas,
   lugar, kilos. Lo planificado no se pisa con lo real: queda para comparar.
3. **El mapa es el plan** (dónde y cuándo va cada generación, y qué sigue en
   cada bancal). La ejecución se registra aparte y se ratifica o rectifica.
4. **Lo que se cuenta sobre toda la temporada lo calcula el servidor.** El
   teléfono recibe las últimas 15 filas de cada hoja.
5. **Nada se ofrece si el servicio no lo sabe guardar** (banderas en
   `?config=1`). Columnas nuevas al final; hojas nuevas aparte.
6. **Se publicaron cinco versiones en tres días (88 a 92) y ninguna se probó
   en un teléfono real con datos reales.** Antes de construir La Recorrida
   hay que hacer la tarea 3 (una semana de uso). No la saltees.

## Tarea 1 — El lugar verificado (decidida; falta programarla)

### El problema, con los datos de Tica del 13/11

Tica partió sus sectores: antes Primavera, Verano, Otoño e Invierno de 27
bancales, con corredores biológicos en los bancales **1, 14 y 27**; ahora
«X A» y «X B», de 12 cada uno (viejo 2 a 13 → A 1 a 12; viejo 15 a 26 → B 1
a 12). Los registros siguen con nombres y números viejos.

Martín recorrió el campo el 12/11 y ubicó en el mapa (el plan) lo que está
plantado. **Su decisión: donde la planilla y el mapa no coincidan, vale el
mapa.**

Simulé la traducción de los registros con la tabla (corredores 1, 14 y 27):
de 24 generaciones que tienen registro y lugar en el mapa, **coinciden 4**.
Probé todas las combinaciones de corredores posibles: ninguna explica los
registros. No es un problema de numeración: son bancales mal contados al
cargar, con errores de distinto tipo (en la primera mitad de Primavera los
registros parecen no contar el corredor del borde; en la segunda sí; en
Verano no se parecen en nada; el Zapallo G1 está registrado en Otoño y está
en Invierno). **No se puede corregir los registros con una fórmula.**

Tampoco conviene reescribirlos con lo que dice el plan: Trasplantes tiene
una fila por bancal y las cantidades no coinciden (Acelga G1: 3 filas, 2
bancales; Tomate G1: 1 fila, 3 bancales; Zapallo G1: 20 filas, 24 bancales).
Habría que adivinar qué fila va a qué bancal.

### La decisión

**El lugar plantado se guarda en la generación, con la fecha en que alguien
lo verificó en el campo.** No se deduce de los registros cuando hay una
verificación.

- «Plan generaciones» suma tres columnas **al final**: `Sector plantado`,
  `Bancales plantados`, `Lugar verificado` (fecha).
- De dónde sale el lugar plantado de una generación, en orden:
  1. lo verificado (esas columnas), si está;
  2. si no, lo que dicen los registros (como hoy: `lugar_real`), marcado en
     el mapa como **sin verificar**;
  3. si no hay nada, no está plantada: vale el plan.
- Sector y Bancales (las columnas de siempre) siguen siendo **el plan** y no
  se tocan al verificar. Así queda «planificado acá, plantado allá».
- Los registros de Trasplantes quedan como historia: lo que se anotó ese día.
  No se reescriben.
- Esto es, además, **lo que La Recorrida va a escribir** cuando alguien
  confirme un bancal: una fecha en la generación, no una fila nueva.

### Cómo hacerlo

Servidor (`apps-script\Code.gs`):
- `HOJAS.generaciones`: las tres columnas al final (índices 14, 15, 16).
- **Ojo con `guardarGeneracion`**: rearma la fila entera con lo que manda la
  app. Si la app no manda esas tres columnas, las borraría (ya pasó con la
  variedad, arreglado en v91). Que el servidor **conserve lo que hay** en
  esas tres celdas cuando el registro no las trae.
- Un tipo de registro nuevo, `lugar_verificado`, con
  `{ generacion_id, sector, bancales, fecha }` (o una lista de ellos), que
  escribe **solo esas tres celdas** de esa fila (como `config_plan`). Vacío
  borra la verificación. Va en `SIN_HOJA` y en `CAMBIAN_EL_PLAN`.
- `generacionesDelPlan`: si la fila tiene lugar verificado, `lugar_real` es
  ese y se agrega `lugar_verificado: "aaaa-mm-dd"`; si no, lo de los
  registros y `lugar_verificado: ""`.
- Una generación partida en partes (G1, G1b) comparte número: la verificación
  se guarda en cada parte con sus propios bancales.
- Bandera `cfg.lugar_verificado = true`.

App (`docs\js\plan-mapa.js`, ya tiene `lugarReal`, `lugaresDe`,
`plantadasDe`, `estaUbicada`):
- Lo plantado **sin verificar** se dibuja distinto de lo verificado (rayado
  o con un «?»), y la lista dice «según el registro, sin verificar».
- En la barra de estado de una generación elegida, dos botones:
  **«Está donde dice el plan»** (verifica con el lugar del plan y la fecha
  de hoy) y **«Está en otro lado»** (se elige el bancal en el mapa y queda
  verificado ahí; el plan no cambia).
- Un botón de una sola vez arriba del mapa, visible mientras haya
  generaciones sembradas con lugar en el plan y sin verificar: **«Confirmar
  que todo lo plantado está donde dice el mapa»**. Es lo que Martín necesita
  hoy: deja verificadas con fecha 12/11/2026 (pedile la fecha) las ~27 que
  ubicó. Con confirmación antes de enviar, y diciendo cuántas son.
- Con eso, `ocupa`/`lugaresDe` no cambian: siguen usando lo plantado.

Qué hacer con los registros viejos: **nada más que traducir el stock.**
`tools\corregir_sectores.py` ya tiene `QUITADOS = [1, 14, 27]`. Correrlo sin
`--aplicar`, mostrarle la lista a Martín y, con su sí, aplicarlo: sirve para
que el stock vigente (14 filas en «Primavera») y los registros de las
generaciones **sin** lugar en el mapa (9, casi todas en Verano B) caigan en
sectores que existen. Esas quedan «sin verificar» hasta la recorrida. Las 11
filas cargadas en un bancal viejo 1 o 14 no tienen equivalencia y quedan
como están: no importa, porque esas generaciones sí están en el mapa.

Hecho cuando: en el mapa de Tica, con datos reales, todo lo que Martín ubicó
aparece plantado y verificado, sin contornos punteados; lo que no ubicó
aparece plantado «sin verificar»; `pruebas.html` en verde con pruebas nuevas;
`version_servicio.py` reconoce la bandera.

## Tarea 2 — Que el error de bancal se frene al cargarlo

Pregunta de Martín: «¿qué pasa si quien toma el dato se equivoca de bancal?»
Hoy nadie avisa. Tres cambios chicos, en este orden:

1. **Al guardar un trasplante** (y una siembra directa) en un lugar distinto
   del planificado, la app pregunta antes de guardar: «El plan decía
   Primavera A 4. ¿Se plantó en el 5?» con «Sí, en el 5» / «Corregir». Si el
   bancal elegido ya tiene otra generación plantada en esas fechas, también
   avisa (usar `chocanCon`).
2. **En el formulario de trasplante, mostrar el croquis del sector** (los 12
   bancales en fila, con lo que hay en cada uno) en vez de un desplegable de
   números: se elige tocando el bancal. Es la misma pieza que va a usar La
   Recorrida: hacela reutilizable.
3. **En «Confianza del dato»** del tablero, una señal más: generaciones
   plantadas en otro lugar que el planificado, o plantadas sin verificar hace
   más de 30 días.

## Tarea 3 — Una semana de uso real, sin funciones nuevas

Antes de La Recorrida. Pedile a Martín que use la versión publicada con el
equipo y traiga lo que no cierra. Mientras tanto, solo arreglos. Lo que hay
que mirar con datos reales (nada de esto se verificó en un teléfono):

- Los cinco relojes de Inicio en Tica: ¿dicen algo razonable? El Ritmo va a
  salir bajo mientras haya generaciones viejas sin sembrar en el plan.
- «Terminar una generación» con Hakusai G1 y G2 (repartir los 135 kg),
  Rúcula G1 (malezas, 0 kg), Albahaca G1 (no germinó).
- La generación sugerida al sembrar y el bloqueo de repetidas.
- El formulario de Stock ahora exige elegir sector y bancal.
- En las otras cinco chacras: que Inicio no muestre nada roto (casi todas
  sin plan cargado: no tienen que ver tablero).
- Los umbrales de `js\tablero.js` (±7 días es «en fecha», 14 días un
  almácigo vencido, 30 una siembra sin cargar): ajustarlos con lo que diga
  Martín.

Pendientes de datos que Martín tiene que cargar (recordáselos):
- Zapallito G1: marcar la siembra del 30/10 como resiembra y cargar la del
  29/09. Zucchini G1: cargar la resiembra del 30/10.
- Tomate: G1 son los encargados; las tres variedades propias (10 a 12/09)
  son **una** generación, la G2, con tres tandas. Falta la G2 en el plan.
- Brócoli G4 tiene dos siembras (05/10 y 26/10): ¿resiembra o error?
- En el plan quedan con sector viejo «Corredor Biológico G2» (sacarla si ya
  no va) y «Mix de hojas G11».

## Tarea 4 — Planificar en el mapa lo que falta sembrar

De 38 generaciones sin sembrar, casi ninguna tiene lugar. Es trabajo de
Martín, pero el mapa hoy no ayuda a ver la sucesión. Agregar a Plan → Mapa
una lista **«Bancales que se liberan»**: por sector y bancal, hasta cuándo
está ocupado (con lo plantado, o lo planificado si no) y qué generación
planificada lo sigue, o «libre desde el dd/mm, sin nada planificado». Sale de
`lugaresDe` y `ocupacionDe`; función pura con pruebas. Tiene que verse
también en el teléfono, como lista.

## Tarea 5 — La Recorrida

La consigna completa está en `produccion\PROMPT-RECORRIDA.md`. Va después de
las tareas 1 a 4. Las cinco decisiones que ese archivo deja abiertas, ya
analizadas; proponéselas a Martín así, juntas, y cambiá lo que él diga:

1. **Qué se guarda al confirmar «está bien»**: la fecha en `Lugar
   verificado` de la generación (tarea 1), no una fila por bancal. Y una
   fila por recorrida en una hoja nueva `Recorridas` (fecha, sector, quién,
   bancales vistos, cuántos se corrigieron), para el reloj «hace cuánto que
   no se recorre cada sector».
2. **Observaciones**: hoja nueva `Observaciones` (Id, Temporada, Fecha,
   Sector, Bancal, Cultivo, Generación, Categoría, Gravedad, Nota, Estado,
   Quién, Cargado por, Recibido). Categorías: Plaga o enfermedad, Malezas,
   Falta de agua, Se está yendo en flor, Daño (helada, viento, animales),
   Otro. Gravedad en **dos** niveles: «Para mirar» y «Urgente». Estado:
   abierta o resuelta; las urgentes abiertas se ven en Inicio. Sin recetas
   ni aplicaciones: eso es Sanidad y queda afuera.
3. **La estimación de cosecha escribe en Stock**, tipo «En campo», tal como
   hoy. No inventar otro lugar: el stock ya es una foto por bancal y
   Economía ya lo lee.
4. **Cerrar por bancal: sí hace falta** (los brócolis con plaga son algunos
   bancales, no la generación). Sumar a `Cierres` una columna `Bancales` al
   final, optativa: vacía es la generación entera; con números, solo esos.
   La generación queda terminada cuando todos sus bancales lo están. El
   rinde logrado se calcula por los bancales cerrados.
5. **Nombre y lugar**: una pestaña propia, «Campo», segunda en la barra del
   teléfono (después de Inicio). Con el tiempo, el alta de trasplantes y el
   stock en campo se hacen desde ahí.

Hacela en dos entregas, cada una probada con Martín antes de seguir:
- **Recorrida 1**: ver el sector con el croquis (tarea 2), confirmar («está
  bien» → verificado hoy), «ya se trasplantó acá», «se terminó / se perdió»
  y «está en otro lado».
- **Recorrida 2**: observaciones, estimación de cosecha, resumen para
  WhatsApp, y las señales en el tablero.

## Lo que viene después (no empezar sin que Martín lo pida)

- **Ajuste de primavera del catálogo**, cuando empiece el verano: días de
  trasplante a cosecha (Hakusai dice 105 y se cosechó a los 41 a 47; Mix de
  hojas dice 52 y fue a los 24 a 32). Es compartido por las seis chacras.
- **Seguimiento por cultivo** (etapa 2 de `PROMPT-TABLERO.md`): calibración
  con el botón «usar este número la temporada que viene».
- **Rinde por bancal** (hoy es por generación).
- **Comparación entre chacras**, anónima: necesita el acuerdo de las seis.
- Deuda técnica que conviene pagar antes del verano: `calcularResumen` y
  `generacionesDelPlan` no filtran por temporada (decidir antes de julio de
  2027); `Code.gs` vive dentro de la planilla de Tica; una persona en varias
  chacras; la guía de uso (`docs\ayuda\`) no tiene nada del 10 al 13/11.

## Cómo se prueba acá

- `docs\pruebas.html` en el preview `ama-produccion` (puerto 8080): todo en
  verde (125 pruebas al 13/11).
- La app, con la chacra inventada: en la consola del preview,
  `(0, eval)(await (await fetch("ayuda/capturas/datos-ejemplo.js")).text())`.
  Al terminar, `localStorage.clear()`.
- El servidor, sin tocar ninguna planilla: copiar `Code.gs` a un archivo
  temporal dentro de `docs\`, cargarlo en el navegador con `SpreadsheetApp`,
  `LockService` y `CacheService` simulados, ejercitar la función y **borrar
  el temporal** antes del commit.
- Los datos reales de Tica, en solo lectura, con la clave de administración
  de `tools\` (no se publica): `?exportar=trasplantes`, `?generaciones=1`,
  `?config=1`, `?seguimiento=1`.
- Al terminar cada tarea: actualizar `CLAUDE.md` y `PENDIENTES.md`, commit y
  push, darle a Martín los pasos de la Nueva versión si se tocó `Code.gs`, y
  decirle sin adornos qué se probó y qué no.
