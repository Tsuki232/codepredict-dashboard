# Escenas 3D (opcional)

`classicMaterials.ts` pinta modelos `.glb` por el nombre de sus materiales (Wood, Brass, Steel, DarkSteel, Copper, Glass, Dial, Bob):
nogal con veta, latón pulido, acero cepillado, hierro oscuro, cobre y vidrio. Las texturas se dibujan con código, así que no
pesan en el modelo ni se descargan.

Para usarlo:

1. `cd frontend && npm i three && npm i -D @types/three`
2. Mueve `classicMaterials.ts` a `frontend/src/features/scene/`.
3. En tu escena, tras cargar el modelo: `applyClassicMaterials(gltf.scene, renderer.capabilities.getMaxAnisotropy())`.
4. Al cerrar la escena: `disposeSceneObject(scene)` (respeta los materiales compartidos).

Está fuera de `src/` a propósito: `tsc` no lo compila, así que el proyecto base no necesita `three`.
