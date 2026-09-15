# Dónde quedamos — 15 de septiembre de 2026

Estado de **AMA y bioma-mov**, que desde hoy se gestionan desde la misma
conversación. El contexto de cada uno está en su `CLAUDE.md`; acá va solo lo
que falta hacer.

---

## Lo próximo, en orden

### 1. Migrar la app de economía — domingo 20/9, con los dos teléfonos

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

### 2. Jubilar "Registro de pagos realizados" — de Martín
En la planilla de horas. Ya está destrabado: la pantalla de AMA funciona, así
que la contabilidad de sueldos vive solo en bioma-db. Es el punto 4 de la
Fase 4.8 de bioma-mov.

### 3. Dos cosas de los datos, no del código — de Martín
- **El 91,4% de los ingresos de la temporada son préstamos** ($7.070.000 de
  $7.733.211). Coherente con septiembre, pero es lo primero que van a ver los
  socios al abrir la pantalla. Vale una frase de contexto si sorprende.
- **"Planificación" en Hortícola son 100 h**, la actividad más grande de la
  temporada, un cuarto del total. Cuadra con julio; conviene confirmarlo.

### 4. Qué hojas de la planilla de horas se pueden borrar
Lo que AMA necesita sí o sí: **`Respuestas de formulario 1`** y **`Config`**.
Sin uso y se pueden borrar: las 12 pestañas "Cuenta individual", "Resumen
general de horas y pagos" y "Gestión de pagos". AMA ya **no lee** `Registro Horas` ni `Pagos`: se apagó el espejo de las
planillas individuales, que era lo único que las usaba. Falta confirmar qué
lee bioma-db antes de borrarlas.

---

## Lo viejo que sigue esperando

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
