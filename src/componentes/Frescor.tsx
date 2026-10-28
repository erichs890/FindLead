import { diasDesde, fmtData, idade } from '../formato.ts';

/**
 * O "frescor" do lead: quantos dias desde a abertura. É a assinatura do CaçaLead — quanto mais nova a empresa,
 * maior a chance de ainda não ter site — e por isso é a única coisa colorida na linha.
 * Nunca só cor: o anel enche com a idade (cheio = abriu agora) e o texto diz "há 12 dias".
 */
const JANELA_DIAS = 90;

export function Frescor({ abertura, tamanho = 'normal' }: { abertura: string | null; tamanho?: 'normal' | 'grande' }) {
  if (!abertura) return <span className="text-[13px] text-tinta-2">Sem data</span>;
  const dias = diasDesde(abertura);
  const fracao = Math.max(0, 1 - dias / JANELA_DIAS);
  const cor = dias <= 30 ? 'var(--folha)' : dias <= JANELA_DIAS ? 'var(--ambar)' : 'var(--tinta-2)';
  const r = tamanho === 'grande' ? 15 : 9;
  const tracado = tamanho === 'grande' ? 3.5 : 2.5;
  const lado = (r + tracado) * 2;
  const circ = 2 * Math.PI * r;

  return (
    <span className="inline-flex items-center gap-2" title={`Aberta em ${fmtData(abertura)}`}>
      <svg aria-hidden width={lado} height={lado} viewBox={`0 0 ${lado} ${lado}`} className="shrink-0 -rotate-90">
        <circle cx={lado / 2} cy={lado / 2} r={r} fill="none" stroke="var(--linha-forte)" strokeWidth={tracado} />
        {fracao > 0 && (
          <circle cx={lado / 2} cy={lado / 2} r={r} fill="none" stroke={cor} strokeWidth={tracado} strokeLinecap="round" strokeDasharray={`${circ * fracao} ${circ}`} />
        )}
      </svg>
      <span className={`whitespace-nowrap tabular-nums ${tamanho === 'grande' ? 'text-[15px] font-semibold' : 'text-[13px] font-medium'}`} style={{ color: dias <= JANELA_DIAS ? cor : undefined }}>
        <span className="sr-only">Aberta </span>
        {idade(dias)}
      </span>
    </span>
  );
}
