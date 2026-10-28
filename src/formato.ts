const numero = new Intl.NumberFormat('pt-BR');
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const dataLonga = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const mesAno = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const fmtNumero = (n: number) => numero.format(n);
export const fmtMoeda = (n: number) => moeda.format(n);

const comoData = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);

export const fmtData = (iso: string | null) => (iso ? dataLonga.format(comoData(iso)).replace('.', '') : '—');
export const fmtDataCurta = (iso: string) => dataCurta.format(comoData(iso)).replace('.', '');
export const fmtMesAno = (aaaaMm: string) => mesAno.format(new Date(`${aaaaMm}-01T00:00:00Z`));

export const fmtCnpj = (c: string) => `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;

/** "11987654321" → "(11) 98765-4321" */
export function fmtTelefone(t: string): string {
  const ddd = t.slice(0, 2);
  const n = t.slice(2);
  return n.length === 9 ? `(${ddd}) ${n.slice(0, 5)}-${n.slice(5)}` : `(${ddd}) ${n.slice(0, 4)}-${n.slice(4)}`;
}

/** Celular no Brasil: 9 dígitos começando com 9. Só para esses o botão de WhatsApp faz sentido. */
export const ehCelular = (t: string | null): t is string => !!t && t.length === 11 && t[2] === '9';

/** Dias entre a abertura e hoje (datas em UTC, sem fuso para atrapalhar). */
export function diasDesde(iso: string): number {
  const hoje = new Date();
  const hojeUtc = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.max(0, Math.round((hojeUtc - comoData(iso).getTime()) / 86_400_000));
}

export function idade(dias: number): string {
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'há 1 dia';
  if (dias < 31) return `há ${dias} dias`;
  const meses = Math.round(dias / 30.4);
  if (meses < 12) return meses === 1 ? 'há 1 mês' : `há ${meses} meses`;
  const anos = Math.floor(dias / 365);
  return anos === 1 ? 'há 1 ano' : `há ${anos} anos`;
}

export function haQuantoTempo(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

/** Nome para mostrar: o fantasia quando existe, senão a razão social, já sem a CAIXA ALTA da Receita. */
export const nomeDe = (l: { nomeFantasia: string | null; razaoSocial: string | null }) => capitalizar(l.nomeFantasia ?? l.razaoSocial) ?? 'Sem nome no cadastro';

/** Nomes da Receita vêm em CAIXA ALTA; "PADARIA BOA VISTA LTDA" → "Padaria Boa Vista Ltda". */
export function capitalizar(s: string | null): string | null {
  if (!s) return s;
  const pequenas = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para']);
  const siglas = new Set(['ltda', 'me', 'epp', 'eireli', 'sa', 's/a', 'mei', 'cia']);
  return s
    .toLowerCase()
    .split(/(\s+)/)
    .map((p, i) => {
      if (/^\s+$/.test(p) || (i > 0 && pequenas.has(p))) return p;
      if (siglas.has(p.replace(/[.,]/g, ''))) return p === 'ltda' ? 'Ltda' : p.toUpperCase();
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join('');
}
