import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LeadStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LeadImportService } from './lead-import.service';
import { LeadsService } from './leads.service';

function toInt(v?: string): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

@Controller('flows/:flowId/leads')
@UseGuards(JwtAuthGuard)
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly importer: LeadImportService,
  ) {}

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = /\.(csv|xlsx|xls)$/i.test(file.originalname);
        cb(
          ok ? null : new BadRequestException('envie um arquivo .csv ou .xlsx'),
          ok,
        );
      },
    }),
  )
  import(
    @Param('flowId') flowId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('source') source?: string,
  ) {
    if (!file) throw new BadRequestException('envie o arquivo no campo "file"');
    return this.importer.import(
      flowId,
      { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype },
      source,
    );
  }

  @Get()
  list(
    @Param('flowId') flowId: string,
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const validStatus =
      status && status in LeadStatus ? (status as LeadStatus) : undefined;
    return this.leads.list(flowId, {
      status: validStatus,
      skip: toInt(skip),
      take: toInt(take),
    });
  }

  @Get('stats')
  stats(@Param('flowId') flowId: string) {
    return this.leads.stats(flowId);
  }
}
