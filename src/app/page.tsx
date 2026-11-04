import Link from "next/link";
import { contaAtual, usuarioAtual } from "@/lib/sessao";

const RECURSOS = [
  {
    icone: "🔨",
    titulo: "Leilão de menor preço",
    texto: "Publique o pedido e receba lances. Você decide se os fornecedores veem os preços uns dos outros.",
  },
  {
    icone: "🛒",
    titulo: "Vitrine com comparação",
    texto: "Veja quantos fornecedores oferecem o produto perto de você e o menor, o médio e o maior preço.",
  },
  {
    icone: "✨",
    titulo: "Pesquisa de preço por IA",
    texto: "A IA busca cotações de CEASA, CONAB e atacadistas e mostra quanto você pagou semana a semana.",
  },
];

const PASSOS = [
  { titulo: "Crie sua conta", texto: "Uma conta só para comprar e vender." },
  { titulo: "Publique ou procure", texto: "Abra um leilão ou compare ofertas na vitrine." },
  { titulo: "Feche o negócio", texto: "Escolha o melhor preço e combine a entrega." },
];

export default async function Inicio() {
  // Quem já entrou vai direto para o app, sem passar de novo pela tela de entrar.
  const configurado = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Com cadastro já basta a busca que o menu do topo faz; sem cadastro, confere o login.
  const user = configurado ? (await contaAtual()).empresa ?? (await usuarioAtual()) : null;
  return (
    <div className="space-y-10 py-2">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-green-700 via-green-800 to-emerald-950 px-6 py-10 text-white shadow-lg sm:px-10 sm:py-14">
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 h-56 w-56 rounded-full bg-amber-300/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 left-10 h-56 w-56 rounded-full bg-lime-300/20 blur-3xl" />
        <div className="relative max-w-2xl space-y-5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-medium ring-1 ring-white/25">
            🥕 Alimentos · leilão reverso
          </span>
          <h1 className="text-3xl leading-tight font-bold sm:text-5xl">
            Compre alimentos pelo <span className="text-amber-300">menor preço</span> da sua região.
          </h1>
          <p className="text-lg text-green-50/90">
            Restaurantes, mercados e cozinhas publicam o que precisam e fornecedores disputam o pedido.
            Fornecedores e agricultores anunciam o que têm, e você compara preços lado a lado.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={user ? "/vitrine" : "/entrar"} className="botao from-amber-400 to-amber-500 text-amber-950 hover:from-amber-300 hover:to-amber-400">
              {user ? "Abrir o app →" : "Começar agora →"}
            </Link>
            <Link href="/vitrine" className="botao-secundario border-white/40 bg-white/10 text-white hover:border-white hover:bg-white/20">
              Ver a vitrine
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {RECURSOS.map((r, i) => (
          <div key={r.titulo} className="cartao animate-surgir space-y-2 hover:-translate-y-0.5" style={{ animationDelay: `${i * 80}ms` }}>
            <span aria-hidden className="grid h-11 w-11 place-items-center rounded-2xl bg-green-100 text-2xl">{r.icone}</span>
            <h2 className="font-semibold">{r.titulo}</h2>
            <p className="text-sm text-stone-600">{r.texto}</p>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold">Como funciona</h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {PASSOS.map((p, i) => (
            <li key={p.titulo} className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-400 font-bold text-amber-950 shadow-sm">{i + 1}</span>
              <div>
                <div className="font-semibold">{p.titulo}</div>
                <div className="text-sm text-stone-600">{p.texto}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
