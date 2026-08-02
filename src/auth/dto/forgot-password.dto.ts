import { IsIn, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  identifier: string;

  @IsIn(['cliente', 'usuario'])
  accessType: 'cliente' | 'usuario';
}
