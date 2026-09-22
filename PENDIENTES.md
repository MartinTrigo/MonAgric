# Dónde quedamos — 15 de septiembre de 2026

Estado de **AMA y bioma-mov**, que desde hoy se gestionan desde la misma
conversación. El contexto de cada uno está en su `CLAUDE.md`; acá va solo lo
que falta hacer.

---

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

### 0 bis. Cerrar el script de horas — es el único secreto a la vista

Verificado el 17/09 con pedidos reales. El servicio de AMA está bien cerrado:
sin credencial no entrega config, ni cuentas, ni economía, y no escribe nada.
La URL de bioma-mov nunca entró al historial de git.

Pero `Codigo-horas-bioma.gs` **no tiene ningún control de acceso**, y su URL
está en `docs/app.js:43`, que es público. Con esa dirección cualquiera:

- **lee** los 12 nombres del equipo y los últimos registros de horas
  (comprobado: devolvió las 7 h de Mili del 17/09);
- **escribe** filas de horas, y de esas filas bioma-db calcula los sueldos.

**No sirve ponerle una clave**: tendría que viajar en `app.js`. Todo lo que
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

### 3. Jubilar "Registro de pagos realizados" — de Martín
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
