// Página para onde voltar depois de entrar (ex.: o link de uma oferta que chegou
// pelo WhatsApp). Só aceita caminhos do próprio app, para o link não levar a
// outro site.
export function destinoSeguro(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\") || v.length > 300) return null;
  // Caracteres invisíveis (TAB, quebra de linha...) são apagados pelo navegador:
  // "/<TAB>/site.com" viraria "//site.com" e levaria a outro site.
  if (/[\x00-\x1f\x7f]/.test(v)) return null;
  try {
    if (new URL(v, "http://app.local").origin !== "http://app.local") return null;
  } catch {
    return null;
  }
  if (v === "/" || v.startsWith("/entrar") || v.startsWith("/auth")) return null;
  return v;
}

export const COOKIE_VOLTA = "volta";
export const COOKIE_TROCAR_SENHA = "trocar_senha";
