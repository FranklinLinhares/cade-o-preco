"use client";

import { useActionState, useState } from "react";
import { avaliarNegocio, type EstadoAvaliacao } from "@/app/negocios/acoes";

// Nota de 1 a 5 estrelas e comentário opcional para a outra parte do negócio.
export function Avaliar({ compra, nome }: { compra: string; nome: string }) {
  const [estado, acao, enviando] = useActionState<EstadoAvaliacao, FormData>(avaliarNegocio, {});
  const [nota, setNota] = useState(0);
  if (estado.ok) return <p className="text-sm text-green-800">Avaliação enviada. Obrigado!</p>;
  return (
    <form action={acao} className="space-y-2">
      <input type="hidden" name="compra" value={compra} />
      <input type="hidden" name="nota" value={nota} />
      <div className="flex items-center gap-0.5" role="radiogroup" aria-label={`Nota para ${nome}`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={nota === n}
            aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
            onClick={() => setNota(n)}
            className={`flex min-h-11 min-w-11 items-center justify-center text-3xl leading-none ${n <= nota ? "text-amber-500" : "text-stone-300"}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea name="comentario" rows={2} maxLength={500} placeholder={`Como foi negociar com ${nome}? (opcional)`} className="campo text-sm" />
      {estado.erro && <p className="erro">{estado.erro}</p>}
      <button disabled={enviando || nota === 0} className="botao py-1.5">{enviando ? "Enviando..." : "Enviar avaliação"}</button>
    </form>
  );
}
