import { AlertTriangle, Ban, Check, Copy, Globe, Mail, MessageCircle, Phone, RefreshCw, Trash2, Users, X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { api, ErroApi } from '../api.ts';
import { useApp } from '../contexto.tsx';
import { botaoFantasma, botaoIcone, botaoPrimario, botaoSecundario, campo, etiqueta } from '../estilos.ts';
import { capitalizar, ehCelular, fmtCnpj, fmtData, fmtMoeda, fmtTelefone, haQuantoTempo, nomeDe } from '../formato.ts';
import { type DetalheLead as Detalhe, type Enriquecimento, ROTULO_STATUS, SITUACOES, STATUS, type StatusLead } from '../tipos.ts';
import { Frescor } from './Frescor.tsx';
import { ModalWhatsApp } from './ModalWhatsApp.tsx';
import { Falha } from './Vazio.tsx';

const PORTE: Record<number, string> = { 1: 'Microempresa', 3: 'Empresa de pequeno porte', 5: 'Demais' };

function Secao({ titulo, children, acao }: { titulo: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="border-t border-linha px-5 py-5 sm:px-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold tracking-[0.02em] text-tinta-2 uppercase">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-1.5 text-[15px]">
      <dt className="text-tinta-2">{rotulo}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function AvisoContador() {
  return (
    <span className={`${etiqueta} bg-ambar-suave text-ambar`} title="Usado por 5 ou mais empresas no país: quase sempre é o escritório de contabilidade">
      <AlertTriangle aria-hidden className="size-3" />
      provável contador
    </span>
  );
}

function preencherMensagem(modelo: string, d: Detalhe, seuNome: string): string {
  return modelo
    .replaceAll('{empresa}', d.nomeFantasia || d.razaoSocial ? nomeDe(d) : 'sua empresa')
    .replaceAll('{cidade}', capitalizar(d.municipio) ?? 'sua cidade')
    .replaceAll('{meu_nome}', seuNome || '[seu nome]');
}

/** Painel do lead. Abre por cima de qualquer página; Esc, o X, o fundo e o "voltar" fecham. */
export function DetalheLead({ cnpj, aoFechar }: { cnpj: string; aoFechar: () => void }) {
  const { avisar, preferencias, leadMudou } = useApp();
  const id = useId();
  const [d, setD] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const painel = useRef<HTMLDivElement>(null);

  const carregar = useCallback(() => {
    setErro(null);
    api.lead(cnpj).then(setD, (e: Error) => setErro(e.message));
  }, [cnpj]);

  useEffect(() => {
    setD(null);
    carregar();
  }, [carregar]);

  // Foco entra no painel e volta para quem abriu; a página por baixo não rola.
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    painel.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      anterior?.focus?.();
    };
  }, []);

  const aplicar = (novo: Detalhe) => {
    setD(novo);
    leadMudou(cnpj, { status: novo.lead?.status ?? null, naoContatar: novo.lead?.naoContatar ?? false });
  };

  const mudarStatus = async (status: StatusLead, silencioso = false) => {
    if (!d) return;
    const anterior = d.lead?.status ?? null;
    try {
      aplicar(await api.atualizarLead(cnpj, { status }));
      if (!silencioso) avisar(`Marcado como ${ROTULO_STATUS[status]}`, anterior ? { desfazer: () => api.atualizarLead(cnpj, { status: anterior }).then(aplicar) } : undefined);
    } catch (e) {
      avisar((e as Error).message, { tipo: 'erro' });
    }
  };

  const mudarNaoContatar = async (naoContatar: boolean) => {
    try {
      aplicar(await api.atualizarLead(cnpj, { naoContatar }));
      avisar(naoContatar ? 'Não vai mais aparecer nas buscas' : 'Voltou a aparecer nas buscas', naoContatar ? { desfazer: () => api.atualizarLead(cnpj, { naoContatar: false }).then(aplicar) } : undefined);
    } catch (e) {
      avisar((e as Error).message, { tipo: 'erro' });
    }
  };

  const nome = d ? nomeDe(d) : null;
  const telefones = d ? [d.telefone, d.telefone2].filter((t): t is string => !!t) : [];
  const celular = telefones.find(ehCelular) ?? null;
  // Sem nome no cadastro, procura pelo CNPJ: "" + cidade traria qualquer coisa.
  const termo = d ? (d.nomeFantasia ?? d.razaoSocial ? `"${capitalizar(d.nomeFantasia ?? d.razaoSocial)}" ${capitalizar(d.municipio) ?? ''}` : fmtCnpj(d.cnpj)) : '';
  const google = `https://www.google.com/search?q=${encodeURIComponent(termo.trim())}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/25 backdrop-blur-[2px] [animation:aparecer_.2s] md:items-stretch md:justify-end" onMouseDown={e => e.target === e.currentTarget && aoFechar()}>
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-nome`}
        tabIndex={-1}
        onKeyDown={e => e.key === 'Escape' && !whatsapp && aoFechar()}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-superficie shadow-cartao outline-none [animation:entrar-baixo_.34s_var(--ease-mola)] md:max-h-none md:w-[540px] md:rounded-none md:rounded-l-3xl md:[animation:entrar-lado_.34s_var(--ease-mola)]"
      >
        <div className="flex items-center justify-between border-b border-linha bg-vidro px-3 py-2 backdrop-blur-xl">
          <span className="mx-auto h-1.5 w-10 rounded-full bg-linha-forte md:hidden" aria-hidden />
          <button type="button" onClick={aoFechar} className={`${botaoIcone} absolute right-2 md:static md:ml-auto`} aria-label="Fechar detalhe">
            <X aria-hidden className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          {erro ? (
            <div className="p-6">
              <Falha mensagem={erro} aoTentar={carregar} />
            </div>
          ) : !d ? (
            <div className="space-y-3 p-6" aria-busy="true" aria-label="Carregando">
              <div className="esqueleto h-5 w-24 rounded" />
              <div className="esqueleto h-8 w-3/4 rounded" />
              <div className="esqueleto h-4 w-1/2 rounded" />
              <div className="esqueleto mt-6 h-24 w-full rounded-2xl" />
            </div>
          ) : (
            <>
              <header className="px-5 pt-5 pb-5 sm:px-6">
                <Frescor abertura={d.abertura} tamanho="grande" />
                <h2 id={`${id}-nome`} className="mt-3 font-display text-[26px] leading-tight font-bold tracking-[-0.02em] [overflow-wrap:anywhere]">
                  {nome}
                </h2>
                {d.nomeFantasia && d.razaoSocial && <p className="mt-1 text-[15px] text-tinta-2">{capitalizar(d.razaoSocial)}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[14px] text-tinta-2">
                  <CopiarCnpj cnpj={d.cnpj} />
                  {d.municipio && (
                    <span>
                      · {capitalizar(d.municipio)}/{d.uf}
                    </span>
                  )}
                  {!d.noBanco && <span className={`${etiqueta} bg-ambar-suave text-ambar`}>fora da base deste mês</span>}
                </div>

                <fieldset className="mt-5">
                  <legend className="sr-only">Status do lead</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS.map(s => {
                      const ativo = (d.lead?.status ?? null) === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={ativo}
                          onClick={() => !ativo && mudarStatus(s)}
                          className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium transition-all active:scale-95 ${ativo ? 'bg-tinta text-fundo' : 'bg-superficie-2 text-tinta hover:bg-linha-forte'}`}
                        >
                          {ativo && <Check aria-hidden className="size-3.5" strokeWidth={3} />}
                          {ROTULO_STATUS[s]}
                        </button>
                      );
                    })}
                  </div>
                  {!d.lead && <p className="mt-2 text-[13px] text-tinta-2">Ainda não está nos seus leads. Escolher um status ou escrever uma nota adiciona.</p>}
                </fieldset>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  {celular ? (
                    <button type="button" onClick={() => setWhatsapp(celular)} disabled={d.lead?.naoContatar} className={`${botaoPrimario} col-span-2`}>
                      <MessageCircle aria-hidden className="size-[18px]" />
                      WhatsApp
                    </button>
                  ) : (
                    <p className="col-span-2 rounded-xl bg-superficie-2 px-3.5 py-2.5 text-[14px] text-tinta-2">Sem celular no cadastro: WhatsApp indisponível. Tente o telefone ou procure a empresa no Google.</p>
                  )}
                  <a href={telefones[0] ? `tel:+55${telefones[0]}` : undefined} aria-disabled={!telefones[0]} className={`${botaoSecundario} ${!telefones[0] ? 'pointer-events-none opacity-45' : ''}`}>
                    <Phone aria-hidden className="size-4" />
                    Ligar
                  </a>
                  <a href={d.email ? `mailto:${d.email}` : undefined} aria-disabled={!d.email} className={`${botaoSecundario} ${!d.email ? 'pointer-events-none opacity-45' : ''}`}>
                    <Mail aria-hidden className="size-4" />
                    E-mail
                  </a>
                  <a href={google} target="_blank" rel="noopener noreferrer" className={`${botaoSecundario} col-span-2`}>
                    <Globe aria-hidden className="size-4" />
                    Ver se já tem site (Google)
                  </a>
                </div>
              </header>

              <Secao titulo="Contato">
                <dl>
                  {telefones.length === 0 && !d.email && <p className="text-[15px] text-tinta-2">Nenhum contato no cadastro da Receita.</p>}
                  {telefones.map((t, i) => (
                    <Campo key={t} rotulo={i === 0 ? 'Telefone' : 'Telefone 2'}>
                      <span className="flex flex-wrap items-center gap-2 tabular-nums">
                        {fmtTelefone(t)}
                        {ehCelular(t) && <span className="text-[13px] text-tinta-2">celular</span>}
                        {i === 0 && d.telefoneDeContador && <AvisoContador />}
                      </span>
                    </Campo>
                  ))}
                  {d.email && (
                    <Campo rotulo="E-mail">
                      <span className="flex flex-wrap items-center gap-2">
                        {d.email}
                        {d.emailDeContador && <AvisoContador />}
                      </span>
                    </Campo>
                  )}
                </dl>
              </Secao>

              <Secao titulo="Empresa">
                <dl>
                  <Campo rotulo="Atividade">
                    {d.cnaeDescricao ?? '—'}
                    {d.cnaesSecundarios.length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[14px] text-folha">+{d.cnaesSecundarios.length} secundárias</summary>
                        <ul className="mt-1.5 space-y-1 text-[14px] text-tinta-2">
                          {d.cnaesSecundarios.map(c => (
                            <li key={c.codigo}>{c.nome}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </Campo>
                  <Campo rotulo="Aberta em">{fmtData(d.abertura)}</Campo>
                  {d.endereco && (
                    <Campo rotulo="Endereço">
                      {capitalizar(d.endereco)}
                      {d.cep && <span className="block text-[14px] text-tinta-2 tabular-nums">CEP {d.cep.replace(/(\d{5})(\d{3})/, '$1-$2')}</span>}
                    </Campo>
                  )}
                  <Campo rotulo="Porte">{d.mei ? 'MEI' : d.porte ? PORTE[d.porte] : '—'}{d.simples && !d.mei ? ' · Simples Nacional' : ''}</Campo>
                  {d.capitalSocial !== null && <Campo rotulo="Capital social">{fmtMoeda(d.capitalSocial)}</Campo>}
                  {d.naturezaJuridica && <Campo rotulo="Natureza">{d.naturezaJuridica}</Campo>}
                  {d.situacao && (
                    <Campo rotulo="Situação">
                      {SITUACOES[d.situacao] ?? d.situacao} {d.noBanco && <span className="text-tinta-2">· {d.matriz ? 'matriz' : 'filial'}</span>}
                    </Campo>
                  )}
                </dl>
              </Secao>

              <Enriquecer cnpj={cnpj} inicial={d.enriquecimento} />

              <Notas detalhe={d} aoMudar={aplicar} />

              <section className="border-t border-linha px-5 py-5 sm:px-6">
                <div className={`flex items-start gap-3 rounded-2xl p-4 ${d.lead?.naoContatar ? 'bg-perigo-suave' : 'bg-superficie-2'}`}>
                  <Ban aria-hidden className={`mt-0.5 size-5 shrink-0 ${d.lead?.naoContatar ? 'text-perigo' : 'text-tinta-2'}`} />
                  <div className="flex-1">
                    <p className="font-medium">{d.lead?.naoContatar ? 'Marcada para não contatar' : 'Não contatar esta empresa'}</p>
                    <p className="mt-0.5 text-[14px] text-tinta-2">
                      {d.lead?.naoContatar
                        ? `Desde ${fmtData(d.lead.naoContatarEm)}. Fica fora das buscas, das exportações e do painel.`
                        : 'Para quem pediu para não receber contato. Some das buscas e exportações, inclusive nas próximas bases.'}
                    </p>
                    <button type="button" onClick={() => mudarNaoContatar(!d.lead?.naoContatar)} className={`${d.lead?.naoContatar ? botaoSecundario : 'mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-xl px-0 text-[15px] font-medium text-perigo hover:underline'} ${d.lead?.naoContatar ? 'mt-3' : ''}`}>
                      {d.lead?.naoContatar ? 'Permitir contato de novo' : 'Marcar como não contatar'}
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {whatsapp && d && (
        <ModalWhatsApp
          telefone={whatsapp}
          mensagemInicial={preencherMensagem(preferencias?.mensagemWhatsapp ?? '', d, preferencias?.seuNome ?? '')}
          podeMarcarContatado={!d.lead || d.lead.status === 'novo'}
          aoFechar={() => setWhatsapp(null)}
          aoEnviar={marcar => {
            setWhatsapp(null);
            if (marcar) mudarStatus('contatado', true).then(() => avisar('WhatsApp aberto · marcado como Contatado'));
          }}
        />
      )}
    </div>
  );
}

function CopiarCnpj({ cnpj }: { cnpj: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(cnpj).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        });
      }}
      className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg px-1.5 -ml-1.5 tabular-nums transition-colors hover:bg-superficie-2 hover:text-tinta"
      aria-label={`Copiar CNPJ ${fmtCnpj(cnpj)}`}
    >
      {fmtCnpj(cnpj)}
      {copiado ? <Check aria-hidden className="size-3.5 text-folha" strokeWidth={3} /> : <Copy aria-hidden className="size-3.5" />}
      <span className="sr-only" aria-live="polite">
        {copiado ? 'Copiado' : ''}
      </span>
    </button>
  );
}

function Enriquecer({ cnpj, inicial }: { cnpj: string; inicial: Enriquecimento | null }) {
  const [dados, setDados] = useState(inicial);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [todosSocios, setTodosSocios] = useState(false);

  const pedir = async () => {
    setCarregando(true);
    setErro(null);
    try {
      setDados(await api.enriquecer(cnpj));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível consultar agora.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <Secao
      titulo="BrasilAPI"
      acao={
        dados && (
          <span className="text-[13px] text-tinta-2" title={fmtData(dados.consultadoEm)}>
            consultado {haQuantoTempo(dados.consultadoEm)}
          </span>
        )
      }
    >
      {!dados ? (
        <>
          <p className="text-[15px] text-tinta-2">Confere o cadastro de hoje (a base é do mês) e mostra os sócios.</p>
          <button type="button" onClick={pedir} disabled={carregando} className={`${botaoSecundario} mt-3`}>
            <RefreshCw aria-hidden className={`size-4 ${carregando ? 'animate-spin' : ''}`} />
            {carregando ? 'Consultando…' : 'Enriquecer'}
          </button>
        </>
      ) : (
        <dl>
          {dados.situacao && <Campo rotulo="Situação hoje">{capitalizar(dados.situacao)}</Campo>}
          {dados.telefones.length > 0 && <Campo rotulo="Telefones">{dados.telefones.map(fmtTelefone).join(' · ')}</Campo>}
          {dados.email && <Campo rotulo="E-mail">{dados.email}</Campo>}
          {dados.endereco && <Campo rotulo="Endereço">{capitalizar(dados.endereco)}</Campo>}
          <div className="mt-3">
            <p className="mb-2 flex items-center gap-2 text-[15px] font-medium">
              <Users aria-hidden className="size-4 text-tinta-2" />
              {dados.socios.length === 0 ? 'Sem sócios informados (comum em MEI)' : dados.socios.length === 1 ? '1 sócio' : `${dados.socios.length} sócios`}
            </p>
            <ul className="space-y-2">
              {(todosSocios ? dados.socios : dados.socios.slice(0, 8)).map(s => (
                <li key={`${s.nome}-${s.desde}`} className="rounded-xl bg-superficie-2 px-3.5 py-2.5">
                  <p className="font-medium">{capitalizar(s.nome)}</p>
                  <p className="text-[13px] text-tinta-2">{[s.qualificacao, s.faixaEtaria, s.desde && `desde ${fmtData(s.desde)}`].filter(Boolean).join(' · ')}</p>
                </li>
              ))}
            </ul>
            {dados.socios.length > 8 && !todosSocios && (
              <button type="button" onClick={() => setTodosSocios(true)} className={`${botaoFantasma} mt-1 -ml-2 px-2`}>
                Ver os {dados.socios.length}
              </button>
            )}
          </div>
          <button type="button" onClick={pedir} disabled={carregando} className={`${botaoFantasma} mt-2 -ml-2 px-2`}>
            <RefreshCw aria-hidden className={`size-4 ${carregando ? 'animate-spin' : ''}`} />
            Consultar de novo
          </button>
          <p className="text-[12px] text-tinta-2">Dentro de 24 h a resposta vem do cache, sem nova consulta.</p>
        </dl>
      )}
      {erro && (
        <p role="alert" className="mt-3 text-[14px] text-perigo">
          {erro}
        </p>
      )}
    </Secao>
  );
}

function Notas({ detalhe, aoMudar }: { detalhe: Detalhe; aoMudar: (d: Detalhe) => void }) {
  const { avisar } = useApp();
  const id = useId();
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!texto.trim()) return;
    setSalvando(true);
    try {
      aoMudar(await api.adicionarNota(detalhe.cnpj, texto));
      setTexto('');
    } catch (e) {
      avisar((e as Error).message, { tipo: 'erro' });
    } finally {
      setSalvando(false);
    }
  };

  const apagar = async (notaId: number, conteudo: string) => {
    await api.apagarNota(notaId);
    aoMudar(await api.lead(detalhe.cnpj));
    avisar('Nota apagada', { desfazer: () => api.adicionarNota(detalhe.cnpj, conteudo).then(aoMudar) });
  };

  return (
    <Secao titulo="Notas">
      <label htmlFor={`${id}-nota`} className="sr-only">
        Nova nota
      </label>
      <textarea
        id={`${id}-nota`}
        rows={2}
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onKeyDown={e => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && salvar()}
        placeholder="Ex.: falei com a dona, quer orçamento até sexta"
        className={`${campo} resize-y py-2.5`}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[12px] text-tinta-2">Ctrl + Enter salva</span>
        <button type="button" onClick={salvar} disabled={!texto.trim() || salvando} className={botaoSecundario}>
          {salvando ? 'Salvando…' : 'Salvar nota'}
        </button>
      </div>
      {detalhe.notas.length > 0 && (
        <ul className="mt-4 space-y-2">
          {detalhe.notas.map(n => (
            <li key={n.id} className="group flex gap-2 rounded-xl bg-superficie-2 py-2.5 pr-1 pl-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] whitespace-pre-wrap [overflow-wrap:anywhere]">{n.texto}</p>
                <p className="mt-0.5 text-[12px] text-tinta-2">{haQuantoTempo(n.criadaEm)}</p>
              </div>
              <button type="button" onClick={() => apagar(n.id, n.texto)} className={`${botaoIcone} size-9 shrink-0`} aria-label="Apagar nota">
                <Trash2 aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}
