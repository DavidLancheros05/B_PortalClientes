/**
 * Regla ÚNICA de "documento diferido aplicable a una solicitud", para usar en
 * todas las consultas que la necesitan (envío de la solicitud, panel de firma
 * / Mis Documentos, inactivación de archivos diferidos al reiniciar edición).
 *
 * Documento diferido = Tipos_documentos.tdo_es_diferido = 1: el cliente lo
 * entrega DESPUÉS de enviar el formulario; mientras falte, la solicitud queda
 * en PEND_FIRMA. Lo marca el administrador en Parametrización > Documentos.
 * Antes se deducía con reglas quemadas (incluido tdo_nombre LIKE '%Firmad%');
 * ver documentacion/Portal Clientes/Formularios/firma de documentos/
 * plan-documentos-diferidos-sin-reglas-quemadas.md.
 *
 * Espera el alias `td` para Tipos_documentos. `esDistribuidor` es una
 * expresión SQL que vale 1 si el cliente de la solicitud es distribuidor
 * (un parámetro como '@1', o una columna como 'c.cli_es_distribuidor').
 */
export const condicionDocumentoDiferido = (esDistribuidor: string) =>
  `td.tdo_es_diferido = 1
   AND (ISNULL(td.tdo_solo_distribuidor, 0) = 0 OR ISNULL(${esDistribuidor}, 0) = 1)`;
