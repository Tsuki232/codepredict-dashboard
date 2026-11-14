# Cómo añadir una vista

1. **Registrarla** en `frontend/src/app.config.ts`: añade su id a `ViewId` y un elemento a `NAV`
   (`label` para la barra lateral, `short` para la barra inferior del móvil, `title` para la barra superior).
2. **Crear el archivo** `frontend/src/views/MiVista.tsx` y registrarlo en `VIEWS` de `frontend/src/App.tsx`
   (con `lazy(...)` si es pesada).
3. **Leer el estado** con `useStore((s) => s.campo)` (`frontend/src/state/store.ts`). Los datos vienen del servidor
   (`frontend/src/lib/api.ts`); si necesitas un endpoint nuevo, añádelo en `backend/app/adapters/api/routes.py`.

Estructura recomendada de una vista (la misma de las tres que hay):

```tsx
<div className="flex flex-col gap-6">
  <h2 className="lead max-w-[40ch]">La conclusión en una frase, con la cifra dentro.</h2>
  <Panel title="Qué muestra" note="Una frase que dice qué concluir.">…</Panel>
</div>
```

Convenciones: colores por nombre (`var(--serie-1)`…), un color por serie en toda la interfaz, estados con texto además de color
(ver `ui/Verified.tsx`), tablas con `.data-table`, y en rejillas `grid-cols-1` antes de `lg:grid-cols-…` para que el contenido
ancho no desborde en el móvil. La guía completa está en `docs/DISENO.md`.
