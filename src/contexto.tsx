import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.ts';
import type { EstadoBase, Preferencias, StatusLead } from './tipos.ts';

interface Aviso {
  id: number;
  texto: string;
  tipo: 'ok' | 'erro';
  desfazer?: () => void;
}

export interface MudancaLead {
  status: StatusLead | null;
  naoContatar: boolean;
}

interface Contexto {
  estado: EstadoBase | null;
  erroEstado: string | null;
  preferencias: Preferencias | null;
  salvarPreferencias: (p: Partial<Preferencias>) => Promise<void>;
  avisar: (texto: string, opcoes?: { tipo?: 'ok' | 'erro'; desfazer?: () => void }) => void;
  /** Mudanças feitas no detalhe nesta sessão: as listas aplicam por cima do que já carregaram, sem buscar de novo. */
  mudancas: Record<string, MudancaLead>;
  leadMudou: (cnpj: string, m: MudancaLead) => void;
}

const Ctx = createContext<Contexto | null>(null);

export function useApp(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp fora do ProvedorApp');
  return c;
}

export function ProvedorApp({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoBase | null>(null);
  const [erroEstado, setErroEstado] = useState<string | null>(null);
  const [preferencias, setPreferencias] = useState<Preferencias | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [mudancas, setMudancas] = useState<Record<string, MudancaLead>>({});
  const proximoId = useRef(1);

  useEffect(() => {
    api.estado().then(setEstado, (e: Error) => setErroEstado(e.message));
    api.preferencias().then(setPreferencias, () => {});
  }, []);

  const avisar = useCallback<Contexto['avisar']>((texto, opcoes) => {
    const id = proximoId.current++;
    setAvisos(a => [...a.slice(-2), { id, texto, tipo: opcoes?.tipo ?? 'ok', desfazer: opcoes?.desfazer }]);
    setTimeout(() => setAvisos(a => a.filter(x => x.id !== id)), opcoes?.desfazer ? 6000 : 3500);
  }, []);

  const salvarPreferencias = useCallback(async (p: Partial<Preferencias>) => {
    setPreferencias(await api.salvarPreferencias(p));
  }, []);

  const valor = useMemo<Contexto>(
    () => ({ estado, erroEstado, preferencias, salvarPreferencias, avisar, mudancas, leadMudou: (cnpj, m) => setMudancas(x => ({ ...x, [cnpj]: m })) }),
    [estado, erroEstado, preferencias, salvarPreferencias, avisar, mudancas],
  );

  return (
    <Ctx.Provider value={valor}>
      {children}
      {/* Avisos: anunciados ao leitor de tela sem roubar o foco (aria-live polite). */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {avisos.map(a => (
          <div
            key={a.id}
            className={`pointer-events-auto flex items-center gap-3 rounded-full px-4 py-2.5 text-[14px] font-medium shadow-cartao backdrop-blur-xl [animation:entrar-baixo_.28s_var(--ease-mola)] ${a.tipo === 'erro' ? 'bg-perigo text-white' : 'bg-tinta text-fundo'}`}
          >
            {a.texto}
            {a.desfazer && (
              <button
                type="button"
                className="cursor-pointer font-semibold underline-offset-2 hover:underline"
                onClick={() => {
                  a.desfazer?.();
                  setAvisos(x => x.filter(y => y.id !== a.id));
                }}
              >
                Desfazer
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
