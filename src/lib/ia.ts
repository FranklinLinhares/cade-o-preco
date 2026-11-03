import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CATEGORIAS, UNIDADES, type ReferenciaPreco } from "@/lib/dominio";

// Agente de IA do Cadê o Preço: transforma texto livre em item estruturado e
// pesquisa preços de referência na internet.

const MODELO = "claude-opus-5-5";

// Erro com texto pronto para o usuário. Qualquer outro (rede, limite da API) vira uma mensagem genérica.
export class ErroIa extends Error {}

export function mensagemDaIa(e: unknown) {
  if (e instanceof ErroIa) return e.message;
  console.error("Erro da IA:", e);
  if (e instanceof Anthropic.APIError && (e.status === 429 || e.status === 529)) {
    return "A IA está com muitos pedidos agora. Tente de novo em alguns minutos.";
  }
  return "A IA não respondeu agora. Tente de novo em instantes.";
}

export function iaDisponivel() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const cliente = () => new Anthropic();

const ItemSchema = z.object({
  produto: z.string().describe("Nome claro do produto, como um comprador escreveria"),
  produto_chave: z
    .string()
    .describe("Identificador normalizado, minúsculo, sem acento, palavras separadas por hífen, sem marca nem embalagem"),
  categoria: z.enum(Object.keys(CATEGORIAS) as [keyof typeof CATEGORIAS, ...(keyof typeof CATEGORIAS)[]]),
  unidade: z.enum(Object.keys(UNIDADES) as [keyof typeof UNIDADES, ...(keyof typeof UNIDADES)[]]),
  quantidade: z.number().nullable().describe("Quantidade convertida para a unidade escolhida"),
  preco_unitario: z.number().nullable().describe("Preço por unidade padronizada, se o texto informar"),
  especificacoes: z.string().describe("Tipo, classe, corte, embalagem, validade e outros detalhes; vazio se não houver"),
  validade_minima_dias: z.number().nullable(),
});
export type ItemEstruturado = z.infer<typeof ItemSchema>;

const INSTRUCOES_ITEM = `Você organiza anúncios de compra e venda de alimentos para um app de negociação entre empresas na Paraíba.
Receba um texto livre e devolva o item estruturado.
- Padronize a unidade para kg, l, un ou duzia e converta quantidade e preço para essa unidade (ex.: "10 caixas de 20 kg a R$ 90 a caixa" vira 200 kg a 4,50/kg).
- produto_chave deve ser igual para o mesmo produto escrito de formas diferentes: "arroz agulhinha tipo 1 pct 5kg" e "arroz branco tipo 1" viram "arroz-branco-tipo-1".
- Não invente quantidade, preço ou validade que o texto não informou: use null.`;

export async function estruturarItem(texto: string): Promise<ItemEstruturado> {
  const resposta = await cliente().messages.parse({
    model: MODELO,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(ItemSchema) },
    system: INSTRUCOES_ITEM,
    messages: [{ role: "user", content: texto }],
  });
  if (resposta.stop_reason === "refusal" || !resposta.parsed_output) {
    throw new ErroIa("A IA não conseguiu entender o texto. Preencha os campos manualmente.");
  }
  return resposta.parsed_output;
}

const ReferenciaSchema = z.object({
  minimo: z.number().nullable(),
  medio: z.number().nullable(),
  maximo: z.number().nullable(),
  resumo: z.string().describe("Duas ou três frases em português sobre o preço encontrado e de onde veio"),
  fontes: z.array(z.object({ titulo: z.string(), url: z.string(), preco: z.number().nullable() })),
  preco_maximo_sugerido: z.number().nullable().describe("Teto realista para o leilão, por unidade"),
});

// Pesquisa preços na internet e devolve uma faixa de referência por unidade.
// Primeiro pesquisa com busca na web, depois organiza o resultado em JSON.
export async function pesquisarPreco(params: {
  produto: string;
  especificacoes?: string;
  unidade: keyof typeof UNIDADES;
  cidade: string;
  uf: string;
  precoMedioNoApp?: number | null;
}): Promise<ReferenciaPreco> {
  const unidade = UNIDADES[params.unidade];
  const pedido = `Pesquise o preço atual de atacado de "${params.produto}"${
    params.especificacoes ? ` (${params.especificacoes})` : ""
  } para compra por empresas em ${params.cidade}/${params.uf}, Brasil.
Converta todos os preços para R$ por ${unidade}.
Priorize cotações recentes de CEASA (especialmente CEASA-PB e CEASA-PE), CONAB, atacarejos e distribuidores da região. Se só encontrar preço de varejo, diga isso.
Liste cada fonte com título, URL e preço por ${unidade}.`;

  const pesquisa = await cliente()
    .beta.messages.stream({
      model: MODELO,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6, user_location: { type: "approximate", country: "BR", region: params.uf, city: params.cidade } }],
      messages: [{ role: "user", content: pedido }],
    })
    .finalMessage();

  if (pesquisa.stop_reason === "refusal") {
    throw new ErroIa("A pesquisa de preço não pôde ser feita agora.");
  }
  const textoPesquisa = pesquisa.content
    .map((bloco) => (bloco.type === "text" ? bloco.text : ""))
    .join("");

  const contextoApp =
    params.precoMedioNoApp != null
      ? `\nNo próprio app, compradores da região pagaram em média R$ ${params.precoMedioNoApp} por ${unidade} nos últimos 30 dias.`
      : "";

  const organizado = await cliente().messages.parse({
    model: MODELO,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(ReferenciaSchema) },
    messages: [
      {
        role: "user",
        content: `Organize esta pesquisa de preço de "${params.produto}" em R$ por ${unidade}. Use só valores que aparecem na pesquisa; deixe null o que não houver.${contextoApp}\n\n<pesquisa>\n${textoPesquisa}\n</pesquisa>`,
      },
    ],
  });
  if (!organizado.parsed_output) {
    throw new ErroIa("Não foi possível organizar a pesquisa de preço.");
  }
  return { ...organizado.parsed_output, unidade: params.unidade };
}

const FolhetoSchema = z.object({
  loja: z.string().nullable().describe("Nome da loja ou rede que aparece no folheto"),
  valido_ate: z.string().nullable().describe("Último dia das ofertas no formato AAAA-MM-DD, se o folheto informar"),
  itens: z.array(
    z.object({
      produto: z.string().describe("Nome claro do produto, sem a marca, como um comprador escreveria"),
      produto_chave: z
        .string()
        .describe("Identificador normalizado, minúsculo, sem acento, palavras separadas por hífen, sem marca nem embalagem"),
      descricao: z.string().describe("Marca, embalagem e tamanho como aparecem no folheto; vazio se não houver"),
      categoria: z.enum(Object.keys(CATEGORIAS) as [keyof typeof CATEGORIAS, ...(keyof typeof CATEGORIAS)[]]),
      unidade: z.enum(Object.keys(UNIDADES) as [keyof typeof UNIDADES, ...(keyof typeof UNIDADES)[]]),
      preco_unitario: z.number().describe("Preço da oferta em R$ pela unidade escolhida"),
    }),
  ),
});
export type FolhetoLido = z.infer<typeof FolhetoSchema>;

export type ArquivoFolheto = { tipo: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; base64: string };

const INSTRUCOES_FOLHETO = `Você lê folhetos e encartes de ofertas de alimentos para um app de vendas na Paraíba.
Liste cada produto em oferta, uma linha por produto, com o preço da oferta (não o preço "de" riscado).
- Produto vendido por peso (frutas, verduras, carnes, frios a granel): unidade kg e preço por kg.
- Produto em embalagem (pacote, lata, garrafa, caixa): unidade "un" e preço da embalagem; a embalagem e a marca vão na descrição (ex.: "Tio João, pacote 5 kg").
- Bebidas vendidas por litro a granel: unidade l. Ovos por dúzia: unidade duzia.
- Ignore itens que não são alimentos ou bebidas (limpeza, higiene, utilidades).
- Não invente: se um preço estiver ilegível, deixe o item de fora.`;

// Lê as páginas de um folheto (fotos ou PDF) e devolve os itens em oferta.
export async function lerFolheto(arquivos: ArquivoFolheto[]): Promise<FolhetoLido> {
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" });
  const resposta = await cliente()
    .messages.stream({
      model: MODELO,
      max_tokens: 32000,
      output_config: { effort: "low", format: zodOutputFormat(FolhetoSchema) },
      system: INSTRUCOES_FOLHETO,
      messages: [
        {
          role: "user",
          content: [
            ...arquivos.map((a) =>
              a.tipo === "application/pdf"
                ? ({ type: "document", source: { type: "base64", media_type: a.tipo, data: a.base64 } } as const)
                : ({ type: "image", source: { type: "base64", media_type: a.tipo, data: a.base64 } } as const),
            ),
            { type: "text", text: `Hoje é ${hoje}. Liste os alimentos em oferta neste folheto.` },
          ],
        },
      ],
    })
    .finalMessage();
  if (resposta.stop_reason === "refusal" || !resposta.parsed_output) {
    throw new ErroIa("A IA não conseguiu ler este folheto. Tente uma foto mais nítida ou o PDF do encarte.");
  }
  return resposta.parsed_output;
}
