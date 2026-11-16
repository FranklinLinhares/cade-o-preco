"use client";

import { useActionState } from "react";
import { sairDoGrupo, type EstadoForm } from "../acoes";

// Grupo cujo prazo passou há mais de 2 dias sem quem criou escolher o vencedor:
// quem está no grupo pode sair, para não ficar preso.
export function SairDoGrupoVencido({ pedido }: { pedido: string }) {
  const [estado, sair, saindo] = useActionState<EstadoForm, FormData>(sairDoGrupo, {});
  return (
    <form action={sair} className="space-y-2">
      <input type="hidden" name="pedido" value={pedido} />
      <button disabled={saindo} className="botao-secundario text-red-700">{saindo ? "Saindo..." : "Sair do grupo"}</button>
      {estado.erro && <p className="erro">{estado.erro}</p>}
      {estado.ok && <p className="text-sm font-medium text-green-800">{estado.ok}</p>}
    </form>
  );
}
