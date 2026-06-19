import { Module } from '@nestjs/common';
import { ChipsController } from './chips.controller';
import { ChipsService } from './chips.service';

@Module({
  controllers: [ChipsController],
  providers: [ChipsService],
  exports: [ChipsService],
})
export class ChipsModule {}
