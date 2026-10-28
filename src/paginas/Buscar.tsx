import { Database, Download, SearchX, SlidersHorizontal } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ErroApi } from '../api.ts';
import { Autocompletar } from '../componentes/Autocompletar.tsx';
import { LinhaLead } from '../componentes/LinhaLead.tsx';
import { Falha, LinhaEsqueleto, Vazio } from '../componentes/Vazio.tsx';
import { useApp } from '../contexto.tsx';
import { botaoFantasma, botaoSecundario, campo, cartao, rotulo } from '../estilos.ts';
import { fmtData, fmtNumero } from '../formato.ts';
import { type Filtros, type ItemBusca, type Opcao, PORTES, type Porte, SITUACOES } from '../tipos.ts';
import { UFS } from '../ufs.ts';

const PERIODOS = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
  { dias: 365, rotulo: '1 ano' },
  { dias: 0, rotulo: 'Tudo' },
] as const;

function menosDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - dias * 86_400_000).toISOString().slice(0, 10);
}

/** Lê da URL o que a tela mostra. Nomes de CNAE/município vão junto só para exibir sem consultar de novo. */
function daUrl(p: URLSearchParams) {
  const n = (k: string) => (p.get(k) && /^\d+$/.test(p.get(k)!) ? Number(p.get(k)) : undefined);
  const periodo = p.get('periodo');
  return {
    periodo: periodo === null ? 30 : Number(periodo),
    uf: p.get('uf') ?? undefined,
    municipio: n('municipio') ? ({ codigo: n('municipio')!, nome: p.get('municipioNome') ?? '' } satisfies Opcao) : null,
    cnae: n('cnae') ? ({ codigo: n('cnae')!, nome: p.get('cnaeNome') ?? '' } satisfies Opcao) : null,
    porte: (p.get('porte') ?? undefined) as Porte | undefined,
    situacao: n('situacao'),
    comTelefone: p.get('comTelefone') === '1',
    comEmail: p.get('comEmail') === '1',
    contatoDireto: p.get('contatoDireto') === '1',
    texto: p.get('texto') ?? '',
  };
}

const fmtCnae = (o: Opcao) => {
  const c = String(o.codigo).padStart(7, '0');
  return `${c.slice(0, 4)}-${c.slice(4, 5)}/${c.slice(5)}`;
};

export function Buscar() {
  const { estado, preferencias, mudancas } = useApp();
  const [params, setParams] = useSearchParams();
  const tela = daUrl(params);
  const [maisFiltros, setMaisFiltros] = useState(() => Boolean(tela.porte || tela.situacao || tela.comTelefone || tela.comEmail || tela.contatoDireto || tela.texto));
  const [texto, setTexto] = useState(tela.texto);

  const [itens, setItens] = useState<ItemBusca[]>([]);
  const [proximo, setProximo] = useState<string | null>(null);
  const [total, setTotal] = useState<{ n: number; limite: number } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const recente = estado?.aberturaMaisRecente ?? null;

  // Primeira visita sem filtro de região: usa a região padrão dos Ajustes.
  const aplicouPadrao = useRef(false);
  useEffect(() => {
    if (aplicouPadrao.current || !preferencias) return;
    aplicouPadrao.current = true;
    if (params.has('uf') || params.has('municipio') || !preferencias.uf) return;
    const p = new URLSearchParams(params);
    p.set('uf', preferencias.uf);
    if (preferencias.municipio) {
      p.set('municipio', String(preferencias.municipio.codigo));
      p.set('municipioNome', preferencias.municipio.nome);
    }
    setParams(p, { replace: true });
  }, [preferencias, params, setParams]);

  const filtros = useMemo<Filtros>(
    () => ({
      desde: tela.periodo > 0 && recente ? menosDias(recente, tela.periodo - 1) : undefined,
      uf: tela.uf,
      municipio: tela.municipio?.codigo,
      cnae: tela.cnae?.codigo,
      porte: tela.porte,
      situacao: tela.situacao,
      comTelefone: tela.comTelefone || undefined,
      comEmail: tela.comEmail || undefined,
      contatoDireto: tela.contatoDireto || undefined,
      texto: tela.texto || undefined,
    }),
    // A chave é a URL sem o lead aberto: abrir um detalhe não refaz a busca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.toString().replace(/(^|&)lead=\d+/, ''), recente],
  );
  const chave = JSON.stringify(filtros);

  useEffect(() => {
    if (!estado?.base) return;
    const controle = new AbortController();
    setCarregando(true);
    setErro(null);
    api
      .buscar(filtros, null, controle.signal)
      .then(r => {
        setItens(r.itens);
        setProximo(r.proximo);
        setTotal({ n: r.total, limite: r.limiteDoTotal });
      })
      .catch((e: unknown) => {
        if (!controle.signal.aborted) setErro(e instanceof ErroApi ? e : new ErroApi(String(e), 0, false));
      })
      .finally(() => {
        if (!controle.signal.aborted) setCarregando(false);
      });
    return () => controle.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, estado?.base, tentativa]);

  const carregarMais = async () => {
    if (!proximo) return;
    setCarregandoMais(true);
    try {
      const r = await api.buscar(filtros, proximo);
      setItens(i => [...i, ...r.itens]);
      setProximo(r.proximo);
    } catch (e) {
      setErro(e instanceof ErroApi ? e : new ErroApi(String(e), 0, false));
    } finally {
      setCarregandoMais(false);
    }
  };

  const mudar = useCallback(
    (mudancas: Record<string, string | null>) => {
      const p = new URLSearchParams(params);
      for (const [k, v] of Object.entries(mudancas)) {
        if (v === null || v === '') p.delete(k);
        else p.set(k, v);
      }
      setParams(p, { replace: true });
    },
    [params, setParams],
  );

  // Texto livre: atualiza a URL 350 ms depois da última tecla.
  useEffect(() => {
    if (texto === tela.texto) return;
    const t = setTimeout(() => mudar({ texto: texto.trim() || null }), 350);
    return () => clearTimeout(t);
  }, [texto, tela.texto, mudar]);

  const buscarCnae = useCallback((q: string, s: AbortSignal) => api.cnaes(q, s), []);
  const buscarMunicipio = useCallback((q: string, s: AbortSignal) => api.municipios(q, tela.uf, s), [tela.uf]);

  const ufsDaBase = estado?.base && Array.isArray(estado.base.filtros.ufs) ? estado.base.filtros.ufs : null;
  const situacoesDaBase = estado?.base?.filtros.situacoes ?? [];
  const temFiltro = [...params.keys()].some(k => !['lead', 'periodo'].includes(k));

  if (estado && !estado.base) {
    return (
      <>
        <Cabecalho />
        <Vazio icone={Database} titulo="Falta carregar a base da Receita">
          <p>
            Dê dois cliques em <strong className="text-tinta">atualizar-base.bat</strong>, na pasta do CaçaLead. Leva de 30 a 60 minutos na primeira vez; depois, uma vez por mês.
          </p>
        </Vazio>
      </>
    );
  }

  return (
    <>
      <Cabecalho>
        <a
          href={api.linkExportacao(filtros)}
          download
          aria-disabled={!total?.n}
          className={`${botaoSecundario} ${!total?.n ? 'pointer-events-none opacity-45' : ''}`}
          title="Baixa todas as empresas destes filtros numa planilha (sem os sócios)"
        >
          <Download aria-hidden className="size-4" />
          Exportar CSV
        </a>
      </Cabecalho>

      <section aria-label="Filtros" className={`${cartao} p-4 sm:p-5`}>
        <div className="grid grid-cols-[88px_1fr] gap-3 sm:grid-cols-[120px_1fr] sm:gap-4 lg:grid-cols-[110px_1fr_1.3fr]">
          <div>
            <label htmlFor="uf" className={rotulo}>
              UF
            </label>
            <select id="uf" className={campo} value={tela.uf ?? ''} onChange={e => mudar({ uf: e.target.value || null, municipio: null, municipioNome: null })}>
              <option value="">Todas</option>
              {(ufsDaBase ?? UFS).map(uf => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </div>
          <Autocompletar
            rotulo="Cidade"
            placeholder={tela.uf ? `Cidade em ${tela.uf}` : 'Digite a cidade'}
            valor={tela.municipio}
            aoMudar={o => mudar({ municipio: o ? String(o.codigo) : null, municipioNome: o?.nome ?? null, ...(o?.uf ? { uf: o.uf } : {}) })}
            buscar={buscarMunicipio}
          />
          <div className="col-span-2 lg:col-span-1">
            <Autocompletar
              rotulo="Atividade (CNAE)"
              placeholder="Ex.: restaurante, salão, 5611"
              valor={tela.cnae}
              aoMudar={o => mudar({ cnae: o ? String(o.codigo) : null, cnaeNome: o?.nome ?? null })}
              buscar={buscarCnae}
              detalhe={fmtCnae}
            />
          </div>
        </div>

        <fieldset className="mt-4">
          <legend className={rotulo}>Abertas nos últimos</legend>
          <div className="flex flex-wrap items-center gap-2">
            <div className="grid w-full grid-cols-5 rounded-xl bg-superficie-2 p-1 sm:inline-flex sm:w-auto">
              {PERIODOS.map(p => {
                const ativo = tela.periodo === p.dias;
                return (
                  <button
                    key={p.dias}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => mudar({ periodo: p.dias === 30 ? null : String(p.dias) })}
                    className={`min-h-9 cursor-pointer rounded-lg px-2 text-[14px] font-medium whitespace-nowrap transition-all sm:px-3 ${ativo ? 'bg-superficie text-tinta shadow-cartao' : 'text-tinta-2 hover:text-tinta'}`}
                  >
                    {p.rotulo}
                  </button>
                );
              })}
            </div>
            {recente && <span className="text-[13px] text-tinta-2">contando de {fmtData(recente)}, a abertura mais recente na base</span>}
          </div>
        </fieldset>

        <button type="button" aria-expanded={maisFiltros} onClick={() => setMaisFiltros(m => !m)} className={`${botaoFantasma} mt-3 -ml-2 px-2`}>
          <SlidersHorizontal aria-hidden className="size-4" />
          {maisFiltros ? 'Menos filtros' : 'Mais filtros'}
        </button>

        {maisFiltros && (
          <div className="mt-2 grid gap-4 border-t border-linha pt-4 [animation:aparecer_.2s] sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="porte" className={rotulo}>
                Porte
              </label>
              <select id="porte" className={campo} value={tela.porte ?? ''} onChange={e => mudar({ porte: e.target.value || null })}>
                <option value="">Todos</option>
                {PORTES.map(p => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo}
                  </option>
                ))}
              </select>
            </div>
            {situacoesDaBase.length > 1 && (
              <div>
                <label htmlFor="situacao" className={rotulo}>
                  Situação cadastral
                </label>
                <select id="situacao" className={campo} value={tela.situacao ?? ''} onChange={e => mudar({ situacao: e.target.value || null })}>
                  <option value="">Todas importadas</option>
                  {situacoesDaBase.map(s => (
                    <option key={s} value={s}>
                      {SITUACOES[s]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="texto" className={rotulo}>
                Nome contém
              </label>
              <input id="texto" type="search" className={campo} placeholder="Ex.: pizzaria" value={texto} onChange={e => setTexto(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2.5 sm:col-span-2 lg:col-span-3 lg:flex-row lg:gap-6">
              <Alternar rotulo="Tem telefone" ligado={tela.comTelefone} aoMudar={v => mudar({ comTelefone: v ? '1' : null })} />
              <Alternar rotulo="Tem e-mail" ligado={tela.comEmail} aoMudar={v => mudar({ comEmail: v ? '1' : null })} />
              <Alternar
                rotulo="Só contato direto"
                dica="Esconde quem só tem e-mail e telefone de contador"
                ligado={tela.contatoDireto}
                aoMudar={v => mudar({ contatoDireto: v ? '1' : null })}
              />
            </div>
          </div>
        )}
      </section>

      <div className="mt-6 mb-2.5 flex min-h-8 items-baseline justify-between gap-4 px-1">
        <p className="text-[15px] text-tinta-2" aria-live="polite">
          {carregando || !total ? (
            'Buscando…'
          ) : (
            <>
              <strong className="font-semibold text-tinta tabular-nums">
                {total.n > total.limite ? `${fmtNumero(total.limite)}+` : fmtNumero(total.n)}
              </strong>{' '}
              {total.n === 1 ? 'empresa' : 'empresas'}
            </>
          )}
        </p>
        {temFiltro && (
          <button type="button" className="cursor-pointer text-[14px] font-medium text-folha hover:underline" onClick={() => setParams(new URLSearchParams(params.has('lead') ? { lead: params.get('lead')! } : {}), { replace: true })}>
            Limpar filtros
          </button>
        )}
      </div>

      {erro ? (
        <Falha mensagem={erro.message} aoTentar={() => setTentativa(t => t + 1)} />
      ) : carregando ? (
        <div className={`${cartao} divide-y divide-linha overflow-hidden`}>
          {Array.from({ length: 6 }, (_, i) => (
            <LinhaEsqueleto key={i} />
          ))}
        </div>
      ) : itens.length === 0 ? (
        <Vazio icone={SearchX} titulo="Nenhuma empresa com esses filtros">
          Tente um período maior, outra cidade ou tire a atividade. Empresas marcadas como “não contatar” nunca aparecem aqui.
        </Vazio>
      ) : (
        <>
          <ul className={`${cartao} divide-y divide-linha overflow-hidden`}>
            {itens
              .filter(i => !mudancas[i.cnpj]?.naoContatar)
              .map(i => (
                <LinhaLead key={i.cnpj} item={mudancas[i.cnpj] ? { ...i, status: mudancas[i.cnpj]!.status } : i} />
              ))}
          </ul>
          {proximo && (
            <div className="mt-4 flex justify-center">
              <button type="button" onClick={carregarMais} disabled={carregandoMais} className={botaoSecundario}>
                {carregandoMais ? 'Carregando…' : 'Mostrar mais 50'}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Cabecalho({ children }: { children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[34px] leading-tight font-bold tracking-[-0.025em]">Buscar</h1>
        <p className="mt-1 text-[15px] text-tinta-2">Empresas que acabaram de abrir e ainda não ouviram falar de você.</p>
      </div>
      {children}
    </header>
  );
}

function Alternar({ rotulo: texto, dica, ligado, aoMudar }: { rotulo: string; dica?: string; ligado: boolean; aoMudar: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        onClick={() => aoMudar(!ligado)}
        className={`relative h-[31px] w-[51px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${ligado ? 'bg-folha' : 'bg-linha-forte'}`}
      >
        <span className={`absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow transition-transform duration-200 ease-[var(--ease-mola)] ${ligado ? 'translate-x-5' : ''}`} />
      </button>
      <span className="text-[15px]">
        {texto}
        {dica && <span className="block text-[13px] text-tinta-2">{dica}</span>}
      </span>
    </label>
  );
}
