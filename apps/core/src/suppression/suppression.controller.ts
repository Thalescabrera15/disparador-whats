import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { normalizeE164 } from '../common/phone';
import { SuppressionService } from './suppression.service';

class SuppressDto {
  @IsString()
  phone!: string;
}

@Controller('suppressions')
@UseGuards(JwtAuthGuard)
export class SuppressionController {
  constructor(private readonly suppression: SuppressionService) {}

  /** Supressão manual (opt-out forçado pelo admin). */
  @Post()
  suppress(@Body() dto: SuppressDto) {
    return this.suppression.suppress(normalizeE164(dto.phone), 'manual');
  }

  /** Reverte supressão (corrigir opt-out equivocado). */
  @Delete(':phone')
  unsuppress(@Param('phone') phone: string) {
    return this.suppression.unsuppress(normalizeE164(phone));
  }
}
