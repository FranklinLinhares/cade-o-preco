import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { registrarUsoIa } from "@/lib/limite-ia";
import { iaDisponivel, pesquisarPreco, mensagemDaIa } from "@/lib/ia";
import { UNIDADES, type Empresa } from "@/lib/dominio";

// Pesquisa uma faixa de preço de referência para o produto, na região do usuário.
export async function POST(request: Request) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Entre na sua conta." }, { status: 401 });
  if (!iaDisponivel()) return NextResponse.json({ erro: "A IA não está configurada neste servidor." }, { status: 503 });

  const { data: empresa } = await supabase.from("empresas").select("cidade, uf").eq("id", user.id).single<Pick<Empresa, "cidade" | "uf">>();
  if (!empresa) return NextResponse.json({ erro: "Complete seu cadastro primeiro." }, { status: 400 });
  const limite = await registrarUsoIa(supabase, "pesquisa");
  if (limite) return NextResponse.json({ erro: limite }, { status: 429 });

  const corpo = (await request.json()) as {
    produto?: string;
    produto_chave?: string;
    especificacoes?: string;
    unidade?: string;
  };
  if (!corpo.produto || !corpo.unidade || !(corpo.unidade in UNIDADES)) {
    return NextResponse.json({ erro: "Informe o produto e a unidade." }, { status: 400 });
  }
  // Textos grandes só gastam a IA à toa (e o limite diário é por conta, não por tamanho).
  if (corpo.produto.length > 120 || (corpo.especificacoes?.length ?? 0) > 1000 || (corpo.produto_chave?.length ?? 0) > 120) {
    return NextResponse.json({ erro: "Descreva o produto em poucas palavras." }, { status: 400 });
  }

  const { data: media } = corpo.produto_chave
    ? await supabase.rpc("preco_medio_regional", { chave: corpo.produto_chave }).maybeSingle<{ preco_medio: number | null }>()
    : { data: null };

  try {
    const referencia = await pesquisarPreco({
      produto: corpo.produto,
      especificacoes: corpo.especificacoes,
      unidade: corpo.unidade as keyof typeof UNIDADES,
      cidade: empresa.cidade,
      uf: empresa.uf,
      precoMedioNoApp: media?.preco_medio ?? null,
    });
    return NextResponse.json(referencia);
  } catch (e) {
    return NextResponse.json({ erro: mensagemDaIa(e) }, { status: 502 });
  }
}
