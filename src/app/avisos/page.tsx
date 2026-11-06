import Link from "next/link";
import { exigirEmpresa } from "@/lib/sessao";
import { dataHora, porUnidade, type Unidade } from "@/lib/dominio";
import { BarraSelecao, Marcar } from "@/components/Selecao";
import { BotaoConfirmar } from "@/components/BotaoConfirmar";
import { excluirAvisos, excluirLidos, marcarTodosLidos, removerAlerta } from "./acoes";
import { NovoAlerta } from "./NovoAlerta";
import { AvisosNoCelular } from "./AvisosNoCelular";

type Aviso = { id: string; texto: string; lido: boolean; criado_em: string };
type Alerta = { id: string; produto: string; unidade: Unidade; preco_maximo: number };

// O sino do menu: o que aconteceu nos seus leilões, pedidos e alertas de preço.
export default async function Avisos({ searchParams }: PageProps<"/avisos">) {
  const { erro } = await searchParams;
  const { supabase, empresa } = await exigirEmpresa();
  const [{ data: dadosAvisos }, { data: dadosAlertas }] = await Promise.all([
    supabase.from("avisos").select("id, texto, lido, criado_em").eq("empresa_id", empresa.id).order("criado_em", { ascending: false }).limit(50).returns<Aviso[]>(),
    supabase.from("alertas_preco").select("id, produto, unidade, preco_maximo").eq("empresa_id", empresa.id).order("criado_em").returns<Alerta[]>(),
  ]);
  const avisos = dadosAvisos ?? [];
  const alertas = dadosAlertas ?? [];
  const naoLidos = avisos.filter((a) => !a.lido).length;
  const lidos = avisos.length - naoLidos;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Avisos</h1>
        <div className="flex flex-wrap gap-2">
          {naoLidos > 0 && (
            <form action={marcarTodosLidos}>
              <button className="botao-secundario py-1 text-sm">Marcar todos como lidos</button>
            </form>
          )}
          {lidos > 0 && (
            <form action={excluirLidos}>
              <BotaoConfirmar pergunta="Excluir todos os avisos já lidos? Não dá para desfazer." className="botao-secundario py-1 text-sm text-red-700">Excluir os lidos</BotaoConfirmar>
            </form>
          )}
        </div>
      </div>
      {erro === "excluir" && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Não foi possível excluir os avisos agora. Tente de novo daqui a pouco.
        </p>
      )}
      <AvisosNoCelular />
      {avisos.length === 0 ? (
        <p className="cartao text-stone-600">
          Nada por aqui ainda. Você recebe avisos de leilões novos perto de você, lances nos seus leilões, pedidos da vitrine e alertas de preço.
        </p>
      ) : (
        <>
          <BarraSelecao id="excluir-avisos" acao={excluirAvisos} confirmar="Excluir {n} aviso(s)? Eles somem do sino e não dá para desfazer." />
          <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
            {avisos.map((a) => (
              <li key={a.id} className="flex items-start gap-1 pl-3">
                <span className="pt-2.5">
                  <Marcar form="excluir-avisos" valor={a.id} nome={a.texto} />
                </span>
                <Link href={`/avisos/abrir?id=${a.id}`} className={`flex flex-1 items-start gap-3 px-3 py-3 hover:bg-stone-50 ${a.lido ? "text-stone-500" : ""}`}>
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${a.lido ? "bg-transparent" : "bg-amber-500"}`} aria-hidden />
                  <span className="flex-1">
                    <span className={a.lido ? "" : "font-medium"}>{a.texto}</span>
                    <span className="block text-xs text-stone-500">{dataHora(a.criado_em)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <section className="cartao space-y-3">
        <div>
          <h2 className="font-semibold">Alertas de preço</h2>
          <p className="text-sm text-stone-600">Avisamos quando aparecer na vitrine, perto de você, uma oferta do produto pelo preço que você quer pagar.</p>
        </div>
        <NovoAlerta />
        {alertas.length > 0 && (
          <ul className="divide-y divide-stone-100">
            {alertas.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {a.produto} até <strong>{porUnidade(a.preco_maximo, a.unidade)}</strong>
                </span>
                <form action={removerAlerta}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="text-sm text-red-700 underline">Remover</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
