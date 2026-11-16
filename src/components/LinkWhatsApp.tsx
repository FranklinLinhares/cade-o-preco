"use client";

import { abrirWhatsApp, linkWhatsApp } from "@/lib/whatsapp";

// Link para conversar pelo WhatsApp; sem telefone cadastrado não mostra um link quebrado.
// O clique passa por abrirWhatsApp, que funciona também no app instalado no iPhone.
export function LinkWhatsApp({
  telefone,
  texto,
  className = "underline",
  children = "WhatsApp",
}: {
  telefone?: string | null;
  texto?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  if (!telefone) return <span className="text-stone-400">sem WhatsApp cadastrado</span>;
  return (
    <a
      href={linkWhatsApp(telefone, texto)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={(e) => {
        e.preventDefault();
        abrirWhatsApp(telefone, texto);
      }}
    >
      {children}
    </a>
  );
}
