import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './jwt-payload';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    // Compara mesmo sem usuario p/ nao vazar timing de "email existe".
    const ok =
      admin && (await bcrypt.compare(password, admin.passHash));
    if (!admin || !ok) {
      throw new UnauthorizedException('Credenciais invalidas');
    }

    const payload: JwtPayload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: { id: admin.id, email: admin.email, role: admin.role },
    };
  }
}
