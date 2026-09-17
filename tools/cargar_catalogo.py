"""Carga el catalogo base de cultivos en la planilla compartida.

Hasta ahora el catalogo salia de monagric.sqlite3, la base de la app vieja de
Kivy: un archivo suelto que nadie podia mirar ni corregir. Este script lo pasa
a la planilla, donde se ve y se edita como cualquier hoja de calculo, y donde
las chacras van sumando los suyos desde la app.

Es idempotente: el servicio rechaza el cultivo que ya esta, comparando sin
tildes ni mayusculas. Correrlo dos veces no duplica nada.

Uso:
    python tools/cargar_catalogo.py            # muestra que haria
    python tools/cargar_catalogo.py --cargar   # lo hace
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib import error, parse, request

RAIZ = Path(__file__).resolve().parent.parent
URL_PATH = RAIZ / "tools" / "servicio.txt"
CLAVE_PATH = RAIZ / "tools" / "clave_admin.txt"
CATALOGO = RAIZ / "docs" / "catalogo.json"

# Queda escrito en la columna Chacra para que se vea que no los aporto ninguna:
# son los que venian de la app anterior.
ORIGEN = "catálogo base"


def main() -> None:
    hacerlo = "--cargar" in sys.argv
    url = URL_PATH.read_text(encoding="utf-8").strip()
    clave = CLAVE_PATH.read_text(encoding="utf-8").strip()
    cat = json.loads(CATALOGO.read_text(encoding="utf-8"))

    def pedir(cola: str) -> dict:
        try:
            with request.urlopen(f"{url}?{cola}&clave={parse.quote(clave)}",
                                 timeout=200) as r:
                return json.loads(r.read().decode("utf-8"))
        except error.URLError as e:
            raise SystemExit(f"No se pudo conectar: {e}")

    ya = pedir("catalogo=1&chacra=tica&refrescar=1")
    if not ya.get("ok"):
        raise SystemExit(f"El servicio respondio con error: {ya}")
    en_planilla = {str(c).strip().lower() for c in ya.get("cultivos", [])}
    print(f"ya hay {len(en_planilla)} cultivos en la planilla")

    registros, sin_datos = [], []
    for nombre in cat["cultivos"]:
        if nombre.strip().lower() in en_planilla:
            continue
        p = cat["perfiles"].get(nombre, {})
        if not p:
            sin_datos.append(nombre)
        registros.append({
            "id": f"cat-{nombre.lower().replace(' ', '-')}",
            "tipo": "cultivo",
            "dispositivo": "escritorio",
            "datos": {
                "cultivo": nombre,
                "origen": ORIGEN,
                "tipo_siembra": p.get("tipo_siembra", ""),
                "dias_almacigo": p.get("dias_almacigo", "") or "",
                "dias_trasplante_cosecha": p.get("dias_trasplante_cosecha", "") or "",
                "dias_a_cosecha": p.get("dias_a_cosecha", "") or "",
                "dias_en_cosecha": "",      # no existe en el catalogo viejo
                "lineas_bancal": p.get("lineas_bancal", "") or "",
                "distancia_cm": p.get("distancia_cm", "") or "",
                "rinde_ref_kg_m2": p.get("rinde_ref_kg_m2", "") or "",
                "observaciones": "" if p else "faltan sus datos agronómicos",
            },
        })

    print(f"a cargar: {len(registros)}")
    if sin_datos:
        print(f"  sin datos agronomicos: {', '.join(sin_datos)}")
    if not registros:
        print("nada que hacer")
        return
    if not hacerlo:
        print("\n(prueba: volvé a correrlo con --cargar para escribir de verdad)")
        return

    # De a tandas: un pedido con 38 registros puede pasarse del tiempo de Apps
    # Script, y si se corta no se sabe cuanto entro.
    TANDA = 10
    for i in range(0, len(registros), TANDA):
        tanda = registros[i:i + TANDA]
        cuerpo = json.dumps({"chacra": "tica", "clave": clave,
                             "registros": tanda}).encode("utf-8")
        pedido = request.Request(url, data=cuerpo,
                                 headers={"Content-Type": "text/plain;charset=utf-8"})
        with request.urlopen(pedido, timeout=300) as r:
            res = json.loads(r.read().decode("utf-8"))
        fallaron = res.get("no_guardados") or []
        print(f"  tanda {i // TANDA + 1}: guardados {res.get('guardados')}"
              + (f" | fallaron {len(fallaron)}: {fallaron[0].get('error','')[:70]}"
                 if fallaron else ""))

    final = pedir("catalogo=1&chacra=tica&refrescar=1")
    print(f"\nla planilla tiene ahora {len(final.get('cultivos', []))} cultivos")
    faltan = [c for c in cat["cultivos"]
              if c.strip().lower() not in {x.strip().lower()
                                           for x in final.get("cultivos", [])}]
    if faltan:
        print(f"OJO, no entraron: {', '.join(faltan)}")
    else:
        print("entraron todos")


if __name__ == "__main__":
    main()
