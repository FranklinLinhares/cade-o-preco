import { CATEGORIAS, SETORES, type Setor } from "@/lib/dominio";

// Opções de um <select> de categoria, agrupadas por setor (Armazém, Embalagens e limpeza...).
export function OpcoesCategoria() {
  return (
    <>
      {(Object.keys(SETORES) as Setor[]).map((s) => (
        <optgroup key={s} label={SETORES[s].nome}>
          {SETORES[s].categorias.map((c) => (
            <option key={c} value={c}>{CATEGORIAS[c]}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
