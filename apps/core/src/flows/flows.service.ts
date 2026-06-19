import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { slugify } from '../common/slug';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFlowDto, UpdateFlowDto } from './dto/create-flow.dto';

@Injectable()
export class FlowsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateFlowDto) {
    const baseSlug = dto.slug ? slugify(dto.slug) : slugify(dto.name);

    const data: Prisma.FlowCreateInput = {
      name: dto.name,
      slug: baseSlug,
      aiModel: dto.aiModel ?? 'qwen3-uncensored',
      systemPrompt: dto.systemPrompt ?? '',
      knowledgeBase: dto.knowledgeBase ?? '',
      fewShotExamples: [],
      guardRules: {},
      linkReleaseRule: {},
      bridgeDomain: dto.bridgeDomain ?? '',
      checkoutBaseUrl: dto.checkoutBaseUrl ?? '',
      sendConfig: (dto.sendConfig ?? undefined) as Prisma.InputJsonValue,
      variables: (dto.variables ?? undefined) as Prisma.InputJsonValue,
    };

    // slug e unico: em colisao, anexa sufixo e tenta de novo.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.flow.create({
          data: attempt === 0 ? data : { ...data, slug: `${baseSlug}-${attempt + 1}` },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          continue;
        }
        throw e;
      }
    }
    throw new Error('nao foi possivel gerar um slug unico para o fluxo');
  }

  list() {
    return this.prisma.flow.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { leads: true, openingMessages: true } },
      },
    });
  }

  async update(id: string, dto: UpdateFlowDto) {
    await this.get(id);
    return this.prisma.flow.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.variables !== undefined
          ? { variables: dto.variables as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async get(id: string) {
    const flow = await this.prisma.flow.findUnique({
      where: { id },
      include: {
        openingMessages: true,
        _count: { select: { leads: true, conversations: true } },
      },
    });
    if (!flow) throw new NotFoundException('fluxo nao encontrado');
    return flow;
  }
}
