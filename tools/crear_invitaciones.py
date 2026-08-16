"""Genera codigos de invitacion para pegar en la planilla de accesos.

Cada persona canjea su codigo UNA vez, en su telefono, durante la instalacion.
Despues el codigo queda usado y no sirve mas.

Uso:
    python tools/crear_invitaciones.py tica Marto Tomi Luna Luis Belu Nati
    python tools/crear_invitaciones.py milpa Ana Pedro

Imprime las filas listas para pegar en la hoja "Invitaciones" de
"MonAgric . Accesos (privado)".
"""

from __future__ import annotations

import secrets
import sys
from datetime import date

# Sin I, O, 0 ni 1: se confunden al dictarlos por telefono o escribirlos a mano.
LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def codigo(chacra: str) -> str:
    parte = "".join(secrets.choice(LETRAS) for _ in range(4))
    return f"{chacra.upper()[:5]}-{parte}"


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("Uso: python tools/crear_invitaciones.py <chacra> <nombre> [nombre...]")

    chacra = sys.argv[1].strip().lower()
    personas = sys.argv[2:]
    hoy = date.today().isoformat()

    print(f"\nInvitaciones para '{chacra}'. Pegá estas filas en la hoja Invitaciones:\n")
    print("Código\tChacra\tPara quién\tEstado\tCreada\tUsada el\tDispositivo")
    filas = []
    for persona in personas:
        c = codigo(chacra)
        filas.append((persona, c))
        print(f"{c}\t{chacra}\t{persona}\tLibre\t{hoy}\t\t")

    print("\nPara dictarlos:\n")
    for persona, c in filas:
        print(f"  {persona:<10} {c}")
    print()


if __name__ == "__main__":
    main()
