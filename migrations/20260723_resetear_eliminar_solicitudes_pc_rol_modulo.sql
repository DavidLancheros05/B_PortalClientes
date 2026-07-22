-- Antes de conectar deleteSolicitud (borrado real de una solicitud, con
-- cascada a documentos/historial) a pc_rol_modulo vía ModulePermissionGuard,
-- resetea el flag rm_eliminar del módulo "Solicitudes" (mod_id 50 y su
-- duplicado 83, ver documentacion/flujo-ampliacion-de-cupo.md) para todos
-- los roles salvo ADMIN.
--
-- Ese flag ya tenía valor "true" para ASC/CC2/EJECUTIVO/OC en la BD, pero
-- nunca fue pensado para esta acción (la función de borrado es nueva, de
-- esta sesión) — nada en el código lo consultaba hasta ahora (confirmado:
-- no hay ninguna referencia a "permisos.eliminar" en el frontend). Sin este
-- reset, conectar el guard les daría de golpe, sin que nadie lo decidiera,
-- la capacidad de borrar cualquier solicitud con su historial completo.
-- Quien lo necesite se le otorga explícitamente desde /seguridad/roles.

UPDATE rm
SET rm.rm_eliminar = 0, rm.updated_at = SYSDATETIME()
FROM pc_rol_modulo rm
INNER JOIN pc_modulos m ON m.mod_id = rm.rm_mod_id
INNER JOIN pc_roles r ON r.rol_id = rm.rm_rol_id
WHERE m.mod_ruta = '/solicitudes'
  AND r.rol_codigo <> 'ADMIN'
  AND rm.rm_eliminar = 1;
