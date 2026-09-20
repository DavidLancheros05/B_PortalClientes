import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VariablePlantilla } from './variables-plantilla.entity';
import { VariablesPlantillaService } from './variables-plantilla.service';
import { VariablesPlantillaController } from './variables-plantilla.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VariablePlantilla])],
  controllers: [VariablesPlantillaController],
  providers: [VariablesPlantillaService],
  exports: [VariablesPlantillaService],
})
export class VariablesPlantillaModule {}
