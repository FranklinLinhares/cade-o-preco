"use client";

import { useFormStatus } from "react-dom";

// Botão de formulário que pergunta antes de enviar, para ações que não têm volta.
export function BotaoConfirmar({
  pergunta,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pergunta: string }) {
  // Enquanto o formulário envia, fica desativado (evita o toque duplo no 3G).
  const { pending } = useFormStatus();
  return (
    <button
      {...props}
      disabled={props.disabled || pending}
      onClick={(e) => {
        if (!confirm(pergunta)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
