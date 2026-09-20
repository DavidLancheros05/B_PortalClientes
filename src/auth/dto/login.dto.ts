import { IsString, IsIn, IsOptional } from 'class-validator';

export class LoginDto {
  @IsString()
  identifier: string;

  @IsString()
  password: string;

  @IsIn(['cliente', 'usuario'])
  accessType: 'cliente' | 'usuario';

  // Token del widget "No soy un robot" (Google reCAPTCHA v2). Opcional a
  // nivel de DTO porque la verificación real solo se activa cuando
  // RECAPTCHA_SECRET_KEY está configurada (ver AuthService.verificarCaptcha)
  // — mientras no exista esa key en .env, el login sigue funcionando igual
  // que antes de agregar el captcha.
  @IsOptional()
  @IsString()
  captchaToken?: string;
}
