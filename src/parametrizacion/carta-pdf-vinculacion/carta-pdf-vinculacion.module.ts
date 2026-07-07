import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartaPdfVinculacion } from './carta-pdf-vinculacion.entity';
import { CartaPdfVinculacionService } from './carta-pdf-vinculacion.service';
import { CartaPdfVinculacionController } from './carta-pdf-vinculacion.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CartaPdfVinculacion])],
  controllers: [CartaPdfVinculacionController],
  providers: [CartaPdfVinculacionService],
})
export class CartaPdfVinculacionModule {}
