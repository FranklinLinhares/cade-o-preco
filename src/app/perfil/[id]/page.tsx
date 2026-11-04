import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirEmpresa } from "@/lib/sessao";
import { buscarReputacao } from "@/lib/reputacao";
import { Estrelas } from "@/components/Estrelas";
import { dataHora } from "@/lib/dominio";
import { sair } from "@/app/entrar/acoes";

type Perfil = {
  id: string;
  nome: string;
  tipo_documento: string;
  agricultor: boolean;
  cidade: string;
  uf: string;
  criado_em: string;
};
type Avaliacao = {
  id: string;
  nota: number;
  comentario: string | null;
  avaliado_como: "vendedor" | "comprador";
  criado_em: string;
  avaliador: { nome: string } | null;
};

// Perfil público com a reputação como vendedor e como comprador.
export default async function PerfilPublico({ params }: PageProps<"/perfil/[id]">) {
  const { id } = await params;
  const { supabase, empresa } = await exigirEmpresa();
  const meuPerfil = empresa.id === id;

  // As três buscas não dependem uma da outra: saem ao mesmo tempo.
  const [{ data: perfil }, reputacoes, { data }] = await Promise.all([
    supabase
      .from("empresas")
      .select("id, nome, tipo_documento, agricultor, cidade, uf, criado_em")
      .eq("id", id)
      .maybeSingle<Perfil>(),
    buscarReputacao(supabase, [id]),
    supabase
      .from("avaliacoes")
      .select("id, nota, comentario, avaliado_como, criado_em, avaliador:empresas!avaliacoes_avaliador_id_fkey(nome)")
      .eq("avaliado_id", id)
      .order("criado_em", { ascending: false })
      .limit(20),
  ]);
  if (!perfil) notFound();
  const reputacao = reputacoes.get(id);
  const avaliacoes = (data ?? []) as unknown as Avaliacao[];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="cartao space-y-1">
        <h1 className="text-2xl font-bold">{perfil.nome}</h1>
        <p className="text-stone-600">
          {perfil.tipo_documento === "cnpj" ? "Empresa" : "Pessoa física"}
          {perfil.agricultor && " · Agricultura familiar"} · {perfil.cidade}/{perfil.uf}
        </p>
        <p className="text-sm text-stone-500">No Cadê o Preço desde {new Date(perfil.criado_em).toLocaleDateString("pt-BR")}</p>
        {meuPerfil && (
          <p className="pt-2 text-sm">
            Este é o seu perfil, como os outros veem. <Link href="/cadastro" className="underline">Editar cadastro</Link>
          </p>
        )}
        {meuPerfil && (
          <form action={sair} className="pt-2 sm:hidden">
            <button className="botao-secundario w-full text-red-700">Sair da conta</button>
          </form>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="cartao space-y-1">
          <h2 className="font-semibold">Como vendedor</h2>
          <Estrelas nota={reputacao?.nota_vendedor} total={reputacao?.avaliacoes_vendedor} />
          <p className="text-sm text-stone-600">{reputacao?.vendas ?? 0} vendas no app</p>
        </div>
        <div className="cartao space-y-1">
          <h2 className="font-semibold">Como comprador</h2>
          <Estrelas nota={reputacao?.nota_comprador} total={reputacao?.avaliacoes_comprador} />
          <p className="text-sm text-stone-600">{reputacao?.compras ?? 0} compras no app</p>
        </div>
      </div>

      <section className="cartao space-y-2">
        <h2 className="font-semibold">Avaliações recebidas</h2>
        {avaliacoes.length === 0 && <p className="text-sm text-stone-500">Ainda não recebeu avaliações.</p>}
        <ul className="divide-y divide-stone-100">
          {avaliacoes.map((a) => (
            <li key={a.id} className="space-y-0.5 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-amber-700">{"★".repeat(a.nota)}<span className="text-stone-300">{"★".repeat(5 - a.nota)}</span></span>
                <span className="text-xs text-stone-500">
                  {a.avaliador?.nome} · como {a.avaliado_como} · {dataHora(a.criado_em)}
                </span>
              </div>
              {a.comentario && <p className="text-sm">{a.comentario}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
