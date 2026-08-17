"""Carga las actividades de cada proyecto en la configuracion de una chacra.

Tipear cuarenta actividades en un celular es un castigo. Este script toma la
configuracion tal como esta, le agrega las actividades a los proyectos que
coincidan por nombre y la vuelve a guardar, sin tocar nada mas.

Uso:  python tools/cargar_actividades.py tica
"""

from __future__ import annotations

import json
import sys
import unicodedata
from pathlib import Path
from urllib import error, parse, request

RAIZ = Path(__file__).resolve().parent.parent
URL_PATH = RAIZ / "tools" / "servicio.txt"
CLAVE_PATH = RAIZ / "tools" / "clave_admin.txt"

ACTIVIDADES = {
    "Hortícolas": ["Siembras", "Trasplante", "Desyuye", "Sanidad y Fertilidad",
                   "Poda / Conducción", "Cosecha / Poscosecha"],
    "Frutícolas": ["Implantación", "Poda / Conducción", "Fertilidad y Sanidad",
                   "Cosecha / Poscosecha"],
    "Fungis": ["Sustrato", "Inoculación", "Mantenimiento", "Cosecha"],
    "Sala de Lavado": ["Diseño", "Ejecución", "Mejoras"],
    "Plantinera": ["Diseño", "Ejecución", "Mejoras"],
    "Comercialización": ["Stock", "Análisis mercado", "Armado de oferta",
                         "Proveedores", "Otras"],
    "Administración": ["Contabilidad", "Proyección", "Pagos", "Otras"],
    "Biofábrica": ["Diseño de plan", "Elaboración", "Monitoreo", "Aplicación"],
    "Mantenimiento": ["Corte de pasto", "Orden y limpieza", "Reparaciones",
                      "Mejoras"],
}


def sin_tildes(s: str) -> str:
    s = unicodedata.normalize("NFD", str(s))
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower().strip()


def comparable(s: str) -> str:
    """Nombre comparable: sin tildes, sin mayusculas y sin la s final.

    En la app pueden estar cargados como "Horticola" o "Hortícolas": para
    encontrarlos igual, el singular y el plural valen lo mismo.
    """
    limpio = sin_tildes(s)
    return limpio[:-1] if limpio.endswith("s") else limpio


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Uso: python tools/cargar_actividades.py <chacra>")
    chacra = sys.argv[1].strip().lower()
    url = URL_PATH.read_text(encoding="utf-8").strip()
    clave = CLAVE_PATH.read_text(encoding="utf-8").strip()

    def pedir(direccion: str) -> dict:
        try:
            with request.urlopen(direccion, timeout=120) as r:
                return json.loads(r.read().decode("utf-8"))
        except error.URLError as e:
            raise SystemExit(f"No se pudo conectar: {e}")

    respuesta = pedir(f"{url}?config=1&chacra={chacra}&clave={parse.quote(clave)}")
    if not respuesta.get("ok"):
        raise SystemExit(f"El servicio respondio con error: {respuesta}")
    config = respuesta["config"]

    # Se busca sin tildes ni mayusculas, para que "Horticolas" encuentre a
    # "Hortícolas" aunque se haya escrito distinto en la app.
    por_nombre = {comparable(k): v for k, v in ACTIVIDADES.items()}
    tocados, sin_lista = [], []

    for p in config.get("proyectos", []):
        lista = por_nombre.get(comparable(p["nombre"]))
        if lista:
            p["actividades"] = lista
            tocados.append((p["nombre"], len(lista)))
        elif not p.get("actividades"):
            sin_lista.append(p["nombre"])

    if not tocados:
        raise SystemExit("Ningun proyecto de la chacra coincidio con las listas.")

    cuerpo = json.dumps({
        "chacra": chacra, "clave": clave,
        "registros": [{"id": f"config-actividades-{chacra}", "tipo": "config",
                       "datos": config, "dispositivo": "escritorio"}],
    }).encode("utf-8")
    pedido = request.Request(url, data=cuerpo,
                             headers={"Content-Type": "text/plain;charset=utf-8"})
    with request.urlopen(pedido, timeout=120) as r:
        resultado = json.loads(r.read().decode("utf-8"))
    if not resultado.get("ok"):
        raise SystemExit(f"El servicio respondio con error: {resultado}")

    print(f"Actividades cargadas en '{chacra}':")
    for nombre, cuantas in tocados:
        print(f"  {nombre:<18} {cuantas} actividades")
    if sin_lista:
        print("\nSin lista propia (van a pedir solo el texto libre):")
        for nombre in sin_lista:
            print(f"  {nombre}")


if __name__ == "__main__":
    main()
