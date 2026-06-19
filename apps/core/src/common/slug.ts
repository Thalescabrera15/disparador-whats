import { randomBytes } from 'node:crypto';

/** Slug legivel a partir de um texto (sem acento, minusculo, kebab). */
export function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // remove marcas combinantes (acentos)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'fluxo'
  );
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Slug curto, aleatorio e unico (para link por lead). */
export function randomSlug(len = 10): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
