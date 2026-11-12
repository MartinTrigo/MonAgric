# Prompt de trabajo — El Tablero: plan contra real en AMA Producción

Escrito el 10/11/2026 después de revisar el código entero. Es la consigna con
la que se trabaja el tablero de monitoreo, etapa por etapa. Se lee junto con
`CLAUDE.md` (reglas duras) y `PENDIENTES.md`.

## El objetivo, en una frase

Que cualquier persona de la chacra abra la app y en diez segundos sepa
**cómo viene la temporada contra lo que se planificó, por qué, y qué hacer
esta semana**; y que al cerrar la temporada la chacra tenga números propios
para planificar la siguiente.

## Lo que encontré (de dónde sale este trabajo)

1. **El dato ya se carga y casi no se mira.** Siembras y Trasplantes guardan
   «Fecha planificada» y «Diferencia plan» congeladas; Trasplantes guarda días
   reales contra teóricos de almácigo; Siembras guarda Origen
   (propio/encargado/comprado); Horas guarda área y actividad. Nada de eso se
   ve junto en ninguna pantalla. El Inicio muestra tres cifras y una barra.
2. **El único reloj de hoy mide mal.** «% de lo esperado» compara los kilos
   cosechados con los de **toda** la temporada: en noviembre siempre da 1 % y
   no dice si vamos bien. Hay que comparar con lo esperado **a hoy**.
3. **Los totales no miran la temporada.** `calcularResumen` suma las hojas
   Cosechas, Siembras y Horas enteras, y `generacionesDelPlan` trae todas las
   filas: en julio de 2027 se mezclarían dos temporadas. Hay que filtrar por la
   columna Temporada **antes** de esa fecha.
4. **La cosecha no se puede atar a una generación ni a un bancal** (la hoja
   guarda cultivo y kilos). Sin eso el rinde real es por cultivo, no por
   generación ni por lugar.
5. **Un reloj vale lo que vale el dato.** Hay almácigos de agosto sin
   trasplante cargado y generaciones con cuatro siembras: un tablero que no
   avise de eso muestra atrasos que no existen.

## Principios de diseño (no negociables)

- **Los hechos los cuenta el servidor, sobre la hoja entera y la temporada
  vigente** (lección de la ventana). Un endpoint nuevo, `?seguimiento=1`, con
  caché de 5 minutos, que devuelve hechos chicos: por generación (planificado,
  real, diferencia), kilos por cultivo y por semana, horas por área y por
  semana, bancales ocupados, y las señales de calidad del dato.
- **Lo esperado lo calcula la misma función que dibuja el plan** (`tramosDe`,
  `filaDelPlan`, catálogo): así el tablero y el plan estratégico nunca dicen
  cosas distintas. Las cuentas van en funciones puras, con pruebas en
  `pruebas.html`.
- **Cada reloj contesta una pregunta y dice de qué está hecho** («23 de 28
  etapas que tocaban»). Nunca un porcentaje solo. Tocar un reloj abre el
  detalle: qué generaciones lo bajan.
- **Pocos relojes.** Cuatro en el Inicio; el resto, en la pantalla de
  Seguimiento.
- **SVG puro, sin librerías**, colores por variables de `:root`, claro y
  oscuro, legible en un teléfono al sol. El estado nunca se dice solo con
  color: va con número y palabra.
- **Nada de plata**: es producción. Vale para las seis chacras; una chacra sin
  plan cargado ve una invitación a cargarlo, no relojes en cero.
- **Compatibilidad**: la app nueva contra el servicio viejo sigue mostrando el
  Inicio de hoy (bandera `cfg.tablero`, como `cfg.stock`).
- Partes (`parte()`), guardas al pedir datos y `redibujarConDatos`: las reglas
  7, 8 y 9 de `CLAUDE.md`.

## Etapa 1 — Los cuatro relojes del Inicio y la curva de cosecha

> **Hecha el 11/11 (v88)**, salvo el punto 6, que espera una decisión: ver
> `PENDIENTES.md`. Falta probarla con los datos reales de una chacra.

1. **Ritmo del plan**: de las etapas (siembras y trasplantes) que tocaban
   hasta hoy, cuántas se hicieron. Se mueve desde el primer día de temporada.
2. **Cosecha a hoy**: kilos cosechados ÷ kilos esperados **a la fecha**
   (cada generación reparte sus kilos en su ventana de cosecha).
3. **Puntualidad**: atraso típico en días (mediana de «Diferencia plan») y %
   de etapas dentro de ±7 días.
4. **Confianza del dato**: almácigos pasados de fecha sin trasplante cargado,
   generaciones con siembras repetidas, fechas en el futuro, días sin cargar
   horas o cosechas. Cada señal lleva al lugar donde se arregla.
5. **Curva de cosecha acumulada**: plan contra real, con la línea de hoy y la
   proyección «a este ritmo, la temporada cierra en X kg».
6. De paso: filtrar por Temporada en `calcularResumen` y en el plan.

Hecho cuando: los cuatro relojes y la curva andan con la chacra de ejemplo y
con el servicio real de Tica, en claro y oscuro, en 375 px; `pruebas.html` en
verde con las cuentas nuevas; `version_servicio.py` reconoce el endpoint.

## Etapa 2 — Pantalla Seguimiento: por cultivo y el aprendizaje

- **Desvío por cultivo** (barras a izquierda y derecha de «en fecha») y, al
  tocar, la línea de tiempo de cada generación: planificado, real, previsto.
- **Calibración del catálogo**: días reales en almácigo contra teóricos (solo
  origen Propio) y rinde real contra el de referencia, con el botón «usar este
  número la temporada que viene» (escribe en la planilla del catálogo de esa
  chacra, no en el compartido).
- ~~Cosecha con generación~~ **hecho el 12/11 (v90)**, junto con terminar una
  generación y el reloj de rinde logrado: ver `CLAUDE.md`. Falta el sector
  (rinde por bancal y no solo por generación).
- Aviso al cargar una siembra si esa generación ya tiene una.

## Etapa 3 — Relojes de sustentabilidad y la araña

Todos salen de datos que ya se cargan, sin pedir nada nuevo:

- **Diversidad**: cultivos y familias botánicas en el campo, ponderados por
  superficie.
- **Suelo ocupado**: % de bancales con cultivo a lo largo de la temporada.
- **Autonomía de plantines**: % propios contra encargados y comprados.
- **Continuidad de oferta**: semanas con cosecha y cuántos cultivos por semana.
- **Trabajo**: horas por kilo y por bancal en Hortícola.
- **Rotación**: bancales que repiten familia (cuando haya dos temporadas).

La araña se descartó el 11/11: los indicadores van con el mismo lenguaje de
la etapa 1 (reloj con su detalle, barras con marca, puntos sobre un eje).

## Etapa 4 — Que el tablero salga de la app

- **Parte semanal**: un resumen en palabras, armado con reglas (sin IA),
  para compartir por WhatsApp los lunes: qué se hizo, qué se atrasó, qué toca.
- **Comparación entre chacras, anónima**: cada chacra ve su número y el rango
  de las otras cinco (días de almácigo, rinde, horas por kilo). Es el paso
  hacia un catálogo de la Comarca hecho con datos reales. Necesita el acuerdo
  de las seis chacras antes de programarse.
- Heladas y grados-día (ya anotado en PENDIENTES).

## Cómo se trabaja cada etapa

1. Leer `CLAUDE.md`, `PENDIENTES.md` y `ARQUITECTURA.md`.
2. Plan corto a Martín antes de tocar código; una etapa por conversación.
3. Servidor primero (endpoint y prueba con `version_servicio.py`), después la
   app contra datos simulados (`ayuda/capturas/datos-ejemplo.js`, ampliado con
   cosechas y horas por semana). Nunca datos de prueba en las planillas.
4. Verificar en el navegador (preview `ama-produccion`), teléfono y notebook,
   claro y oscuro. Borrar el `localStorage` al terminar.
5. Subir `CACHE` y `VERSION_APP`; archivo nuevo en `index.html`, `sw.js` y
   `pruebas.html`. Push. Decirle a Martín, paso a paso, la **Nueva versión**
   del Apps Script.
6. Actualizar `PENDIENTES.md` y la guía de uso.
