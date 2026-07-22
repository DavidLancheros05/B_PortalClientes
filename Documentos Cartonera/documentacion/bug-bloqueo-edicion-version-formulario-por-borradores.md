# Bloqueo de edición de una versión de formulario por solicitudes en Borrador

> Corregido el 2026-07-18, a raíz de una pregunta sobre por qué la versión 10 del formulario (recién activada) aparecía como "no editable" en `/parametrizacion/formularios/[formularioId]/versiones` pese a tener una sola solicitud asociada, y esa solicitud seguía en estado Borrador.

## Contexto

La pantalla de "Gestión de versiones" (`F_PortalClientes/src/app/parametrizacion/formularios/[formularioId]/versiones/page.tsx`) deshabilita el botón "Editar" de una versión cuando ya tiene solicitudes asociadas, mostrando el tooltip:

> "Esta versión ya tiene solicitudes asociadas — editar sus preguntas cambiaría en silencio lo que muestran los PDF ya generados. Creá una nueva versión para hacer cambios."

Esta protección es correcta en su intención: si una solicitud ya fue enviada y tiene un PDF generado (o cualquier proceso de aprobación en curso) contra una versión concreta del formulario, editar las preguntas de esa versión rompería en silencio lo que esa solicitud muestra — un `fp_id` renombrado o eliminado deja respuestas guardadas huérfanas, y el PDF ya generado deja de coincidir con el formulario actual.

## El problema

El conteo de "solicitudes asociadas" que activa el bloqueo (`total_solicitudes`, en `FormulariosService.obtenerVersiones()`) contaba **cualquier** fila de `solicitudes` con `sol_formulario_version = <versión>`, sin importar su estado:

```sql
-- ANTES
(SELECT COUNT(*) FROM solicitudes WHERE sol_formulario_version = fv_numero) AS total_solicitudes
```

Un **Borrador** (`sol_estado_id = 1`) es solo un formulario que el cliente está diligenciando — no se ha enviado, no generó ningún PDF, nadie más que el propio cliente lo ha visto. No hay nada que romper ahí, así que no debería contar para el bloqueo. Pero como la query no distinguía por estado, alcanzaba con que un cliente dejara un borrador a medio llenar contra una versión para que esa versión quedara permanentemente bloqueada para edición, aunque ese borrador nunca llegara a enviarse.

Esto se detectó en vivo: tras activar la versión 10 del formulario, un cliente de prueba creó una solicitud nueva (`sol_id=2187`, número 16) que quedó correctamente asociada a esa versión — pero como seguía en Borrador, la versión 10 apareció como "no editable" sin que hubiera ningún motivo real para bloquearla.

## Fix aplicado — primera pasada (incompleta)

El primer fix solo tocó `FormulariosService.obtenerVersiones()` (líneas ~245-260), que alimenta la pantalla de "Gestión de versiones":

```sql
-- DESPUÉS
(SELECT COUNT(*) FROM solicitudes
 WHERE sol_formulario_version = fv_numero AND sol_estado_id <> 1) AS total_solicitudes
```

Con esto la pantalla de versiones ya mostraba "Editar" habilitado para la v10. Pero **el mismo criterio "¿tiene solicitudes asociadas?" estaba duplicado en otros tres lugares**, ninguno de los cuales se tocó en esta primera pasada — el usuario lo detectó al entrar directamente al editor (`/parametrizacion/formulario-editor?formulario_id=1&version=10`), que seguía mostrando el candado:

> "🔒 Esta versión (v10) ya tiene solicitudes asociadas, por lo que sus preguntas y opciones no se pueden editar ni eliminar."

Los otros tres sitios, todos con la misma consulta sin filtrar por estado:

1. `FormulariosService.getFormularioCompleto()` — arma el flag `tiene_solicitudes` que consume el editor para mostrar el candado.
2. `OpcionesService.assertVersionSinSolicitudes()` — el guardia real en el backend que rechaza `update`/`remove` de una opción.
3. `FormularioPreguntasService.assertVersionSinSolicitudes()` — el guardia real en el backend que rechaza `update`/`remove` de una pregunta.

Es decir: aunque la pantalla de versiones ya "dejaba" editar, el editor seguía bloqueado por su propio chequeo, y aunque el editor no hubiera bloqueado nada, el backend igual habría rechazado el guardado — la validación real vive en (2) y (3), el resto son solo avisos anticipados en la UI.

## Fix aplicado — consolidado

En vez de repetir el mismo parche (agregar `AND sol_estado_id <> 1`) en cada uno de los tres archivos, se extrajo la regla a un único lugar:

**Archivo nuevo:** `B_PortalClientes/src/parametrizacion/formularios/version-formulario.util.ts`

```ts
export async function contarSolicitudesQueBloqueanVersion(
  queryable: { query: (sql: string, params?: any[]) => Promise<any[]> },
  versionNumero: number,
): Promise<number> {
  const result = await queryable.query(
    `SELECT COUNT(*) AS total FROM solicitudes WHERE sol_formulario_version = @0 AND sol_estado_id <> 1`,
    [versionNumero],
  );
  return Number(result[0]?.total ?? 0);
}
```

Y se reemplazó la consulta inline por una llamada a esta función en los tres sitios:

- `FormulariosService.getFormularioCompleto()` — `contarSolicitudesQueBloqueanVersion(this.dataSource, versionNum)`.
- `OpcionesService.assertVersionSinSolicitudes()` — `contarSolicitudesQueBloqueanVersion(this.repo.manager, opcion[0].fp_version)`.
- `FormularioPreguntasService.assertVersionSinSolicitudes()` — `contarSolicitudesQueBloqueanVersion(this.formularioPreguntaRepository.manager, pregunta[0].fp_version)`.

`FormulariosService.obtenerVersiones()` es la única excepción: necesita el conteo por **cada** versión a la vez (una subquery correlacionada dentro de un solo `SELECT` sobre `Formulario_versiones`), así que llamar a la función en un loop habría cambiado 1 consulta por N+1. Se dejó como SQL inline, con un comentario que remite al util como fuente de verdad de la condición, para que si se ajusta la regla de negocio no quede desincronizada en silencio otra vez.

### Verificación

- `GET /parametrizacion/formularios/1/versiones`: `total_solicitudes: 0` para la v10 (antes: 1).
- `GET /parametrizacion/formularios/1/completo?version=10`: `formulario.tiene_solicitudes: false` (antes: `true`) — confirmado en vivo tras el fix, con esto el candado del editor ya no debería aparecer para la v10.
- Typecheck del backend limpio tras la consolidación.
- No se probó en vivo el guardado real de una pregunta/opción de la v10 (para no mutar datos reales sin necesidad) — pero `assertVersionSinSolicitudes` en ambos servicios llama exactamente al mismo helper ya verificado, así que hereda el mismo resultado.

## Alcance — qué NO se tocó

El botón **"Eliminar versión"** (`FormulariosService.eliminarVersion()`) usa una comprobación separada (`SELECT COUNT(*) FROM solicitudes WHERE sol_formulario_version = @0`) que sigue contando **cualquier** estado, incluido Borrador, y por lo tanto sigue bloqueando el borrado. Esto es deliberado: a diferencia de editar preguntas puntuales, eliminar una versión borra físicamente sus filas de `Formulario_pregunta` (y sus opciones) — eso sí dejaría sin ningún campo al cual pertenecer a las respuestas ya guardadas de un borrador, aunque ese borrador nunca se haya enviado. Si en el futuro se quiere relajar también esa regla por estado, habría que decidir explícitamente si un borrador puede perder sus respuestas al eliminarse la versión (o limpiarlas primero), no es un cambio simétrico al de edición.
