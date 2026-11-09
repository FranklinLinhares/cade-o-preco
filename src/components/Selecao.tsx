"use client";

import { useEffect, useRef, useState } from "react";

// Barra para marcar vários itens e excluir de uma vez. As caixinhas ficam nos
// cartões da lista (<Marcar>) e entram neste formulário pelo atributo form.
export function BarraSelecao({
  id,
  acao,
  confirmar,
  rotulo = "Excluir",
}: {
  id: string;
  // Pode devolver um texto para avisar a pessoa (ex.: o que não deu para excluir).
  acao: (form: FormData) => Promise<void | string>;
  confirmar: string;
  rotulo?: string;
}) {
  const [marcados, setMarcados] = useState(0);
  const [total, setTotal] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const contar = () => {
      setTotal(visiveis(id).length);
      setMarcados(caixas(id).filter((c) => c.checked).length);
    };
    contar();
    document.addEventListener("change", contar);
    // Abrir ou fechar uma caixa de categoria muda o que está à vista.
    document.addEventListener("toggle", contar, true);
    return () => {
      document.removeEventListener("change", contar);
      document.removeEventListener("toggle", contar, true);
    };
  });

  // Marca só o que está à vista: nada some sem a pessoa ter visto.
  function marcarTodos(marcar: boolean) {
    (marcar ? visiveis(id) : caixas(id)).forEach((c) => (c.checked = marcar));
    setMarcados(caixas(id).filter((c) => c.checked).length);
  }

  if (total === 0) return null;
  return (
    <form
      id={id}
      ref={formRef}
      action={async (form) => {
        setEnviando(true);
        try {
          const aviso = await acao(form);
          if (aviso) alert(aviso);
        } finally {
          setEnviando(false);
          setMarcados(0);
        }
      }}
      onSubmit={(e) => {
        if (!confirm(confirmar.replace("{n}", String(marcados)))) e.preventDefault();
      }}
      className={`sticky top-16 z-10 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm shadow-sm ${marcados ? "border-red-300 bg-red-50" : "border-stone-200 bg-white"}`}
    >
      <label className="flex cursor-pointer items-center gap-2 font-medium">
        <input
          type="checkbox"
          className="h-5 w-5 accent-green-700"
          checked={marcados > 0 && marcados >= total}
          onChange={(e) => marcarTodos(e.target.checked)}
        />
        Marcar todos
      </label>
      <span className={`text-stone-500 ${marcados ? "" : "hidden sm:inline"}`}>{marcados ? `${marcados} marcado${marcados > 1 ? "s" : ""}` : "Marque para excluir"}</span>
      <button
        disabled={!marcados || enviando}
        className="ml-auto inline-flex items-center rounded-lg bg-red-700 px-3 py-1.5 font-semibold text-white hover:bg-red-800 disabled:opacity-40"
      >
        {enviando ? "Excluindo..." : `${rotulo}${marcados ? ` (${marcados})` : ""}`}
      </button>
    </form>
  );
}

function caixas(id: string) {
  return [...document.querySelectorAll<HTMLInputElement>(`input[form="${id}"][name="ids"]`)];
}

function visiveis(id: string) {
  return caixas(id).filter((c) => (c.checkVisibility ? c.checkVisibility() : c.offsetParent !== null));
}

// Caixinha de um item da lista.
export function Marcar({ form, valor, nome }: { form: string; valor: string; nome: string }) {
  return (
    <input
      type="checkbox"
      form={form}
      name="ids"
      value={valor}
      aria-label={`Marcar ${nome}`}
      className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-green-700"
    />
  );
}
