# Guía para instalar MonAgric con cada productor

Pensada para tener al lado durante la reunión. Todo lo que hay que hacer,
en orden, sin nada supuesto.

---

## Antes de la reunión (una sola vez por chacra)

### 1. Crear la planilla de la chacra

En Drive, dentro de **Mi unidad > MonAgric — Datos**, creá una planilla nueva:
*MonAgric · Nombre de la chacra 2026-27*. Dejala vacía: las hojas se crean
solas.

Copiá su identificador de la barra de direcciones. Es la parte larga entre
`/d/` y `/edit`:

```
https://docs.google.com/spreadsheets/d/ESTO_ES_EL_ID/edit
```

### 2. Darle de alta en el servicio

Abrí **MonAgric Datos 2026-27** → *Extensiones → Apps Script* → engranaje
**Configuración del proyecto** → **Propiedades del script**.

Editá la propiedad `CHACRAS` y agregá la chacra nueva al final, antes de la
llave que cierra:

```
{"tica":"1PrP0F…","milpa":"1Kwow8…","chacranueva":"EL_ID_QUE_COPIASTE"}
```

Cuidado con dos cosas que ya dieron problemas: que no quede **ningún espacio**
dentro de las comillas, y que no falte ninguna coma. Un id con un espacio
invisible no da error: hace que el servicio se cuelgue.

### 3. Sumarla a la app

En `docs/app.js`, arriba de todo, agregá la chacra a la lista:

```js
const CHACRAS = [
  { codigo: "tica", nombre: "Chacra Tica", horasAparte: true },
  { codigo: "chacranueva", nombre: "Nombre lindo de la chacra" },
];
```

El `codigo` tiene que ser **idéntico** al que pusiste en `CHACRAS` del script.
Después, publicar los cambios.

### 4. Generar los códigos de invitación

Uno por persona. Desde la carpeta del proyecto:

```
python tools/crear_invitaciones.py chacranueva Ana Pedro Sofia
```

Copiá las filas que imprime y pegalas en la hoja **Invitaciones** de
*MonAgric · Accesos (privado)*, debajo de las que ya están.

> La hoja tiene que llamarse exactamente **Invitaciones**. Si el script no la
> encuentra, crea una vacía al lado y ningún código funciona.

---

## Durante la reunión, con cada persona

Calculá diez minutos por teléfono la primera vez.

### 1. Abrir el enlace

```
https://martintrigo.github.io/MonAgric/
```

Pasáselo por WhatsApp así no lo tipean.

### 2. Ponerlo en la pantalla de inicio

**Android:** los tres puntitos arriba a la derecha → *Agregar a pantalla de
inicio*.
**iPhone:** tiene que ser con Safari → botón de compartir → *Agregar a inicio*.

Hacelo **antes** de activar el teléfono: así queda como una app y no como una
pestaña perdida.

### 3. Elegir la chacra

Aparece la pregunta apenas abre. Se toca una vez y no vuelve a preguntar.

> Si se equivocan de chacra: en la pantalla del código hay un *"Elegir otra"*.

### 4. Activar el teléfono con su código

Le pide el **código** y **su nombre**. Dictale su código de la planilla.

Al aceptar, ese teléfono recibe su credencial y queda activado para siempre. En
la planilla de accesos vas a ver que el código pasó a **Usado** y que apareció
una fila nueva en **Dispositivos**.

**Hace falta señal para este paso.** Es el único momento que la necesita.

### 5. Mostrarle qué puede hacer

Un recorrido de dos minutos por las pestañas de abajo:

- **Horas** — cuántas horas trabajó, qué día y en qué. Ve lo que carga todo el
  equipo.
- **Tareas** — anotar lo que hay que hacer, y tildar lo hecho.
- **Siembras** — cultivo, variedad, bandejas. Le calcula solo cuándo trasplantar
  y cuándo cosechar.
- **Cosechas** — los kilos totales por cultivo; con el **+** carga varios de una.
- **Plan** — cómo viene la chacra con lo planificado.

Dos cosas que conviene decir siempre:

> **Anda sin señal.** Cargá tranquilo en el campo: cuando vuelve el internet se
> manda solo. Si arriba dice "X por enviar", es eso, no se pierde nada.

> **Si algo se cargó mal, avisá.** Se corrige.

### 6. Contarle qué pasa con sus datos

Es el momento de decirlo, no después:

- Los datos de la chacra van a **una planilla propia**, separada de las otras.
- **Vos tenés acceso** a esa planilla, porque está en tu Drive. Decilo de frente.
- Hay un **panel compartido** donde todas las chacras ven el resumen de todas
  —superficie, kilos, rindes— pero **no quién trabajó cuántas horas**.
- Está todo escrito en [TERMINOS.md](TERMINOS.md).

Mostrales el panel **antes** de que carguen nada. Es la diferencia entre "me
miran" y "nos miramos".

### 7. Que cargue algo ahí mismo

Que registre sus horas de ese día, o una tarea. Sirve para dos cosas: se lleva
la sensación de que funciona, y vos confirmás que el circuito cierra.

---

## Después de la ronda

### Cargar la configuración de la temporada

La primera persona de cada chacra tiene que cargar, en **Configuración**:
medidas del bancal, sectores con sus bancales, quiénes trabajan y el plan de
cultivos. Hasta que eso esté, no pueden registrar siembras ni cosechas —las
horas y las tareas sí funcionan desde el minuto uno.

Conviene hacerlo con alguien que conozca bien la chacra, y sin apuro.

### Compartir el panel

Abrí **MonAgric · Panel compartido**, botón *Compartir*, agregá los correos y
elegí **Lector** (nunca Editor).

### Activar la actualización diaria

En el editor de Apps Script, ícono del **reloj** (Activadores) → *Añadir
activador* → función `actualizarPanel`, origen *según tiempo*, cada día.

---

## Si algo sale mal

| Qué pasa | Qué mirar |
|---|---|
| "Ese código no existe" | Que la hoja se llame **Invitaciones** y que no haya otra vacía con ese nombre |
| "Ese código es de otra chacra" | La columna Chacra tiene que decir el **código** (`tica`), no el nombre lindo |
| "Ese código ya se usó" | Se usó en otro teléfono. Generá uno nuevo con `crear_invitaciones.py` |
| "Este teléfono fue dado de baja" | Alguien puso `NO` en la columna Activo de la hoja Dispositivos |
| No aparece la chacra en la lista | Falta agregarla en `docs/app.js` y publicar |
| Todo se cuelga para una chacra | Un espacio o carácter invisible en su id, dentro de la propiedad `CHACRAS` |

### Dar de baja un teléfono

En *MonAgric · Accesos (privado)*, hoja **Dispositivos**, poné `NO` en la
columna **Activo** de esa fila. Deja de poder cargar al instante, sin afectar a
nadie más. Lo que tuviera pendiente le queda guardado en el teléfono.
