import { IsString, IsIn } from 'class-validator';

export class LoginDto {
  @IsString()
  identifier: string;

  @IsString()
  password: string;

  @IsIn(['cliente', 'usuario'])
  accessType: 'cliente' | 'usuario';
}
