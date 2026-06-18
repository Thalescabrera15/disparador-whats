import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../jwt-payload';

/** Injeta o usuario autenticado: handler(@CurrentUser() user: AuthUser). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as AuthUser;
  },
);
