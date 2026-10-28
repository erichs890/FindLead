import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cartao } from '../estilos.ts';

/** Estado vazio: diz o que aconteceu e qual é o próximo passo, nunca só "nada aqui". */
export function Vazio({ icone: Icone, titulo, children, acao }: { icone: LucideIcon; titulo: string; children?: ReactNode; acao?: ReactNode }) {
  return (
    <div className={`${cartao} flex flex-col items-center px-6 py-14 text-center`}>
      <div className="flex size-14 items-center justify-center rounded-2xl bg-superficie-2 text-tinta-2">
        <Icone aria-hidden className="size-7" strokeWidth={1.6} />
      </div>
      <h2 className="mt-4 font-display text-[19px] font-semibold tracking-[-0.01em]">{titulo}</h2>
      {children && <div className="mt-1.5 max-w-md text-[15px] text-tinta-2">{children}</div>}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}

export function LinhaEsqueleto() {
  return (
    <div className="flex items-center gap-4 px-4 py-4 sm:px-5" aria-hidden>
      <div className="esqueleto size-6 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="esqueleto h-4 w-1/3 rounded" />
        <div className="esqueleto h-3 w-2/3 rounded" />
      </div>
      <div className="esqueleto hidden h-6 w-24 rounded-full sm:block" />
    </div>
  );
}

/** Mensagem de erro com o caminho para resolver, no lugar do conteúdo que falhou. */
export function Falha({ mensagem, aoTentar }: { mensagem: string; aoTentar?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl bg-perigo-suave px-5 py-4 text-[15px] text-perigo">
      <p className="font-medium">{mensagem}</p>
      {aoTentar && (
        <button type="button" onClick={aoTentar} className="mt-2 cursor-pointer font-semibold underline underline-offset-2">
          Tentar de novo
        </button>
      )}
    </div>
  );
}
