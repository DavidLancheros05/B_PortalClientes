/**
 * Nombres de tablas y columnas de catálogos
 * Centralizado para evitar hardcoding distribuido en el código
 */

export const TABLAS = {
  PAIS: 'Pais',
  DEPARTAMENTOS: 'Departamentoes',
  CIUDADES: 'Ciudads',
  TIPOS_DOCUMENTOS: 'Tipos_documentos',
} as const;

export const COLUMNAS = {
  PAIS: {
    id: 'pai_id',
    nombre: 'pai_nombre',
    estado: 'pai_estado',
  },
  DEPARTAMENTOS: {
    id: 'dpto_id',
    nombre: 'dpto_nombre',
    estado: 'dpto_estado',
    parentId: 'pai_id',
  },
  CIUDADES: {
    id: 'ciu_id',
    nombre: 'ciu_nombre',
    estado: 'ciu_estado',
    parentId: 'dpto_id',
  },
  TIPOS_DOCUMENTOS: {
    id: 'tdo_id',
    nombre: 'tdo_nombre',
    descripcion: 'tdo_descripcion',
    estado: 'tdo_estado',
    obligatorio: 'tdo_obligatorio',
    vigencia: 'tdo_vigencia_dias',
    permiteVencimiento: 'tdo_permite_vencimiento',
  },
} as const;

export const VALORES_ESTADO = {
  ACTIVO: 'A',
  VALORES_ACTIVOS: ['TRUE', 'ACTIVO', 'A', 'SI', 'S'],
} as const;
