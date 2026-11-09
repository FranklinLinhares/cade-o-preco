-- Leilão em grupo: fecha duas brechas abertas na 0028.
--
-- 1) Lances fechados: quem só PEDIU para entrar no grupo (ainda não aceito),
--    foi recusado ou desistiu não vê mais os lances. Antes, um vendedor podia
--    trocar para o modo Comprar, pedir para entrar, ler os lances sigilosos,
--    sair e dar um lance menor.
-- 2) Leilão em grupo só para convidados: deixa de ficar aberto a toda conta do
--    país. Vê quem criou, os vendedores convidados, quem está no grupo e quem
--    mora a até 5 km de quem criou (quem pode entrar no grupo).

-- Quem está no grupo ou pode entrar nele. security definer para ler a posição
-- de quem criou sem expor a tabela de empresas.
create or replace function pode_ver_grupo(p_pedido uuid, p_comprador uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
      select 1 from pedido_participantes pp
      where pp.pedido_id = p_pedido and pp.comprador_id = auth.uid()
    )
    or exists (
      select 1 from empresas c, empresas eu
      where c.id = p_comprador and eu.id = auth.uid()
        and distancia_km(c.lat, c.lng, eu.lat, eu.lng) <= 5
    )
$$;
revoke execute on function pode_ver_grupo(uuid, uuid) from public, anon;
grant execute on function pode_ver_grupo(uuid, uuid) to authenticated;

drop policy "pedidos visíveis a usuários logados" on pedidos;
create policy "pedidos visíveis a usuários logados" on pedidos
  for select to authenticated using (
    convidados is null
    or comprador_id = (select auth.uid())
    or (select auth.uid()) = any (convidados)
    or (aceita_participantes and pode_ver_grupo(id, comprador_id))
  );

alter policy "lances conforme a visibilidade do pedido" on lances
  using (
    fornecedor_id = (select auth.uid())
    or exists (
      select 1 from pedidos p
      where p.id = lances.pedido_id
        and (p.comprador_id = (select auth.uid()) or p.lances_visiveis)
    )
    or exists (
      select 1 from pedido_participantes pp
      where pp.pedido_id = lances.pedido_id
        and pp.comprador_id = (select auth.uid())
        and pp.situacao not in ('pedido', 'desistiu', 'recusado')
    )
  );
