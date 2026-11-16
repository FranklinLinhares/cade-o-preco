import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { registrarUsoIa } from "@/lib/limite-ia";
import { estruturarItem, iaDisponivel, mensagemDaIa } from "@/lib/ia";

// Transforma o texto livre de um pedido ou oferta em campos preenchidos.
export async function POST(request: Request) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Entre na sua conta." }, { status: 401 });
  if (!iaDisponivel()) return NextResponse.json({ erro: "A leitura automática está indisponível agora. Preencha os dados à mão ou tente mais tarde." }, { status: 503 });

  const { texto } = (await request.json()) as { texto?: string };
  if (!texto || texto.trim().length < 3 || texto.length > 2000) {
    return NextResponse.json({ erro: "Descreva o produto em poucas palavras." }, { status: 400 });
  }
  const limite = await registrarUsoIa(supabase, "item");
  if (limite) return NextResponse.json({ erro: limite }, { status: 429 });
  try {
    return NextResponse.json(await estruturarItem(texto));
  } catch (e) {
    return NextResponse.json({ erro: mensagemDaIa(e) }, { status: 502 });
  }
}
