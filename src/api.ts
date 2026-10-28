import type { DetalheLead, Enriquecimento, EstadoBase, Filtros, ItemLeads, Opcao, PaginaBusca, Painel, Preferencias, StatusLead } from './tipos.ts';

export class ErroApi extends Error {
  readonly status: number;
  readonly semBase: boolean;
  constructor(mensagem: string, status: number, semBase: boolean) {
    super(mensagem);
    this.status = status;
    this.semBase = semBase;
  }
}

async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(caminho, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  } catch {
    throw new ErroApi('O servidor do CaçaLead não está respondendo. Abra pelo start.bat (ou rode npm run servidor).', 0, false);
  }
  const corpo = (await res.json().catch(() => ({}))) as { erro?: string; semBase?: boolean };
  if (!res.ok) throw new ErroApi(corpo.erro ?? `Erro ${res.status}`, res.status, corpo.semBase === true);
  return corpo as T;
}

/** Filtros ↔ query string: a mesma forma na URL da tela, na API e no link de exportação. */
export function paraParametros(f: Filtros): URLSearchParams {
  const p = new URLSearchParams();
  for (const [chave, valor] of Object.entries(f)) {
    if (valor === undefined || valor === '' || valor === false) continue;
    p.set(chave, valor === true ? '1' : String(valor));
  }
  return p;
}

export const api = {
  estado: () => pedir<EstadoBase>('/api/estado'),
  buscar: (f: Filtros, cursor: string | null, sinal?: AbortSignal) => {
    const p = paraParametros(f);
    if (cursor) p.set('cursor', cursor);
    return pedir<PaginaBusca>(`/api/busca?${p}`, { signal: sinal });
  },
  linkExportacao: (f: Filtros) => `/api/exportar.csv?${paraParametros(f)}`,
  cnaes: (q: string, sinal?: AbortSignal) => pedir<Opcao[]>(`/api/cnaes?q=${encodeURIComponent(q)}`, { signal: sinal }),
  municipios: (q: string, uf: string | undefined, sinal?: AbortSignal) => pedir<Opcao[]>(`/api/municipios?q=${encodeURIComponent(q)}${uf ? `&uf=${uf}` : ''}`, { signal: sinal }),
  lead: (cnpj: string) => pedir<DetalheLead>(`/api/lead/${cnpj}`),
  atualizarLead: (cnpj: string, mudanca: { status?: StatusLead; naoContatar?: boolean }) => pedir<DetalheLead>(`/api/lead/${cnpj}`, { method: 'PATCH', body: JSON.stringify(mudanca) }),
  adicionarNota: (cnpj: string, texto: string) => pedir<DetalheLead>(`/api/lead/${cnpj}/notas`, { method: 'POST', body: JSON.stringify({ texto }) }),
  apagarNota: (id: number) => pedir<{ ok: true }>(`/api/notas/${id}`, { method: 'DELETE' }),
  enriquecer: (cnpj: string) => pedir<Enriquecimento>(`/api/lead/${cnpj}/enriquecer`, { method: 'POST' }),
  leads: (status: StatusLead | null, naoContatar: boolean) => pedir<ItemLeads[]>(`/api/leads?${new URLSearchParams({ ...(status ? { status } : {}), ...(naoContatar ? { naoContatar: '1' } : {}) })}`),
  painel: () => pedir<Painel>('/api/painel'),
  preferencias: () => pedir<Preferencias>('/api/preferencias'),
  salvarPreferencias: (p: Partial<Preferencias>) => pedir<Preferencias>('/api/preferencias', { method: 'PUT', body: JSON.stringify(p) }),
};
