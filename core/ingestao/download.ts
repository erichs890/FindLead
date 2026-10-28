import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { DIRS } from '../config.ts';
import { TOKEN_COMPARTILHAMENTO, WEBDAV_URL } from './opcoes.ts';
import { aCada, anotar, avisar, fmtBytes } from './progresso.ts';

/**
 * Cliente do compartilhamento público da Receita (Nextcloud/WebDAV do SERPRO).
 *
 * Até 2024 os arquivos ficavam em arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/, que hoje
 * responde 404. Agora é um compartilhamento Nextcloud (index.php/s/<token>) com uma pasta AAAA-MM por mês, e o
 * WebDAV público dele (`public.php/webdav`, usuário = token, senha vazia) é a forma estável de listar e baixar.
 */

export interface ArquivoRemoto {
  nome: string;
  tamanho: number;
}

const TENTATIVAS = 6;
const AUTORIZACAO = `Basic ${Buffer.from(`${TOKEN_COMPARTILHAMENTO}:`).toString('base64')}`;

const esperar = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const espera = (tentativa: number) => Math.min(60_000, 2_000 * 2 ** (tentativa - 1)) + Math.floor(Math.random() * 1_000);
const erro = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function listar(pasta: string): Promise<{ href: string; tamanho: number | null }[]> {
  const url = `${WEBDAV_URL}/${pasta}`;
  for (let tentativa = 1; ; tentativa++) {
    try {
      const res = await fetch(url, { method: 'PROPFIND', headers: { Authorization: AUTORIZACAO, Depth: '1' }, signal: AbortSignal.timeout(60_000) });
      if (res.status !== 207) throw new Error(`a Receita respondeu ${res.status}`);
      const xml = await res.text();
      return xml
        .split(/<(?:\w+:)?response>/)
        .slice(1)
        .flatMap(bloco => {
          const href = /<(?:\w+:)?href>([^<]+)<\/(?:\w+:)?href>/.exec(bloco)?.[1];
          const tamanho = /<(?:\w+:)?getcontentlength>(\d+)<\/(?:\w+:)?getcontentlength>/.exec(bloco)?.[1];
          return href ? [{ href: decodeURIComponent(href), tamanho: tamanho ? Number(tamanho) : null }] : [];
        });
    } catch (e) {
      if (tentativa >= TENTATIVAS) throw new Error(`Não foi possível listar ${url}: ${erro(e)}`);
      avisar(`Falha ao listar ${url} (${erro(e)}); tentando de novo.`);
      await esperar(espera(tentativa));
    }
  }
}

export async function ultimoMes(): Promise<string> {
  const meses = (await listar(''))
    .map(e => /\/(\d{4}-\d{2})\/$/.exec(e.href)?.[1])
    .filter((m): m is string => Boolean(m))
    .sort();
  const ultimo = meses.at(-1);
  if (!ultimo) throw new Error('Nenhuma pasta AAAA-MM encontrada no compartilhamento da Receita.');
  return ultimo;
}

/** Arquivos do mês, pelo nome sem ".zip" (ex.: "Estabelecimentos0"). */
export async function arquivosDoMes(mes: string): Promise<Map<string, ArquivoRemoto>> {
  const arquivos = new Map<string, ArquivoRemoto>();
  for (const e of await listar(`${mes}/`)) {
    const nome = e.href.split('/').filter(Boolean).at(-1);
    if (nome?.toLowerCase().endsWith('.zip') && e.tamanho !== null) arquivos.set(nome.replace(/\.zip$/i, ''), { nome, tamanho: e.tamanho });
  }
  if (arquivos.size === 0) throw new Error(`A pasta ${mes} da Receita está vazia ou inacessível.`);
  return arquivos;
}

async function tamanhoLocal(arquivo: string): Promise<number> {
  try {
    return (await stat(arquivo)).size;
  } catch {
    return 0;
  }
}

/**
 * Limite de conexões simultâneas com a Receita, somando todos os arquivos.
 *
 * O servidor entrega uns 300 KB/s a 1 MB/s POR CONEXÃO (medido em 27/10/2026), e a vazão soma com conexões em
 * paralelo. Numa conexão só, o Estabelecimentos0 (2,3 GB) levaria mais de uma hora sozinho. Seis é o meio-termo
 * entre terminar em tempo razoável e não martelar um servidor público.
 */
let conexoesLivres = 6;
const aguardandoConexao: (() => void)[] = [];

export function definirConexoes(n: number): void {
  conexoesLivres = n;
}

async function comConexao<T>(fn: () => Promise<T>): Promise<T> {
  if (conexoesLivres > 0) conexoesLivres--;
  else await new Promise<void>(resolve => aguardandoConexao.push(resolve));
  try {
    return await fn();
  } finally {
    const proximo = aguardandoConexao.shift();
    if (proximo) proximo();
    else conexoesLivres++;
  }
}

const TAMANHO_DO_PEDACO = 64 * 1024 ** 2;

/** Baixa os bytes [inicio, fim] para `parcial`, retomando do que já existe nele. */
async function baixarPedaco(url: string, rotulo: string, parcial: string, inicio: number, fim: number, aoReceber: (bytes: number) => void): Promise<void> {
  const esperado = fim - inicio + 1;
  for (let tentativa = 1; ; tentativa++) {
    const jaTem = await tamanhoLocal(parcial);
    if (jaTem === esperado) return;
    if (jaTem > esperado) await rm(parcial);
    try {
      await comConexao(async () => {
        const offset = jaTem > esperado ? 0 : jaTem;
        const res = await fetch(url, {
          headers: { Authorization: AUTORIZACAO, Range: `bytes=${inicio + offset}-${fim}` },
          signal: AbortSignal.timeout(60 * 60_000),
        });
        if (res.status !== 206) throw new Error(`a Receita respondeu ${res.status} a um pedido parcial`);
        if (!res.body) throw new Error('resposta sem corpo');
        const corpo = Readable.fromWeb(res.body as WebReadableStream<Uint8Array>);
        corpo.on('data', (pedaco: Buffer) => aoReceber(pedaco.length));
        await pipeline(corpo, createWriteStream(parcial, { flags: offset > 0 ? 'a' : 'w' }));
      });
      const tamanho = await tamanhoLocal(parcial);
      if (tamanho !== esperado) throw new Error(`pedaço incompleto (${tamanho} de ${esperado} bytes)`);
      return;
    } catch (e) {
      if (tentativa >= TENTATIVAS) throw new Error(`Não foi possível baixar ${rotulo}: ${erro(e)}`);
      const ms = espera(tentativa);
      avisar(`${rotulo}: ${erro(e)}. Nova tentativa em ${Math.round(ms / 1000)} s.`);
      await esperar(ms);
    }
  }
}

/**
 * Baixa um ZIP do mês em pedaços de 64 MB (HTTP Range), vários ao mesmo tempo, e junta no fim.
 * Pedaço já completo é pulado e pedaço pela metade é retomado: o servidor da Receita derruba conexões longas, e
 * recomeçar um arquivo de 2 GB do zero a cada queda não termina nunca.
 */
export async function baixar(mes: string, arquivo: ArquivoRemoto): Promise<string> {
  const pasta = join(DIRS.downloads, mes);
  await mkdir(pasta, { recursive: true });
  const destino = join(pasta, arquivo.nome);

  if ((await tamanhoLocal(destino)) === arquivo.tamanho) {
    anotar(`${arquivo.nome}: já baixado (${fmtBytes(arquivo.tamanho)})`);
    return destino;
  }

  const url = `${WEBDAV_URL}/${mes}/${encodeURIComponent(arquivo.nome)}`;
  const quantos = Math.max(1, Math.ceil(arquivo.tamanho / TAMANHO_DO_PEDACO));
  const pedacos = Array.from({ length: quantos }, (_, i) => ({
    caminho: `${destino}.parte${String(i).padStart(3, '0')}`,
    inicio: i * TAMANHO_DO_PEDACO,
    fim: Math.min(arquivo.tamanho, (i + 1) * TAMANHO_DO_PEDACO) - 1,
  }));

  let recebido = 0;
  for (const p of pedacos) recebido += Math.min(await tamanhoLocal(p.caminho), p.fim - p.inicio + 1);
  const relatar = aCada(20_000, () => anotar(`${arquivo.nome}: ${fmtBytes(recebido)} de ${fmtBytes(arquivo.tamanho)} (${((recebido / arquivo.tamanho) * 100).toFixed(0)}%)`));
  const inicio = Date.now();

  await Promise.all(
    pedacos.map(p =>
      baixarPedaco(url, arquivo.nome, p.caminho, p.inicio, p.fim, bytes => {
        recebido += bytes;
        relatar();
      }),
    ),
  );

  const juntando = `${destino}.juntando`;
  await pipeline(async function* () {
    for (const p of pedacos) yield* createReadStream(p.caminho);
  }, createWriteStream(juntando));
  const tamanho = await tamanhoLocal(juntando);
  if (tamanho !== arquivo.tamanho) throw new Error(`${arquivo.nome}: arquivo montado com ${tamanho} de ${arquivo.tamanho} bytes`);
  await rename(juntando, destino);
  await Promise.all(pedacos.map(p => rm(p.caminho, { force: true })));

  const segundos = Math.max(1, (Date.now() - inicio) / 1000);
  anotar(`${arquivo.nome}: baixado (${fmtBytes(arquivo.tamanho)}, ${fmtBytes(arquivo.tamanho / segundos)}/s)`);
  return destino;
}
