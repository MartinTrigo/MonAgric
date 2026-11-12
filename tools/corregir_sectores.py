"""Corrige los lugares registrados cuando los sectores de una chacra cambian.

Los registros guardan el sector y el bancal como se llamaban el dia que se
cargaron. Si un sector se parte o se renumera, esos lugares dejan de existir
y el mapa no puede dibujar donde esta plantada cada generacion. Esto traduce
cada lugar viejo al nuevo en Siembras, Trasplantes, Stock y el plan de la
chacra. Lo hace el servicio (corregirLugares, en Code.gs): toca solo las dos
celdas del lugar y deja en la hoja Cambios como decia cada una.

    python tools/corregir_sectores.py             solo muestra que cambiaria
    python tools/corregir_sectores.py --aplicar   lo escribe en la planilla

SIEMPRE correrlo primero sin --aplicar y leer la lista. Volver a correrlo no
hace dano: lo ya traducido no vuelve a tocarse.

La tabla de abajo es la de Chacra Tica (noviembre de 2026): cada sector tenia
27 bancales, 3 de ellos corredores biologicos; se sacaron los corredores y
los 24 que quedaron se partieron en dos sectores de 12.
"""
import json
import sys
from collections import Counter
from pathlib import Path
from urllib import error, parse, request

AQUI = Path(__file__).parent
URL_PATH = AQUI / "servicio.txt"
CLAVE_PATH = AQUI / "clave_admin.txt"

CHACRA = "tica"

# Que bancales de la numeracion VIEJA eran corredores biologicos (ya no son
# bancal), y en que sectores nuevos se reparten los que quedan, de a cuantos.
# Un registro cargado en un bancal quitado no se toca: sale en la lista de
# "sin equivalencia" para mirarlo a mano.
QUITADOS = [1, 14, 27]          # las puntas y el del medio (Martin, 13/11)
TABLA = {
    nombre: {"quitar": QUITADOS, "en": [f"{nombre} A", f"{nombre} B"], "de_a": 12}
    for nombre in ("Primavera", "Verano", "Otoño", "Invierno")
}


def main() -> None:
    aplicar = "--aplicar" in sys.argv
    url = URL_PATH.read_text(encoding="utf-8").strip()
    clave = CLAVE_PATH.read_text(encoding="utf-8").strip()
    consulta = parse.urlencode({
        "lugares": json.dumps(TABLA, ensure_ascii=False),
        "chacra": CHACRA, "clave": clave, **({"aplicar": "1"} if aplicar else {}),
    })
    try:
        with request.urlopen(f"{url}?{consulta}", timeout=300) as r:
            d = json.loads(r.read().decode("utf-8"))
    except error.URLError as e:
        raise SystemExit(f"No se pudo conectar: {e}")

    if "cambios" not in d:
        raise SystemExit("El servicio no conoce esta operacion: falta implementar Code.gs "
                         "(Nueva version). Respondio: " + json.dumps(d, ensure_ascii=False)[:200])

    print()
    print("APLICADO en la planilla." if d.get("aplicado") else "SIMULACION: no se escribio nada.")
    print()
    for hoja, n in d["cambios"].items():
        print(f"  {hoja}: {n} lugares")
    if not d["cambios"]:
        print("  No hay nada para corregir.")
    print()
    veces = Counter((x["hoja"], x["de"], x["a"]) for x in d["detalle"])
    for (hoja, de, a), n in sorted(veces.items()):
        print(f"  {hoja:18} {de:>16}  ->  {a}" + (f"   ({n} filas)" if n > 1 else ""))
    if d["sin_equivalencia"]:
        print()
        print("  SIN EQUIVALENCIA (no se tocan; revisarlos a mano):")
        for x in d["sin_equivalencia"]:
            print(f"    {x['hoja']:18} {x['lugar']:>16}   {x['motivo']}   [{x['id']}]")
    print()
    if not d.get("aplicado") and d["cambios"]:
        print("Si la lista esta bien:  python tools/corregir_sectores.py --aplicar")


if __name__ == "__main__":
    main()
