// Tipos compartilhados entre a tela (src/) e o núcleo (core/).

export const STATUS = ['novo', 'contatado', 'respondeu', 'fechado', 'descartado'] as const;
export type StatusLead = (typeof STATUS)[number];

export const ROTULO_STATUS: Record<StatusLead, string> = {
  novo: 'Novo',
  contatado: 'Contatado',
  respondeu: 'Respondeu',
  fechado: 'Fechado',
  descartado: 'Descartado',
};

export const PORTES = [
  { valor: 'mei', rotulo: 'MEI' },
  { valor: '1', rotulo: 'Microempresa' },
  { valor: '3', rotulo: 'Pequeno porte' },
  { valor: '5', rotulo: 'Demais' },
] as const;
export type Porte = (typeof PORTES)[number]['valor'];

export const SITUACOES: Record<number, string> = { 1: 'Nula', 2: 'Ativa', 3: 'Suspensa', 4: 'Inapta', 8: 'Baixada' };

export interface SnapshotLead {
  razaoSocial: string | null;
  nomeFantasia: string | null;
  municipio: string | null;
  uf: string | null;
}

export interface Lead {
  cnpj: string;
  status: StatusLead;
  naoContatar: boolean;
  naoContatarEm: string | null;
  snapshot: SnapshotLead;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Nota {
  id: number;
  cnpj: string;
  texto: string;
  criadaEm: string;
}

export interface Filtros {
  /** AAAA-MM-DD */
  desde?: string;
  ate?: string;
  uf?: string;
  municipio?: number;
  cnae?: number;
  porte?: Porte;
  situacao?: number;
  comTelefone?: boolean;
  comEmail?: boolean;
  /** Esconde quem só tem contato de contador (e-mail e telefone compartilhados). */
  contatoDireto?: boolean;
  /** Parte do nome fantasia ou da razão social. */
  texto?: string;
}

export interface ItemBusca {
  cnpj: string;
  nomeFantasia: string | null;
  razaoSocial: string | null;
  uf: string | null;
  municipio: string | null;
  cnae: number | null;
  cnaeDescricao: string | null;
  abertura: string | null;
  telefone: string | null;
  telefone2: string | null;
  email: string | null;
  emailDeContador: boolean;
  telefoneDeContador: boolean;
  porte: number | null;
  mei: boolean;
  status: StatusLead | null;
}

export interface PaginaBusca {
  itens: ItemBusca[];
  /** Cursor para a próxima página; null quando acabou. */
  proximo: string | null;
  /** Total que bate com os filtros, contado até `limiteDoTotal`. */
  total: number;
  limiteDoTotal: number;
}

export interface Opcao {
  codigo: number;
  nome: string;
  uf?: string | null;
}

export interface Socio {
  nome: string;
  qualificacao: string | null;
  desde: string | null;
  faixaEtaria: string | null;
}

/** O que a BrasilAPI devolve, já no nosso formato. */
export interface Enriquecimento {
  razaoSocial: string | null;
  nomeFantasia: string | null;
  situacao: string | null;
  dataSituacao: string | null;
  abertura: string | null;
  telefones: string[];
  email: string | null;
  endereco: string | null;
  porte: string | null;
  mei: boolean | null;
  simples: boolean | null;
  capitalSocial: number | null;
  socios: Socio[];
  consultadoEm: string;
  /** true quando veio do cache das últimas 24 h. */
  doCache: boolean;
}

export interface DetalheLead extends ItemBusca {
  noBanco: boolean;
  matriz: boolean;
  situacao: number | null;
  dataSituacao: string | null;
  endereco: string | null;
  cep: string | null;
  cnaesSecundarios: Opcao[];
  naturezaJuridica: string | null;
  capitalSocial: number | null;
  simples: boolean | null;
  lead: Lead | null;
  notas: Nota[];
  enriquecimento: Enriquecimento | null;
}

export interface ItemLeads extends Lead {
  notas: number;
}

export interface EstadoBase {
  base: {
    mes: string;
    geradaEm: string;
    filtros: { ufs: string[] | 'todas'; desde: string; situacoes: number[] };
    totais: { estabelecimentos: number; empresas: number; contatosCompartilhados: number };
    tamanhoBytes: number;
  } | null;
  /** Abertura mais recente na base: a Receita atrasa, e "última semana" conta a partir daqui. */
  aberturaMaisRecente: string | null;
  pastaDados: string;
}

export interface Preferencias {
  uf: string | null;
  municipio: Opcao | null;
  seuNome: string;
  mensagemWhatsapp: string;
}

export interface Painel {
  porStatus: Record<StatusLead, number>;
  naoContatar: number;
  regiao: string;
  /** Semanas mais recentes primeiro: abertas em cada uma, na região. */
  semanas: { inicio: string; fim: string; total: number }[];
}
