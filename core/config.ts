import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// CACALEAD_PORTA / CACALEAD_DIR: só para rodar uma segunda instância (testes) sem tocar nos dados de uso real
export const PORTA = Number(process.env.CACALEAD_PORTA) || 4790;

const BASE = process.env.LOCALAPPDATA ?? homedir();
export const PASTA_DADOS = process.env.CACALEAD_DIR ?? join(BASE, 'CacaLead');

export const DIRS = {
  /** Bases da Receita, uma por carga: receita-AAAA-MM-<carimbo>.db */
  receita: join(PASTA_DADOS, 'receita'),
  /** ZIPs baixados da Receita. Apagados depois de importados, salvo --manter-zips. */
  downloads: join(PASTA_DADOS, 'downloads'),
};

/** Seus dados: status dos leads, notas, opt-out, cache da BrasilAPI. Nunca é apagado pela ingestão. */
export const CRM_PATH = join(PASTA_DADOS, 'crm.db');

for (const dir of Object.values(DIRS)) mkdirSync(dir, { recursive: true });
