import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ROTAS_PUBLICAS = ["/", "/entrar", "/auth/confirmar", "/diagnostico"];

// Renova a sessão do Supabase a cada requisição e manda quem não está logado
// para a tela de entrada.
export async function proxy(request: NextRequest) {
  // Link de confirmação que voltou para outra página (ex.: o Site URL do Supabase).
  if (request.nextUrl.searchParams.has("code") && request.nextUrl.pathname !== "/auth/confirmar") {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/confirmar";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  // Sem as variáveis do Supabase o app não tem login; deixa as páginas abrirem
  // para que /entrar e /diagnostico expliquem o que falta.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(lista) {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          lista.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Lê a sessão do próprio cookie, sem ir ao servidor de login (só renova quando o
  // token venceu). O proxy roda perto do usuário, no Brasil, e cada ida ao Supabase
  // (nos EUA) custava uns 300 ms em toda troca de tela. Aqui só decide para onde
  // mandar; quem protege os dados é o banco, que confere o token em cada consulta.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = Boolean(session);

  // Já logado não precisa da tela de entrar. Aqui confere o login de verdade
  // (tela rara), para um cookie de conta apagada não ficar indo e voltando.
  if (user && request.nextUrl.pathname === "/entrar" && (await supabase.auth.getUser()).data.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/vitrine";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!user && !ROTAS_PUBLICAS.includes(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Manifesto e ícones do app instalável abrem sem login (o celular busca sem os cookies).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|manifest.webmanifest|sw.js|icones/|icon.png|apple-icon.png|logo.svg).*)"],
};
