"use client";

import { useState, useTransition } from "react";
import { CATEGORIAS, UNIDADES, type Categoria, type Unidade } from "@/lib/dominio";
import { Girando } from "@/components/Girando";
import { lerPlanilhaLeiloes, type ItemLeilao } from "@/lib/planilha";
import { criarLeiloes } from "../acoes";
import { lerNumero } from "@/lib/numero";

type Linha = ItemLeilao & { incluir: boolean };

const numero = (v: string) => lerNumero(v);

export function LeiloesDaPlanilha() {
  const [linhas, setLinhas] = useState<Linha[]>();
  const [erro, setErro] = useState<string>();
  const [horas, setHoras] = useState("24");
  const [lancesVisiveis, setLancesVisiveis] = useState(true);
  const [criando, iniciar] = useTransition();

  async function abrir(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(undefined);
    try {
      const itens = await lerPlanilhaLeiloes(arquivo);
      if (itens.length === 0) throw new Error("A planilha não tem produtos. Preencha a partir da linha 2.");
      setLinhas(itens.map((i) => ({ ...i, incluir: true })));
    } catch (e) {
      setErro((e as Error).message || "Não foi possível ler a planilha. Use o modelo em .xlsx ou .csv.");
    }
  }

  function mudar(indice: number, campos: Partial<Linha>) {
    setLinhas((atuais) => atuais?.map((l, i) => (i === indice ? { ...l, ...campos } : l)));
  }

  function criar() {
    setErro(undefined);
    const marcados = (linhas ?? []).filter((l) => l.incluir);
    iniciar(async () => {
      const resultado = await criarLeiloes({
        horas: Number(horas),
        lancesVisiveis,
        itens: marcados.map((l) => ({
          produto: l.produto,
          especificacoes: l.especificacoes,
          categoria: l.categoria,
          unidade: l.unidade,
          quantidade: numero(l.quantidade),
          preco_maximo: l.preco_maximo.trim() ? numero(l.preco_maximo) : null,
          entrega_ate: l.entrega_ate,
        })),
      });
      if (resultado?.erro) setErro(resultado.erro);
    });
  }

  if (!linhas) {
    return (
      <div className="cartao space-y-3">
        <p className="text-sm text-stone-600">
          Preencha o <a href="/modelo-leiloes-cade-o-preco.xlsx" download className="font-medium text-green-800 underline">modelo de planilha</a> com
          produto, especificações, categoria, unidade, quantidade e, se quiser, o preço máximo e a data de entrega. Depois envie aqui. Aceita .xlsx e .csv.
        </p>
        <input
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Planilha de leilões"
          onChange={(e) => {
            abrir(e.target.files?.[0]);
            e.target.value = "";
          }}
          className="campo"
        />
        {erro && <p className="erro">{erro}</p>}
      </div>
    );
  }

  const marcados = linhas.filter((l) => l.incluir).length;
  // Na revisão, os produtos já aparecem separados por categoria, como na lista de leilões.
  const categorias = (Object.keys(CATEGORIAS) as Categoria[]).filter((c) => linhas.some((l) => l.categoria === c));
  return (
    <div className="space-y-4">
      <div className="cartao space-y-3">
        <p>
          A planilha tem <strong>{linhas.length} produtos</strong>. Confira, desmarque o que não quer e escolha como os leilões vão funcionar.
          {linhas.some((l) => l.conferir) && <span className="block text-amber-800">Os itens em amarelo têm categoria ou unidade que não reconhecemos: confira antes de criar.</span>}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="rotulo" htmlFor="horas">Receber lances por</label>
            <select id="horas" value={horas} onChange={(e) => setHoras(e.target.value)} className="campo">
              <option value="2">2 horas</option>
              <option value="6">6 horas</option>
              <option value="24">1 dia</option>
              <option value="72">3 dias</option>
              <option value="168">7 dias</option>
            </select>
          </div>
          <div>
            <label className="rotulo" htmlFor="visiveis">Fornecedores veem os preços uns dos outros?</label>
            <select id="visiveis" value={lancesVisiveis ? "sim" : "nao"} onChange={(e) => setLancesVisiveis(e.target.value === "sim")} className="campo">
              <option value="sim">Sim, leilão aberto</option>
              <option value="nao">Não, leilão fechado</option>
            </select>
          </div>
        </div>
      </div>

      {categorias.map((cat) => (
        <details key={cat} open className="cartao group space-y-3 p-0">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 hover:bg-stone-50">
            <span className="text-lg font-bold">
              <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden>▸</span>
              {CATEGORIAS[cat]}
            </span>
            <span className="text-sm text-stone-500">{linhas.filter((l) => l.categoria === cat).length} produto(s)</span>
          </summary>
          <ul className="space-y-3 px-2 pb-3 sm:px-4 sm:pb-4">
            {linhas.map((l, i) =>
              l.categoria !== cat ? null : (
                <li key={i} className={`space-y-2 rounded-lg border p-3 ${l.incluir ? "" : "opacity-50"} ${l.conferir ? "border-amber-400 bg-amber-50" : "border-stone-200"}`}>
                  <label className="flex items-center gap-2 font-medium">
                    <input type="checkbox" checked={l.incluir} onChange={(e) => mudar(i, { incluir: e.target.checked })} />
                    Criar leilão
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input aria-label="Produto" value={l.produto} onChange={(e) => mudar(i, { produto: e.target.value })} className="campo" />
                    <input aria-label="Especificações" value={l.especificacoes} onChange={(e) => mudar(i, { especificacoes: e.target.value })} placeholder="Especificações" className="campo" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <select aria-label="Categoria" value={l.categoria} onChange={(e) => mudar(i, { categoria: e.target.value as Categoria, conferir: false })} className="campo">
                      {Object.entries(CATEGORIAS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                    </select>
                    <select aria-label="Unidade" value={l.unidade} onChange={(e) => mudar(i, { unidade: e.target.value as Unidade, conferir: false })} className="campo">
                      {Object.entries(UNIDADES).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                    </select>
                    <input aria-label="Quantidade" inputMode="decimal" value={l.quantidade} onChange={(e) => mudar(i, { quantidade: e.target.value })} placeholder="Quantidade" className="campo" />
                    <input aria-label="Preço máximo em R$" inputMode="decimal" value={l.preco_maximo} onChange={(e) => mudar(i, { preco_maximo: e.target.value })} placeholder="Preço máx. (opcional)" className="campo" />
                    <input aria-label="Entregar até" type="date" value={l.entrega_ate} onChange={(e) => mudar(i, { entrega_ate: e.target.value })} className="campo" />
                  </div>
                </li>
              ),
            )}
          </ul>
        </details>
      ))}

      <div className="cartao space-y-2">
        {erro && <p className="erro">{erro}</p>}
        <button type="button" onClick={criar} disabled={criando || marcados === 0} className="botao w-full">
          {criando ? <Girando texto="Criando..." /> : `Criar ${marcados} ${marcados === 1 ? "leilão" : "leilões"}`}
        </button>
        <button type="button" onClick={() => setLinhas(undefined)} disabled={criando} className="botao-secundario w-full">
          Começar de novo
        </button>
      </div>
    </div>
  );
}
