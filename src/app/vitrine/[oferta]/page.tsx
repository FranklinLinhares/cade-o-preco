import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { contaAtual, usuarioAtual } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { porUnidade, reais, type Unidade } from "@/lib/dominio";
import { Compartilhar } from "@/components/Compartilhar";
import type { OfertaPublica } from "../VitrinePublica";
import { CartaoParte } from "@/components/CartaoParte";
import { Comprar } from "../Comprar";

type Oferta = {
  id: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  produto: string;
  unidade: Unidade;
  preco_unitario: number;
  quantidade_disponivel: number;
  validade: string | null;
  descricao: string | null;
  so_na_loja: boolean;
};

async function buscarPublica(id: string) {
  // Um id malformado faria o banco dar erro em vez de "não encontrada".
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("vitrine_publica", { termo: null, p_oferta: id });
  return ((data ?? []) as OfertaPublica[])[0] ?? null;
}

function textoDaOferta(o: { produto: string; preco_unitario: number; unidade: Unidade }) {
  return `${o.produto} a ${porUnidade(o.preco_unitario, o.unidade)} no Cadê o Preço`;
}

// Prévia do link no WhatsApp: produto, preço e quem vende.
export async function generateMetadata({ params }: PageProps<"/vitrine/[oferta]">): Promise<Metadata> {
  const { oferta: id } = await params;
  const oferta = await buscarPublica(id);
  if (!oferta) return { title: "Oferta no Cadê o Preço" };
  const titulo = textoDaOferta(oferta);
  const descricao = `${oferta.fornecedor_nome}, ${oferta.cidade}/${oferta.uf}.${oferta.descricao ? ` ${oferta.descricao}` : ""}`;
  return { title: titulo, description: descricao, openGraph: { title: titulo, description: descricao } };
}

// Confirmação da compra: mostra quem vende antes de fechar o negócio.
export default async function ConfirmarCompra({ params, searchParams }: PageProps<"/vitrine/[oferta]">) {
  const { oferta: id } = await params;
  const { quantidade } = await searchParams;
  const { supabase, empresa } = await contaAtual();
  if (!empresa) {
    if (await usuarioAtual()) redirect("/cadastro");
    return <OfertaParaVisitante id={id} />;
  }

  // A vitrine já filtra o que esta conta pode ver e comprar.
  const { data } = await supabase.rpc("vitrine_ofertas", { termo: null });
  const oferta = ((data ?? []) as Oferta[]).find((o) => o.id === id && o.fornecedor_id !== empresa.id);
  if (oferta?.so_na_loja) notFound();
  // Quem pede toda a quantidade tira a oferta da vitrine; mostra o caminho em vez de "página não encontrada".
  if (!oferta) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold">Oferta indisponível</h1>
        <div className="cartao space-y-3">
          <p className="text-stone-700">
            Esta oferta não está mais na vitrine. Se você acabou de fazer o pedido, ele está em Negócios esperando o vendedor aceitar.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/negocios" className="botao">Ver meus pedidos</Link>
            <Link href="/vitrine" className="botao-secundario">Voltar para a vitrine</Link>
          </div>
        </div>
      </div>
    );
  }

  const pedida = Number(String(quantidade ?? "").replace(",", "."));
  const qtd = pedida > 0 ? Math.min(pedida, Number(oferta.quantidade_disponivel)) : Math.min(1, Number(oferta.quantidade_disponivel));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/vitrine" className="text-sm text-stone-500 hover:underline">← Voltar para a vitrine</Link>
      <h1 className="text-2xl font-bold">Confirmar compra</h1>
      <div className="cartao space-y-1">
        <p className="text-lg font-semibold">{oferta.produto}</p>
        <p>{porUnidade(oferta.preco_unitario, oferta.unidade)} · {oferta.quantidade_disponivel} {oferta.unidade} disponíveis</p>
        {oferta.validade && <p className="text-sm text-stone-500">Validade {new Date(oferta.validade).toLocaleDateString("pt-BR")}</p>}
        {oferta.descricao && <p className="text-sm">{oferta.descricao}</p>}
      </div>
      <CartaoParte supabase={supabase} id={oferta.fornecedor_id} como="vendedor" />
      <Compartilhar texto={textoDaOferta(oferta)} caminho={`/vitrine/${oferta.id}`} />
      {empresa.papel === "comprador" ? (
        <div className="cartao space-y-2">
          <p className="text-sm text-stone-600">
            Confira a quantidade e quem vende. O pedido vai para o vendedor e a quantidade fica reservada. Quando ele aceitar, o WhatsApp dele aparece em Negócios para vocês combinarem a entrega.
            Total estimado para {qtd} {oferta.unidade}: <strong>{reais(qtd * Number(oferta.preco_unitario))}</strong>.
          </p>
          <Comprar
            oferta={oferta.id}
            maximo={Number(oferta.quantidade_disponivel)}
            unidade={oferta.unidade}
            fornecedor={oferta.fornecedor_nome}
            quantidade={qtd}
          />
        </div>
      ) : (
        <p className="aviso">Você está no modo Vender. Para comprar, troque para Comprar no menu.</p>
      )}
    </div>
  );
}

// Quem abriu o link sem conta vê a oferta e o caminho para criar a conta e comprar.
async function OfertaParaVisitante({ id }: { id: string }) {
  const oferta = await buscarPublica(id);
  if (!oferta) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold">Oferta indisponível</h1>
        <div className="cartao space-y-3">
          <p className="text-stone-700">Esta oferta acabou, venceu ou é só para clientes convidados pelo vendedor.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/vitrine" className="botao">Ver outras ofertas</Link>
            <Link href={`/entrar?volta=/vitrine/${id}`} className="botao-secundario">Entrar</Link>
          </div>
        </div>
      </div>
    );
  }
  const u = oferta.unidade;
  const volta = encodeURIComponent(`/vitrine/${oferta.id}`);
  const entrar = `/entrar?volta=${volta}`;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/vitrine" className="text-sm text-stone-500 hover:underline">← Ver todas as ofertas</Link>
      <div className="cartao space-y-2">
        <h1 className="text-2xl font-bold">{oferta.produto}</h1>
        <p className="text-2xl font-bold text-green-800">{porUnidade(oferta.preco_unitario, u)}</p>
        <p>
          {oferta.fornecedor_nome} · {oferta.cidade}/{oferta.uf}
          {oferta.agricultor && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Agricultura familiar</span>}
        </p>
        <p className="text-sm text-stone-500">
          {(!oferta.so_na_loja || Number(oferta.quantidade_disponivel) > 0) && <>{oferta.quantidade_disponivel} {u} disponíveis · </>}
          válida até {new Date(oferta.valida_ate).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" })}
          {oferta.validade && <> · validade do produto {new Date(oferta.validade).toLocaleDateString("pt-BR")}</>}
        </p>
        {oferta.descricao && <p className="text-sm">{oferta.descricao}</p>}
      </div>
      <div className="cartao space-y-3">
        <p className="text-stone-700">
          {oferta.so_na_loja
            ? "Esta é uma promoção para comprar direto na loja. Crie sua conta grátis para ver o WhatsApp da loja."
            : "Para fazer o pedido, crie sua conta grátis. Depois voltamos para esta oferta e você só confirma a quantidade."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/entrar?modo=criar&volta=${volta}`} className="botao">{oferta.so_na_loja ? "Criar conta e ver o contato" : "Criar conta e comprar"}</Link>
          <Link href={entrar} className="botao-secundario">Já tenho conta</Link>
        </div>
      </div>
      <Compartilhar texto={textoDaOferta(oferta)} caminho={`/vitrine/${oferta.id}`} />
    </div>
  );
}
