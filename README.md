# Cadê o Preço

Aplicativo de compra e venda de alimentos entre empresas, com leilão de menor preço, vitrine de ofertas e um agente de IA que pesquisa preços.

- **Compradores** (só com CNPJ) publicam pedidos e recebem lances. Em cada pedido escolhem se os fornecedores veem os preços dos concorrentes (leilão aberto) ou se só o comprador vê (leilão fechado).
- **Fornecedores** (CNPJ) e **agricultores** (CNPJ, ou CPF com CAF ou inscrição estadual de produtor rural) anunciam produtos na vitrine e dão lances nos pedidos.
- **Raio em km**: cada empresa informa até onde compra ou entrega. Ofertas, pedidos e lances só aparecem quando a distância cabe no raio dos dois lados.
- **Vitrine**: o comprador pesquisa um produto e vê quantos fornecedores o oferecem, o menor, o médio e o maior preço.
- **Meus preços**: histórico semanal do preço pago por produto, com a variação em relação à semana anterior.
- **IA (Claude)**: preenche pedidos e ofertas a partir de texto livre e pesquisa preços de mercado na internet (CEASA, CONAB, atacadistas), sugerindo um preço máximo.

O plano completo está no projeto do Claude, em `plano/plano-inicial.md`.

## Tecnologia

- Next.js 16 (App Router) com Tailwind CSS
- Supabase: banco PostgreSQL, login e lances em tempo real
- Claude API (`@anthropic-ai/sdk`) com busca na web

## Como rodar

1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. No painel do Supabase, abra **SQL Editor**, cole o conteúdo de `supabase/migrations/0001_inicial.sql` e execute.
3. Copie `.env.example` para `.env.local` e preencha a URL e a chave `anon` do Supabase (**Project Settings > API**) e, para a IA, uma chave do [console da Anthropic](https://console.anthropic.com).
4. Instale e rode:

   ```bash
   npm install
   npm run dev
   ```

5. Abra http://localhost:3000, crie uma conta e cadastre a empresa.

## Testes

```bash
npm run test:db   # regras do banco (raio, lances, vitrine, histórico) num Postgres em memória
npm run lint
npm run build
```

## Estrutura

- `supabase/migrations/` esquema do banco, funções de negócio (`dar_lance`, `fechar_pedido`, `comprar_oferta`, `buscar_ofertas`, `pedidos_proximos`) e regras de acesso (RLS)
- `src/lib/ia.ts` agente de IA
- `src/app/vitrine`, `src/app/ofertas` vitrine e ofertas dos fornecedores
- `src/app/pedidos` leilões
- `src/app/historico` histórico de preços do comprador
