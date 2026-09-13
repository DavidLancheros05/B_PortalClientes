-- "Clientes" (mod_id 92) tenía dos hijos en el menú que apuntaban a algo ya
-- alcanzable de otra forma:
--   - mod_id 93 "Listado de clientes" -> misma ruta que el propio padre
--     (/parametrizacion/clientes), pura redundancia.
--   - mod_id 116 "Acceso a Clientes" -> ya se llega ahí con el botón
--     "Gestionar Acceso" dentro de la propia página de Clientes.
-- Mientras "Clientes" tuviera hijos visibles en el menú, Header.tsx nunca
-- lo renderiza como link (solo como categoría que despliega, por diseño:
-- ver CLAUDE.md). Al desactivar estos dos hijos, "Clientes" vuelve a ser
-- una hoja del menú y por lo tanto un link directo a su propia página.

UPDATE dbo.pc_modulos
SET mod_estado = 0
WHERE mod_id IN (93, 116);
