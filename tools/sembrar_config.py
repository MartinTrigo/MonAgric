"""Manda la configuracion de una chacra desde la base local a su hoja Config.

Sirve para arrancar sin cargar todo a mano: toma la temporada activa de
monagric.sqlite3 (sectores, integrantes y plan de cultivos) y se la manda al
servicio, que la escribe en la planilla de esa chacra.

De ahi en mas la configuracion se edita desde la app, en la seccion Config.

Uso:  python tools/sembrar_config.py tica
      (la direccion del servicio sale de tools/servicio.txt)
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path
from urllib import error, request

RAIZ = Path(__file__).resolve().parent.parent
DB_PATH = RAIZ / "monagric.sqlite3"
URL_PATH = RAIZ / "tools" / "servicio.txt"


def numero(v, defecto=0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return defecto


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Falta el codigo de la chacra. Ej: python tools/sembrar_config.py tica")
    chacra = sys.argv[1].strip().lower()
    if not URL_PATH.exists():
        raise SystemExit("No encuentro tools/servicio.txt. Corré antes importar_de_planilla.py"
                         " con la direccion del servicio.")
    url = URL_PATH.read_text(encoding="utf-8").strip()

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    temp = conn.execute(
        "SELECT * FROM temporadas WHERE activa = 1 ORDER BY id DESC LIMIT 1").fetchone()
    if temp is None:
        raise SystemExit("No hay temporada activa en la base.")
    cfg_app = {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM app_config")}

    config = {
        "nombre": cfg_app.get("chacra_nombre", ""),
        "temporada": {
            "nombre": temp["nombre"],
            "inicio": temp["fecha_inicio"] or "",
            "fin": temp["fecha_fin"] or "",
        },
        "bancal": {
            "largo_m": numero(cfg_app.get("largo_bancal_m"), 0),
            "ancho_m": numero(cfg_app.get("ancho_bancal_m"), 0),
            "pasillo_m": numero(cfg_app.get("pasillo_m"), 0),
            "n_bancales": int(numero(cfg_app.get("n_bancales"), 0)),
        },
        "sectores": [
            {"sector": r["sector"], "bancales": int(r["bancales"] or 0),
             "tipo_riego": r["tipo_riego"] or ""}
            for r in conn.execute(
                "SELECT * FROM sectores_riego WHERE temporada_id = ? ORDER BY sector",
                (temp["id"],))
        ],
        "integrantes": [r["nombre"] for r in
                        conn.execute("SELECT nombre FROM integrantes ORDER BY nombre")],
        "plan": [
            {
                "cultivo": r["cultivo"],
                "superficie_m2": numero(r["superficie_m2"]),
                "cosecha_esperada_kg": numero(r["cosecha_esperada_kg"]),
                # El rinde sale de lo planificado, no de la referencia: es el que
                # esta chacra espera de verdad para ese cultivo.
                "rinde_kg_m2": round(numero(r["cosecha_esperada_kg"]) /
                                     numero(r["superficie_m2"], 1), 3)
                if numero(r["superficie_m2"]) else 0,
                "lineas": int(r["lineas"] or 0),
                "distancia_cm": numero(r["distancia_cm"]),
                "plantas": int(r["plantas"] or 0),
            }
            for r in conn.execute(
                "SELECT * FROM plan_temporada WHERE temporada_id = ? ORDER BY cultivo",
                (temp["id"],))
        ],
    }

    cuerpo = json.dumps({
        "chacra": chacra,
        "registros": [{"id": f"config-{chacra}", "tipo": "config", "datos": config,
                       "temporada": config["temporada"]["nombre"], "dispositivo": "escritorio"}],
    }).encode("utf-8")

    pedido = request.Request(url, data=cuerpo, headers={"Content-Type": "text/plain;charset=utf-8"})
    try:
        with request.urlopen(pedido, timeout=90) as r:
            respuesta = json.loads(r.read().decode("utf-8"))
    except error.URLError as e:
        raise SystemExit(f"No se pudo conectar con el servicio: {e}")

    if not respuesta.get("ok"):
        raise SystemExit(f"El servicio respondio con error: {respuesta}")

    print(f"Configuracion de '{chacra}' enviada:")
    print(f"  chacra: {config['nombre']} · temporada {config['temporada']['nombre']}")
    print(f"  {len(config['sectores'])} sectores · {len(config['integrantes'])} integrantes"
          f" · {len(config['plan'])} cultivos en el plan")


if __name__ == "__main__":
    main()
