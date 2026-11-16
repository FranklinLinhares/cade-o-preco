"use server";

import { revalidatePath } from "next/cache";
import { exigirEmpresa } from "@/lib/sessao";
import { mensagemDeErro } from "@/lib/erros";
import { avisar } from "@/lib/aviso";

// Cada ação chama uma função do banco que confere, ela mesma, se quem pede é administrador.
async function executar(funcao: string, args: Record<string, string | null>, ok: string) {
  const { supabase } = await exigirEmpresa();
  const { error } = await supabase.rpc(funcao, args);
  await avisar(error ? mensagemDeErro(error) : ok);
  revalidatePath("/admin");
}

const id = (form: FormData) => String(form.get("id") ?? "");
const motivo = (form: FormData) => String(form.get("motivo") ?? "").trim().slice(0, 300) || null;

export async function bloquearConta(form: FormData) {
  await executar("admin_bloquear_conta", { conta: id(form), motivo: motivo(form) }, "Conta bloqueada.");
}

export async function desbloquearConta(form: FormData) {
  await executar("admin_desbloquear_conta", { conta: id(form) }, "Conta desbloqueada.");
}

export async function tirarOferta(form: FormData) {
  await executar("admin_tirar_oferta", { oferta: id(form), motivo: motivo(form) }, "Oferta retirada da vitrine.");
}

export async function devolverOferta(form: FormData) {
  await executar("admin_devolver_oferta", { oferta: id(form) }, "Oferta liberada. Quem vende pode publicar de novo.");
}

export async function tirarLeilao(form: FormData) {
  await executar("admin_tirar_leilao", { leilao: id(form), motivo: motivo(form) }, "Leilão retirado.");
}
