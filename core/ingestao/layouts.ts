/**
 * Layout dos CSVs da Receita (sem cabeçalho, na ordem do dicionário de dados "NOVOLAYOUTDOSDADOSABERTOSDOCNPJ")
 * e a conversão de cada linha para as colunas da base. Cada conversor devolve `null` quando a linha está torta.
 * Valores já no formato que o SQLite guarda: booleano vira 0/1 e data vira texto AAAA-MM-DD (ordena como data).
 */

export type Valor = string | number | null;

export const CAMPOS_ESTABELECIMENTO = 30;
export const CAMPOS_EMPRESA = 7;
export const CAMPOS_SIMPLES = 7;

/** Posição de cada coluna bruta de Estabelecimentos. */
export const E = {
  cnpjBasico: 0, cnpjOrdem: 1, cnpjDv: 2, matrizFilial: 3, nomeFantasia: 4,
  situacao: 5, dataSituacao: 6, motivoSituacao: 7, cidadeExterior: 8, pais: 9,
  dataInicio: 10, cnaePrincipal: 11, cnaesSecundarios: 12, tipoLogradouro: 13,
  logradouro: 14, numero: 15, complemento: 16, bairro: 17, cep: 18, uf: 19,
  municipio: 20, ddd1: 21, telefone1: 22, ddd2: 23, telefone2: 24, dddFax: 25,
  fax: 26, email: 27, situacaoEspecial: 28, dataSituacaoEspecial: 29,
} as const;

export function texto(bruto: string | undefined): string | null {
  const v = bruto?.trim();
  return v ? v : null;
}

export function inteiro(bruto: string | undefined): number | null {
  const v = bruto?.trim();
  return v && /^\d+$/.test(v) ? Number.parseInt(v, 10) : null;
}

/** AAAAMMDD → AAAA-MM-DD. Data zerada ou impossível (20230231 existe nos arquivos) vira null. */
export function data(bruto: string | undefined): string | null {
  const v = bruto?.trim();
  if (!v || !/^\d{8}$/.test(v)) return null;
  const a = Number(v.slice(0, 4));
  const m = Number(v.slice(4, 6));
  const d = Number(v.slice(6, 8));
  if (a < 1800 || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(a, m, 0)).getUTCDate()) return null;
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}

/** DDD + número só com dígitos (ex.: "11987654321"). */
export function telefone(ddd: string | undefined, numero: string | undefined): string | null {
  const n = numero?.replace(/\D/g, '') ?? '';
  if (n.length < 8 || /^0+$/.test(n)) return null;
  const d = (ddd?.replace(/\D/g, '') ?? '').replace(/^0+/, '');
  return d.length === 2 ? d + n : null;
}

export function email(bruto: string | undefined): string | null {
  const v = bruto?.trim().toLowerCase();
  return v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

/** Sem acento e em minúsculas, pra busca por texto. */
export function paraBusca(v: string): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function digitos(bruto: string | undefined, tamanho: number): string | null {
  const v = bruto?.trim();
  return v && v.length === tamanho && /^\d+$/.test(v) ? v : null;
}

function listaDeCodigos(bruto: string | undefined): string | null {
  const codigos = (bruto ?? '').split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));
  return codigos.length ? codigos.map(s => Number.parseInt(s, 10)).join(',') : null;
}

// ---------------------------------------------------------------------------
// Estabelecimentos
// ---------------------------------------------------------------------------

export const COLUNAS_ESTABELECIMENTO = [
  'cnpj', 'cnpj_basico', 'matriz', 'nome_fantasia', 'situacao_cadastral', 'data_situacao_cadastral',
  'motivo_situacao_cadastral', 'data_inicio_atividade', 'cnae_principal', 'cnaes_secundarios', 'tipo_logradouro',
  'logradouro', 'numero', 'complemento', 'bairro', 'cep', 'uf', 'municipio_codigo', 'telefone_1', 'telefone_2', 'email',
] as const;

export function estabelecimento(r: string[]): Valor[] | null {
  const basico = digitos(r[E.cnpjBasico], 8);
  const ordem = digitos(r[E.cnpjOrdem], 4);
  const dv = digitos(r[E.cnpjDv], 2);
  const situacao = inteiro(r[E.situacao]);
  if (!basico || !ordem || !dv || situacao === null) return null;
  return [
    basico + ordem + dv,
    basico,
    r[E.matrizFilial]?.trim() === '1' ? 1 : 0,
    texto(r[E.nomeFantasia]),
    situacao,
    data(r[E.dataSituacao]),
    inteiro(r[E.motivoSituacao]),
    data(r[E.dataInicio]),
    inteiro(r[E.cnaePrincipal]),
    listaDeCodigos(r[E.cnaesSecundarios]),
    texto(r[E.tipoLogradouro]),
    texto(r[E.logradouro]),
    texto(r[E.numero]),
    texto(r[E.complemento]),
    texto(r[E.bairro]),
    digitos(r[E.cep], 8),
    texto(r[E.uf])?.toUpperCase() ?? null,
    inteiro(r[E.municipio]),
    telefone(r[E.ddd1], r[E.telefone1]),
    telefone(r[E.ddd2], r[E.telefone2]),
    email(r[E.email]),
  ];
}

// ---------------------------------------------------------------------------
// Empresas (dados da matriz: razão social, porte, capital)
// ---------------------------------------------------------------------------

export const COLUNAS_EMPRESA = ['cnpj_basico', 'razao_social', 'natureza_juridica', 'capital_social', 'porte'] as const;

function capital(bruto: string | undefined): number | null {
  const v = bruto?.trim();
  return v && /^\d+(,\d+)?$/.test(v) ? Number(v.replace(',', '.')) : null;
}

export function empresa(r: string[]): Valor[] | null {
  const basico = digitos(r[0], 8);
  return basico ? [basico, texto(r[1]), inteiro(r[2]), capital(r[4]), inteiro(r[5])] : null;
}

// ---------------------------------------------------------------------------
// Simples Nacional / MEI
// ---------------------------------------------------------------------------

export const COLUNAS_SIMPLES = ['cnpj_basico', 'opcao_simples', 'data_opcao_simples', 'data_exclusao_simples', 'opcao_mei', 'data_opcao_mei', 'data_exclusao_mei'] as const;

function simNao(bruto: string | undefined): number | null {
  const v = bruto?.trim().toUpperCase();
  return v === 'S' ? 1 : v === 'N' ? 0 : null;
}

export function simples(r: string[]): Valor[] | null {
  const basico = digitos(r[0], 8);
  return basico ? [basico, simNao(r[1]), data(r[2]), data(r[3]), simNao(r[4]), data(r[5]), data(r[6])] : null;
}

// ---------------------------------------------------------------------------
// Tabelas de domínio (código;descrição)
// ---------------------------------------------------------------------------

export const COLUNAS_CNAE = ['codigo', 'descricao', 'descricao_busca'] as const;
export const COLUNAS_MUNICIPIO = ['codigo', 'nome', 'nome_busca'] as const;
export const COLUNAS_NATUREZA = ['codigo', 'descricao'] as const;

export function codigoDescricao(r: string[], comBusca: boolean): Valor[] | null {
  const codigo = inteiro(r[0]);
  const descricao = texto(r[1]);
  if (codigo === null || !descricao) return null;
  return comBusca ? [codigo, descricao, paraBusca(descricao)] : [codigo, descricao];
}
