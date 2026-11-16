// Links do WhatsApp que funcionam também no app instalado na tela inicial.
//
// No iPhone, o app instalado abre links externos (target="_blank" ou window.open)
// numa janela interna do Safari. O wa.me tenta passar para o aplicativo do WhatsApp
// e, dentro dessa janela, a passagem não acontece: a tela fica em branco com um
// "OK" no alto. No app instalado, o link vai direto para o aplicativo (whatsapp://).

export function appInstalado() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

// Telefone salvo só com DDD e número (até 11 dígitos) ganha o 55 do Brasil.
function numeroCompleto(telefone: string) {
  const digitos = telefone.replace(/\D/g, "");
  return digitos.length <= 11 ? `55${digitos}` : digitos;
}

export function linkWhatsApp(telefone: string | null | undefined, texto?: string) {
  const numero = telefone ? numeroCompleto(telefone) : "";
  const msg = texto ? `text=${encodeURIComponent(texto)}` : "";
  return numero ? `https://wa.me/${numero}${msg ? `?${msg}` : ""}` : `https://wa.me/?${msg}`;
}

// Abre a conversa (ou a escolha de contato, sem telefone) no aplicativo do WhatsApp.
export function abrirWhatsApp(telefone: string | null | undefined, texto?: string) {
  if (appInstalado()) {
    const partes = [telefone ? `phone=${numeroCompleto(telefone)}` : "", texto ? `text=${encodeURIComponent(texto)}` : ""].filter(Boolean);
    window.location.href = `whatsapp://send?${partes.join("&")}`;
    return;
  }
  window.open(linkWhatsApp(telefone, texto), "_blank", "noopener,noreferrer");
}
