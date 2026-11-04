import Link from "next/link";
import { exigirEmpresa } from "@/lib/sessao";
import { dataHora, porUnidade, reais, type Unidade } from "@/lib/dominio";
import { buscarTelefones } from "@/lib/telefones";
import { ConclusaoNegocio } from "@/components/ConclusaoNegocio";
import { cancelarReserva, excluirNegocios, responderReserva } from "./acoes";
import { BarraSelecao, Marcar } from "@/components/Selecao";
import { buscarOcultos } from "@/lib/ocultos";
import { BORDA_CARTAO, Situacao, type TomSituacao } from "@/components/Situacao";
import { BotaoConfirmar } from "@/components/BotaoConfirmar";
import { trocarModo } from "@/app/cadastro/modo";
import { LinkWhatsApp } from "@/components/LinkWhatsApp";

type Negocio = {
  id: string;
  produto: string;
  unidade: Unidade;
  quantidade: number;
  preco_unitario: number;
  origem: "leilao" | "vitrine";
  criado_em: string;
  concluido_comprador_em: string | null;
  concluido_fornecedor_em: string | null;
  comprador: { id: string; nome: string } | null;
  fornecedor: { id: string; nome: string } | null;
};

type Reserva = {
  id: string;
  produto: string;
  unidade: Unidade;
  quantidade: number;
  preco_unitario: number;
  situacao: "aguardando" | "aceita" | "recusada" | "cancelada" | "expirada";
  criado_em: string;
  comprador: { id: string; nome: string } | null;
  fornecedor: { id: string; nome: string } | null;
};

function haSeteDias() {
  return new Date(Date.now() - 7 * 86_400_000).toISOString();
}

// Pedido sem resposta expira em 2 dias (expirar_reservas, migração 0024).
const PRAZO_MS = 2 * 86_400_000;
function prazo(criado: string) {
  return dataHora(new Date(new Date(criado).getTime() + PRAZO_MS).toISOString());
}

const RESPOSTA: Record<"aguardando" | "recusada" | "cancelada" | "expirada", { tom: TomSituacao; texto: string }> = {
  aguardando: { tom: "pedido", texto: "Pedido enviado, aguardando o vendedor aceitar" },
  recusada: { tom: "recusado", texto: "O vendedor recusou" },
  cancelada: { tom: "cancelado", texto: "Você desistiu" },
  expirada: { tom: "cancelado", texto: "O vendedor não respondeu em 2 dias" },
};

// Negócios do modo atual: no Comprar só as compras, no Vender só as vendas.
export default async function Negocios() {
  const { supabase, empresa } = await exigirEmpresa();
  const vendendo = empresa.papel === "fornecedor";
  // Pedidos sem resposta em 2 dias expiram antes de listar; o resto sai ao mesmo tempo.
  const expirou = Promise.resolve(supabase.rpc("expirar_reservas"));

  const [{ data }, comprasOcultas, { data: dadosReservas }, reservasOcultas, { data: minhas }] = await Promise.all([
    supabase
      .from("compras")
      .select(
        "id, produto, unidade, quantidade, preco_unitario, origem, criado_em, concluido_comprador_em, concluido_fornecedor_em, comprador:empresas!compras_comprador_id_fkey(id, nome), fornecedor:empresas!compras_fornecedor_id_fkey(id, nome)",
      )
      .not("fornecedor_id", "is", null)
      .eq(vendendo ? "fornecedor_id" : "comprador_id", empresa.id)
      .order("criado_em", { ascending: false })
      .limit(50),
    buscarOcultos(supabase, "compra"),
    // Pedidos da vitrine esperando o vendedor, e os recusados ou desistidos da última semana.
    expirou.then(() =>
      supabase
        .from("reservas")
        .select(
          "id, produto, unidade, quantidade, preco_unitario, situacao, criado_em, comprador:empresas!reservas_comprador_id_fkey(id, nome), fornecedor:empresas!reservas_fornecedor_id_fkey(id, nome)",
        )
        .or(`situacao.eq.aguardando,respondido_em.gte.${haSeteDias()}`)
        .neq("situacao", "aceita")
        .order("criado_em", { ascending: false })
        .returns<Reserva[]>(),
    ),
    buscarOcultos(supabase, "reserva"),
    supabase.from("avaliacoes").select("compra_id, nota").eq("avaliador_id", empresa.id),
  ]);
  const negocios = ((data ?? []) as unknown as Negocio[]).filter((n) => !comprasOcultas.has(n.id));
  const telefones = await buscarTelefones(supabase, negocios.flatMap((n) => [n.comprador?.id, n.fornecedor?.id]));

  const reservas = (dadosReservas ?? []).filter((r) => !reservasOcultas.has(r.id));
  const pedidosRecebidos = reservas.filter((r) => r.situacao === "aguardando" && r.fornecedor?.id === empresa.id);
  const paraResponder = vendendo ? pedidosRecebidos : [];
  const meusPedidos = vendendo ? [] : reservas.filter((r) => r.comprador?.id === empresa.id);

  const notaDada = new Map((minhas ?? []).map((a) => [a.compra_id as string, a.nota as number]));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{vendendo ? "Minhas vendas" : "Minhas compras"}</h1>
      <p className="text-stone-600">Quando o negócio terminar, confirme aqui. Depois que você e a outra parte confirmarem, cada um avalia o outro, e as notas aparecem no perfil.</p>
      {!vendendo && pedidosRecebidos.length > 0 && (
        <form action={trocarModo} className="aviso flex flex-wrap items-center justify-between gap-2">
          <span>Você tem {pedidosRecebidos.length} pedido(s) de compra esperando sua resposta no modo Vender.</span>
          <input type="hidden" name="papel" value="fornecedor" />
          <input type="hidden" name="voltar" value="/negocios" />
          <button className="botao py-1">Mudar para Vender</button>
        </form>
      )}
      <BarraSelecao id="excluir-negocios" acao={excluirNegocios} confirmar="Tirar {n} item(ns) da sua lista de negócios? Eles somem só para você; a outra parte e as avaliações continuam. Pedido seu ainda aguardando é cancelado." />
      {paraResponder.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Pedidos para você responder</h2>
          <ul className="space-y-3">
            {paraResponder.map((r) => (
              <li key={r.id} className={`cartao space-y-2 ${BORDA_CARTAO.pedido}`}>
                <Situacao tom="pedido">Pedido de compra esperando sua resposta</Situacao>
                <div>
                  <Link href={`/perfil/${r.comprador?.id}`} className="font-medium text-green-800 underline">{r.comprador?.nome}</Link> quer comprar{" "}
                  <strong>{r.quantidade} {r.unidade} de {r.produto}</strong> a {porUnidade(r.preco_unitario, r.unidade)}.
                  <div className="text-sm text-stone-500">{dataHora(r.criado_em)} · total {reais(r.preco_unitario * r.quantidade)} · responda até {prazo(r.criado_em)}</div>
                </div>
                <form action={responderReserva} className="flex gap-2">
                  <input type="hidden" name="reserva" value={r.id} />
                  <button name="resposta" value="aceitar" className="botao">Aceitar</button>
                  <BotaoConfirmar name="resposta" value="recusar" className="botao-secundario" pergunta="Recusar este pedido? A quantidade volta para a sua oferta e o comprador é avisado.">Recusar</BotaoConfirmar>
                </form>
                <p className="text-xs text-stone-500">Ao aceitar, vocês veem o WhatsApp um do outro. Ao recusar, a quantidade volta para a oferta.</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {meusPedidos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Seus pedidos na vitrine</h2>
          <ul className="space-y-3">
            {meusPedidos.map((r) => (
              <li key={r.id} className={`cartao space-y-2 ${BORDA_CARTAO[RESPOSTA[r.situacao as keyof typeof RESPOSTA].tom]}`}>
                <Situacao tom={RESPOSTA[r.situacao as keyof typeof RESPOSTA].tom}>{RESPOSTA[r.situacao as keyof typeof RESPOSTA].texto}</Situacao>
                <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-start gap-3">
                <Marcar form="excluir-negocios" valor={`r:${r.id}`} nome={r.produto} />
                <div>
                  <span className="font-medium">{r.quantidade} {r.unidade} de {r.produto}</span> com {r.fornecedor?.nome}
                  <div className="text-sm text-stone-500">
                    {dataHora(r.criado_em)}
                    {r.situacao === "aguardando" && ` · sem resposta até ${prazo(r.criado_em)}, o pedido é cancelado`}
                  </div>
                </div>
                </div>
                {r.situacao === "aguardando" && (
                  <form action={cancelarReserva}>
                    <input type="hidden" name="reserva" value={r.id} />
                    <BotaoConfirmar className="botao-secundario py-1 text-sm" pergunta="Desistir deste pedido? O vendedor não vai mais poder aceitar.">Desistir</BotaoConfirmar>
                  </form>
                )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {negocios.length === 0 && <p className="cartao text-stone-600">{vendendo ? "Você ainda não fechou vendas pelo app. Suas compras ficam no modo Comprar." : "Você ainda não fechou compras pelo app. Suas vendas ficam no modo Vender."}</p>}
      <ul className="space-y-3">
        {negocios.map((n) => {
          const vendi = n.fornecedor?.id === empresa.id;
          const outro = vendi ? n.comprador : n.fornecedor;
          const nota = notaDada.get(n.id);
          return (
            <li key={n.id} className="cartao space-y-2">
              <Situacao tom="aceito">
                {vendi ? "Venda fechada" : "Compra aceita"}
                {n.concluido_comprador_em && n.concluido_fornecedor_em && <span className="font-normal">· negócio concluído</span>}
              </Situacao>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-start gap-3">
                <Marcar form="excluir-negocios" valor={`c:${n.id}`} nome={n.produto} />
                <div>
                  <span className="font-semibold">{n.produto}</span>
                  <div className="text-sm text-stone-500">
                    {n.quantidade} {n.unidade} a {porUnidade(n.preco_unitario, n.unidade)} · {n.origem === "leilao" ? "leilão" : "vitrine"} · {dataHora(n.criado_em)}
                  </div>
                </div>
                </div>
                {outro && (
                  <div className="text-right text-sm">
                    <Link href={`/perfil/${outro.id}`} className="font-medium text-green-800 underline">{outro.nome}</Link>
                    <div><LinkWhatsApp telefone={telefones.get(outro.id)} className="text-stone-500 underline" /></div>
                  </div>
                )}
              </div>
              {outro && <ConclusaoNegocio compra={n} souComprador={!vendi} nomeOutro={outro.nome} notaDada={nota} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
