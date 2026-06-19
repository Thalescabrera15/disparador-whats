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
import { CreateFlowDto, UpdateFlowDto } from './dto/create-flow.dto';
import { FlowsService } from './flows.service';

@Controller('flows')
@UseGuards(JwtAuthGuard)
export class FlowsController {
  constructor(private readonly flows: FlowsService) {}

  @Post()
  create(@Body() dto: CreateFlowDto) {
    return this.flows.create(dto);
  }

  @Get()
  list() {
    return this.flows.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.flows.get(id);
  }

  /** Edita nome e/ou constantes de template da campanha ({valor} etc). */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFlowDto) {
    return this.flows.update(id, dto);
  }
}
