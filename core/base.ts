import { db } from './armazenamento/crm.ts';
import { type BaseInfo, baseAtual, caminhoDaBase, removerBasesAntigas } from './armazenamento/receita.ts';

/**
 * A base da Receita fica ANEXADA à conexão do CRM (`attach ... as rf`), para que uma consulta só cruze as
 * empresas com o que você já fez com elas — status na lista, opt-out escondendo da busca — sem duas idas ao disco.
 *
 * A cada pedido confere o ponteiro `atual.json`: se a ingestão publicou uma base nova, troca o anexo na hora,
 * sem reiniciar o servidor, e apaga a base velha (que só agora deixou de estar aberta).
 */
let anexada: string | null = null;

export function baseNoAr(): BaseInfo | null {
  const info = baseAtual();
  if (info?.arquivo === anexada) return info;

  if (anexada) {
    db.exec('detach database rf');
    anexada = null;
  }
  if (!info) return null;
  db.prepare('attach database ? as rf').run(caminhoDaBase(info.arquivo));
  anexada = info.arquivo;
  removerBasesAntigas();
  return info;
}

export class SemBase extends Error {
  constructor() {
    super('Nenhuma base da Receita carregada ainda. Rode atualizar-base.bat (ou npm run ingestao) uma vez.');
  }
}

/** Para as rotas que precisam da base: garante o anexo ou responde que falta carregar. */
export function exigirBase(): BaseInfo {
  const info = baseNoAr();
  if (!info) throw new SemBase();
  return info;
}
