// Página para onde voltar depois de entrar (ex.: o link de uma oferta que chegou
// pelo WhatsApp). Só aceita caminhos do próprio app, para o link não levar a
// outro site.
export function destinoSeguro(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\") || v.length > 300) return null;
  if (v === "/" || v.startsWith("/entrar") || v.startsWith("/auth")) return null;
  return v;
}

export const COOKIE_VOLTA = "volta";
export const COOKIE_TROCAR_SENHA = "trocar_senha";
