# Por qué MonAgric es como es

Este documento no explica *cómo* funciona la app —para eso está el código y el
README— sino **por qué se tomó cada decisión**. Sirve para cuando pase el tiempo
y no recordemos el razonamiento, o para que alguien que llegue nuevo entienda
qué se descartó y con qué argumento.

---

## Por qué una app web y no una aplicación de celular

**Decisión:** una página web publicada en GitHub Pages, que se agrega a la
pantalla de inicio del teléfono.

MonAgric empezó como una aplicación de escritorio en Python (Kivy) que se
compilaba como APK de Android. Funcionaba, pero para que la usaran otras
personas había que instalar el archivo en cada teléfono y volver a instalarlo
en cada actualización.

Lo que decidió el cambio fue la experiencia previa con las apps `bioma-horas` y
`bioma-mov`: un enlace, sin instalar nada, y todos adentro en un minuto. Para
gente que trabaja en el campo y no quiere pelearse con el celular, eso es la
diferencia entre que se use y que no.

**Lo que se resignó:** acceso a cosas del teléfono (cámara, GPS). Si algún día
hacen falta, una app web moderna igual puede pedirlas.

**La app de escritorio sigue existiendo** (`monagric.py`) para la planificación
y el análisis, que se hacen sentado frente a una computadora.

---

## Por qué Google Sheets y no una base de datos

**Decisión:** los datos viven en planillas de Google, con Apps Script haciendo
de servicio.

Una base de datos de verdad sería más prolija, pero implica un servidor que hay
que pagar y mantener. Sheets tiene tres cosas que para este proyecto pesan más:

1. **Ya sabés usarla.** Si algo sale mal, entrás y lo arreglás a mano.
2. **No cuesta nada** y no hay servidor que se caiga un domingo.
3. **Los datos son visibles y exportables** sin depender de la app. Si mañana
   MonAgric desaparece, las planillas siguen ahí.

**Lo que se resignó:** velocidad con muchos datos. Con tres chacras y una
temporada no se nota. Si algún día son cincuenta chacras, habrá que migrar.

---

## Por qué una planilla por chacra

**Decisión:** cada chacra escribe en su propio archivo; un solo servicio las
reparte según un código.

Las alternativas eran una planilla única con una columna "chacra" —más simple de
programar, pero cualquiera que abra el archivo ve los datos de todos— o que
cada chacra publicara su propio servicio, lo que les exigía hacer el trámite de
Apps Script.

La opción elegida da separación real con cero trámite para ellas: todo el
mantenimiento lo hace una sola persona.

**Consecuencia asumida:** los datos de las otras chacras están en el Drive de
quien administra. Se dice de frente en los términos, y de ahí salió el panel
compartido.

---

## Por qué el catálogo de cultivos es fijo

**Decisión:** los cultivos, sus perfiles y las actividades son iguales para
todas las chacras y no se editan desde la app.

Si cada chacra escribiera los cultivos a su manera —"Lechuga", "lechuga",
"Lechuga mantecosa"— los datos no se podrían comparar nunca. Y comparar es el
objetivo del proyecto.

**El matiz que se agregó después:** el rinde, las líneas por bancal y la
distancia entre plantas sí se pueden ajustar por chacra. Son decisiones de
manejo legítimas y distintas en cada lugar; lo que tiene que ser común es *el
nombre del cultivo*, no cómo lo planta cada uno. De hecho, que cada una registre
su densidad real hace que la comparación de rindes sea más útil.

---

## Por qué el panel compartido

**Decisión:** una planilla con una hoja por chacra, compartida como lectura con
todas.

Surgió de algo que plantearon los productores: no les cerraba que la
administración viera todo y ellos solo lo propio. Es una objeción razonable y la
respuesta no era esconderlo mejor, sino **emparejar por reciprocidad**: que
todos vean lo mismo de todos.

**Lo que va:** por cultivo, superficie, kilos esperados y cosechados, rinde
real, siembras y plantines. Más el total de la chacra y sus horas.

**Lo que no va:** quién trabajó cuántas horas. Eso toca temas de pago y es
asunto interno de cada colectivo.

---

## Por qué "invitación + credencial" y no una clave ni cuentas de usuario

**Decisión (15/08/2026):** cada persona canjea una vez un código de invitación
y su teléfono recibe una credencial propia.

Este es el que más se discutió, así que va completo.

**El problema:** la dirección del servicio está escrita en el código público de
GitHub. Cualquiera que la encontrara podía leer los datos de todas las chacras,
inventar registros y —lo más grave— borrar la configuración de una temporada
entera con un solo pedido. Se comprobó ejecutándolo, no era teoría.

**Lo que se evaluó:**

| Opción | Por qué no se eligió |
|---|---|
| **Una clave por chacra** | Si una persona la filtra, se filtró para toda la chacra, y no se puede dar de baja a uno solo. Era lo más simple pero lo menos preciso. |
| **Usuario y contraseña** | Convierte al administrador en soporte técnico de contraseñas olvidadas. Y no valida que quien se registra sea realmente de la chacra. |
| **Entrar con Google** | Identidad verificada de verdad, pero necesita un proyecto en Google Cloud y bastante más armado. Es el camino si algún día hay que cobrar. |

**Por qué ganó la invitación:** encaja con cómo se iba a instalar de todos
modos. El administrador se sienta al lado de cada persona, le muestra la app y
escribe el código una vez. No hay nada que recordar después.

Y resuelve tres cosas de una sola vez:

- **Cierra la puerta**: sin credencial no se lee ni se escribe nada.
- **Da trazabilidad**: en la hoja `Dispositivos` se ve quién carga desde qué
  aparato y cuándo fue su última actividad.
- **Permite dar de baja uno solo**: poniendo `NO` en su fila, ese teléfono deja
  de poder cargar sin afectar a nadie más.

**Cómo funciona la credencial:** es una cadena larga y al azar que queda
guardada en ese teléfono. De ella el servicio guarda solo la **huella SHA-256**:
alcanza para comprobarla, pero no permite reconstruirla. Ni leyendo la planilla
de accesos se saca nada útil.

**Límite conocido:** el identificador de dispositivo se puede inventar. Sirve
para *detectar* cosas raras, no para impedirlas. La que impide es la credencial.

---

## Por qué AGPL-3.0 y no Creative Commons

**Decisión:** licencia AGPL-3.0.

La intención era "que se pueda copiar y mejorar, pero que nadie la cierre".
Creative Commons parecía lo natural, pero **la propia Creative Commons
desaconseja usar sus licencias para software**: no están pensadas para código y
no cubren bien cosas como el código fuente o las patentes.

El equivalente correcto es una licencia copyleft de software. Se eligió **AGPL**
y no GPL porque MonAgric es una **aplicación web**: con GPL, alguien podría
tomar el código, mejorarlo y ofrecerlo como servicio sin publicar sus cambios,
porque nunca "distribuye" el programa. AGPL cierra justamente ese hueco.

**Un dato importante:** hasta el 15/08/2026 el repositorio no tenía licencia. Un
proyecto público sin archivo LICENSE es "todos los derechos reservados": estaba
a la vista, pero **legalmente nadie podía copiarlo ni mejorarlo**, que era lo
contrario de lo buscado.

**Sobre cobrar en el futuro:** AGPL no lo impide. Quien tiene el copyright —hoy
un solo autor— puede licenciar la misma obra también de forma comercial. Lo
único a cuidar es que si más adelante otras personas aportan código, eso se
converse antes, porque entonces el copyright pasa a ser compartido.

---

## Decisiones menores que costaron tiempo

**Escala fraccionaria en pantallas chicas.** El pixel art queda perfecto con
escalas enteras, pero en un celular de 375 px el tablero del juego quedaba
diminuto. De 2x para arriba se usa escala entera; por debajo, la que entre.

**Los campos numéricos son de texto.** Un `input type="number"` descarta "5,5":
el navegador lo considera inválido y el campo queda vacío. En el campo la gente
escribe con coma. Se usan campos de texto y se convierte en el código.

**El service worker va a "red primero".** Con la estrategia inicial —caché
primero— los teléfonos se quedaban con la versión vieja de la app para siempre,
porque el archivo del service worker no cambiaba. Ahora con señal siempre llega
lo último y sin señal sigue funcionando.

**Las planillas viven en "Mi unidad", no en la carpeta sincronizada.** La
carpeta "Computadoras" de Drive es un espejo de la notebook: si esa carpeta
local se borra, Drive borra el reflejo. Ahí adentro estarían las bases de datos
vivas de tres chacras. Además, un Google Sheets nunca se guarda de verdad en el
disco: lo que baja es un acceso directo de 194 bytes.
