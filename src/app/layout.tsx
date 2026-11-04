import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import { contaAtual, usuarioAtual } from "@/lib/sessao";
import { sair } from "@/app/entrar/acoes";
import { trocarModo } from "@/app/cadastro/modo";
import { Navegacao, type ItemMenu } from "@/components/Navegacao";
import { InstalarApp } from "@/components/InstalarApp";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cadê o Preço",
  description: "Compra e venda de alimentos com leilão de menor preço e pesquisa de preços por IA.",
  appleWebApp: { capable: true, title: "Cadê o Preço", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#15803d", viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${geist.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col overflow-x-clip font-sans">
        <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-white/95 shadow-sm shadow-stone-200/40">
          <nav className="relative mx-auto flex max-w-5xl items-center gap-x-2 gap-y-2 px-3 py-2.5 sm:gap-x-4 sm:px-4">
            <Link href="/" className="flex shrink-0 items-center gap-2 text-lg font-bold text-green-800">
              {/* eslint-disable-next-line @next/next/no-img-element -- SVG pequeno e fixo, não precisa de otimização */}
              <img src="/logo.svg" alt="" aria-hidden width={32} height={32} className="h-8 w-8 shadow-sm rounded-xl" />
              <span className="hidden sm:inline">
                Cadê o <span className="text-amber-600">Preço</span>
              </span>
            </Link>
            <Suspense>
              <Menu />
            </Suspense>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-24 lg:pb-10">
          <InstalarApp />
          <Suspense>{children}</Suspense>
        </main>
      </body>
    </html>
  );
}

// Links conforme o modo (comprar ou vender) de quem está logado.
async function Menu() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const { supabase, empresa } = await contaAtual();
  // Sem cadastro: só precisa saber se há login, para mostrar "Entrar" ou "Sair".
  const user = empresa ? true : await usuarioAtual();
  // Pedidos da vitrine esperando a resposta desta conta como vendedora, e avisos não lidos.
  const [{ count: aResponder }, { count: naoLidos }] = empresa
    ? await Promise.all([
        supabase.from("reservas").select("id", { count: "exact", head: true }).eq("fornecedor_id", empresa.id).eq("situacao", "aguardando"),
        supabase.from("avisos").select("id", { count: "exact", head: true }).eq("empresa_id", empresa.id).eq("lido", false),
      ])
    : [{ count: 0 }, { count: 0 }];

  const itens: ItemMenu[] = empresa
    ? [
        ...(empresa.papel === "comprador" ? [{ href: "/vitrine", rotulo: "Vitrine", curto: "Vitrine", icone: "🛒" }] : []),
        { href: "/pedidos", rotulo: "Leilões", curto: "Leilões", icone: "🔨" },
        ...(empresa.papel === "comprador" ? [{ href: "/historico", rotulo: "Meus preços", curto: "Preços", icone: "📈" }] : []),
        ...(empresa.papel === "fornecedor" ? [{ href: "/ofertas", rotulo: "Minhas ofertas", curto: "Ofertas", icone: "🏷️" }] : []),
        { href: "/negocios", rotulo: "Negócios", curto: "Negócios", icone: "🤝", contador: aResponder ?? 0 },
        { href: "/contatos", rotulo: "Contatos", curto: "Contatos", icone: "👥" },
      ]
    : [];

  return (
    <>
      {/* Faixa na cor do modo atual no alto da tela: verde comprando, azul vendendo. */}
      {empresa && <span aria-hidden className={`fixed inset-x-0 top-0 z-40 h-1 ${empresa.papel === "fornecedor" ? "bg-sky-600" : "bg-green-600"}`} />}
      {empresa && <Navegacao itens={itens} modo={empresa.papel} />}
      <div className="ml-auto flex min-w-0 items-center gap-2 text-sm sm:gap-3">
        {empresa && (
          <form action={trocarModo} className="flex overflow-hidden rounded-full border border-stone-300 max-lg:absolute max-lg:top-1/2 max-lg:left-1/2 max-lg:-translate-x-1/2 max-lg:-translate-y-1/2">
            {(["comprador", "fornecedor"] as const).map((p) => (
              <button
                key={p}
                name="papel"
                value={p}
                aria-pressed={empresa.papel === p}
                className={`px-2.5 py-1.5 transition sm:px-3 ${empresa.papel !== p ? "text-stone-600 hover:bg-stone-100" : p === "fornecedor" ? "bg-sky-700 font-semibold text-white" : "bg-green-700 font-semibold text-white"}`}
              >
                {p === "comprador" ? "Comprar" : "Vender"}
              </button>
            ))}
          </form>
        )}
        {empresa && (
          <Link href="/avisos" title="Avisos" aria-label={`Avisos${naoLidos ? `: ${naoLidos} novos` : ""}`} className="relative grid h-9 w-9 place-items-center rounded-full text-lg leading-none text-stone-600 transition hover:bg-green-50 hover:text-green-800">
            🔔
            {!!naoLidos && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 animate-bounce rounded-full bg-amber-500 px-1 text-center text-[10px] leading-4 font-bold text-white ring-2 ring-white [animation-iteration-count:2]">{naoLidos > 9 ? "9+" : naoLidos}</span>
            )}
          </Link>
        )}
        {empresa && (
          <Link href={`/perfil/${empresa.id}`} title="Ver meu perfil e avaliações" className="flex items-center gap-2 text-stone-600 hover:text-green-800">
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-100 font-bold text-amber-900 ring-1 ring-amber-200">
              {empresa.nome.trim().charAt(0).toUpperCase()}
            </span>
            <span className="hidden max-w-[10rem] truncate lg:inline">{empresa.nome}</span>
          </Link>
        )}
        {user ? (
          // No celular o Sair fica no próprio perfil, para o topo caber na tela.
          <form action={sair} className="hidden sm:block">
            <button className="text-stone-600 hover:text-red-700">Sair</button>
          </form>
        ) : (
          <Link href="/entrar" className="botao py-1.5">Entrar</Link>
        )}
      </div>
    </>
  );
}
