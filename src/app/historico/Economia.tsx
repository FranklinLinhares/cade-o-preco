import type { SupabaseClient } from "@supabase/supabase-js";
import { reais, type ReferenciaPreco, type Unidade } from "@/lib/dominio";

type CompraDeLeilao = {
  data: string;
  unidade: Unidade;
  quantidade: number;
  preco_unitario: number;
  pedidos: { referencia_preco: ReferenciaPreco | null; lances: { preco_unitario: number }[] } | null;
};

type Mes = { mes: string; gasto: number; economia: number; leiloes: number };

function seisMesesAtras() {
  const d = new Date();
  d.setMonth(d.getMonth() - 5, 1);
  return d.toISOString().slice(0, 10);
}

// Preço com que o vencedor é comparado: o preço de referência salvo ao criar o
// leilão ou, sem ela, a média dos lances recebidos (só quando houve disputa).
function precoDeComparacao(c: CompraDeLeilao) {
  const ref = c.pedidos?.referencia_preco;
  if (ref?.medio && ref.unidade === c.unidade) return Number(ref.medio);
  const lances = c.pedidos?.lances ?? [];
  if (lances.length < 2) return null;
  return lances.reduce((soma, l) => soma + Number(l.preco_unitario), 0) / lances.length;
}

// Quanto o comprador deixou de gastar nos leilões fechados, mês a mês.
export async function Economia({ supabase, comprador }: { supabase: SupabaseClient; comprador: string }) {
  const { data } = await supabase
    .from("compras")
    .select("data, unidade, quantidade, preco_unitario, pedidos(referencia_preco, lances(preco_unitario))")
    .eq("comprador_id", comprador)
    .eq("origem", "leilao")
    .gte("data", seisMesesAtras())
    .order("data", { ascending: false })
    .returns<CompraDeLeilao[]>();

  const meses = new Map<string, Mes>();
  for (const c of data ?? []) {
    const base = precoDeComparacao(c);
    if (base == null) continue;
    const mes = c.data.slice(0, 7);
    const m = meses.get(mes) ?? { mes, gasto: 0, economia: 0, leiloes: 0 };
    m.gasto += Number(c.preco_unitario) * Number(c.quantidade);
    m.economia += (base - Number(c.preco_unitario)) * Number(c.quantidade);
    m.leiloes += 1;
    meses.set(mes, m);
  }
  const lista = [...meses.values()];
  const total = lista.reduce((s, m) => s + m.economia, 0);
  const gasto = lista.reduce((s, m) => s + m.gasto, 0);

  return (
    <section className="cartao space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Quanto você economizou</h2>
        <span className="text-xs text-stone-500">leilões fechados nos últimos 6 meses</span>
      </div>
      {lista.length === 0 ? (
        <p className="text-sm text-stone-600">
          Quando você fechar um leilão, mostramos aqui a diferença entre o preço vencedor e a média do mercado (ou a média dos lances recebidos).
        </p>
      ) : (
        <>
          <p>
            <span className={`text-2xl font-bold ${total >= 0 ? "text-green-800" : "text-red-700"}`}>{reais(Math.abs(total))}</span>{" "}
            <span className="text-stone-600">
              {total >= 0 ? "a menos" : "a mais"} que a média
              {gasto + total > 0 && <> ({Math.abs(Math.round((100 * total) / (gasto + total)))}%)</>}
            </span>
          </p>
          <ul className="divide-y divide-stone-100 text-sm">
            {lista.map((m) => (
              <li key={m.mes} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
                <span className="capitalize">
                  {new Date(`${m.mes}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                  <span className="text-stone-500"> · {m.leiloes} leil{m.leiloes > 1 ? "ões" : "ão"}</span>
                </span>
                <span className={`font-medium ${m.economia >= 0 ? "text-green-800" : "text-red-700"}`}>
                  {reais(Math.abs(m.economia))} {m.economia >= 0 ? "a menos" : "a mais"}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-stone-500">
            Comparação com o preço de referência salvo ao criar o leilão; sem ele, com a média dos lances recebidos.
          </p>
        </>
      )}
    </section>
  );
}
