import Link from "next/link";
import type { criarClienteServidor } from "@/lib/supabase/server";
import { buscarReputacao } from "@/lib/reputacao";
import { Estrelas } from "./Estrelas";

type Cliente = Awaited<ReturnType<typeof criarClienteServidor>>;

// Quem está do outro lado do negócio: pessoa, empresa e reputação, para conferir
// antes de confirmar a compra ou a venda.
export async function CartaoParte({ supabase, id, como }: { supabase: Cliente; id: string; como: "vendedor" | "comprador" }) {
  const { data: parte } = await supabase
    .from("empresas")
    .select("id, nome, nome_completo, tipo_documento, agricultor, cidade, uf, criado_em")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      nome: string;
      nome_completo: string | null;
      tipo_documento: string;
      agricultor: boolean;
      cidade: string;
      uf: string;
      criado_em: string;
    }>();
  if (!parte) return null;
  const rep = (await buscarReputacao(supabase, [id])).get(id);
  const empresa = parte.tipo_documento === "cnpj";

  return (
    <div className="cartao space-y-2">
      <h2 className="text-sm font-semibold uppercase text-stone-500">{como === "vendedor" ? "Quem vende" : "Quem compra"}</h2>
      <div>
        <p className="text-lg font-bold">{parte.nome}</p>
        {empresa && parte.nome_completo && parte.nome_completo !== parte.nome && (
          <p className="text-sm text-stone-600">Responsável: {parte.nome_completo}</p>
        )}
        <p className="text-sm text-stone-600">
          {empresa ? "Empresa (CNPJ)" : "Pessoa física (CPF)"}
          {parte.agricultor && " · Agricultura familiar"} · {parte.cidade}/{parte.uf}
        </p>
        <p className="text-xs text-stone-500">No Cadê o Preço desde {new Date(parte.criado_em).toLocaleDateString("pt-BR")}</p>
      </div>
      <p className="text-sm">
        <Estrelas
          nota={como === "vendedor" ? rep?.nota_vendedor : rep?.nota_comprador}
          total={como === "vendedor" ? rep?.avaliacoes_vendedor : rep?.avaliacoes_comprador}
        />{" "}
        · {como === "vendedor" ? `${rep?.vendas ?? 0} vendas` : `${rep?.compras ?? 0} compras`} no app
      </p>
      <Link href={`/perfil/${parte.id}`} className="text-sm text-green-800 underline">Ver perfil completo e avaliações</Link>
    </div>
  );
}
