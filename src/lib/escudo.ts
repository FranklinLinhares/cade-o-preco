// Escudo de preço: compara um preço com a média de mercado do mesmo produto e unidade.

import type { ReferenciaPreco, Unidade } from "@/lib/dominio";

export type MediaMercado = { media: number; fonte: string };

// Diferença abaixo deste percentual conta como "na média".
const TOLERANCIA_PCT = 5;

export type Selo = { tom: "abaixo" | "media" | "acima"; texto: string; pct: number };

export function compararComMedia(preco: number, media: number): Selo | null {
  if (!(preco > 0) || !(media > 0)) return null;
  const pct = Math.round((preco / media - 1) * 100);
  if (pct <= -TOLERANCIA_PCT) return { tom: "abaixo", texto: `${-pct}% abaixo da média`, pct };
  if (pct >= TOLERANCIA_PCT) return { tom: "acima", texto: `${pct}% acima da média`, pct };
  return { tom: "media", texto: "Na média do mercado", pct };
}

// Média das ofertas da vitrine; só vale com pelo menos duas para comparar.
export function mediaDasOfertas(precos: number[]): MediaMercado | null {
  if (precos.length < 2) return null;
  const media = precos.reduce((a, b) => a + b, 0) / precos.length;
  return { media, fonte: `média de ${precos.length} ofertas na vitrine` };
}

// Para um leilão: ofertas próximas primeiro; sem elas, a referência salva ao criar o leilão.
export function mediaParaPedido(
  precosOfertas: number[],
  referencia: ReferenciaPreco | null,
  unidade: Unidade,
): MediaMercado | null {
  const daVitrine = mediaDasOfertas(precosOfertas);
  if (daVitrine) return daVitrine;
  if (referencia?.medio && referencia.unidade === unidade) {
    return { media: Number(referencia.medio), fonte: "referência de preço salva ao criar o leilão" };
  }
  return null;
}
