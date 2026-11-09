"use server";

import { revalidatePath } from "next/cache";
import { mensagemDeErro } from "@/lib/erros";
import { exigirEmpresa } from "@/lib/sessao";
import { idsMarcados, ocultar } from "@/lib/ocultos";
import { CATEGORIAS, type Categoria } from "@/lib/dominio";
import { lerNumero } from "@/lib/numero";

export type EstadoCompra = { erro?: string; ok?: string };

// Envia o pedido de compra ao vendedor; a quantidade fica reservada até ele responder.
export async function comprarOferta(_: EstadoCompra, form: FormData): Promise<EstadoCompra> {
  const { supabase } = await exigirEmpresa();
  await supabase.rpc("expirar_reservas"); // libera o estoque de pedidos esquecidos antes de reservar
  const quantidade = lerNumero(String(form.get("quantidade")));
  if (!(quantidade > 0)) return { erro: "Informe uma quantidade maior que zero, por exemplo 2 ou 1,5." };
  const { error } = await supabase.rpc("reservar_oferta", {
    p_oferta: String(form.get("oferta")),
    p_quantidade: quantidade,
  });
  if (error) return { erro: mensagemDeErro(error) };
  revalidatePath("/vitrine");
  revalidatePath("/negocios");
  return { ok: "Pedido enviado ao vendedor. A quantidade fica reservada até ele responder." };
}

// Categorias de interesse: abrem primeiro na vitrine e, no modo Vender, escolhem
// quais leilões aparecem e de quais chega aviso.
export async function salvarCategorias(form: FormData) {
  const { supabase, empresa } = await exigirEmpresa();
  const categorias = form
    .getAll("categorias")
    .map(String)
    .filter((c): c is Categoria => c in CATEGORIAS);
  await supabase.from("empresas").update({ categorias }).eq("id", empresa.id);
  revalidatePath("/vitrine");
  revalidatePath("/pedidos");
}

// Tira da sua vitrine as ofertas marcadas; para os outros elas continuam.
export async function ocultarOfertas(form: FormData) {
  const { supabase } = await exigirEmpresa();
  await ocultar(supabase, "oferta", idsMarcados(form));
  revalidatePath("/vitrine");
}
