// Classes repetidas em toda a tela. Um lugar só, pra que botão e campo tenham a mesma cara em qualquer página.

export const cartao = 'rounded-2xl bg-superficie shadow-cartao ring-1 ring-linha';

const botaoBase =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-medium transition-[background-color,transform,opacity] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 cursor-pointer select-none';

export const botaoPrimario = `${botaoBase} bg-folha text-sobre-folha hover:brightness-110`;
export const botaoSecundario = `${botaoBase} bg-superficie-2 text-tinta hover:bg-linha-forte`;
export const botaoFantasma = `${botaoBase} text-folha hover:bg-folha-suave`;
export const botaoPerigo = `${botaoBase} bg-perigo-suave text-perigo hover:brightness-95`;
export const botaoIcone = 'inline-flex size-11 items-center justify-center rounded-full text-tinta-2 transition-colors hover:bg-superficie-2 hover:text-tinta active:scale-95 cursor-pointer';

export const campo =
  'min-h-11 w-full rounded-xl bg-superficie-2 px-3.5 text-[15px] text-tinta placeholder:text-tinta-2 outline-none ring-1 ring-transparent transition-shadow focus:ring-2 focus:ring-folha';

export const rotulo = 'mb-1.5 block text-[13px] font-medium text-tinta-2';

export const etiqueta = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium leading-5 whitespace-nowrap';
