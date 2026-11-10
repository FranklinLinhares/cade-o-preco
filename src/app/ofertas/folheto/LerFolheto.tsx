"use client";

import { useState, useTransition } from "react";
import { PUBLICO, UNIDADES, porUnidade, type Categoria, type Unidade } from "@/lib/dominio";
import { Girando } from "@/components/Girando";
import { publicarFolheto } from "../acoes";
import { MAXIMO_ENVIO, MAXIMO_PAGINAS, fotoParaJpeg, pdfParaJpegs } from "./paginas";
import { lerPlanilha } from "@/lib/planilha";
import { mensagemDaTela } from "@/lib/erros";
import { lerNumero } from "@/lib/numero";
import { OpcoesCategoria } from "@/components/OpcoesCategoria";

type Arquivo = { tipo: "image/jpeg"; base64: string; nome: string };
type Linha = {
  incluir: boolean;
  produto: string;
  produto_chave: string;
  descricao: string;
  categoria: Categoria;
  unidade: Unidade;
  preco_unitario: string;
  quantidade_disponivel: string;
  conferir?: boolean;
};
type Lido = {
  loja: string | null;
  valido_ate: string | null;
  itens: { produto: string; produto_chave: string; descricao: string; categoria: Categoria; unidade: Unidade; preco_unitario: number }[];
};

function emDias(dias: number) {
  return new Date(Date.now() + dias * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" });
}

export function LerFolheto({ comIa }: { comIa: boolean }) {
  const [arquivos, setArquivos] = useState<Arquivo[]>([]);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string>();
  const [loja, setLoja] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>();
  const [validaAte, setValidaAte] = useState(emDias(7));
  const [vendePara, setVendePara] = useState("todos");
  // Encarte de supermercado quase sempre é promoção só na loja; planilha costuma ser venda pelo app.
  const [soNaLoja, setSoNaLoja] = useState(false);
  const [estoque, setEstoque] = useState("");
  const [publicando, iniciarPublicacao] = useTransition();

  const [preparando, setPreparando] = useState(false);
  const tamanho = arquivos.reduce((t, a) => t + a.base64.length, 0);

  async function escolher(lista: FileList | null) {
    setErro(undefined);
    setPreparando(true);
    const novos: Arquivo[] = [];
    try {
      for (const arquivo of Array.from(lista ?? [])) {
        const vagas = MAXIMO_PAGINAS - arquivos.length - novos.length;
        if (vagas <= 0) break;
        if (arquivo.type === "application/pdf") {
          const { paginas, total } = await pdfParaJpegs(arquivo, vagas);
          paginas.forEach((base64, i) => novos.push({ tipo: "image/jpeg", base64, nome: `${arquivo.name} · página ${i + 1}` }));
          if (total > paginas.length) setErro(`O PDF tem ${total} páginas; vão as ${paginas.length} primeiras (máximo de ${MAXIMO_PAGINAS}).`);
        } else if (arquivo.type.startsWith("image/")) {
          novos.push({ tipo: "image/jpeg", base64: await fotoParaJpeg(arquivo), nome: arquivo.name });
        }
      }
    } catch {
      setErro("Não foi possível abrir um dos arquivos. Tente outra foto ou o PDF.");
    }
    // Se passar do limite de envio, comprime mais as páginas.
    let todos = [...arquivos, ...novos];
    if (todos.reduce((t, a) => t + a.base64.length, 0) > MAXIMO_ENVIO) {
      setErro("O folheto ficou grande demais para enviar de uma vez. Tire algumas páginas e leia o resto em outro envio.");
      todos = todos.filter((_, i) => todos.slice(0, i + 1).reduce((t, a) => t + a.base64.length, 0) <= MAXIMO_ENVIO);
    }
    setArquivos(todos);
    setPreparando(false);
  }

  async function abrirPlanilha(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(undefined);
    try {
      const itens = await lerPlanilha(arquivo);
      if (itens.length === 0) throw new Error("A planilha não tem produtos. Preencha a partir da linha 2.");
      setLoja(null);
      setSoNaLoja(false);
      setLinhas(itens.map((i) => ({ ...i, incluir: true, produto_chave: "" })));
    } catch (e) {
      setErro((e as Error).message || "Não foi possível ler a planilha. Use o modelo em .xlsx ou .csv.");
    }
  }

  async function ler() {
    setLendo(true);
    setErro(undefined);
    try {
      const resposta = await fetch("/api/ia/folheto", {
        method: "POST",
        body: JSON.stringify({ arquivos: arquivos.map(({ tipo, base64 }) => ({ tipo, base64 })) }),
      });
      // Um erro da Vercel (ex.: envio grande demais) chega como texto, não JSON.
      const dados = await resposta.json().catch(() => ({ erro: resposta.status === 413 ? "O folheto ficou grande demais. Envie menos páginas." : "O servidor não respondeu. Tente de novo." }));
      if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível ler o folheto.");
      const lido = dados as Lido;
      if (lido.itens.length === 0) throw new Error("A IA não encontrou alimentos com preço neste folheto.");
      setLoja(lido.loja);
      setSoNaLoja(true);
      if (lido.valido_ate && lido.valido_ate >= emDias(0)) setValidaAte(lido.valido_ate);
      setLinhas(
        lido.itens.map((i) => ({
          ...i,
          incluir: true,
          preco_unitario: String(i.preco_unitario),
          quantidade_disponivel: estoque,
        })),
      );
    } catch (e) {
      setErro(mensagemDaTela(e));
    } finally {
      setLendo(false);
    }
  }

  function mudar(indice: number, campos: Partial<Linha>) {
    setLinhas((atuais) => atuais?.map((l, i) => (i === indice ? { ...l, ...campos } : l)));
  }

  function publicar() {
    setErro(undefined);
    const marcados = (linhas ?? []).filter((l) => l.incluir);
    iniciarPublicacao(async () => {
      const resultado = await publicarFolheto({
        validaAte,
        vendePara,
        soNaLoja,
        itens: marcados.map((l) => ({
          produto: l.produto,
          produto_chave: l.produto_chave,
          descricao: l.descricao,
          categoria: l.categoria,
          unidade: l.unidade,
          preco_unitario: lerNumero(l.preco_unitario),
          quantidade_disponivel: lerNumero(l.quantidade_disponivel),
        })),
      });
      if (resultado?.erro) setErro(resultado.erro);
    });
  }

  if (!linhas) {
    return (
      <div className="space-y-4">
      <div className="cartao space-y-3">
        <h2 className="font-semibold">Pela planilha (mais rápido, sem IA)</h2>
        <p className="text-sm text-stone-600">
          Preencha o <a href="/modelo-ofertas-cade-o-preco.xlsx" download className="font-medium text-green-800 underline">modelo de planilha</a> com produto, marca, categoria, unidade, preço e estoque, e envie aqui. Aceita .xlsx e .csv.
        </p>
        <input
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Planilha de ofertas"
          onChange={(e) => {
            abrirPlanilha(e.target.files?.[0]);
            e.target.value = "";
          }}
          className="campo"
        />
      </div>
      {comIa && (
      <div className="cartao space-y-3">
        <h2 className="font-semibold">Pelo folheto, com IA</h2>
        <label className="rotulo" htmlFor="arquivos">Fotos ou PDF do folheto (até {MAXIMO_PAGINAS} páginas)</label>
        <input
          id="arquivos"
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={(e) => {
            escolher(e.target.files);
            e.target.value = "";
          }}
          className="campo"
        />
        {preparando && <p className="text-sm text-stone-500"><Girando texto="Preparando as páginas..." /></p>}
        {arquivos.length > 0 && (
          <p className="text-xs text-stone-500">{arquivos.length} {arquivos.length === 1 ? "página" : "páginas"} · {(tamanho * 0.75 / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB</p>
        )}
        {arquivos.length > 0 && (
          <ul className="space-y-1 text-sm">
            {arquivos.map((a, i) => (
              <li key={`${a.nome}-${i}`} className="flex items-center justify-between gap-2">
                <span className="truncate">{a.nome}</span>
                <button type="button" onClick={() => setArquivos(arquivos.filter((_, j) => j !== i))} className="text-red-700 underline">
                  tirar
                </button>
              </li>
            ))}
          </ul>
        )}
        <div>
          <label className="rotulo" htmlFor="estoque">Estoque de cada item (opcional)</label>
          <input
            id="estoque"
            inputMode="decimal"
            value={estoque}
            onChange={(e) => setEstoque(e.target.value)}
            placeholder="Ex.: 50. Dá para mudar item por item depois."
            className="campo"
          />
        </div>
        <button type="button" onClick={ler} disabled={lendo || preparando || arquivos.length === 0} className="botao w-full">
          {lendo ? <Girando texto="Lendo o folheto... (pode levar até 1 minuto)" /> : "Ler folheto com IA"}
        </button>
      </div>
      )}
      {erro && <p className="erro">{erro}</p>}
      </div>
    );
  }

  const marcados = linhas.filter((l) => l.incluir).length;
  return (
    <div className="space-y-4">
      <div className="cartao space-y-3">
        <p>
          {linhas.some((l) => l.conferir !== undefined) ? (
            <>A planilha tem <strong>{linhas.length} itens</strong>.</>
          ) : (
            <>A IA encontrou <strong>{linhas.length} itens</strong>{loja && <> no folheto de {loja}</>}.</>
          )}{" "}
          Confira nome, preço e unidade, desmarque o que não quer vender e informe o estoque{soNaLoja && " (opcional na promoção só na loja)"}.
          {linhas.some((l) => l.conferir) && <span className="block text-amber-800">Os itens em amarelo têm categoria ou unidade que não reconhecemos: confira antes de publicar.</span>}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="rotulo" htmlFor="valida_ate">Ofertas valem até</label>
            <input id="valida_ate" type="date" min={emDias(0)} value={validaAte} onChange={(e) => setValidaAte(e.target.value)} className="campo" />
          </div>
          <div>
            <label className="rotulo" htmlFor="como_vender">Como vender</label>
            <select id="como_vender" value={soNaLoja ? "loja" : "app"} onChange={(e) => setSoNaLoja(e.target.value === "loja")} className="campo">
              <option value="app">Pelo app (aceita pedidos)</option>
              <option value="loja">Só na loja (promoção, mostra seu WhatsApp)</option>
            </select>
          </div>
          <div>
            <label className="rotulo" htmlFor="vende_para">Vender para</label>
            <select id="vende_para" value={vendePara} onChange={(e) => setVendePara(e.target.value)} className="campo">
              {Object.entries(PUBLICO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      <ul className="space-y-3">
        {linhas.map((l, i) => (
          <li key={i} className={`cartao space-y-2 ${l.incluir ? "" : "opacity-50"} ${l.conferir ? "border-amber-400 bg-amber-50" : ""}`}>
            <label className="flex items-center gap-2 font-medium">
              <input type="checkbox" checked={l.incluir} onChange={(e) => mudar(i, { incluir: e.target.checked })} />
              Publicar
              {l.incluir && lerNumero(l.preco_unitario) > 0 && (
                <span className="ml-auto text-sm font-normal text-stone-500">{porUnidade(lerNumero(l.preco_unitario), l.unidade)}</span>
              )}
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <input aria-label="Produto" value={l.produto} onChange={(e) => mudar(i, { produto: e.target.value, produto_chave: "" })} className="campo" />
              <input aria-label="Marca e embalagem" value={l.descricao} onChange={(e) => mudar(i, { descricao: e.target.value })} placeholder="Marca e embalagem" className="campo" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <select aria-label="Categoria" value={l.categoria} onChange={(e) => mudar(i, { categoria: e.target.value as Categoria, conferir: false })} className="campo">
                <OpcoesCategoria />
              </select>
              <select aria-label="Unidade" value={l.unidade} onChange={(e) => mudar(i, { unidade: e.target.value as Unidade, conferir: false })} className="campo">
                {Object.entries(UNIDADES).map(([v, n]) => <option key={v} value={v}>por {n}</option>)}
              </select>
              <input aria-label="Preço em R$" inputMode="decimal" value={l.preco_unitario} onChange={(e) => mudar(i, { preco_unitario: e.target.value })} placeholder="Preço R$" className="campo" />
              <input aria-label="Estoque" inputMode="decimal" value={l.quantidade_disponivel} onChange={(e) => mudar(i, { quantidade_disponivel: e.target.value })} placeholder="Estoque" className="campo" />
            </div>
          </li>
        ))}
      </ul>

      <div className="cartao space-y-2">
        {erro && <p className="erro">{erro}</p>}
        <button type="button" onClick={publicar} disabled={publicando || marcados === 0} className="botao w-full">
          {publicando ? <Girando texto="Publicando..." /> : `Publicar ${marcados} ${marcados === 1 ? "oferta" : "ofertas"} na vitrine`}
        </button>
        <button type="button" onClick={() => setLinhas(undefined)} disabled={publicando} className="botao-secundario w-full">
          Começar de novo
        </button>
      </div>
    </div>
  );
}
