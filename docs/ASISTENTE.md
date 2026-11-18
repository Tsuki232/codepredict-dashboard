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

### Arranque manual y automático (sin Docker, sin virtualización)

- **Manual, un clic:** doble clic en `scripts\iniciar_ada.cmd` (arranca todo y muestra la dirección) y `scripts\detener_ada.cmd` (lo apaga). Es lo mismo que los scripts de PowerShell, sin escribir comandos.
- **Automático al iniciar sesión en Windows:** `scripts\inicio_automatico.ps1` crea (o quita) un acceso directo en la carpeta *Inicio* del usuario. No pide administrador y es reversible:
  ```powershell
  .\scripts\inicio_automatico.ps1                                 # ¿está activado?
  .\scripts\inicio_automatico.ps1 -Accion Instalar -SoloMostrar   # enseña qué haría, sin cambiar nada
  .\scripts\inicio_automatico.ps1 -Accion Instalar                # lo activa
  .\scripts\inicio_automatico.ps1 -Accion Quitar                  # lo desactiva
  ```
  Arranca con `-SinPrecarga`: el modelo `ada-q` se carga en la GPU solo cuando alguien usa el asistente (así no se ocupan ~9 GB de VRAM cada vez que se prende el PC). El registro queda en `ada_gateway\inicio_automatico.log`.
- **Límites:** el arranque automático ocurre al **iniciar sesión** (no antes), y si algún proceso se cae no se reinicia solo: se vuelve a ejecutar `iniciar_ada.cmd`. Docker (con `restart: unless-stopped`) sería más robusto, pero exige activar la virtualización en la BIOS.

## En el equipo de cada compañero

En el archivo `.env` de su copia del panel (ya está ignorado por git):

```
ADA_REMOTE_URL=https://xxxx.trycloudflare.com
ADA_REMOTE_KEY=la-clave-que-les-pasaron
```

Reinician el panel y, en la vista **Inferencia**, aparece el panel «Asistente Ada».

## La API de Ada para los cálculos (CodePredict y el péndulo)

La misma puerta de enlace (y la misma clave) sirve **cálculos verificados** a los dos proyectos. Son funciones fijas de Ada, no un chat: cada una recibe números y devuelve el resultado
con su doble verificación. Todas exigen `X-API-Key` (salvo `/ada/health`).

| Ruta | Quién la usa | Qué calcula | Límite por minuto |
|---|---|---|---|
| `GET /ada/health` | ambos (público, mínimo) | si el motor de Ada ya cargó | — |
| `GET /ada/pendulum/verify?theta0_deg&L&g` | panel del péndulo | período por integral elíptica y por EDO DOP853; ángulo crítico | 240 |
| `POST /v1/stats/dos_grupos` | CodePredict | comparación de dos grupos (Welch por defecto) | 120 (todas las `/v1/stats`) |
| `POST /v1/stats/chi_cuadrado` | CodePredict | χ² de independencia de una tabla | |
| `POST /v1/stats/dos_proporciones` | CodePredict | prueba z de dos proporciones | |
| `POST /v1/stats/bayes` | CodePredict | P(D\|C) con Bayes a partir de la tabla 2×2 | |
| `GET /v1/codepredict/perfil` | CodePredict | perfil del CSV que Ada tiene en su equipo | 60 (las cuatro `/v1/codepredict`) |
| `POST /v1/codepredict/limpieza` | CodePredict | vista previa de la limpieza con esas reglas (cada regla verificada pandas/DuckDB) | |
| `POST /v1/codepredict/inferencia` | CodePredict | limpieza + Welch, χ², dos proporciones y Bayes con esas reglas | |
| `POST /v1/codepredict/limpio` | CodePredict | el conjunto limpio verificado (CSV comprimido, con tamaño y SHA-256) para que el panel lo guarde en su equipo | 10 |

**El proceso completo de CodePredict (`/v1/codepredict/*`).** El panel manda solo las reglas de limpieza. Ada lee **su propia copia** del CSV (ruta fija en su equipo, `CODEPREDICT_DATASET` o `data/raw/Unified-file.csv`;
nunca una ruta elegida por quien llama) y no escribe nada en disco: lo guardado lo escribe el panel en su propio equipo. Las reglas se validan (valores permitidos, umbrales finitos), el perfil y los errores no revelan las
carpetas de este equipo, y si el CSV de Ada no es el mismo que el del panel (huella SHA-256 distinta) el panel no guarda nada. Si el servidor de Ada es de una versión anterior y no tiene estas rutas, el panel lo dice
(«versión anterior… actualiza y reinicia») y ofrece el motor Python local.

Límites: hasta 200 000 datos por grupo y 16 MB por petición; con más de 2 000 datos solo se permite Welch o Student sin sensibilidad (los otros métodos cuestan n₁·n₂ y dejarían el PC
ocupado); como máximo 2 cálculos a la vez. Una clave inválida se rechaza **antes** de leer el cuerpo de la petición.

- **CodePredict** lo usa solo si Ada no está en el equipo (o con `ADA_ENGINE=remote`): `ADA_REMOTE_URL` y `ADA_REMOTE_KEY` en el `.env`. Entonces Ada hace el proceso completo (perfil, limpieza, inferencia).
  Verificado con el dataset real por el túnel: el perfil, la vista previa, el CSV limpio (mismo SHA-256) y los 11 bloques de la inferencia son idénticos a hacerlo en local (43 744 → 32 509 filas).
  Si Ada no responde, el panel abre el aviso «Ada no está disponible» y ofrece el motor Python local (que la persona debe elegir; nunca se activa solo).
- **El panel del péndulo** lo usa con `ADA_API_URL` (`https://…`) y `ADA_API_KEY` en su `.env`. Es una segunda opinión: sin Ada, con clave mala o con el PC apagado, el panel calcula igual.
- La clave la guarda el **servidor** de cada panel; el navegador nunca la ve.

## El panel «Ada en vivo» (ver qué hace Ada, en este PC)

Un panel aparte, **solo para el PC que corre Ada**, que muestra con datos reales qué está haciendo en cada momento. Se abre con el acceso directo **Panel de ADA** del escritorio
(o `scripts\panel_ada.cmd`) y queda en `http://127.0.0.1:8790`.

- **El recorrido de una petición:** compañero → túnel → puerta de enlace → Ada → verificación por dos vías. Cada punto es una petición real y solo se mueve cuando una llega o termina; en reposo todo queda quieto.
- **Qué hace Ada ahora**, con cronómetro; **lo último que verificó**, dibujado como dos trazos (el primer método continuo, el segundo punteado) que se juntan en un visto bueno o, si no coinciden, se separan con una ✕.
- **Peticiones por minuto** y **cuánto tardó cada una**, **uso de la GPU, memoria de la GPU, temperatura, procesador y cupos**, y una **bitácora** con el detalle (por ejemplo, los pasos de una limpieza con sus filas antes y después).
- Tiene tema claro y oscuro y la opción «Ver gráficas como tabla».

**De dónde salen los datos.** La puerta de enlace anota cada petición en `ada_gateway/telemetria/eventos.jsonl` (ruta, estado, duración, un código corto del compañero y un resumen de lo que Ada calculó). El panel lee ese archivo y mide el PC
(`nvidia-smi`, la API de Ollama y los procesos). Nada se inventa: si algo no se puede leer, el panel lo dice.

**Privacidad.** No se guardan claves, direcciones de internet, datos de los archivos, nombres de archivos ni textos generados. A cada compañero se le asigna un código de 6 caracteres calculado con una sal que solo existe en este PC: sirve
para distinguir a una persona de otra, no para saber quién es. La carpeta `telemetria/` está en `.gitignore` y no se sube.

**Seguridad.** El panel solo escucha en `127.0.0.1`, no sale por el túnel, solo acepta `GET` y rechaza cualquier petición cuyo encabezado `Host` no sea este equipo (así una página web ajena no puede leerlo). No carga nada de internet.
`Apagar ADA` también lo apaga.

**Lo que no muestra.** Del modelo de lenguaje solo se mide lo que de verdad se puede medir: cuántos tokens leyó y escribió y cuánto tardó. Lo que pasa dentro de sus capas no se mide aquí, y por eso no se dibuja. Los pasos de una limpieza aparecen cuando la
petición termina (Ada los entrega juntos), no mientras ocurren.

## Seguridad (por qué es seguro exponerlo, y qué no hacer)

- Para el asistente de lenguaje, la puerta de enlace solo acepta `explicar` o `repaso` con un resultado en JSON; **no hay chat libre ni herramientas**. El resultado se trata como datos, dentro de `<resultado>…</resultado>`.
  Las rutas de cálculo de arriba solo llaman a funciones estadísticas y del péndulo de Ada con números validados; no leen ni escriben archivos.
- Exige clave (`X-API-Key`), limita el tamaño de la entrada, las peticiones por minuto (10 el asistente de lenguaje; ver la tabla para el cálculo), los tokens de la respuesta y atiende una petición a la vez.
- Los límites por minuto se cuentan por la dirección de origen que ve la puerta de enlace: no están pensados como cupo por persona (varios compañeros pueden compartirlo), solo como tope para que nadie sature el PC de la GPU.
- Comprueba que cada cifra del texto generado exista en el resultado recibido; las que no, se muestran como «no verificadas».
- Escucha solo en `127.0.0.1`. **Nunca** expongan el puerto de Ollama (11434) ni el agente completo de Ada: sus herramientas pueden leer y escribir archivos y ejecutar código.
- Para cortar el acceso: `stop_ada_server.ps1`, o cambiar la clave (borrar `ada_gateway/.env.gateway` y volver a arrancar).

## Límites

Solo funciona con el equipo prendido, con Ollama, la puerta de enlace y el túnel corriendo. La primera respuesta tarda más (carga del modelo). Una persona a la vez.
