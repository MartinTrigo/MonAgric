# MonAgric

*Monitoreo agrícola para emprendimientos agroecológicos.*
Libre bajo [AGPL-3.0](LICENSE) · [Términos de la beta](TERMINOS.md)

Monitor agrícola para emprendimientos agroecológicos de pequeña a mediana
escala. Permite registrar todo el proceso productivo de la temporada —siembras,
trasplantes, riego, cosechas, horas de trabajo, stock y sanidad— para después
evaluar cómo fue: cuándo se sembró cada generación, cuántos kilos rindió cada
bancal, qué plagas aparecieron y en qué cultivo.

Todo se apoya en la **configuración de la temporada**: superficie y rendimiento
esperado por cultivo, sectores de riego e integrantes del proyecto. Contra ese
plan se compara lo efectivamente logrado.

## Las dos apps

| | Para qué | Dónde corre |
|---|---|---|
| **App de escritorio** (`monagric.py`) | Configurar la temporada y trabajar con todos los módulos y reportes | PC (Python + Kivy), y como APK de Android |
| **App web** (`docs/`) | Que todos carguen datos desde el celular con un enlace | GitHub Pages + Google Sheets |

Las dos comparten el mismo plan de temporada: la de escritorio lo exporta y la
web lo lee.

## App de escritorio

```bash
python monagric.py
```

Requiere `kivy==2.3.1`, `kivymd==1.2.0`, `pillow` y `openpyxl`. Los datos viven
en `monagric.sqlite3`, junto al programa (en Android, en el almacenamiento
interno de la app).

Para compilar el APK: `buildozer android debug` (ver `buildozer.spec`).

## App web

Ver [`docs/README.md`](docs/README.md) para publicarla en GitHub Pages y
conectarla con la planilla de Google. Para actualizar el plan que muestra:

```bash
python tools/exportar_temporada.py
```

## Datos privados

`.gitignore` deja fuera del repositorio la base de datos y los registros: la
tabla de integrantes guarda teléfonos, direcciones y valor hora. El archivo que
sí se publica, `docs/temporada.json`, lleva únicamente nombres y roles.
