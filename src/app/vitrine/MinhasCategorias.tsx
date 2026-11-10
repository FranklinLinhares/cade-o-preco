"use client";

import { useRef } from "react";
import { CATEGORIAS, SETORES, type Categoria, type Setor } from "@/lib/dominio";
import { salvarCategorias } from "./acoes";

// Marcar ou desmarcar uma categoria já salva, separadas por setor. A mesma escolha
// vale para a vitrine (marcadas abrem primeiro) e para os leilões no modo Vender
// (só as marcadas aparecem). "Todo o setor" marca ou desmarca as categorias dele.
// Com um setor escolhido no topo, só as categorias dele aparecem; as marcadas dos
// outros setores seguem salvas (vão escondidas no formulário).
export function MinhasCategorias({ marcadas, dica, setor = null }: { marcadas: Categoria[]; dica: string; setor?: Setor | null }) {
  const setores = setor ? [setor] : (Object.keys(SETORES) as Setor[]);
  const deOutros = marcadas.filter((c) => !setores.some((s) => (SETORES[s].categorias as readonly Categoria[]).includes(c)));
  const form = useRef<HTMLFormElement>(null);

  function marcarSetor(setor: Setor) {
    const caixas = [...(form.current?.querySelectorAll<HTMLInputElement>(`input[data-setor="${setor}"]`) ?? [])];
    const todas = caixas.every((c) => c.checked);
    caixas.forEach((c) => (c.checked = !todas));
    form.current?.requestSubmit();
  }

  return (
    <form ref={form} action={salvarCategorias} className="space-y-2">
      <div className="text-sm font-medium text-stone-700">Suas categorias de interesse</div>
      {deOutros.map((c) => <input key={c} type="hidden" name="categorias" value={c} />)}
      {setores.map((setor) => (
        <div key={setor} className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => marcarSetor(setor)}
            className="min-h-9 rounded-full px-1 text-sm font-semibold text-stone-700 underline decoration-dotted underline-offset-4 hover:text-green-800"
            title="Marcar ou desmarcar todo o setor"
          >
            {SETORES[setor].nome}:
          </button>
          {SETORES[setor].categorias.map((valor) => (
            <label
              key={valor}
              className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1 text-sm has-checked:border-green-700 has-checked:bg-green-100 has-checked:text-green-900"
            >
              <input
                type="checkbox"
                name="categorias"
                value={valor}
                data-setor={setor}
                defaultChecked={marcadas.includes(valor)}
                onChange={() => form.current?.requestSubmit()}
                className="accent-green-700"
              />
              {CATEGORIAS[valor]}
            </label>
          ))}
        </div>
      ))}
      <p className="text-xs text-stone-500">{dica} Toque no nome do setor para marcar ou desmarcar todas as categorias dele.</p>
    </form>
  );
}
