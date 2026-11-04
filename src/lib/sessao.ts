import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Empresa } from "@/lib/dominio";

// Conta logada desta requisição. O cache faz o menu do topo e a página usarem a
// mesma busca, em vez de cada um ir ao Supabase de novo.
// Não chama auth.getUser (uma ida a mais ao servidor de login): a função
// minha_empresa já só devolve algo com um login válido, porque o banco confere o token.
export const contaAtual = cache(async () => {
  const supabase = await criarClienteServidor();
  // Os dados completos (documento, telefone, localização) só pela função da própria conta.
  const { data: empresa } = await supabase.rpc("minha_empresa").maybeSingle<Empresa>();
  return { supabase, empresa: empresa ?? null };
});

// Login conferido no servidor de autenticação; só quando a conta ainda não tem cadastro.
export const usuarioAtual = cache(async () => {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

// Usuário logado com empresa cadastrada; senão manda para o passo que falta.
export async function exigirEmpresa() {
  const { supabase, empresa } = await contaAtual();
  if (!empresa) redirect((await usuarioAtual()) ? "/cadastro" : "/entrar");
  return { supabase, empresa };
}
