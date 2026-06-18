import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Protege rotas: exige Bearer JWT valido. Use com @UseGuards(JwtAuthGuard). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
