"""Trae a la base de la app de escritorio lo que se cargó desde los celulares.

La app web escribe en la planilla de Google; la app de escritorio trabaja contra
monagric.sqlite3. Este script cierra ese circulo: le pide al servicio de Apps
Script las filas de cada hoja y mete en la base las que todavia no estan.

Se puede correr todas las veces que haga falta: cada registro trae el id que le
puso el celular, se guarda en la columna origen_id y no se duplica.

Uso:
    python tools/importar_de_planilla.py https://script.google.com/macros/s/.../exec

La direccion queda guardada en tools/servicio.txt (no se publica), asi que las
proximas veces alcanza con:
    python tools/importar_de_planilla.py
"""

from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from urllib import error, request

RAIZ = Path(__file__).resolve().parent.parent
DB_PATH = RAIZ / "monagric.sqlite3"
URL_PATH = RAIZ / "tools" / "servicio.txt"
CLAVE_PATH = RAIZ / "tools" / "clave_admin.txt"


def clave_admin() -> str:
    """La clave que identifica a las herramientas de escritorio ante el servicio.

    Vive en tools/clave_admin.txt, que no se publica. Es la misma que esta
    cargada en la propiedad CLAVE_ADMIN del Apps Script.
    """
    if not CLAVE_PATH.exists():
        raise SystemExit(
            "Falta tools/clave_admin.txt con la clave de administracion.\n"
            "Es la misma que pusiste en la propiedad CLAVE_ADMIN del Apps Script.")
    return CLAVE_PATH.read_text(encoding="utf-8").strip()

# Que hoja de la planilla va a que tabla, y como se llama cada columna aca.
# (encabezado en la planilla -> columna en la base)
MAPAS = {
    "siembras": {
        "tabla": "siembras",
        "columnas": {
            "Fecha": "fecha", "Cultivo": "cultivo", "Variedad": "variedad", "Tipo": "tipo",
            "Generación": "generacion", "Bandejas": "bandejas", "Alvéolos": "tipo_bandeja",
            "Sector": "sector", "Bancal": "bancal", "Operador": "operador",
            "Observaciones": "observaciones",
        },
    },
    "cosechas": {
        "tabla": "cosechas",
        # Sin sector ni bancal: se cosecha de varios bancales a la vez y lo que
        # se registra son los kilos totales de cada cultivo.
        "columnas": {"Fecha": "fecha", "Cultivo": "cultivo", "Kg": "kg"},
    },
    "tareas": {
        "tabla": "tareas",
        "columnas": {
            "Para cuándo": "fecha", "Tarea": "tarea", "Importancia": "importancia",
            "Personas": "n_personas", "Hecha el": "fecha_realizada",
        },
    },
}

ENTEROS = {"generacion", "bandejas", "tipo_bandeja", "bancal", "n_personas"}
REALES = {"kg"}


def leer_url() -> str:
    if len(sys.argv) > 1:
        url = sys.argv[1].strip()
        URL_PATH.write_text(url, encoding="utf-8")
        return url
    if URL_PATH.exists():
        return URL_PATH.read_text(encoding="utf-8").strip()
    raise SystemExit(
        "Falta la direccion del servicio.\n"
        "Pasala una vez:  python tools/importar_de_planilla.py https://script.google.com/.../exec")


def pedir(url: str, hoja: str) -> list[dict]:
    from urllib.parse import quote
    try:
        with request.urlopen(
                f"{url}?exportar={hoja}&clave={quote(clave_admin())}", timeout=60) as r:
            datos = json.loads(r.read().decode("utf-8"))
    except error.URLError as e:
        raise SystemExit(f"No se pudo conectar con el servicio: {e}")
    if not datos.get("ok"):
        raise SystemExit(f"El servicio respondio con error: {datos}")
    return datos.get("filas", [])


def preparar_base(conn: sqlite3.Connection) -> None:
    """Agrega la columna origen_id donde falte, para no importar dos veces."""
    for mapa in MAPAS.values():
        tabla = mapa["tabla"]
        cols = [r[1] for r in conn.execute(f"PRAGMA table_info({tabla})")]
        if "origen_id" not in cols:
            conn.execute(f"ALTER TABLE {tabla} ADD COLUMN origen_id TEXT;")


def temporada_activa(conn: sqlite3.Connection):
    fila = conn.execute("SELECT id FROM temporadas WHERE activa = 1 ORDER BY id DESC").fetchone()
    return fila[0] if fila else None


def convertir(columna: str, valor):
    if valor in (None, ""):
        return 0 if columna in ENTEROS | REALES else ""
    if columna in ENTEROS:
        try:
            return int(float(valor))
        except (TypeError, ValueError):
            return 0
    if columna in REALES:
        try:
            return float(str(valor).replace(",", "."))
        except (TypeError, ValueError):
            return 0.0
    return str(valor)


def importar(conn: sqlite3.Connection, hoja: str, filas: list[dict], tid) -> int:
    mapa = MAPAS[hoja]
    tabla = mapa["tabla"]
    ya_estan = {r[0] for r in conn.execute(
        f"SELECT origen_id FROM {tabla} WHERE origen_id IS NOT NULL")}
    cols_tabla = [r[1] for r in conn.execute(f"PRAGMA table_info({tabla})")]

    nuevas = 0
    for fila in filas:
        origen = str(fila.get("Id") or "")
        if not origen or origen in ya_estan:
            continue

        valores = {"origen_id": origen, "created_at": datetime.now().isoformat(timespec="seconds")}
        for encabezado, columna in mapa["columnas"].items():
            if columna in cols_tabla:
                valores[columna] = convertir(columna, fila.get(encabezado))
        if "temporada_id" in cols_tabla and tid:
            valores["temporada_id"] = tid
        if tabla == "tareas":
            valores["realizada"] = 1 if str(fila.get("Estado")) == "Hecha" else 0

        campos = ", ".join(valores)
        marcas = ", ".join("?" for _ in valores)
        conn.execute(f"INSERT INTO {tabla} ({campos}) VALUES ({marcas})", list(valores.values()))
        ya_estan.add(origen)
        nuevas += 1
    return nuevas


def main() -> None:
    if not DB_PATH.exists():
        raise SystemExit(f"No encuentro la base: {DB_PATH}")
    url = leer_url()

    conn = sqlite3.connect(DB_PATH)
    with conn:
        preparar_base(conn)
        tid = temporada_activa(conn)
        if tid is None:
            print("Aviso: no hay temporada activa; los registros entran sin temporada.")
        total = 0
        for hoja in MAPAS:
            filas = pedir(url, hoja)
            nuevas = importar(conn, hoja, filas, tid)
            total += nuevas
            print(f"  {hoja}: {len(filas)} en la planilla, {nuevas} nuevas")
    conn.close()
    print(f"Listo: {total} registro(s) agregados a la app de escritorio."
          if total else "Listo: la base ya estaba al dia.")


if __name__ == "__main__":
    main()
