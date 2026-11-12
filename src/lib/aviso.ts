import { cookies } from "next/headers";

export const COOKIE_AVISO = "aviso";

// Guarda uma mensagem curta para mostrar no alto da próxima tela, em vez da
// página "Algo não deu certo" (em produção o Next.js esconde o texto dos erros).
export async function avisar(mensagem: string) {
  (await cookies()).set(COOKIE_AVISO, mensagem.slice(0, 200), { path: "/", maxAge: 60, sameSite: "lax" });
}
