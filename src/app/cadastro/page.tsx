import { redirect } from "next/navigation";
import { contaAtual, usuarioAtual } from "@/lib/sessao";
import { FormularioEmpresa } from "./formulario";

export default async function Cadastro() {
  // Mesmas buscas do menu do topo, feitas uma vez só e ao mesmo tempo.
  const [user, { empresa }] = await Promise.all([usuarioAtual(), contaAtual()]);
  if (!user) redirect("/entrar");

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">{empresa ? "Meu cadastro" : "Complete seu cadastro"}</h1>
      <p className="text-stone-600">Uma conta só para comprar e vender.</p>
      <FormularioEmpresa empresa={empresa} email={user.email ?? ""} />
    </div>
  );
}
