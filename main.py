# Punto de entrada para Android (Buildozer/python-for-android busca main.py).
# En escritorio se puede seguir ejecutando: python monagric.py
import traceback

from monagric import MonAgricApp, log_exception

if __name__ == "__main__":
    try:
        MonAgricApp().run()
    except Exception as e:
        log_exception("Fallo fatal al ejecutar la app", e)
        print(traceback.format_exc())
        raise
