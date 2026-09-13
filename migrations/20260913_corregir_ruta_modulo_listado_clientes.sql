-- El módulo "Listado de clientes" (mod_id 93, hijo de "Clientes" mod_id 92)
-- apuntaba a /parametrizacion/clientes/listado-de-clientes, una ruta que
-- nunca existió como página (el listado real vive en /parametrizacion/clientes,
-- la misma ruta del módulo padre). Además nunca tuvo rm_ver=1 para ningún
-- rol, por eso nunca apareció en el menú. Se corrige la ruta y se habilita
-- para ADMIN (mismo alcance que el módulo padre "Clientes" y el hermano
-- "Acceso a Clientes").

UPDATE dbo.pc_modulos
SET mod_ruta = '/parametrizacion/clientes'
WHERE mod_id = 93
  AND mod_ruta = '/parametrizacion/clientes/listado-de-clientes';

UPDATE dbo.pc_rol_modulo
SET rm_ver = 1
WHERE rm_mod_id = 93
  AND rm_rol_id = 1; -- ADMIN
