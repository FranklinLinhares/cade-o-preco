"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { entrar, type EstadoEntrar } from "./acoes";

// Uma aba para entrar e outra para criar conta, cada uma com um único botão,
// para que apertar Enter no celular faça sempre o que a aba diz.
export default function Entrar() {
  const [estado, acao, enviando] = useActionState<EstadoEntrar, FormData>(entrar, {});
  const parametros = useSearchParams();
  const [modo, setModo] = useState<"entrar" | "criar">(parametros.get("modo") === "criar" ? "criar" : "entrar");
  const linkInvalido = parametros.get("erro") === "confirmacao";
  const volta = parametros.get("volta") ?? "";
  const criando = modo === "criar";

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">{criando ? "Criar conta no Cadê o Preço" : "Entrar no Cadê o Preço"}</h1>
      {volta && <p className="text-stone-600">Entre ou crie sua conta grátis para continuar. Depois voltamos para a página que você abriu.</p>}
      <div role="tablist" className="grid grid-cols-2 rounded-lg border border-stone-300 bg-white p-1">
        {(["entrar", "criar"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={modo === m}
            onClick={() => setModo(m)}
            className={`rounded-md py-2 font-semibold ${modo === m ? "bg-green-700 text-white" : "text-stone-600"}`}
          >
            {m === "entrar" ? "Já tenho conta" : "Criar conta"}
          </button>
        ))}
      </div>
      <form action={acao} className="cartao space-y-4">
        <input type="hidden" name="modo" value={modo} />
        <input type="hidden" name="volta" value={volta} />
        <div>
          <label className="rotulo" htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="campo" />
        </div>
        <div>
          <label className="rotulo" htmlFor="senha">Senha</label>
          <input
            id="senha"
            name="senha"
            type="password"
            required
            minLength={8}
            autoComplete={criando ? "new-password" : "current-password"}
            className="campo"
          />
          {criando ? (
            <p className="mt-1 text-xs text-stone-500">Pelo menos 8 caracteres.</p>
          ) : (
            <Link href="/entrar/recuperar" className="mt-2 inline-block text-sm text-green-800 underline">Esqueci minha senha</Link>
          )}
        </div>
        {linkInvalido && !estado.erro && !estado.mensagem && (
          <p className="aviso">O link de confirmação expirou ou já foi usado. Tente entrar com seu e-mail e senha.</p>
        )}
        {estado.erro && <p className="erro">{estado.erro}</p>}
        {estado.mensagem && <p className="aviso">{estado.mensagem}</p>}
        <button disabled={enviando} className="botao w-full">
          {enviando ? "Aguarde..." : criando ? "Criar conta" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
