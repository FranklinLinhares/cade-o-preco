import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

type Inscricao = { endpoint: string; keys: { p256dh: string; auth: string } };

function segredoConfere(recebido: string | null) {
  const certo = process.env.PUSH_SEGREDO;
  if (!certo || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(certo);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Chamado pelo banco (gatilho em avisos) para entregar o aviso nos celulares da conta.
export async function POST(request: Request) {
  const segredo = request.headers.get("x-segredo");
  if (!segredoConfere(segredo)) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) return NextResponse.json({ erro: "Avisos no celular não configurados." }, { status: 503 });
  webpush.setVapidDetails("https://lance-certo-rust.vercel.app", publica, privada);

  const { texto, link, inscricoes } = (await request.json()) as { texto?: string; link?: string; inscricoes?: Inscricao[] };
  if (!texto || !Array.isArray(inscricoes)) return NextResponse.json({ erro: "Aviso incompleto." }, { status: 400 });

  const carga = JSON.stringify({ titulo: "Cadê o Preço", texto: texto.slice(0, 300), link: link?.startsWith("/") ? link : "/avisos" });
  const expirados: string[] = [];
  await Promise.all(
    inscricoes.slice(0, 20).map((i) =>
      webpush.sendNotification(i, carga, { TTL: 60 * 60 * 24 }).catch((e: { statusCode?: number }) => {
        // 404/410: o aparelho desinstalou o app ou tirou a permissão.
        if (e.statusCode === 404 || e.statusCode === 410) expirados.push(i.endpoint);
        else console.error("Aviso no celular falhou", e.statusCode);
      }),
    ),
  );

  if (expirados.length) {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await Promise.all(expirados.map((endpoint) => supabase.rpc("apagar_celular_expirado", { p_segredo: segredo, p_endpoint: endpoint })));
  }
  return NextResponse.json({ enviados: inscricoes.length - expirados.length, expirados: expirados.length });
}
