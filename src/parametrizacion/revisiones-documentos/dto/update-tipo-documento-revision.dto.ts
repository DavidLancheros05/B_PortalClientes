import { PartialType } from '@nestjs/mapped-types';
import { CreateTipoDocumentoRevisionDto } from './create-tipo-documento-revision.dto';

export class UpdateTipoDocumentoRevisionDto extends PartialType(
  CreateTipoDocumentoRevisionDto,
) {}
