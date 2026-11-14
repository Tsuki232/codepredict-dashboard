# Guía de diseño

## Dirección: hoja de laboratorio

Papel milimetrado, tinta azul, lápiz rojo y grafito. Es una herramienta de trabajo (el usuario compara y mide), así que
prima que se lea rápido y sea consistente; la personalidad está en los detalles: los datos con puntos guía, la
cuadrícula fina de las gráficas y la frase de resultado en lugar de un número gigante con etiqueta.

## Reglas

1. **Colores por nombre, nunca por valor.** `var(--serie-1)`, no `#1d4ed8`. Así el tema oscuro funciona solo.
2. **Un color = una serie, en toda la interfaz.** Si la serie A es azul en la gráfica, es azul en la tabla y en la etiqueta.
3. **Sin tarjetas decorativas.** Un panel agrupa con un título; nunca se anida un panel dentro de otro.
4. **El resultado va en una frase** (`.lead`) con la cifra animada dentro, no en un número aislado.
5. **Etiquetas en minúscula normal.** Nada de rótulos en mayúsculas sobre cada título: el título ya dice de qué trata.
6. **Ejes con nombre y unidad, y leyenda visible** en cada gráfica. Cada gráfica lleva una frase que dice qué concluir.
7. **El movimiento responde a una acción.** Cambiar de vista, pulsar, mover un valor. Nada se anima solo sin motivo.
   Con «reducir movimiento» activado en el sistema, todo salta directo.
8. **Accesible por teclado:** pestañas con flechas, interruptores con `role="switch"`, foco visible, botones con `aria-label`.

## Colores

| Token | Significa |
|---|---|
| `--bg` / `--paper` | Fondo de la página / paneles y áreas de trazado |
| `--ink`, `--ink-2`, `--muted` | Texto principal, secundario y rótulos |
| `--serie-1` | Serie principal (azul) |
| `--serie-2` | Serie de comparación (rojo) |
| `--serie-3` | Referencia o valor exacto (grafito) |
| `--ok`, `--warn`, `--bad` | Bien, atención, problema (el «mal» es ciruela para no confundirlo con la serie roja) |
| `--grid`, `--grid-strong`, `--rule` | Cuadrícula y líneas finas |

El texto en oscuro es blanco roto, no `#fff`. Todo par texto y fondo cumple contraste 4.5:1 en ambos temas, y
`frontend/src/design/tokens.test.ts` lo comprueba: si añades un color, añade su par a esa prueba.

## Tipografía

Archivo (variable, incluida en el proyecto: funciona sin internet). Escala fija: `.h1` 2 rem, `.lead` 1.75 rem, `.h2` 1.25 rem,
texto 15 px, `.small` 13 px. Los números usan cifras tabulares para que no «bailen» al cambiar.

## Movimiento (librería Motion)

| Interacción | Componente | Detalle |
|---|---|---|
| Cambiar de vista | `ui/BlurViewTransition` | La saliente se desenfoca y se desvanece; la entrante entra desde escala 0.98 con desenfoque que se aclara (300 ms) |
| Menú y pestañas | `layout/Shell`, `ui/SegmentedTabs` | Píldora activa que se desliza (`layoutId` único por grupo); flechas, Inicio y Fin del teclado |
| Cifras | `ui/AnimatedNumber` | Cuentan desde 0 al montar y desde el valor anterior al cambiar |
| Interruptores | `ui/Switch` | Perilla con resorte |

Curvas y duraciones únicas en `tokens.css`: `--ease`, `--ease-out`, `--t-fast` (120 ms), `--t` (200 ms), `--t-slow` (350 ms).

## Figuras del servidor

`backend/app/figures/style.py` usa los mismos colores en claro y oscuro. Convenciones: título que dice la conclusión,
subtítulo con el dato clave, etiquetas directas en vez de leyenda, pie con los parámetros.

## Lo que se descartó (y por qué)

Tarjetas idénticas en rejilla, degradados como decoración, íconos de destellos para «IA», mayúsculas sostenidas en cada
etiqueta y números gigantes con etiqueta: son los rasgos que hacen que una interfaz se vea genérica.
