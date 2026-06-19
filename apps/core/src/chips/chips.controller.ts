import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChipsService } from './chips.service';
import {
  BindProxyDto,
  CreateChipDto,
  PairChipDto,
  RenameChipDto,
} from './dto/create-chip.dto';

@Controller('chips')
@UseGuards(JwtAuthGuard)
export class ChipsController {
  constructor(private readonly chips: ChipsService) {}

  @Post()
  create(@Body() dto: CreateChipDto) {
    return this.chips.create(dto);
  }

  @Get()
  list() {
    return this.chips.list();
  }

  /** Insights por numero (status, rampa, capacidade, saude, taxa de resposta). */
  @Get('insights')
  insights() {
    return this.chips.insights();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.chips.get(id);
  }

  /** Renomeia o numero (o nome pelo qual voce seleciona no disparo). */
  @Patch(':id/rename')
  rename(@Param('id') id: string, @Body() dto: RenameChipDto) {
    return this.chips.rename(id, dto.label);
  }

  @Post(':id/bind-proxy')
  bindProxy(@Param('id') id: string, @Body() dto: BindProxyDto) {
    return this.chips.bindProxy(id, dto);
  }

  /** Dispara o pareamento. Acompanhe o QR/code em GET :id/pair. */
  @Post(':id/pair')
  pair(@Param('id') id: string, @Body() dto: PairChipDto) {
    return this.chips.pair(id, dto.usePairingCode);
  }

  @Get(':id/pair')
  pairState(@Param('id') id: string) {
    return this.chips.pairState(id);
  }

  @Post(':id/start')
  start(@Param('id') id: string) {
    return this.chips.sendControl(id, 'START');
  }

  @Post(':id/pause')
  pause(@Param('id') id: string) {
    return this.chips.sendControl(id, 'STOP');
  }

  @Post(':id/retire')
  retire(@Param('id') id: string) {
    return this.chips.sendControl(id, 'RETIRE');
  }

  @Get(':id/health')
  health(@Param('id') id: string) {
    return this.chips.health(id);
  }
}
