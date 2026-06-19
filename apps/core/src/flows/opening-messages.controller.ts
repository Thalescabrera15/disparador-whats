import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateOpeningMessageDto,
  PreviewTemplateDto,
  UpdateOpeningMessageDto,
} from './dto/opening-message.dto';
import { OpeningMessagesService } from './opening-messages.service';

@Controller('flows/:flowId/opening-messages')
@UseGuards(JwtAuthGuard)
export class OpeningMessagesController {
  constructor(private readonly svc: OpeningMessagesService) {}

  @Post()
  create(@Param('flowId') flowId: string, @Body() dto: CreateOpeningMessageDto) {
    return this.svc.create(flowId, dto);
  }

  @Get()
  list(@Param('flowId') flowId: string) {
    return this.svc.list(flowId);
  }

  /** Pre-visualiza um template renderizado (variaveis substituidas). */
  @Post('preview')
  preview(@Param('flowId') flowId: string, @Body() dto: PreviewTemplateDto) {
    return this.svc.preview(flowId, dto);
  }

  @Patch(':id')
  update(
    @Param('flowId') flowId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOpeningMessageDto,
  ) {
    return this.svc.update(flowId, id, dto);
  }

  @Delete(':id')
  remove(@Param('flowId') flowId: string, @Param('id') id: string) {
    return this.svc.remove(flowId, id);
  }
}
