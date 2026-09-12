# Dónde quedamos — 12 de septiembre de 2026

Estado de AMA para retomar en otra sesión. Lo de arriba es lo que está a medio
terminar; lo de abajo, lo que quedó andando y no hay que volver a tocar.

---

## 1. La tarea abierta: unificar el vocabulario de actividades

**Qué pasa.** Hay **58 filas de horas** (julio y agosto, ninguna de septiembre)
cuya actividad no pertenece al área elegida. Son 241,5 horas de las 404 de la
temporada.

**Por qué pasó, ya diagnosticado.** Hasta el 25/08 el Área y la Actividad eran
dos listas independientes: la actividad salía de una lista global de nueve
opciones, igual para toda la app, sin relación con el área. Cualquier
combinación era posible. Desde que cada área tiene su lista propia eso no puede
volver a ocurrir: al elegir un área la lista de actividades se reconstruye
desde cero y la selección anterior se destruye. El 12/09 además se volvió
obligatoria y se quitó el "Sin especificar" que venía preseleccionado.

**No todas están mal.** "Hortícola · Siembras" es correcto. "Mantenimiento ·
Mantenimiento" es redundante pero no falso. El error real que encontró Martín
—"Siembras" bajo Administración— ya lo corrigió a mano.

El problema que queda no es de exactitud sino de vocabulario: esas horas no se
pueden agrupar con las de septiembre porque usan palabras que ya no existen en
ninguna lista. Para el análisis de temporada, julio y agosto quedan como un
bloque aparte.

**Lo que hay hoy:**

| Área | Actividad vieja | Filas | Horas |
|---|---|---|---|
| Hortícola | Planificación | 30 | 100,0 |
| Mantenimiento | Mantenimiento | 17 | 66,5 |
| Hortícola | Siembras | 13 | 40,5 |
| Administración | Administración | 4 | 9,0 |
| Hortícola | Mantenimiento | 2 | 10,0 |
| Plantinera | Mantenimiento | 2 | 8,0 |
| Hortícola | Manejo productivo | 1 | 5,0 |
| Frutícola | Manejo productivo | 1 | 1,5 |
| Plantinera | Siembras | 1 | 1,0 |

**La decisión que falta (es de Martín, no se puede resolver desde los datos):**
las 100 horas de "Planificación" en Hortícola. O se agrega "Planificación" como
actividad de Hortícola —planificar la temporada es trabajo hortícola— o se
decide a cuál de las existentes corresponden. Lo mismo, más fácil, con
"Manejo productivo" (¿Sanidad y Fertilidad? ¿Desyuye?) y con
"Mantenimiento · Mantenimiento" (¿Mejoras?).

**Cómo se aplicaría.** Las horas viven en la planilla de Bioma
(`Respuestas de formulario 1`, columna Actividad). Conviene una función de
mantenimiento en `apps-script/Codigo-horas-bioma.gs`, al estilo de
`unificarAreas()`: un mapeo explícito, que se ejecute a mano desde el editor y
deje en el registro qué cambió. **No hacerlo sin la decisión de arriba.**

---

## 2. Esperando algo de Martín

- **URL del endpoint de economía.** El código está hecho y probado con datos
  simulados que siguen `ECONOMIA.md`. Falta cargar en las propiedades del
  script `ECONOMIA_URLS` con `{"tica":"<url>"}`, redesplegar, y verificar
  contra el endpoint real — sobre todo que los nombres de área de bioma-db
  coincidan con los de AMA.
- **Redespliegue pendiente** de `apps-script/Code.gs`: incluye el refresco
  forzado de cuentas (`?refrescar=1`) y todo lo de economía.
- **Qué hacer con las planillas individuales de Luqui y Juanfra.** Las
  reemplazó la sección Cuentas. Siguen actualizándose cada noche desde
  `espejarCuentasTrabajadores()`, calculando la deuda de una manera distinta a
  la de bioma-db: son dos verdades sobre la misma plata. Recomendación: apagar
  esa función. Decisión de Martín.
- **Qué hojas de `Registro_Horas_Proyecto_Bioma_T26-27` lee bioma-db.** Sin esa
  respuesta no se puede decir si `Registro Horas` y `Pagos` se pueden borrar.
  Lo que AMA necesita sí o sí: `Respuestas de formulario 1` y `Config`.
  Lo que quedó sin uso y se puede borrar: las 12 pestañas "Cuenta individual",
  "Resumen general de horas y pagos" y "Gestión de pagos".

---

## 3. Lo que quedó andando

- **Cuentas** funciona contra el endpoint real de Bioma. Los seis socios ven
  todo el equipo; Luqui y Juanfra solo lo suyo. El filtro se hace en el
  servicio de AMA, que sabe de quién es cada teléfono por su credencial.
- **Trasplantes** cierra la cadena almácigo → bancal → cosecha, con una fila
  por bancal y los días reales contra los teóricos.
- **La app se llama AMA** de cara al usuario. Internamente todo sigue siendo
  `monagric`: claves de almacenamiento, dirección del repositorio y planillas.
  No cambiar eso; borraría la credencial de cada teléfono.
- **Cinco chacras** en el servicio. Solo Tica tiene economía compartida: las
  demás no ven la pestaña Cuentas.

---

## 4. Cosas viejas que siguen esperando

- **Editar y borrar registros** desde la app. Es lo que hoy obliga a compartir
  las planillas como Lector en vez de Editor.
- **Identificadores por persona** en lugar del nombre como llave. Hoy el
  nombre une AMA, la planilla de horas y bioma-db, y ya falló una vez (un
  teléfono quedó como "Lucas" mientras las horas decían "Luqui"). Conviene
  hacerlo antes de que entren las cinco personas del verano.
- **Secciones que faltan** de la app original: Sanidad (aplicaciones y
  monitoreo), Riego y Stock. El plan por fases está en la conversación del
  6 de septiembre.
- **La Milpa** sigue sin sus códigos pegados en la hoja Invitaciones.
- **Huerma, La Milpa y La Huertota** no tienen plan de temporada cargado, así
  que no aparecen en el panel compartido.
