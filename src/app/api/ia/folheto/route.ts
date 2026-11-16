import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { registrarUsoIa } from "@/lib/limite-ia";
import { iaDisponivel, lerFolheto, type ArquivoFolheto, mensagemDaIa } from "@/lib/ia";

// Um folheto com muitas ofertas pode levar mais de um minuto para ser lido.
export const maxDuration = 300;

const TIPOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
// A Vercel aceita até 4,5 MB por requisição; o navegador já reduz as fotos antes de enviar.
const TAMANHO_MAXIMO = 4_400_000;

// Lê um folheto de ofertas (fotos ou PDF) e devolve os itens para o vendedor revisar.
export async function POST(request: Request) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Entre na sua conta." }, { status: 401 });
  if (!iaDisponivel()) return NextResponse.json({ erro: "A leitura automática está indisponível agora. Preencha os dados à mão ou tente mais tarde." }, { status: 503 });

  const { arquivos } = (await request.json()) as { arquivos?: ArquivoFolheto[] };
  if (!Array.isArray(arquivos) || arquivos.length === 0 || arquivos.length > 6) {
    return NextResponse.json({ erro: "Envie de 1 a 6 páginas do folheto." }, { status: 400 });
  }
  if (arquivos.some((a) => !TIPOS.includes(a.tipo) || typeof a.base64 !== "string")) {
    return NextResponse.json({ erro: "Envie fotos (JPG, PNG) ou PDF." }, { status: 400 });
  }
  if (arquivos.reduce((t, a) => t + a.base64.length, 0) > TAMANHO_MAXIMO) {
    return NextResponse.json({ erro: "O folheto passou de 4 MB. Envie menos páginas ou um PDF menor." }, { status: 413 });
  }

  const limite = await registrarUsoIa(supabase, "folheto");
  if (limite) return NextResponse.json({ erro: limite }, { status: 429 });
  try {
    return NextResponse.json(await lerFolheto(arquivos));
  } catch (e) {
    return NextResponse.json({ erro: mensagemDaIa(e) }, { status: 502 });
  }
}
