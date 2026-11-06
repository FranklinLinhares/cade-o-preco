-- Cadê o Preço: a pesquisa de preço na internet com IA saiu do app. No lugar dela, ao criar
-- um leilão, o comprador vê quanto se pagou pelo produto na região dentro do próprio app.
-- A média antiga misturava unidades (kg com caixa, por exemplo); agora só conta a mesma unidade.

drop function if exists preco_medio_regional(text);

create function preco_medio_regional(chave text, p_unidade unidade_medida)
returns table (preco_medio numeric, compras bigint)
language sql stable
security definer set search_path = public
as $$
  select round(avg(c.preco_unitario), 2), count(*)
  from compras c
  join empresas comprador on comprador.id = c.comprador_id
  join empresas eu on eu.id = (select auth.uid())
  where c.produto_chave = chave
    and c.unidade = p_unidade
    and c.data >= current_date - 30
    and distancia_km(eu.lat, eu.lng, comprador.lat, comprador.lng) <= eu.raio_km
$$;

revoke execute on function preco_medio_regional(text, unidade_medida) from public, anon;
grant execute on function preco_medio_regional(text, unidade_medida) to authenticated;

notify pgrst, 'reload schema';
