// Tipos e rótulos compartilhados, espelhando o esquema do banco.

export const CATEGORIAS = {
  hortifruti: "Hortifrúti",
  graos: "Grãos e cereais",
  carnes: "Carnes e frios",
  laticinios: "Laticínios",
  bebidas: "Bebidas",
  mercearia: "Mercearia seca",
  embalagens: "Embalagens e descartáveis",
  limpeza: "Limpeza",
  higiene: "Higiene",
} as const;
export type Categoria = keyof typeof CATEGORIAS;

// Setores agrupam as categorias (primeiro nível da Vitrine e dos Leilões).
// Um setor novo no futuro (ex.: Farmácia) é só mais uma entrada aqui, com as
// categorias dele criadas por migração.
export const SETORES = {
  armazem: { nome: "Armazém", categorias: ["hortifruti", "graos", "carnes", "laticinios", "bebidas", "mercearia"] },
  embalagens: { nome: "Embalagens e limpeza", categorias: ["embalagens", "limpeza", "higiene"] },
} as const satisfies Record<string, { nome: string; categorias: readonly Categoria[] }>;
export type Setor = keyof typeof SETORES;

export function setorDe(categoria: Categoria): Setor {
  return (Object.keys(SETORES) as Setor[]).find((s) => (SETORES[s].categorias as readonly Categoria[]).includes(categoria)) ?? "armazem";
}

// Lê o setor de um parâmetro da URL (?setor=...); qualquer outro valor = todos.
export function lerSetor(valor: unknown): Setor | null {
  return typeof valor === "string" && valor in SETORES ? (valor as Setor) : null;
}

export const UNIDADES = {
  kg: "kg",
  l: "litro",
  un: "unidade",
  duzia: "dúzia",
  pacote: "pacote",
  caixa: "caixa",
  fardo: "fardo",
} as const;
export type Unidade = keyof typeof UNIDADES;

// Modo atual da conta: a mesma pessoa compra ou vende e troca quando quiser.
export type Papel = "comprador" | "fornecedor";

// Para quem uma oferta é vendida.
export const PUBLICO = {
  todos: "Empresas e pessoas físicas",
  pj: "Só empresas (CNPJ)",
  pf: "Só pessoas físicas (CPF)",
} as const;
export type Publico = keyof typeof PUBLICO;

export type Empresa = {
  id: string;
  papel: Papel;
  tipo_documento: "cnpj" | "cpf" | "cpf_caf" | "cpf_ie";
  documento: string;
  registro_rural: string | null;
  agricultor: boolean;
  nome: string; // nome fantasia da empresa, ou o nome da pessoa física
  nome_completo: string | null;
  endereco: string | null;
  negocia_com: Publico;
  telefone: string;
  cidade: string;
  uf: string;
  lat: number;
  lng: number;
  raio_km: number;
  categorias: Categoria[];
};

export type ReferenciaPreco = {
  minimo: number | null;
  medio: number | null;
  maximo: number | null;
  unidade: Unidade;
  resumo: string;
  fontes: { titulo: string; url: string; preco: number | null }[];
  preco_maximo_sugerido: number | null;
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function reais(valor: number | string | null | undefined) {
  if (valor === null || valor === undefined || valor === "") return "–";
  return moeda.format(Number(valor));
}

export function porUnidade(valor: number | string | null | undefined, unidade: Unidade) {
  return `${reais(valor)}/${UNIDADES[unidade]}`;
}

export function dataHora(valor: string | Date) {
  return new Date(valor).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Fortaleza",
  });
}

// "Arroz Branco Tipo 1" -> "arroz-branco-tipo-1". Usado quando a IA não está disponível.
export function chaveDoProduto(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
