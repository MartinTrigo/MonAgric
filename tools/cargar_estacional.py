"""Escribe en la planilla del catalogo los dias de almacigo por estacion.

El catalogo de AMA guardaba un solo numero de dias en almacigo. La hoja de
planificacion de Bioma guarda dos, maximo en otono-invierno y minimo en
primavera-verano, y la diferencia llega a 20 dias. Este script pasa esos dos
valores desde docs/catalogo.json a la planilla compartida, donde se ven y se
corrigen como cualquier hoja de calculo.

Solo toca las dos columnas nuevas. Lo demas de cada fila viaja igual que como
estaba, porque el servicio reescribe la fila entera.

Uso:
    python tools/cargar_estacional.py            # muestra que haria
    python tools/cargar_estacional.py --cargar   # lo hace
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
    enPlanilla = ya.get("perfiles", {})
    print(f"cultivos en la planilla: {len(enPlanilla)}")

    registros = []
    for nombre, p in sorted(cat["perfiles"].items()):
        oi, pv = p.get("dias_almacigo_oi"), p.get("dias_almacigo_pv")
        if not oi and not pv:
            continue
        actual = enPlanilla.get(nombre) or {}
        if (actual.get("dias_almacigo_oi") or 0) == (oi or 0) and \
           (actual.get("dias_almacigo_pv") or 0) == (pv or 0):
            continue                      # ya esta igual: no se vuelve a mandar
        registros.append({
            "id": f"est-{nombre.lower().replace(' ', '-')}",
            "tipo": "cultivo",
            "dispositivo": "escritorio",
            # La fila se reescribe entera, asi que viaja todo el perfil, no solo
            # lo nuevo. Si faltara algo, esa celda quedaria vacia.
            "datos": {
                "cultivo": nombre,
                "origen": actual.get("chacra") or "catálogo base",
                "tipo_siembra": p.get("tipo_siembra", ""),
                "dias_almacigo": p.get("dias_almacigo", "") or "",
                "dias_almacigo_oi": oi or "",
                "dias_almacigo_pv": pv or "",
                "dias_trasplante_cosecha": p.get("dias_trasplante_cosecha", "") or "",
                "dias_a_cosecha": p.get("dias_a_cosecha", "") or "",
                "dias_en_cosecha": p.get("dias_en_cosecha", "") or "",
                "lineas_bancal": p.get("lineas_bancal", "") or "",
                "distancia_cm": p.get("distancia_cm", "") or "",
                "rinde_ref_kg_m2": p.get("rinde_ref_kg_m2", "") or "",
                "observaciones": "",
            },
        })
        print(f"   {nombre:<16} invierno {oi or '-':>4}   verano {pv or '-':>4}")

    print(f"\na escribir: {len(registros)}")
    if not registros:
        print("nada que hacer: la planilla ya esta al dia")
        return
    if not hacerlo:
        print("\n(prueba: volve a correrlo con --cargar para escribir de verdad)")
        return

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
              + (f" | fallaron {len(fallaron)}: {fallaron[0].get('error', '')[:70]}"
                 if fallaron else ""))

    final = pedir("catalogo=1&chacra=tica&refrescar=1").get("perfiles", {})
    con = [n for n, p in final.items() if p.get("dias_almacigo_pv")]
    print(f"\nla planilla tiene ahora {len(con)} cultivos con almacigo estacional")
    faltan = [n for n in cat["perfiles"]
              if cat["perfiles"][n].get("dias_almacigo_pv") and n not in con]
    print("OJO, no entraron: " + ", ".join(faltan) if faltan else "entraron todos")


if __name__ == "__main__":
    main()
