import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parse } from 'csv-parse';
import iconv from 'iconv-lite';
import yauzl from 'yauzl';

function abrirZip(arquivo: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(arquivo, { lazyEntries: true, autoClose: true }, (err, zip) => (err ? reject(err) : resolve(zip)));
  });
}

/** Abre o único arquivo de dados de um ZIP da Receita (alguns passam de 4 GB descompactados: zip64). */
async function abrirConteudo(arquivo: string): Promise<{ fluxo: Readable; tamanho: number }> {
  const zip = await abrirZip(arquivo);
  return new Promise((resolve, reject) => {
    zip.on('error', reject);
    zip.on('end', () => reject(new Error(`${arquivo} não contém nenhum arquivo`)));
    zip.on('entry', (entrada: yauzl.Entry) => {
      if (entrada.fileName.endsWith('/')) {
        zip.readEntry();
        return;
      }
      zip.openReadStream(entrada, (err, fluxo) => (err ? reject(err) : resolve({ fluxo, tamanho: entrada.uncompressedSize })));
    });
    zip.readEntry();
  });
}

export interface Andamento {
  lidos: number;
  total: number;
}

/**
 * Lê o CSV de dentro do ZIP sem descompactar no disco: ZIP → windows-1252 → UTF-8 → registros separados por ";".
 *
 * Os arquivos dizem ser latin1, mas trazem caracteres da faixa 0x80–0x9F (aspas curvas, travessão) que só o
 * windows-1252 decodifica; em latin1 eles viram caracteres de controle invisíveis no nome da empresa.
 * `relax_quotes`/`relax_column_count` existem porque a Receita publica linhas com aspas soltas dentro do campo;
 * quem chama confere o número de colunas e descarta a linha torta em vez de derrubar o arquivo inteiro.
 */
export async function* lerCsvDoZip(arquivo: string, aoAndar?: (a: Andamento) => void): AsyncGenerator<string[]> {
  const { fluxo, tamanho } = await abrirConteudo(arquivo);
  const andamento: Andamento = { lidos: 0, total: tamanho };
  if (aoAndar) {
    fluxo.on('data', (pedaco: Buffer) => {
      andamento.lidos += pedaco.length;
      aoAndar(andamento);
    });
  }

  const leitor = parse({ delimiter: ';', quote: '"', relax_quotes: true, relax_column_count: true, skip_empty_lines: true });
  const fim = pipeline(fluxo, iconv.decodeStream('win1252'), leitor);
  // Se o consumidor parar no meio, o erro chega pelo iterador; isto só evita o "unhandled rejection".
  fim.catch(() => {});

  try {
    for await (const registro of leitor) yield registro as string[];
    await fim;
  } finally {
    fluxo.destroy();
  }
}
