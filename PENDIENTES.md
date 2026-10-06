# Dónde quedamos — 28 de septiembre de 2026

Estado de **AMA y bioma-mov**, que desde hoy se gestionan desde la misma
conversación. El contexto de cada uno está en su `CLAUDE.md`; acá va solo lo
que falta hacer.

---

## Revisión de datos del 29/09 — para Martín

- **Zucchini**: el plan tenía 3 líneas a 50 cm (720 plantas en 4 bancales);
  el catálogo y el Zapallito dicen 1 línea. Corregido a 1 (240 plantas).
- **Habas**: el plan dice 4 líneas a 15 cm (3.200 plantas en 4 bancales) y el
  catálogo 1 línea. No se tocó: decidir cuál es y corregirlo en Cultivos →
  Marco y rinde, o en el catálogo.
- **Pak choi**: al catálogo le faltan los días de almácigo y de cosecha (su
  barra sale estimada, rayada).
- **Almácigos sin trasplante registrado**: el servicio cuenta 27 esperando,
  varios sembrados en agosto (Lechuga, Kale, Repollo, Acelga, Brócoli...).
  Seguro ya están en el campo: registrarlos desde "Para trasplantar" (el
  formulario se completa solo) para que el plan y la cosecha cierren.
- La cuenta de bandejas supone una planta por alvéolo. En Puerro y Mix de
  hojas da muchas bandejas: si se siembran varias semillas por celda, se baja
  a mano o se ajusta el marco.

## Proyección en AMA Economía — ACTIVA desde el 28/09

Las dos propiedades de cada lado están cargadas, `probarProyeccion` en
bioma-db devolvió los 21 cultivos y la pestaña muestra cada cultivo y el total
(confirmado por Martín). Hizo falta otra Nueva versión de bioma-db después de
aprobar el permiso de llamar afuera: sin eso la app recibía una página de
Google en vez de datos. Tropiezos de la instalación, por si hay que
repetirla: `AMA_URL` va con la dirección completa (…/macros/s/<id>/exec, no
solo el id), y `AMA_PROYECCION_TOKEN` va con la clave sola, sin llaves; las
llaves van del lado de AMA (`PROYECCION_TOKENS`). La versión de bioma-db que
avisa claro si `AMA_URL` está incompleta está en el repo y entra con la
próxima actualización del script.

Lo que sigue es texto de la instalación:

La pestaña **Proyección** de AMA Economía cruza el plan de AMA Producción
(cultivo, m², rinde, kg: lo que está en Plan / Configuración) con los precios
de Productos. Probada en el navegador con el plan real de Tica (29 cultivos,
17.172 kg, $46,2 M a precio chacra con el catálogo inicial). Hasta que se hagan
estos pasos, la pestaña dice qué falta y no muestra números.

1. `python tools/token_proyeccion.py` → genera la clave y la deja en
   `tools/token_proyeccion.txt` (no se publica).
2. **AMA Producción** (Apps Script de MonAgric Datos 2026-27): pegar
   `Code.gs`, propiedad `PROYECCION_TOKENS` = `{"tica":"<clave>"}`, y
   Administrar implementaciones → ✏ → **Nueva versión**.
3. **bioma-db** (Apps Script): pegar `Code.gs`, propiedades
   `AMA_URL` (la dirección /exec de AMA, la de `tools/servicio.txt`) y
   `AMA_PROYECCION_TOKEN` (la clave). Correr **`probarProyeccion`** a mano una
   vez (aprueba el permiso de llamar afuera), y **Nueva versión**.
4. `python tools/version_servicio.py` tiene que decir "la proyeccion para AMA
   Economia (29 cultivos)".

Cinco cultivos quedan sin sumar y la pantalla dice por qué: Apio, Habas y
Puerro no tienen precio cargado; Mizuna no está en Productos; Rúcula se vende
por atado y la presentación no dice cuánto pesa (poner, por ejemplo,
"atado 150g"). Se arregla en Productos, no en código.

## Propuestas para la planificación, desde el análisis de Heirloom (28/09)

Del documento `C:\MARTO\INFORMATICA\AMA\heirloom-analisis-para-melga.md`.
Buena parte ya está en AMA (generaciones con fechas encadenadas, Gantt con tres
tonos y línea de hoy, color por cultivo, mapa de bancales, ficha, "Para
sembrar" que se apaga al registrar). Lo que queda, en el orden sugerido:

1. **Una sola verdad del plan: las camas van en la generación.** En Heirloom
   todo cuelga de la plantación; acá debería ser igual: superficie y kg del
   cultivo = suma de sus generaciones. Es lo que hace confiable a la
   Proyección.
   *Camas completadas el 28/09*: 64 generaciones no las tenían porque Heirloom
   exporta "Cantidad (cama)" como "-" cuando la plantación no está asignada en
   su mapa; se sacaron de "Cantidad (m)" ÷ 30. Solo se llenaron celdas vacías.
   Ahora las 79 tienen camas (116 en total).
   *Decidido y hecho el 28/09*: **mandan las generaciones** ("las de Heirloom
   son las más actualizadas; después las modifico desde AMA"). El plan de
   Configuración de Tica se rehízo con `tools/plan_desde_generaciones.py`:
   21 cultivos, 2.784 m², 11.184 kg (antes 29, 4.236 m², 17.172 kg). Salieron
   Ajo, Cebolla, Choclos, Espinaca, Mizuna, Remolacha, Zanahoria y Zucchini,
   que no tienen generaciones; el plan anterior quedó en la hoja oculta
   "Config anterior". Desde la versión 55, sacar una generación en AMA
   también rehace el plan del cultivo (`replanearCultivo`); agregar ya lo
   hacía. **Falta**: editar las camas de una generación existente desde AMA
   (hoy solo se puede correr, ubicar en el mapa o sacar).
2. **Validar rangos plausibles** de rinde (kg/m²), días y distancias al
   planificar y al cargar un cultivo, con aviso visible. Heirloom dejó pasar
   un apio de 120.120 kg; ahora que la Proyección multiplica por precio, un
   error así inflaría la temporada entera.
3. **Franja de heladas en el Plan estratégico**: última helada de primavera y
   primera de otoño en Configuración (con valores de El Hoyo por defecto), la
   franja arriba del gráfico y un aviso si un cultivo de verano (tomate,
   zapallo, berenjena, morrón) sale a campo antes de la última helada. Barato
   y de mucho valor en la Comarca. Después: días a cosecha ajustados por
   grados-día con datos de INTA/SMN, que Heirloom tiene en "beta".
4. **Proyectado vs real por cultivo**: kg cosechados contra esperados, y el
   rinde real de la temporada. Lo calcula el servidor (lección de la ventana).
   Cierra el círculo: el rinde real corrige el de referencia y la Proyección
   de la próxima temporada sale con números propios.
5. **Almácigo: bandejas y semillas.** Con plantas por generación (ya se
   calculan) × margen (30 %) ÷ celdas de la bandeja (128) salen las bandejas;
   con semillas por gramo, los gramos a comprar. La planilla de planificación
   ya tiene esos datos en su hoja "Semillas". La ocupación semanal del
   almácigo es el cuello de botella de primavera.
6. **Tareas que nacen del plan y se cierran solas**: "Para sembrar" ya lo
   hace; sumar "Para trasplantar" y un tablero semanal. Registrar la siembra
   o el trasplante marca la tarea, como en Heirloom.
7. **Carga de trabajo proyectada**: en vez de plantillas inventadas, usar las
   horas reales por actividad que ya se registran (minutos por bancal
   aprendidos de la temporada) → horas por semana y personas en el pico.
8. **Rotación por familia**: las 38 fichas ya tienen familia botánica. Empezar
   a guardar qué familia ocupó cada bancal, y en una temporada más avisar en el
   mapa cuando se repite. (Heirloom tiene familias mal cargadas: ojo con eso.)
9. **Costos y margen por cultivo** (lado Economía): horas × tarifa por área +
   insumos, contra la Proyección. Después de la 4.

Lo que **no** conviene copiar: el permiso "mostrar valores monetarios" ya está
resuelto de otra forma (la plata vive en AMA Economía y AMA solo muestra lo
filtrado); y ojo con la cuenta de Heirloom, que mezcla USD y ARS en los precios.

## Anotado para después — el agente de WhatsApp de Proyecto Bioma

Pedido del 28/09. Un agente con IA que escriba y conteste por WhatsApp:
recordar las horas los días que alguien trabajó ("recordá anotar las horas de
hoy"), pedir stock a los productores, avisos a clientes, respuestas automáticas
en el número del proyecto.

Lo que hay que saber antes de diseñarlo:
- **Solo por la API oficial de WhatsApp Business (Meta, Cloud API).** Las
  librerías no oficiales que manejan un WhatsApp común terminan con el número
  bloqueado. La oficial pide cuenta de Meta Business, un número para el
  proyecto y verificación.
- **Mensajes que inicia el proyecto = plantillas aprobadas por Meta**, y se
  pagan por mensaje (los de "utilidad", como un recordatorio, son baratos).
  Dentro de las 24 h de que alguien escribe, se contesta libre y gratis.
- **Recordatorios**: un disparador diario de Apps Script mira Horas y Tareas,
  decide a quién avisar y manda la plantilla. No necesita IA.
- **Respuestas automáticas**: necesitan un webhook público. El de Apps Script
  responde con una redirección que la verificación de Meta suele rechazar:
  probarlo primero, y si falla, va en un servicio chico aparte. La IA (Claude) contesta con herramientas de solo lectura sobre AMA.
- **Los teléfonos son datos personales**: van en la planilla de accesos, nunca
  en el repo, y cada persona tiene que aceptar recibir mensajes.

Orden sensato: primero el recordatorio de horas (sin IA, una plantilla),
después los avisos, y recién al final el que contesta solo.

## Anotado para después — abonos verdes, corredores y categorías nuevas

Pedido del 27/09, **para cuando esté el mapa de cultivos**. Hoy el catálogo
tiene solo hortalizas; la planificación real de Bioma incluye dos cosas más
que no entran en ese molde:

- **Abonos verdes**: cereales de verano e invierno (trigo, avena, cebada,
  centeno) y leguminosas (vicia, trébol blanco, trébol rojo). No se cosechan:
  ocupan el bancal, fijan nitrógeno y se incorporan. Eso rompe el supuesto de
  todo el sistema, que hoy asume que un cultivo termina en kilos cosechados.
- **Corredores biológicos**: franjas de flores que no son cultivo de renta
  pero sí ocupan espacio y tiempo, y son parte del diseño del campo.

**Lo que hay que agregar** son categorías nuevas en la configuración:
*florales, aromáticas y medicinales*, *nativas perennes*, *cereales*. Después,
poder calendarizarlas con sus fechas de siembra, trasplante y cosecha —o de
incorporación, en el caso del abono verde— y ubicarlas en los sectores con el
mapa.

**Lo que hay que pensar antes de programar**: un abono verde no tiene cosecha
esperada en kilos ni rinde por m². Si entra al catálogo tal cual, va a
ensuciar el plan de la temporada y el porcentaje de lo cosechado. Lo más
probable es que necesite un campo de "tipo" que diga si el cultivo se cosecha
o se incorpora, y que el resumen lo cuente aparte.

## Lo próximo, en orden

### 0. Tres agujeros del alta de personas — salieron del caso de Mili

Mili cargó 7 horas el 15/09 y le calcularon $10.000 la hora en vez de $7.500.
No fue un error de cálculo: **nadie le había asignado tarifa**, y bioma-db usa
`TARIFA_POR_DEFECTO = 10000` para quien no figura.

**Lo que hay que arreglar a mano, ya:** agregar a Mili en la hoja `Config` de
`Registro_Horas_Proyecto_Bioma_T26-27` (la que dice "Configuración —
Trabajadores y tarifas") con $7.500, y correr `importarHoras` en bioma-db.

**Y lo que hay que arreglar en el código, para que no vuelva a pasar:**

1. **Avisar cuando alguien carga horas sin tarifa.** Hoy dar de alta a una
   persona son tres lugares sin relación entre sí: el código de invitación en
   la planilla de accesos, el nombre en la configuración de la chacra (que es
   lo que llena el desplegable "¿Quién trabajó?") y la tarifa en la hoja
   `Config` de la planilla de horas. Si falta el tercero, la persona trabaja y
   cobra mal sin que nada avise. En verano entran cinco personas.

2. **La planilla de horas no guarda quién cargó cada fila.** Escribe
   `marca · fecha · trabajador · horas · actividad · observaciones · área` y
   nada más. Siembras, cosechas y tareas sí guardan "Cargado por"; las horas de
   Tica viajan por el camino viejo de Bioma, que nunca lo tuvo. Para un
   registro del que sale la liquidación de sueldos, no poder saber quién lo
   cargó es un agujero. La app ya sabe de qué teléfono es: hay que mandarlo y
   agregar la columna en `Codigo-horas-bioma.gs`.

3. **Ojo al borrar las hojas "Cuenta individual"**: además de las cuentas, son
   la fuente de respaldo de tarifas si alguien no está en `Config`. Hoy están
   todos en `Config`, así que borrarlas no cambia ninguna tarifa — pero
   conviene confirmarlo antes, que es justo el agujero por el que se coló Mili.

### 0 quinquies. Seguimiento: plan contra real (03/10, etapas 3 y 4)

Hechas las etapas 1 y 2 (planificado/real/previsto, diferencias guardadas en
los registros, origen encargado, cajón). Faltan:
- **Pantalla Seguimiento ("los relojes")**: por temporada, % de etapas a
  tiempo y atraso promedio (Diferencia plan); por cultivo, días reales en
  bandeja contra el catálogo (Diferencia días, solo origen Propio) con la
  propuesta de corregir el catálogo para la temporada siguiente; kg reales
  contra esperados y kg/m²; bancales usados contra planificados; horas por kg.
- **Cosecha por generación** (opcional, la app sugiere la que está en
  ventana): sin eso el rinde y el inicio real de cosecha no se pueden atar a
  una generación, y la barra de cosecha sigue siendo solo prevista.
- Aviso al cargar una siembra si esa generación ya tiene una registrada
  (lo del puerro: diez siembras sobre generaciones repetidas).

### 0 sexies. La guía de uso (06/10)

Publicada en `docs/ayuda/`. Falta:
- **El video** (hay un lugar reservado al final de la página).
- **Captura del mapa**: no se pudo sacar. A unos 960 px de ancho el área del
  mapa queda de 48 px (Plan → Mapa); revisar ese diseño en notebooks chicas.
- Cuando cambie una pantalla, rehacer su captura con
  `ayuda/capturas/datos-ejemplo.js`.

### 0 cuater. Revisar en el catálogo (03/10)

- **"Ajo de verdeo" tiene los datos y la ficha de la cebolla de verdeo**
  (*Allium fistulosum*; días y marco de la fila "Verdeo" de la planilla de
  referencia). Lo usan Foco Verde, Huerma y Tierra Linda. Preguntarles si
  plantan ajo o cebolla de verdeo: si es cebolla, pasar sus generaciones a
  "Cebolla de verdeo" (agregada el 03/10); si es ajo, corregir sus datos (el
  ajo no va en almácigo).
- **"ZZ Prueba"** quedó en el catálogo compartido y le aparece a las seis
  chacras. Borrar la fila en la planilla del catálogo.
- Cebolla de verdeo sin rinde medido (2,5 kg/m² provisorio) y Frutilla con
  datos de bibliografía (INTA / Pro Huerta): corregir con lo que se mida.
- **Berenjena y morrón: 21 a 30 días de almácigo** en el catálogo, cuando en
  la zona suelen pasar 50 a 70 (Tica planifica la berenjena con 60). Desde el
  03/10 el plan manda sobre ese dato en cuanto la generación está planificada,
  pero sigue usándose para lo que no está en el plan y para comparar los días
  reales en bandeja.

### 0 bis. Cerrar el script de horas — es el único secreto a la vista

> **30/09: CERRADO.** Implementado, verificado con una hora real (Marto, con
> "Cargado por") y el Web App del script de horas **archivado** (la dirección
> da 404). La app ya no tiene la dirección ni el camino viejo.
>
> Ojo: la app vieja **bioma-horas** usaba esa misma dirección; si alguien la
> seguía usando, ya no le anda. Las horas se cargan solo en AMA.
>
> Lo que sigue es cómo se hizo.
>
> **30/09: resuelto en el código.** Las horas de Tica viajan con el resto de
> la cola a `Code.gs`, que con la credencial ya validada las escribe en la
> misma hoja de respuestas y con el mismo formato (bioma-db las importa igual:
> lee por nombre de columna). Suma la columna 8, **"Cargado por"**, que cierra
> el punto 2 de arriba. Los nombres del equipo llegan en la configuración
> (`nombres_horas`). La app sigue por el camino viejo mientras el servicio no
> anuncie `horas_por_servicio`, así que nada se rompe antes de implementar.
>
> **Falta, en este orden:** (1) implementar `Code.gs` como Nueva versión;
> (2) `python tools/version_servicio.py` tiene que decir "las horas de Tica
> entran por el servicio"; (3) cargar una hora real desde la app y ver la fila
> con "Cargado por" en la planilla; (4) en la planilla de horas, Extensiones →
> Apps Script → Implementar → Administrar implementaciones → **Archivar** la
> del Web App; (5) sacar `URL_HORAS_POR_DEFECTO` y el camino viejo de la app.
> Hasta el paso 4 la dirección sigue abierta.

Verificado el 17/09 con pedidos reales. El servicio de AMA está bien cerrado:
sin credencial no entrega config, ni cuentas, ni economía, y no escribe nada.
La URL de bioma-mov nunca entró al historial de git.

Pero `Codigo-horas-bioma.gs` **no tiene ningún control de acceso**, y su URL
está en `docs/js/base.js` (URL_HORAS_POR_DEFECTO), que es público. Con esa dirección cualquiera:

- **lee** los 12 nombres del equipo y los últimos registros de horas
  (comprobado: devolvió las 7 h de Mili del 17/09);
- **escribe** filas de horas, y de esas filas bioma-db calcula los sueldos.

**No sirve ponerle una clave**: tendría que viajar en el código de la app. Todo lo que
sabe el navegador es público — por eso cuentas y economía las pide el servidor
con `UrlFetchApp`.

**El arreglo:** que las horas de Tica pasen por el servicio de AMA, que ya
autentica por credencial, y que sea él quien escriba en la planilla de horas.
Después se despublica el Web App de ese script. Resuelve de paso el punto 2 de
arriba —**quién cargó cada fila de horas**—, porque el servicio ya sabe de qué
teléfono viene el pedido.

Toca el camino que ya se cayó dos días una vez (los tres `f.proyecto`). Hacerlo
con tiempo, ejercitándolo en el navegador antes de publicar, y no el mismo día
que otro cambio grande.

### 0 ter. Los trasplantes no se podían registrar — CERRADO el 23/09

**Verificado con un registro real**: Hakusai G1, 22/09, sector Primavera bancal
4. La hoja se creó sola, 42 días en almácigo contra 38 teóricos, 180 plantines
(30 m ÷ 50 cm × 3 líneas), marco "Modificado" porque el plan decía 40 cm. Los
almácigos esperando bajaron de 23 a 22: la cadena almácigo → bancal cierra.

Lo que sigue abajo queda como registro de la causa, porque el patrón se repite.

Empezaron los trasplantes y no se podía cargar ninguno: no aparecían en la
lista ni se creaba la hoja. **La causa: la app pedía `&n=15`**, o sea las
últimas quince siembras. La hoja tiene 27, así que los almácigos de agosto
—Lechuga, Acelga, Repollo bco, Kale, Hakusai, Coliflor, justo los que se
trasplantan ahora— quedaban fuera de esa ventana. Como el formulario exige
elegir un almácigo de la lista, no había nada que elegir.

Es **el mismo error que tuvieron las horas**, que sumaban solo los últimos diez
registros. La regla que sale de esto: *lo que se cuenta sobre todo el historial
se calcula en el servidor, nunca sobre la ventana que recibe el teléfono.*

Arreglado con un endpoint nuevo, `?almacigos=1`, que recorre la hoja Siembras
entera y descuenta lo que ya figura en Trasplantes.

**De paso se tapó un agujero de pérdida de datos**: un registro de un tipo que
el servicio no reconocía se descartaba en silencio —no entraba en `guardados`
ni en `no_guardados`, la respuesta salía `ok` y la app lo borraba de la cola
dándolo por enviado—. Ahora vuelve por id y se muestra el motivo.

**Falta que Martín redespliegue el Apps Script** (Nueva versión, no Nueva
implementación). Hasta que lo haga, la app cae en el comportamiento viejo y
sigue sin poder registrar los almácigos de agosto.

### 1. Importar el catálogo de cultivos desde la planilla de planificación

La hoja **"información de cultivos"** de
`1pJgIx7oG0qqSluiCpF8-zeS0Ni_gSwNrGGBz1d6juLk` tiene 30 cultivos con datos más
finos que los del catálogo de AMA. Dos diferencias que valen el trabajo:

- **Los días de almácigo son dos, no uno**: máximo en otoño-invierno y mínimo
  en primavera-verano. Las diferencias llegan a 20 días (Albahaca 50/30, Apio
  60/45, Lechuga 45/30). AMA usa el promedio, y eso explica que el Coliflor
  sembrado el 20/07 tardara 48 días reales contra los 35 que estimaba.
- **Días en cosecha**, también con máximo y mínimo. AMA no lo tiene.

**Decidido sobre los nombres** (los mismos cultivos escritos distinto en cada
lado; hay que elegir uno porque queda escrito en los datos de las cinco
chacras): **Choclo** y **Pimiento**, no "Choclos" ni "Morron".

**Falta decidir**, mismo criterio:
- ¿`Repollo` o `Repollo bco`?
- ¿`Hakurei` o `Nabo Hakurei`?
- `Verdeo` — ¿es lo mismo que algo que ya está, o un cultivo nuevo?

**Falta también** el id de la planilla de catálogo (una planilla vacía nueva;
la hoja se arma sola) para cargarlo en la propiedad `PLANILLA_CATALOGO` del
script. Sin eso, los cultivos que agreguen las chacras no tienen dónde
guardarse: el alta ya está en la app pero el servicio los rechaza.

*La hoja NO resuelve los cinco que pidió Huerma —cilantro, pepino, pepinillo,
ají y mizuna—: no están ahí. Esos los carga quien los cultiva.*

### 2. Migrar la app de economía — domingo 20/9, con los dos teléfonos

Decidido: el repositorio pasa a llamarse **`ama-economia`** y se suma
**credencial por dispositivo**, como en AMA. Hay que hacerlo con los dos
teléfonos delante (el de Martín y el de Luna) porque hay que reinstalar.

**Por qué con los teléfonos delante.** Al cambiar de dirección, el navegador ve
una app nueva y su almacenamiento arranca vacío. Eso implica dos cosas que no
se deshacen: lo que esté cargado y sin sincronizar **se pierde**, y hay que
volver a escribir la URL de sincronización a mano en cada teléfono.

**El orden, sin saltarse ninguno:**

1. **Sincronizar los dos teléfonos** y confirmar que no queda nada sin subir.
   Es el paso que evita perder datos; todo lo demás es recuperable.
2. **Anotar la URL de sincronización** antes de tocar nada (botón ⭳ → campo
   "URL de sincronización"; si se pierde, está en la página de implementaciones
   del Apps Script).
3. **Renombrar** con `gh repo rename ama-economia`, actualizar el remoto local
   y las menciones en `README.md`, `CLAUDE.md` y `js/sincro.js`.
4. **Reinstalar** en los dos teléfonos desde la dirección nueva y volver a
   poner la URL.

**El control de acceso va después, y en dos tiempos**, para que no haya ninguna
ventana en la que algo pueda dejar de andar:

1. El `Code.gs` de bioma-db acepta escrituras **con y sin** credencial. No
   rompe nada porque lo viejo sigue funcionando. Se canjea el código en los dos
   teléfonos y se confirma que cargan bien durante unos días.
2. Recién entonces se cierra, y las escrituras sin credencial dejan de
   aceptarse. Si algo falla en el paso 1, se saca y queda como estaba.

Conviene dejar unas semanas entre el renombre y el acceso: son dos cambios
grandes y mezclarlos hace imposible saber cuál rompió qué.

### 3. Jubilar "Registro de pagos realizados" — HECHO el 23/09

Martín borró las hojas de pagos individuales y "Registro de pagos realizados".
**Verificado después**: la tarifa de Mili sigue saliendo $7.500 (no los $10.000
por defecto), así que `Config` quedó intacta y las cuentas se calculan bien.

Quedan, y no se tocan: `Respuestas de formulario 1` (el buzón donde AMA
escribe) y `Config` (trabajadores y tarifas).

**Lo que queda abierto**: los trabajadores ahora solo pueden ver su cuenta en
la app. Acordado que la planilla de horas se comparta **como Lector** para el
detalle fila por fila —ojo: ahí cada uno ve las horas de todos—. Si hay gente
que no va a usar la app, la opción es que el servidor genere una hoja por
persona de solo lectura desde bioma-db; sería un reflejo, no una fuente, que
es lo que diferenciaba a las hojas viejas. No hacerlo si no hace falta.

### 3 bis. Jubilar "Registro de pagos realizados" — texto original
En la planilla de horas. Ya está destrabado: la pantalla de AMA funciona, así
que la contabilidad de sueldos vive solo en bioma-db. Es el punto 4 de la
Fase 4.8 de bioma-mov.

### 4. Dos cosas de los datos, no del código — de Martín
- **El 91,4% de los ingresos de la temporada son préstamos** ($7.070.000 de
  $7.733.211). Coherente con septiembre, pero es lo primero que van a ver los
  socios al abrir la pantalla. Vale una frase de contexto si sorprende.
- **"Planificación" en Hortícola son 100 h**, la actividad más grande de la
  temporada, un cuarto del total. Cuadra con julio; conviene confirmarlo.

### 5. Qué hojas de la planilla de horas se pueden borrar
Lo que AMA necesita sí o sí: **`Respuestas de formulario 1`** y **`Config`**.
Sin uso y se pueden borrar: las 12 pestañas "Cuenta individual", "Resumen
general de horas y pagos" y "Gestión de pagos". AMA ya **no lee** `Registro Horas` ni `Pagos`: se apagó el espejo de las
planillas individuales, que era lo único que las usaba. Falta confirmar qué
lee bioma-db antes de borrarlas.

---

## Lo viejo que sigue esperando

- **Una persona en varias chacras, desde un solo teléfono.** Juanfra trabaja en
  Tica, Tierra Linda y La Huertota. Por ahora se resolvió con **tres
  navegadores distintos** en el mismo teléfono (Chrome/Firefox/otro), que
  funciona porque cada uno tiene su propio almacenamiento y el servicio ya
  acepta varias credenciales del mismo dispositivo. Se decidió así en sept 2026
  porque es el único caso; cuando sean varios, el diseño es este:

  1. **Una credencial por chacra** en lugar de una sola. Hoy cambiar de chacra
     borra la credencial.
  2. **Cada registro de la cola guarda su chacra**, y al sincronizar se agrupa
     por chacra. **Esto primero, antes que la interfaz**: hoy la cola no guarda
     la chacra y `sincronizar()` manda todo a la activa, así que cargar sin
     señal y después cambiar de chacra escribe los datos en la planilla
     equivocada, sin aviso y sin rastro.
  3. **Los cachés separados por chacra** (config, resumen, tareas, últimos):
     hoy hay uno solo y se sobrescribe, así que sin señal después de cambiar se
     ven los sectores de la otra chacra.
  4. **La chacra activa, siempre visible en la barra superior.** El peor error
     posible acá es humano: cargar media jornada en la chacra equivocada. La
     única defensa es que se lea sin buscarlo.

  Nada de esto toca el servidor: `canjearInvitacion` ya permite que un mismo
  dispositivo canjee en varias chacras, y `permitido()` busca por la huella de
  la credencial, así que tres filas del mismo teléfono no se confunden. Sí toca
  el almacenamiento de los teléfonos en uso, así que necesita migración y no
  conviene hacerlo el mismo día que la migración de la app de economía.

- **Editar y borrar registros** desde AMA. Es lo que hoy obliga a compartir las
  planillas como Lector en vez de Editor.
- **Identificadores por persona** en lugar del nombre como llave. Ya falló una
  vez. Conviene hacerlo antes de que entren las cinco personas del verano.
- **Secciones que faltan** de la app original: Sanidad (aplicaciones y
  monitoreo), Riego y Stock.
- **Mover `Code.gs` a un proyecto propio**, fuera de la planilla de Tica. Hoy
  si esa planilla se rompe se cae la app para las cinco chacras.
- **La Milpa** sigue sin sus códigos pegados en la hoja Invitaciones.
- **Huerma, La Milpa y La Huertota** no tienen plan de temporada cargado, así
  que no aparecen en el panel compartido.
- **Fase 4.5 de bioma-mov** (análisis de ventas) y los SKU en Whataform.

---
