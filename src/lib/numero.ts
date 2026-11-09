// Número digitado do jeito brasileiro: "4,50", "1.500" (mil e quinhentos),
// "1.234,56", "R$ 4,50". Também aceita "4.5" (ponto como decimal, sem milhar).
export function lerNumero(valor: unknown): number {
  if (typeof valor === "number") return valor;
  const v = String(valor ?? "").replace(/[R$\s]/g, "");
  if (v.includes(",")) return Number(v.replace(/\./g, "").replace(",", "."));
  // Só pontos separando grupos de 3 dígitos: é milhar ("1.500", "12.000").
  if (/^\d{1,3}(\.\d{3})+$/.test(v)) return Number(v.replace(/\./g, ""));
  return Number(v);
}
