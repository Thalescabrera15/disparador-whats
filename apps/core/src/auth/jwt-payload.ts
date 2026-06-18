export interface JwtPayload {
  sub: string; // AdminUser.id
  email: string;
  role: string;
}

/** Usuario autenticado anexado em req.user apos validar o JWT. */
export interface AuthUser {
  id: string;
  email: string;
  role: string;
}
