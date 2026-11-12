# AMA · App de Monitoreo Agrícola Agroecológico — contexto del proyecto

Se lee solo al abrir el proyecto. Es la memoria: qué es esto, cómo está hecho,
qué se decidió y qué errores ya cometimos. Antes de proponer cambios, leer
también `PENDIENTES.md` (dónde quedamos) y `DECISIONES.md` (por qué las cosas
son como son).

## Qué es

App de monitoreo productivo para emprendimientos agroecológicos, usada por
**seis chacras de la Comarca Andina**: Chacra Tica, Huerma, Foco Verde,
La Milpa, La Huertota y Tierra Linda. Cada una tiene su planilla, su configuración y su
gente; comparten el catálogo de cultivos y las áreas de trabajo.

- **App publicada:** <https://martintrigo.github.io/MonAgric/>
- **Repositorio: PÚBLICO**, AGPL-3.0. Nunca subir URLs de Web App ni claves.
- **El nombre es AMA · Aplicaciones para el Manejo Agroecológico** (28/9/2026),
  con tres versiones: **AMA Producción** (esta), **AMA Economía** (bioma-mov) y
  **AMA Salud** (a futuro). La carpeta, el repositorio y las claves internas
  siguen siendo `monagric`: renombrarlas le borraría a cada teléfono su
  credencial y lo que tenga sin enviar. **No tocar.**

## El ecosistema

Desde el 23/10/2026 todo AMA vive en `C:\MARTO\INFORMATICA\AMA\`. El mapa del
sistema y las reglas comunes están en `AMA\CLAUDE.md`. Esta app es
`AMA\produccion` (el repositorio sigue llamándose `MonAgric`).

| Proyecto | Carpeta | Qué hace | Relación |
|---|---|---|---|
| **AMA Producción** (esta) | `AMA\produccion` | Siembras, trasplantes, cosechas, tareas, horas | — |
| **AMA Economía** (`bioma-mov`) | `AMA\economia` | Economía de Proyecto Bioma | Calcula las cuentas y el resumen que AMA muestra |
| **Planilla de horas** (`bioma-horas`) | `AMA\_archivo\horas-bioma` | Planilla histórica de horas | Tica sigue cargando ahí, ahora por `Code.gs` |
| **Cocina Viva** | `INFORMATICA\Cocina Viva` | Ventas y stock de fermentos | Misma arquitectura, más madura |

**Las dos apps se gestionan desde la misma conversación** (desde el 15/9/2026),
abierta en la carpeta `AMA`. El contexto de Economía está en
`AMA\economia\CLAUDE.md`, que es tan importante como este archivo: leerlo antes
de tocar economía.

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
docs/ayuda/         la guía de uso (botón «Ayuda» de la barra): página aparte, el
                    service worker NO la guarda, así no pesa en el teléfono. Las
                    capturas son de una chacra inventada: rehacerlas con
                    ayuda/capturas/datos-ejemplo.js (instrucciones adentro).
                    Nunca capturas con datos de una chacra real: el repo es público
apps-script/Code.gs            el "servidor" de las seis chacras
apps-script/Codigo-horas-bioma.gs  script aparte, vive en la planilla de horas
                    (Web App archivado el 30/09: Code.gs escribe esas horas)
tools/*.py          herramientas de administración (usan clave de admin)
```

**Dónde vive el servidor:** `Code.gs` está dentro de la planilla
**MonAgric Datos 2026-27** (que es también la de Chacra Tica), en Extensiones →
Apps Script. Atiende a las seis chacras. Es una fragilidad conocida: si esa
planilla se rompe, se cae la app para todos. Mover el script a un proyecto
propio está pendiente y no es urgente.

**Estilo (10/10):** letra **Figtree** (en `docs/fuentes/`, licencia OFL; la
misma que AMA Economía), verdes claros hacia el lima, y **modo claro y
oscuro**: el oscuro sigue al teléfono salvo que se elija a mano en Ajustes
(`monagric_tema` → `data-tema` en `<html>`, aplicado en el `<head>` antes de
dibujar). **Todo color va por las variables de `:root` en `styles.css`**, que
se redefinen para el oscuro: un color escrito a mano en el CSS o en el
JavaScript no cambia con el modo y queda ilegible. Las barras de cultivos
(`colorEtapa`) son la excepción a propósito: se leen en los dos modos.
AMA Economía tiene su propia paleta (vino), con la misma letra.

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
  recupera de ahí. Borrar y corregir tocan **todas** las filas con ese id
  (01/10: dos cosechas repetidas "volvían" porque se borraba solo la primera
  copia). Los botones aparecen solo si la configuración trae
  `corregir: true` (servicio nuevo); contra uno viejo quedarían en la cola.
- La generación del plan tiene **Variedad** (columna al final de la hoja).

## Planificado, real y previsto (03/10)

Cada etapa de una generación tiene tres fechas. Es el corazón del
seguimiento: ver en tiempo real qué pasa en el campo y, temporada tras
temporada, tener un catálogo con fechas reales.

- **Planificada**: la de *Plan generaciones*. Se mueve (arrastrar, editar)
  solo mientras la generación no se sembró. Después es la **línea de base** y
  no se toca: una sembrada no se arrastra ni se edita su fecha.
- **Real**: Siembras / Trasplantes. Se cambia solo con Corregir.
- **Prevista**: lo que falta = última fecha real + días teóricos. Desde el
  09/10 los días teóricos de lo ya sembrado son los del **catálogo para la
  estación de la siembra real** (`diasBandejaPrevistos`), con el plan de
  respaldo; antes eran los del plan de la generación, y corregir el catálogo
  no movía nada (la coliflor G2 pedía trasplante a los 35 días del plan
  cuando la G1 había tardado 41). Lo **encargado o comprado** va al bancal el
  día que llega (columna "Trasplante estimado"), nunca siembra teórica +
  días (`previstoDesdeSiembra`). Lo planificado sigue con los días del plan
  (`diasBandejaDe`). Ver también `trasplantadaEl` y `tramosDe`. Al
  registrar la siembra o el trasplante, la barra se corre sola y deja una marca
  punteada donde estaba lo planificado.
- **Los datos de los cultivos se corrigen en la planilla «AMA - Catálogo de
  cultivos»** (hoja Cultivos; propiedad `PLANILLA_CATALOGO`): un número ahí
  le gana a `catalogo.json`; vacío o 0 no borra. Los días de almácigo por
  estación son las columnas N (otoño-invierno, abril a septiembre) y O
  (primavera-verano): ganan sobre C. El servidor la recuerda 10 minutos.
- **Lo que dice la planilla le gana a la copia del teléfono.** El teléfono
  guarda lo que envió (`enviados`, los últimos 60); al juntarlo con lo del
  servicio va **después**, solo para sumar lo que el servicio todavía no
  tiene. Al revés (10/10), una siembra corregida en la planilla («Propio» →
  «Encargado») seguía viéndose como estaba en el teléfono que la cargó, y la
  berenjena salía atrasada.
- **En el gráfico del plan**, dentro de cada cultivo las barras van G1, G2,
  G3… de arriba hacia abajo (09/10), aunque se hayan sembrado en otro orden.
- **Dónde queda la diferencia**: en el registro mismo, congelada al cargarlo:
  columnas "Fecha planificada" y "Diferencia plan" en Siembras y Trasplantes
  (cumplimiento del plan). Aparte, Trasplantes guarda "Días en almácigo" contra
  "Días teóricos" del catálogo (calibración). **No mezclar las dos.**
- **Origen** en Siembras: Propio / Encargado / Comprado. Si no es propio, el
  formulario pide cuándo llega listo y guarda una siembra **teórica** (llegada
  − días en bandeja); esa no cuenta para medir días reales en bandeja.
- **Cajón** (sin alvéolos) en Alvéolos: los plantines se cuentan, no se
  multiplican.
- Las columnas "Trasplante estimado" / "Cosecha estimada" de Siembras son una
  foto del día de carga: la pantalla usa siempre lo previsto. (La berenjena
  "atrasada 31 días" del 03/10 salió de ahí.)
- `generaciones` trae `trasplantada_el` del servicio (`cfg.seguimiento`).

## El tablero de Inicio: plan contra real (11/11)

Cuatro relojes y la curva de cosecha acumulada, en `js/tablero.js`. Es la
etapa 1 de `PROMPT-TABLERO.md`.

- **Los hechos los cuenta el servicio** (`?seguimiento=1`, `seguimientoDe`):
  cosecha sumada por semana y cultivo, siembras encargadas, generaciones con
  siembras repetidas, fechas futuras. Solo lo fechado en la temporada (1/7 a
  30/6, por la fecha de inicio de la configuración). El plan cruzado con las
  siembras ya venía en `?generaciones=1`.
- **Lo esperado lo calcula la app con `tramosDe`**, la cuenta que dibuja el
  plan estratégico: el tablero y el plan no pueden decir cosas distintas.
- **Lo esperado usa la fecha PLANIFICADA, no la prevista** (`ventanasDeCosecha`):
  si una siembra se atrasó, lo esperado no se corre con ella. Los kilos de
  cada generación se reparten parejo en sus días de cosecha.
- **Cada reloj dice de qué está hecho** («8 de 19 etapas que tocaban») y al
  tocarlo abre el detalle. Nunca un porcentaje solo.
- **Ritmo**: etapas (siembra y trasplante de cada generación) fechadas hasta
  hoy que ya se hicieron. Una generación partida cuenta una vez.
  **Puntualidad**: mediana de días contra el plan y % dentro de ±7 días; la
  siembra de plantines encargados no se mide. **Confianza del dato**: lo que
  puede hacer mentir a un reloj (almácigo vencido sin trasplante cargado,
  siembra del plan sin registro hace más de 30 días, siembras repetidas,
  fechas futuras, cosecha sin cargar).
- La proyección «a este ritmo» prolonga la proporción de hoy; no se calcula
  hasta que el plan esperaba el 3 % de la temporada.
- Sin generaciones en el plan no hay tablero: queda el Inicio de antes. Contra
  un servicio sin `cfg.tablero`, anda todo menos la línea semanal de cosecha.
- **Falta decidir** qué es «la temporada vigente» cuando la configuración no
  se actualizó: por eso `calcularResumen` sigue sumando las hojas enteras.

## Una generación, una siembra (11/11)

- **La app no deja cargar dos veces la misma generación por error.** Al
  elegir el cultivo propone la que sigue (`generacionQueSigue`: la primera del
  plan sin sembrar) y, si esa generación ya tiene siembra, no guarda. Así
  entraron dos Coliflor G1 cuando la segunda era la G2.
- **Repetir una generación se dice a propósito**, en «Esta siembra es»
  (columna **Repetición** de Siembras, al final):
  - *Otra tanda*: otra variedad o más bandejas. Es parte de la siembra.
  - *Resiembra: motivo*: se repuso lo que falló. No corre la fecha de siembra
    de la generación ni se mide contra el plan.
- **La siembra de una generación es la más temprana de las suyas, sin contar
  resiembras** (`laPrimera`, en `generacionesDelPlan`). Antes era la primera
  fila de la hoja: el Zapallito G1, sembrado el 29/09 y resembrado el 30/10,
  figuraba un mes atrasado.
- Qué generaciones ya tienen siembra lo dice el servicio sobre la hoja entera
  (`sembradas`, en `?seguimiento=1`), también para cultivos fuera del plan.
- Una resiembra en bandeja espera trasplante como cualquier almácigo: aparece
  en «Para trasplantar» con la marca «(resiembra)».
- El campo aparece solo si el servicio lo guarda (`cfg.repeticion`).
- Una generación es una **fecha de siembra**, no una variedad: tres variedades
  sembradas el mismo día son una generación con tres tandas.

## Terminar una generación y rinde logrado (12/11)

Dos preguntas distintas, dos medidas: **¿venimos a tiempo?** (Cosecha a hoy,
Ritmo, Puntualidad) y **¿los bancales rinden lo esperado?** (Rinde logrado).
La segunda no mira fechas: el Hakusai que se cosechó antes porque se fue en
flor parecía un éxito en «Cosecha a hoy» y había rendido menos.

- **Una generación se termina** en Cosechas → «Terminar una generación»
  (`js/cierres.js`): cómo terminó (cosecha completa, se fue en flor, plaga o
  enfermedad, malezas, no germinó, clima, otro) y **los kilos que dio en
  total**. Va a la hoja **Cierres**, una fila por generación (cultivo +
  número: las partes de una generación partida se cierran juntas). Reabrir
  es borrar esa fila.
- **Rinde logrado** = kilos de los cierres ÷ kilos esperados de esos bancales
  (`rindeLogrado`, sobre `ventanasDeCosecha`).
- **La cosecha puede decir de qué generación es** (columna «Generación» de
  Cosechas, optativa). La app la pone sola únicamente cuando ese cultivo
  tiene una sola generación abierta en el campo (`generacionEnCosecha`); si
  no, queda sin asignar y se reparte al cerrar: el formulario de cierre
  propone lo asignado más lo que queda sin asignar (`kgSinAsignar`).
- **Lo que cambia al terminar**: sale de «Para trasplantar», su etapa sin
  hacer deja de contar en el Ritmo, `tramosDe` la corta en la fecha de cierre
  (libera el bancal en el mapa y en Stock por semana; lo previsto queda en
  `sinCierre`) y **se espera todo de ella desde ese día** (`esperadoAl`): así
  la pérdida se ve en «Cosecha a hoy» en vez de borrarse.
- Los cierres llegan con `?seguimiento=1`. La app suma encima los de su cola
  y los enviados hace menos de diez minutos (`cierresVigentes`); después
  manda la planilla.
- Todo aparece solo si el servicio lo guarda (`cfg.cierres`).
- **El catálogo no se toca hasta el verano** (decidido el 12/11): los días de
  trasplante a cosecha del Hakusai (105) y del Mix de hojas (52) son mucho
  más de lo que tardaron en Tica. Se sigue registrando y se ajusta con los
  datos de primavera.

## El lugar: planificado y plantado (13/11)

**El mapa es el plan**: dónde y cuándo va cada generación, y qué sigue en cada
bancal cuando se libera. Después se ejecuta, y lo que cambie se rectifica
(pedido de Martín, 12/11). Por eso el lugar tiene dos versiones, igual que
las fechas:

- **Planificado**: sector y bancales de «Plan generaciones». Se arrastra en
  el mapa mientras la generación no fue al campo.
- **Plantado**: lo que dicen los registros —Trasplantes y, en siembra
  directa, Siembras—. Lo arma el servicio sobre las hojas enteras y viaja en
  cada generación como `lugar_real` (`cfg.lugar_real`). Es un hecho: en el
  mapa va lleno, no se arrastra, y se corrige corrigiendo el registro (✎).
- Si se plantó en otro lado que el planificado, lo planificado queda en el
  mapa **en contorno punteado**, para comparar. No se borra.
- **Qué bancal está ocupado** se calcula con lo plantado si la generación ya
  fue al campo y con lo planificado si no (`lugaresDe`, en `plan-mapa.js`).
  Lo usan los choques del mapa, los bancales libres, el croquis de Plan y
  «qué hay en este bancal» de Stock. `bancalesPlanificados` (lo que completa
  el formulario de trasplante) sigue siendo el plan.
- Lo plantado es de la generación entera (cultivo y número); si está partida
  en partes se le cuenta a la primera.
- **Sector y bancal no vienen elegidos en ningún formulario**
  (`opcionesBancal`): venía puesto el primero de la lista y hay siembras de
  Tica en «Primavera 1» y «Frutillar 1» que casi seguro son ese valor sin
  tocar.
- **Cuando los sectores cambian**, los registros viejos se traducen con
  `tools/corregir_sectores.py` (`corregirLugares` en el servicio): toca solo
  sector y bancal, deja copia en Cambios, y sin `--aplicar` solo simula.

## El mapa y los sectores que cambian (13/11)

- **Una generación está ubicada solo si su lugar existe** (`estaUbicada`, en
  `plan-mapa.js`): el sector está en la configuración y tiene esos bancales.
  Tica partió «Primavera» (27) en «Primavera A» y «B» (12 cada uno) y 23
  generaciones quedaron apuntando a un sector que ya no estaba: el mapa no
  las dibujaba y la lista no las ofrecía. Ahora cuentan como sin ubicar, y
  la lista dice dónde estaban (`ubicacionPerdida`). El dato viejo no se
  borra de la planilla: se pisa al ubicarla de nuevo.
- **La lista del mapa muestra todas las generaciones**: primero las que
  faltan y, más claras, las ya ubicadas, con ✎ (elegirla para moverla) y ✕
  (sacarla del mapa).
- Renombrar o partir un sector no corrige lo ya registrado: los trasplantes
  y el stock cargados antes siguen diciendo el sector viejo.

## Stock: una foto, no una cuenta (23/10)

- Cada registro dice "esto había acá, este día". **Lo vigente de un lugar es
  su último registro, nunca la suma** (la app vieja sumaba y contaba dos veces
  lo relevado el lunes y el jueves). Lugar = tipo + sector y bancal (en
  campo) o lugar (cámara…) + cultivo + variedad. Cantidad 0 = agotado.
- **Lo vigente lo calcula el servicio** sobre la hoja entera (`stockDe`,
  `?stock=1&fecha=&desde=`), no el teléfono con sus últimas 15 filas. La app
  le suma encima solo lo que cargó y el servicio todavía no tenía al pedirlo
  (`stockAl`): sumar lo ya enviado resucitaba lo que otro marcó agotado.
- Los días a cosecha se guardan también como fecha («Disponible desde»):
  "7 días" cargado hace dos semanas ya es "listo".
- El servicio avisa `cfg.stock`; sin eso la pestaña no se muestra.
- **Tipos** (10/11): En campo, Cosechado, Elaborado, Fruta, Plantines, Otro.
  Los plantines se guardan como «Plantín de X»: Economía junta el stock por
  nombre sin mirar el tipo y se sumaban a los kilos de la verdura. Elaborado,
  Fruta y Otro ofrecen los productos de la chacra (`cfg.productos`, de la
  planilla en `PRODUCTOS_PLANILLAS`, guardados en `monagric_productos`),
  **nunca con precios**.
- **Por semana** (24/10): semanas de lunes a domingo. Una barra relevada
  dura los «días en cosecha» del catálogo con la cantidad anotada, que **no
  se reparte** entre semanas: la lista muestra kilos solo la semana en que
  algo entra. Las barras punteadas del plan son generaciones en cosecha sin
  relevar (un registro del cultivo en sus bancales posterior a su ida al
  campo, agotado incluido, las tapa). Relevado y plan nunca se suman.
- Comercialización lo pide por endpoint (31/10): `?stockcomercial=1` con la
  clave de la proyección, servidor a servidor, para la pestaña Semana de AMA
  Economía. Solo lo vigente, sin quién relevó. Nunca copias de la planilla.

## Multi-chacra: lo que no hay que romper

Cinco de las seis chacras no tienen nada que ver con la economía de Bioma.

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

## Sectores con bancales de otro largo (03/10)

Cada sector puede tener su propio largo de bancal (Configuración → Sectores;
vacío = el de la chacra). Superficie, plantas, kilos, bandejas y plantines
salen de `largoDe(sector)` / `bancalM2(sector)` en catalogo.js, y el plan de
un cultivo suma cada generación con el largo de su sector (`filaDelPlan`). Una
cuenta nueva de m² o de plantas va por ahí, nunca por `CFG.bancal.largo_m`.
El sector y el bancal de una generación se cambian también desde el editor de
Plan → Cultivos, no solo en el mapa (que en el teléfono no está).

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
Stock (desde el 23/10), Plan/Configuración, Cuentas (solo Tica) y el juego.

Faltan del original: **Sanidad** (aplicaciones y monitoreo) y **Riego**. También **editar y borrar registros**, que es lo que hoy obliga a
compartir las planillas como Lector.

**Lo que sigue está en `PENDIENTES.md`** — leerlo antes de proponer nada.
