import Link from "next/link";
import { redirect } from "next/navigation";
import { contaAtual, usuarioAtual } from "@/lib/sessao";
import { VitrinePublica } from "./VitrinePublica";
import { CATEGORIAS, PUBLICO, porUnidade, type Categoria, type Publico, type Unidade } from "@/lib/dominio";
import { SeloPreco } from "@/components/SeloPreco";
import { mediaDasOfertas } from "@/lib/escudo";
import { Estrelas } from "@/components/Estrelas";
import { buscarReputacao } from "@/lib/reputacao";
import { Situacao } from "@/components/Situacao";
import { MinhasCategorias } from "./MinhasCategorias";
import { ocultarOfertas } from "./acoes";
import { BarraSelecao, Marcar } from "@/components/Selecao";
import { buscarOcultos } from "@/lib/ocultos";

type Oferta = {
  id: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  agricultor: boolean;
  fornecedor_pj: boolean;
  vende_para: Publico;
  cidade: string;
  distancia_km: number;
  produto: string;
  produto_chave: string;
  categoria: Categoria;
  unidade: Unidade;
  preco_unitario: number;
  quantidade_disponivel: number;
  validade: string | null;
  disponivel_a_partir: string | null;
  descricao: string | null;
  valida_ate: string;
  so_na_loja: boolean;
  telefone_loja: string | null;
};

export default async function Vitrine({ searchParams }: PageProps<"/vitrine">) {
  const { q, de, como, senha } = await searchParams;
  const termo = typeof q === "string" ? q.trim() : "";
  // Filtro do comprador: ofertas de empresas (CNPJ), de pessoas físicas (CPF) ou de todos.
  const origem = de === "pj" || de === "pf" ? de : "todos";
  // Filtro: ofertas que dá para comprar pelo app, promoções só na loja, ou todas.
  const modo = como === "app" || como === "loja" ? como : "todos";
  const { supabase, empresa } = await contaAtual();
  // Sem conta, a vitrine abre mesmo assim (o link de uma oferta chega pelo WhatsApp).
  if (!empresa) {
    if (await usuarioAtual()) redirect("/cadastro");
    return <VitrinePublica supabase={supabase} termo={termo} />;
  }
  // A Vitrine é para comprar; no modo Vender a pessoa vai para as próprias ofertas.
  if (empresa.papel !== "comprador") redirect("/ofertas");
  // Pedidos sem resposta em 2 dias devolvem o estoque; as buscas que dependem disso
  // esperam por ele, as outras saem ao mesmo tempo.
  const expirou = Promise.resolve(supabase.rpc("expirar_reservas"));
  const [{ data }, ocultas, { data: dadosPedidos }] = await Promise.all([
    expirou.then(() => supabase.rpc("vitrine_ofertas", { termo: termo || null })),
    buscarOcultos(supabase, "oferta"),
    // Ofertas em que você já fez pedido: aguardando o vendedor ou já aceito.
    expirou.then(() =>
      supabase
        .from("reservas")
        .select("oferta_id, quantidade, situacao")
        .eq("comprador_id", empresa.id)
        .in("situacao", ["aguardando", "aceita"]),
    ),
  ]);
  // As próprias ofertas ficam em Minhas ofertas; a vitrine mostra só as de outras pessoas.
  const ofertas = ((data ?? []) as Oferta[]).filter(
    (o) => o.fornecedor_id !== empresa.id && !ocultas.has(o.id) && (origem === "todos" || o.fornecedor_pj === (origem === "pj")) &&
      (modo === "todos" || o.so_na_loja === (modo === "loja")),
  );
  const reputacao = await buscarReputacao(supabase, ofertas.map((o) => o.fornecedor_id));

  const meusPedidos = new Map<string, { aguardando: number; aceita: number }>();
  for (const r of dadosPedidos ?? []) {
    if (!r.oferta_id) continue;
    const atual = meusPedidos.get(r.oferta_id) ?? { aguardando: 0, aceita: 0 };
    atual[r.situacao as "aguardando" | "aceita"] += Number(r.quantidade);
    meusPedidos.set(r.oferta_id, atual);
  }

  // Agrupa as ofertas do mesmo produto e unidade para comparar preços.
  const grupos = new Map<string, Oferta[]>();
  for (const o of ofertas) {
    const chave = `${o.produto_chave}|${o.unidade}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), o]);
  }

  // Uma caixa por categoria; as de interesse vêm primeiro e já abertas.
  const porCategoria = new Map<Categoria, Oferta[][]>();
  for (const lista of grupos.values()) {
    const cat = lista[0].categoria;
    porCategoria.set(cat, [...(porCategoria.get(cat) ?? []), lista]);
  }
  const interesses = new Set(empresa.categorias);
  const ordem = (Object.keys(CATEGORIAS) as Categoria[])
    .filter((c) => porCategoria.has(c))
    .sort((a, b) => Number(interesses.has(b)) - Number(interesses.has(a)));
  // Na busca, ou com uma categoria só, abre tudo.
  const abrirTodas = Boolean(termo) || ordem.length === 1;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Vitrine</h1>
      {senha === "trocada" && <p className="aviso">Senha nova salva. Use ela da próxima vez que entrar.</p>}
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={termo} placeholder="Buscar produto: tomate, arroz, frango..." className="campo min-w-48 flex-1" />
        <select name="de" defaultValue={origem} aria-label="Ver ofertas de" className="campo w-auto">
          <option value="todos">Todos</option>
          <option value="pj">Empresas (CNPJ)</option>
          <option value="pf">Pessoas físicas (CPF)</option>
        </select>
        <select name="como" defaultValue={modo} aria-label="Como comprar" className="campo w-auto">
          <option value="todos">Pelo app e na loja</option>
          <option value="app">Comprar pelo app</option>
          <option value="loja">Promoções de loja</option>
        </select>
        <button className="botao">Buscar</button>
      </form>
      <p className="text-sm text-stone-500">
        Ofertas de outros vendedores que entregam até você, dentro do seu raio de {empresa.raio_km} km.
      </p>

      <MinhasCategorias marcadas={empresa.categorias} dica="As marcadas aparecem primeiro e abertas. A mesma escolha vale para os leilões no modo Vender." />

      <BarraSelecao id="ocultar-ofertas" acao={ocultarOfertas} confirmar="Tirar {n} oferta(s) da sua vitrine? Elas somem só para você; o vendedor continua anunciando." />

      {grupos.size === 0 && (
        <div className="cartao space-y-2">
          <p>Nenhuma oferta encontrada{termo ? ` para “${termo}”` : ""} perto de você.</p>
          {empresa.papel === "comprador" && (
            <Link href={`/pedidos/novo${termo ? `?produto=${encodeURIComponent(termo)}` : ""}`} className="botao-secundario">
              Criar um leilão para este produto
            </Link>
          )}
        </div>
      )}

      {ordem.map((cat) => {
        const listas = porCategoria.get(cat)!;
        const nOfertas = listas.reduce((t, l) => t + l.length, 0);
        return (
          <details key={cat} open={abrirTodas || interesses.has(cat)} className="cartao group space-y-3 p-0">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-3 hover:bg-stone-50 sm:px-4">
              <span className="text-lg font-bold">
                <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden>▸</span>
                {CATEGORIAS[cat]}
                {interesses.has(cat) && <span className="ml-2 inline-block rounded-full bg-green-100 px-2 py-0.5 align-middle text-xs font-medium whitespace-nowrap text-green-900">Seu interesse</span>}
              </span>
              <span className="text-sm text-stone-500">
                {listas.length} produto{listas.length > 1 ? "s" : ""} · {nOfertas} oferta{nOfertas > 1 ? "s" : ""}
              </span>
            </summary>
            <div className="space-y-3 px-2 pb-3 sm:px-4 sm:pb-4">
      {listas.map((lista) => {
        const precos = lista.map((o) => Number(o.preco_unitario));
        const u = lista[0].unidade;
        const media = precos.reduce((a, b) => a + b, 0) / precos.length;
        const mercado = mediaDasOfertas(precos);
        return (
          <section key={`${lista[0].produto_chave}|${u}`} className="space-y-3 rounded-lg border border-stone-200 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{lista[0].produto}</h2>
              <span className="text-sm text-stone-500">{CATEGORIAS[lista[0].categoria]}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
              <div className="rounded-lg bg-stone-100 p-2"><div className="text-stone-500">Fornecedores</div><div className="text-lg font-bold">{new Set(lista.map((o) => o.fornecedor_id)).size}</div></div>
              <div className="rounded-lg bg-green-50 p-2"><div className="text-stone-500">Menor</div><div className="font-bold text-green-800">{porUnidade(Math.min(...precos), u)}</div></div>
              <div className="rounded-lg bg-stone-100 p-2"><div className="text-stone-500">Médio</div><div className="font-bold">{porUnidade(media, u)}</div></div>
              <div className="rounded-lg bg-stone-100 p-2"><div className="text-stone-500">Maior</div><div className="font-bold">{porUnidade(Math.max(...precos), u)}</div></div>
            </div>
            <ul className="divide-y divide-stone-100">
              {lista.map((o) => (
                <li key={o.id} className="space-y-1 py-2">
                  {o.so_na_loja && (
                    <Situacao tom="loja">
                      Promoção na loja: confira e compre direto na loja, em {o.cidade}
                    </Situacao>
                  )}
                  {meusPedidos.get(o.id)?.aguardando ? (
                    <Situacao tom="pedido">
                      Você pediu {meusPedidos.get(o.id)!.aguardando} {u}, aguardando o vendedor aceitar
                      <Link href="/negocios" className="ml-auto text-sm underline">Ver em Negócios</Link>
                    </Situacao>
                  ) : null}
                  {meusPedidos.get(o.id)?.aceita ? (
                    <Situacao tom="aceito">
                      Compra aceita: {meusPedidos.get(o.id)!.aceita} {u}
                      <Link href="/negocios" className="ml-auto text-sm underline">Combinar a entrega</Link>
                    </Situacao>
                  ) : null}
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex items-start gap-3">
                    <Marcar form="ocultar-ofertas" valor={o.id} nome={`${o.produto} de ${o.fornecedor_nome}`} />
                    <div>
                      <Link href={`/perfil/${o.fornecedor_id}`} className="font-medium hover:underline">{o.fornecedor_nome}</Link>
                      <span className="ml-2"><Estrelas nota={reputacao.get(o.fornecedor_id)?.nota_vendedor} total={reputacao.get(o.fornecedor_id)?.avaliacoes_vendedor} /></span>
                      <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">{o.fornecedor_pj ? "Empresa" : "Pessoa física"}</span>
                      {o.vende_para !== "todos" && <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-900">{PUBLICO[o.vende_para]}</span>}
                      {o.agricultor && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Agricultura familiar</span>}
                      <div className="text-sm text-stone-500">
                        {o.cidade} · até {o.distancia_km} km
                        {(!o.so_na_loja || Number(o.quantidade_disponivel) > 0) && <> · {o.quantidade_disponivel} {u} disponíveis</>}
                        {o.so_na_loja && <> · até {new Date(o.valida_ate).toLocaleDateString("pt-BR")}</>}
                        {o.validade && <> · validade {new Date(o.validade).toLocaleDateString("pt-BR")}</>}
                        {o.disponivel_a_partir && <> · a partir de {new Date(o.disponivel_a_partir).toLocaleDateString("pt-BR")}</>}
                      </div>
                      {o.descricao && <div className="text-sm">{o.descricao}</div>}
                    </div>
                    </div>
                    <div className="ml-auto text-right">
                      <div className="font-bold text-green-800">{porUnidade(o.preco_unitario, u)}</div>
                      <SeloPreco preco={o.preco_unitario} mercado={mercado} unidade={u} />
                    </div>
                  </div>
                  {o.so_na_loja ? (
                    o.telefone_loja && (
                      <a
                        href={`https://wa.me/55${o.telefone_loja}?text=${encodeURIComponent(`Olá! Vi no Cadê o Preço a promoção de ${o.produto} a ${porUnidade(o.preco_unitario, u)}.`)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="botao-secundario py-1 text-sm"
                      >
                        Falar com a loja no WhatsApp
                      </a>
                    )
                  ) : empresa.papel === "comprador" && (
                    // Comprar leva à confirmação, que mostra quem vende antes de fechar.
                    <form action={`/vitrine/${o.id}`} className="flex flex-wrap items-center gap-2 text-sm">
                      <label className="flex items-center gap-1">
                        Quantidade
                        <input name="quantidade" inputMode="decimal" required defaultValue={Math.min(1, Number(o.quantidade_disponivel))} className="campo w-24 py-1" />
                        {u}
                      </label>
                      <button className="botao py-1">Comprar</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
