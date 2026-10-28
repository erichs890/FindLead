import { DatabaseSync } from 'node:sqlite';
import { CRM_PATH } from '../config.ts';
import { STATUS, type ItemLeads, type Lead, type Nota, type SnapshotLead, type StatusLead } from '../../src/tipos.ts';

/**
 * Seus dados: o que você fez com cada lead. Mora em `crm.db`, separado da base da Receita, porque a base é
 * jogada fora e refeita todo mês e isto aqui não pode ir junto. Por isso também o CNPJ não "aponta" para a base:
 * um lead continua no CRM mesmo que a empresa saia da Receita (baixada) ou dos seus filtros de ingestão — e é
 * para isso que existe o `snapshot`, a cópia do nome e da cidade no dia em que o lead entrou.
 */

export const db = new DatabaseSync(CRM_PATH);
db.exec(`
  pragma journal_mode = wal;
  pragma busy_timeout = 5000;
  pragma foreign_keys = on;

  create table if not exists leads (
    cnpj            text primary key check (length(cnpj) = 14),
    status          text not null default 'novo' check (status in ('novo', 'contatado', 'respondeu', 'fechado', 'descartado')),
    nao_contatar    integer not null default 0,
    nao_contatar_em text,
    snapshot        text not null default '{}',
    criado_em       text not null,
    atualizado_em   text not null
  );
  create index if not exists leads_status on leads (status, atualizado_em desc);
  create index if not exists leads_opt_out on leads (cnpj) where nao_contatar = 1;

  create table if not exists notas (
    id        integer primary key autoincrement,
    cnpj      text not null references leads (cnpj) on delete cascade,
    texto     text not null check (length(texto) between 1 and 5000),
    criada_em text not null
  );
  create index if not exists notas_cnpj on notas (cnpj, criada_em desc);

  -- Cache da BrasilAPI: uma resposta por CNPJ, com a hora em que foi consultada.
  create table if not exists enriquecimentos (
    cnpj          text primary key,
    dados         text not null,
    consultado_em text not null
  );

  -- Preferências em blobs JSON por chave: região padrão, mensagem do WhatsApp...
  create table if not exists kv (chave text primary key, valor text not null);
`);

interface LinhaLead {
  cnpj: string;
  status: StatusLead;
  nao_contatar: number;
  nao_contatar_em: string | null;
  snapshot: string;
  criado_em: string;
  atualizado_em: string;
}

const paraLead = (l: LinhaLead): Lead => ({
  cnpj: l.cnpj,
  status: l.status,
  naoContatar: l.nao_contatar === 1,
  naoContatarEm: l.nao_contatar_em,
  snapshot: JSON.parse(l.snapshot) as SnapshotLead,
  criadoEm: l.criado_em,
  atualizadoEm: l.atualizado_em,
});

export const leads = {
  obter(cnpj: string): Lead | undefined {
    const l = db.prepare('select * from leads where cnpj = ?').get(cnpj) as LinhaLead | undefined;
    return l ? paraLead(l) : undefined;
  },

  /** Cria o lead se ainda não existe. O snapshot só é gravado na criação: é a foto do dia em que entrou. */
  garantir(cnpj: string, snapshot: SnapshotLead): Lead {
    const agora = new Date().toISOString();
    db.prepare('insert into leads (cnpj, snapshot, criado_em, atualizado_em) values (?, ?, ?, ?) on conflict(cnpj) do nothing').run(cnpj, JSON.stringify(snapshot), agora, agora);
    return leads.obter(cnpj)!;
  },

  definirStatus(cnpj: string, status: StatusLead): void {
    db.prepare('update leads set status = ?, atualizado_em = ? where cnpj = ?').run(status, new Date().toISOString(), cnpj);
  },

  /** Opt-out (LGPD): o lead some de buscas, exportações e do painel, mas o registro fica — senão voltaria na próxima busca. */
  definirNaoContatar(cnpj: string, naoContatar: boolean): void {
    const agora = new Date().toISOString();
    db.prepare('update leads set nao_contatar = ?, nao_contatar_em = ?, atualizado_em = ? where cnpj = ?').run(naoContatar ? 1 : 0, naoContatar ? agora : null, agora, cnpj);
  },

  /** Status e opt-out de vários CNPJs de uma vez, pra marcar a lista de resultados sem uma consulta por linha. */
  dosCnpjs(cnpjs: readonly string[]): Map<string, Lead> {
    if (cnpjs.length === 0) return new Map();
    const linhas = db.prepare(`select * from leads where cnpj in (${cnpjs.map(() => '?').join(',')})`).all(...cnpjs) as unknown as LinhaLead[];
    return new Map(linhas.map(l => [l.cnpj, paraLead(l)]));
  },

  /** Os leads do CRM, do mais mexido para o menos. Os marcados "não contatar" só aparecem quando pedidos. */
  listar(filtro: { status?: StatusLead; naoContatar?: boolean }): ItemLeads[] {
    const condicoes = [filtro.naoContatar ? 'l.nao_contatar = 1' : 'l.nao_contatar = 0'];
    const parametros: string[] = [];
    if (filtro.status) {
      condicoes.push('l.status = ?');
      parametros.push(filtro.status);
    }
    const linhas = db
      .prepare(`select l.*, (select count(*) from notas n where n.cnpj = l.cnpj) as total_notas from leads l where ${condicoes.join(' and ')} order by l.atualizado_em desc limit 1000`)
      .all(...parametros) as unknown as (LinhaLead & { total_notas: number })[];
    return linhas.map(l => ({ ...paraLead(l), notas: l.total_notas }));
  },

  totalNaoContatar(): number {
    return (db.prepare('select count(*) as n from leads where nao_contatar = 1').get() as { n: number }).n;
  },

  contagemPorStatus(): Record<StatusLead, number> {
    const contagem = Object.fromEntries(STATUS.map(s => [s, 0])) as Record<StatusLead, number>;
    for (const l of db.prepare('select status, count(*) as n from leads where nao_contatar = 0 group by status').all() as { status: StatusLead; n: number }[]) contagem[l.status] = l.n;
    return contagem;
  },
};

export const notas = {
  listar(cnpj: string): Nota[] {
    return (db.prepare('select id, cnpj, texto, criada_em from notas where cnpj = ? order by criada_em desc').all(cnpj) as { id: number; cnpj: string; texto: string; criada_em: string }[]).map(n => ({
      id: n.id,
      cnpj: n.cnpj,
      texto: n.texto,
      criadaEm: n.criada_em,
    }));
  },
  adicionar(cnpj: string, texto: string): void {
    db.prepare('insert into notas (cnpj, texto, criada_em) values (?, ?, ?)').run(cnpj, texto, new Date().toISOString());
  },
  apagar(id: number): void {
    db.prepare('delete from notas where id = ?').run(id);
  },
};

export const enriquecimentos = {
  /** Resposta guardada, se foi consultada há menos de `validadeMs`. */
  recente<T>(cnpj: string, validadeMs: number): { dados: T; consultadoEm: string } | undefined {
    const l = db.prepare('select dados, consultado_em from enriquecimentos where cnpj = ?').get(cnpj) as { dados: string; consultado_em: string } | undefined;
    if (!l || Date.now() - Date.parse(l.consultado_em) > validadeMs) return undefined;
    return { dados: JSON.parse(l.dados) as T, consultadoEm: l.consultado_em };
  },
  salvar(cnpj: string, dados: unknown): void {
    db.prepare('insert into enriquecimentos (cnpj, dados, consultado_em) values (?, ?, ?) on conflict(cnpj) do update set dados = excluded.dados, consultado_em = excluded.consultado_em').run(
      cnpj,
      JSON.stringify(dados),
      new Date().toISOString(),
    );
  },
};

export const kv = {
  get<T>(chave: string, padrao: T): T {
    const l = db.prepare('select valor from kv where chave = ?').get(chave) as { valor: string } | undefined;
    return l ? (JSON.parse(l.valor) as T) : padrao;
  },
  set(chave: string, valor: unknown): void {
    db.prepare('insert into kv (chave, valor) values (?, ?) on conflict(chave) do update set valor = excluded.valor').run(chave, JSON.stringify(valor));
  },
};
