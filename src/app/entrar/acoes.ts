"use server";

import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";

export type EstadoEntrar = { erro?: string; mensagem?: string };

export async function entrar(estado: EstadoEntrar, form: FormData): Promise<EstadoEntrar> {
  try {
    return await tentarEntrar(estado, form);
  } catch (e) {
    unstable_rethrow(e); // deixa o redirect do Next.js passar
    console.error("Falha ao entrar ou criar conta", e);
    return { erro: "Não foi possível entrar agora. Tente de novo em instantes." };
  }
}

async function tentarEntrar(_: EstadoEntrar, form: FormData): Promise<EstadoEntrar> {
  const email = String(form.get("email") ?? "").trim();
  const senha = String(form.get("senha") ?? "");
  const criarConta = form.get("modo") === "criar";
  if (!email || senha.length < 8) {
    return { erro: "Informe o e-mail e uma senha com pelo menos 8 caracteres." };
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { erro: "O app ainda não está ligado ao banco de dados. Confira as variáveis do Supabase na Vercel." };
  }

  const supabase = await criarClienteServidor();
  if (criarConta) {
    const origem = (await headers()).get("origin") ?? "";
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { emailRedirectTo: `${origem}/auth/confirmar` },
    });
    if (error) return { erro: traduzir(error.message) };
    if (!data.session) {
      return { mensagem: "Enviamos um link de confirmação para o seu e-mail. Confirme e depois entre." };
    }
    redirect("/cadastro");
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) return { erro: traduzir(error.message) };
  redirect("/vitrine");
}

export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/");
}

function traduzir(mensagem: string) {
  if (/invalid login/i.test(mensagem)) return "E-mail ou senha incorretos.";
  if (/already registered/i.test(mensagem)) return "Este e-mail já tem conta. Use a opção Entrar.";
  if (/email not confirmed/i.test(mensagem)) return "Confirme seu e-mail pelo link que enviamos.";
  if (/rate limit/i.test(mensagem)) return "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
  if (/sending confirmation email/i.test(mensagem)) return "Não foi possível enviar o e-mail de confirmação. Tente de novo em alguns minutos.";
  if (/password/i.test(mensagem)) return "A senha não foi aceita. Use pelo menos 8 caracteres, com letras e números.";
  if (/invalid.*email|email.*invalid/i.test(mensagem)) return "E-mail inválido.";
  if (/fetch failed|network/i.test(mensagem)) return "Não foi possível falar com o banco de dados. Tente de novo.";
  console.error("Erro de login sem tradução:", mensagem);
  return "Não foi possível entrar agora. Tente de novo em instantes.";
}
