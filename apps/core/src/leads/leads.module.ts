import { Module } from '@nestjs/common';
import { LeadImportService } from './lead-import.service';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  controllers: [LeadsController],
  providers: [LeadsService, LeadImportService],
  exports: [LeadsService, LeadImportService],
})
export class LeadsModule {}
