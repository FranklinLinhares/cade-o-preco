"use client";

import { useActionState } from "react";
import { trocarSenha, type EstadoSenha } from "../acoes";

// Chega aqui pelo link do e-mail, já com o login feito: só falta a senha nova.
export default function NovaSenha() {
  const [estado, acao, enviando] = useActionState<EstadoSenha, FormData>(trocarSenha, {});

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Criar senha nova</h1>
      <form action={acao} className="cartao space-y-4">
        <div>
          <label className="rotulo" htmlFor="senha">Senha nova</label>
          <input id="senha" name="senha" type="password" required minLength={8} autoComplete="new-password" className="campo" />
          <p className="mt-1 text-xs text-stone-500">Pelo menos 8 caracteres.</p>
        </div>
        <div>
          <label className="rotulo" htmlFor="repetir">Repita a senha nova</label>
          <input id="repetir" name="repetir" type="password" required minLength={8} autoComplete="new-password" className="campo" />
        </div>
        {estado.erro && <p className="erro">{estado.erro}</p>}
        <button disabled={enviando} className="botao w-full">
          {enviando ? "Salvando..." : "Salvar senha nova"}
        </button>
      </form>
    </div>
  );
}
