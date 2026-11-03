"use server";

import { revalidatePath } from "next/cache";
import { exigirEmpresa } from "@/lib/sessao";
import { cnpjValido, cpfValido, soDigitos } from "@/lib/documentos";

export async function adicionarContato(form: FormData) {
  const { supabase, empresa } = await exigirEmpresa();
  const tipo = form.get("tipo") === "cliente" ? "cliente" : "fornecedor";
  await supabase
    .from("contatos")
    .upsert({ dono_id: empresa.id, contato_id: String(form.get("contato")), tipo }, { ignoreDuplicates: true });
  revalidatePath("/contatos");
}

export async function removerContato(form: FormData) {
  const { supabase, empresa } = await exigirEmpresa();
  await supabase
    .from("contatos")
    .delete()
    .eq("dono_id", empresa.id)
    .eq("contato_id", String(form.get("contato")))
    .eq("tipo", String(form.get("tipo")));
  revalidatePath("/contatos");
}

export type EstadoContato = { erro?: string; ok?: string; valores?: Record<string, string> };

// Cadastra à mão um fornecedor ou cliente. Se o CPF/CNPJ já é de uma conta do app,
// salva a conta como contato (assim ela pode ser convidada para leilões e ofertas).
export async function criarContatoManual(_: EstadoContato, form: FormData): Promise<EstadoContato> {
  const { supabase, empresa } = await exigirEmpresa();
  const valores = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const falha = (erro: string): EstadoContato => ({ erro, valores });
  const texto = (campo: string, max: number) => String(form.get(campo) ?? "").trim().slice(0, max) || null;
  const tipo = form.get("tipo") === "cliente" ? "cliente" : "fornecedor";
  const nome = texto("nome", 120);
  if (!nome || nome.length < 2) return falha("Informe o nome do contato.");
  const telefone = soDigitos(String(form.get("telefone") ?? "")).slice(0, 13) || null;
  if (telefone && telefone.length < 10) return falha("Telefone com DDD, por exemplo (83) 99999-9999.");
  const email = texto("email", 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return falha("E-mail inválido.");
  const documento = soDigitos(String(form.get("documento") ?? "")) || null;
  if (documento && !cpfValido(documento) && !cnpjValido(documento)) return falha("CPF ou CNPJ inválido.");
  const uf = texto("uf", 2)?.toUpperCase() ?? null;

  if (documento) {
    const { data } = await supabase.rpc("encontrar_empresas", { termo: documento });
    const conta = ((data ?? []) as { id: string; nome: string }[])[0];
    if (conta) {
      await supabase.from("contatos").upsert({ dono_id: empresa.id, contato_id: conta.id, tipo }, { ignoreDuplicates: true });
      revalidatePath("/contatos");
      return { ok: `${conta.nome} já usa o Cadê o Preço e foi salvo como seu ${tipo}.` };
    }
  }

  const { error } = await supabase.from("contatos_manuais").insert({
    dono_id: empresa.id, tipo, nome, telefone, email, documento,
    cidade: texto("cidade", 80), uf, observacao: texto("observacao", 500),
  });
  if (error) return falha("Não deu para salvar o contato. Tente de novo.");
  revalidatePath("/contatos");
  return { ok: `${nome} salvo nos seus ${tipo === "cliente" ? "clientes" : "fornecedores"}.` };
}

export async function removerContatoManual(form: FormData) {
  const { supabase, empresa } = await exigirEmpresa();
  await supabase.from("contatos_manuais").delete().eq("id", String(form.get("id"))).eq("dono_id", empresa.id);
  revalidatePath("/contatos");
}
