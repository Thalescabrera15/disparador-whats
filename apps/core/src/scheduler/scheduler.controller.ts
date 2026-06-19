import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SchedulerService } from './scheduler.service';

@Controller('scheduler')
@UseGuards(JwtAuthGuard)
export class SchedulerController {
  constructor(private readonly scheduler: SchedulerService) {}

  /** Roda um ciclo do motor manualmente (debug/teste deterministico). */
  @Post('tick')
  @HttpCode(200)
  tick() {
    return this.scheduler.tick();
  }
}
