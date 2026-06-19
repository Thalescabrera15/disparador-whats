import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SuppressionModule } from '../suppression/suppression.module';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { InboundConsumer } from './inbound.consumer';

@Module({
  imports: [AiModule, SuppressionModule],
  controllers: [ConversationController],
  providers: [ConversationService, InboundConsumer],
  exports: [ConversationService],
})
export class ConversationModule {}
