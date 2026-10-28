import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { Falha } from '../componentes/Vazio.tsx';
import { useApp } from '../contexto.tsx';
import { cartao } from '../estilos.ts';
import { fmtDataCurta, fmtNumero } from '../formato.ts';
import { type Painel as DadosPainel, ROTULO_STATUS, STATUS, type StatusLead } from '../tipos.ts';

// Barras do funil: do mais frio (cinza) ao mais quente (verde cheio); descartado some no fundo de propósito.
const BARRA: Record<StatusLead, string> = { novo: 'bg-tinta-2', contatado: 'bg-folha/50', respondeu: 'bg-folha', fechado: 'bg-tinta', descartado: 'bg-linha-forte' };

export function Painel() {
  const { estado, preferencias, mudancas } = useApp();
  const [dados, setDados] = useState<DadosPainel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const versao = JSON.stringify(mudancas);

  useEffect(() => {
    setErro(null);
    api.painel().then(setDados, (e: Error) => setErro(e.message));
  }, [versao, tentativa, preferencias]);

  const semana = dados?.semanas[0];
  const anterior = dados?.semanas[1];
  const maximo = Math.max(1, ...(dados?.semanas.map(s => s.total) ?? [1]));
  const variacao = semana && anterior && anterior.total > 0 ? Math.round(((semana.total - anterior.total) / anterior.total) * 100) : null;
  const totalLeads = dados ? Object.values(dados.porStatus).reduce((a, b) => a + b, 0) : 0;
  const linkSemana = semana ? `/?periodo=7${preferencias?.uf ? `&uf=${preferencias.uf}` : ''}${preferencias?.municipio ? `&municipio=${preferencias.municipio.codigo}&municipioNome=${encodeURIComponent(preferencias.municipio.nome)}` : ''}` : '/';

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-[34px] leading-tight font-bold tracking-[-0.025em]">Painel</h1>
        <p className="mt-1 text-[15px] text-tinta-2">{dados ? `Sua região: ${dados.regiao}.` : 'Carregando…'} A região padrão se escolhe em Ajustes.</p>
      </header>

      {erro && <Falha mensagem={erro} aoTentar={() => setTentativa(t => t + 1)} />}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section className={`${cartao} p-5 sm:p-6`} aria-labelledby="titulo-semana">
          <h2 id="titulo-semana" className="text-[15px] font-medium text-tinta-2">
            Abertas na última semana da base
          </h2>
          {!estado?.base ? (
            <p className="mt-3 text-[15px] text-tinta-2">Carregue a base da Receita para ver as aberturas.</p>
          ) : !semana ? (
            <div className="esqueleto mt-3 h-14 w-40 rounded-lg" />
          ) : (
            <>
              <p className="mt-2 flex items-baseline gap-3">
                <span className="font-display text-[56px] leading-none font-bold tracking-[-0.03em] tabular-nums">{fmtNumero(semana.total)}</span>
                {variacao !== null && (
                  <span className={`text-[15px] font-medium tabular-nums ${variacao >= 0 ? 'text-folha' : 'text-tinta-2'}`}>
                    {variacao >= 0 ? '+' : ''}
                    {variacao}% <span className="font-normal text-tinta-2">vs. semana anterior</span>
                  </span>
                )}
              </p>
              <p className="mt-1 text-[14px] text-tinta-2">
                de {fmtDataCurta(semana.inicio)} a {fmtDataCurta(semana.fim)} · a Receita publica com algumas semanas de atraso
              </p>
              <Link to={linkSemana} className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-folha hover:underline">
                Ver essas empresas <ArrowRight aria-hidden className="size-4" />
              </Link>

              <figure className="mt-5">
                <div className="flex h-36 items-end gap-2" aria-hidden>
                  {[...dados.semanas].reverse().map((s, i, todas) => (
                    <div key={s.inicio} className="flex flex-1 flex-col items-center gap-1.5">
                      <span className="text-[11px] text-tinta-2 tabular-nums">{fmtNumero(s.total)}</span>
                      <div
                        className={`w-full rounded-t-md transition-[height] duration-500 ${i === todas.length - 1 ? 'bg-folha' : 'bg-linha-forte'}`}
                        style={{ height: `${Math.max(3, (s.total / maximo) * 100)}px` }}
                      />
                      <span className="text-[11px] text-tinta-2">{fmtDataCurta(s.fim)}</span>
                    </div>
                  ))}
                </div>
                <figcaption className="sr-only">
                  Aberturas por semana nas últimas {dados.semanas.length} semanas:{' '}
                  {dados.semanas.map(s => `${fmtNumero(s.total)} na semana até ${fmtDataCurta(s.fim)}`).join('; ')}.
                </figcaption>
              </figure>
            </>
          )}
        </section>

        <section className={`${cartao} p-5 sm:p-6`} aria-labelledby="titulo-funil">
          <div className="flex items-baseline justify-between">
            <h2 id="titulo-funil" className="text-[15px] font-medium text-tinta-2">
              Seus leads
            </h2>
            <span className="text-[14px] text-tinta-2 tabular-nums">{fmtNumero(totalLeads)} no total</span>
          </div>
          <ul className="mt-4 space-y-2.5">
            {STATUS.map(s => {
              const n = dados?.porStatus[s] ?? 0;
              return (
                <li key={s}>
                  <Link to={`/leads?aba=${s}`} className="group block rounded-xl p-2 -m-2 transition-colors hover:bg-superficie-2">
                    <div className="flex items-baseline justify-between text-[15px]">
                      <span>{ROTULO_STATUS[s]}</span>
                      <span className="font-semibold tabular-nums">{fmtNumero(n)}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-superficie-2">
                      <div className={`h-full rounded-full ${BARRA[s]} transition-[width] duration-500`} style={{ width: `${totalLeads ? Math.max(2, (n / totalLeads) * 100) : 0}%` }} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {dados && dados.naoContatar > 0 && (
            <p className="mt-4 text-[13px] text-tinta-2">
              {fmtNumero(dados.naoContatar)} {dados.naoContatar === 1 ? 'empresa marcada' : 'empresas marcadas'} como não contatar (fora da contagem).
            </p>
          )}
        </section>
      </div>
    </>
  );
}
