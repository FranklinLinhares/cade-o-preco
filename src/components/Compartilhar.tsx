"use client";

import { abrirWhatsApp } from "@/lib/whatsapp";

// Abre o WhatsApp com uma mensagem pronta e o link da página, para a pessoa
// mandar a oferta ou o leilão para quem quiser.
export function Compartilhar({
  texto,
  caminho,
  rotulo = "Compartilhar no WhatsApp",
  className = "botao-secundario text-sm",
}: {
  texto: string;
  caminho: string;
  rotulo?: string;
  className?: string;
}) {
  function abrir() {
    const link = new URL(caminho, window.location.origin).toString();
    abrirWhatsApp(null, `${texto}\n${link}`);
  }
  return (
    <button type="button" onClick={abrir} className={className}>
      <span aria-hidden>📲</span> {rotulo}
    </button>
  );
}
