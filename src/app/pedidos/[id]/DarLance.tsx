"use client";

import { useActionState, useState } from "react";
import { darLance, type EstadoForm } from "../acoes";
import { compararComMedia, type MediaMercado } from "@/lib/escudo";
import { porUnidade, UNIDADES, type Unidade } from "@/lib/dominio";
import { lerNumero } from "@/lib/numero";

const CORES = { abaixo: "text-green-800", media: "text-stone-600", acima: "text-red-800" };

export function DarLance({ pedido, unidade, dica, mercado }: { pedido: string; unidade: Unidade; dica: string; mercado: MediaMercado | null }) {
  const [estado, acao, enviando] = useActionState<EstadoForm, FormData>(darLance, {});
  const [preco, setPreco] = useState("");
  const selo = mercado && compararComMedia(lerNumero(preco), mercado.media);
  return (
    <form action={acao} className="cartao space-y-3">
      <h2 className="font-semibold">Dar lance</h2>
      <p className="text-sm text-stone-600">{dica}</p>
      <input type="hidden" name="pedido" value={pedido} />
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="rotulo" htmlFor="preco">Preço por {UNIDADES[unidade]} (R$)</label>
          <input id="preco" name="preco" required inputMode="decimal" className="campo" value={preco} onChange={(e) => setPreco(e.target.value)} />
        </div>
        <div>
          <label className="rotulo" htmlFor="validade">Validade garantida</label>
          <input id="validade" name="validade" type="date" className="campo" />
        </div>
      </div>
      {mercado && (
        <p className="text-sm">
          Média de mercado: <strong>{porUnidade(mercado.media, unidade)}</strong> ({mercado.fonte}).
          {selo && <span className={`ml-1 font-medium ${CORES[selo.tom]}`}>Seu lance fica {selo.tom === "media" ? "na média" : selo.texto}.</span>}
        </p>
      )}
      <input name="observacao" placeholder="Observação (prazo de entrega, marca...)" className="campo" />
      {estado.erro && <p className="erro">{estado.erro}</p>}
      {estado.ok && !estado.erro && <p className="text-sm font-medium text-green-800">{estado.ok}</p>}
      <button disabled={enviando} className="botao w-full">{enviando ? "Enviando..." : "Enviar lance"}</button>
    </form>
  );
}
