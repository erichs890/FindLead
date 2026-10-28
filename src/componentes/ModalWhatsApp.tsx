import { MessageCircle, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { botaoIcone, botaoPrimario, botaoSecundario, campo } from '../estilos.ts';
import { fmtTelefone } from '../formato.ts';

interface Props {
  telefone: string;
  mensagemInicial: string;
  podeMarcarContatado: boolean;
  aoEnviar: (marcarContatado: boolean) => void;
  aoFechar: () => void;
}

/** Revisa a mensagem antes de abrir o WhatsApp: cada empresa merece pelo menos uma olhada no texto. */
export function ModalWhatsApp({ telefone, mensagemInicial, podeMarcarContatado, aoEnviar, aoFechar }: Props) {
  const id = useId();
  const [mensagem, setMensagem] = useState(mensagemInicial);
  const [marcar, setMarcar] = useState(podeMarcarContatado);
  const texto = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    texto.current?.focus();
    texto.current?.setSelectionRange(0, 0);
  }, []);

  const enviar = () => {
    window.open(`https://wa.me/55${telefone}?text=${encodeURIComponent(mensagem.trim())}`, '_blank', 'noopener,noreferrer');
    aoEnviar(marcar && podeMarcarContatado);
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/30 p-0 [animation:aparecer_.15s] sm:items-center sm:p-6" onMouseDown={e => e.target === e.currentTarget && aoFechar()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            aoFechar();
          }
        }}
        className="w-full max-w-lg rounded-t-3xl bg-superficie p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-cartao [animation:entrar-baixo_.3s_var(--ease-mola)] sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id={`${id}-titulo`} className="font-display text-[19px] font-semibold tracking-[-0.01em]">
              Mensagem no WhatsApp
            </h3>
            <p className="text-[14px] text-tinta-2 tabular-nums">Para {fmtTelefone(telefone)}</p>
          </div>
          <button type="button" onClick={aoFechar} className={`${botaoIcone} -mt-1 -mr-2`} aria-label="Fechar">
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <label htmlFor={`${id}-msg`} className="sr-only">
          Mensagem
        </label>
        <textarea id={`${id}-msg`} ref={texto} rows={7} value={mensagem} onChange={e => setMensagem(e.target.value)} className={`${campo} mt-4 resize-none py-3 leading-relaxed`} />
        <p className="mt-1.5 text-[13px] text-tinta-2">O texto padrão se muda em Ajustes. Aqui você ajusta só para esta empresa.</p>
        {podeMarcarContatado && (
          <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
            <input type="checkbox" checked={marcar} onChange={e => setMarcar(e.target.checked)} className="size-5 accent-[var(--folha)]" />
            Marcar como “Contatado” ao abrir
          </label>
        )}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={aoFechar} className={botaoSecundario}>
            Cancelar
          </button>
          <button type="button" onClick={enviar} disabled={!mensagem.trim()} className={botaoPrimario}>
            <MessageCircle aria-hidden className="size-4" />
            Abrir no WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
