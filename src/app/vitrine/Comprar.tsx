"use client";

import Link from "next/link";
import { useActionState } from "react";
import { comprarOferta, type EstadoCompra } from "./acoes";

export function Comprar({ oferta, maximo, unidade, fornecedor, quantidade }: { oferta: string; maximo: number; unidade: string; fornecedor: string; quantidade?: number }) {
  const [estado, acao, enviando] = useActionState<EstadoCompra, FormData>(comprarOferta, {});
  if (estado.ok) {
    return (
      <div className="space-y-2 rounded-lg bg-green-50 p-3">
        <p className="text-sm text-green-800">{estado.ok}</p>
        <p className="text-xs text-stone-600">
          Quando {fornecedor} aceitar, o WhatsApp aparece em <Link href="/negocios" className="underline">Negócios</Link> para vocês combinarem a entrega.
        </p>
      </div>
    );
  }
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="oferta" value={oferta} />
      <label className="flex items-center gap-1">
        Quantidade
        <input name="quantidade" inputMode="decimal" autoComplete="off" required defaultValue={String(quantidade ?? Math.min(1, maximo)).replace(".", ",")} className="campo w-24" />
        {unidade}
      </label>
      <button disabled={enviando} className="botao min-h-11">{enviando ? "Enviando..." : "Enviar pedido ao vendedor"}</button>
      {estado.erro && <span className="text-red-700">{estado.erro}</span>}
    </form>
  );
}
