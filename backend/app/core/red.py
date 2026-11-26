"""Red: prueba primero las direcciones IPv4.

`httpx` intenta las direcciones en el orden en que las devuelve el sistema y no pasa a la siguiente hasta agotar el tiempo de espera. En un equipo
con IPv6 mal enrutado (Cloudflare publica direcciones IPv6 y la conexión nunca termina), Ada remota parecía «colgada» aunque `curl` conectara bien.
Aquí solo se REORDENA la lista (IPv4 primero): las IPv6 siguen ahí, como último recurso, y nada se descarta.
"""
from __future__ import annotations

import socket

_original = socket.getaddrinfo
_puesto = False


def _ipv4_primero(*args, **kwargs):
    infos = _original(*args, **kwargs)
    return sorted(infos, key=lambda i: i[0] != socket.AF_INET)       # sorted es estable: el resto del orden se conserva


def ipv4_primero() -> None:
    """Idempotente: se puede llamar más de una vez."""
    global _puesto
    if not _puesto:
        socket.getaddrinfo = _ipv4_primero
        _puesto = True
