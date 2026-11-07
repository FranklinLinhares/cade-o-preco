"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { pedirNovaSenha, type EstadoSenha } from "../acoes";

// "Esqueci minha senha": pede o e-mail e manda o link para criar outra senha.
export default function RecuperarSenha() {
  const [estado, acao, enviando] = useActionState<EstadoSenha, FormData>(pedirNovaSenha, {});
  const linkVencido = useSearchParams().get("erro") === "link";

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Esqueci minha senha</h1>
      <p className="text-stone-600">Informe o e-mail da sua conta. Vamos mandar um link para você criar uma senha nova.</p>
      <form action={acao} className="cartao space-y-4">
        <div>
          <label className="rotulo" htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="campo" />
        </div>
        {linkVencido && !estado.erro && !estado.mensagem && (
          <p className="aviso">O link expirou, já foi usado ou foi aberto em outro aparelho. Peça outro aqui e abra no mesmo aparelho.</p>
        )}
        {estado.erro && <p className="erro">{estado.erro}</p>}
        {estado.mensagem && <p className="aviso">{estado.mensagem}</p>}
        <button disabled={enviando} className="botao w-full">
          {enviando ? "Enviando..." : "Enviar o link"}
        </button>
      </form>
      <Link href="/entrar" className="text-sm text-stone-600 underline">← Voltar para entrar</Link>
    </div>
  );
}
