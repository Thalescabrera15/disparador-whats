import { Module } from '@nestjs/common';
import { FlowsController } from './flows.controller';
import { FlowsService } from './flows.service';
import { OpeningMessagesController } from './opening-messages.controller';
import { OpeningMessagesService } from './opening-messages.service';

@Module({
  controllers: [FlowsController, OpeningMessagesController],
  providers: [FlowsService, OpeningMessagesService],
  exports: [FlowsService, OpeningMessagesService],
})
export class FlowsModule {}
