# MonAgric Web

App para que los integrantes de la chacra registren desde el celular, con solo
un enlace: **siembras**, **horas de trabajo** y **cosechas**. Muestra el plan de
la temporada y compara lo planificado con lo logrado.

Los registros se guardan primero en el teléfono (funciona sin señal en el campo)
y se envían a una **planilla de Google Sheets** cuando hay conexión.

## Cómo ponerla en marcha (una sola vez)

### Paso 1 — Crear la planilla en Google

1. Entrá a [sheets.google.com](https://sheets.google.com) con tu cuenta.
2. Creá una planilla nueva y ponele, por ejemplo, **MonAgric Datos**.

### Paso 2 — Publicar el servicio (Apps Script)

1. En la planilla: **Extensiones → Apps Script**.
2. Borrá lo que haya en el editor y pegá todo el código de
   [`apps-script/Code.gs`](../apps-script/Code.gs).
3. Arriba a la derecha: **Implementar → Nueva implementación**.
4. Tipo **Aplicación web**, con:
   - *Ejecutar como*: **Yo** (tu cuenta).
   - *Quién tiene acceso*: **Cualquier persona**.
5. **Implementar**, autorizá los permisos y **copiá la URL** que termina en `/exec`.

> La planilla queda en tu Drive y solo la ves vos. "Cualquier persona" significa
> que la app puede *enviarle* datos sin que cada integrante inicie sesión.

### Paso 3 — Publicar la app en GitHub Pages

1. Subí este proyecto al repositorio **MonAgric** de tu GitHub (público).
2. En el repositorio: **Settings → Pages → Source: Deploy from a branch**,
   rama `main`, carpeta **`/docs`**. Guardá.
3. En unos minutos queda en `https://martintrigo.github.io/MonAgric/`.

### Paso 4 — Conectar y repartir

1. Abrí ese enlace, tocá el engranaje (**Ajustes**), pegá la URL del paso 2 y
   tocá **Probar conexión**.
2. Pasales el enlace a los integrantes por WhatsApp. En el celular, desde el
   menú del navegador: **"Agregar a pantalla de inicio"**.
3. Cada integrante elige su nombre en Ajustes y pega la misma URL (una sola vez).

## Qué hace cada sección

| Sección | Para qué sirve |
|---|---|
| **Inicio** | Temporada activa, m² y kg planificados, y cuánto se lleva cosechado |
| **Siembras** | Fecha, cultivo, variedad, tipo, generación, bandejas o sector/bancal |
| **Horas** | Quién trabajó, cuántas horas y en qué actividades |
| **Cosechas** | Kilos por cultivo y bancal, con el rinde en kg/m² |
| **Plan** | Los 28 cultivos planificados, sectores de riego e integrantes |

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
