import { PartialType } from '@nestjs/mapped-types';
import { CreateFormularioPreguntaOpcionDto } from './create-formulario-pregunta-opcion.dto';

export class UpdateFormularioPreguntaOpcionDto extends PartialType(
  CreateFormularioPreguntaOpcionDto,
) {}
