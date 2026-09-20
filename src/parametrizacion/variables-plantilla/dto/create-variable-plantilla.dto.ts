import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

// Whitelist de tablas "ancla" — únicas para las que el sistema sabe armar
// el JOIN sin ambigüedad al simular con (cliente_id, solicitud_id). Ver
// VariablesPlantillaService.resolverParaSolicitud().
export const TABLAS_ORIGEN_PERMITIDAS = ['solicitudes', 'clientes'] as const;

export class CreateVariablePlantillaDto {
  @IsString()
  @Matches(/^\{\{[a-z][a-z0-9_]*\}\}$/, {
    message:
      'pvp_placeholder debe tener el formato {{nombre_variable}} (minúsculas, números y guion bajo)',
  })
  pvp_placeholder: string;

  @IsString()
  @IsNotEmpty()
  pvp_etiqueta: string;

  @IsIn(['FIJA', 'CARTA_APROBACION'])
  pvp_ambito: 'FIJA' | 'CARTA_APROBACION';

  @IsOptional()
  @IsBoolean()
  pvp_resuelta?: boolean;

  @IsOptional()
  @IsIn(TABLAS_ORIGEN_PERMITIDAS)
  pvp_tabla_origen?: 'solicitudes' | 'clientes';

  // Requerido si se manda pvp_tabla_origen (y viceversa) — se valida en el
  // service, no acá, porque ValidateIf no cubre bien la relación "ambos o
  // ninguno" de forma legible.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  pvp_columna_origen?: string;

  @IsOptional()
  @IsIn(['TEXTO', 'MONEDA', 'DIAS', 'FECHA'])
  pvp_formato?: 'TEXTO' | 'MONEDA' | 'DIAS' | 'FECHA';
}
