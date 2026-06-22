// Em produção o painel é servido pela própria Core (mesma origem) -> BASE relativo "".
// Em dev (painel em :5173), defina VITE_API_URL=http://localhost:3000 no apps/panel/.env
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

const TOKEN_KEY = 'dispatch_token';

export const auth = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  set token(t: string | null) {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  },
  get isLogged() {
    return !!localStorage.getItem(TOKEN_KEY);
  },
};

async function req<T = any>(
  method: string,
  path: string,
  body?: unknown,
  isForm = false,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (isForm) {
      payload = body as FormData;
    } else {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  if (res.status === 401) {
    auth.token = null;
    location.hash = '#/login';
    throw new Error('Sessão expirada, faça login de novo.');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.message ?? `Erro ${res.status}`);
  }
  return data as T;
}

export const api = {
  base: BASE,
  login: (email: string, password: string) =>
    req<{ accessToken: string; user: any }>('POST', '/auth/login', {
      email,
      password,
    }),

  // chips
  listChips: () => req('GET', '/chips'),
  getChip: (id: string) => req('GET', `/chips/${id}`),
  chipInsights: () => req('GET', '/chips/insights'),
  createChip: (label: string, phone: string, proxyId?: string) =>
    req('POST', '/chips', { label, phone, proxyId }),
  renameChip: (id: string, label: string) =>
    req('PATCH', `/chips/${id}/rename`, { label }),
  updateChipConfig: (
    id: string,
    body: {
      windowStart?: number;
      windowEnd?: number;
      restDays?: number[];
      rampDay?: number;
      dailyCap?: number;
    },
  ) => req('PATCH', `/chips/${id}/config`, body),
  pairChip: (id: string, usePairingCode = false) =>
    req('POST', `/chips/${id}/pair`, { usePairingCode }),
  pairState: (id: string) => req('GET', `/chips/${id}/pair`),
  chipAction: (id: string, action: 'start' | 'pause' | 'retire') =>
    req('POST', `/chips/${id}/${action}`),
  bindProxy: (id: string, proxyId: string) =>
    req('POST', `/chips/${id}/bind-proxy`, { proxyId }),

  // proxies
  listProxies: () => req('GET', '/proxies'),
  createProxy: (p: any) => req('POST', '/proxies', p),

  // flows
  listFlows: () => req('GET', '/flows'),
  getFlow: (id: string) => req('GET', `/flows/${id}`),
  createFlow: (data: any) => req('POST', '/flows', data),
  updateFlow: (id: string, data: any) => req('PATCH', `/flows/${id}`, data),

  // templates
  listOpenings: (flowId: string) =>
    req('GET', `/flows/${flowId}/opening-messages`),
  createOpening: (flowId: string, template: string, weight = 1) =>
    req('POST', `/flows/${flowId}/opening-messages`, { template, weight }),
  deleteOpening: (flowId: string, id: string) =>
    req('DELETE', `/flows/${flowId}/opening-messages/${id}`),
  previewTemplate: (flowId: string, body: any) =>
    req('POST', `/flows/${flowId}/opening-messages/preview`, body),

  // leads
  importLeads: (flowId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return req('POST', `/flows/${flowId}/leads/import`, fd, true);
  },
  leadStats: (flowId: string) => req('GET', `/flows/${flowId}/leads/stats`),

  // dispatches
  listDispatches: (flowId: string) =>
    req('GET', `/flows/${flowId}/dispatches`),
  createDispatch: (flowId: string, body: any) =>
    req('POST', `/flows/${flowId}/dispatches`, body),
  getDispatch: (id: string) => req('GET', `/dispatches/${id}`),
  updateDispatch: (id: string, body: any) =>
    req('PATCH', `/dispatches/${id}`, body),
  setDispatchStatus: (id: string, status: string) =>
    req('PATCH', `/dispatches/${id}/status`, { status }),

  // ai dry-run
  previewConversation: (flowId: string, body: any) =>
    req('POST', `/flows/${flowId}/conversation/preview`, body),
};
