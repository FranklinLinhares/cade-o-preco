import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirEmpresa } from "@/lib/sessao";
import { CATEGORIAS, dataHora, porUnidade, reais, type Categoria, type ReferenciaPreco as Referencia, type Unidade } from "@/lib/dominio";
import { ReferenciaPreco } from "@/components/ReferenciaPreco";
import { SeloPreco } from "@/components/SeloPreco";
import { mediaParaPedido } from "@/lib/escudo";
import { Estrelas } from "@/components/Estrelas";
import { buscarReputacao } from "@/lib/reputacao";
import { buscarTelefones } from "@/lib/telefones";
import { ConclusaoNegocio, type EstadoConclusao } from "@/components/ConclusaoNegocio";
import { cancelarPedido } from "../acoes";
import { trocarModo } from "@/app/cadastro/modo";
import { LinkWhatsApp } from "@/components/LinkWhatsApp";
import { AoVivo } from "./AoVivo";
import { DarLance } from "./DarLance";
import { BotaoConfirmar } from "@/components/BotaoConfirmar";

type Pedido = {
  id: string;
  comprador_id: string;
  produto: string;
  produto_chave: string;
  categoria: Categoria;
  unidade: Unidade;
  quantidade: number;
  especificacoes: string | null;
  validade_minima_dias: number | null;
  entrega_ate: string | null;
  preco_maximo: number | null;
  lances_visiveis: boolean;
  encerra_em: string;
  status: "aberto" | "encerrado" | "fechado" | "cancelado";
  lance_vencedor_id: string | null;
  referencia_preco: Referencia | null;
  convidados: string[] | null;
  comprador: { nome: string; cidade: string };
};
type Lance = {
  id: string;
  fornecedor_id: string;
  preco_unitario: number;
  validade: string | null;
  observacao: string | null;
  criado_em: string;
  fornecedor: { nome: string; cidade: string; agricultor: boolean } | null;
};

export default async function DetalhePedido({ params }: PageProps<"/pedidos/[id]">) {
  const { id } = await params;
  const { supabase, empresa } = await exigirEmpresa();

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("*, comprador:empresas!pedidos_comprador_id_fkey(nome, cidade)")
    .eq("id", id)
    .maybeSingle<Pedido>();
  if (!pedido) notFound();

  // A política de segurança já filtra os lances conforme a visibilidade escolhida.
  const { data } = await supabase
    .from("lances")
    .select("*, fornecedor:empresas!lances_fornecedor_id_fkey(nome, cidade, agricultor)")
    .eq("pedido_id", id)
    .order("preco_unitario")
    .order("criado_em");
  const lances = (data ?? []) as Lance[];

  // Escudo de preço: ofertas do mesmo produto na vitrine perto de quem vê a página.
  const { data: ofertas } = await supabase.rpc("vitrine_ofertas", { termo: pedido.produto_chave });
  const precosOfertas = ((ofertas ?? []) as { produto_chave: string; unidade: Unidade; preco_unitario: number }[])
    .filter((o) => o.produto_chave === pedido.produto_chave && o.unidade === pedido.unidade)
    .map((o) => Number(o.preco_unitario));
  const mercado = mediaParaPedido(precosOfertas, pedido.referencia_preco, pedido.unidade);
  const reputacao = await buscarReputacao(supabase, [pedido.comprador_id, ...lances.map((l) => l.fornecedor_id)]);
  const repComprador = reputacao.get(pedido.comprador_id);


  const souComprador = pedido.comprador_id === empresa.id;
  // Leilão só para convidados: quem não está na lista vê o leilão, mas não pode dar lance.
  const possoDarLance = !pedido.convidados || pedido.convidados.includes(empresa.id);
  const u = pedido.unidade;
  const aberto = pedido.status === "aberto" && new Date(pedido.encerra_em) > new Date();
  const vencedor = lances.find((l) => l.id === pedido.lance_vencedor_id);
  const souVencedor = vencedor?.fornecedor_id === empresa.id;
  // O WhatsApp da outra parte só aparece depois do negócio fechado.
  const telefones = await buscarTelefones(supabase, vencedor ? [vencedor.fornecedor_id, pedido.comprador_id] : []);
  // Negócio fechado: comprador e vencedor avaliam um ao outro ali mesmo.
  let compraFechada: EstadoConclusao | null = null;
  let notaDada: number | undefined;
  if (pedido.status === "fechado" && (souComprador || souVencedor)) {
    const { data: compra } = await supabase
      .from("compras")
      .select("id, concluido_comprador_em, concluido_fornecedor_em")
      .eq("pedido_id", id)
      .maybeSingle<EstadoConclusao>();
    compraFechada = compra ?? null;
    if (compraFechada) {
      const { data: minha } = await supabase
        .from("avaliacoes")
        .select("nota")
        .eq("compra_id", compraFechada.id)
        .eq("avaliador_id", empresa.id)
        .maybeSingle();
      notaDada = (minha?.nota as number | undefined) ?? undefined;
    }
  }

  const meuMenor = lances.filter((l) => l.fornecedor_id === empresa.id).at(0);
  const menor = lances.at(0);

  let dica = "Quanto menor o preço, maior a chance de vencer.";
  if (pedido.lances_visiveis && menor) dica = `O menor lance atual é ${porUnidade(menor.preco_unitario, u)}. Seu lance precisa ser menor.`;
  if (!pedido.lances_visiveis) dica = meuMenor
    ? `Leilão fechado. Seu último lance foi ${porUnidade(meuMenor.preco_unitario, u)}; você pode baixar.`
    : "Leilão fechado: você não vê os outros lances.";
  if (pedido.preco_maximo) dica += ` Preço máximo: ${porUnidade(pedido.preco_maximo, u)}.`;

  return (
    <div className="space-y-4">
      <AoVivo pedido={id} />
      <div className="cartao space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold">{pedido.produto}</h1>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-sm">
            {pedido.status === "aberto" ? (aberto ? `Encerra ${dataHora(pedido.encerra_em)}` : "Prazo encerrado") : pedido.status}
          </span>
        </div>
        <p className="text-stone-600">
          {pedido.quantidade} {u} · {CATEGORIAS[pedido.categoria]} ·{" "}
          <Link href={`/perfil/${pedido.comprador_id}`} className="hover:underline">{pedido.comprador.nome}</Link>, {pedido.comprador.cidade}{" "}
          <Estrelas nota={repComprador?.nota_comprador} total={repComprador?.avaliacoes_comprador} />
        </p>
        {pedido.especificacoes && <p>{pedido.especificacoes}</p>}
        <p className="text-sm text-stone-500">
          {pedido.entrega_ate && <>Entrega até {new Date(pedido.entrega_ate).toLocaleDateString("pt-BR")} · </>}
          {pedido.validade_minima_dias != null && <>Validade mínima de {pedido.validade_minima_dias} dias · </>}
          {pedido.lances_visiveis ? "Leilão aberto" : "Leilão fechado"}
          {pedido.convidados && <> · Só para {pedido.convidados.length} fornecedor{pedido.convidados.length > 1 ? "es" : ""} convidado{pedido.convidados.length > 1 ? "s" : ""}</>}
        </p>
      </div>

      {souComprador && pedido.referencia_preco && (
        <div className="space-y-2">
          <h2 className="font-semibold">Preço de referência pesquisado pela IA</h2>
          <ReferenciaPreco referencia={pedido.referencia_preco} />
        </div>
      )}

      {vencedor && (souComprador || souVencedor) && (
        <div className="cartao border-green-700 bg-green-50">
          <h2 className="font-semibold">Negócio fechado: {porUnidade(vencedor.preco_unitario, u)}</h2>
          {souComprador ? (
            <p>Fornecedor: {vencedor.fornecedor?.nome} ({vencedor.fornecedor?.cidade}) · <LinkWhatsApp telefone={telefones.get(vencedor.fornecedor_id)} /></p>
          ) : (
            <p>Você venceu! Comprador: {pedido.comprador.nome} · <LinkWhatsApp telefone={telefones.get(pedido.comprador_id)} /></p>
          )}
          {compraFechada && (
            <div className="mt-3 border-t border-green-200 pt-3">
              <ConclusaoNegocio
                compra={compraFechada}
                souComprador={souComprador}
                nomeOutro={(souComprador ? vencedor.fornecedor?.nome : pedido.comprador.nome) ?? ""}
                notaDada={notaDada}
              />
            </div>
          )}
        </div>
      )}

      {!souComprador && empresa.papel === "fornecedor" && aberto && !possoDarLance && (
        <p className="aviso">Este leilão é só para fornecedores convidados pelo comprador.</p>
      )}
      {!souComprador && empresa.papel === "fornecedor" && aberto && possoDarLance && <DarLance pedido={id} unidade={u} dica={dica} mercado={mercado} />}
      {!souComprador && empresa.papel === "comprador" && aberto && (
        <form action={trocarModo} className="aviso flex flex-wrap items-center justify-between gap-2">
          <span>Você está no modo Comprar. Para dar lance neste leilão, mude para Vender.</span>
          <input type="hidden" name="papel" value="fornecedor" />
          <input type="hidden" name="voltar" value={`/pedidos/${id}`} />
          <button className="botao py-1">Mudar para Vender</button>
        </form>
      )}

      <section className="cartao space-y-2">
        <h2 className="font-semibold">
          Lances ({lances.length}){!souComprador && !pedido.lances_visiveis && " · você vê apenas os seus"}
        </h2>
        {lances.length === 0 && <p className="text-sm text-stone-500">Nenhum lance ainda.</p>}
        <ol className="divide-y divide-stone-100">
          {lances.map((l, i) => {
            const meu = l.fornecedor_id === empresa.id;
            return (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="font-semibold">{i + 1}º · {porUnidade(l.preco_unitario, u)}</span>
                  {(souComprador || meu) && <span className="ml-2"><SeloPreco preco={l.preco_unitario} mercado={mercado} unidade={u} /></span>}
                  <span className="ml-2 text-sm text-stone-500">
                    {souComprador ? (
                      <>
                        <Link href={`/perfil/${l.fornecedor_id}`} className="hover:underline">{l.fornecedor?.nome}</Link> ({l.fornecedor?.cidade}){" "}
                        <Estrelas nota={reputacao.get(l.fornecedor_id)?.nota_vendedor} total={reputacao.get(l.fornecedor_id)?.avaliacoes_vendedor} />
                      </>
                    ) : meu ? "Seu lance" : "Concorrente"}
                    {l.fornecedor?.agricultor && souComprador && " · agricultor"}
                    {" · "}{dataHora(l.criado_em)}
                  </span>
                  {l.observacao && (souComprador || meu) && <div className="text-sm">{l.observacao}</div>}
                </div>
                {souComprador && (pedido.status === "aberto" || pedido.status === "encerrado") && (
                  // Escolher leva à confirmação, que mostra quem é o fornecedor antes de fechar.
                  <Link href={`/pedidos/${id}/fechar?lance=${l.id}`} className={i === 0 ? "botao py-1" : "botao-secundario py-1"}>Escolher</Link>
                )}
              </li>
            );
          })}
        </ol>
        {souComprador && mercado && lances.length > 0 && (
          <p className="text-xs text-stone-500">Os selos comparam cada lance com a {mercado.fonte}: {porUnidade(mercado.media, u)}.</p>
        )}
        {souComprador && <p className="text-xs text-stone-500">Total do menor lance: {menor ? reais(Number(menor.preco_unitario) * Number(pedido.quantidade)) : "–"}</p>}
      </section>

      {souComprador && pedido.status === "aberto" && (
        <form action={cancelarPedido}>
          <input type="hidden" name="pedido" value={id} />
          <BotaoConfirmar className="text-sm text-red-700 hover:underline" pergunta="Cancelar este leilão? Os fornecedores não poderão mais dar lances e não dá para reabrir.">Cancelar leilão</BotaoConfirmar>
        </form>
      )}
    </div>
  );
}
