// src/cliente-datos-normalizados/cliente-datos-normalizados.module.ts
import { Module } from '@nestjs/common';
import { ClienteDatosNormalizadosService } from './cliente-datos-normalizados.service';

@Module({
  providers: [ClienteDatosNormalizadosService],
  exports: [ClienteDatosNormalizadosService],
})
export class ClienteDatosNormalizadosModule {}
