import { cookies } from "next/headers";
import { COOKIE_AVISO } from "@/lib/aviso";
import { ApagarAviso } from "./ApagarAviso";

// Mostra a mensagem que uma ação guardou com avisar() (ex.: "Este pedido já foi fechado ou cancelado.").
export async function AvisoDoServidor() {
  const mensagem = (await cookies()).get(COOKIE_AVISO)?.value;
  if (!mensagem) return null;
  return <ApagarAviso key={mensagem} mensagem={mensagem} />;
}
