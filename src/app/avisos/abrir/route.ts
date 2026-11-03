import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

// Abrir um aviso: marca como lido e leva para a página dele.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("avisos")
    .update({ lido: true })
    .eq("id", url.searchParams.get("id") ?? "")
    .select("link")
    .maybeSingle();
  // Só caminhos do próprio app.
  const destino = typeof data?.link === "string" && data.link.startsWith("/") && !data.link.startsWith("//") && !data.link.includes("\\") ? data.link : "/avisos";
  return NextResponse.redirect(new URL(destino, url.origin));
}
