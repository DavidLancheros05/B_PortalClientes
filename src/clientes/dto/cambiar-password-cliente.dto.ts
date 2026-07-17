import { IsString, MinLength } from 'class-validator';

export class CambiarPasswordClienteDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}
