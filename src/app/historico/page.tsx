import { redirect } from "next/navigation";
import { exigirEmpresa } from "@/lib/sessao";
import { porUnidade, type Unidade } from "@/lib/dominio";
import { FormularioCompra } from "./FormularioCompra";
import { Economia } from "./Economia";
import { ocultarHistorico } from "./acoes";
import { BarraSelecao, Marcar } from "@/components/Selecao";
import { buscarOcultos } from "@/lib/ocultos";

type Semana = {
  produto_chave: string;
  produto: string;
  unidade: Unidade;
  semana: string;
  preco_medio: number;
  quantidade: number;
  variacao_pct: number | null;
};

function dozeSemanasAtras() {
  return new Date(Date.now() - 12 * 7 * 86_400_000).toISOString().slice(0, 10);
}

// Quanto o comprador pagou por produto, semana a semana, e a variação.
export default async function Historico() {
  const { supabase, empresa } = await exigirEmpresa();
  if (empresa.papel !== "comprador") redirect("/ofertas");

  const [{ data }, ocultos] = await Promise.all([
    supabase
      .from("historico_semanal")
      .select("*")
      .eq("comprador_id", empresa.id)
      .gte("semana", dozeSemanasAtras())
      .order("semana", { ascending: false }),
    buscarOcultos(supabase, "historico"),
  ]);
  const porProduto = new Map<string, Semana[]>();
  for (const s of (data ?? []) as Semana[]) {
    const chave = `${s.produto_chave}|${s.unidade}`;
    if (ocultos.has(chave)) continue;
    porProduto.set(chave, [...(porProduto.get(chave) ?? []), s]);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Meus preços</h1>
      <p className="text-stone-600">Preço médio pago por semana nas últimas 12 semanas, com a variação em relação à semana anterior.</p>
      <Economia supabase={supabase} comprador={empresa.id} />
      <FormularioCompra />
      {porProduto.size === 0 && <p className="text-stone-600">Suas compras aparecerão aqui.</p>}
      <BarraSelecao id="ocultar-historico" acao={ocultarHistorico} confirmar="Tirar {n} produto(s) de Meus preços? Eles somem só desta tela." />
      <div className="grid gap-3 sm:grid-cols-2">
        {[...porProduto.values()].map((semanas) => {
          const atual = semanas[0];
          const maior = Math.max(...semanas.map((s) => Number(s.preco_medio)));
          return (
            <section key={`${atual.produto_chave}|${atual.unidade}`} className="cartao space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="flex items-start gap-2 font-semibold">
                  <Marcar form="ocultar-historico" valor={`${atual.produto_chave}|${atual.unidade}`} nome={atual.produto} />
                  {atual.produto}
                </h2>
                <Variacao valor={atual.variacao_pct} />
              </div>
              <ul className="space-y-1 text-sm">
                {semanas.map((s) => (
                  <li key={s.semana} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2">
                    <span className="text-stone-500">{new Date(`${s.semana}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                    <span className="h-2 rounded-full bg-green-700/70" style={{ width: `${(100 * Number(s.preco_medio)) / maior}%` }} />
                    <span className="font-medium">{porUnidade(s.preco_medio, s.unidade)}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Variacao({ valor }: { valor: number | null }) {
  if (valor == null) return <span className="text-sm text-stone-500">primeira semana</span>;
  const v = Number(valor);
  const cor = v > 0 ? "text-red-700" : v < 0 ? "text-green-700" : "text-stone-500";
  return <span className={`text-sm font-semibold ${cor}`}>{v > 0 ? "▲" : v < 0 ? "▼" : "="} {Math.abs(v).toLocaleString("pt-BR")}% na semana</span>;
}
