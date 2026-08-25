"""Carga las areas propias de una chacra, con sus actividades.

Las seis areas estandar (Horticola, Fruticola, Fungis, Comercializacion,
Administracion, Mantenimiento) vienen con la app y no se cargan aca: son
iguales para todos los colectivos y no se pueden editar. Este script es para
lo que cada espacio tiene de propio.

Se puede hacer lo mismo desde el telefono, en Configuracion > Areas de trabajo.
Esto existe para no tipear listas largas en un celular.

Uso:
    python tools/areas_propias.py tica
    python tools/areas_propias.py milpa "Apicultura: Revision, Cosecha, Sanidad"
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

# Las que vienen con la app: si alguna aparece aca, se descarta.
FIJAS = ["Hortícola", "Frutícola", "Fungis", "Comercialización",
         "Administración", "Mantenimiento"]

# Lo propio de cada chacra, cuando ya se sabe de antemano.
PROPIAS = {
    "tica": [
        ("Sala de lavado", ["Diseño", "Ejecución", "Mejoras"]),
        ("Biofábrica", ["Diseño de plan", "Elaboración", "Monitoreo", "Aplicación"]),
        ("Plantinera", ["Diseño", "Ejecución", "Mejoras"]),
    ],
}


def comparable(s: str) -> str:
    """Sin tildes, sin mayusculas y sin la s final, para comparar nombres."""
    s = unicodedata.normalize("NFD", str(s or "").strip().lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s[:-1] if s.endswith("s") else s


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Uso: python tools/areas_propias.py <chacra> [\"Nombre: act, act\"...]")
    chacra = sys.argv[1].strip().lower()
    url = URL_PATH.read_text(encoding="utf-8").strip()
    clave = CLAVE_PATH.read_text(encoding="utf-8").strip()

    # Los argumentos sueltos ganan sobre la lista de arriba.
    if len(sys.argv) > 2:
        entradas = []
        for arg in sys.argv[2:]:
            nombre, _, acts = arg.partition(":")
            entradas.append((nombre.strip(),
                             [a.strip() for a in acts.split(",") if a.strip()]))
    else:
        entradas = PROPIAS.get(chacra, [])
    if not entradas:
        raise SystemExit(f"No hay areas propias definidas para '{chacra}'.")

    fijas = {comparable(n) for n in FIJAS}
    areas = []
    for nombre, acts in entradas:
        if comparable(nombre) in fijas:
            print(f"  (se omite {nombre}: ya viene con la app)")
            continue
        areas.append({"nombre": nombre, "estado": "activo", "actividades": acts})
    if not areas:
        raise SystemExit("Todas las areas indicadas ya vienen con la app.")

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
    config["areas"] = areas
    config.pop("proyectos", None)

    cuerpo = json.dumps({
        "chacra": chacra, "clave": clave,
        "registros": [{"id": f"config-areas-{chacra}", "tipo": "config",
                       "datos": config, "dispositivo": "escritorio"}],
    }).encode("utf-8")
    pedido = request.Request(url, data=cuerpo,
                             headers={"Content-Type": "text/plain;charset=utf-8"})
    with request.urlopen(pedido, timeout=120) as r:
        resultado = json.loads(r.read().decode("utf-8"))
    if not resultado.get("ok"):
        raise SystemExit(f"El servicio respondio con error: {resultado}")

    # Se relee para confirmar que el servicio las guardo de verdad: el script
    # anterior descartaba en silencio lo que no entendia.
    verificar = pedir(f"{url}?config=1&chacra={chacra}&clave={parse.quote(clave)}")
    guardadas = [a["nombre"] for a in verificar.get("config", {}).get("areas", [])]
    print(f"\nAreas propias de '{chacra}':")
    for a in areas:
        print(f"  {a['nombre']:<18} {len(a['actividades'])} actividades")
    if sorted(guardadas) != sorted(a["nombre"] for a in areas):
        raise SystemExit(
            f"\nOJO: el servicio devolvio {guardadas}.\n"
            "Suele significar que el Apps Script desplegado es el anterior, que\n"
            "todavia guarda 'proyectos' y descarta 'areas'. Redesplegalo y repeti.")
    print("\nConfirmado: el servicio las devuelve guardadas.")


if __name__ == "__main__":
    main()
