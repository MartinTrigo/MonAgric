"""Genera docs/catalogo.json: lo que es IGUAL para todas las chacras.

El catalogo lo definimos nosotros y no se toca desde la app: cultivos, perfiles
(dias a cosecha, rinde de referencia, distancias) y
tipos de siembra. Es lo que despues permite comparar una chacra con otra: si
cada una escribiera los cultivos a su manera, los datos no se podrian juntar.

Lo que SI configura cada chacra desde la app (sectores, bancales, integrantes y
su plan de cultivos) vive en la hoja Config de su propia planilla.

Uso:  python tools/exportar_catalogo.py
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DB_PATH = RAIZ / "monagric.sqlite3"
SALIDA = RAIZ / "docs" / "catalogo.json"

TIPOS_SIEMBRA = ["Siembra directa", "Siembra almácigo", "Trasplante", "Esqueje"]
TIPOS_BANDEJA = [72, 98, 128, 162]
TIPOS_RIEGO = ["Aspersión", "Goteo", "Surco", "Superficie"]
IMPORTANCIAS = ["Alta", "Media", "Baja"]


def numero(valor, defecto=0.0) -> float:
    try:
        return float(valor)
    except (TypeError, ValueError):
        return defecto


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    perfiles = {}
    for r in conn.execute("SELECT * FROM cultivo_perfil ORDER BY cultivo"):
        perfiles[r["cultivo"]] = {
            "dias_a_cosecha": int(r["dias_a_cosecha"] or 0),
            "dias_almacigo": int(r["dias_almacigo"] or 0),
            "dias_trasplante_cosecha": int(r["dias_trasplante_cosecha"] or 0),
            "rinde_ref_kg_m2": numero(r["rinde_ref_kg_m2"]),
            "tipo_siembra": r["tipo_siembra"] or "",
            "distancia_cm": numero(r["distancia_cm"]),
            "lineas_bancal": int(r["lineas_bancal"] or 0),
        }

    extra = [r["nombre"] for r in conn.execute("SELECT nombre FROM cultivos_extra")]
    cultivos = sorted(set(perfiles) | set(extra))

    datos = {
        "generado": datetime.now().isoformat(timespec="seconds"),
        "cultivos": cultivos,
        "perfiles": perfiles,
        "tipos_siembra": TIPOS_SIEMBRA,
        "tipos_bandeja": TIPOS_BANDEJA,
        "tipos_riego": TIPOS_RIEGO,
        "importancias": IMPORTANCIAS,
    }

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Catalogo comun exportado a {SALIDA}")
    print(f"  {len(cultivos)} cultivos · {len(perfiles)} con perfil · ")


if __name__ == "__main__":
    main()
