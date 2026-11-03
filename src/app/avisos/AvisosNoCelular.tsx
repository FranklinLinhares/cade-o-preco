"use client";

import { useEffect, useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { mensagemDeErro } from "@/lib/erros";

type Estado = "carregando" | "sem-suporte" | "instalar-iphone" | "bloqueado" | "desligado" | "ligado";

const CHAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function chaveEmBytes(base64: string) {
  const preenchido = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(preenchido), (c) => c.charCodeAt(0));
}

async function inscricaoAtual() {
  const registro = await navigator.serviceWorker.getRegistration("/");
  return registro ? registro.pushManager.getSubscription() : null;
}

// Liga e desliga as notificações do sino neste aparelho.
export function AvisosNoCelular() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      let novo: Estado;
      const suporta = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      const iphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const instalado = matchMedia("(display-mode: standalone)").matches;
      if (!CHAVE_PUBLICA) novo = "sem-suporte";
      else if (iphone && !instalado) novo = "instalar-iphone";
      else if (!suporta) novo = "sem-suporte";
      else if (Notification.permission === "denied") novo = "bloqueado";
      else novo = (await inscricaoAtual()) ? "ligado" : "desligado";
      if (vivo) setEstado(novo);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  async function ligar() {
    setOcupado(true);
    setErro("");
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "desligado");
        return;
      }
      const registro = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const inscricao =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveEmBytes(CHAVE_PUBLICA!) }));
      const { endpoint, keys } = inscricao.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const { error } = await criarClienteNavegador().rpc("registrar_celular", { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth });
      if (error) {
        setErro(mensagemDeErro(error));
        return;
      }
      setEstado("ligado");
    } catch {
      // Os erros do navegador ao inscrever o aparelho chegam em inglês.
      setErro("Não deu para ativar os avisos neste aparelho. Confira a internet e tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    setErro("");
    try {
      const inscricao = await inscricaoAtual();
      if (inscricao) {
        await criarClienteNavegador().rpc("remover_celular", { p_endpoint: inscricao.endpoint });
        await inscricao.unsubscribe();
      }
      setEstado("desligado");
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "carregando" || estado === "sem-suporte") return null;
  return (
    <section className="cartao space-y-2">
      <h2 className="font-semibold">📲 Avisos no celular</h2>
      {estado === "instalar-iphone" && (
        <p className="text-sm text-stone-600">
          No iPhone, os avisos só chegam com o app instalado: no Safari, toque em <strong>Compartilhar</strong> e em <strong>Adicionar à Tela de Início</strong>. Depois abra o Lance Certo pelo ícone e volte aqui.
        </p>
      )}
      {estado === "bloqueado" && (
        <p className="text-sm text-stone-600">
          As notificações do Lance Certo estão bloqueadas neste aparelho. Libere nas configurações do celular (Notificações) e volte aqui.
        </p>
      )}
      {estado === "desligado" && (
        <>
          <p className="text-sm text-stone-600">Receba no celular, mesmo com o app fechado, os lances, pedidos e alertas que aparecem aqui no sino.</p>
          <button type="button" onClick={ligar} disabled={ocupado} className="botao">
            {ocupado ? "Ativando..." : "Ativar avisos no celular"}
          </button>
        </>
      )}
      {estado === "ligado" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-green-800">✓ Ativado neste aparelho.</p>
          <button type="button" onClick={desligar} disabled={ocupado} className="botao-secundario py-1 text-sm">
            Desativar
          </button>
        </div>
      )}
      {erro && <p className="erro">{erro}</p>}
    </section>
  );
}
