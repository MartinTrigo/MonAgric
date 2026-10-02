"""Dice si el Apps Script desplegado es el ultimo o quedo uno anterior.

Pegar el codigo en el editor y guardar NO alcanza: la aplicacion web sigue
sirviendo la version que quedo congelada al implementar. Este script pregunta
al servicio y avisa cual esta corriendo, para no tener que adivinarlo.

Uso:  python tools/version_servicio.py
"""

from __future__ import annotations

import json
import re
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


def columnas_de_la_app() -> dict[str, list[str]]:
    """Los encabezados que la app lee, sacados de DE_LA_HOJA en registros.js."""
    js = (RAIZ / "docs" / "js" / "registros.js").read_text(encoding="utf-8")
    bloque = js[js.index("const DE_LA_HOJA = {"):]
    bloque = bloque[:bloque.index("\n};")]
    hojas: dict[str, list[str]] = {}
    for hoja, cuerpo in re.findall(r"(\w+): \{([^}]*)\}", bloque):
        hojas[hoja] = re.findall(r'"([^"]+)"', cuerpo)
    return hojas


def revisar_columnas_en_planillas(pedir) -> None:
    """Que en cada planilla las columnas esten donde el servicio las espera.

    El servicio lee y escribe por posicion: una columna insertada o movida a
    mano corre todos los datos sin dar error.
    """
    chacras = pedir("x=1").get("chacras") or ["tica"]
    for chacra in chacras:
        r = pedir(f"columnas=1&chacra={chacra}")
        if not r.get("ok"):
            print(f"  [?]        columnas de {chacra}: {r.get('error', 'sin respuesta')}")
            continue
        for h in r["hojas"]:
            if h.get("repetidos"):
                print(f"  [!!]       {chacra}, {h['hoja']}: ids cargados mas de una vez: "
                      + ", ".join(h["repetidos"][:5]))
        malas = [h for h in r["hojas"] if h["distintas"]]
        if not malas:
            print(f"  [al dia]   columnas en su lugar en {chacra}")
            continue
        print(f"  [!!]       {chacra}: hay columnas fuera de lugar (los datos se leen corridos)")
        for h in malas:
            for d in h["distintas"]:
                print(f"             - {h['hoja']}, columna {d['columna']}: "
                      f"espera «{d['espera']}» y hay «{d['hay']}»")


def main() -> None:
    url = URL_PATH.read_text(encoding="utf-8").strip()
    clave = CLAVE_PATH.read_text(encoding="utf-8").strip()

    def pedir(que: str) -> dict:
        # "que" puede ser un campo suelto ("resumen") o una consulta entera
        cola = que if "=" in que else f"{que}=1&chacra=tica"
        direccion = f"{url}?{cola}&clave={parse.quote(clave)}"
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

    # Los almacigos que esperan trasplante los cuenta el servidor sobre la hoja
    # entera. Sin esto, la app se queda con las ultimas 15 siembras y lo
    # sembrado en agosto no se puede trasplantar en septiembre: paso el 23/9 y
    # no dio ningun error, simplemente no habia nada que elegir.
    al = pedir("almacigos=1&chacra=tica")
    if "almacigos" not in al:
        print("  [ANTERIOR] los almacigos que esperan trasplante (la clave ni llega)")
        viejas.append("los almacigos que esperan trasplante")
    else:
        print(f"  [al dia]   los almacigos que esperan trasplante "
              f"({len(al['almacigos'])} esperando)")

    # Corregir y borrar registros (29/09): la configuracion lo anuncia, y la app
    # muestra los botones solo si lo ve.
    cf = pedir("config=1&chacra=tica").get("config", {})
    if cf.get("corregir"):
        print("  [al dia]   corregir y borrar registros")
    else:
        print("  [ANTERIOR] corregir y borrar registros (los botones no aparecen)")
        viejas.append("corregir y borrar registros")

    # 30/09: la configuracion por partes, y las horas de Tica entrando por
    # este servicio con credencial (antes, por el script de horas abierto).
    if cf.get("parcial"):
        print("  [al dia]   la configuracion se guarda por partes")
    else:
        print("  [ANTERIOR] la configuracion se guarda por partes (sigue entera)")
        viejas.append("la configuracion por partes")
    if cf.get("horas_por_servicio"):
        print(f"  [al dia]   las horas de Tica entran por el servicio "
              f"({len(cf.get('nombres_horas') or [])} nombres en la planilla de horas)")
    else:
        print("  [ANTERIOR] las horas de Tica siguen yendo al script de horas abierto")
        viejas.append("las horas de Tica por el servicio")

    # 01/10: el servicio manda su esquema; la app lee cada fila por esos
    # nombres (DE_LA_HOJA en docs/js/registros.js). Si no coinciden, el dato
    # desaparece de la pantalla sin error.
    esquema = cf.get("esquema")
    if not esquema:
        print("  [ANTERIOR] el esquema de las hojas (no viaja con la configuracion)")
        viejas.append("el esquema de las hojas")
    else:
        faltan = [f"{h}: {c}" for h, cols in columnas_de_la_app().items()
                  if h in esquema for c in ["Id", *cols] if c not in esquema[h]]
        if faltan:
            print("  [!!]       la app lee columnas que el servicio no tiene:")
            for f in faltan:
                print(f"             - {f}")
        else:
            print("  [al dia]   la app y el servicio usan las mismas columnas")
        revisar_columnas_en_planillas(pedir)

    # La proyeccion para AMA Economia: con codigo viejo, "proyeccion" ni se
    # mira y la respuesta es la de un servicio sin nada que decir.
    pr = pedir("proyeccion=1&chacra=tica")
    if "plan" not in pr:
        print("  [ANTERIOR] la proyeccion para AMA Economia")
        viejas.append("la proyeccion para AMA Economia")
    else:
        print(f"  [al dia]   la proyeccion para AMA Economia "
              f"({len(pr['plan'])} cultivos)")

    # La economia no se detecta por un nombre de campo sino por si la clave
    # llega o no: si el codigo desplegado es anterior, ni aparece.
    print()
    mc = pedir("micuenta=1&chacra=tica&persona=Marto")
    if "economia" not in mc:
        print("  [ANTERIOR] el resumen economico (la clave ni llega)")
        viejas.append("el resumen economico")
    elif mc["economia"] is None:
        print("  [al dia]   el codigo del resumen economico")
        print("             pero falta la propiedad ECONOMIA_URLS, o esta mal escrita")
    elif mc["economia"].get("error"):
        print("  [al dia]   el codigo del resumen economico")
        print("             pero Bioma respondio: " + str(mc["economia"]["error"])[:90])
    else:
        print("  [al dia]   el resumen economico, y Bioma responde bien")

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
