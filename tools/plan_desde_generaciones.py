"""Rehace el plan por cultivo de la configuracion a partir de las generaciones.

Las generaciones son lo ultimo que se decidio (28/09: "las de Heirloom son las
mas actualizadas, sigamos esas"). El plan por cultivo de Configuracion —de
donde salen los m2 y kg esperados de Inicio y la Proyeccion de AMA Economia—
tiene que decir lo mismo:

  · superficie = suma de camas de sus generaciones x m2 del bancal
  · rinde, lineas y distancia: los que ya tenia el cultivo en el plan; si no,
    los del catalogo
  · kg esperados = superficie x rinde
  · un cultivo del plan sin ninguna generacion SALE del plan

Guardar la configuracion deja la anterior en la hoja oculta "Config anterior",
asi que se puede volver atras.

Uso:
    python tools/plan_desde_generaciones.py tica              # muestra
    python tools/plan_desde_generaciones.py tica --guardar    # escribe
"""

from __future__ import annotations

import json
import sys
import unicodedata
from pathlib import Path
from urllib import error, parse, request

RAIZ = Path(__file__).resolve().parent.parent
CATALOGO = RAIZ / "docs" / "catalogo.json"
URL_PATH = RAIZ / "tools" / "servicio.txt"
CLAVE_PATH = RAIZ / "tools" / "clave_admin.txt"


def clave(s: str) -> str:
    s = unicodedata.normalize("NFD", str(s or "").strip().lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    chacra = sys.argv[1].strip().lower()
    guardar = "--guardar" in sys.argv
    url = URL_PATH.read_text(encoding="utf-8").strip()
    admin = CLAVE_PATH.read_text(encoding="utf-8").strip()

    def pedir(q: str) -> dict:
        try:
            with request.urlopen(f"{url}?{q}&chacra={chacra}&clave={parse.quote(admin)}",
                                 timeout=200) as r:
                return json.loads(r.read().decode("utf-8"))
        except error.URLError as e:
            raise SystemExit(f"No se pudo conectar: {e}")

    config = pedir("config=1")["config"]
    gens = pedir("generaciones=1")["generaciones"]
    perfiles = json.loads(CATALOGO.read_text(encoding="utf-8")).get("perfiles", {})
    perfilDe = {clave(k): v for k, v in perfiles.items()}

    b = config.get("bancal", {})
    m2 = (b.get("largo_m") or 0) * (b.get("ancho_m") or 0)
    largo_cm = (b.get("largo_m") or 0) * 100
    if not m2:
        raise SystemExit("La chacra no tiene las medidas del bancal.")

    viejo = {clave(p["cultivo"]): p for p in config.get("plan", [])}
    camas: dict[str, float] = {}
    nombre: dict[str, str] = {}
    for g in gens:
        k = clave(g["cultivo"])
        camas[k] = camas.get(k, 0) + (g.get("camas") or 0)
        nombre.setdefault(k, g["cultivo"])

    plan = []
    print(f"{'cultivo':<16}{'bancales':>9}{'m2':>8}{'kg':>7}   antes")
    for k in sorted(camas, key=lambda x: nombre[x]):
        if not camas[k]:
            continue
        ya = viejo.get(k, {})
        pf = perfilDe.get(k, {})
        sup = round(camas[k] * m2, 2)
        rinde = ya.get("rinde_kg_m2") or pf.get("rinde_ref_kg_m2") or 0
        lineas = ya.get("lineas") or pf.get("lineas_bancal") or 0
        dist = ya.get("distancia_cm") or pf.get("distancia_cm") or 0
        plantas = (round(lineas * int(largo_cm // dist) * camas[k])
                   if lineas and dist and largo_cm else 0)
        p = {"cultivo": ya.get("cultivo") or nombre[k], "superficie_m2": sup,
             "cosecha_esperada_kg": round(sup * rinde), "rinde_kg_m2": rinde,
             "lineas": lineas, "distancia_cm": dist, "plantas": plantas}
        plan.append(p)
        antes = (f"{ya.get('superficie_m2', 0) / m2:.1f} banc, {ya.get('cosecha_esperada_kg', 0)} kg"
                 if ya else "no estaba")
        marca = "" if ya and abs(ya.get("superficie_m2", 0) - sup) < 0.01 else "  <-"
        print(f"{p['cultivo']:<16}{camas[k]:>9.1f}{sup:>8.0f}{p['cosecha_esperada_kg']:>7}"
              f"   {antes}{marca}" + ("" if rinde else "  (SIN RINDE: 0 kg)"))

    salen = [p["cultivo"] for k, p in viejo.items() if not camas.get(k)]
    if salen:
        print("\nSalen del plan (no tienen generaciones): " + ", ".join(sorted(salen)))
    print(f"\nTotal: {sum(p['superficie_m2'] for p in plan):.0f} m2, "
          f"{sum(p['cosecha_esperada_kg'] for p in plan)} kg, {len(plan)} cultivos "
          f"(antes {sum(p['superficie_m2'] for p in viejo.values()):.0f} m2, "
          f"{sum(p['cosecha_esperada_kg'] for p in viejo.values())} kg, {len(viejo)} cultivos)")

    if not guardar:
        print("\n(prueba: con --guardar se escribe de verdad)")
        return

    config["plan"] = plan
    cuerpo = json.dumps({"chacra": chacra, "clave": admin, "registros": [{
        "id": f"config-plan-generaciones-{chacra}", "tipo": "config", "datos": config,
        "temporada": config.get("temporada", {}).get("nombre", ""),
        "dispositivo": "escritorio"}]}).encode("utf-8")
    pedido = request.Request(url, data=cuerpo,
                             headers={"Content-Type": "text/plain;charset=utf-8"})
    with request.urlopen(pedido, timeout=200) as r:
        res = json.loads(r.read().decode("utf-8"))
    if not res.get("ok"):
        raise SystemExit(f"El servicio respondio con error: {res}")
    print("\nGuardado. La configuracion anterior quedo en la hoja oculta 'Config anterior'.")


if __name__ == "__main__":
    main()
