"""Completa el plan de una chacra con el rinde, la densidad y las plantas.

Los planes cargados antes de que existieran esos campos solo tienen superficie y
kilos esperados. Este script toma la configuracion tal como esta hoy en la
planilla —sin pisar nada de lo que se haya editado desde la app— y le completa
lo que falta:

  · rinde kg/m2  -> se deduce de lo planificado (kg esperados / m2)
  · lineas y distancia -> del catalogo comun, si el cultivo no los tiene
  · plantas -> lineas x (largo del bancal / distancia) x bancales

Uso:  python tools/completar_plan.py tica
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib import error, request

RAIZ = Path(__file__).resolve().parent.parent
CATALOGO = RAIZ / "docs" / "catalogo.json"
URL_PATH = RAIZ / "tools" / "servicio.txt"
CLAVE_PATH = RAIZ / "tools" / "clave_admin.txt"


def clave_admin() -> str:
    if not CLAVE_PATH.exists():
        raise SystemExit("Falta tools/clave_admin.txt con la clave de administracion.")
    return CLAVE_PATH.read_text(encoding="utf-8").strip()


def pedir(url: str) -> dict:
    try:
        with request.urlopen(url, timeout=90) as r:
            return json.loads(r.read().decode("utf-8"))
    except error.URLError as e:
        raise SystemExit(f"No se pudo conectar con el servicio: {e}")


def enviar(url: str, cuerpo: dict) -> dict:
    datos = json.dumps(cuerpo).encode("utf-8")
    pedido = request.Request(url, data=datos,
                             headers={"Content-Type": "text/plain;charset=utf-8"})
    try:
        with request.urlopen(pedido, timeout=90) as r:
            return json.loads(r.read().decode("utf-8"))
    except error.URLError as e:
        raise SystemExit(f"No se pudo enviar: {e}")


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Falta el codigo de la chacra. Ej: python tools/completar_plan.py tica")
    chacra = sys.argv[1].strip().lower()
    if not URL_PATH.exists():
        raise SystemExit("No encuentro tools/servicio.txt con la direccion del servicio.")
    url = URL_PATH.read_text(encoding="utf-8").strip()

    catalogo = json.loads(CATALOGO.read_text(encoding="utf-8"))
    perfiles = catalogo.get("perfiles", {})

    from urllib.parse import quote
    respuesta = pedir(f"{url}?config=1&chacra={chacra}&clave={quote(clave_admin())}")
    if not respuesta.get("ok"):
        raise SystemExit(f"El servicio respondio con error: {respuesta}")
    config = respuesta["config"]

    bancal = config.get("bancal", {})
    largo_cm = (bancal.get("largo_m") or 0) * 100
    m2_bancal = (bancal.get("largo_m") or 0) * (bancal.get("ancho_m") or 0)
    if not m2_bancal:
        raise SystemExit("La chacra no tiene cargadas las medidas del bancal.")

    tocados = []
    for p in config.get("plan", []):
        perfil = perfiles.get(p["cultivo"], {})
        antes = (p.get("rinde_kg_m2"), p.get("lineas"), p.get("distancia_cm"), p.get("plantas"))

        if not p.get("rinde_kg_m2") and p.get("superficie_m2"):
            p["rinde_kg_m2"] = round(p.get("cosecha_esperada_kg", 0) / p["superficie_m2"], 3)
        if not p.get("lineas"):
            p["lineas"] = perfil.get("lineas_bancal", 0)
        if not p.get("distancia_cm"):
            p["distancia_cm"] = perfil.get("distancia_cm", 0)

        bancales = p.get("superficie_m2", 0) / m2_bancal
        if p["lineas"] and p["distancia_cm"] and largo_cm:
            p["plantas"] = round(p["lineas"] * int(largo_cm // p["distancia_cm"]) * bancales)

        if antes != (p.get("rinde_kg_m2"), p.get("lineas"), p.get("distancia_cm"), p.get("plantas")):
            tocados.append((p["cultivo"], bancales, p))

    if not tocados:
        print("El plan ya estaba completo: no hay nada que agregar.")
        return

    resultado = enviar(url, {
        "chacra": chacra,
        "clave": clave_admin(),
        "registros": [{"id": f"config-completar-{chacra}", "tipo": "config", "datos": config,
                       "temporada": config.get("temporada", {}).get("nombre", ""),
                       "dispositivo": "escritorio"}],
    })
    if not resultado.get("ok"):
        raise SystemExit(f"El servicio respondio con error: {resultado}")

    print(f"Plan de '{chacra}' completado ({len(tocados)} cultivos):")
    for cultivo, bancales, p in tocados:
        print(f"  {cultivo:<14} {bancales:5.1f} bancales · {p['rinde_kg_m2']:>5} kg/m²"
              f" · {p['lineas']} lineas a {p['distancia_cm']} cm · {p['plantas']} plantas")


if __name__ == "__main__":
    main()
