import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProxyDto } from './dto/create-proxy.dto';

@Injectable()
export class ProxiesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateProxyDto) {
    return this.prisma.proxy.create({ data: dto });
  }

  list() {
    return this.prisma.proxy.findMany({
      include: { _count: { select: { numbers: true } } },
    });
  }
}
