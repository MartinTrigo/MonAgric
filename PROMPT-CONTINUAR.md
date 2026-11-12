# Prompt para continuar — AMA Producción (escrito el 13/11/2026)

Pegá esto al abrir una conversación nueva en la carpeta `AMA`. Lo escribió el
modelo anterior al quedarse sin uso, con el trabajo a medias. Está en orden:
hacé primero la tarea 1, que es la que quedó colgada.

---

Vas a continuar el trabajo en **AMA Producción** (`AMA\produccion`, repositorio
`MonAgric`). Trabajás para Martín, agroecólogo, no programador: hablale en
castellano rioplatense, sin jerga, y mostrale las cosas andando.

**Antes de tocar nada, leé en este orden:** `AMA\CLAUDE.md`,
`produccion\CLAUDE.md` (entero: reglas duras y cada decisión con su porqué),
`produccion\PENDIENTES.md` (las primeras secciones son lo último),
`produccion\ARQUITECTURA.md`. Las reglas que más importan: nunca datos de
prueba en las planillas reales; nunca cambiar las claves `monagric_*`; en
Apps Script, Nueva versión y nunca Nueva implementación; verificar en el
navegador antes de publicar; cada push publica (subir `CACHE` en `sw.js` y
`VERSION_APP` en `js\base.js`); Martín autorizó el push sin preguntar.

## Dónde quedó (versión 92 publicada)

En tres días se hizo: el tablero de Inicio (cinco relojes y la curva de
cosecha), resiembras y generación sugerida, terminar una generación con
motivo y kilos, rinde logrado, y **el lugar planificado y el plantado** en el
mapa. Todo está explicado en `produccion\CLAUDE.md`.

## Tarea 1 (urgente, quedó a medias): corregir los lugares de Tica

Tica cambió sus sectores. Antes: Primavera, Verano, Otoño e Invierno, de 27
bancales cada uno. **Los corredores biológicos eran los bancales 1, 14 y 27,
igual en los cuatro sectores** (dato de Martín, 13/11). Se sacaron los
corredores y los 24 que quedaron se partieron en dos sectores de 12: «X A» y
«X B». O sea: viejo 2 a 13 → «X A» 1 a 12; viejo 15 a 26 → «X B» 1 a 12.

Los registros de la planilla (Trasplantes, Siembras directas, Stock) siguen
con los nombres y números viejos.

**Decisión de Martín (13/11), que manda sobre todo lo demás:** donde la
planilla y el mapa no coincidan, **vale lo que él ubicó en el mapa** (el plan
de la app), porque lo chequeó en el campo el 12/11. Los registros viejos
tienen bancales mal contados.

Pasos:

1. Comprobar que el servicio esté al día: desde `produccion`,
   `python tools/version_servicio.py`. Tiene que decir «el lugar donde se
   plantó cada generación». Si dice ANTERIOR, pedirle a Martín que pegue
   `apps-script\Code.gs` y haga Nueva versión.
2. `tools\corregir_sectores.py` ya tiene `QUITADOS = [1, 14, 27]`. Correrlo
   **sin** `--aplicar`, leer la lista y mostrársela a Martín. Un registro
   cargado en el bancal viejo 1, 14 o 27 sale en «sin equivalencia».
3. **Falta programar lo que pide la decisión de Martín**: para cada
   generación que tiene lugar en el plan (sector y bancales válidos), sus
   filas de Trasplantes (y la siembra directa) tienen que quedar con el lugar
   del plan, no con la traducción del registro. Proponé cómo y mostrale la
   simulación antes de escribir. Cuidados:
   - Trasplantes tiene **una fila por bancal**. Si la generación tiene N
     filas y el plan N bancales, se asignan en orden. Si no coinciden las
     cantidades, no adivines: listalo y preguntá.
   - Para las generaciones **sin** lugar en el plan, vale la traducción con
     la tabla (paso 2).
   - Tocar solo las celdas de sector y bancal, con copia en la hoja Cambios,
     como hace `corregirLugares` en `Code.gs`. Lo natural es sumarle a esa
     función un modo «lo que dice el plan gana», con simulación.
   - El stock vigente (16 filas, todas en «Primavera») se traduce con la
     tabla.
4. Aplicar con `--aplicar` solo con el sí de Martín. Después, abrir el mapa
   (Plan → Mapa, en notebook) con datos reales y confirmar que lo plantado
   coincide con lo planificado. Decirle qué quedó sin resolver.

## Una pregunta de Martín que quedó sin contestar

«¿Qué pasa si quien toma el dato se equivoca de bancal?» Hoy: el mapa lo
muestra plantado en el bancal equivocado y deja en contorno punteado donde
estaba planificado; se corrige con ✎ en Trasplantes → Últimos movimientos.
Es poco: nadie avisa del error. Mejoras a proponerle (chicas, antes de la
tarea 2):
- Al guardar un trasplante en un bancal distinto del planificado, **avisar y
  pedir confirmación** («el plan decía Primavera A 4, ¿se plantó en el 5?»).
- En el reloj «Confianza del dato» del tablero, sumar una señal: generaciones
  plantadas en otro lugar que el planificado.
- Que desde el mapa, al tocar un bloque plantado, se pueda ir derecho a
  corregir ese trasplante.

## Tarea 2: planificar lo que falta en el mapa

De 38 generaciones sin sembrar, casi ninguna tiene lugar. Es trabajo de
Martín, pero el mapa tiene que ayudar: revisar que los bancales libres se
vean bien por fecha y proponerle, si hace falta, una forma de ver «qué
bancal se libera y cuándo» como lista.

## Tarea 3: La Recorrida

La consigna completa está en `produccion\PROMPT-RECORRIDA.md`. Va después de
las tareas 1 y 2. La Recorrida **ratifica o rectifica el lugar plantado, no
el plan**. Las cinco decisiones que son de Martín están listadas ahí:
preguntáselas juntas antes de programar.

## Pendientes chicos, para no olvidar

- En el plan de Tica quedan dos generaciones con sector viejo: «Corredor
  Biológico G2» (Primavera 9: sacarla si ya no va) y «Mix de hojas G11»
  (Primavera 23).
- Brócoli G4 tiene dos siembras (05/10 y 26/10): ¿resiembra o error?
- Zapallito G1: marcar la siembra del 30/10 como resiembra y cargar la
  original del 29/09. Zucchini G1: cargar la resiembra del 30/10.
- Tomate: las tres variedades propias son una generación (G2) con tres
  tandas, no tres generaciones. Falta la G2 en el plan.
- El catálogo no se toca hasta el verano (pedido de Martín).
- Falta sumar a la guía de uso (`docs\ayuda\`) todo lo del 10 al 13/11.
- `calcularResumen` y `generacionesDelPlan` no filtran por temporada: hay que
  decidirlo antes de julio de 2027.

## Cómo se prueba acá

- `docs\pruebas.html` en el preview `ama-produccion` (puerto 8080): tiene
  que dar todo en verde (125 pruebas al 13/11).
- La app, con la chacra inventada: en la consola del preview,
  `(0, eval)(await (await fetch("ayuda/capturas/datos-ejemplo.js")).text())`.
  Al terminar, `localStorage.clear()`.
- El servidor, sin tocar ninguna planilla: copiar `Code.gs` a un archivo
  temporal dentro de `docs\`, cargarlo en el navegador con `SpreadsheetApp`
  simulado, ejercitar la función y borrar el temporal.
- Los datos reales de Tica, en solo lectura, con la clave de administración
  de `tools\` (no se publica): `?exportar=trasplantes`, `?generaciones=1`,
  `?config=1`, `?seguimiento=1`.
- Al terminar: actualizar `CLAUDE.md` y `PENDIENTES.md`, commit y push, y
  decirle a Martín sin adornos qué se probó y qué no.
