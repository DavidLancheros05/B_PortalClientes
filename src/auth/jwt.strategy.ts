// backend/src/auth/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET as string,
    });
  }

  async validate(payload: any) {
    return {
      id: payload.usr_id,
      // req.user.usr_id (no solo `id`) — PermissionsService.resolverRolIds y
      // varios controllers (solicitudes, pqrs, ampliacion-cupo) lo leen así
      // para resolver TODOS los roles activos del usuario vía
      // pc_usuario_rol. Sin este campo, resolverRolIds caía siempre al
      // fallback de un solo rol tomado del JWT (payload.rol), que además
      // AuthService.login puede fijar de forma no determinística cuando el
      // usuario tiene más de un rol activo (ver login: `usuarioData[0]` sin
      // ORDER BY). Se detectó porque un usuario con roles ADMIN+EJECUTIVO
      // recibía 403 en un endpoint que sí tenía permiso concedido a ADMIN.
      usr_id: payload.usr_id,
      email: payload.email,
      rol: payload.rol,
      cliente_id: payload.cliente_id,
      // Ya venía en el token (auth.service.ts::login) pero no se propagaba:
      // pedidos.controller.ts lo usa para que un ejecutivo solo consulte su
      // propia cartera (/pedidos/ejecutivo/:ejngId).
      ejng_id: payload.ejng_id,
      // Antes no se propagaba: auth.controller.ts::logout() lee
      // req.user.tipo para decidir qué tabla invalidar (Clientes vs
      // usuarios) y siempre caía al fallback 'usuario' — un cliente que
      // cerraba sesión terminaba incrementando usr_token_version de la fila
      // de `usuarios` que coincidiera por id con su cli_id, en vez de
      // cli_token_version en Clientes.
      tipo: payload.tipo,
    };
  }
}
