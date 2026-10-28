import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { campo } from '../estilos.ts';
import type { Opcao } from '../tipos.ts';

interface Props {
  rotulo: string;
  placeholder: string;
  valor: Opcao | null;
  aoMudar: (o: Opcao | null) => void;
  buscar: (q: string, sinal: AbortSignal) => Promise<Opcao[]>;
  /** Texto extra de cada opção (ex.: código do CNAE). */
  detalhe?: (o: Opcao) => string;
  desabilitado?: boolean;
}

/**
 * Combobox no padrão ARIA 1.2: teclado (↑ ↓ Enter Esc), leitor de tela anuncia a opção ativa, e a busca só
 * dispara 200 ms depois da última tecla (cancelando a anterior) pra não martelar o servidor a cada letra.
 */
export function Autocompletar({ rotulo, placeholder, valor, aoMudar, buscar, detalhe, desabilitado }: Props) {
  const id = useId();
  const [texto, setTexto] = useState('');
  const [opcoes, setOpcoes] = useState<Opcao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [ativa, setAtiva] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto || texto.trim().length < 2) {
      setOpcoes([]);
      return;
    }
    const controle = new AbortController();
    setCarregando(true);
    const t = setTimeout(() => {
      buscar(texto, controle.signal)
        .then(o => {
          setOpcoes(o);
          setAtiva(0);
        })
        .catch(() => {})
        .finally(() => setCarregando(false));
    }, 200);
    return () => {
      clearTimeout(t);
      controle.abort();
    };
  }, [texto, aberto, buscar]);

  const escolher = (o: Opcao) => {
    aoMudar(o);
    setTexto('');
    setAberto(false);
  };

  if (valor) {
    return (
      <div>
        <span className={`mb-1.5 block text-[13px] font-medium text-tinta-2`}>{rotulo}</span>
        <div className="flex min-h-11 items-center gap-2 rounded-xl bg-folha-suave pr-1 pl-3.5 text-[15px]">
          <span className="min-w-0 flex-1 truncate font-medium text-folha" title={valor.nome}>
            {valor.nome}
            {detalhe && <span className="ml-1.5 font-normal opacity-80">{detalhe(valor)}</span>}
          </span>
          <button
            type="button"
            onClick={() => {
              aoMudar(null);
              requestAnimationFrame(() => entrada.current?.focus());
            }}
            aria-label={`Limpar ${rotulo.toLowerCase()}`}
            className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-folha hover:bg-folha-suave"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  const listaId = `${id}-lista`;
  const mostrar = aberto && texto.trim().length >= 2;
  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-tinta-2">
        {rotulo}
      </label>
      <input
        id={id}
        ref={entrada}
        type="text"
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={listaId}
        aria-autocomplete="list"
        aria-activedescendant={mostrar && opcoes[ativa] ? `${id}-${ativa}` : undefined}
        autoComplete="off"
        disabled={desabilitado}
        placeholder={placeholder}
        className={campo}
        value={texto}
        onChange={e => {
          setTexto(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 120)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAtiva(a => Math.min(a + 1, opcoes.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setAtiva(a => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && opcoes[ativa]) {
            e.preventDefault();
            escolher(opcoes[ativa]);
          } else if (e.key === 'Escape') {
            setAberto(false);
          }
        }}
      />
      {mostrar && (
        <ul
          id={listaId}
          role="listbox"
          aria-label={rotulo}
          className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-72 overflow-auto rounded-xl bg-superficie p-1.5 shadow-cartao ring-1 ring-linha [animation:aparecer_.12s]"
        >
          {opcoes.length === 0 ? (
            <li className="px-3 py-2.5 text-[14px] text-tinta-2">{carregando ? 'Procurando…' : 'Nada encontrado com esse texto.'}</li>
          ) : (
            opcoes.map((o, i) => (
              <li
                key={o.codigo}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === ativa}
                onMouseDown={e => {
                  e.preventDefault();
                  escolher(o);
                }}
                onMouseEnter={() => setAtiva(i)}
                className={`cursor-pointer rounded-lg px-3 py-2 text-[14px] leading-snug ${i === ativa ? 'bg-folha-suave text-tinta' : 'text-tinta'}`}
              >
                {o.nome}
                {(detalhe || o.uf) && <span className="ml-1.5 text-tinta-2">{detalhe ? detalhe(o) : o.uf}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
