import { ChevronRight, Mail, Phone } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { etiqueta } from '../estilos.ts';
import { capitalizar, nomeDe } from '../formato.ts';
import { ROTULO_STATUS, type ItemBusca, type StatusLead } from '../tipos.ts';
import { Frescor } from './Frescor.tsx';

export const COR_STATUS: Record<StatusLead, string> = {
  novo: 'bg-superficie-2 text-tinta',
  contatado: 'bg-folha-suave text-folha',
  respondeu: 'bg-folha text-sobre-folha',
  fechado: 'bg-tinta text-fundo',
  descartado: 'bg-superficie-2 text-tinta-2 line-through',
};

export function EtiquetaStatus({ status }: { status: StatusLead }) {
  return <span className={`${etiqueta} ${COR_STATUS[status]}`}>{ROTULO_STATUS[status]}</span>;
}

function Contato({ tipo, presente, deContador }: { tipo: 'telefone' | 'email'; presente: boolean; deContador: boolean }) {
  const Icone = tipo === 'telefone' ? Phone : Mail;
  const nome = tipo === 'telefone' ? 'Telefone' : 'E-mail';
  const descricao = !presente ? `Sem ${nome.toLowerCase()}` : deContador ? `${nome} provavelmente do contador` : `Tem ${nome.toLowerCase()}`;
  return (
    <span title={descricao} className={`relative inline-flex size-8 items-center justify-center rounded-full ${!presente ? 'text-linha-forte' : deContador ? 'bg-ambar-suave text-ambar' : 'bg-superficie-2 text-tinta'}`}>
      <Icone aria-hidden className="size-4" strokeWidth={2} />
      <span className="sr-only">{descricao}</span>
    </span>
  );
}

/** Uma empresa na lista. A linha inteira é o botão que abre o detalhe. */
export function LinhaLead({ item }: { item: ItemBusca }) {
  const [params, setParams] = useSearchParams();
  const nome = nomeDe(item);
  const abrir = () => {
    const p = new URLSearchParams(params);
    p.set('lead', item.cnpj);
    setParams(p);
  };

  return (
    <li>
      <button type="button" onClick={abrir} className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-superficie-2/60 sm:gap-4 sm:px-5">
        <div className="w-[92px] shrink-0">
          <Frescor abertura={item.abertura} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{nome}</span>
            {item.status && <EtiquetaStatus status={item.status} />}
            {item.mei && <span className={`${etiqueta} bg-superficie-2 text-tinta-2`}>MEI</span>}
          </div>
          <p className="mt-0.5 truncate text-[13px] text-tinta-2">
            {[item.cnaeDescricao, item.municipio && `${capitalizar(item.municipio)}/${item.uf}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          <Contato tipo="telefone" presente={!!item.telefone} deContador={item.telefoneDeContador} />
          <Contato tipo="email" presente={!!item.email} deContador={item.emailDeContador} />
        </div>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-tinta-2 transition-transform group-hover:translate-x-0.5" />
      </button>
    </li>
  );
}
