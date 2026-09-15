# Dónde quedamos — 15 de septiembre de 2026

Estado de **AMA y bioma-mov**, que desde hoy se gestionan desde la misma
conversación. El contexto de cada uno está en su `CLAUDE.md`; acá va solo lo
que falta hacer.

---

## Lo próximo, en orden

### 1. El gráfico de flujo en AMA — programar
`ECONOMIA.md` describe el gráfico que ya se dibujó del lado de Bioma: tres
series en un mismo par de ejes —barras con el **balance** del mes, línea verde
de **ingresos**, línea marrón de **egresos**— y el eje compartido a propósito,
porque la distancia entre las líneas *es* la altura de la barra.

AMA hoy dibuja `meses` como una tabla de texto y **no usa `acumulado`**, que el
endpoint ya manda. La receta está en `graficoFlujo()` de
`Bioma/movimientos/js/resumen.js` y las clases `.fg-*` de su `styles.css`: SVG
a mano, sin librerías, unas treinta líneas. Conviene copiar el enfoque y no
inventar otro, para que los dos lados muestren lo mismo.

Ojo con la trampa que avisa el contrato: `acumulado` se arrastra del mes más
viejo al más nuevo, pero la lista viene al revés. El primer elemento es el mes
actual y su acumulado es el balance de toda la temporada.

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

### 4. Las planillas individuales de Luqui y Juanfra — decisión de Martín
Las reemplazó la sección Cuentas. Siguen actualizándose cada noche desde
`espejarCuentasTrabajadores()` en `Code.gs`, calculando la deuda de una manera
distinta a la de bioma-db: **son dos verdades sobre la misma plata**.
Recomendación: apagar esa función. También se van con ella las hojas
`Registro Horas` y `Pagos` como dependencias de AMA.

### 5. Qué hojas de la planilla de horas se pueden borrar
Lo que AMA necesita sí o sí: **`Respuestas de formulario 1`** y **`Config`**.
Sin uso y se pueden borrar: las 12 pestañas "Cuenta individual", "Resumen
general de horas y pagos" y "Gestión de pagos". Falta confirmar qué lee
bioma-db antes de tocar `Registro Horas` y `Pagos`.

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

## Una cosa a vigilar

`ECONOMIA.md` existe **dos veces**: en `MonAgric/` y en
`Bioma/movimientos/apps-script/`. El canónico es el de bioma-mov, que es quien
sirve el endpoint. Dos copias de un contrato divergen tarde o temprano; si
alguna vez no coinciden, manda la de bioma-mov.
