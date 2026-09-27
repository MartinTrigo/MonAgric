"""Carga en AMA el plan de generaciones exportado de Heirloom.

De ese archivo se toma SOLO lo que AMA no sabe: cuando se decide sembrar cada
generacion, con que metodo y en que lugar. Los dias a cosecha, la ventana de
cosecha, el espaciado y los metros NO se traen: de eso AMA tiene mejores
datos, corregidos con lo que de verdad pasa en la chacra. El trasplante
estimado y la cosecha se calculan al dibujar, asi el plan se corrige solo
cuando se afinan los dias del catalogo.

Los nombres se traducen a los de AMA: Heirloom dice "Col rizada" donde acá se
dice Kale, y renombrar del otro lado romperia el enlace con el plan, el
catalogo y las siembras ya cargadas.

Uso:
    python tools/cargar_generaciones.py <archivo.xlsx>            # muestra
    python tools/cargar_generaciones.py <archivo.xlsx> --cargar   # escribe
"""

from __future__ import annotations

import json
import sys
import unicodedata
from pathlib import Path
from urllib import error, parse, request

import openpyxl

RAIZ = Path(__file__).resolve().parent.parent
URL_PATH = RAIZ / "tools" / "servicio.txt"
CLAVE_PATH = RAIZ / "tools" / "clave_admin.txt"
CATALOGO = RAIZ / "docs" / "catalogo.json"

# Heirloom usa sus nombres; AMA los suyos. Mandan los de AMA.
EQUIVALE = {
    "calabaza de invierno": "Zapallo",
    # OJO: las dos generaciones de "Calabaza de verano" entran como Zapallito.
    # AMA tiene Zapallito y Zucchini por separado y el export no los distingue.
    # Si una era Zucchini, se corrige a mano en la hoja "Plan generaciones".
    "calabaza de verano": "Zapallito",
    "col china": "Hakusai",
    "col rizada": "Kale",
    "mezcla de lechugas": "Mix de hojas",
    "nabos (hakurei)": "Nabo Hakurei",
    "pimientos dulces": "Morron",
    "puerro de verano": "Puerro",
    "repollo (almacenamiento)": "Repollo bco",
    "rabano": "Rabanito",
}


def clave(s: str) -> str:
    s = unicodedata.normalize("NFD", str(s or "").strip().lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s[:-1] if s.endswith("s") else s


def fecha(v) -> str:
    """Heirloom exporta dd/mm/aaaa; la planilla guarda aaaa-mm-dd."""
    s = str(v or "").strip()
    if not s or s == "-":
        return ""
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d")
    p = s.split(" ")[0].split("/")
    if len(p) == 3 and len(p[2]) == 4:
        return f"{p[2]}-{int(p[1]):02d}-{int(p[0]):02d}"
    return s


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    archivo = Path(sys.argv[1])
    hacerlo = "--cargar" in sys.argv

    url = URL_PATH.read_text(encoding="utf-8").strip()
    admin = CLAVE_PATH.read_text(encoding="utf-8").strip()
    cultivos = json.loads(CATALOGO.read_text(encoding="utf-8"))["cultivos"]
    porClave = {clave(c): c for c in cultivos}
    for k, v in EQUIVALE.items():
        porClave[clave(k)] = v

    wb = openpyxl.load_workbook(archivo, data_only=True)
    hoja = wb["plantings"]

    registros, sinNombre = [], []
    for f in hoja.iter_rows(values_only=True):
        if not f or not f[0] or f[0] in ("Cultivo", "Plantaciones"):
            continue
        nombre = porClave.get(clave(f[0]))
        if not nombre:
            sinNombre.append(f[0])
            continue
        gen = int(f[2]) if f[2] else 1
        estado = str(f[4] or "").strip()
        registros.append({
            # Id estable: volver a correrlo actualiza en vez de duplicar.
            "id": f"gen-{clave(nombre)}-{gen}",
            "tipo": "generacion",
            "dispositivo": "escritorio",
            "datos": {
                "cultivo": nombre,
                "generacion": gen,
                "metodo": str(f[3] or "").strip(),
                "fecha_almacigo": fecha(f[5]),
                "fecha_campo": fecha(f[6]),
                "camas": f[12] if isinstance(f[12], (int, float)) else "",
                "sector": str(f[18] or "").strip() if f[18] and f[18] != "-" else "",
                "bancales": str(f[19] or "").strip() if f[19] and f[19] != "-" else "",
                # Heirloom distingue "Planificado" de lo ya sembrado; se guarda
                # igual, pero la verdad de lo sembrado esta en la hoja Siembras.
                "estado": "Sembrado" if estado and estado != "Planificado" else "Planificado",
                "origen": "Heirloom " + archivo.name,
            },
        })

    if sinNombre:
        print("SIN EQUIVALENCIA, no se cargan: " + ", ".join(sorted(set(sinNombre))))
        print("  (agregalos a EQUIVALE en este archivo)\n")

    porCultivo: dict[str, int] = {}
    for r in registros:
        porCultivo[r["datos"]["cultivo"]] = porCultivo.get(r["datos"]["cultivo"], 0) + 1
    print(f"generaciones a cargar: {len(registros)} en {len(porCultivo)} cultivos")
    for c, n in sorted(porCultivo.items()):
        print(f"   {c:<18} {n}")

    fechas = sorted(r["datos"]["fecha_almacigo"] or r["datos"]["fecha_campo"]
                    for r in registros)
    print(f"\nde {fechas[0]} a {fechas[-1]}")
    print(f"planificadas: {sum(1 for r in registros if r['datos']['estado'] == 'Planificado')}"
          f"   ya sembradas: {sum(1 for r in registros if r['datos']['estado'] == 'Sembrado')}")

    if not hacerlo:
        print("\n(prueba: volvé a correrlo con --cargar para escribir de verdad)")
        return

    TANDA = 20
    for i in range(0, len(registros), TANDA):
        tanda = registros[i:i + TANDA]
        cuerpo = json.dumps({"chacra": "tica", "clave": admin,
                             "registros": tanda}).encode("utf-8")
        pedido = request.Request(url, data=cuerpo,
                                 headers={"Content-Type": "text/plain;charset=utf-8"})
        try:
            with request.urlopen(pedido, timeout=300) as r:
                res = json.loads(r.read().decode("utf-8"))
        except error.URLError as e:
            raise SystemExit(f"No se pudo conectar: {e}")
        fallaron = res.get("no_guardados") or []
        print(f"  tanda {i // TANDA + 1}: guardados {res.get('guardados')}"
              + (f" | fallaron {len(fallaron)}: {fallaron[0].get('error','')[:70]}"
                 if fallaron else ""))

    with request.urlopen(
            f"{url}?generaciones=1&chacra=tica&clave={parse.quote(admin)}",
            timeout=200) as r:
        final = json.loads(r.read().decode("utf-8")).get("generaciones", [])
    print(f"\nla planilla tiene ahora {len(final)} generaciones")


if __name__ == "__main__":
    main()
