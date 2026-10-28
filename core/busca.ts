import type { SQLInputValue } from 'node:sqlite';
import { db } from './armazenamento/crm.ts';
import { exigirBase } from './base.ts';
import type { DetalheLead, Filtros, ItemBusca, Opcao, PaginaBusca, Porte } from '../src/tipos.ts';
import { PORTES } from '../src/tipos.ts';

const POR_PAGINA = 50;
/** Contar 2 milhões de linhas a cada filtro mexido custa segundos; acima disto a tela mostra "10.000+". */
const LIMITE_DO_TOTAL = 10_000;

const data = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const numero = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

export function lerFiltros(p: URLSearchParams): Filtros {
  const porte = p.get('porte');
  return {
    desde: data(p.get('desde')),
    ate: data(p.get('ate')),
    uf: /^[A-Z]{2}$/.test(p.get('uf') ?? '') ? p.get('uf')! : undefined,
    municipio: numero(p.get('municipio')),
    cnae: numero(p.get('cnae')),
    porte: PORTES.some(x => x.valor === porte) ? (porte as Porte) : undefined,
    situacao: numero(p.get('situacao')),
    comTelefone: p.get('comTelefone') === '1' || undefined,
    comEmail: p.get('comEmail') === '1' || undefined,
    contatoDireto: p.get('contatoDireto') === '1' || undefined,
    texto: p.get('texto')?.trim().slice(0, 80) || undefined,
  };
}

const EMAIL_DE_CONTADOR = "exists (select 1 from rf.contatos_compartilhados x where x.tipo = 'email' and x.valor = e.email)";
const TELEFONE_DE_CONTADOR = "exists (select 1 from rf.contatos_compartilhados x where x.tipo = 'telefone' and x.valor = e.telefone_1)";

const COLUNAS = `
  e.cnpj, e.nome_fantasia, em.razao_social, e.uf, m.nome as municipio, e.cnae_principal, c.descricao as cnae_descricao,
  e.data_inicio_atividade, e.telefone_1, e.telefone_2, e.email, em.porte, s.opcao_mei,
  ${EMAIL_DE_CONTADOR} as email_de_contador, ${TELEFONE_DE_CONTADOR} as telefone_de_contador, l.status`;

const JUNCOES = `
  from rf.estabelecimentos e
  left join rf.empresas em on em.cnpj_basico = e.cnpj_basico
  left join rf.simples s on s.cnpj_basico = e.cnpj_basico
  left join rf.municipios m on m.codigo = e.municipio_codigo
  left join rf.cnaes c on c.codigo = e.cnae_principal
  left join main.leads l on l.cnpj = e.cnpj`;

interface LinhaBusca {
  cnpj: string;
  nome_fantasia: string | null;
  razao_social: string | null;
  uf: string | null;
  municipio: string | null;
  cnae_principal: number | null;
  cnae_descricao: string | null;
  data_inicio_atividade: string | null;
  telefone_1: string | null;
  telefone_2: string | null;
  email: string | null;
  porte: number | null;
  opcao_mei: number | null;
  email_de_contador: number;
  telefone_de_contador: number;
  status: ItemBusca['status'];
}

const paraItem = (l: LinhaBusca): ItemBusca => ({
  cnpj: l.cnpj,
  nomeFantasia: l.nome_fantasia,
  razaoSocial: l.razao_social,
  uf: l.uf,
  municipio: l.municipio,
  cnae: l.cnae_principal,
  cnaeDescricao: l.cnae_descricao,
  abertura: l.data_inicio_atividade,
  telefone: l.telefone_1,
  telefone2: l.telefone_2,
  email: l.email,
  emailDeContador: l.email_de_contador === 1,
  telefoneDeContador: l.telefone_de_contador === 1,
  porte: l.porte,
  mei: l.opcao_mei === 1,
  status: l.status,
});

/** WHERE comum à lista, ao total e à exportação. Opt-out ("não contatar") nunca aparece. */
function condicoes(f: Filtros): { sql: string; parametros: SQLInputValue[] } {
  const partes = ['coalesce(l.nao_contatar, 0) = 0'];
  const parametros: SQLInputValue[] = [];
  const somar = (sql: string, ...valores: SQLInputValue[]) => {
    partes.push(sql);
    parametros.push(...valores);
  };
  if (f.uf) somar('e.uf = ?', f.uf);
  if (f.municipio) somar('e.municipio_codigo = ?', f.municipio);
  if (f.desde) somar('e.data_inicio_atividade >= ?', f.desde);
  if (f.ate) somar('e.data_inicio_atividade <= ?', f.ate);
  if (f.cnae) somar('e.cnae_principal = ?', f.cnae);
  if (f.situacao) somar('e.situacao_cadastral = ?', f.situacao);
  if (f.porte === 'mei') somar('s.opcao_mei = 1');
  else if (f.porte) somar('em.porte = ? and coalesce(s.opcao_mei, 0) = 0', Number(f.porte));
  if (f.comTelefone) somar('e.telefone_1 is not null');
  if (f.comEmail) somar('e.email is not null');
  if (f.contatoDireto) somar(`((e.email is not null and not ${EMAIL_DE_CONTADOR}) or (e.telefone_1 is not null and not ${TELEFONE_DE_CONTADOR}))`);
  if (f.texto) {
    const like = `%${f.texto.replace(/[\\%_]/g, c => `\\${c}`)}%`;
    somar("(e.nome_fantasia like ? escape '\\' or em.razao_social like ? escape '\\')", like, like);
  }
  return { sql: partes.join(' and '), parametros };
}

/** Cursor = abertura + CNPJ da última linha: paginação por chave, que não fica lenta na página 200 como OFFSET. */
function lerCursor(cursor: string | null): [string, string] | null {
  if (!cursor) return null;
  const [d, cnpj] = Buffer.from(cursor, 'base64url').toString().split('|');
  return d !== undefined && cnpj && /^\d{14}$/.test(cnpj) ? [d, cnpj] : null;
}

export function buscar(f: Filtros, cursor: string | null): PaginaBusca {
  exigirBase();
  const { sql, parametros } = condicoes(f);
  const depois = lerCursor(cursor);
  const pagina = depois ? `and (coalesce(e.data_inicio_atividade, '') < ? or (coalesce(e.data_inicio_atividade, '') = ? and e.cnpj < ?))` : '';
  const linhas = db
    .prepare(`select ${COLUNAS} ${JUNCOES} where ${sql} ${pagina} order by e.data_inicio_atividade desc, e.cnpj desc limit ?`)
    .all(...parametros, ...(depois ? [depois[0], depois[0], depois[1]] : []), POR_PAGINA + 1) as unknown as LinhaBusca[];

  const itens = linhas.slice(0, POR_PAGINA).map(paraItem);
  const ultima = itens.at(-1);
  const proximo = linhas.length > POR_PAGINA && ultima ? Buffer.from(`${ultima.abertura ?? ''}|${ultima.cnpj}`).toString('base64url') : null;

  // O total só na primeira página: nas seguintes a tela já tem o número.
  const total = depois
    ? -1
    : (db.prepare(`select count(*) as n from (select 1 ${JUNCOES} where ${sql} limit ${LIMITE_DO_TOTAL + 1})`).get(...parametros) as { n: number }).n;
  return { itens, proximo, total, limiteDoTotal: LIMITE_DO_TOTAL };
}

/** Todas as linhas dos filtros, para o CSV. Iterador: não carrega milhões de linhas na memória. */
export function* paraExportar(f: Filtros): Generator<ItemBusca> {
  exigirBase();
  const { sql, parametros } = condicoes(f);
  const consulta = db.prepare(`select ${COLUNAS} ${JUNCOES} where ${sql} order by e.data_inicio_atividade desc, e.cnpj desc`);
  for (const l of consulta.iterate(...parametros)) yield paraItem(l as unknown as LinhaBusca);
}

// ---------------------------------------------------------------------------
// Autocompletar
// ---------------------------------------------------------------------------

const paraBusca = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function cnaes(q: string): Opcao[] {
  exigirBase();
  const termo = paraBusca(q);
  const digitos = termo.replace(/[\s./-]/g, '');
  if (/^\d+$/.test(digitos)) {
    return db.prepare("select codigo, descricao as nome from rf.cnaes where cast(codigo as text) like ? order by codigo limit 12").all(`${digitos}%`) as unknown as Opcao[];
  }
  if (termo.length < 2) return [];
  // Cada palavra precisa aparecer, em qualquer ordem: "site loja" acha "Comércio varejista... loja... site".
  const palavras = termo.split(/\s+/).filter(Boolean).slice(0, 5);
  const onde = palavras.map(() => 'descricao_busca like ?').join(' and ');
  return db
    .prepare(`select codigo, descricao as nome from rf.cnaes where ${onde} order by instr(descricao_busca, ?) = 1 desc, length(descricao) limit 12`)
    .all(...palavras.map(p => `%${p}%`), palavras[0]!) as unknown as Opcao[];
}

export function municipios(q: string, uf: string | null): Opcao[] {
  exigirBase();
  const termo = paraBusca(q);
  if (termo.length < 2) return [];
  const porUf = uf && /^[A-Z]{2}$/.test(uf) ? 'and uf = ?' : 'and uf is not null';
  return db
    .prepare(`select codigo, nome, uf from rf.municipios where nome_busca like ? ${porUf} order by instr(nome_busca, ?) = 1 desc, nome limit 12`)
    .all(`%${termo}%`, ...(uf && /^[A-Z]{2}$/.test(uf) ? [uf] : []), termo) as unknown as Opcao[];
}

export function nomeDoMunicipio(codigo: number): Opcao | null {
  exigirBase();
  return (db.prepare('select codigo, nome, uf from rf.municipios where codigo = ?').get(codigo) as Opcao | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------------

interface LinhaDetalhe extends LinhaBusca {
  matriz: number;
  situacao_cadastral: number;
  data_situacao_cadastral: string | null;
  tipo_logradouro: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  cnaes_secundarios: string | null;
  natureza: string | null;
  capital_social: number | null;
  opcao_simples: number | null;
}

/** O que a base sabe deste CNPJ, ou null se ele não está nela (fora dos filtros da ingestão, ou baixado). */
export function dadosDaBase(cnpj: string): Omit<DetalheLead, 'lead' | 'notas' | 'enriquecimento'> | null {
  exigirBase();
  const l = db
    .prepare(
      `select ${COLUNAS}, e.matriz, e.situacao_cadastral, e.data_situacao_cadastral, e.tipo_logradouro, e.logradouro, e.numero,
         e.complemento, e.bairro, e.cep, e.cnaes_secundarios, n.descricao as natureza, em.capital_social, s.opcao_simples
       ${JUNCOES} left join rf.naturezas n on n.codigo = em.natureza_juridica
       where e.cnpj = ?`,
    )
    .get(cnpj) as LinhaDetalhe | undefined;
  if (!l) return null;

  const codigos = (l.cnaes_secundarios ?? '').split(',').filter(Boolean).map(Number);
  const secundarios = codigos.length
    ? (db.prepare(`select codigo, descricao as nome from rf.cnaes where codigo in (${codigos.map(() => '?').join(',')})`).all(...codigos) as unknown as Opcao[])
    : [];
  const rua = [l.tipo_logradouro, l.logradouro].filter(Boolean).join(' ');
  const endereco = [rua && [rua, l.numero].filter(Boolean).join(', '), l.complemento, l.bairro].filter(Boolean).join(' · ') || null;

  return {
    ...paraItem(l),
    noBanco: true,
    matriz: l.matriz === 1,
    situacao: l.situacao_cadastral,
    dataSituacao: l.data_situacao_cadastral,
    endereco,
    cep: l.cep,
    cnaesSecundarios: secundarios,
    naturezaJuridica: l.natureza,
    capitalSocial: l.capital_social,
    simples: l.opcao_simples === null ? null : l.opcao_simples === 1,
  };
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export function aberturaMaisRecente(): string | null {
  exigirBase();
  return (db.prepare('select max(data_inicio_atividade) as d from rf.estabelecimentos').get() as { d: string | null }).d;
}

/** Aberturas por semana na região, contando para trás a partir da abertura mais recente da base. */
export function semanasNaRegiao(uf: string | null, municipio: number | null, quantas: number): { inicio: string; fim: string; total: number }[] {
  const recente = aberturaMaisRecente();
  if (!recente) return [];
  const fim = new Date(`${recente}T00:00:00Z`);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const semanas = Array.from({ length: quantas }, (_, i) => {
    const f = new Date(fim.getTime() - i * 7 * 86_400_000);
    const ini = new Date(f.getTime() - 6 * 86_400_000);
    return { inicio: iso(ini), fim: iso(f) };
  });
  const filtros: Filtros = { uf: uf ?? undefined, municipio: municipio ?? undefined, desde: semanas.at(-1)!.inicio, ate: semanas[0]!.fim };
  const { sql, parametros } = condicoes(filtros);
  const porDia = db.prepare(`select e.data_inicio_atividade as d, count(*) as n ${JUNCOES} where ${sql} group by e.data_inicio_atividade`).all(...parametros) as { d: string; n: number }[];
  return semanas.map(s => ({ ...s, total: porDia.filter(x => x.d >= s.inicio && x.d <= s.fim).reduce((t, x) => t + x.n, 0) }));
}
