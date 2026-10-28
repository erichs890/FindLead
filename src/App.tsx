import { useEffect, useRef } from 'react';
import { Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { DetalheLead } from './componentes/DetalheLead.tsx';
import { Navegacao } from './componentes/Navegacao.tsx';
import { Ajustes } from './paginas/Ajustes.tsx';
import { Buscar } from './paginas/Buscar.tsx';
import { Leads } from './paginas/Leads.tsx';
import { Painel } from './paginas/Painel.tsx';

/**
 * O detalhe do lead abre por `?lead=<cnpj>` em qualquer página: a lista por baixo fica intacta (filtros, rolagem),
 * o link pode ser guardado, e o "voltar" do navegador fecha o painel em vez de perder a busca.
 */
export function App() {
  const [params, setParams] = useSearchParams();
  const lead = params.get('lead');
  const { pathname } = useLocation();
  const principal = useRef<HTMLElement>(null);

  // Troca de página: foco no conteúdo, pra quem usa leitor de tela saber que mudou.
  useEffect(() => {
    principal.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [pathname]);

  const fecharLead = () => {
    const p = new URLSearchParams(params);
    p.delete('lead');
    setParams(p);
  };

  return (
    <div className="min-h-dvh md:pl-60">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-lg focus:bg-superficie focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>
      <Navegacao />
      <main id="conteudo" ref={principal} tabIndex={-1} className="mx-auto max-w-5xl px-4 pt-6 pb-32 outline-none sm:px-6 md:px-10 md:pt-10 md:pb-16">
        <Routes>
          <Route path="/" element={<Buscar />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/painel" element={<Painel />} />
          <Route path="/ajustes" element={<Ajustes />} />
        </Routes>
      </main>
      {lead && /^\d{14}$/.test(lead) && <DetalheLead cnpj={lead} aoFechar={fecharLead} />}
    </div>
  );
}
