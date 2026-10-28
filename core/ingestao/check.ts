/**
 * Verificações da ingestão que não precisam de rede: conversões das linhas da Receita, as estruturas de memória
 * e uma base montada de ponta a ponta numa pasta temporária. `npm run check`.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ConjuntoCnpj, ContadorDeContatos } from './estruturas.ts';
import { BaseNova } from './gravacao.ts';
import * as L from './layouts.ts';

let total = 0;
function verificar(nome: string, fn: () => void): void {
  fn();
  total++;
  console.log(`  ✓ ${nome}`);
}

console.log('Conversões');
verificar('data válida', () => assert.equal(L.data('20240315'), '2024-03-15'));
verificar('data zerada vira null', () => assert.equal(L.data('00000000'), null));
verificar('data impossível vira null (a Receita publica 31/02)', () => assert.equal(L.data('20230231'), null));
verificar('29/02 só em ano bissexto', () => {
  assert.equal(L.data('20240229'), '2024-02-29');
  assert.equal(L.data('20230229'), null);
});
verificar('telefone junta DDD e número', () => assert.equal(L.telefone('11', '987654321'), '11987654321'));
verificar('telefone com DDD com zero à esquerda', () => assert.equal(L.telefone('011', '33334444'), '1133334444'));
verificar('celular de 8 dígitos ganha o nono dígito (a Receita corta)', () => assert.equal(L.telefone('11', '94709964'), '11994709964'));
verificar('fixo de 8 dígitos fica como está', () => assert.equal(L.telefone('11', '32315631'), '1132315631'));
verificar('telefone sem número vira null', () => assert.equal(L.telefone('11', ''), null));
verificar('telefone zerado vira null', () => assert.equal(L.telefone('11', '00000000'), null));
verificar('e-mail em minúsculas', () => assert.equal(L.email(' Contato@Empresa.COM.br '), 'contato@empresa.com.br'));
verificar('e-mail sem @ vira null', () => assert.equal(L.email('nao tem'), null));
verificar('busca sem acento', () => assert.equal(L.paraBusca('Desenvolvimento de  Programas São'), 'desenvolvimento de programas sao'));

const linhaEstabelecimento = (sobrescrever: Partial<Record<keyof typeof L.E, string>> = {}): string[] => {
  const r = Array.from({ length: L.CAMPOS_ESTABELECIMENTO }, () => '');
  const base: Partial<Record<keyof typeof L.E, string>> = {
    cnpjBasico: '12345678', cnpjOrdem: '0001', cnpjDv: '95', matrizFilial: '1', nomeFantasia: 'PADARIA BOA',
    situacao: '02', dataInicio: '20250110', cnaePrincipal: '1091102', cnaesSecundarios: '4721102,4712100',
    uf: 'SP', municipio: '7107', ddd1: '11', telefone1: '33334444', email: 'X@Y.COM',
  };
  for (const [k, v] of Object.entries({ ...base, ...sobrescrever })) r[L.E[k as keyof typeof L.E]] = v ?? '';
  return r;
};

verificar('estabelecimento completo', () => {
  const v = L.estabelecimento(linhaEstabelecimento())!;
  assert.equal(v[0], '12345678000195');
  assert.equal(v[2], 1);
  assert.equal(v[4], 2);
  assert.equal(v[7], '2025-01-10');
  assert.equal(v[9], '4721102,4712100');
  assert.equal(v[18], '1133334444');
  assert.equal(v[20], 'x@y.com');
  assert.equal(v.length, L.COLUNAS_ESTABELECIMENTO.length);
});
verificar('estabelecimento com CNPJ torto é recusado', () => assert.equal(L.estabelecimento(linhaEstabelecimento({ cnpjBasico: '1234' })), null));
verificar('empresa: capital com vírgula decimal', () => assert.deepEqual(L.empresa(['12345678', 'PADARIA BOA LTDA', '2062', '16', '10000,50', '01', '']), ['12345678', 'PADARIA BOA LTDA', 2062, 10000.5, 1]));
verificar('simples: S/N vira 1/0', () => assert.deepEqual(L.simples(['12345678', 'S', '20250110', '00000000', 'N', '', '']), ['12345678', 1, '2025-01-10', null, 0, null, null]));

console.log('Estruturas');
verificar('conjunto de CNPJ guarda e recusa repetido', () => {
  const c = new ConjuntoCnpj();
  assert.equal(c.adicionar('00000000'), true);
  assert.equal(c.adicionar('99999999'), true);
  assert.equal(c.adicionar('00000000'), false);
  assert.equal(c.tem('99999999'), true);
  assert.equal(c.tem('12345678'), false);
  assert.equal(c.tamanho, 2);
});
verificar('contador nunca subestima', () => {
  const c = new ContadorDeContatos();
  for (let i = 0; i < 7; i++) c.adicionar('email:contador@escritorio.com');
  c.adicionar('email:dono@padaria.com');
  assert.ok(c.contar('email:contador@escritorio.com') >= 7);
  assert.ok(c.contar('email:dono@padaria.com') >= 1);
});

console.log('Base de ponta a ponta');
const pasta = mkdtempSync(join(tmpdir(), 'cacalead-check-'));
try {
  verificar('monta, indexa, marca contador e fecha', () => {
    const caminho = join(pasta, 'receita-teste.db');
    const base = new BaseNova(caminho);
    const contador = new ContadorDeContatos();
    base.preparar('estabelecimentos', L.COLUNAS_ESTABELECIMENTO);
    base.preparar('municipios', L.COLUNAS_MUNICIPIO);
    base.inserir('municipios', L.codigoDescricao(['7107', 'SAO PAULO'], true)!);
    for (let i = 0; i < 6; i++) {
      const r = linhaEstabelecimento({ cnpjBasico: String(10000000 + i), email: 'fiscal@contabil.com.br' });
      contador.adicionar(`email:${L.email(r[L.E.email])}`);
      base.inserir('estabelecimentos', L.estabelecimento(r)!);
    }
    assert.equal(base.marcarContatosCompartilhados(contador), 1);
    base.finalizar(false);
    assert.ok(base.fechar() > 0);

    const db = new DatabaseSync(caminho, { readOnly: true });
    assert.equal((db.prepare('select uf from municipios where codigo = 7107').get() as { uf: string }).uf, 'SP');
    assert.equal((db.prepare('select count(*) as n from contatos_compartilhados').get() as { n: number }).n, 1);
    const plano = db.prepare("explain query plan select cnpj from estabelecimentos where uf = 'SP' and municipio_codigo = 7107 order by data_inicio_atividade desc").all() as { detail: string }[];
    assert.ok(plano.some(p => p.detail.includes('estabelecimentos_uf_municipio_data')), 'a busca por cidade tem que usar o índice');
    db.close();
  });
  verificar('CNPJ repetido nos arquivos não derruba a carga', () => {
    const base = new BaseNova(join(pasta, 'receita-repetido.db'));
    base.preparar('estabelecimentos', L.COLUNAS_ESTABELECIMENTO);
    base.inserir('estabelecimentos', L.estabelecimento(linhaEstabelecimento())!);
    base.inserir('estabelecimentos', L.estabelecimento(linhaEstabelecimento({ nomeFantasia: 'NOME NOVO' }))!);
    base.finalizar(false);
    assert.equal(base.contar('estabelecimentos'), 1);
    base.fechar();
  });
} finally {
  rmSync(pasta, { recursive: true, force: true });
}

console.log('CRM');
const pastaCrm = mkdtempSync(join(tmpdir(), 'cacalead-crm-'));
// O CRM abre o arquivo na importação, a partir de CACALEAD_DIR: por isso a importação dinâmica depois de definir.
process.env.CACALEAD_DIR = pastaCrm;
const crm = await import('../armazenamento/crm.ts');
try {
  const snapshot = { razaoSocial: 'PADARIA BOA LTDA', nomeFantasia: 'PADARIA BOA', municipio: 'SAO PAULO', uf: 'SP' };
  verificar('lead novo entra como "novo" e guarda o snapshot', () => {
    const l = crm.leads.garantir('12345678000195', snapshot);
    assert.equal(l.status, 'novo');
    assert.equal(l.snapshot.nomeFantasia, 'PADARIA BOA');
  });
  verificar('garantir de novo não sobrescreve o snapshot', () => {
    crm.leads.garantir('12345678000195', { ...snapshot, nomeFantasia: 'OUTRO NOME' });
    assert.equal(crm.leads.obter('12345678000195')!.snapshot.nomeFantasia, 'PADARIA BOA');
  });
  verificar('opt-out marca a data e sai da contagem do painel', () => {
    crm.leads.definirStatus('12345678000195', 'contatado');
    crm.leads.definirNaoContatar('12345678000195', true);
    assert.ok(crm.leads.obter('12345678000195')!.naoContatarEm);
    assert.equal(crm.leads.contagemPorStatus().contatado, 0);
  });
  verificar('notas apagam junto com o lead (foreign key)', () => {
    crm.notas.adicionar('12345678000195', 'Ligou de volta, quer orçamento');
    assert.equal(crm.notas.listar('12345678000195').length, 1);
    crm.db.prepare('delete from leads where cnpj = ?').run('12345678000195');
    assert.equal(crm.notas.listar('12345678000195').length, 0);
  });
  verificar('cache da BrasilAPI respeita a validade', () => {
    crm.enriquecimentos.salvar('12345678000195', { ok: true });
    assert.ok(crm.enriquecimentos.recente('12345678000195', 60_000));
    crm.db.prepare('update enriquecimentos set consultado_em = ?').run(new Date(Date.now() - 25 * 3_600_000).toISOString());
    assert.equal(crm.enriquecimentos.recente('12345678000195', 24 * 3_600_000), undefined);
  });
} finally {
  crm.db.close();
  rmSync(pastaCrm, { recursive: true, force: true });
}

console.log(`\n${total} verificações passaram.`);
