"use server";

import { cookies, headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { COOKIE_TROCAR_SENHA, COOKIE_VOLTA, destinoSeguro } from "@/lib/volta";

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
  const volta = destinoSeguro(form.get("volta"));
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
    // Conta nova passa pelo cadastro; ao terminar, volta para a página que trouxe a pessoa.
    if (volta) (await cookies()).set(COOKIE_VOLTA, volta, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 });
    redirect("/cadastro");
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) return { erro: traduzir(error.message) };
  redirect(volta ?? "/vitrine");
}

export type EstadoSenha = { erro?: string; mensagem?: string };

// "Esqueci minha senha": manda por e-mail um link para escolher outra senha.
export async function pedirNovaSenha(_: EstadoSenha, form: FormData): Promise<EstadoSenha> {
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { erro: "Informe o e-mail da sua conta." };
  try {
    const supabase = await criarClienteServidor();
    const origem = (await headers()).get("origin") ?? "";
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origem}/auth/confirmar` });
    if (error) return { erro: traduzirEnvio(error.message) };
  } catch (e) {
    console.error("Falha ao pedir nova senha", e);
    return { erro: "Não foi possível enviar o e-mail agora. Tente de novo em instantes." };
  }
  // O link volta para este aparelho; o cookie diz que é para trocar a senha.
  (await cookies()).set(COOKIE_TROCAR_SENHA, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 });
  // A mesma resposta exista ou não a conta, para ninguém descobrir quem usa o app.
  return {
    mensagem: "Se este e-mail tiver conta, enviamos um link para criar uma senha nova. Abra o link neste mesmo aparelho. Confira também a caixa de spam.",
  };
}

// Grava a senha nova de quem chegou pelo link do e-mail.
export async function trocarSenha(_: EstadoSenha, form: FormData): Promise<EstadoSenha> {
  const senha = String(form.get("senha") ?? "");
  const repetir = String(form.get("repetir") ?? "");
  if (senha.length < 8) return { erro: "Use pelo menos 8 caracteres." };
  if (senha !== repetir) return { erro: "As duas senhas não são iguais." };
  try {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      if (/different from the old/i.test(error.message)) return { erro: "A senha nova precisa ser diferente da antiga." };
      if (/session/i.test(error.message)) return { erro: "O link expirou. Peça outro em “Esqueci minha senha”." };
      return { erro: traduzir(error.message) };
    }
  } catch (e) {
    console.error("Falha ao trocar a senha", e);
    return { erro: "Não foi possível trocar a senha agora. Tente de novo em instantes." };
  }
  (await cookies()).delete(COOKIE_TROCAR_SENHA);
  redirect("/vitrine?senha=trocada");
}

function traduzirEnvio(mensagem: string) {
  if (/rate limit|too many|security purposes/i.test(mensagem)) {
    return "Muitos e-mails pedidos agora. Aguarde um pouco e tente de novo.";
  }
  if (/invalid.*email|email.*invalid/i.test(mensagem)) return "E-mail inválido.";
  console.error("Erro ao pedir nova senha sem tradução:", mensagem);
  return "Não foi possível enviar o e-mail agora. Tente de novo em instantes.";
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
