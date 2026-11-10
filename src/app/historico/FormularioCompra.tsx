"use client";

import { useActionState } from "react";
import { registrarCompraExterna, type EstadoHistorico } from "./acoes";
import { UNIDADES } from "@/lib/dominio";
import { OpcoesCategoria } from "@/components/OpcoesCategoria";

export function FormularioCompra() {
  const [estado, acao, enviando] = useActionState<EstadoHistorico, FormData>(registrarCompraExterna, {});
  return (
    <details className="cartao">
      <summary className="cursor-pointer font-semibold">Registrar compra feita fora do app</summary>
      <form action={acao} className="mt-3 grid gap-2 sm:grid-cols-2">
        <input name="produto" required placeholder="Produto" className="campo sm:col-span-2" />
        <select name="categoria" className="campo"><OpcoesCategoria /></select>
        <select name="unidade" className="campo">{Object.entries(UNIDADES).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
        <input name="quantidade" required inputMode="decimal" placeholder="Quantidade" className="campo" />
        <input name="preco_unitario" required inputMode="decimal" placeholder="Preço por unidade (R$)" className="campo" />
        <input name="fornecedor_nome" placeholder="Onde comprou" className="campo" />
        <input name="data" type="date" className="campo" />
        {estado.erro && <p className="erro sm:col-span-2">{estado.erro}</p>}
        {estado.ok && <p className="aviso sm:col-span-2">Compra registrada.</p>}
        <button disabled={enviando} className="botao sm:col-span-2">Registrar</button>
      </form>
    </details>
  );
}
