import { PartialType } from '@nestjs/mapped-types';
import { CreateFormularioPreguntaDto } from './create-formulario-pregunta.dto';

export class UpdateFormularioPreguntaDto extends PartialType(
  CreateFormularioPreguntaDto,
) {}
