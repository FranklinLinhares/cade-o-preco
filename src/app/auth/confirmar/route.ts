import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { COOKIE_TROCAR_SENHA } from "@/lib/volta";

// Destino dos links que chegam por e-mail (confirmação de conta e troca de senha):
// troca o código por uma sessão. Quem pediu nova senha neste aparelho vai para a
// tela de escolher a senha nova.
export async function GET(request: NextRequest) {
  const trocandoSenha = request.cookies.has(COOKIE_TROCAR_SENHA);
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(trocandoSenha ? "/entrar/nova-senha" : "/cadastro", request.url));
  }
  const resposta = NextResponse.redirect(
    new URL(trocandoSenha ? "/entrar/recuperar?erro=link" : "/entrar?erro=confirmacao", request.url),
  );
  return resposta;
}
