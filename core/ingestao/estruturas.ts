/**
 * Conjunto de CNPJs básicos (8 dígitos) em 12,5 MB: um bit por número possível.
 * Guarda quais empresas têm estabelecimento importado, pra filtrar Empresas e Simples (60 milhões de linhas
 * cada) sem consultar a base — um `Set<string>` com 10 milhões de CNPJs passaria de 600 MB.
 */
export class ConjuntoCnpj {
  private readonly bits = new Uint8Array(100_000_000 / 8);
  tamanho = 0;

  /** Devolve true se o CNPJ ainda não estava no conjunto. */
  adicionar(cnpjBasico: string): boolean {
    const n = Number(cnpjBasico);
    const byte = n >>> 3;
    const mascara = 1 << (n & 7);
    if ((this.bits[byte]! & mascara) !== 0) return false;
    this.bits[byte]! |= mascara;
    this.tamanho++;
    return true;
  }

  tem(cnpjBasico: string): boolean {
    const n = Number(cnpjBasico);
    return (this.bits[n >>> 3]! & (1 << (n & 7))) !== 0;
  }
}

function fnv1a(texto: string, semente: number): number {
  let hash = semente;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Contador aproximado (count-min sketch, 2 × 32 MB) de quantas empresas usam o mesmo e-mail ou telefone.
 *
 * Roda sobre TODAS as matrizes do Brasil, não só as filtradas: é assim que se descobre que um e-mail é do
 * escritório de contabilidade (aparece em dezenas de empresas) mesmo importando uma cidade só. Contar só as
 * importadas acharia o contador de quem tem muito cliente na sua cidade e deixaria passar os outros.
 * Conta só matrizes porque uma empresa com cinco filiais usa o próprio e-mail cinco vezes, e isso não é contador.
 * Pode superestimar por colisão (raro neste tamanho), nunca subestima.
 */
export class ContadorDeContatos {
  private static readonly BITS = 25;
  private readonly a = new Uint8Array(1 << ContadorDeContatos.BITS);
  private readonly b = new Uint8Array(1 << ContadorDeContatos.BITS);

  private posicoes(chave: string): [number, number] {
    const desloc = 32 - ContadorDeContatos.BITS;
    return [fnv1a(chave, 0x811c9dc5) >>> desloc, fnv1a(chave, 0x050c5d1f) >>> desloc];
  }

  adicionar(chave: string): void {
    const [i, j] = this.posicoes(chave);
    if (this.a[i]! < 255) this.a[i]!++;
    if (this.b[j]! < 255) this.b[j]!++;
  }

  contar(chave: string): number {
    const [i, j] = this.posicoes(chave);
    return Math.min(this.a[i]!, this.b[j]!);
  }
}
