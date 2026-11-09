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
import { cancelarPedido, confirmarCompraGrupo, responderParticipante, responderPedidoGrupo } from "../acoes";
import { trocarModo } from "@/app/cadastro/modo";
import { LinkWhatsApp } from "@/components/LinkWhatsApp";
import { AoVivo } from "./AoVivo";
import { DarLance } from "./DarLance";
import { BotaoConfirmar } from "@/components/BotaoConfirmar";
import { QueroTambem } from "./QueroTambem";
import { Compartilhar } from "@/components/Compartilhar";

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
  aceita_participantes: boolean;
  comprador: { nome: string; cidade: string };
};
type Participante = {
  comprador_id: string;
  quantidade: number;
  entrou_em: string;
  situacao: "pedido" | "no_grupo" | "confirmar" | "desistiu" | "aguardando" | "aceito" | "recusado";
  comprador: { nome: string } | null;
};
const SITUACAO_GRUPO = {
  pedido: "quer entrar",
  no_grupo: "",
  confirmar: "ainda não confirmou a compra",
  desistiu: "desistiu da compra",
  aguardando: "confirmou, esperando o vendedor",
  aceito: "vendedor aceitou",
  recusado: "vendedor recusou",
};
type CompraDoLeilao = EstadoConclusao & { comprador_id: string; quantidade: number; comprador: { nome: string } | null };
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

  // Lances e ofertas do mesmo produto não dependem um do outro: saem ao mesmo tempo.
  const [{ data }, { data: ofertas }, { data: resumo }, { data: dadosParticipantes }] = await Promise.all([
    // A política de segurança já filtra os lances conforme a visibilidade escolhida.
    supabase
      .from("lances")
      .select("*, fornecedor:empresas!lances_fornecedor_id_fkey(nome, cidade, agricultor)")
      .eq("pedido_id", id)
      .order("preco_unitario")
      .order("criado_em"),
    // Escudo de preço: ofertas do mesmo produto na vitrine perto de quem vê a página.
    supabase.rpc("vitrine_ofertas", { termo: pedido.produto_chave }),
    // Leilão em grupo: quantas pessoas e o total. Quem criou vê a lista; o participante, a própria linha.
    pedido.aceita_participantes
      ? supabase.rpc("resumo_grupos", { p_ids: [id] })
      : Promise.resolve({ data: null }),
    pedido.aceita_participantes
      ? supabase
          .from("pedido_participantes")
          .select("comprador_id, quantidade, entrou_em, situacao, comprador:empresas!pedido_participantes_comprador_id_fkey(nome)")
          .eq("pedido_id", id)
          .order("entrou_em")
          .returns<Participante[]>()
      : Promise.resolve({ data: [] as Participante[] }),
  ]);
  const grupo = ((resumo ?? []) as { participantes: number; quantidade_total: number }[])[0];
  const participantes = (dadosParticipantes ?? []) as Participante[];
  const quantidadeTotal = grupo ? Number(grupo.quantidade_total) : Number(pedido.quantidade);
  const pessoasNoGrupo = grupo ? Number(grupo.participantes) : 0;
  const minhaParte = participantes.find((p) => p.comprador_id === empresa.id);
  const souParticipante = Boolean(minhaParte);
  // Quem pediu para entrar e ainda espera quem criou aceitar não conta no grupo.
  const pedidosParaEntrar = participantes.filter((p) => p.situacao === "pedido");
  const doGrupo = participantes.filter((p) => p.situacao !== "pedido");
  const lances = (data ?? []) as Lance[];
  const precosOfertas = ((ofertas ?? []) as { produto_chave: string; unidade: Unidade; preco_unitario: number }[])
    .filter((o) => o.produto_chave === pedido.produto_chave && o.unidade === pedido.unidade)
    .map((o) => Number(o.preco_unitario));
  const mercado = mediaParaPedido(precosOfertas, pedido.referencia_preco, pedido.unidade);
  const souComprador = pedido.comprador_id === empresa.id;
  // Quem está no grupo acompanha os lances como quem criou, mas não escolhe o vencedor.
  // Quem só pediu para entrar, foi recusado ou desistiu não vê os lances (o banco também barra).
  const aceitoNoGrupo = Boolean(minhaParte && !["pedido", "desistiu", "recusado"].includes(minhaParte.situacao));
  const vejoComoComprador = souComprador || aceitoNoGrupo;
  // Leilão só para convidados: quem não está na lista vê o leilão, mas não pode dar lance.
  const possoDarLance = !pedido.convidados || pedido.convidados.includes(empresa.id);
  const u = pedido.unidade;
  const aberto = pedido.status === "aberto" && new Date(pedido.encerra_em) > new Date();
  const vencedor = lances.find((l) => l.id === pedido.lance_vencedor_id);
  const souVencedor = vencedor?.fornecedor_id === empresa.id;

  // Reputação, WhatsApp e o negócio fechado: buscas independentes, ao mesmo tempo.
  // Negócio fechado: cada comprador do leilão (quem criou e cada participante do
  // grupo) tem a própria compra. O comprador vê a sua; o vencedor vê todas.
  const buscarCompras = async (): Promise<{ compras: CompraDoLeilao[]; notas: Map<string, number> }> => {
    if (pedido.status !== "fechado" || !(vejoComoComprador || souVencedor)) return { compras: [], notas: new Map() };
    let consulta = supabase
      .from("compras")
      .select("id, comprador_id, quantidade, concluido_comprador_em, concluido_fornecedor_em, comprador:empresas!compras_comprador_id_fkey(nome)")
      .eq("pedido_id", id)
      .order("criado_em");
    if (!souVencedor) consulta = consulta.eq("comprador_id", empresa.id);
    const { data: compras } = await consulta.returns<CompraDoLeilao[]>();
    const lista = compras ?? [];
    if (lista.length === 0) return { compras: [], notas: new Map() };
    const { data: minhas } = await supabase
      .from("avaliacoes")
      .select("compra_id, nota")
      .in("compra_id", lista.map((c) => c.id))
      .eq("avaliador_id", empresa.id);
    return { compras: lista, notas: new Map((minhas ?? []).map((a) => [a.compra_id as string, a.nota as number])) };
  };
  const { data: comprasDoPedido } = pedido.status === "fechado" && souVencedor
    ? await supabase.from("compras").select("comprador_id").eq("pedido_id", id)
    : { data: [] as { comprador_id: string }[] };

  // Reputação, WhatsApp e o negócio fechado: buscas independentes, ao mesmo tempo.
  const [reputacao, telefones, conclusao] = await Promise.all([
    buscarReputacao(supabase, [pedido.comprador_id, ...participantes.map((p) => p.comprador_id), ...lances.map((l) => l.fornecedor_id)]),
    // O WhatsApp da outra parte só aparece depois do negócio fechado.
    buscarTelefones(supabase, vencedor ? [vencedor.fornecedor_id, pedido.comprador_id, ...(comprasDoPedido ?? []).map((c) => c.comprador_id)] : []),
    buscarCompras(),
  ]);
  const repComprador = reputacao.get(pedido.comprador_id);
  const minhaCompra = conclusao.compras.find((c) => c.comprador_id === empresa.id);

  const meuMenor = lances.filter((l) => l.fornecedor_id === empresa.id).at(0);
  const menor = lances.at(0);

  let dica = "Quanto menor o preço, maior a chance de vencer.";
  if (pedido.lances_visiveis && menor) dica = `O menor lance atual é ${porUnidade(menor.preco_unitario, u)}. Seu lance precisa ser menor.`;
  if (!pedido.lances_visiveis) dica = meuMenor
    ? `Leilão fechado. Seu último lance foi ${porUnidade(meuMenor.preco_unitario, u)}; você pode baixar.`
    : "Leilão fechado: você não vê os outros lances.";
  if (pedido.preco_maximo) dica += ` Preço máximo: ${porUnidade(pedido.preco_maximo, u)}.`;
  if (pessoasNoGrupo > 0) dica = `Leilão em grupo: ${pessoasNoGrupo + 1} compradores somam ${quantidadeTotal} ${u}. Se vencer, você escolhe para quem do grupo vender, no preço do seu lance. ` + dica;
  const travado = pessoasNoGrupo > 0 && lances.length > 0;
  const limiteSaida = new Date(new Date(pedido.encerra_em).getTime() - 2 * 3_600_000);
  const regraSaida = lances.length === 0
    ? "Dá para sair do grupo a qualquer momento até o primeiro lance."
    : limiteSaida > new Date()
      ? `Já tem lance: dá para sair ou diminuir só até ${dataHora(limiteSaida)}.`
      : "Já tem lance e o fim está perto: dá só para aumentar a quantidade.";

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
          {quantidadeTotal} {u}{pessoasNoGrupo > 0 && <> ({pessoasNoGrupo + 1} pessoas)</>} · {CATEGORIAS[pedido.categoria]} ·{" "}
          <Link href={`/perfil/${pedido.comprador_id}`} className="hover:underline">{pedido.comprador.nome}</Link>, {pedido.comprador.cidade}{" "}
          <Estrelas nota={repComprador?.nota_comprador} total={repComprador?.avaliacoes_comprador} />
        </p>
        {pedido.especificacoes && <p>{pedido.especificacoes}</p>}
        <p className="text-sm text-stone-500">
          {pedido.entrega_ate && <>Entrega até {new Date(pedido.entrega_ate).toLocaleDateString("pt-BR")} · </>}
          {pedido.validade_minima_dias != null && <>Validade mínima de {pedido.validade_minima_dias} dias · </>}
          {pedido.lances_visiveis ? "Leilão aberto" : "Leilão fechado"}
          {pedido.aceita_participantes && <> · <strong className="text-violet-800">Leilão em grupo</strong></>}
          {pedido.convidados && <> · Só para {pedido.convidados.length} fornecedor{pedido.convidados.length > 1 ? "es" : ""} convidado{pedido.convidados.length > 1 ? "s" : ""}</>}
        </p>
        {souComprador && aberto && (
          <Compartilhar
            texto={`Estou comprando ${quantidadeTotal} ${u} de ${pedido.produto}. Dê seu lance no Cadê o Preço até ${dataHora(pedido.encerra_em)}:`}
            caminho={`/pedidos/${pedido.id}`}
            rotulo={pedido.convidados ? "Avisar os convidados no WhatsApp" : "Chamar fornecedores no WhatsApp"}
          />
        )}
      </div>

      {souComprador && pedido.referencia_preco && (
        <div className="space-y-2">
          <h2 className="font-semibold">Preço de referência quando o leilão foi criado</h2>
          <ReferenciaPreco referencia={pedido.referencia_preco} />
        </div>
      )}

      {vencedor && vejoComoComprador && (
        <div className="cartao border-green-700 bg-green-50">
          <h2 className="font-semibold">Negócio fechado: {porUnidade(vencedor.preco_unitario, u)}</h2>
          <p>Fornecedor: {vencedor.fornecedor?.nome} ({vencedor.fornecedor?.cidade}) · <LinkWhatsApp telefone={telefones.get(vencedor.fornecedor_id)} /></p>
          {minhaParte?.situacao === "confirmar" && (
            <form action={confirmarCompraGrupo} className="mt-2 space-y-2 rounded-lg border border-green-300 bg-white p-3">
              <input type="hidden" name="pedido" value={id} />
              <p className="text-sm">
                Quer comprar a sua parte, {minhaParte.quantidade} {u}, por <strong>{reais(Number(vencedor.preco_unitario) * Number(minhaParte.quantidade))}</strong> ({porUnidade(vencedor.preco_unitario, u)})?
              </p>
              <div className="flex flex-wrap gap-2">
                <button name="resposta" value="confirmar" className="botao py-1 text-sm">Confirmar compra</button>
                <BotaoConfirmar name="resposta" value="desistir" className="botao-secundario py-1 text-sm" pergunta="Desistir desta compra? O vendedor é avisado e não dá para desfazer.">Desistir</BotaoConfirmar>
              </div>
            </form>
          )}
          {minhaParte?.situacao === "desistiu" && <p className="text-sm text-stone-600">Você desistiu da compra da sua parte.</p>}
          {minhaParte?.situacao === "aguardando" && (
            <p className="text-sm">Sua parte ({minhaParte.quantidade} {u}) está esperando {vencedor.fornecedor?.nome} aceitar vender. Avisamos quando ele responder.</p>
          )}
          {minhaParte?.situacao === "recusado" && (
            <p className="text-sm text-red-800">{vencedor.fornecedor?.nome} recusou vender a sua parte. Você pode criar um leilão só seu para este produto.</p>
          )}
          {minhaCompra && (
            <>
              {pessoasNoGrupo > 0 && <p className="text-sm">Sua parte: {minhaCompra.quantidade} {u} · {reais(Number(vencedor.preco_unitario) * Number(minhaCompra.quantidade))}</p>}
              <div className="mt-3 border-t border-green-200 pt-3">
                <ConclusaoNegocio compra={minhaCompra} souComprador nomeOutro={vencedor.fornecedor?.nome ?? ""} notaDada={conclusao.notas.get(minhaCompra.id)} />
              </div>
            </>
          )}
        </div>
      )}
      {vencedor && souVencedor && (
        <div className="cartao space-y-3 border-green-700 bg-green-50">
          <h2 className="font-semibold">Você venceu! {porUnidade(vencedor.preco_unitario, u)}</h2>
          {doGrupo.length > 0 && <p className="text-sm">Leilão em grupo: a compra de quem criou o leilão já está fechada. Cada pessoa do grupo confirma se quer comprar; aceite ou recuse vender para quem confirmou e combine a entrega com quem você aceitar.</p>}
          {doGrupo.filter((p) => p.situacao !== "aceito").length > 0 && (
            <ul className="divide-y divide-green-200 rounded-lg border border-green-200 bg-white px-3">
              {doGrupo.filter((p) => p.situacao !== "aceito").map((p) => {
                const rep = reputacao.get(p.comprador_id);
                return (
                  <li key={p.comprador_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <Link href={`/perfil/${p.comprador_id}`} className="font-medium hover:underline">{p.comprador?.nome ?? "Comprador"}</Link>{" "}
                      <Estrelas nota={rep?.nota_comprador} total={rep?.avaliacoes_comprador} /> · {p.quantidade} {u} · {reais(Number(vencedor.preco_unitario) * Number(p.quantidade))}
                    </span>
                    {p.situacao === "aguardando" ? (
                      <form action={responderParticipante} className="flex gap-2">
                        <input type="hidden" name="pedido" value={id} />
                        <input type="hidden" name="comprador" value={p.comprador_id} />
                        <button name="resposta" value="aceitar" className="botao py-1 text-sm">Aceitar</button>
                        <BotaoConfirmar name="resposta" value="recusar" className="botao-secundario py-1 text-sm" pergunta={`Recusar vender para ${p.comprador?.nome ?? "este comprador"}? Ele é avisado e não dá para desfazer.`}>Recusar</BotaoConfirmar>
                      </form>
                    ) : (
                      <span className="text-sm text-stone-500">{p.situacao === "recusado" ? "Você recusou" : SITUACAO_GRUPO[p.situacao]}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <ul className="divide-y divide-green-200">
            {conclusao.compras.map((c) => (
              <li key={c.id} className="space-y-2 py-2">
                <p>
                  {c.comprador?.nome ?? "Comprador"} · {c.quantidade} {u} · {reais(Number(vencedor.preco_unitario) * Number(c.quantidade))} ·{" "}
                  <LinkWhatsApp telefone={telefones.get(c.comprador_id)} />
                </p>
                <ConclusaoNegocio compra={c} souComprador={false} nomeOutro={c.comprador?.nome ?? ""} notaDada={conclusao.notas.get(c.id)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {pedido.aceita_participantes && !souComprador && aberto && empresa.papel === "comprador" && (
        <QueroTambem pedido={id} unidade={u} minhaQuantidade={minhaParte ? Number(minhaParte.quantidade) : null} esperandoAceite={minhaParte?.situacao === "pedido"} maximo={2 * Number(pedido.quantidade)} regraSaida={regraSaida} />
      )}
      {souComprador && pedido.aceita_participantes && (
        <section className="cartao space-y-2 border-violet-300">
          <h2 className="font-semibold">Leilão em grupo · {doGrupo.length === 0 ? "ninguém no grupo ainda" : `${doGrupo.length + 1} pessoas, ${quantidadeTotal} ${u}`}</h2>
          <p className="text-sm text-stone-600">Quem mora a até 5 km pode pedir para entrar com a própria quantidade, e você escolhe quem participa. Os vendedores veem quem está no grupo. Quando você escolher o vencedor, a sua compra fecha na hora e cada pessoa do grupo confirma se quer comprar.</p>
          {pedidosParaEntrar.length > 0 && aberto && (
            <div className="space-y-1 rounded-lg border border-violet-300 bg-violet-50 p-3">
              <p className="text-sm font-medium">Pedidos para entrar no grupo</p>
              <ul className="divide-y divide-violet-200 text-sm">
                {pedidosParaEntrar.map((p) => {
                  const rep = reputacao.get(p.comprador_id);
                  return (
                    <li key={p.comprador_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <Link href={`/perfil/${p.comprador_id}`} className="font-medium hover:underline">{p.comprador?.nome ?? "Comprador"}</Link>{" "}
                        <Estrelas nota={rep?.nota_comprador} total={rep?.avaliacoes_comprador} /> · {p.quantidade} {u}
                      </span>
                      <form action={responderPedidoGrupo} className="flex gap-2">
                        <input type="hidden" name="pedido" value={id} />
                        <input type="hidden" name="comprador" value={p.comprador_id} />
                        <button name="resposta" value="aceitar" className="botao py-1 text-sm">Aceitar</button>
                        <BotaoConfirmar name="resposta" value="recusar" className="botao-secundario py-1 text-sm" pergunta={`Recusar ${p.comprador?.nome ?? "esta pessoa"} no grupo?`}>Recusar</BotaoConfirmar>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {doGrupo.length > 0 && (
            <ul className="divide-y divide-stone-100 text-sm">
              <li className="flex justify-between py-1"><span>Você</span><span>{pedido.quantidade} {u}</span></li>
              {doGrupo.map((p) => (
                <li key={p.comprador_id} className="flex justify-between py-1">
                  <Link href={`/perfil/${p.comprador_id}`} className="hover:underline">{p.comprador?.nome ?? "Comprador"}</Link>
                  <span>{p.quantidade} {u}{SITUACAO_GRUPO[p.situacao] && <span className="text-stone-500"> · {SITUACAO_GRUPO[p.situacao]}</span>}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {!souComprador && !souParticipante && empresa.papel === "fornecedor" && aberto && doGrupo.length > 0 && (
        <section className="cartao space-y-2 border-violet-300">
          <h2 className="font-semibold">Quem está comprando · {doGrupo.length + 1} pessoas, {quantidadeTotal} {u}</h2>
          <p className="text-sm text-stone-600">Se você vencer, a compra de quem criou o leilão fecha na hora. Cada pessoa do grupo confirma se quer comprar, e você escolhe para quem aceita vender, no preço do seu lance.</p>
          <ul className="divide-y divide-stone-100 text-sm">
            <li className="flex justify-between py-1">
              <span><Link href={`/perfil/${pedido.comprador_id}`} className="hover:underline">{pedido.comprador.nome}</Link> (criou o leilão)</span>
              <span>{pedido.quantidade} {u}</span>
            </li>
            {doGrupo.map((p) => {
              const rep = reputacao.get(p.comprador_id);
              return (
                <li key={p.comprador_id} className="flex justify-between gap-2 py-1">
                  <span>
                    <Link href={`/perfil/${p.comprador_id}`} className="hover:underline">{p.comprador?.nome ?? "Comprador"}</Link>{" "}
                    <Estrelas nota={rep?.nota_comprador} total={rep?.avaliacoes_comprador} />
                  </span>
                  <span>{p.quantidade} {u}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!souComprador && empresa.papel === "fornecedor" && aberto && !possoDarLance && (
        <p className="aviso">Este leilão é só para fornecedores convidados pelo comprador.</p>
      )}
      {!souComprador && empresa.papel === "fornecedor" && aberto && possoDarLance && <DarLance pedido={id} unidade={u} dica={dica} mercado={mercado} />}
      {!souComprador && !pedido.aceita_participantes && empresa.papel === "comprador" && aberto && (
        <form action={trocarModo} className="aviso flex flex-wrap items-center justify-between gap-2">
          <span>Você está no modo Comprar. Para dar lance neste leilão, mude para Vender.</span>
          <input type="hidden" name="papel" value="fornecedor" />
          <input type="hidden" name="voltar" value={`/pedidos/${id}`} />
          <button className="botao py-1">Mudar para Vender</button>
        </form>
      )}

      <section className="cartao space-y-2">
        <h2 className="font-semibold">
          Lances ({lances.length}){!vejoComoComprador && !pedido.lances_visiveis && " · você vê apenas os seus"}
        </h2>
        {lances.length === 0 && <p className="text-sm text-stone-500">Nenhum lance ainda.</p>}
        <ol className="divide-y divide-stone-100">
          {lances.map((l, i) => {
            const meu = l.fornecedor_id === empresa.id;
            return (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="font-semibold">{i + 1}º · {porUnidade(l.preco_unitario, u)}</span>
                  {(vejoComoComprador || meu) && <span className="ml-2"><SeloPreco preco={l.preco_unitario} mercado={mercado} unidade={u} /></span>}
                  <span className="ml-2 text-sm text-stone-500">
                    {vejoComoComprador ? (
                      <>
                        <Link href={`/perfil/${l.fornecedor_id}`} className="hover:underline">{l.fornecedor?.nome}</Link> ({l.fornecedor?.cidade}){" "}
                        <Estrelas nota={reputacao.get(l.fornecedor_id)?.nota_vendedor} total={reputacao.get(l.fornecedor_id)?.avaliacoes_vendedor} />
                      </>
                    ) : meu ? "Seu lance" : "Concorrente"}
                    {l.fornecedor?.agricultor && vejoComoComprador && " · agricultor"}
                    {" · "}{dataHora(l.criado_em)}
                  </span>
                  {l.observacao && (vejoComoComprador || meu) && <div className="text-sm">{l.observacao}</div>}
                </div>
                {souComprador && (pedido.status === "aberto" || pedido.status === "encerrado") && (
                  // Escolher leva à confirmação, que mostra quem é o fornecedor antes de fechar.
                  <Link href={`/pedidos/${id}/fechar?lance=${l.id}`} className={i === 0 ? "botao py-1" : "botao-secundario py-1"}>Escolher</Link>
                )}
              </li>
            );
          })}
        </ol>
        {vejoComoComprador && mercado && lances.length > 0 && (
          <p className="text-xs text-stone-500">Os selos comparam cada lance com a {mercado.fonte}: {porUnidade(mercado.media, u)}.</p>
        )}
        {souComprador && <p className="text-xs text-stone-500">Total do menor lance{pessoasNoGrupo > 0 ? " para a sua parte" : ""}: {menor ? reais(Number(menor.preco_unitario) * Number(pedido.quantidade)) : "–"}</p>}
        {souParticipante && minhaParte && <p className="text-xs text-stone-500">Sua parte no menor lance: {menor ? reais(Number(menor.preco_unitario) * Number(minhaParte.quantidade)) : "–"}</p>}
      </section>

      {souComprador && pedido.status === "aberto" && travado && (
        <p className="text-sm text-stone-500">Este leilão em grupo já tem lance e outras pessoas contando com ele, por isso não dá mais para cancelar.</p>
      )}
      {souComprador && pedido.status === "aberto" && !travado && (
        <form action={cancelarPedido}>
          <input type="hidden" name="pedido" value={id} />
          <BotaoConfirmar className="text-sm text-red-700 hover:underline" pergunta="Cancelar este leilão? Os fornecedores não poderão mais dar lances e não dá para reabrir.">Cancelar leilão</BotaoConfirmar>
        </form>
      )}
    </div>
  );
}
