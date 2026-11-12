"use client";

import { useEffect, useState } from "react";

// Exibe o aviso uma vez e apaga o cookie, para ele não voltar na próxima tela.
export function ApagarAviso({ mensagem }: { mensagem: string }) {
  const [aberto, setAberto] = useState(true);
  useEffect(() => {
    document.cookie = "aviso=; path=/; max-age=0";
  }, []);
  if (!aberto) return null;
  return (
    <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
      <span aria-hidden>⚠️</span>
      <p className="flex-1">{mensagem}</p>
      <button type="button" onClick={() => setAberto(false)} className="px-2 text-lg leading-none" aria-label="Fechar aviso">×</button>
    </div>
  );
}
