const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO', 'EX',
];

const SITUACOES_VALIDAS = new Set([1, 2, 3, 4, 8]);

export const WEBDAV_URL = 'https://arquivos.receitafederal.gov.br/public.php/webdav';
/** Token do compartilhamento público "Dados Abertos CNPJ" da Receita. */
export const TOKEN_COMPARTILHAMENTO = 'YggdBLfdninEJX9';

export interface Opcoes {
  mes: string | null;
  ufs: ReadonlySet<string> | null;
  /** Data mínima de início de atividade no formato bruto da Receita (AAAAMMDD). */
  desde: string | null;
  situacoes: ReadonlySet<number>;
  paralelo: number;
  /** Conexões simultâneas com a Receita, somando todos os arquivos. */
  conexoes: number;
  manterZips: boolean;
  /** Baixa e lê tudo, mas não grava nenhuma base. */
  teste: boolean;
  /** Restringe os arquivos processados (ex.: --so=Estabelecimentos9). Só para testes. */
  so: ReadonlySet<string> | null;
}

export class OpcaoInvalida extends Error {}

export const AJUDA = `
Uso: npm run ingestao -- [opções]

  --ufs=SP,RJ          UFs a importar (padrão: todas)
  --desde=2024-01-01   só empresas abertas a partir desta data (padrão: 1º de janeiro de dois anos atrás; "todas" = sem limite)
  --situacoes=02       01 nula, 02 ativa, 03 suspensa, 04 inapta, 08 baixada (padrão: 02)
  --mes=2026-10        mês da Receita (padrão: o mais recente publicado)
  --paralelo=3         arquivos baixados/processados ao mesmo tempo (1 a 6)
  --conexoes=6         conexões simultâneas com a Receita, no total (1 a 8)
  --manter-zips        não apaga os ZIPs depois de importar (pra rodar de novo sem baixar)
  --teste              baixa e lê tudo, mostra o que seria importado, não grava nada
`;

function valor(argv: readonly string[], nome: string): string | null {
  const arg = argv.find(a => a.startsWith(`--${nome}=`));
  const v = arg?.slice(nome.length + 3).trim();
  return v ? v : null;
}

function lista(v: string | null): string[] {
  return v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
}

function lerUfs(v: string | null): ReadonlySet<string> | null {
  const ufs = lista(v).map(s => s.toUpperCase());
  if (ufs.length === 0) return null;
  const invalidas = ufs.filter(uf => !UFS.includes(uf));
  if (invalidas.length) throw new OpcaoInvalida(`UF inválida: ${invalidas.join(', ')}`);
  return new Set(ufs);
}

function lerDesde(v: string | null): string | null {
  if (v === 'todas') return null;
  if (!v) return `${new Date().getFullYear() - 2}0101`;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) throw new OpcaoInvalida(`--desde deve estar no formato AAAA-MM-DD (recebi "${v}")`);
  return `${m[1]}${m[2]}${m[3]}`;
}

function lerSituacoes(v: string | null): ReadonlySet<number> {
  const situacoes = lista(v ?? '02').map(s => Number.parseInt(s, 10));
  if (situacoes.length === 0 || situacoes.some(n => !SITUACOES_VALIDAS.has(n))) {
    throw new OpcaoInvalida('--situacoes aceita só 01, 02, 03, 04 e 08, separados por vírgula');
  }
  return new Set(situacoes);
}

function lerFaixa(v: string | null, nome: string, padrao: number, max: number): number {
  const n = Number.parseInt(v ?? String(padrao), 10);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new OpcaoInvalida(`--${nome} deve ser entre 1 e ${max}`);
  return n;
}

function lerMes(v: string | null): string | null {
  if (v && !/^\d{4}-\d{2}$/.test(v)) throw new OpcaoInvalida(`--mes deve estar no formato AAAA-MM (recebi "${v}")`);
  return v;
}

export function lerOpcoes(argv: readonly string[]): Opcoes {
  const teste = argv.includes('--teste');
  const so = lista(valor(argv, 'so'));
  // --permitir-parcial existe só pra testar com CACALEAD_DIR apontando pra uma pasta descartável.
  if (so.length && !teste && !argv.includes('--permitir-parcial')) {
    throw new OpcaoInvalida('--so só pode ser usado com --teste: uma carga parcial substituiria a base inteira.');
  }
  return {
    mes: lerMes(valor(argv, 'mes')),
    ufs: lerUfs(valor(argv, 'ufs')),
    desde: lerDesde(valor(argv, 'desde')),
    situacoes: lerSituacoes(valor(argv, 'situacoes')),
    paralelo: lerFaixa(valor(argv, 'paralelo'), 'paralelo', 3, 6),
    conexoes: lerFaixa(valor(argv, 'conexoes'), 'conexoes', 6, 8),
    manterZips: argv.includes('--manter-zips'),
    teste,
    so: so.length ? new Set(so) : null,
  };
}

/** Os filtros num formato legível, gravado junto da base e mostrado na tela. */
export function descreverFiltros(o: Opcoes): { ufs: string[] | 'todas'; desde: string; situacoes: number[] } {
  return {
    ufs: o.ufs ? [...o.ufs].sort() : 'todas',
    desde: o.desde ? `${o.desde.slice(0, 4)}-${o.desde.slice(4, 6)}-${o.desde.slice(6, 8)}` : 'todas',
    situacoes: [...o.situacoes].sort((a, b) => a - b),
  };
}
