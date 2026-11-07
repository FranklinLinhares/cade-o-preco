"use client";

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
    const mensagem = `${texto}\n${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(mensagem)}`, "_blank", "noopener,noreferrer");
  }
  return (
    <button type="button" onClick={abrir} className={className}>
      <span aria-hidden>📲</span> {rotulo}
    </button>
  );
}
