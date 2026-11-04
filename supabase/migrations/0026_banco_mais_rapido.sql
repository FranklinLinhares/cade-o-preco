-- Deixa o banco mais rápido, sem mudar nenhuma regra de quem vê o quê.
--
-- 1. Regras de acesso (RLS): auth.uid() passa a ser lido uma vez por consulta,
--    e não uma vez por linha. As condições continuam exatamente as mesmas.
--    (Aviso "auth_rls_initplan" do Supabase.)

alter policy "cada conta gerencia os próprios alertas" on alertas_preco
  using (empresa_id = (select auth.uid()))
  with check (empresa_id = (select auth.uid()));

alter policy "cada conta lê os próprios avisos" on avisos
  using (empresa_id = (select auth.uid()));

alter policy "cada conta marca os próprios avisos como lidos" on avisos
  using (empresa_id = (select auth.uid()))
  with check (empresa_id = (select auth.uid()));

alter policy "comprador registra compras feitas fora do app" on compras
  with check ((comprador_id = (select auth.uid())) AND (origem = 'externa'::origem_compra) AND (fornecedor_id IS NULL) AND (pedido_id IS NULL) AND (oferta_id IS NULL));

alter policy "compras visíveis ao comprador e ao fornecedor" on compras
  using ((comprador_id = (select auth.uid())) OR (fornecedor_id = (select auth.uid())));

alter policy "cada conta adiciona os próprios contatos" on contatos
  with check (dono_id = (select auth.uid()));

alter policy "cada conta remove os próprios contatos" on contatos
  using (dono_id = (select auth.uid()));

alter policy "cada conta vê os próprios contatos" on contatos
  using (dono_id = (select auth.uid()));

alter policy "cada um cadastra a própria empresa" on empresas
  with check (id = (select auth.uid()));

alter policy "cada um edita a própria empresa" on empresas
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy "lances conforme a visibilidade do pedido" on lances
  using ((fornecedor_id = (select auth.uid())) OR (EXISTS ( SELECT 1 FROM pedidos p WHERE ((p.id = lances.pedido_id) AND ((p.comprador_id = (select auth.uid())) OR p.lances_visiveis)))));

alter policy "cada conta gerencia os próprios ocultos" on ocultos
  using (empresa_id = (select auth.uid()))
  with check (empresa_id = (select auth.uid()));

alter policy "fornecedor edita as próprias ofertas" on ofertas
  using (fornecedor_id = (select auth.uid()))
  with check (fornecedor_id = (select auth.uid()));

alter policy "fornecedor exclui as próprias ofertas" on ofertas
  using (fornecedor_id = (select auth.uid()));

alter policy "fornecedor publica as próprias ofertas" on ofertas
  with check ((fornecedor_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM empresas WHERE ((empresas.id = (select auth.uid())) AND (empresas.papel = 'fornecedor'::papel_empresa)))));

alter policy "comprador cancela os próprios pedidos" on pedidos
  using ((comprador_id = (select auth.uid())) AND (status = 'aberto'::status_pedido))
  with check ((comprador_id = (select auth.uid())) AND (status = 'cancelado'::status_pedido));

alter policy "comprador cria os próprios pedidos" on pedidos
  with check ((comprador_id = (select auth.uid())) AND (status = 'aberto'::status_pedido) AND (lance_vencedor_id IS NULL) AND (EXISTS ( SELECT 1 FROM empresas WHERE ((empresas.id = (select auth.uid())) AND (empresas.papel = 'comprador'::papel_empresa)))));

alter policy "reservas visíveis ao comprador e ao vendedor" on reservas
  using (((select auth.uid()) = comprador_id) OR ((select auth.uid()) = fornecedor_id));

alter policy "cada conta vê o próprio uso da IA" on uso_ia
  using (empresa_id = (select auth.uid()));


-- 2. Índices nas colunas que ligam uma tabela a outra e que as telas filtram
--    (minhas ofertas, meus leilões, lances, pedidos da vitrine, avisos...).
--    (Aviso "unindexed_foreign_keys" do Supabase.)
create index if not exists alertas_preco_empresa_idx on alertas_preco (empresa_id);
create index if not exists avaliacoes_avaliador_idx on avaliacoes (avaliador_id);
create index if not exists compras_fornecedor_idx on compras (fornecedor_id);
create index if not exists compras_oferta_idx on compras (oferta_id);
create index if not exists compras_pedido_idx on compras (pedido_id);
create index if not exists contatos_contato_idx on contatos (contato_id);
create index if not exists lances_fornecedor_idx on lances (fornecedor_id);
create index if not exists ofertas_fornecedor_idx on ofertas (fornecedor_id);
create index if not exists pedidos_comprador_idx on pedidos (comprador_id);
create index if not exists pedidos_lance_vencedor_idx on pedidos (lance_vencedor_id);
create index if not exists reservas_compra_idx on reservas (compra_id);
create index if not exists reservas_oferta_idx on reservas (oferta_id);
