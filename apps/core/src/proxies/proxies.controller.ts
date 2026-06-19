import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateProxyDto } from './dto/create-proxy.dto';
import { ProxiesService } from './proxies.service';

@Controller('proxies')
@UseGuards(JwtAuthGuard)
export class ProxiesController {
  constructor(private readonly proxies: ProxiesService) {}

  @Post()
  create(@Body() dto: CreateProxyDto) {
    return this.proxies.create(dto);
  }

  @Get()
  list() {
    return this.proxies.list();
  }
}
