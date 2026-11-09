"use client";

import { useFormStatus } from "react-dom";

// Botão de formulário que fica desativado enquanto envia, para a pessoa não
// tocar duas vezes quando a internet está lenta. Mostra "Enviando..." no botão
// que foi tocado.
export function BotaoEnviar({ children, disabled, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending, data } = useFormStatus();
  const fuiEu = pending && (!props.name || data?.get(props.name) === String(props.value ?? ""));
  return (
    <button {...props} disabled={disabled || pending} aria-busy={fuiEu || undefined}>
      {fuiEu ? "Enviando..." : children}
    </button>
  );
}
