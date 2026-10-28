const inicio = Date.now();

function decorrido(): string {
  const s = Math.floor((Date.now() - inicio) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function anotar(msg: string): void {
  console.log(`[${decorrido()}] ${msg}`);
}

export function avisar(msg: string): void {
  console.warn(`[${decorrido()}] ⚠ ${msg}`);
}

const numero = new Intl.NumberFormat('pt-BR');

export function fmt(n: number): string {
  return numero.format(n);
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** Executa `fn` no máximo a cada `intervaloMs`, a primeira vez só depois de um intervalo (arquivo rápido não relata nada). */
export function aCada(intervaloMs: number, fn: () => void): () => void {
  let ultima = Date.now();
  return () => {
    const agora = Date.now();
    if (agora - ultima >= intervaloMs) {
      ultima = agora;
      fn();
    }
  };
}
