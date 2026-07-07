import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmpliacionCupoEntity } from './entities';
import { AmpliacionCupoService } from './ampliacion-cupo.service';
import { AmpliacionCupoController } from './ampliacion-cupo.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AmpliacionCupoEntity])],
  controllers: [AmpliacionCupoController],
  providers: [AmpliacionCupoService],
  exports: [AmpliacionCupoService],
})
export class AmpliacionCupoModule {}
