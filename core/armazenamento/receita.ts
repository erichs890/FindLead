import { appendFileSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIRS } from '../config.ts';

/**
 * Qual base da Receita está no ar.
 *
 * Cada carga grava um arquivo NOVO (receita-AAAA-MM-<carimbo>.db) e só no fim aponta `atual.json` para ele.
 * Trocar o ponteiro, e não o arquivo, é o que deixa a recarga mensal segura: no Windows não dá para
 * sobrescrever um .db que o servidor está lendo, e uma carga que cai na metade não estraga nada — o ponteiro
 * continua na base anterior. O servidor percebe o ponteiro novo, passa a ler a base nova e larga a velha.
 */

export interface BaseInfo {
  /** Nome do arquivo dentro de DIRS.receita. */
  arquivo: string;
  /** Mês de referência da Receita (AAAA-MM). */
  mes: string;
  geradaEm: string;
  filtros: { ufs: string[] | 'todas'; desde: string; situacoes: number[] };
  totais: { estabelecimentos: number; empresas: number; contatosCompartilhados: number };
  tamanhoBytes: number;
}

const PONTEIRO = join(DIRS.receita, 'atual.json');
const HISTORICO = join(DIRS.receita, 'historico.jsonl');

export function caminhoDaBase(arquivo: string): string {
  return join(DIRS.receita, arquivo);
}

export function baseAtual(): BaseInfo | null {
  if (!existsSync(PONTEIRO)) return null;
  try {
    const info = JSON.parse(readFileSync(PONTEIRO, 'utf8')) as BaseInfo;
    return existsSync(caminhoDaBase(info.arquivo)) ? info : null;
  } catch {
    return null;
  }
}

/** Aponta para a base nova. Escreve num temporário e renomeia: quem lê nunca vê um JSON pela metade. */
export function publicarBase(info: BaseInfo): void {
  const temporario = `${PONTEIRO}.tmp`;
  writeFileSync(temporario, JSON.stringify(info, null, 2));
  renameSync(temporario, PONTEIRO);
}

/**
 * Apaga as bases que não são a atual. A que o servidor ainda estiver lendo fica (o Windows não deixa apagar
 * arquivo aberto) e sai na próxima chamada, que o servidor faz depois de largar a base velha.
 */
export function removerBasesAntigas(): void {
  const atual = baseAtual()?.arquivo;
  for (const nome of readdirSync(DIRS.receita)) {
    if (!/^receita-.*\.db(-journal)?$/.test(nome) || nome === atual) continue;
    try {
      rmSync(join(DIRS.receita, nome));
    } catch {
      // em uso; fica para a próxima
    }
  }
}

export function registrarCarga(entrada: { mes: string; status: 'concluida' | 'falhou'; inicio: string; fim: string; filtros: unknown; totais?: unknown; erro?: string }): void {
  appendFileSync(HISTORICO, `${JSON.stringify(entrada)}\n`);
}

export function historicoDeCargas(): unknown[] {
  if (!existsSync(HISTORICO)) return [];
  return readFileSync(HISTORICO, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap(linha => {
      try {
        return [JSON.parse(linha)];
      } catch {
        return [];
      }
    });
}
