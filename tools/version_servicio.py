"""Dice si el Apps Script desplegado es el ultimo o quedo uno anterior.

Pegar el codigo en el editor y guardar NO alcanza: la aplicacion web sigue
sirviendo la version que quedo congelada al implementar. Este script pregunta
al servicio y avisa cual esta corriendo, para no tener que adivinarlo.

Uso:  python tools/version_servicio.py
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib import error, parse, request

RAIZ = Path(__file__).resolve().parent.parent
URL_PATH = RAIZ / "tools" / "servicio.txt"
CLAVE_PATH = RAIZ / "tools" / "clave_admin.txt"

# Cada senal es: que mirar, que valor tiene la version nueva, y como se llamaba
# antes. Cuando se agregue un cambio grande, se suma una linea aca.
SENALES = [
    ("resumen", "horas_por_area", "horas_por_proyecto",
     "las horas se agrupan por area"),
    ("config", "areas", "proyectos",
     "la configuracion guarda areas propias"),
]


def main() -> None:
    url = URL_PATH.read_text(encoding="utf-8").strip()
    clave = CLAVE_PATH.read_text(encoding="utf-8").strip()

    def pedir(que: str) -> dict:
        direccion = f"{url}?{que}=1&chacra=tica&clave={parse.quote(clave)}"
        try:
            with request.urlopen(direccion, timeout=180) as r:
                return json.loads(r.read().decode("utf-8"))
        except error.URLError as e:
            raise SystemExit(f"No se pudo conectar: {e}")

    cache: dict[str, dict] = {}
    viejas = []
    print()
    for donde, nuevo, viejo, que_es in SENALES:
        if donde not in cache:
            cache[donde] = pedir(donde)
        d = cache[donde]
        if donde == "config":
            d = d.get("config", {})
        if nuevo in d:
            print(f"  [al dia]   {que_es}")
        elif viejo in d:
            print(f"  [ANTERIOR] {que_es}")
            viejas.append(que_es)
        else:
            print(f"  [?]        {que_es}: no encontre ni '{nuevo}' ni '{viejo}'")

    if viejas:
        print("\nEl servicio esta corriendo codigo anterior.\n")
        print("Para actualizarlo, en el editor de Apps Script:")
        print("  1. Pegar el codigo y guardar (el disquete).")
        print("  2. Implementar > Administrar implementaciones.")
        print("  3. En la que ya existe, el lapiz de editar.")
        print("  4. Version: Nueva version. Despues Implementar.")
        print("\nOJO: 'Nueva implementacion' NO sirve: crea otra URL distinta")
        print("y la app sigue hablando con la vieja, asi que no cambia nada.")
        raise SystemExit(1)

    print("\nTodo al dia: el servicio corre la ultima version.")


if __name__ == "__main__":
    main()
