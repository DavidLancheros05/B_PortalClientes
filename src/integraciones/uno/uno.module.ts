import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { UnoController } from './uno.controller';
import { UnoService } from './uno.service';

@Module({
  imports: [AuthModule],
  controllers: [UnoController],
  providers: [UnoService],
  exports: [UnoService],
})
export class UnoModule {}
