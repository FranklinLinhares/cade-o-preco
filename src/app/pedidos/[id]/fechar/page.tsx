import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { exigirEmpresa } from "@/lib/sessao";
import { porUnidade, reais, type Unidade } from "@/lib/dominio";
import { CartaoParte } from "@/components/CartaoParte";
import { escolherVencedor } from "../../acoes";

// Confirmação do vencedor: o comprador vê quem é o fornecedor antes de fechar.
export default async function ConfirmarVencedor({ params, searchParams }: PageProps<"/pedidos/[id]/fechar">) {
  const { id } = await params;
  const { lance: lanceId } = await searchParams;
  const { supabase, empresa } = await exigirEmpresa();

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id, comprador_id, produto, unidade, quantidade, status")
    .eq("id", id)
    .maybeSingle<{ id: string; comprador_id: string; produto: string; unidade: Unidade; quantidade: number; status: string }>();
  if (!pedido || pedido.comprador_id !== empresa.id) notFound();
  if (pedido.status !== "aberto" && pedido.status !== "encerrado") redirect(`/pedidos/${id}`);

  const { data: lance } = await supabase
    .from("lances")
    .select("id, fornecedor_id, preco_unitario, validade, observacao")
    .eq("id", String(lanceId ?? ""))
    .eq("pedido_id", id)
    .maybeSingle<{ id: string; fornecedor_id: string; preco_unitario: number; validade: string | null; observacao: string | null }>();
  if (!lance) notFound();

  // Leilão em grupo: o preço vale para todos, e cada participante ganha a sua compra.
  const { data: resumo } = await supabase.rpc("resumo_grupos", { p_ids: [id] });
  const grupo = ((resumo ?? []) as { participantes: number; quantidade_total: number }[])[0];
  const pessoas = grupo ? Number(grupo.participantes) : 0;
  const total = grupo ? Number(grupo.quantidade_total) : Number(pedido.quantidade);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/pedidos/${id}`} className="text-sm text-stone-500 hover:underline">← Voltar para o leilão</Link>
      <h1 className="text-2xl font-bold">Confirmar negócio</h1>
      <div className="cartao space-y-1">
        <p className="text-lg font-semibold">{pedido.produto}</p>
        <p>
          {pedido.quantidade} {pedido.unidade} a {porUnidade(lance.preco_unitario, pedido.unidade)} · total{" "}
          <strong>{reais(Number(lance.preco_unitario) * Number(pedido.quantidade))}</strong>
        </p>
        {pessoas > 0 && (
          <p className="text-sm">
            Leilão em grupo: mais {pessoas} pessoa{pessoas > 1 ? "s" : ""}, total de {total} {pedido.unidade} ({reais(Number(lance.preco_unitario) * total)}). Se o fornecedor aceitar, cada uma compra a sua parte neste preço.
          </p>
        )}
        {lance.validade && <p className="text-sm text-stone-500">Validade garantida até {new Date(lance.validade).toLocaleDateString("pt-BR")}</p>}
        {lance.observacao && <p className="text-sm">{lance.observacao}</p>}
      </div>
      <CartaoParte supabase={supabase} id={lance.fornecedor_id} como="vendedor" />
      <div className="cartao space-y-2">
        <p className="text-sm text-stone-600">
          Ao confirmar, o leilão fecha com este fornecedor, a compra entra no seu histórico e vocês combinam a entrega pelo WhatsApp.{pessoas > 0 && " Depois, o fornecedor aceita ou recusa vender para cada pessoa do grupo."} Não dá para desfazer.
        </p>
        <form action={escolherVencedor} className="flex flex-wrap gap-2">
          <input type="hidden" name="pedido" value={id} />
          <input type="hidden" name="lance" value={lance.id} />
          <button className="botao">Confirmar negócio</button>
          <Link href={`/pedidos/${id}`} className="botao-secundario">Voltar</Link>
        </form>
      </div>
    </div>
  );
}
