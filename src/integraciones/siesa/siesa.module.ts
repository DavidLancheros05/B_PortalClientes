import { Module } from '@nestjs/common';
import { SiesaDbService } from './siesa-db.service';

@Module({
  providers: [SiesaDbService],
  exports: [SiesaDbService],
})
export class SiesaModule {}
