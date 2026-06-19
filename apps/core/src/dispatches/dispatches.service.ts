import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DispatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CHIP_SELECT = {
  id: true,
  label: true,
  phone: true,
  status: true,
  rampDay: true,
  dailyCap: true,
  sentToday: true,
  healthScore: true,
} as const;

@Injectable()
export class DispatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    flowId: string,
    name: string,
    chipIds: string[] = [],
    allowLinkInOpening = false,
  ) {
    await this.assertFlow(flowId);
    await this.assertChips(chipIds);
    return this.prisma.dispatch.create({
      data: {
        flowId,
        name,
        allowLinkInOpening,
        chips: chipIds.length
          ? { connect: chipIds.map((id) => ({ id })) }
          : undefined,
      },
      include: { chips: { select: CHIP_SELECT } },
    });
  }

  async update(
    id: string,
    dto: { name?: string; allowLinkInOpening?: boolean },
  ) {
    await this.get(id);
    return this.prisma.dispatch.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.allowLinkInOpening !== undefined
          ? { allowLinkInOpening: dto.allowLinkInOpening }
          : {}),
      },
    });
  }

  list(flowId: string) {
    return this.prisma.dispatch.findMany({
      where: { flowId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { chips: true } },
      },
    });
  }

  async get(id: string) {
    const dispatch = await this.prisma.dispatch.findUnique({
      where: { id },
      include: { chips: { select: CHIP_SELECT }, flow: { select: { id: true, name: true } } },
    });
    if (!dispatch) throw new NotFoundException('disparo nao encontrado');
    return dispatch;
  }

  /** Define a esteira: substitui o conjunto de numeros selecionados. */
  async setChips(id: string, chipIds: string[]) {
    await this.get(id);
    await this.assertChips(chipIds);
    return this.prisma.dispatch.update({
      where: { id },
      data: { chips: { set: chipIds.map((cid) => ({ id: cid })) } },
      include: { chips: { select: CHIP_SELECT } },
    });
  }

  async addChips(id: string, chipIds: string[]) {
    await this.get(id);
    await this.assertChips(chipIds);
    return this.prisma.dispatch.update({
      where: { id },
      data: { chips: { connect: chipIds.map((cid) => ({ id: cid })) } },
      include: { chips: { select: CHIP_SELECT } },
    });
  }

  async removeChip(id: string, chipId: string) {
    await this.get(id);
    return this.prisma.dispatch.update({
      where: { id },
      data: { chips: { disconnect: { id: chipId } } },
      include: { chips: { select: CHIP_SELECT } },
    });
  }

  async setStatus(id: string, status: DispatchStatus) {
    const dispatch = await this.get(id);
    if (status === DispatchStatus.RUNNING) {
      if (dispatch.chips.length === 0) {
        throw new BadRequestException(
          'selecione ao menos um numero para o disparo antes de iniciar',
        );
      }
      const openings = await this.prisma.openingMessage.count({
        where: { flowId: dispatch.flowId, active: true },
      });
      if (openings === 0) {
        throw new BadRequestException(
          'o fluxo precisa de ao menos uma abertura ativa antes de iniciar',
        );
      }
    }
    // O scheduler (proxima fase) consome disparos RUNNING e reveza entre os chips.
    return this.prisma.dispatch.update({ where: { id }, data: { status } });
  }

  private async assertFlow(flowId: string): Promise<void> {
    const flow = await this.prisma.flow.findUnique({
      where: { id: flowId },
      select: { id: true },
    });
    if (!flow) throw new BadRequestException('fluxo nao encontrado');
  }

  private async assertChips(chipIds: string[]): Promise<void> {
    if (!chipIds.length) return;
    const unique = [...new Set(chipIds)];
    const found = await this.prisma.whatsappNumber.count({
      where: { id: { in: unique } },
    });
    if (found !== unique.length) {
      throw new BadRequestException('um ou mais numeros selecionados nao existem');
    }
  }
}
