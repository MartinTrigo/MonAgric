# MonAgric Web

App para que los integrantes de la chacra registren desde el celular, con solo
un enlace: **siembras**, **horas de trabajo** y **cosechas**. Muestra el plan de
la temporada y compara lo planificado con lo logrado.

Los registros se guardan primero en el teléfono (funciona sin señal en el campo)
y se envían a una **planilla de Google Sheets** cuando hay conexión.

**La app está publicada en https://martintrigo.github.io/MonAgric/**

## Lo que falta para conectarla con la planilla

### Paso 1 — La planilla ✅

Ya está creada en tu Drive:
[**MonAgric Datos 2026-27**](https://docs.google.com/spreadsheets/d/1PrP0FDXG-45iSYWwx8osn5tgVaxiBgbbBDOf8PC7uYQ/edit).
Las pestañas (Siembras, Horas, Cosechas) se crean solas con el primer registro.

> Esto es solo para **siembras y cosechas**. Las horas ya funcionan: van a la
> planilla del proyecto, que tiene su propio servicio publicado desde julio.

### Paso 2 — Publicar el servicio (Apps Script)

1. Abrí la planilla y andá a **Extensiones → Apps Script**.
2. Borrá lo que haya en el editor y pegá todo el código de
   [`apps-script/Code.gs`](../apps-script/Code.gs).
3. Arriba a la derecha: **Implementar → Nueva implementación**.
4. Tipo **Aplicación web**, con:
   - *Ejecutar como*: **Yo** (tu cuenta).
   - *Quién tiene acceso*: **Cualquier persona**.
5. **Implementar**, autorizá los permisos y **copiá la URL** que termina en `/exec`.

> La planilla queda en tu Drive y solo la ves vos. "Cualquier persona" significa
> que la app puede *enviarle* datos sin que cada integrante inicie sesión.

### Paso 3 — La app publicada ✅

Ya está en https://martintrigo.github.io/MonAgric/ (GitHub Pages sirve la
carpeta `docs/` de la rama `main`; se actualiza sola con cada `git push`).

### Paso 4 — Conectar y repartir

1. Abrí ese enlace, tocá el engranaje (**Ajustes**), pegá la URL del paso 2 y
   tocá **Probar conexión**.
2. Pasales el enlace a los integrantes por WhatsApp. En el celular, desde el
   menú del navegador: **"Agregar a pantalla de inicio"**.
3. Cada integrante elige su nombre en Ajustes y pega la misma URL (una sola vez).

## Qué hace cada sección

La barra de abajo deja **Inicio** y **Plan** fijos en las puntas; el medio se
desliza con el dedo, así se pueden ir sumando secciones (trasplantes, manejo,
sanidad) sin que quede todo apretado.

| Sección | Para qué sirve |
|---|---|
| **Inicio** | Temporada activa, m² y kg planificados, y cuánto se lleva cosechado |
| **Horas** | Quién trabajó, cuántas horas y en qué actividad |
| **Tareas** | Lo que hay que hacer, con importancia y fecha. Se marcan como hechas y todo el equipo ve la misma lista |
| **Siembras** | Fecha, cultivo, variedad, tipo, generación, bandejas o sector/bancal |
| **Cosechas** | Kilos por cultivo y bancal, con el rinde en kg/m² |
| **Plan** | Los 28 cultivos planificados, sectores de riego e integrantes |

En los campos de cultivo hay un **buscador**: se escribe para filtrar (sin
importar tildes ni mayúsculas) o se toca para ver la lista completa, con los del
plan de la temporada primero.

## El juego

Abajo del inicio hay un acceso discreto a **Pac-Farm**, que vive en `docs/juego/`
y se juega en `.../MonAgric/juego/`. Reconoce solo quién sos y de qué chacra,
porque comparte el dominio con la app, y el ranking es entre los de tu chacra.
Los puntajes van a una planilla propia del juego, no a la de la producción.

El original está en [pac-farm](https://github.com/MartinTrigo/pac-farm); acá hay
una copia con un enlace para volver a la app.

## Sugerencias

En el inicio hay un cuadro **"¿Qué mejorarías de la app?"**. Lo que se escribe
ahí cae en la planilla *MonAgric · Sugerencias*, con la chacra y quién lo mandó.
Es la misma planilla para todas las chacras, para leer todo junto.

## Varias chacras

Un mismo enlace sirve para todas las chacras. Cada persona elige la suya la
primera vez y a partir de ahí sus registros van a la planilla de esa chacra:

```
                    ┌─→ MonAgric · Chacra Tica
App web  →  Apps ───┼─→ MonAgric · Chacra 2
(1 enlace)  Script  └─→ MonAgric · Chacra 3
```

**Lo que es igual para todas** (y por eso se puede comparar entre chacras) vive
en `catalogo.json`: los cultivos, sus perfiles (días a cosecha, rinde de
referencia, distancias), las actividades de trabajo y los tipos de siembra. No
se edita desde la app. Se genera con:

```
python tools/exportar_catalogo.py
```

**Lo que configura cada chacra** desde la sección Config de la app: nombre,
temporada, medidas del bancal, sectores con sus bancales, quiénes trabajan y el
plan de cultivos. Queda en la hoja `Config` de su propia planilla y se puede
corregir desde el teléfono cuando haga falta.

### Sumar una chacra

1. Crear una planilla nueva en Drive, por ejemplo *MonAgric · Chacra X*.
2. En el editor de Apps Script: **Configuración del proyecto → Propiedades del
   script**, y en la propiedad `CHACRAS` agregar el código y el id de la
   planilla: `{"tica":"1PrP0F…","chacrax":"1AbC…"}`
3. **Implementar → Administrar implementaciones → lápiz → Nueva versión.**
4. Agregar la chacra a la lista `CHACRAS` al principio de `app.js` y publicar.

Para arrancar con una configuración ya cargada en vez de tipearla:

```
python tools/sembrar_config.py tica
```

### Las horas

Chacra Tica las manda a la planilla del proyecto Bioma, donde está el historial
desde julio. Las demás chacras las guardan en la hoja `Horas` de su propia
planilla, igual que el resto de los registros.

## Traer los datos a la app de escritorio

La app web escribe en la planilla y la de escritorio trabaja con su propia base,
así que **no se sincronizan solas**. Para bajar a la base lo que se cargó desde
los celulares:

```
python tools/importar_de_planilla.py https://script.google.com/macros/s/.../exec
```

La primera vez se le pasa la dirección del servicio y queda guardada; después
alcanza con `python tools/importar_de_planilla.py`. Se puede correr las veces
que haga falta: cada registro trae el id que le puso el celular y no se duplica.

## Las horas van a la planilla de siempre

La sección de horas reemplaza a la app **bioma-horas**: escribe en la **misma
planilla** del proyecto ([Registro_Horas_Proyecto_Bioma_T26-27](https://docs.google.com/spreadsheets/d/1tx8V0VLciiTLFvAmSViAR6KV9LL9hXzvX6-qy30Ubpg/edit)),
con las mismas columnas y a través del mismo servicio de Apps Script. El
historial cargado desde julio sigue intacto y las filas nuevas se suman abajo,
sin importar si se cargaron desde la app vieja o desde MonAgric.

Por eso **la sección de horas funciona desde el primer momento**, sin configurar
nada: la dirección del servicio ya viene puesta.

**La lista de nombres sale de esa planilla**, de la pestaña `Config` (columna A),
y se completa con los integrantes de la temporada. Para sacar a alguien del
desplegable hay que borrarlo de esa pestaña; para sumar a alguien alcanza con
cargarlo en la app de escritorio y volver a exportar la temporada.

En siembras de almácigo la app calcula **los plantines** (bandejas × alvéolos) y
estima la **fecha de trasplante y de cosecha** según el perfil del cultivo. En
cosechas calcula el **rinde por m²** y lo compara con la referencia del cultivo.

## Actualizar el plan de la temporada

El plan sale de la app de escritorio. Cuando cambie (nuevos cultivos, otro
sector, otro integrante), regeneralo y volvé a subir el archivo:

```bash
python tools/exportar_temporada.py
```

Eso reescribe `docs/temporada.json` con la temporada activa. Solo se exportan
**nombre y rol** de cada integrante: nunca teléfonos, direcciones ni valor hora.

## Próximos módulos

Siguen, por orden de uso en el campo: Riego, Trasplantes, Stock y Sanidad.
