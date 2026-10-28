import { ChevronRight, Inbox, StickyNote } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { EtiquetaStatus } from '../componentes/LinhaLead.tsx';
import { Falha, LinhaEsqueleto, Vazio } from '../componentes/Vazio.tsx';
import { useApp } from '../contexto.tsx';
import { botaoPrimario, cartao } from '../estilos.ts';
import { capitalizar, haQuantoTempo, nomeDe } from '../formato.ts';
import { type ItemLeads, ROTULO_STATUS, STATUS, type StatusLead } from '../tipos.ts';

type Aba = StatusLead | 'todos' | 'naoContatar';

export function Leads() {
  const { mudancas } = useApp();
  const [params, setParams] = useSearchParams();
  const aba = (params.get('aba') ?? 'todos') as Aba;
  const [itens, setItens] = useState<ItemLeads[] | null>(null);
  const [contagem, setContagem] = useState<Record<StatusLead, number> | null>(null);
  const [naoContatar, setNaoContatar] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  // Recarrega quando você muda um lead no detalhe: a lista é pequena, buscar de novo é mais simples que remendar.
  const versao = JSON.stringify(mudancas);
  useEffect(() => {
    setErro(null);
    api
      .leads(aba === 'todos' || aba === 'naoContatar' ? null : aba, aba === 'naoContatar')
      .then(setItens, (e: Error) => setErro(e.message));
    api.painel().then(p => {
      setContagem(p.porStatus);
      setNaoContatar(p.naoContatar);
    }, () => {});
  }, [aba, versao, tentativa]);

  const abas: { valor: Aba; rotulo: string; n?: number }[] = [
    { valor: 'todos', rotulo: 'Todos', n: contagem ? Object.values(contagem).reduce((a, b) => a + b, 0) : undefined },
    ...STATUS.map(s => ({ valor: s, rotulo: ROTULO_STATUS[s], n: contagem?.[s] })),
    { valor: 'naoContatar', rotulo: 'Não contatar', n: naoContatar },
  ];

  const abrir = (cnpj: string) => {
    const p = new URLSearchParams(params);
    p.set('lead', cnpj);
    setParams(p);
  };

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-[34px] leading-tight font-bold tracking-[-0.025em]">Leads</h1>
        <p className="mt-1 text-[15px] text-tinta-2">As empresas com que você já começou alguma conversa.</p>
      </header>

      <div role="tablist" aria-label="Filtrar por status" className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {abas.map(a => {
          const ativo = aba === a.valor;
          return (
            <button
              key={a.valor}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => setParams(a.valor === 'todos' ? {} : { aba: a.valor })}
              className={`inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium transition-colors ${ativo ? 'bg-tinta text-fundo' : 'bg-superficie text-tinta ring-1 ring-linha hover:bg-superficie-2'}`}
            >
              {a.rotulo}
              {a.n !== undefined && <span className={`tabular-nums ${ativo ? 'opacity-70' : 'text-tinta-2'}`}>{a.n}</span>}
            </button>
          );
        })}
      </div>

      {erro ? (
        <Falha mensagem={erro} aoTentar={() => setTentativa(t => t + 1)} />
      ) : !itens ? (
        <div className={`${cartao} divide-y divide-linha overflow-hidden`}>
          {Array.from({ length: 4 }, (_, i) => (
            <LinhaEsqueleto key={i} />
          ))}
        </div>
      ) : itens.length === 0 ? (
        <Vazio
          icone={Inbox}
          titulo={aba === 'todos' ? 'Nenhum lead ainda' : aba === 'naoContatar' ? 'Ninguém pediu para não ser contatado' : `Nenhum lead em “${ROTULO_STATUS[aba]}”`}
          acao={
            aba === 'todos' && (
              <Link to="/" className={botaoPrimario}>
                Buscar empresas
              </Link>
            )
          }
        >
          {aba === 'todos' && 'Abra uma empresa na busca e escolha um status ou escreva uma nota: ela entra aqui.'}
        </Vazio>
      ) : (
        <ul className={`${cartao} divide-y divide-linha overflow-hidden`}>
          {itens.map(l => (
            <li key={l.cnpj}>
              <button type="button" onClick={() => abrir(l.cnpj)} className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-superficie-2/60 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{nomeDe(l.snapshot)}</span>
                    <EtiquetaStatus status={l.status} />
                  </div>
                  <p className="mt-0.5 flex items-center gap-2 truncate text-[13px] text-tinta-2">
                    {l.snapshot.municipio && `${capitalizar(l.snapshot.municipio)}/${l.snapshot.uf} · `}
                    atualizado {haQuantoTempo(l.atualizadoEm)}
                    {l.notas > 0 && (
                      <span className="inline-flex items-center gap-1">
                        · <StickyNote aria-hidden className="size-3.5" /> {l.notas} {l.notas === 1 ? 'nota' : 'notas'}
                      </span>
                    )}
                  </p>
                </div>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-tinta-2 transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
