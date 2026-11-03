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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Já logado não precisa da tela de entrar.
  if (user && request.nextUrl.pathname === "/entrar") {
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
