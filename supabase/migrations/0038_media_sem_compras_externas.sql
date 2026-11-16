-- Cadê o Preço: a "média paga na região" mostrada ao criar um leilão (e salva como preço de
-- referência, que alimenta os selos acima/abaixo da média) contava também as compras que
-- cada conta registra "fora do app". Essas são digitadas livremente: uma conta só podia
-- registrar dezenas de compras com preço inventado, ou com data no futuro (que ficava
-- para sempre dentro da janela de 30 dias), e mudar a média de toda a região.
--
-- Agora:
-- 1) a média regional só conta compras feitas pelo app (vitrine e leilões) até hoje;
-- 2) compra registrada fora do app não pode ter data no futuro (horário de Fortaleza).
-- As compras externas continuam valendo no histórico da própria conta (Meus preços).

create or replace function preco_medio_regional(chave text, p_unidade unidade_medida)
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
    and c.origem <> 'externa'
    and c.data >= current_date - 30
    and c.data <= current_date
    and distancia_km(eu.lat, eu.lng, comprador.lat, comprador.lng) <= eu.raio_km
$$;

revoke execute on function preco_medio_regional(text, unidade_medida) from public, anon;
grant execute on function preco_medio_regional(text, unidade_medida) to authenticated;

create or replace function conferir_data_da_compra()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.origem = 'externa' and new.data > (now() at time zone 'America/Fortaleza')::date then
    raise exception 'A data da compra não pode ser no futuro.';
  end if;
  return new;
end;
$$;

revoke execute on function conferir_data_da_compra() from public, anon, authenticated;

drop trigger if exists compras_data_no_futuro on compras;
create trigger compras_data_no_futuro
  before insert or update of data, origem on compras
  for each row execute function conferir_data_da_compra();

notify pgrst, 'reload schema';
