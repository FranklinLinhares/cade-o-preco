import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Chamado pelo próprio banco a cada 5 minutos (migração 0027) para o app não
// "dormir". Sem isso, a primeira tela depois de um tempo parado levava de 5 a 8 s:
// o servidor da Vercel acordando, a primeira consulta ao banco (até 3 s) e a
// renovação do login (até 2 s). Faz duas leituras baratas que não mostram nenhum dado.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) return NextResponse.json({ ok: false }, { status: 503 });

  const supabase = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  const inicio = performance.now();
  const [banco, login] = await Promise.all([
    // Sem login o banco responde "sem permissão" (401): mesmo assim a consulta chega
    // até ele, que é o que importa aqui.
    supabase.from("empresas").select("id", { head: true }).limit(1),
    fetch(`${url}/auth/v1/health`, { headers: { apikey: chave }, cache: "no-store" }),
  ]);
  return NextResponse.json(
    { ok: banco.status > 0 && banco.status < 500 && login.ok, ms: Math.round(performance.now() - inicio) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
