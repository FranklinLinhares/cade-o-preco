"use server";

import { redirect } from "next/navigation";
import { mensagemDeErro } from "@/lib/erros";
import { avisar } from "@/lib/aviso";
import { revalidatePath } from "next/cache";
import { exigirEmpresa } from "@/lib/sessao";
import { idsMarcados, ocultar } from "@/lib/ocultos";
import { CATEGORIAS, UNIDADES, chaveDoProduto, reais, type ReferenciaPreco, type Unidade } from "@/lib/dominio";
import { lerConvidados } from "@/lib/contatos";
import { lerNumero } from "@/lib/numero";

export type EstadoForm = { erro?: string; ok?: string };

const numero = (v: FormDataEntryValue | null) => {
  const n = lerNumero(String(v ?? ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export async function criarPedido(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const { supabase, empresa } = await exigirEmpresa();
  if (empresa.papel !== "comprador") return { erro: "Mude para o modo Comprar, no menu, para criar leilões." };

  const produto = String(form.get("produto") ?? "").trim();
  const categoria = String(form.get("categoria"));
  const unidade = String(form.get("unidade"));
  const quantidade = numero(form.get("quantidade"));
  const horas = Number(form.get("duracao_horas")) || 24;
  if (!produto || !quantidade) return { erro: "Informe o produto e a quantidade." };
  if (!(categoria in CATEGORIAS) || !(unidade in UNIDADES)) return { erro: "Escolha a categoria e a unidade." };

  const { convidados, erro } = await lerConvidados(supabase, empresa.id, "fornecedor", form);
  if (erro) return { erro };

  const referencia = String(form.get("referencia_preco") || "");
  const { data, error } = await supabase
    .from("pedidos")
    .insert({
      comprador_id: empresa.id,
      produto,
      produto_chave: String(form.get("produto_chave") || "") || chaveDoProduto(produto),
      categoria,
      unidade,
      quantidade,
      especificacoes: String(form.get("especificacoes") ?? "").trim() || null,
      validade_minima_dias: numero(form.get("validade_minima_dias")),
      entrega_ate: form.get("entrega_ate") || null,
      preco_maximo: numero(form.get("preco_maximo")),
      lances_visiveis: form.get("lances_visiveis") === "sim",
      aceita_participantes: form.get("aceita_participantes") === "sim",
      encerra_em: new Date(Date.now() + horas * 3_600_000).toISOString(),
      referencia_preco: referencia ? JSON.parse(referencia) : null,
      convidados,
    })
    .select("id")
    .single();
  if (error) return { erro: mensagemDeErro(error) };
  redirect(`/pedidos/${data.id}`);
}

export async function darLance(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const { supabase } = await exigirEmpresa();
  const pedido = String(form.get("pedido"));
  const preco = numero(form.get("preco"));
  if (!preco) return { erro: "Informe o preço por unidade." };
  const { error } = await supabase.rpc("dar_lance", {
    p_pedido: pedido,
    p_preco: preco,
    p_validade: form.get("validade") || null,
    p_observacao: String(form.get("observacao") ?? "").trim() || null,
  });
  if (error) return { erro: mensagemDeErro(error) };
  revalidatePath(`/pedidos/${pedido}`);
  return { ok: `Lance de R$ ${preco.toFixed(2).replace(".", ",")} enviado.` };
}

// Leilão em grupo: entra com a sua quantidade, ou muda a quantidade se já está no grupo.
export async function entrarNoGrupo(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const { supabase } = await exigirEmpresa();
  const pedido = String(form.get("pedido"));
  const quantidade = numero(form.get("quantidade"));
  if (!quantidade) return { erro: "Informe a quantidade que você quer." };
  const { error } = await supabase.rpc("entrar_no_grupo", { p_pedido: pedido, p_quantidade: quantidade });
  if (error) return { erro: mensagemDeErro(error) };
  revalidatePath(`/pedidos/${pedido}`);
  revalidatePath("/pedidos");
  return { ok: "Pronto! Quem criou o leilão vai ver o seu pedido. Avisamos quando responder." };
}

export async function sairDoGrupo(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const { supabase } = await exigirEmpresa();
  const pedido = String(form.get("pedido"));
  const { error } = await supabase.rpc("sair_do_grupo", { p_pedido: pedido });
  if (error) return { erro: mensagemDeErro(error) };
  revalidatePath(`/pedidos/${pedido}`);
  revalidatePath("/pedidos");
  return { ok: "Você saiu do grupo." };
}

// Leilão em grupo: o vencedor aceita ou recusa vender para cada participante.
export async function responderParticipante(form: FormData) {
  const { supabase } = await exigirEmpresa();
  const pedido = String(form.get("pedido"));
  const { error } = await supabase.rpc("responder_participante", {
    p_pedido: pedido,
    p_comprador: String(form.get("comprador")),
    p_aceitar: form.get("resposta") === "aceitar",
  });
  if (error) return avisar(mensagemDeErro(error));
  revalidatePath(`/pedidos/${pedido}`);
}

// Leilão em grupo: quem criou aceita ou recusa quem pediu para entrar.
export async function responderPedidoGrupo(form: FormData) {
  const { supabase } = await exigirEmpresa();
  const pedido = String(form.get("pedido"));
  const { error } = await supabase.rpc("responder_pedido_grupo", {
    p_pedido: pedido,
    p_comprador: String(form.get("comprador")),
    p_aceitar: form.get("resposta") === "aceitar",
  });
  if (error) return avisar(mensagemDeErro(error));
  revalidatePath(`/pedidos/${pedido}`);
}

// Leilão em grupo fechado: o participante confirma a compra ou desiste.
export async function confirmarCompraGrupo(form: FormData) {
  const { supabase } = await exigirEmpresa();
  const pedido = String(form.get("pedido"));
  const { error } = await supabase.rpc("confirmar_compra_grupo", { p_pedido: pedido, p_confirmar: form.get("resposta") === "confirmar" });
  if (error) return avisar(mensagemDeErro(error));
  revalidatePath(`/pedidos/${pedido}`);
}

export async function escolherVencedor(form: FormData) {
  const { supabase } = await exigirEmpresa();
  const pedido = String(form.get("pedido"));
  const { error } = await supabase.rpc("fechar_pedido", { p_pedido: pedido, p_lance: String(form.get("lance")) });
  if (error) return avisar(mensagemDeErro(error));
  revalidatePath(`/pedidos/${pedido}`);
  redirect(`/pedidos/${pedido}`);
}

export async function cancelarPedido(form: FormData) {
  const { supabase, empresa } = await exigirEmpresa();
  const pedido = String(form.get("pedido"));
  await supabase.from("pedidos").update({ status: "cancelado" }).eq("id", pedido).eq("comprador_id", empresa.id).eq("status", "aberto");
  revalidatePath(`/pedidos/${pedido}`);
}

// Tira os leilões marcados da sua lista. Um leilão seu ainda aberto é cancelado
// antes, para os fornecedores pararem de dar lance.
// Leilão em grupo com lance e outras pessoas contando com ele não pode ser
// cancelado: fica na lista, para quem criou ainda escolher o vencedor.
export async function excluirLeiloes(form: FormData): Promise<string | void> {
  const { supabase, empresa } = await exigirEmpresa();
  const ids = idsMarcados(form);
  if (ids.length === 0) return;
  await supabase.from("pedidos").update({ status: "cancelado" }).in("id", ids).eq("comprador_id", empresa.id).eq("status", "aberto");
  const { data: travados } = await supabase
    .from("pedidos")
    .select("id")
    .in("id", ids)
    .eq("comprador_id", empresa.id)
    .eq("status", "aberto");
  const ficam = new Set((travados ?? []).map((p) => p.id as string));
  await ocultar(supabase, "pedido", ids.filter((id) => !ficam.has(id)));
  revalidatePath("/pedidos");
  if (ficam.size > 0) {
    return ficam.size === 1
      ? "1 leilão em grupo não foi excluído: ele já tem lance e outras pessoas contando com ele. Abra o leilão para escolher o vencedor."
      : `${ficam.size} leilões em grupo não foram excluídos: eles já têm lance e outras pessoas contando com eles. Abra cada um para escolher o vencedor.`;
  }
}

export type ItemLeilaoNovo = {
  produto: string;
  especificacoes: string;
  categoria: string;
  unidade: string;
  quantidade: number;
  preco_maximo: number | null;
  entrega_ate: string;
};

// Cria de uma vez os leilões da planilha que o comprador revisou.
export async function criarLeiloes(dados: { itens: ItemLeilaoNovo[]; horas: number; lancesVisiveis: boolean }): Promise<EstadoForm> {
  const { supabase, empresa } = await exigirEmpresa();
  if (empresa.papel !== "comprador") return { erro: "Mude para o modo Comprar, no menu, para criar leilões." };
  if (dados.itens.length === 0) return { erro: "Marque pelo menos um produto." };
  if (dados.itens.length > 50) return { erro: "Crie no máximo 50 leilões por planilha." };
  const horas = [2, 6, 24, 72, 168].includes(dados.horas) ? dados.horas : 24;

  const linhas = [];
  for (const [n, item] of dados.itens.entries()) {
    const produto = item.produto.trim().slice(0, 120);
    if (!produto) return { erro: `Linha ${n + 1}: falta o nome do produto.` };
    if (!(item.categoria in CATEGORIAS) || !(item.unidade in UNIDADES)) return { erro: `${produto}: escolha a categoria e a unidade.` };
    if (!(item.quantidade > 0)) return { erro: `${produto}: informe a quantidade.` };
    if (item.preco_maximo != null && !(item.preco_maximo > 0)) return { erro: `${produto}: o preço máximo precisa ser maior que zero.` };
    linhas.push({
      comprador_id: empresa.id,
      produto,
      produto_chave: chaveDoProduto(produto),
      categoria: item.categoria,
      unidade: item.unidade,
      quantidade: item.quantidade,
      especificacoes: item.especificacoes.trim().slice(0, 1000) || null,
      entrega_ate: /^\d{4}-\d{2}-\d{2}$/.test(item.entrega_ate) ? item.entrega_ate : null,
      preco_maximo: item.preco_maximo,
      lances_visiveis: dados.lancesVisiveis,
      encerra_em: new Date(Date.now() + horas * 3_600_000).toISOString(),
    });
  }
  const { error } = await supabase.from("pedidos").insert(linhas);
  if (error) return { erro: mensagemDeErro(error) };
  revalidatePath("/pedidos");
  redirect("/pedidos");
}

// Preço de referência do próprio app, sem IA: ofertas da vitrine perto do comprador e a média
// que os compradores da região pagaram nos últimos 30 dias, sempre na mesma unidade.
export async function precosNoApp(dados: { produto: string; produto_chave?: string; unidade: string }): Promise<
  { referencia?: ReferenciaPreco; erro?: string }
> {
  const { supabase, empresa } = await exigirEmpresa();
  const produto = dados.produto.trim().slice(0, 120);
  if (!produto || !(dados.unidade in UNIDADES)) return { erro: "Informe o produto e a unidade." };
  const unidade = dados.unidade as Unidade;
  const chave = dados.produto_chave?.trim() || chaveDoProduto(produto);

  const [{ data: ofertas }, { data: compras }] = await Promise.all([
    supabase.rpc("vitrine_ofertas", { termo: chave }),
    supabase.rpc("preco_medio_regional", { chave, p_unidade: unidade }).maybeSingle<{ preco_medio: number | null; compras: number }>(),
  ]);
  const precos = ((ofertas ?? []) as { fornecedor_id: string; produto_chave: string; unidade: Unidade; preco_unitario: number }[])
    .filter((o) => o.fornecedor_id !== empresa.id && o.produto_chave === chave && o.unidade === unidade)
    .map((o) => Number(o.preco_unitario));
  const pagos = compras?.preco_medio != null ? Number(compras.preco_medio) : null;
  const nCompras = Number(compras?.compras ?? 0);

  if (precos.length === 0 && pagos == null) {
    return { erro: "Ainda não há ofertas nem compras deste produto perto de você. Os lances do leilão vão mostrar o preço." };
  }
  const u = UNIDADES[unidade];
  const partes: string[] = [];
  if (precos.length > 0) {
    partes.push(`${precos.length} oferta${precos.length > 1 ? "s" : ""} na vitrine perto de você, de ${reais(Math.min(...precos))} a ${reais(Math.max(...precos))} por ${u}.`);
  }
  if (pagos != null) {
    partes.push(`Nos últimos 30 dias, ${nCompras} compra${nCompras > 1 ? "s" : ""} na região saíram em média a ${reais(pagos)} por ${u}.`);
  }
  const mediaOfertas = precos.length > 0 ? precos.reduce((a, b) => a + b, 0) / precos.length : null;
  const medio = pagos ?? mediaOfertas;
  const todos = pagos != null ? [...precos, pagos] : precos;
  return {
    referencia: {
      minimo: Math.min(...todos),
      medio: medio != null ? Math.round(medio * 100) / 100 : null,
      maximo: Math.max(...todos),
      unidade,
      resumo: partes.join(" "),
      fontes: [],
      preco_maximo_sugerido: null,
    },
  };
}
