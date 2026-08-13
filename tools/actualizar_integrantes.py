"""Deja la lista de integrantes de la temporada igual a la del equipo actual.

Los integrantes que ya existian conservan sus datos (telefono, direccion, valor
hora); solo cambia el nombre cuando corresponde. Los que no estan en la lista se
retiran de la temporada, pero quedan en la copia de seguridad que se hace antes
de tocar nada.

Uso:  python tools/actualizar_integrantes.py
"""

from __future__ import annotations

import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DB_PATH = RAIZ / "monagric.sqlite3"

# Equipo actual, en el mismo orden en que aparece en la planilla de horas.
EQUIPO = [
    ("Marto", "Administrador"),
    ("Tomi", "Administrador"),
    ("Luna", "Administrador"),
    ("Luis", "Operario"),
    ("Belu", "Administrador"),
    ("Nati", "Operario"),
]

# Nombres que cambiaron: se conservan los datos de la persona y sus registros.
RENOMBRES = {"Martín": "Marto", "Martin": "Marto"}


def main() -> None:
    respaldo = DB_PATH.with_name(
        f"{DB_PATH.stem}.respaldo-{datetime.now():%Y%m%d-%H%M%S}{DB_PATH.suffix}")
    shutil.copy2(DB_PATH, respaldo)
    print(f"Copia de seguridad: {respaldo.name}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    with conn:
        # 1) Renombrar a la persona y arrastrar sus registros de horas.
        for viejo, nuevo in RENOMBRES.items():
            if conn.execute("SELECT 1 FROM integrantes WHERE nombre = ?", (viejo,)).fetchone():
                conn.execute("UPDATE integrantes SET nombre = ? WHERE nombre = ?", (nuevo, viejo))
                conn.execute("UPDATE horas_trabajo SET integrante = ? WHERE integrante = ?",
                             (nuevo, viejo))
                print(f"  {viejo} -> {nuevo} (conserva sus datos y registros)")

        actuales = {r["nombre"]: dict(r) for r in conn.execute("SELECT * FROM integrantes")}

        # 2) Sumar los que faltan.
        ahora = datetime.now().isoformat(timespec="seconds")
        for nombre, rol in EQUIPO:
            if nombre in actuales:
                conn.execute("UPDATE integrantes SET rol = ? WHERE nombre = ?", (rol, nombre))
            else:
                conn.execute(
                    "INSERT INTO integrantes (nombre, direccion, telefono, rol, valor_hora,"
                    " created_at) VALUES (?, '', '', ?, 0, ?)", (nombre, rol, ahora))
                print(f"  + {nombre} ({rol})")

        # 3) Retirar a los que ya no estan en el equipo.
        del_equipo = {n for n, _ in EQUIPO}
        for nombre in actuales:
            if nombre not in del_equipo:
                conn.execute("DELETE FROM integrantes WHERE nombre = ?", (nombre,))
                print(f"  - {nombre} (queda en la copia de seguridad)")

    orden = {n: i for i, (n, _) in enumerate(EQUIPO)}
    final = sorted((r["nombre"], r["rol"]) for r in conn.execute("SELECT * FROM integrantes"))
    final.sort(key=lambda x: orden.get(x[0], 99))
    print("Equipo de la temporada:", ", ".join(f"{n} ({r})" for n, r in final))


if __name__ == "__main__":
    main()
