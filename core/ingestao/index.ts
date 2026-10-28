/**
 * Ingestão mensal da base de CNPJ da Receita Federal para um SQLite local.
 *
 *   npm run ingestao                              carga completa (troca a base no fim, sem derrubar a anterior)
 *   npm run ingestao -- --ufs=SP --desde=2023-01-01
 *   npm run ingestao:teste -- --so=Cnaes,Estabelecimentos9
 *
 * Ordem: domínio (CNAEs, municípios) → Estabelecimentos filtrados por UF/data/situação → Empresas e Simples só
 * das empresas que entraram → índices → aponta `atual.json` para o arquivo novo.
 */
import { closeSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DIRS } from '../config.ts';
import { caminhoDaBase, publicarBase, registrarCarga, removerBasesAntigas } from '../armazenamento/receita.ts';
import { type ArquivoRemoto, arquivosDoMes, baixar, definirConexoes, ultimoMes } from './download.ts';
import { ConjuntoCnpj, ContadorDeContatos } from './estruturas.ts';
import { BaseNova } from './gravacao.ts';
import * as L from './layouts.ts';
import { AJUDA, descreverFiltros, lerOpcoes, OpcaoInvalida, type Opcoes } from './opcoes.ts';
import { aCada, anotar, avisar, fmt, fmtBytes } from './progresso.ts';
import { lerCsvDoZip } from './zip-csv.ts';

const TORTA = Symbol('torta');
/** Devolve a linha convertida, `null` se ficou de fora do filtro, ou TORTA se a linha está malformada. */
type Aceitar = (registro: string[]) => L.Valor[] | null | typeof TORTA;

interface Tarefa {
  arquivo: string;
  tabela: string;
  colunas: readonly string[];
  campos: number;
  aceitar: Aceitar;
}

interface Estatistica {
  arquivo: string;
  lidas: number;
  importadas: number;
  filtradas: number;
  tortas: number;
  exemplo: L.Valor[] | null;
}

interface Contexto {
  opcoes: Opcoes;
  mes: string;
  remotos: Map<string, ArquivoRemoto>;
  base: BaseNova | null;
  estatisticas: Estatistica[];
}

const dez = (prefixo: string) => Array.from({ length: 10 }, (_, i) => `${prefixo}${i}`);

// ---------------------------------------------------------------------------
// Tarefas
// ---------------------------------------------------------------------------

function tarefasDeDominio(): Tarefa[] {
  return [
    { arquivo: 'Cnaes', tabela: 'cnaes', colunas: L.COLUNAS_CNAE, campos: 2, aceitar: r => L.codigoDescricao(r, true) ?? TORTA },
    { arquivo: 'Municipios', tabela: 'municipios', colunas: L.COLUNAS_MUNICIPIO, campos: 2, aceitar: r => L.codigoDescricao(r, true) ?? TORTA },
    { arquivo: 'Naturezas', tabela: 'naturezas', colunas: L.COLUNAS_NATUREZA, campos: 2, aceitar: r => L.codigoDescricao(r, false) ?? TORTA },
  ];
}

function tarefasDeEstabelecimentos(o: Opcoes, importadas: ConjuntoCnpj, contador: ContadorDeContatos): Tarefa[] {
  const { E } = L;
  const aceitar: Aceitar = r => {
    // A contagem de contatos vê todas as matrizes do país, antes de qualquer filtro (ver ContadorDeContatos).
    if (r[E.matrizFilial] === '1') {
      const email = L.email(r[E.email]);
      if (email) contador.adicionar(`email:${email}`);
      const tel1 = L.telefone(r[E.ddd1], r[E.telefone1]);
      if (tel1) contador.adicionar(`telefone:${tel1}`);
      const tel2 = L.telefone(r[E.ddd2], r[E.telefone2]);
      if (tel2 && tel2 !== tel1) contador.adicionar(`telefone:${tel2}`);
    }
    // Filtros no texto bruto, antes de converter: 9 em cada 10 linhas param aqui, e converter custa caro.
    if (!o.situacoes.has(Number(r[E.situacao]))) return null;
    if (o.ufs && !o.ufs.has(r[E.uf]?.trim() ?? '')) return null;
    if (o.desde && !((r[E.dataInicio] ?? '') >= o.desde)) return null;

    const linha = L.estabelecimento(r);
    if (!linha) return TORTA;
    importadas.adicionar(linha[1] as string);
    return linha;
  };
  return dez('Estabelecimentos').map(arquivo => ({ arquivo, tabela: 'estabelecimentos', colunas: L.COLUNAS_ESTABELECIMENTO, campos: L.CAMPOS_ESTABELECIMENTO, aceitar }));
}

function tarefasDeEmpresas(importadas: ConjuntoCnpj): Tarefa[] {
  const filtrar =
    (converter: (r: string[]) => L.Valor[] | null, vistas: ConjuntoCnpj): Aceitar =>
    r => {
      const basico = r[0]?.trim() ?? '';
      if (!/^\d{8}$/.test(basico)) return TORTA;
      // Fora do filtro, ou repetida (o índice único recusaria a base inteira por uma linha).
      if (!importadas.tem(basico) || !vistas.adicionar(basico)) return null;
      return converter(r) ?? TORTA;
    };
  const empresasVistas = new ConjuntoCnpj();
  return [
    ...dez('Empresas').map(arquivo => ({ arquivo, tabela: 'empresas', colunas: L.COLUNAS_EMPRESA, campos: L.CAMPOS_EMPRESA, aceitar: filtrar(L.empresa, empresasVistas) })),
    { arquivo: 'Simples', tabela: 'simples', colunas: L.COLUNAS_SIMPLES, campos: L.CAMPOS_SIMPLES, aceitar: filtrar(L.simples, new ConjuntoCnpj()) },
  ];
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

async function emParalelo<T>(itens: readonly T[], limite: number, fn: (item: T) => Promise<void>): Promise<void> {
  const fila = [...itens];
  let falha: unknown = null;
  const trabalhador = async () => {
    while (fila.length > 0 && falha === null) {
      const item = fila.shift()!;
      try {
        await fn(item);
      } catch (e) {
        falha ??= e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  if (falha !== null) throw falha;
}

async function importar(ctx: Contexto, t: Tarefa): Promise<void> {
  const zip = await baixar(ctx.mes, ctx.remotos.get(t.arquivo)!);
  ctx.base?.preparar(t.tabela, t.colunas);
  const est: Estatistica = { arquivo: t.arquivo, lidas: 0, importadas: 0, filtradas: 0, tortas: 0, exemplo: null };
  const inicio = Date.now();

  let andamento = { lidos: 0, total: 1 };
  const relatar = aCada(30_000, () => anotar(`${t.arquivo}: ${((andamento.lidos / andamento.total) * 100).toFixed(0)}% · ${fmt(est.lidas)} lidas · ${fmt(est.importadas)} importadas`));

  try {
    for await (const registro of lerCsvDoZip(zip, a => {
      andamento = a;
      relatar();
    })) {
      est.lidas++;
      const linha = registro.length === t.campos ? t.aceitar(registro) : TORTA;
      if (linha === null) est.filtradas++;
      else if (linha === TORTA) est.tortas++;
      else {
        ctx.base?.inserir(t.tabela, linha);
        est.exemplo ??= linha;
        est.importadas++;
      }
    }
  } catch (e) {
    throw new Error(`${t.arquivo}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }

  ctx.estatisticas.push(est);
  const segundos = Math.max(1, (Date.now() - inicio) / 1000);
  anotar(
    `${t.arquivo}: ✓ ${fmt(est.importadas)} de ${fmt(est.lidas)} linhas (${fmt(Math.round(est.lidas / segundos))}/s` + (est.tortas ? `, ${fmt(est.tortas)} malformadas ignoradas` : '') + ')',
  );
  if (est.lidas > 0 && est.tortas / est.lidas > 0.001) avisar(`${t.arquivo}: mais de 0,1% de linhas malformadas. O layout da Receita pode ter mudado.`);
  if (!ctx.opcoes.manterZips) await rm(zip, { force: true });
}

function selecionar(o: Opcoes, tarefas: Tarefa[]): Tarefa[] {
  return o.so ? tarefas.filter(t => o.so!.has(t.arquivo)) : tarefas;
}

/** Maiores primeiro, pra que o Estabelecimentos0 (~2 GB, sete vezes os outros) não fique sozinho no fim. */
function maioresPrimeiro(ctx: Contexto, tarefas: Tarefa[]): Tarefa[] {
  return [...tarefas].sort((a, b) => ctx.remotos.get(b.arquivo)!.tamanho - ctx.remotos.get(a.arquivo)!.tamanho);
}

/** Impede duas ingestões ao mesmo tempo (ex.: uma pelo terminal e outra pela tela). */
function travar(): () => void {
  const trava = join(DIRS.receita, '.ingestao.lock');
  try {
    closeSync(openSync(trava, 'wx'));
  } catch {
    const pid = Number(readFileSync(trava, 'utf8'));
    let viva = false;
    try {
      process.kill(pid, 0);
      viva = pid > 0;
    } catch {
      viva = false;
    }
    if (viva) throw new Error(`Já existe uma ingestão rodando (processo ${pid}).`);
  }
  writeFileSync(trava, String(process.pid));
  return () => rmSync(trava, { force: true });
}

function relatorioDeTeste(ctx: Contexto): void {
  anotar('Resumo do teste (nada foi gravado):');
  console.table(ctx.estatisticas.map(e => ({ arquivo: e.arquivo, lidas: e.lidas, importariam: e.importadas, filtradas: e.filtradas, malformadas: e.tortas })));
  for (const e of ctx.estatisticas) if (e.exemplo) console.log(`Exemplo de ${e.arquivo}:`, e.exemplo);
}

async function principal(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--ajuda') || argv.includes('-h')) {
    console.log(AJUDA);
    return;
  }
  const opcoes = lerOpcoes(argv);
  const filtros = descreverFiltros(opcoes);
  definirConexoes(opcoes.conexoes);
  const mes = opcoes.mes ?? (await ultimoMes());
  anotar(`CaçaLead · ingestão da Receita · mês ${mes}${opcoes.teste ? ' · TESTE (não grava)' : ''}`);
  anotar(`Filtros: UFs ${Array.isArray(filtros.ufs) ? filtros.ufs.join(', ') : 'todas'} · abertas desde ${filtros.desde} · situações ${filtros.situacoes.join(', ')}`);

  const ctx: Contexto = { opcoes, mes, remotos: await arquivosDoMes(mes), base: null, estatisticas: [] };
  const importadas = new ConjuntoCnpj();
  const contador = new ContadorDeContatos();
  const dominio = selecionar(opcoes, tarefasDeDominio());
  const estabelecimentos = selecionar(opcoes, tarefasDeEstabelecimentos(opcoes, importadas, contador));
  const empresas = selecionar(opcoes, tarefasDeEmpresas(importadas));

  const todas = [...dominio, ...estabelecimentos, ...empresas];
  const faltando = todas.filter(t => !ctx.remotos.has(t.arquivo)).map(t => t.arquivo);
  if (faltando.length) throw new Error(`Arquivos ausentes na pasta ${mes} da Receita: ${faltando.join(', ')}`);
  anotar(`${todas.length} arquivos, ${fmtBytes(todas.reduce((s, t) => s + ctx.remotos.get(t.arquivo)!.tamanho, 0))} para baixar.`);

  const destravar = travar();
  const inicio = new Date().toISOString();
  const arquivo = `receita-${mes}-${Date.now()}.db`;
  try {
    if (!opcoes.teste) ctx.base = new BaseNova(caminhoDaBase(arquivo));

    anotar('1/4 · Tabelas de domínio (CNAEs, municípios, naturezas)');
    await emParalelo(dominio, opcoes.paralelo, t => importar(ctx, t));

    anotar('2/4 · Estabelecimentos');
    await emParalelo(maioresPrimeiro(ctx, estabelecimentos), opcoes.paralelo, t => importar(ctx, t));
    anotar(`${fmt(importadas.tamanho)} empresas distintas entre os estabelecimentos importados.`);

    anotar('3/4 · Empresas e Simples Nacional');
    await emParalelo(maioresPrimeiro(ctx, empresas), opcoes.paralelo, t => importar(ctx, t));

    if (!ctx.base) {
      relatorioDeTeste(ctx);
      return;
    }

    anotar('4/4 · Contatos compartilhados, índices e troca da base');
    const totalEstabelecimentos = ctx.base.contar('estabelecimentos');
    if (totalEstabelecimentos === 0) throw new Error('Nenhum estabelecimento passou pelos filtros. A base atual foi mantida; revise --ufs e --desde.');
    const totalEmpresas = ctx.base.contar('empresas');
    if (totalEmpresas < importadas.tamanho * 0.99) avisar(`Só ${fmt(totalEmpresas)} de ${fmt(importadas.tamanho)} empresas encontradas nos arquivos Empresas.`);
    const compartilhados = ctx.base.marcarContatosCompartilhados(contador);
    anotar(`  ✓ ${fmt(compartilhados)} e-mails/telefones marcados como compartilhados (provável contador)`);
    ctx.base.definirInfo('mes', mes);
    ctx.base.definirInfo('filtros', filtros);
    ctx.base.finalizar(opcoes.situacoes.size > 1);
    const tamanhoBytes = ctx.base.fechar();

    const totais = { estabelecimentos: totalEstabelecimentos, empresas: totalEmpresas, contatosCompartilhados: compartilhados };
    publicarBase({ arquivo, mes, geradaEm: new Date().toISOString(), filtros, totais, tamanhoBytes });
    removerBasesAntigas();
    registrarCarga({ mes, status: 'concluida', inicio, fim: new Date().toISOString(), filtros, totais });
    anotar(`Pronto: ${fmt(totalEstabelecimentos)} estabelecimentos e ${fmt(totalEmpresas)} empresas no ar (${fmtBytes(tamanhoBytes)}).`);
  } catch (e) {
    ctx.base?.descartar();
    if (!opcoes.teste) registrarCarga({ mes, status: 'falhou', inicio, fim: new Date().toISOString(), filtros, erro: e instanceof Error ? e.message : String(e) });
    throw e;
  } finally {
    destravar();
  }
}

principal().catch((e: unknown) => {
  if (e instanceof OpcaoInvalida) {
    console.error(`Opção inválida: ${e.message}\n${AJUDA}`);
  } else {
    console.error('A ingestão falhou. A base anterior continua no ar.');
    console.error(e);
  }
  process.exit(1);
});
