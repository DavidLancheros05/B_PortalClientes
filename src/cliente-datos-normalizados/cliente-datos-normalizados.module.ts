// src/cliente-datos-normalizados/cliente-datos-normalizados.module.ts
import { Module } from '@nestjs/common';
import { ClienteDatosNormalizadosService } from './cliente-datos-normalizados.service';
import { MaestrosModule } from '../maestros/maestros.module';

// MaestrosModule: provee MaestrosService, reutilizado para resolver texto
// de celda CATALOGO → id (misma lógica de "columna activa" que ya usa el
// dropdown de la pregunta en el formulario — ver
// MaestrosService.detectarColumnaEstado).
@Module({
  imports: [MaestrosModule],
  providers: [ClienteDatosNormalizadosService],
  exports: [ClienteDatosNormalizadosService],
})
export class ClienteDatosNormalizadosModule {}
