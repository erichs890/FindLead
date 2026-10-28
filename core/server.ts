import { once } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { PASTA_DADOS, PORTA } from './config.ts';
import { kv, leads, notas } from './armazenamento/crm.ts';
import { baseNoAr, SemBase } from './base.ts';
import { ErroBrasilApi, enriquecer, guardado } from './brasilapi.ts';
import { aberturaMaisRecente, buscar, cnaes, dadosDaBase, lerFiltros, municipios, nomeDoMunicipio, paraExportar, semanasNaRegiao } from './busca.ts';
import { type DetalheLead, type EstadoBase, type Painel, type Preferencias, STATUS, type SnapshotLead, type StatusLead } from '../src/tipos.ts';

const MENSAGEM_PADRAO =
  'Olá! Tudo bem? Vi que a {empresa} abriu há pouco tempo em {cidade}. Parabéns pelo novo negócio! ' +
  'Meu nome é {meu_nome} e eu crio sites para empresas da região. Posso te mostrar, sem compromisso, uma ideia de como ficaria o site de vocês?';

function preferencias(): Preferencias {
  return { uf: null, municipio: null, seuNome: '', mensagemWhatsapp: MENSAGEM_PADRAO, ...kv.get<Partial<Preferencias>>('preferencias', {}) };
}

class ErroDePedido extends Error {
  readonly status: number;
  constructor(mensagem: string, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

function json(res: ServerResponse, status: number, corpo: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

async function lerCorpo<T>(req: IncomingMessage): Promise<T> {
  let texto = '';
  for await (const pedaco of req) {
    texto += pedaco;
    if (texto.length > 64 * 1024) throw new ErroDePedido('Pedido grande demais.', 413);
  }
  try {
    return (texto ? JSON.parse(texto) : {}) as T;
  } catch {
    throw new ErroDePedido('JSON inválido.');
  }
}

function cnpjDa(rota: string): string {
  const cnpj = /^\/api\/lead\/(\d{14})/.exec(rota)?.[1];
  if (!cnpj) throw new ErroDePedido('CNPJ inválido.');
  return cnpj;
}

/** O detalhe junta três fontes: a base do mês, o seu CRM e o cache da BrasilAPI. */
function detalhe(cnpj: string): DetalheLead {
  const base = baseNoAr() ? dadosDaBase(cnpj) : null;
  const lead = leads.obter(cnpj) ?? null;
  if (!base && !lead) throw new ErroDePedido('Este CNPJ não está na base nem nos seus leads.', 404);
  const s = lead?.snapshot;
  const daBase = base ?? {
    cnpj, nomeFantasia: s?.nomeFantasia ?? null, razaoSocial: s?.razaoSocial ?? null, uf: s?.uf ?? null, municipio: s?.municipio ?? null,
    cnae: null, cnaeDescricao: null, abertura: null, telefone: null, telefone2: null, email: null, emailDeContador: false, telefoneDeContador: false,
    porte: null, mei: false, status: lead?.status ?? null, noBanco: false, matriz: false, situacao: null, dataSituacao: null, endereco: null,
    cep: null, cnaesSecundarios: [], naturezaJuridica: null, capitalSocial: null, simples: null,
  };
  return { ...daBase, status: lead?.status ?? null, lead, notas: lead ? notas.listar(cnpj) : [], enriquecimento: guardado(cnpj) };
}

/** Garante que o lead existe no CRM antes de mexer nele, fotografando os dados da base nesse momento. */
function garantirLead(cnpj: string) {
  const existente = leads.obter(cnpj);
  if (existente) return existente;
  const base = baseNoAr() ? dadosDaBase(cnpj) : null;
  if (!base) throw new ErroDePedido('Este CNPJ não está na base.', 404);
  const snapshot: SnapshotLead = { razaoSocial: base.razaoSocial, nomeFantasia: base.nomeFantasia, municipio: base.municipio, uf: base.uf };
  return leads.garantir(cnpj, snapshot);
}

const campoCsv = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const cnpjFormatado = (c: string) => `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
const PORTE_CSV: Record<number, string> = { 1: 'Microempresa', 3: 'Pequeno porte', 5: 'Demais' };

/**
 * CSV no formato que o Excel brasileiro abre direto (BOM + ";"). Sem sócios: são dados pessoais, ficam só na
 * tela, para consulta pontual. Sai em fluxo, linha a linha, respeitando o ritmo de quem baixa.
 */
async function exportar(res: ServerResponse, url: URL): Promise<void> {
  const itens = paraExportar(lerFiltros(url.searchParams));
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="cacalead-${new Date().toISOString().slice(0, 10)}.csv"`,
  });
  const cabecalho = ['CNPJ', 'Razão social', 'Nome fantasia', 'Município', 'UF', 'CNAE', 'Atividade', 'Abertura', 'Telefone', 'Telefone 2', 'E-mail', 'Contato de contador', 'Porte', 'Status'];
  let bloco = `﻿${cabecalho.join(';')}\r\n`;
  for (const i of itens) {
    const contador = [i.emailDeContador && 'e-mail', i.telefoneDeContador && 'telefone'].filter(Boolean).join(' e ');
    bloco += `${[cnpjFormatado(i.cnpj), i.razaoSocial, i.nomeFantasia, i.municipio, i.uf, i.cnae, i.cnaeDescricao, i.abertura, i.telefone, i.telefone2, i.email, contador, i.mei ? 'MEI' : i.porte ? PORTE_CSV[i.porte] : '', i.status ?? ''].map(campoCsv).join(';')}\r\n`;
    if (bloco.length > 64 * 1024) {
      if (!res.write(bloco)) await once(res, 'drain');
      bloco = '';
    }
  }
  res.end(bloco);
}

function estado(): EstadoBase {
  const base = baseNoAr();
  return {
    base: base ? { mes: base.mes, geradaEm: base.geradaEm, filtros: base.filtros, totais: base.totais, tamanhoBytes: base.tamanhoBytes } : null,
    aberturaMaisRecente: base ? aberturaMaisRecente() : null,
    pastaDados: PASTA_DADOS,
  };
}

function painel(): Painel {
  const p = preferencias();
  const regiao = p.municipio ? `${p.municipio.nome}/${p.municipio.uf ?? p.uf ?? ''}` : p.uf ? p.uf : 'todas as UFs da base';
  return {
    porStatus: leads.contagemPorStatus(),
    naoContatar: leads.totalNaoContatar(),
    regiao,
    semanas: baseNoAr() ? semanasNaRegiao(p.uf, p.municipio?.codigo ?? null, 8) : [],
  };
}

async function salvarPreferencias(req: IncomingMessage): Promise<Preferencias> {
  const corpo = await lerCorpo<Partial<Preferencias>>(req);
  const atual = preferencias();
  const uf = corpo.uf === undefined ? atual.uf : corpo.uf && /^[A-Z]{2}$/.test(corpo.uf) ? corpo.uf : null;
  let municipio = corpo.municipio === undefined ? atual.municipio : null;
  if (corpo.municipio?.codigo) municipio = baseNoAr() ? nomeDoMunicipio(corpo.municipio.codigo) : corpo.municipio;
  const nova: Preferencias = {
    uf,
    municipio: municipio && (!uf || !municipio.uf || municipio.uf === uf) ? municipio : null,
    seuNome: typeof corpo.seuNome === 'string' ? corpo.seuNome.trim().slice(0, 80) : atual.seuNome,
    mensagemWhatsapp: typeof corpo.mensagemWhatsapp === 'string' && corpo.mensagemWhatsapp.trim() ? corpo.mensagemWhatsapp.slice(0, 2000) : atual.mensagemWhatsapp,
  };
  kv.set('preferencias', nova);
  return nova;
}

async function rotear(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const rota = url.pathname;
  const metodo = req.method ?? 'GET';

  if (metodo === 'GET' && rota === '/api/estado') return json(res, 200, estado());
  if (metodo === 'GET' && rota === '/api/busca') return json(res, 200, buscar(lerFiltros(url.searchParams), url.searchParams.get('cursor')));
  if (metodo === 'GET' && rota === '/api/exportar.csv') return exportar(res, url);
  if (metodo === 'GET' && rota === '/api/cnaes') return json(res, 200, cnaes(url.searchParams.get('q') ?? ''));
  if (metodo === 'GET' && rota === '/api/municipios') return json(res, 200, municipios(url.searchParams.get('q') ?? '', url.searchParams.get('uf')));
  if (metodo === 'GET' && rota === '/api/painel') return json(res, 200, painel());
  if (metodo === 'GET' && rota === '/api/preferencias') return json(res, 200, preferencias());
  if (metodo === 'PUT' && rota === '/api/preferencias') return json(res, 200, await salvarPreferencias(req));

  if (metodo === 'GET' && rota === '/api/leads') {
    const status = url.searchParams.get('status');
    return json(res, 200, leads.listar({ status: STATUS.includes(status as StatusLead) ? (status as StatusLead) : undefined, naoContatar: url.searchParams.get('naoContatar') === '1' }));
  }

  if (rota.startsWith('/api/lead/')) {
    const cnpj = cnpjDa(rota);
    if (metodo === 'GET' && rota === `/api/lead/${cnpj}`) return json(res, 200, detalhe(cnpj));
    if (metodo === 'POST' && rota === `/api/lead/${cnpj}/enriquecer`) return json(res, 200, await enriquecer(cnpj));
    if (metodo === 'PATCH' && rota === `/api/lead/${cnpj}`) {
      const corpo = await lerCorpo<{ status?: string; naoContatar?: boolean }>(req);
      if (corpo.status !== undefined && !STATUS.includes(corpo.status as StatusLead)) throw new ErroDePedido('Status inválido.');
      garantirLead(cnpj);
      if (corpo.status) leads.definirStatus(cnpj, corpo.status as StatusLead);
      if (typeof corpo.naoContatar === 'boolean') leads.definirNaoContatar(cnpj, corpo.naoContatar);
      return json(res, 200, detalhe(cnpj));
    }
    if (metodo === 'POST' && rota === `/api/lead/${cnpj}/notas`) {
      const { texto } = await lerCorpo<{ texto?: string }>(req);
      const limpo = texto?.trim() ?? '';
      if (!limpo || limpo.length > 5000) throw new ErroDePedido('A nota precisa ter de 1 a 5.000 caracteres.');
      garantirLead(cnpj);
      notas.adicionar(cnpj, limpo);
      return json(res, 200, detalhe(cnpj));
    }
  }

  const nota = /^\/api\/notas\/(\d+)$/.exec(rota);
  if (metodo === 'DELETE' && nota) {
    notas.apagar(Number(nota[1]));
    return json(res, 200, { ok: true });
  }

  json(res, 404, { erro: 'Rota não encontrada.' });
}

const servidor = createServer((req, res) => {
  rotear(req, res).catch((e: unknown) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (e instanceof SemBase) return json(res, 409, { erro: e.message, semBase: true });
    if (e instanceof ErroDePedido || e instanceof ErroBrasilApi) return json(res, e.status, { erro: e.message });
    console.error(e);
    json(res, 500, { erro: 'Erro inesperado no servidor. Veja a janela do servidor para detalhes.' });
  });
});

// Só na máquina local: nada de expor os seus leads para a rede.
servidor.listen(PORTA, '127.0.0.1', () => {
  const base = baseNoAr();
  console.log(`CaçaLead · servidor em http://localhost:${PORTA}`);
  console.log(base ? `Base da Receita: ${base.mes} · ${base.totais.estabelecimentos.toLocaleString('pt-BR')} estabelecimentos` : 'Nenhuma base da Receita ainda: rode atualizar-base.bat.');
});
