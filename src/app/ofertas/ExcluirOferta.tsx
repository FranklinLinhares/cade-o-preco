"use client";

import { excluirOferta } from "./acoes";
import { BotaoEnviar } from "@/components/BotaoEnviar";

// Pede confirmação antes de excluir, porque não dá para desfazer.
export function ExcluirOferta({ id }: { id: string }) {
  return (
    <form
      action={excluirOferta}
      onSubmit={(e) => {
        if (!confirm("Excluir esta oferta? Ela sai da vitrine e não dá para desfazer.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <BotaoEnviar className="min-h-11 text-sm font-medium text-red-700 hover:underline">Excluir</BotaoEnviar>
    </form>
  );
}
