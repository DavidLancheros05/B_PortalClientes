// backend/src/auth/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || 'mi_super_secreto',
    });
  }

  async validate(payload: any) {
    return {
      id: payload.usr_id,
      email: payload.email,
      rol: payload.rol,
      cliente_id: payload.cliente_id,
    };
  }
}
