import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  buildLeadContext,
  extractVariables,
  missingVariables,
  renderTemplate,
} from '../common/template';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOpeningMessageDto,
  PreviewTemplateDto,
  UpdateOpeningMessageDto,
} from './dto/opening-message.dto';

@Injectable()
export class OpeningMessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(flowId: string, dto: CreateOpeningMessageDto) {
    await this.assertFlow(flowId);
    this.assertNoLink(dto.template);
    const msg = await this.prisma.openingMessage.create({
      data: {
        flowId,
        template: dto.template,
        weight: dto.weight ?? 1,
        active: dto.active ?? true,
      },
    });
    return { ...msg, variables: extractVariables(msg.template) };
  }

  async list(flowId: string) {
    const msgs = await this.prisma.openingMessage.findMany({
      where: { flowId },
      orderBy: { weight: 'desc' },
    });
    return msgs.map((m) => ({ ...m, variables: extractVariables(m.template) }));
  }

  /** Renderiza um template contra um lead real (ou exemplo) p/ conferir variaveis. */
  async preview(flowId: string, dto: PreviewTemplateDto) {
    const flow = await this.prisma.flow.findUnique({
      where: { id: flowId },
      select: { id: true, variables: true },
    });
    if (!flow) throw new BadRequestException('fluxo nao encontrado');

    let lead = dto.leadId
      ? await this.prisma.lead.findUnique({ where: { id: dto.leadId } })
      : await this.prisma.lead.findFirst({
          where: { flowId },
          orderBy: { createdAt: 'asc' },
        });

    if (dto.leadId && (!lead || lead.flowId !== flowId)) {
      throw new NotFoundException('lead nao encontrado neste fluxo');
    }

    const usingSample = !lead;
    if (!lead) {
      // sem leads ainda: usa um exemplo so p/ visualizar
      lead = {
        name: 'Maria Silva',
        phone: '+5511999999999',
        meta: {},
      } as never;
    }

    const ctx = buildLeadContext(lead!, flow.variables, dto.sample);
    return {
      rendered: renderTemplate(dto.template, ctx),
      variables: extractVariables(dto.template),
      missing: missingVariables(dto.template, ctx),
      usingSample,
      leadName: lead!.name ?? null,
    };
  }

  async update(flowId: string, id: string, dto: UpdateOpeningMessageDto) {
    await this.assertOwned(flowId, id);
    if (dto.template !== undefined) this.assertNoLink(dto.template);
    return this.prisma.openingMessage.update({
      where: { id },
      data: {
        ...(dto.template !== undefined ? { template: dto.template } : {}),
        ...(dto.weight !== undefined ? { weight: dto.weight } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async remove(flowId: string, id: string) {
    await this.assertOwned(flowId, id);
    await this.prisma.openingMessage.delete({ where: { id } });
    return { deleted: true };
  }

  /** Anti-ban: abertura NUNCA leva link (link so depois da resposta). */
  private assertNoLink(template: string): void {
    if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|br|io|co)\b/i.test(template)) {
      throw new BadRequestException(
        'a abertura nao pode conter link/URL (link so depois da resposta do lead)',
      );
    }
  }

  private async assertFlow(flowId: string): Promise<void> {
    const flow = await this.prisma.flow.findUnique({
      where: { id: flowId },
      select: { id: true },
    });
    if (!flow) throw new BadRequestException('fluxo nao encontrado');
  }

  private async assertOwned(flowId: string, id: string): Promise<void> {
    const msg = await this.prisma.openingMessage.findUnique({
      where: { id },
      select: { flowId: true },
    });
    if (!msg || msg.flowId !== flowId) {
      throw new NotFoundException('abertura nao encontrada neste fluxo');
    }
  }
}
