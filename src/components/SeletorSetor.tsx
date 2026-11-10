import Link from "next/link";
import { SETORES, type Setor } from "@/lib/dominio";

// Botões de setor no topo da Vitrine e dos Leilões: Todos | Armazém | Embalagens e limpeza.
// Mantém os outros filtros da página (busca, origem...) ao trocar de setor.
export function SeletorSetor({ caminho, atual, outros = {} }: { caminho: string; atual: Setor | null; outros?: Record<string, string> }) {
  const link = (setor: Setor | null) => {
    const params = new URLSearchParams(Object.entries(outros).filter(([, v]) => v));
    if (setor) params.set("setor", setor);
    const q = params.toString();
    return q ? `${caminho}?${q}` : caminho;
  };
  const opcoes: [Setor | null, string][] = [[null, "Todos"], ...(Object.keys(SETORES) as Setor[]).map((s): [Setor, string] => [s, SETORES[s].nome])];
  return (
    <nav aria-label="Setores" className="flex flex-wrap gap-2">
      {opcoes.map(([setor, nome]) => (
        <Link
          key={setor ?? "todos"}
          href={link(setor)}
          aria-current={atual === setor ? "page" : undefined}
          className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${
            atual === setor ? "border-green-700 bg-green-700 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-green-700"
          }`}
        >
          {nome}
        </Link>
      ))}
    </nav>
  );
}
