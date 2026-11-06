import type { criarClienteServidor } from "@/lib/supabase/server";
import { mensagemDeErro } from "@/lib/erros";

type Cliente = Awaited<ReturnType<typeof criarClienteServidor>>;

// Para a IA: conta um uso do dia e devolve a mensagem de erro quando passa do limite.
export async function registrarUsoIa(supabase: Cliente, tipo: "item" | "folheto") {
  const { error } = await supabase.rpc("registrar_uso_ia", { p_tipo: tipo });
  return error ? mensagemDeErro(error) : null;
}
