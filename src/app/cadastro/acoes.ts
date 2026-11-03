"use server";

import { revalidatePath } from "next/cache";
import { mensagemDeErro } from "@/lib/erros";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { EXIGIR_DOCUMENTO, cnpjValido, cpfValido, documentoDeTeste, soDigitos } from "@/lib/documentos";

export type EstadoCadastro = { erro?: string };

export async function salvarEmpresa(_: EstadoCadastro, form: FormData): Promise<EstadoCadastro> {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar");

  // Comprar ou vender é escolhido no menu; conta nova começa comprando.
  const { data: atual } = await supabase.from("empresas").select("papel").eq("id", user.id).maybeSingle();
  const papel = atual?.papel === "fornecedor" ? "fornecedor" : "comprador";
  const pessoaFisica = form.get("pessoa") === "pf";
  const agricultor = form.get("agricultor") === "on";
  const nomeCompleto = String(form.get("nome_completo") ?? "").trim();
  const nomeFantasia = String(form.get("nome_fantasia") ?? "").trim();
  if (!nomeCompleto) return { erro: "Informe o seu nome completo." };
  let documento = soDigitos(String(form.get("documento") ?? ""));
  const registroRural = String(form.get("registro_rural") ?? "").trim();
  const tipoRegistro = form.get("tipo_registro") === "ie" ? "cpf_ie" : "cpf_caf";

  let tipoDocumento: "cnpj" | "cpf" | "cpf_caf" | "cpf_ie" = pessoaFisica ? "cpf" : "cnpj";
  const tamanho = pessoaFisica ? 11 : 14;
  if (!EXIGIR_DOCUMENTO) {
    // Modo de testes: aceita qualquer número; inválido vira um de teste (o banco confere os dígitos).
    const valido = pessoaFisica ? cpfValido(documento) : cnpjValido(documento);
    if (documento.length !== tamanho || (!valido && !documento.startsWith("000"))) documento = documentoDeTeste(tamanho);
  } else if (pessoaFisica && !cpfValido(documento)) {
    return { erro: "CPF inválido." };
  } else if (!pessoaFisica && !cnpjValido(documento)) {
    return { erro: "CNPJ inválido." };
  }
  if (pessoaFisica && agricultor && registroRural) tipoDocumento = tipoRegistro;

  const cidade = String(form.get("cidade") ?? "").trim();
  const uf = String(form.get("uf") ?? "").trim().toUpperCase();
  let lat = Number(form.get("lat"));
  let lng = Number(form.get("lng"));
  if (!lat || !lng) {
    const ponto = await localizarCidade(cidade, uf);
    if (!ponto) return { erro: "Não encontramos essa cidade. Confira o nome ou use a sua localização." };
    ({ lat, lng } = ponto);
  }

  const dados = {
    papel,
    tipo_documento: tipoDocumento,
    documento,
    registro_rural: tipoDocumento === "cpf_caf" || tipoDocumento === "cpf_ie" ? registroRural : null,
    agricultor,
    nome: (!pessoaFisica && nomeFantasia) || nomeCompleto,
    nome_completo: nomeCompleto,
    endereco: String(form.get("endereco") ?? "").trim() || null,
    telefone: soDigitos(String(form.get("telefone") ?? "")),
    cidade,
    uf,
    lat,
    lng,
    raio_km: Math.min(500, Math.max(1, Number(form.get("raio_km")) || 30)),
  };
  // Sem upsert: ele precisaria ler colunas que as outras contas não podem ver.
  const { error } = atual
    ? await supabase.from("empresas").update(dados).eq("id", user.id)
    : await supabase.from("empresas").insert({ id: user.id, ...dados });
  if (error) {
    if (error.code === "23505") return { erro: "Este documento já está cadastrado em outra conta." };
    return { erro: mensagemDeErro(error) };
  }
  // O menu fica no layout e foi montado antes do cadastro; sem isso ele continua
  // vazio e a página seguinte abre pela metade.
  revalidatePath("/", "layout");
  redirect(papel === "fornecedor" ? "/pedidos" : "/vitrine");
}

// Coordenadas aproximadas da cidade pelo OpenStreetMap (Nominatim).
async function localizarCidade(cidade: string, uf: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({ city: cidade, state: uf, country: "Brasil", format: "json", limit: "1" }).toString();
  try {
    const resposta = await fetch(url, { headers: { "User-Agent": "CadeOPreco/0.1" } });
    const [primeiro] = (await resposta.json()) as { lat: string; lon: string }[];
    return primeiro ? { lat: Number(primeiro.lat), lng: Number(primeiro.lon) } : null;
  } catch {
    return null;
  }
}
