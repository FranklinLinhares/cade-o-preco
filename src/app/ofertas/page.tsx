import Link from "next/link";
import { Compartilhar } from "@/components/Compartilhar";
import { exigirEmpresa } from "@/lib/sessao";
import { buscarTelefones } from "@/lib/telefones";
import { CATEGORIAS, PUBLICO, dataHora, porUnidade, type Categoria, type Publico, type Unidade } from "@/lib/dominio";
import { encerrarOferta, excluirOfertas } from "./acoes";
import { BarraSelecao, Marcar } from "@/components/Selecao";
import { ExcluirOferta } from "./ExcluirOferta";
import { BORDA_CARTAO, Situacao } from "@/components/Situacao";

type Oferta = {
  id: string;
  produto: string;
  produto_chave: string;
  categoria: Categoria;
  unidade: Unidade;
  preco_unitario: number;
  quantidade_disponivel: number;
  valida_ate: string;
  ativa: boolean;
  vende_para: Publico;
  convidados: string[] | null;
  so_na_loja: boolean;
  compras: { quantidade: number; data: string; comprador_id: string; comprador: { nome: string } | null }[];
};

export default async function MinhasOfertas() {
  const { supabase, empresa } = await exigirEmpresa();
  // Pedidos sem resposta em 2 dias devolvem o estoque; as buscas esperam por isso, juntas.
  const expirou = Promise.resolve(supabase.rpc("expirar_reservas"));
  const [{ data }, { data: dadosPedidos }] = await Promise.all([
    expirou.then(() =>
      supabase
        .from("ofertas")
        .select("*, compras(quantidade, data, comprador_id, comprador:empresas!compras_comprador_id_fkey(nome))")
        .eq("fornecedor_id", empresa.id)
        .order("criado_em", { ascending: false })
        .returns<Oferta[]>(),
    ),
    // Pedidos da vitrine que ainda esperam a sua resposta, por oferta.
    expirou.then(() => supabase.from("reservas").select("oferta_id, quantidade").eq("fornecedor_id", empresa.id).eq("situacao", "aguardando")),
  ]);
  const ofertas = data ?? [];
  const pedidos = new Map<string, { n: number; quantidade: number }>();
  for (const r of dadosPedidos ?? []) {
    if (!r.oferta_id) continue;
    const atual = pedidos.get(r.oferta_id) ?? { n: 0, quantidade: 0 };
    pedidos.set(r.oferta_id, { n: atual.n + 1, quantidade: atual.quantidade + Number(r.quantidade) });
  }

  // WhatsApp de quem comprou e, para cada produto, quantos compradores próximos têm
  // leilão aberto: buscas independentes, feitas ao mesmo tempo.
  const chaves = [...new Set(ofertas.filter((o) => o.ativa).map((o) => o.produto_chave))];
  const [telefones, contagens] = await Promise.all([
    buscarTelefones(supabase, ofertas.flatMap((o) => o.compras.map((c) => c.comprador_id))),
    Promise.all(
      chaves.map(async (chave) => {
        const { data: n } = await supabase.rpc("compradores_interessados", { chave });
        return [chave, Number(n ?? 0)] as const;
      }),
    ),
  ]);
  const interessados = Object.fromEntries(contagens);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Minhas ofertas</h1>
        {empresa.papel === "fornecedor" ? (
          <div className="flex gap-2">
            <Link href="/ofertas/folheto" className="botao-secundario">Folheto ou planilha</Link>
            <Link href="/ofertas/nova" className="botao">Nova oferta</Link>
          </div>
        ) : (
          <span className="text-sm text-stone-500">Para anunciar, mude para Vender no menu.</span>
        )}
      </div>
      {ofertas.length === 0 && <p className="text-stone-600">Você ainda não publicou ofertas.</p>}
      <BarraSelecao id="excluir-ofertas" acao={excluirOfertas} confirmar="Excluir {n} oferta(s)? Elas saem da vitrine e não dá para desfazer. As compras já feitas continuam em Negócios." />
      <ul className="space-y-3">
        {ofertas.map((o) => {
          const pedido = pedidos.get(o.id);
          const vendido = o.compras.reduce((t, c) => t + Number(c.quantidade), 0);
          const borda = pedido ? BORDA_CARTAO.pedido : vendido > 0 ? BORDA_CARTAO.aceito : "";
          return (
          <li key={o.id} className={`cartao space-y-2 ${borda} ${o.ativa || pedido ? "" : "opacity-60"}`}>
            {pedido && (
              <Situacao tom="pedido">
                {pedido.n === 1 ? "1 pedido de compra" : `${pedido.n} pedidos de compra`} esperando sua resposta ({pedido.quantidade} {o.unidade})
                <Link href="/negocios" className="botao ml-auto py-1 text-sm">Responder</Link>
              </Situacao>
            )}
            {vendido > 0 && (
              <Situacao tom="aceito">
                Compra aceita: {vendido} {o.unidade} vendido{vendido > 1 ? "s" : ""} para {o.compras.length === 1 ? o.compras[0].comprador?.nome : `${o.compras.length} compradores`}
              </Situacao>
            )}
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-start gap-3">
                <Marcar form="excluir-ofertas" valor={o.id} nome={o.produto} />
                <div>
                <div className="font-semibold">
                  {o.produto}
                  {o.so_na_loja && <span className="ml-2 inline-block rounded-full bg-violet-100 align-middle whitespace-nowrap px-2 py-0.5 text-xs font-medium text-violet-900">🏪 Só na loja</span>}
                </div>
                <div className="text-sm text-stone-500">
                  {CATEGORIAS[o.categoria]}
                  {(!o.so_na_loja || Number(o.quantidade_disponivel) > 0) && <> · {o.quantidade_disponivel} {o.unidade}</>} · válida até {dataHora(o.valida_ate)}
                  {o.convidados ? <> · Só para {o.convidados.length} cliente{o.convidados.length > 1 ? "s" : ""} escolhido{o.convidados.length > 1 ? "s" : ""}</> : o.vende_para !== "todos" && <> · {PUBLICO[o.vende_para]}</>}
                </div>
                </div>
              </div>
              <div className="text-lg font-bold text-green-800">{porUnidade(o.preco_unitario, o.unidade)}</div>
            </div>
            {o.ativa && interessados[o.produto_chave] > 0 && (
              <p className="aviso">
                {interessados[o.produto_chave]} comprador(es) perto de você têm leilão aberto para este produto.{" "}
                <Link href="/pedidos" className="underline">Ver leilões</Link>
              </p>
            )}
            {o.compras.length > 0 && (
              <div className="text-sm">
                <div className="font-medium">Compras aceitas:</div>
                <ul className="list-disc pl-5">
                  {o.compras.map((c, n) => (
                    <li key={n}>{c.comprador?.nome} · {c.quantidade} {o.unidade} · WhatsApp {telefones.get(c.comprador_id) ?? "–"}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <Link href={`/ofertas/${o.id}/editar`} className="font-medium text-green-800 hover:underline">
                {o.ativa ? "Editar" : "Editar e publicar de novo"}
              </Link>
              {o.ativa && (
                <form action={encerrarOferta}>
                  <input type="hidden" name="id" value={o.id} />
                  <button className="text-stone-600 hover:underline">Encerrar oferta</button>
                </form>
              )}
              <ExcluirOferta id={o.id} />
              {o.ativa && (
                <Compartilhar
                  texto={`${o.produto} a ${porUnidade(o.preco_unitario, o.unidade)} no Cadê o Preço. Veja e faça seu pedido:`}
                  caminho={`/vitrine/${o.id}`}
                  rotulo="Divulgar no WhatsApp"
                  className="font-medium text-green-800 hover:underline"
                />
              )}
            </div>
          </li>
          );
        })}
      </ul>
    </div>
  );
}
