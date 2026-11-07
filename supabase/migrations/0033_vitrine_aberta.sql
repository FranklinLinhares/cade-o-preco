-- Vitrine aberta para quem ainda não tem conta.
-- Mostra só as ofertas abertas a todos (sem lista de convidados), sem o id, o
-- telefone nem a localização de quem vende: só o nome e a cidade. Para comprar
-- ou falar com o vendedor a pessoa precisa entrar.
create or replace function vitrine_publica(termo text default null, p_oferta uuid default null)
returns table (
  id uuid, fornecedor_nome text, agricultor boolean, fornecedor_pj boolean, vende_para text,
  cidade text, uf char(2),
  produto text, produto_chave text, categoria categoria_alimento,
  unidade unidade_medida, preco_unitario numeric, quantidade_disponivel numeric,
  validade date, disponivel_a_partir date, valida_ate timestamptz, descricao text,
  so_na_loja boolean
)
language sql stable
security definer set search_path = public
as $$
  select o.id, f.nome, f.agricultor, f.tipo_documento::text = 'cnpj', o.vende_para,
         f.cidade, f.uf,
         o.produto, o.produto_chave, o.categoria, o.unidade, o.preco_unitario,
         o.quantidade_disponivel, o.validade, o.disponivel_a_partir, o.valida_ate, o.descricao,
         o.so_na_loja
  from ofertas o
  join empresas f on f.id = o.fornecedor_id
  where o.ativa
    and o.valida_ate > now()
    and o.convidados is null
    and (p_oferta is null or o.id = p_oferta)
    and (
      termo is null or termo = ''
      or o.produto ilike '%' || left(termo, 60) || '%'
      or o.produto_chave ilike '%' || replace(left(termo, 60), ' ', '-') || '%'
      or f.cidade ilike '%' || left(termo, 60) || '%'
    )
  order by o.produto_chave, o.preco_unitario
  limit 300
$$;
revoke execute on function vitrine_publica(text, uuid) from public;
grant execute on function vitrine_publica(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
