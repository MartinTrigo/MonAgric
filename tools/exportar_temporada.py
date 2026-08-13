"""Exporta la temporada activa de la base local a docs/temporada.json.

La app web (carpeta docs/, la que se publica en GitHub Pages) lee ese archivo
para mostrar el plan de la temporada y para que los formularios (siembras,
horas, cosechas) ofrezcan los cultivos, sectores e integrantes reales.

Uso:  python tools/exportar_temporada.py

Importante: el repositorio de la app web es publico, asi que de los integrantes
solo se exportan nombre y rol (nunca telefono, direccion ni valor hora).
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DB_PATH = RAIZ / "monagric.sqlite3"
SALIDA = RAIZ / "docs" / "temporada.json"

# Las actividades de trabajo viven en la app de escritorio: se copian aca para no
# tener que importarla (arrastraria todo Kivy solo para leer una lista).
ACTIVIDADES_TRABAJO = ["Planificación", "Siembra", "Trasplante", "Manejo productivo",
                       "Cosecha y acondicionado", "Administración", "Comercialización",
                       "Comunicación", "Mantenimiento"]


def conectar() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def temporada_activa(conn: sqlite3.Connection) -> sqlite3.Row:
    fila = conn.execute(
        "SELECT * FROM temporadas WHERE activa = 1 ORDER BY id DESC LIMIT 1"
    ).fetchone()
    if fila is None:
        fila = conn.execute("SELECT * FROM temporadas ORDER BY id DESC LIMIT 1").fetchone()
    if fila is None:
        raise SystemExit("No hay ninguna temporada cargada en la base.")
    return fila


def config(conn: sqlite3.Connection) -> dict:
    return {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM app_config")}


def numero(valor, defecto=0.0) -> float:
    try:
        return float(valor)
    except (TypeError, ValueError):
        return defecto


def main() -> None:
    conn = conectar()
    temp = temporada_activa(conn)
    cfg = config(conn)
    tid = temp["id"]

    plan = [
        {
            "cultivo": r["cultivo"],
            "superficie_m2": numero(r["superficie_m2"]),
            "cosecha_esperada_kg": numero(r["cosecha_esperada_kg"]),
            "tipo_siembra": r["tipo_siembra"] or "",
            "distancia_cm": numero(r["distancia_cm"]),
            "lineas": int(r["lineas"] or 0),
            "plantas": int(r["plantas"] or 0),
        }
        for r in conn.execute(
            "SELECT * FROM plan_temporada WHERE temporada_id = ? ORDER BY cultivo", (tid,)
        )
    ]

    sectores = [
        {
            "sector": r["sector"],
            "bancales": int(r["bancales"] or 0),
            "tipo_riego": r["tipo_riego"] or "",
        }
        for r in conn.execute(
            "SELECT * FROM sectores_riego WHERE temporada_id = ? ORDER BY sector", (tid,)
        )
    ]

    # Solo los nombres: el repositorio de la app web es publico, y ademas el rol
    # y el valor hora no se usan en ningun lado.
    integrantes = [
        {"nombre": r["nombre"]}
        for r in conn.execute("SELECT nombre FROM integrantes ORDER BY nombre")
    ]

    perfiles = {
        r["cultivo"]: {
            "dias_a_cosecha": int(r["dias_a_cosecha"] or 0),
            "dias_almacigo": int(r["dias_almacigo"] or 0),
            "dias_trasplante_cosecha": int(r["dias_trasplante_cosecha"] or 0),
            "rinde_ref_kg_m2": numero(r["rinde_ref_kg_m2"]),
            "tipo_siembra": r["tipo_siembra"] or "",
            "distancia_cm": numero(r["distancia_cm"]),
            "lineas_bancal": int(r["lineas_bancal"] or 0),
        }
        for r in conn.execute("SELECT * FROM cultivo_perfil ORDER BY cultivo")
    }

    # Catalogo: los del plan primero (son los que se van a sembrar de verdad),
    # despues el resto de los conocidos.
    del_plan = [p["cultivo"] for p in plan]
    conocidos = (
        {r["cultivo"] for r in conn.execute("SELECT cultivo FROM cultivo_perfil")}
        | {r["nombre"] for r in conn.execute("SELECT nombre FROM cultivos_extra")}
    )
    otros = sorted(conocidos - set(del_plan))

    datos = {
        "generado": datetime.now().isoformat(timespec="seconds"),
        "temporada": {
            "nombre": temp["nombre"],
            "inicio": temp["fecha_inicio"] or cfg.get("temporada_inicio", ""),
            "fin": temp["fecha_fin"] or cfg.get("temporada_fin", ""),
        },
        "chacra": {
            "nombre": cfg.get("chacra_nombre", ""),
            "productor": cfg.get("productor_nombre", ""),
            "bancal_m2": numero(cfg.get("bancal_m2"), 30.0),
            "largo_bancal_m": numero(cfg.get("largo_bancal_m"), 30.0),
            "ancho_bancal_m": numero(cfg.get("ancho_bancal_m"), 1.0),
            "pasillo_m": numero(cfg.get("pasillo_m"), 0.6),
            "n_bancales": int(numero(cfg.get("n_bancales"), 0)),
        },
        "sectores": sectores,
        "plan": plan,
        "integrantes": integrantes,
        "actividades": ACTIVIDADES_TRABAJO,
        "cultivos": del_plan + otros,
        "perfiles": perfiles,
    }

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8")

    sup = sum(p["superficie_m2"] for p in plan)
    kg = sum(p["cosecha_esperada_kg"] for p in plan)
    print(f"Temporada {datos['temporada']['nombre']} exportada a {SALIDA}")
    print(f"  {len(plan)} cultivos planificados | {sup:,.0f} m2 | {kg:,.0f} kg esperados")
    print(f"  {len(sectores)} sectores | {len(integrantes)} integrantes")


if __name__ == "__main__":
    main()
