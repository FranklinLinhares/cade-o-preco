"use client";

import { useEffect, useState } from "react";

type PedidoInstalacao = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const CHAVE = "lance-certo:instalar-dispensado";

function dispensado() {
  try {
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}

// Convite para pôr o app na tela inicial do celular. No Android usa o pedido de
// instalação do navegador; no iPhone explica o caminho pelo Compartilhar do Safari.
export function InstalarApp() {
  const [pedido, setPedido] = useState<PedidoInstalacao | null>(null);
  const [iphone, setIphone] = useState(false);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const instalado = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    if (instalado || dispensado()) return;

    // No iPhone não há pedido do navegador: mostra a explicação logo depois de abrir a tela.
    const ehIphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const espera = ehIphone
      ? setTimeout(() => {
          setIphone(true);
          setAberto(true);
        }, 800)
      : undefined;
    const aoPedir = (e: Event) => {
      e.preventDefault();
      setPedido(e as PedidoInstalacao);
      setAberto(true);
    };
    addEventListener("beforeinstallprompt", aoPedir);
    return () => {
      clearTimeout(espera);
      removeEventListener("beforeinstallprompt", aoPedir);
    };
  }, []);

  function fechar() {
    setAberto(false);
    try {
      localStorage.setItem(CHAVE, "1");
    } catch {}
  }

  async function instalar() {
    if (!pedido) return;
    await pedido.prompt();
    await pedido.userChoice;
    setPedido(null);
    setAberto(false);
  }

  if (!aberto) return null;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm lg:hidden">
      <span aria-hidden className="text-xl leading-none">📲</span>
      <div className="flex-1 space-y-2">
        <p className="font-medium text-green-900">Instale o Cadê o Preço no celular</p>
        {iphone ? (
          <p className="text-stone-700">
            No Safari, toque em <strong>Compartilhar</strong> (o quadrado com a seta) e depois em <strong>Adicionar à Tela de Início</strong>.
          </p>
        ) : (
          <p className="text-stone-700">Ganhe um ícone na tela inicial e abra o app em tela cheia.</p>
        )}
        {pedido && (
          <button type="button" onClick={instalar} className="botao py-1.5">
            Instalar
          </button>
        )}
      </div>
      <button type="button" onClick={fechar} aria-label="Fechar" className="-m-1 p-1 text-lg leading-none text-stone-500">
        ×
      </button>
    </div>
  );
}
