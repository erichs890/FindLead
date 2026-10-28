import { ChartColumn, Search, Settings, Users } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../contexto.tsx';
import { fmtMesAno, fmtNumero } from '../formato.ts';

const ITENS = [
  { para: '/', rotulo: 'Buscar', icone: Search },
  { para: '/leads', rotulo: 'Leads', icone: Users },
  { para: '/painel', rotulo: 'Painel', icone: ChartColumn },
  { para: '/ajustes', rotulo: 'Ajustes', icone: Settings },
] as const;

function Marca() {
  return (
    <div className="flex items-center gap-2.5 px-3">
      <img src="/icone.svg" alt="" className="size-8" />
      <span className="font-display text-[19px] font-semibold tracking-[-0.02em]">CaçaLead</span>
    </div>
  );
}

/** Barra lateral no desktop, barra de abas embaixo no celular: a mesma lista, nunca as duas ao mesmo tempo. */
export function Navegacao() {
  const { estado } = useApp();
  const base = estado?.base;

  return (
    <>
      <nav aria-label="Principal" className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-linha bg-superficie/60 px-3 py-6 backdrop-blur-xl md:flex">
        <Marca />
        <ul className="mt-8 flex flex-col gap-0.5">
          {ITENS.map(({ para, rotulo, icone: Icone }) => (
            <li key={para}>
              <NavLink
                to={para}
                end
                className={({ isActive }) =>
                  `flex min-h-10 items-center gap-3 rounded-lg px-3 text-[15px] transition-colors ${isActive ? 'bg-folha-suave font-semibold text-folha' : 'text-tinta hover:bg-superficie-2'}`
                }
              >
                <Icone aria-hidden className="size-[18px]" strokeWidth={2} />
                {rotulo}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="mt-auto px-3 text-[12px] leading-relaxed text-tinta-2">
          {base ? (
            <>
              <p className="font-medium text-tinta">Base de {fmtMesAno(base.mes)}</p>
              <p className="tabular-nums">{fmtNumero(base.totais.estabelecimentos)} empresas</p>
            </>
          ) : estado ? (
            <p>Nenhuma base carregada</p>
          ) : null}
        </div>
      </nav>

      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-linha bg-vidro px-2 backdrop-blur-xl md:hidden">
        <Marca />
      </header>

      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-30 border-t border-linha bg-vidro pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <ul className="grid grid-cols-4">
          {ITENS.map(({ para, rotulo, icone: Icone }) => (
            <li key={para}>
              <NavLink
                to={para}
                end
                className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive ? 'text-folha' : 'text-tinta-2'}`}
              >
                <Icone aria-hidden className="size-6" strokeWidth={1.8} />
                {rotulo}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
