// Service worker do Cadê o Preço: mostra os avisos que chegam no celular.
self.addEventListener("push", (evento) => {
  let dados = {};
  try {
    dados = evento.data ? evento.data.json() : {};
  } catch {
    dados = { texto: evento.data ? evento.data.text() : "" };
  }
  evento.waitUntil(
    self.registration.showNotification(dados.titulo || "Cadê o Preço", {
      body: dados.texto || "Você tem um aviso novo.",
      icon: "/icones/icone-192.png",
      badge: "/icones/icone-192.png",
      data: { link: dados.link || "/avisos" },
      lang: "pt-BR",
    }),
  );
});

// Tocar no aviso abre a tela certa, aproveitando o app se já estiver aberto.
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const link = new URL(evento.notification.data?.link || "/avisos", self.location.origin).href;
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if ("focus" in janela) {
          janela.navigate(link);
          return janela.focus();
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});
