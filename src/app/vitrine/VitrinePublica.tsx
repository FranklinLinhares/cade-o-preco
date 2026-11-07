import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORIAS, PUBLICO, porUnidade, type Categoria, type Publico, type Unidade } from "@/lib/dominio";
import { Situacao } from "@/components/Situacao";

export type OfertaPublica = {
  id: string;
  fornecedor_nome: string;
  agricultor: boolean;
  fornecedor_pj: boolean;
  vende_para: Publico;
  cidade: string;
  uf: string;
  produto: string;
  produto_chave: string;
  categoria: Categoria;
  unidade: Unidade;
  preco_unitario: number;
  quantidade_disponivel: number;
  validade: string | null;
  disponivel_a_partir: string | null;
  valida_ate: string;
  descricao: string | null;
  so_na_loja: boolean;
};

// Vitrine para quem ainda não tem conta: as ofertas abertas a todos, de todas as
// cidades, sem telefone nem localização de quem vende. Para comprar, cria a conta.
export async function VitrinePublica({ supabase, termo }: { supabase: SupabaseClient; termo: string }) {
  const { data } = await supabase.rpc("vitrine_publica", { termo: termo || null });
  const ofertas = (data ?? []) as OfertaPublica[];

  const grupos = new Map<string, OfertaPublica[]>();
  for (const o of ofertas) {
    const chave = `${o.produto_chave}|${o.unidade}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), o]);
  }
  const porCategoria = new Map<Categoria, OfertaPublica[][]>();
  for (const lista of grupos.values()) {
    const cat = lista[0].categoria;
    porCategoria.set(cat, [...(porCategoria.get(cat) ?? []), lista]);
  }
  const ordem = (Object.keys(CATEGORIAS) as Categoria[]).filter((c) => porCategoria.has(c));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Vitrine</h1>
      <div className="cartao space-y-3 border-green-700 bg-green-50">
        <p>
          Você está vendo ofertas de todas as cidades. Crie sua conta grátis para ver só quem entrega perto de você,
          comprar pelo app, abrir leilões e receber alertas de preço.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/entrar?modo=criar&volta=/vitrine" className="botao">Criar conta grátis</Link>
          <Link href="/entrar?volta=/vitrine" className="botao-secundario">Já tenho conta</Link>
        </div>
      </div>
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={termo} placeholder="Produto ou cidade: tomate, arroz, João Pessoa..." className="campo min-w-48 flex-1" />
        <button className="botao">Buscar</button>
      </form>

      {grupos.size === 0 && (
        <p className="cartao text-stone-600">Nenhuma oferta encontrada{termo ? ` para “${termo}”` : ""}.</p>
      )}

      {ordem.map((cat) => (
        <section key={cat} className="cartao space-y-3">
          <h2 className="text-lg font-bold">{CATEGORIAS[cat]}</h2>
          {porCategoria.get(cat)!.map((lista) => {
            const precos = lista.map((o) => Number(o.preco_unitario));
            const u = lista[0].unidade;
            return (
              <div key={`${lista[0].produto_chave}|${u}`} className="space-y-2 rounded-lg border border-stone-200 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{lista[0].produto}</h3>
                  {lista.length > 1 && (
                    <span className="text-sm text-stone-500">
                      {lista.length} ofertas, de {porUnidade(Math.min(...precos), u)} a {porUnidade(Math.max(...precos), u)}
                    </span>
                  )}
                </div>
                <ul className="divide-y divide-stone-100">
                  {lista.map((o) => (
                    <li key={o.id} className="space-y-1 py-2">
                      {o.so_na_loja && <Situacao tom="loja">Promoção na loja, em {o.cidade}</Situacao>}
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <span className="font-medium">{o.fornecedor_nome}</span>
                          <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">{o.fornecedor_pj ? "Empresa" : "Pessoa física"}</span>
                          {o.vende_para !== "todos" && <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-900">{PUBLICO[o.vende_para]}</span>}
                          {o.agricultor && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Agricultura familiar</span>}
                          <div className="text-sm text-stone-500">
                            {o.cidade}/{o.uf}
                            {(!o.so_na_loja || Number(o.quantidade_disponivel) > 0) && <> · {o.quantidade_disponivel} {u} disponíveis</>}
                          </div>
                        </div>
                        <div className="ml-auto text-right">
                          <div className="font-bold text-green-800">{porUnidade(o.preco_unitario, u)}</div>
                          <Link href={`/vitrine/${o.id}`} className="text-sm text-green-800 underline">Ver oferta</Link>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
