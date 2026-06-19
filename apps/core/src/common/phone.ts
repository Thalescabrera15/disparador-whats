import {
  type CountryCode,
  parsePhoneNumberFromString,
} from 'libphonenumber-js';

/**
 * Normaliza para E.164 com validacao real (libphonenumber-js).
 * Rejeita lixo, DDD/DDI invalidos e NAO prefixa +55 em numeros internacionais.
 *
 * Heuristica BR: se vier so digitos comecando com "55" e com 12-13 digitos,
 * assume que ja tem DDI (faltando o "+"). Caso contrario aplica o pais default.
 */
export function normalizeE164(raw: string, defaultCountry: CountryCode = 'BR'): string {
  const s = (raw ?? '').trim();
  const digits = s.replace(/\D/g, '');
  if (!digits) throw new Error('telefone vazio');

  let candidate = s;
  if (!s.startsWith('+')) {
    candidate =
      digits.length >= 12 && digits.startsWith('55') ? `+${digits}` : digits;
  }

  const pn = parsePhoneNumberFromString(candidate, defaultCountry);
  if (!pn || !pn.isValid()) {
    throw new Error(`telefone invalido: ${raw}`);
  }
  return pn.number; // E.164
}

/** Versao nao-lancante (true se normaliza). Usada na deteccao de coluna. */
export function isNormalizablePhone(raw: string): boolean {
  try {
    normalizeE164(raw);
    return true;
  } catch {
    return false;
  }
}
