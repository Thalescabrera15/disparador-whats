import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationService } from './conversation.service';
import { PreviewConversationDto } from './dto/preview.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class ConversationController {
  constructor(
    private readonly conversation: ConversationService,
    private readonly prisma: PrismaService,
  ) {}

  /** Dry-run: vê o que a IA responderia, SEM enviar/gravar. */
  @Post('flows/:flowId/conversation/preview')
  preview(
    @Param('flowId') flowId: string,
    @Body() dto: PreviewConversationDto,
  ) {
    return this.conversation.preview(flowId, dto);
  }

  /** Ver uma conversa (mensagens + estado). */
  @Get('conversations/:id')
  async get(@Param('id') id: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        lead: { select: { phone: true, name: true, status: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!conv) throw new NotFoundException('conversa nao encontrada');
    return conv;
  }
}
