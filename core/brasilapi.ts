import { enriquecimentos } from './armazenamento/crm.ts';
import type { Enriquecimento } from '../src/tipos.ts';

/**
 * BrasilAPI: um CNPJ por vez, só quando você abre o lead e pede para enriquecer. Serve para conferir se o
 * cadastro mudou desde a carga do mês e para trazer os sócios, que a base local não importa.
 *
 * Cache de 24 h por CNPJ (o mesmo lead não é consultado duas vezes no dia) e nova tentativa com espera
 * crescente quando a API responde 429 (limite de pedidos) ou 5xx, respeitando o Retry-After quando vem.
 */

const VALIDADE_MS = 24 * 60 * 60 * 1000;
const TENTATIVAS = 4;

export class ErroBrasilApi extends Error {
  readonly status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.status = status;
  }
}

interface RespostaBrasilApi {
  razao_social?: string | null;
  nome_fantasia?: string | null;
  descricao_situacao_cadastral?: string | null;
  data_situacao_cadastral?: string | null;
  data_inicio_atividade?: string | null;
  ddd_telefone_1?: string | null;
  ddd_telefone_2?: string | null;
  email?: string | null;
  descricao_tipo_de_logradouro?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
  porte?: string | null;
  opcao_pelo_mei?: boolean | null;
  opcao_pelo_simples?: boolean | null;
  capital_social?: number | null;
  qsa?: { nome_socio?: string | null; qualificacao_socio?: string | null; data_entrada_sociedade?: string | null; faixa_etaria?: string | null }[];
}

const limpo = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

function paraEnriquecimento(r: RespostaBrasilApi, consultadoEm: string, doCache: boolean): Enriquecimento {
  const rua = [r.descricao_tipo_de_logradouro, r.logradouro].map(limpo).filter(Boolean).join(' ');
  const endereco = [rua && [rua, limpo(r.numero)].filter(Boolean).join(', '), limpo(r.complemento), limpo(r.bairro), [limpo(r.municipio), limpo(r.uf)].filter(Boolean).join('/')]
    .filter(Boolean)
    .join(' · ');
  return {
    razaoSocial: limpo(r.razao_social),
    nomeFantasia: limpo(r.nome_fantasia),
    situacao: limpo(r.descricao_situacao_cadastral),
    dataSituacao: limpo(r.data_situacao_cadastral),
    abertura: limpo(r.data_inicio_atividade),
    telefones: [r.ddd_telefone_1, r.ddd_telefone_2].map(t => t?.replace(/\D/g, '') ?? '').filter(t => t.length >= 10),
    email: limpo(r.email)?.toLowerCase() ?? null,
    endereco: endereco || null,
    porte: limpo(r.porte),
    mei: r.opcao_pelo_mei ?? null,
    simples: r.opcao_pelo_simples ?? null,
    capitalSocial: r.capital_social ?? null,
    socios: (r.qsa ?? []).map(s => ({
      nome: limpo(s.nome_socio) ?? '—',
      qualificacao: limpo(s.qualificacao_socio),
      desde: limpo(s.data_entrada_sociedade),
      faixaEtaria: limpo(s.faixa_etaria),
    })),
    consultadoEm,
    doCache,
  };
}

const esperar = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function consultar(cnpj: string): Promise<RespostaBrasilApi> {
  for (let tentativa = 1; ; tentativa++) {
    let res: Response;
    try {
      // Sem User-Agent a BrasilAPI responde 403 (o fetch do Node não manda um por padrão; o curl manda).
      res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'CacaLead/0.1 (prospeccao local)' },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      if (tentativa >= TENTATIVAS) throw new ErroBrasilApi('Não foi possível falar com a BrasilAPI. Confira a internet e tente de novo.', 502);
      await esperar(1_000 * 2 ** (tentativa - 1));
      continue;
    }
    if (res.ok) return (await res.json()) as RespostaBrasilApi;
    if (res.status === 404) throw new ErroBrasilApi('A BrasilAPI não encontrou este CNPJ. Ele pode ter sido aberto há poucos dias.', 404);
    if ((res.status === 429 || res.status >= 500) && tentativa < TENTATIVAS) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await esperar(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 1_000 * 2 ** tentativa);
      continue;
    }
    throw new ErroBrasilApi(
      res.status === 429 ? 'A BrasilAPI está limitando os pedidos agora. Espere um minuto e tente de novo.' : `A BrasilAPI respondeu com erro (${res.status}). Tente de novo em instantes.`,
      502,
    );
  }
}

const emAndamento = new Map<string, Promise<Enriquecimento>>();

export function guardado(cnpj: string): Enriquecimento | null {
  const r = enriquecimentos.recente<RespostaBrasilApi>(cnpj, VALIDADE_MS);
  return r ? paraEnriquecimento(r.dados, r.consultadoEm, true) : null;
}

/** Consulta (ou devolve o cache de 24 h). Dois cliques seguidos no mesmo lead viram um pedido só. */
export function enriquecer(cnpj: string): Promise<Enriquecimento> {
  const cache = guardado(cnpj);
  if (cache) return Promise.resolve(cache);
  const pendente = emAndamento.get(cnpj);
  if (pendente) return pendente;
  const pedido = consultar(cnpj)
    .then(dados => {
      enriquecimentos.salvar(cnpj, dados);
      return paraEnriquecimento(dados, new Date().toISOString(), false);
    })
    .finally(() => emAndamento.delete(cnpj));
  emAndamento.set(cnpj, pedido);
  return pedido;
}
