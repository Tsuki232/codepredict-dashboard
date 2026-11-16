# Asistente Ada (modelo de lenguaje) por un túnel

El panel puede pedirle a **Ada con modelo de lenguaje** (Ollama, en la GPU de un equipo del grupo) que *explique* un resultado en palabras sencillas
o que escriba preguntas de repaso. Es opcional: si no está configurado o el equipo está apagado, el panel funciona igual.

**Lo que NO hace:** no calcula nada (las cifras las da el motor estadístico), no escribe la discusión del grupo y no tiene acceso a archivos, código ni herramientas.
Todo texto que genere es de una IA: si se usa en el informe, hay que declararlo.

```
Navegador ──► servidor del panel (en cada equipo) ──► túnel de Cloudflare ──► puerta de enlace (127.0.0.1:8787) ──► Ollama (127.0.0.1:11434, modelo ada-q)
              (guarda ADA_REMOTE_KEY; el navegador nunca la ve)                (solo texto, con clave)
```

## En el equipo que corre Ada (el de la GPU)

```powershell
.\scripts\start_ada_server.ps1            # Ollama + puerta de enlace + túnel; imprime la dirección y las dos líneas para el .env
.\scripts\start_ada_server.ps1 -SinTunel  # solo local, para probar sin túnel
.\scripts\stop_ada_server.ps1             # apaga túnel y puerta de enlace (Ollama queda activo)
```

- La **clave** se genera la primera vez y queda en `ada_gateway/.env.gateway` (ignorado por git). Compártanla solo por un canal privado.
- **Túnel con nombre (el que está configurado):** en la cuenta de Cloudflare se creó UN túnel nuevo, `ada-gateway`, con UNA ruta publicada, `https://ada.<dominio-del-grupo>` → `http://127.0.0.1:8787`
  (Cloudflare añadió un único registro DNS CNAME para ese nombre; no se modificó ningún túnel, ruta ni registro existente). La dirección es **fija**, así que los compañeros configuran `ADA_REMOTE_URL` una sola vez.
  Su token vive en `ada_gateway/.env.gateway` (ignorado por git) como `CLOUDFLARE_TUNNEL_TOKEN`, junto con `ADA_PUBLIC_URL`; el script lo pasa por variable de entorno, nunca por la línea de comandos.
  **Para quitarlo:** en Cloudflare, Networking › Tunnels › `ada-gateway` › eliminar la ruta y el túnel (y el registro DNS `ada`); y borrar esas dos líneas de `.env.gateway`.
- **Túnel rápido (alternativa sin cuenta):** si `.env.gateway` no tiene token, el script usa el túnel rápido de Cloudflare (`trycloudflare.com`): no toca ninguna cuenta, pero **su dirección cambia cada vez que se reinicia**.
- Falta el programa `cloudflared`: el script lo busca en el PATH o como `ada_gateway/cloudflared.exe`. Sin él, la puerta de enlace funciona en local.
- Una dirección **fija** exige un túnel con nombre y un dominio en una cuenta de Cloudflare. Si se hace, que sea una cuenta **propia del proyecto**, no una cuenta de trabajo con otros túneles.

## En el equipo de cada compañero

En el archivo `.env` de su copia del panel (ya está ignorado por git):

```
ADA_REMOTE_URL=https://xxxx.trycloudflare.com
ADA_REMOTE_KEY=la-clave-que-les-pasaron
```

Reinician el panel y, en la vista **Inferencia**, aparece el panel «Asistente Ada».

## Seguridad (por qué es seguro exponerlo, y qué no hacer)

- La puerta de enlace solo acepta `explicar` o `repaso` con un resultado en JSON; **no hay chat libre ni herramientas**. El resultado se trata como datos, dentro de `<resultado>…</resultado>`.
- Exige clave (`X-API-Key`), limita el tamaño de la entrada, las peticiones por minuto (10), los tokens de la respuesta y atiende una petición a la vez.
- Comprueba que cada cifra del texto generado exista en el resultado recibido; las que no, se muestran como «no verificadas».
- Escucha solo en `127.0.0.1`. **Nunca** expongan el puerto de Ollama (11434) ni el agente completo de Ada: sus herramientas pueden leer y escribir archivos y ejecutar código.
- Para cortar el acceso: `stop_ada_server.ps1`, o cambiar la clave (borrar `ada_gateway/.env.gateway` y volver a arrancar).

## Límites

Solo funciona con el equipo prendido, con Ollama, la puerta de enlace y el túnel corriendo. La primera respuesta tarda más (carga del modelo). Una persona a la vez.
