import { Check, Database, FolderOpen } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { Autocompletar } from '../componentes/Autocompletar.tsx';
import { useApp } from '../contexto.tsx';
import { botaoPrimario, campo, cartao, rotulo } from '../estilos.ts';
import { fmtData, fmtMesAno, fmtNumero } from '../formato.ts';
import { SITUACOES, type Opcao } from '../tipos.ts';
import { UFS } from '../ufs.ts';

const VARIAVEIS = [
  { nome: '{empresa}', o: 'nome da empresa' },
  { nome: '{cidade}', o: 'cidade dela' },
  { nome: '{meu_nome}', o: 'o seu nome, abaixo' },
];

export function Ajustes() {
  const { estado, preferencias, salvarPreferencias, avisar } = useApp();
  const [uf, setUf] = useState('');
  const [municipio, setMunicipio] = useState<Opcao | null>(null);
  const [seuNome, setSeuNome] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    if (!preferencias) return;
    setUf(preferencias.uf ?? '');
    setMunicipio(preferencias.municipio);
    setSeuNome(preferencias.seuNome);
    setMensagem(preferencias.mensagemWhatsapp);
  }, [preferencias]);

  const mudou =
    !!preferencias &&
    (uf !== (preferencias.uf ?? '') || municipio?.codigo !== preferencias.municipio?.codigo || seuNome !== preferencias.seuNome || mensagem !== preferencias.mensagemWhatsapp);

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarPreferencias({ uf: uf || null, municipio, seuNome, mensagemWhatsapp: mensagem });
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2000);
    } catch (e) {
      avisar((e as Error).message, { tipo: 'erro' });
    } finally {
      setSalvando(false);
    }
  };

  const buscarMunicipio = useCallback((q: string, s: AbortSignal) => api.municipios(q, uf || undefined, s), [uf]);
  const base = estado?.base;

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-[34px] leading-tight font-bold tracking-[-0.025em]">Ajustes</h1>
      </header>

      <div className="space-y-6">
        <section className={`${cartao} p-5 sm:p-6`} aria-labelledby="t-regiao">
          <h2 id="t-regiao" className="font-display text-[19px] font-semibold tracking-[-0.01em]">
            Sua região
          </h2>
          <p className="mt-1 text-[15px] text-tinta-2">Já vem preenchida na busca e é a que o painel acompanha.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-[120px_1fr]">
            <div>
              <label htmlFor="aj-uf" className={rotulo}>
                UF
              </label>
              <select
                id="aj-uf"
                className={campo}
                value={uf}
                onChange={e => {
                  setUf(e.target.value);
                  if (municipio?.uf && municipio.uf !== e.target.value) setMunicipio(null);
                }}
              >
                <option value="">Nenhuma</option>
                {UFS.map(u => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <Autocompletar
              rotulo="Cidade"
              placeholder="Opcional: deixe vazio para o estado todo"
              valor={municipio}
              aoMudar={o => {
                setMunicipio(o);
                if (o?.uf) setUf(o.uf);
              }}
              buscar={buscarMunicipio}
              desabilitado={!base}
            />
          </div>
        </section>

        <section className={`${cartao} p-5 sm:p-6`} aria-labelledby="t-msg">
          <h2 id="t-msg" className="font-display text-[19px] font-semibold tracking-[-0.01em]">
            Mensagem de apresentação
          </h2>
          <p className="mt-1 text-[15px] text-tinta-2">O texto que abre no WhatsApp. Você ainda revisa antes de cada envio.</p>
          <div className="mt-4">
            <label htmlFor="aj-nome" className={rotulo}>
              Seu nome
            </label>
            <input id="aj-nome" className={campo} value={seuNome} onChange={e => setSeuNome(e.target.value)} placeholder="Como você assina as mensagens" autoComplete="name" />
          </div>
          <div className="mt-4">
            <label htmlFor="aj-msg" className={rotulo}>
              Mensagem
            </label>
            <textarea id="aj-msg" rows={6} className={`${campo} resize-y py-3 leading-relaxed`} value={mensagem} onChange={e => setMensagem(e.target.value)} />
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-tinta-2">
              {VARIAVEIS.map(v => (
                <span key={v.nome}>
                  <code className="rounded bg-superficie-2 px-1 py-0.5 text-tinta">{v.nome}</code> {v.o}
                </span>
              ))}
            </p>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          {salvo && (
            <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-folha" role="status">
              <Check aria-hidden className="size-4" strokeWidth={3} /> Salvo
            </span>
          )}
          <button type="button" onClick={salvar} disabled={!mudou || salvando} className={botaoPrimario}>
            {salvando ? 'Salvando…' : 'Salvar ajustes'}
          </button>
        </div>

        <section className={`${cartao} p-5 sm:p-6`} aria-labelledby="t-base">
          <h2 id="t-base" className="flex items-center gap-2 font-display text-[19px] font-semibold tracking-[-0.01em]">
            <Database aria-hidden className="size-5 text-tinta-2" />
            Base da Receita
          </h2>
          {base ? (
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-[15px] sm:grid-cols-[180px_1fr]">
              <dt className="text-tinta-2">Mês de referência</dt>
              <dd className="capitalize">{fmtMesAno(base.mes)}</dd>
              <dt className="text-tinta-2">Carregada em</dt>
              <dd>{fmtData(base.geradaEm)}</dd>
              <dt className="text-tinta-2">Abertura mais recente</dt>
              <dd>{fmtData(estado?.aberturaMaisRecente ?? null)}</dd>
              <dt className="text-tinta-2">Empresas</dt>
              <dd className="tabular-nums">{fmtNumero(base.totais.estabelecimentos)}</dd>
              <dt className="text-tinta-2">Filtros da carga</dt>
              <dd>
                {Array.isArray(base.filtros.ufs) ? base.filtros.ufs.join(', ') : 'todas as UFs'} · desde {fmtData(base.filtros.desde === 'todas' ? null : base.filtros.desde)} ·{' '}
                {base.filtros.situacoes.map(s => SITUACOES[s]).join(', ')}
              </dd>
            </dl>
          ) : (
            <p className="mt-2 text-[15px] text-tinta-2">Nenhuma base carregada ainda.</p>
          )}
          <p className="mt-4 text-[15px] text-tinta-2">
            Para atualizar (a Receita publica todo mês), dê dois cliques em <strong className="text-tinta">atualizar-base.bat</strong>. Seus leads e notas não são afetados.
          </p>
          {estado && (
            <p className="mt-3 flex items-start gap-2 text-[13px] text-tinta-2">
              <FolderOpen aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span className="[overflow-wrap:anywhere]">Dados em {estado.pastaDados}</span>
            </p>
          )}
        </section>
      </div>
    </>
  );
}
