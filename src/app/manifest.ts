import type { MetadataRoute } from "next";

// Permite instalar o Cadê o Preço na tela inicial do celular, abrindo em tela cheia.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cadê o Preço",
    short_name: "Cadê o Preço",
    description: "Compra e venda de alimentos com leilão de menor preço.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f5f4",
    theme_color: "#15803d",
    icons: [
      { src: "/icones/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icones/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icones/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
