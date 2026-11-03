"use server";

import { revalidatePath } from "next/cache";
import { mensagemDeErro } from "@/lib/erros";
import { exigirEmpresa } from "@/lib/sessao";
import { idsMarcados, ocultar } from "@/lib/ocultos";

export type EstadoAvaliacao = { erro?: string; ok?: boolean };

export async function avaliarNegocio(_: EstadoAvaliacao, form: FormData): Promise<EstadoAvaliacao> {
  const { supabase } = await exigirEmpresa();
  const { error } = await supabase.rpc("avaliar", {
    p_compra: String(form.get("compra")),
    p_nota: Number(form.get("nota")),
    p_comentario: String(form.get("comentario") ?? ""),
  });
  if (error) return { erro: mensagemDeErro(error) };
  revalidatePath("/negocios");
  return { ok: true };
}

// Comprador confirma que recebeu; vendedor confirma que entregou e recebeu o pagamento.
export async function concluirNegocio(form: FormData) {
  const { supabase } = await exigirEmpresa();
  const { error } = await supabase.rpc("concluir_negocio", { p_compra: String(form.get("compra")) });
  if (error) throw new Error(mensagemDeErro(error));
  revalidatePath("/", "layout");
}

// Vendedor aceita ou recusa um pedido feito pela vitrine.
export async function responderReserva(form: FormData) {
  const { supabase } = await exigirEmpresa();
  const { error } = await supabase.rpc("responder_reserva", {
    p_reserva: String(form.get("reserva")),
    p_aceitar: form.get("resposta") === "aceitar",
  });
  if (error) throw new Error(mensagemDeErro(error));
  revalidatePath("/", "layout");
}

// Comprador desiste do pedido enquanto o vendedor não respondeu.
export async function cancelarReserva(form: FormData) {
  const { supabase } = await exigirEmpresa();
  const { error } = await supabase.rpc("cancelar_reserva", { p_reserva: String(form.get("reserva")) });
  if (error) throw new Error(mensagemDeErro(error));
  revalidatePath("/", "layout");
}

// Tira negócios e pedidos da vitrine da sua lista; a outra parte continua vendo.
// Pedido seu ainda aguardando é cancelado antes, para devolver a quantidade.
export async function excluirNegocios(form: FormData) {
  const { supabase } = await exigirEmpresa();
  const ids = idsMarcados(form);
  const compras = ids.filter((i) => i.startsWith("c:")).map((i) => i.slice(2));
  const reservas = ids.filter((i) => i.startsWith("r:")).map((i) => i.slice(2));
  const { data: aguardando } = await supabase.from("reservas").select("id").in("id", reservas).eq("situacao", "aguardando");
  // Pedido que não deu para cancelar continua na lista: senão some e segue prendendo o estoque.
  const naoCancelados = new Set<string>();
  for (const r of aguardando ?? []) {
    const { error } = await supabase.rpc("cancelar_reserva", { p_reserva: r.id });
    if (error) naoCancelados.add(r.id);
  }
  await ocultar(supabase, "compra", compras);
  await ocultar(supabase, "reserva", reservas.filter((r) => !naoCancelados.has(r)));
  revalidatePath("/", "layout");
}
