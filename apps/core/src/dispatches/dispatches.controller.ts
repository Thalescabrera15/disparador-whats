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
import { DispatchStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DispatchesService } from './dispatches.service';
import {
  CreateDispatchDto,
  SetDispatchChipsDto,
  SetDispatchStatusDto,
  UpdateDispatchDto,
} from './dto/dispatch.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class DispatchesController {
  constructor(private readonly dispatches: DispatchesService) {}

  @Post('flows/:flowId/dispatches')
  create(@Param('flowId') flowId: string, @Body() dto: CreateDispatchDto) {
    return this.dispatches.create(
      flowId,
      dto.name,
      dto.chipIds ?? [],
      dto.allowLinkInOpening ?? false,
    );
  }

  @Get('flows/:flowId/dispatches')
  list(@Param('flowId') flowId: string) {
    return this.dispatches.list(flowId);
  }

  @Get('dispatches/:id')
  get(@Param('id') id: string) {
    return this.dispatches.get(id);
  }

  /** Edita nome e/ou politica de link na abertura. */
  @Patch('dispatches/:id')
  update(@Param('id') id: string, @Body() dto: UpdateDispatchDto) {
    return this.dispatches.update(id, dto);
  }

  /** Substitui a esteira (conjunto de numeros selecionados pelo nome). */
  @Patch('dispatches/:id/chips')
  setChips(@Param('id') id: string, @Body() dto: SetDispatchChipsDto) {
    return this.dispatches.setChips(id, dto.chipIds);
  }

  @Post('dispatches/:id/chips')
  addChips(@Param('id') id: string, @Body() dto: SetDispatchChipsDto) {
    return this.dispatches.addChips(id, dto.chipIds);
  }

  @Delete('dispatches/:id/chips/:chipId')
  removeChip(@Param('id') id: string, @Param('chipId') chipId: string) {
    return this.dispatches.removeChip(id, chipId);
  }

  @Patch('dispatches/:id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetDispatchStatusDto) {
    return this.dispatches.setStatus(id, dto.status as DispatchStatus);
  }
}
