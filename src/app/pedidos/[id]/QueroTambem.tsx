"use client";

import { useActionState } from "react";
import { entrarNoGrupo, sairDoGrupo, type EstadoForm } from "../acoes";
import { UNIDADES, type Unidade } from "@/lib/dominio";

// Leilão em grupo: entrar com a própria quantidade, mudar a quantidade ou sair.
export function QueroTambem({
  pedido,
  unidade,
  minhaQuantidade,
  maximo,
  regraSaida,
}: {
  pedido: string;
  unidade: Unidade;
  minhaQuantidade: number | null;
  maximo: number;
  regraSaida: string;
}) {
  const [estado, entrar, entrando] = useActionState<EstadoForm, FormData>(entrarNoGrupo, {});
  const [estadoSaida, sair, saindo] = useActionState<EstadoForm, FormData>(sairDoGrupo, {});
  const noGrupo = minhaQuantidade != null;
  const erro = estado.erro ?? estadoSaida.erro;
  const ok = !erro && (estadoSaida.ok ?? estado.ok);
  return (
    <div className="cartao space-y-3 border-violet-300 bg-violet-50">
      <h2 className="font-semibold">{noGrupo ? `Você está no grupo com ${minhaQuantidade} ${unidade}` : "Quer este produto também?"}</h2>
      <p className="text-sm text-stone-600">
        {noGrupo
          ? "Quando o leilão fechar, o vendedor vencedor aceita ou recusa vender a sua parte. Se aceitar, você compra no preço vencedor e combina a entrega e o pagamento direto com ele."
          : "Entre no grupo com a sua quantidade. O produto e as especificações são os de quem criou o leilão. Os vendedores veem o seu nome e a sua quantidade. Se o vencedor aceitar a sua parte, você compra no preço vencedor e paga direto a ele."}
      </p>
      <form action={entrar} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="pedido" value={pedido} />
        <div className="w-40">
          <label className="rotulo" htmlFor="quantidade-grupo">Quantidade ({UNIDADES[unidade]})</label>
          <input id="quantidade-grupo" name="quantidade" required inputMode="decimal" defaultValue={minhaQuantidade ?? ""} className="campo" />
        </div>
        <button disabled={entrando} className="botao">{entrando ? "Enviando..." : noGrupo ? "Mudar quantidade" : "Quero também"}</button>
      </form>
      <p className="text-xs text-stone-500">Até {maximo} {unidade} por pessoa. {regraSaida}</p>
      {noGrupo && (
        <form action={sair}>
          <input type="hidden" name="pedido" value={pedido} />
          <button disabled={saindo} className="text-sm text-red-700 hover:underline">{saindo ? "Saindo..." : "Sair do grupo"}</button>
        </form>
      )}
      {erro && <p className="erro">{erro}</p>}
      {ok && <p className="text-sm font-medium text-green-800">{ok}</p>}
    </div>
  );
}
