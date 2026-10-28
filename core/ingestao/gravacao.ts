import { rmSync, statSync } from 'node:fs';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type { Valor } from './layouts.ts';
import { anotar } from './progresso.ts';
import type { ContadorDeContatos } from './estruturas.ts';

/** A partir de quantas matrizes com o mesmo contato ele é marcado como compartilhado (provável contador). */
export const LIMITE_CONTATO_COMPARTILHADO = 5;
const LINHAS_POR_TRANSACAO = 50_000;

const TABELAS = `
  create table estabelecimentos (
    cnpj                      text    not null,
    cnpj_basico               text    not null,
    matriz                    integer not null,
    nome_fantasia             text,
    situacao_cadastral        integer not null,
    data_situacao_cadastral   text,
    motivo_situacao_cadastral integer,
    data_inicio_atividade     text,
    cnae_principal            integer,
    cnaes_secundarios         text,
    tipo_logradouro           text,
    logradouro                text,
    numero                    text,
    complemento               text,
    bairro                    text,
    cep                       text,
    uf                        text,
    municipio_codigo          integer,
    telefone_1                text,
    telefone_2                text,
    email                     text
  );
  create table empresas (cnpj_basico text not null, razao_social text, natureza_juridica integer, capital_social real, porte integer);
  create table simples (
    cnpj_basico text not null, opcao_simples integer, data_opcao_simples text, data_exclusao_simples text,
    opcao_mei integer, data_opcao_mei text, data_exclusao_mei text
  );
  create table cnaes (codigo integer not null, descricao text not null, descricao_busca text not null);
  create table municipios (codigo integer not null, nome text not null, nome_busca text not null, uf text);
  create table naturezas (codigo integer not null, descricao text not null);
  create table contatos_compartilhados (tipo text not null, valor text not null, empresas integer not null);
  create table info (chave text primary key, valor text not null);
`;

/**
 * Uma base nova da Receita sendo montada. Tudo síncrono (node:sqlite): a leitura dos CSVs de vários arquivos
 * se intercala no event loop, mas cada `inserir` roda inteiro, então uma transação nunca fica no meio de outra.
 *
 * Durante a carga o arquivo não tem diário nem fsync (`journal_mode = off`, `synchronous = off`): se o
 * computador desligar, o arquivo fica corrompido — e tudo bem, porque ele ainda não é a base no ar e a próxima
 * carga começa outro do zero. É isso que deixa a gravação de milhões de linhas em minutos, e não em horas.
 */
export class BaseNova {
  readonly caminho: string;
  private readonly db: DatabaseSync;
  private readonly comandos = new Map<string, StatementSync>();
  private pendentes = 0;

  constructor(caminho: string) {
    this.caminho = caminho;
    this.db = new DatabaseSync(caminho);
    this.db.exec(`
      pragma journal_mode = off;
      pragma synchronous = off;
      pragma locking_mode = exclusive;
      pragma temp_store = memory;
      pragma cache_size = -262144;
      pragma page_size = 8192;
    `);
    this.db.exec(TABELAS);
    this.db.exec('begin');
  }

  preparar(tabela: string, colunas: readonly string[]): void {
    this.comandos.set(tabela, this.db.prepare(`insert into ${tabela} (${colunas.join(', ')}) values (${colunas.map(() => '?').join(', ')})`));
  }

  inserir(tabela: string, valores: readonly Valor[]): void {
    this.comandos.get(tabela)!.run(...valores);
    if (++this.pendentes >= LINHAS_POR_TRANSACAO) {
      this.db.exec('commit; begin');
      this.pendentes = 0;
    }
  }

  contar(tabela: string): number {
    return Number((this.db.prepare(`select count(*) as n from ${tabela}`).get() as { n: number }).n);
  }

  definirInfo(chave: string, valor: unknown): void {
    this.db.prepare('insert or replace into info (chave, valor) values (?, ?)').run(chave, JSON.stringify(valor));
  }

  /**
   * Marca e-mails e telefones usados por muitas empresas, conferindo cada contato distinto já importado no
   * contador que viu o país inteiro.
   */
  marcarContatosCompartilhados(contador: ContadorDeContatos): number {
    const consulta = this.db.prepare(`
      select 'email' as tipo, email as valor from estabelecimentos where email is not null
      union
      select 'telefone', telefone_1 from estabelecimentos where telefone_1 is not null
      union
      select 'telefone', telefone_2 from estabelecimentos where telefone_2 is not null
    `);
    const marcados: [string, string, number][] = [];
    for (const linha of consulta.iterate() as Iterable<{ tipo: string; valor: string }>) {
      const n = contador.contar(`${linha.tipo}:${linha.valor}`);
      if (n >= LIMITE_CONTATO_COMPARTILHADO) marcados.push([linha.tipo, linha.valor, n]);
    }
    this.preparar('contatos_compartilhados', ['tipo', 'valor', 'empresas']);
    for (const m of marcados) this.inserir('contatos_compartilhados', m);
    return marcados.length;
  }

  /** Índices e acabamento. Criar índice depois de carregar é várias vezes mais rápido que manter durante. */
  finalizar(variasSituacoes: boolean): void {
    this.db.exec('commit');
    const passos: [string, string][] = [
      ['CNPJ único', 'create unique index estabelecimentos_cnpj on estabelecimentos (cnpj)'],
      ['índice UF + município + data', 'create index estabelecimentos_uf_municipio_data on estabelecimentos (uf, municipio_codigo, data_inicio_atividade desc)'],
      ['índice UF + data', 'create index estabelecimentos_uf_data on estabelecimentos (uf, data_inicio_atividade desc)'],
      ['índice data de abertura', 'create index estabelecimentos_data on estabelecimentos (data_inicio_atividade desc)'],
      ['índice CNAE + data', 'create index estabelecimentos_cnae_data on estabelecimentos (cnae_principal, data_inicio_atividade desc)'],
      ['empresas por CNPJ', 'create unique index empresas_cnpj on empresas (cnpj_basico)'],
      ['Simples por CNPJ', 'create unique index simples_cnpj on simples (cnpj_basico)'],
      ['CNAEs', 'create unique index cnaes_codigo on cnaes (codigo)'],
      ['municípios', 'create unique index municipios_codigo on municipios (codigo)'],
      ['naturezas', 'create unique index naturezas_codigo on naturezas (codigo)'],
      ['contatos compartilhados', 'create unique index contatos_tipo_valor on contatos_compartilhados (tipo, valor)'],
      [
        'UF de cada município',
        // O arquivo Municipios da Receita não traz a UF; ela sai dos próprios estabelecimentos.
        `update municipios set uf = x.uf
         from (select municipio_codigo, min(uf) as uf from estabelecimentos where municipio_codigo is not null group by municipio_codigo) x
         where municipios.codigo = x.municipio_codigo`,
      ],
      ['municípios por UF', 'create index municipios_uf_nome on municipios (uf, nome_busca)'],
    ];
    // Situação cadastral tem cinco valores: índice dela sozinha nunca é escolhido pelo SQLite. Só vale junto
    // com a data, e só quando mais de uma situação foi importada (com uma só, o filtro não separa nada).
    if (variasSituacoes) passos.push(['índice situação + data', 'create index estabelecimentos_situacao_data on estabelecimentos (situacao_cadastral, data_inicio_atividade desc)']);
    passos.push(['estatísticas para o planejador', 'analyze']);

    for (const [rotulo, sql] of passos) {
      const inicio = Date.now();
      try {
        this.db.exec(sql);
      } catch (e) {
        if (rotulo !== 'CNPJ único') throw e;
        // A Receita não deveria repetir CNPJ, mas se repetir, fica a última versão em vez de perder a carga.
        this.db.exec('delete from estabelecimentos where rowid not in (select max(rowid) from estabelecimentos group by cnpj)');
        anotar('  CNPJs repetidos nos arquivos da Receita foram removidos (fica a última ocorrência).');
        this.db.exec(sql);
      }
      anotar(`  ✓ ${rotulo} (${((Date.now() - inicio) / 1000).toFixed(0)} s)`);
    }
    // Volta ao modo normal: a base passa a ser lida pelo servidor e tem que aguentar desligamento.
    this.db.exec('pragma journal_mode = delete; pragma locking_mode = normal; pragma synchronous = normal;');
  }

  fechar(): number {
    this.db.close();
    return statSync(this.caminho).size;
  }

  /** Larga uma carga que falhou: fecha e apaga o arquivo pela metade. */
  descartar(): void {
    try {
      if (this.db.isOpen) this.db.close();
    } finally {
      rmSync(this.caminho, { force: true });
      rmSync(`${this.caminho}-journal`, { force: true });
    }
  }
}
