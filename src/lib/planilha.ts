// Lê as planilhas padrão de ofertas e de leilões (.xlsx ou .csv) no navegador, sem IA.
import { CATEGORIAS, type Categoria, type Unidade } from "@/lib/dominio";

export type ItemPlanilha = {
  produto: string;
  descricao: string;
  categoria: Categoria;
  unidade: Unidade;
  preco_unitario: string;
  quantidade_disponivel: string;
  conferir: boolean; // categoria ou unidade não reconhecida: o vendedor confere na revisão
};

const sem = (texto: unknown) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

function acharCategoria(valor: unknown): Categoria | undefined {
  const v = sem(valor);
  if (!v) return undefined;
  return (Object.keys(CATEGORIAS) as Categoria[]).find((k) => k === v || sem(CATEGORIAS[k]) === v || sem(CATEGORIAS[k]).startsWith(v));
}

const SINONIMOS_UNIDADE: Record<string, Unidade> = {
  kg: "kg", quilo: "kg", kilo: "kg",
  l: "l", litro: "l", lt: "l",
  un: "un", unidade: "un", und: "un", lata: "un",
  pacote: "pacote", pct: "pacote", caixa: "caixa", cx: "caixa", fardo: "fardo", fd: "fardo",
  duzia: "duzia", dz: "duzia",
};

// "R$ 4,50", "4,50", "1.234,56" ou o número da célula.
function numero(valor: unknown) {
  if (typeof valor === "number") return String(valor);
  const v = String(valor ?? "").replace(/[R$\s]/g, "");
  return v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
}

function lerCsv(texto: string): string[][] {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const separador = (linhas[0] ?? "").includes(";") ? ";" : ",";
  return linhas.map((l) => l.split(separador).map((c) => c.replace(/^"|"$/g, "").trim()));
}

async function lerLinhas(arquivo: File) {
  let linhas: unknown[][];
  if (/\.csv$/i.test(arquivo.name) || arquivo.type === "text/csv") {
    linhas = lerCsv(await arquivo.text());
  } else {
    const { readSheet } = await import("read-excel-file/universal");
    linhas = await readSheet(arquivo);
  }
  const cabecalho = (linhas[0] ?? []).map(sem);
  const coluna = (...nomes: string[]) => cabecalho.findIndex((c) => nomes.some((n) => c.startsWith(n)));
  return { linhas, coluna };
}

export async function lerPlanilha(arquivo: File): Promise<ItemPlanilha[]> {
  const { linhas, coluna } = await lerLinhas(arquivo);
  const c = {
    produto: coluna("produto"),
    descricao: coluna("marca", "descricao", "embalagem"),
    categoria: coluna("categoria"),
    unidade: coluna("unidade"),
    preco: coluna("preco", "valor"),
    estoque: coluna("estoque", "quantidade"),
  };
  if (c.produto < 0 || c.preco < 0) {
    throw new Error("A planilha precisa das colunas Produto e Preço na primeira linha. Use o modelo.");
  }
  return linhas
    .slice(1)
    .filter((l) => String(l[c.produto] ?? "").trim())
    .map((l) => {
      const categoria = acharCategoria(l[c.categoria]);
      const unidade = SINONIMOS_UNIDADE[sem(l[c.unidade])];
      return {
        produto: String(l[c.produto]).trim(),
        descricao: c.descricao >= 0 ? String(l[c.descricao] ?? "").trim() : "",
        categoria: categoria ?? "mercearia",
        unidade: unidade ?? "un",
        preco_unitario: numero(l[c.preco]),
        quantidade_disponivel: c.estoque >= 0 ? numero(l[c.estoque]) : "",
        conferir: !categoria || !unidade,
      };
    });
}

export type ItemLeilao = {
  produto: string;
  especificacoes: string;
  categoria: Categoria;
  unidade: Unidade;
  quantidade: string;
  preco_maximo: string;
  entrega_ate: string;
  conferir: boolean;
};

// Data da célula (Date do Excel) ou "dd/mm/aaaa" vira "aaaa-mm-dd".
function data(valor: unknown) {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  const m = String(valor ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return "";
  const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export async function lerPlanilhaLeiloes(arquivo: File): Promise<ItemLeilao[]> {
  const { linhas, coluna } = await lerLinhas(arquivo);
  const c = {
    produto: coluna("produto"),
    especificacoes: coluna("especifica", "descricao", "marca"),
    categoria: coluna("categoria"),
    unidade: coluna("unidade"),
    quantidade: coluna("quantidade"),
    preco: coluna("preco", "valor"),
    entrega: coluna("entrega", "entregar"),
  };
  if (c.produto < 0 || c.quantidade < 0) {
    throw new Error("A planilha precisa das colunas Produto e Quantidade na primeira linha. Use o modelo.");
  }
  return linhas
    .slice(1)
    .filter((l) => String(l[c.produto] ?? "").trim())
    .map((l) => {
      const categoria = acharCategoria(l[c.categoria]);
      const unidade = SINONIMOS_UNIDADE[sem(l[c.unidade])];
      return {
        produto: String(l[c.produto]).trim(),
        especificacoes: c.especificacoes >= 0 ? String(l[c.especificacoes] ?? "").trim() : "",
        categoria: categoria ?? "mercearia",
        unidade: unidade ?? "un",
        quantidade: numero(l[c.quantidade]),
        preco_maximo: c.preco >= 0 ? numero(l[c.preco]) : "",
        entrega_ate: c.entrega >= 0 ? data(l[c.entrega]) : "",
        conferir: !categoria || !unidade,
      };
    });
}
