import { IsString, MinLength } from 'class-validator';

// Sin decoradores, el ValidationPipe global (whitelist +
// forbidNonWhitelisted) rechazaba los dos campos y el cambio de contraseña
// de usuarios internos siempre respondía 400. Mismas reglas que
// CambiarPasswordClienteDto.
export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}
