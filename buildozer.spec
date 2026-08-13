[app]

# Nombre visible de la app
title = MonAgric

# Identificador del paquete (NO cambiar despues de publicar en Google Play).
# Se conserva "monagro" a proposito: cambiarlo haria que Android lo instale
# como una app nueva y los telefonos con datos cargados los perderian.
package.name = monagro
package.domain = com.martintrigo

source.dir = .
source.include_exts = py,png,jpg,kv,atlas,json
source.exclude_dirs = backend, csv, referencias, versiones, docs, apps-script, tools, .venv-linux, .claude, .vscode, .git, bin, .buildozer
source.exclude_patterns = monagric_error.log, monagric.sqlite3, stock_session.json, stock_cultivos.json, stock_chacras.json, promps para claude.md

# version: subir en cada release que se publique en Play
version = 0.1.0

# Versiones fijadas a las del entorno de desarrollo (KivyMD 2.x rompe la API usada)
requirements = python3,kivy==2.3.1,kivymd==1.2.0,pillow,openpyxl,et_xmlfile

orientation = portrait
fullscreen = 0

icon.filename = %(source.dir)s/img/logo1.png
presplash.filename = %(source.dir)s/img/logo1.png
android.presplash_color = #5C7A5E

# INTERNET: para el modo de datos remoto/auto (API backend)
android.permissions = INTERNET

# Google Play exige target API 35 en 2026 (API 36 desde el 31/08/2026)
android.api = 35
android.minapi = 24
android.archs = arm64-v8a, armeabi-v7a
android.allow_backup = True

# Play exige AAB para publicar; el APK queda para pruebas locales
android.release_artifact = aab
android.debug_artifact = apk

# Si el backend remoto usa http:// (sin TLS), Android 9+ lo bloquea por defecto.
# Solucion recomendada: servir la API por https. Alternativa temporal: agregar
# android:usesCleartextTraffic="true" via extra_manifest_application_arguments.
#android.extra_manifest_application_arguments = ./manifest_extra.xml

[buildozer]
log_level = 2
warn_on_root = 1
