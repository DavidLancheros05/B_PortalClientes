import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TABLAS_ORIGEN_PERMITIDAS } from './create-variable-plantilla.dto';

// El placeholder no se edita una vez creado — si cambió el texto, se borra
// (pasa por el guardrail de "¿está en uso?") y se crea uno nuevo. Evita que
// una plantilla ya guardada con el placeholder viejo quede huérfana en
// silencio.
export class UpdateVariablePlantillaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  pvp_etiqueta?: string;

  @IsOptional()
  @IsIn(['FIJA', 'CARTA_APROBACION'])
  pvp_ambito?: 'FIJA' | 'CARTA_APROBACION';

  @IsOptional()
  @IsBoolean()
  pvp_resuelta?: boolean;

  @IsOptional()
  @IsBoolean()
  pvp_estado?: boolean;

  // Mandar pvp_tabla_origen: null (o pvp_columna_origen: null) explícito
  // desvincula el mapeo automático y la variable vuelve a depender de
  // código a mano.
  @IsOptional()
  @IsIn([...TABLAS_ORIGEN_PERMITIDAS, null])
  pvp_tabla_origen?: 'solicitudes' | 'clientes' | null;

  @IsOptional()
  pvp_columna_origen?: string | null;

  @IsOptional()
  @IsIn(['TEXTO', 'MONEDA', 'DIAS', 'FECHA'])
  pvp_formato?: 'TEXTO' | 'MONEDA' | 'DIAS' | 'FECHA';
}
