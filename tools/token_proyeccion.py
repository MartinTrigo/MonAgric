"""Genera la clave que deja a AMA Economia leer la proyeccion de una chacra.

La clave se pega en DOS propiedades de script, una de cada lado:

  AMA Produccion (Code.gs de MonAgric Datos 2026-27):
      PROYECCION_TOKENS   {"tica": "<clave>"}

  AMA Economia (Code.gs de bioma-db):
      AMA_PROYECCION_TOKEN   <clave>
      AMA_URL                la direccion /exec del servicio de AMA

La clave se guarda en tools/token_proyeccion.txt, que NO se publica (esta en
.gitignore). Si ya existe se reutiliza: volver a correr esto no rompe la que
ya esta pegada.

Uso:  python tools/token_proyeccion.py [chacra]
"""

from __future__ import annotations

import json
import secrets
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
TOKEN_PATH = RAIZ / "tools" / "token_proyeccion.txt"


def main() -> None:
    chacra = (sys.argv[1] if len(sys.argv) > 1 else "tica").lower()
    if TOKEN_PATH.exists() and TOKEN_PATH.read_text(encoding="utf-8").strip():
        token = TOKEN_PATH.read_text(encoding="utf-8").strip()
        print("Ya habia una clave: se reutiliza.")
    else:
        token = secrets.token_urlsafe(32)
        TOKEN_PATH.write_text(token + "\n", encoding="utf-8")
        print(f"Clave nueva guardada en {TOKEN_PATH.relative_to(RAIZ)}")

    print("\n1) En AMA Produccion > Apps Script > Configuracion del proyecto >")
    print("   Propiedades del script, agregar:")
    print(f"     PROYECCION_TOKENS   {json.dumps({chacra: token})}")
    print("\n2) En bioma-db > Apps Script > Propiedades del script, agregar:")
    print(f"     AMA_PROYECCION_TOKEN   {token}")
    print("     AMA_URL                (la misma direccion /exec de tools/servicio.txt)")
    print("\nNo la pegues en ningun archivo del repositorio: es publico.")


if __name__ == "__main__":
    main()
