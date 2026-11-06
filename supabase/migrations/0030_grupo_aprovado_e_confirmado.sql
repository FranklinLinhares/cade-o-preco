-- Cadê o Preço: quem cria o leilão em grupo escolhe quem participa, e cada
-- participante confirma a compra depois que o vencedor é escolhido.
--
-- Situações de cada pessoa do grupo:
--   pedido     -> tocou "Quero também"; espera quem criou aceitar
--   no_grupo   -> aceita por quem criou; conta no total e aparece aos vendedores
--   confirmar  -> o leilão fechou; a pessoa confirma a compra ou desiste
--   desistiu   -> não quis comprar no preço vencedor
--   aguardando -> confirmou; espera o vendedor aceitar vender
--   aceito / recusado -> resposta do vendedor (0029)

alter table pedido_participantes drop constraint if exists pedido_participantes_situacao_check;
alter table pedido_participantes add constraint pedido_participantes_situacao_check
  check (situacao in ('pedido', 'no_grupo', 'confirmar', 'desistiu', 'aguardando', 'aceito', 'recusado'));
alter table pedido_participantes alter column situacao set default 'pedido';

-- Vendedores não veem quem ainda espera a aprovação de quem criou.
drop policy "participante, organizadora e vendedores veem o grupo" on pedido_participantes;
create policy "participante, organizadora e vendedores veem o grupo" on pedido_participantes
  for select to authenticated using (
    comprador_id = (select auth.uid())
    or exists (
      select 1 from pedidos p
      where p.id = pedido_id
        and (
          p.comprador_id = (select auth.uid())
          or (situacao <> 'pedido'
              and fornecedor_pode_ver(p, (select auth.uid()))
              and exists (select 1 from empresas e where e.id = (select auth.uid()) and e.papel = 'fornecedor'))
        )
    )
    or (situacao <> 'pedido' and venceu_o_leilao(pedido_id))
  );

-- Só quem foi aceito no grupo conta no total e trava o cancelamento.
create or replace function grupo_travado(p_pedido uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (select 1 from pedido_participantes where pedido_id = p_pedido and situacao = 'no_grupo')
     and exists (select 1 from lances where pedido_id = p_pedido)
$$;

create or replace function resumo_grupos(p_ids uuid[])
returns table (pedido_id uuid, participantes bigint, quantidade_total numeric)
language sql stable
security definer set search_path = public
as $$
  select p.id,
         (select count(*) from pedido_participantes pp
          where pp.pedido_id = p.id and pp.situacao not in ('pedido', 'desistiu', 'recusado')),
         p.quantidade + coalesce((select sum(pp.quantidade) from pedido_participantes pp
          where pp.pedido_id = p.id and pp.situacao not in ('pedido', 'desistiu', 'recusado')), 0)
  from pedidos p
  where p.id = any (p_ids)
$$;

-- Quem criou aceita ou recusa um pedido para entrar no grupo.
create or replace function responder_pedido_grupo(p_pedido uuid, p_comprador uuid, p_aceitar boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_pedido pedidos;
  v_linha pedido_participantes;
begin
  select * into v_pedido from pedidos where id = p_pedido for update;
  if v_pedido is null or v_pedido.comprador_id <> auth.uid() then
    raise exception 'Leilão não encontrado.';
  end if;
  if v_pedido.status <> 'aberto' or v_pedido.encerra_em <= now() then
    raise exception 'Este leilão já foi encerrado.';
  end if;
  select * into v_linha from pedido_participantes
  where pedido_id = p_pedido and comprador_id = p_comprador for update;
  if v_linha is null or v_linha.situacao <> 'pedido' then
    raise exception 'Este pedido para entrar no grupo não está mais esperando resposta.';
  end if;

  if p_aceitar then
    update pedido_participantes set situacao = 'no_grupo'
    where pedido_id = p_pedido and comprador_id = p_comprador;
  else
    delete from pedido_participantes where pedido_id = p_pedido and comprador_id = p_comprador;
  end if;

  insert into avisos (empresa_id, texto, link)
  select p_comprador,
         case when p_aceitar
           then format('%s aceitou você no leilão em grupo de %s com %s %s.', c.nome, v_pedido.produto, br_numero(v_linha.quantidade), v_pedido.unidade)
           else format('%s não aceitou você no leilão em grupo de %s.', c.nome, v_pedido.produto)
         end,
         '/pedidos/' || v_pedido.id
  from empresas c where c.id = v_pedido.comprador_id;
end;
$$;

-- Fechar: a compra de quem criou sai na hora. Quem foi aceito no grupo
-- confirma a compra ou desiste; pedidos sem resposta são descartados.
create or replace function fechar_pedido(p_pedido uuid, p_lance uuid)
returns pedidos
language plpgsql
security definer set search_path = public
as $$
declare
  v_pedido pedidos;
  v_lance lances;
  v_vendedor empresas;
  v_confirmar bigint;
begin
  select * into v_pedido from pedidos where id = p_pedido for update;
  if v_pedido is null or v_pedido.comprador_id <> auth.uid() then
    raise exception 'Pedido não encontrado.';
  end if;
  if v_pedido.status not in ('aberto', 'encerrado') then
    raise exception 'Este pedido já foi fechado ou cancelado.';
  end if;

  select * into v_lance from lances where id = p_lance and pedido_id = p_pedido;
  if v_lance is null then
    raise exception 'Lance não encontrado neste pedido.';
  end if;
  select * into v_vendedor from empresas where id = v_lance.fornecedor_id;

  update pedidos set status = 'fechado', lance_vencedor_id = v_lance.id
  where id = p_pedido returning * into v_pedido;

  insert into compras (comprador_id, fornecedor_id, produto, produto_chave, categoria,
                       unidade, quantidade, preco_unitario, origem, pedido_id)
  values (v_pedido.comprador_id, v_lance.fornecedor_id, v_pedido.produto, v_pedido.produto_chave,
          v_pedido.categoria, v_pedido.unidade, v_pedido.quantidade, v_lance.preco_unitario,
          'leilao', v_pedido.id);

  -- Pedidos para entrar que ficaram sem resposta.
  insert into avisos (empresa_id, texto, link)
  select pp.comprador_id, format('O leilão em grupo de %s fechou antes de você ser aceito no grupo.', v_pedido.produto),
         '/pedidos/' || v_pedido.id
  from pedido_participantes pp where pp.pedido_id = p_pedido and pp.situacao = 'pedido';
  delete from pedido_participantes where pedido_id = p_pedido and situacao = 'pedido';

  update pedido_participantes set situacao = 'confirmar' where pedido_id = p_pedido and situacao = 'no_grupo';
  get diagnostics v_confirmar = row_count;

  if v_confirmar > 0 then
    insert into avisos (empresa_id, texto, link)
    select pp.comprador_id,
           format('O leilão em grupo de %s fechou com %s a %s por %s. Confirme se você quer comprar a sua parte.',
                  v_pedido.produto, v_vendedor.nome, br_reais(v_lance.preco_unitario), v_pedido.unidade),
           '/pedidos/' || v_pedido.id
    from pedido_participantes pp
    where pp.pedido_id = p_pedido and pp.situacao = 'confirmar';

    insert into avisos (empresa_id, texto, link)
    values (v_lance.fornecedor_id,
            format('Leilão em grupo de %s: %s comprador(es) do grupo vão confirmar a compra. Você vê quem confirmou na página do leilão.', v_pedido.produto, v_confirmar),
            '/pedidos/' || v_pedido.id);
  end if;

  return v_pedido;
end;
$$;

-- O participante confirma a compra no preço vencedor, ou desiste.
create or replace function confirmar_compra_grupo(p_pedido uuid, p_confirmar boolean)
returns pedido_participantes
language plpgsql
security definer set search_path = public
as $$
declare
  v_pedido pedidos;
  v_lance lances;
  v_linha pedido_participantes;
  v_eu empresas;
begin
  select * into v_pedido from pedidos where id = p_pedido;
  select * into v_linha from pedido_participantes
  where pedido_id = p_pedido and comprador_id = auth.uid() for update;
  if v_pedido is null or v_linha is null then
    raise exception 'Você não está neste grupo.';
  end if;
  if v_linha.situacao <> 'confirmar' then
    raise exception 'Você já respondeu, ou o leilão ainda não fechou.';
  end if;

  update pedido_participantes set situacao = case when p_confirmar then 'aguardando' else 'desistiu' end
  where pedido_id = p_pedido and comprador_id = auth.uid()
  returning * into v_linha;

  select * into v_lance from lances where id = v_pedido.lance_vencedor_id;
  select * into v_eu from empresas where id = auth.uid();
  insert into avisos (empresa_id, texto, link)
  values (v_lance.fornecedor_id,
          case when p_confirmar
            then format('%s confirmou a compra de %s %s de %s no leilão em grupo. Aceite ou recuse a venda.',
                        v_eu.nome, br_numero(v_linha.quantidade), v_pedido.unidade, v_pedido.produto)
            else format('%s desistiu da compra de %s no leilão em grupo.', v_eu.nome, v_pedido.produto)
          end,
          '/pedidos/' || v_pedido.id);
  return v_linha;
end;
$$;

-- Quem ainda espera ser aceito pode desistir de entrar a qualquer momento.
create or replace function sair_do_grupo(p_pedido uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_pedido pedidos;
  v_linha pedido_participantes;
begin
  select * into v_pedido from pedidos where id = p_pedido for update;
  select * into v_linha from pedido_participantes where pedido_id = p_pedido and comprador_id = auth.uid();
  if v_pedido is null or v_linha is null then
    raise exception 'Você não está neste grupo.';
  end if;
  if v_linha.situacao = 'no_grupo' then
    perform conferir_saida_do_grupo(v_pedido, 'sair do grupo');
  elsif v_linha.situacao <> 'pedido' then
    raise exception 'O leilão já fechou: para não comprar, use "Desistir".';
  end if;
  delete from pedido_participantes where pedido_id = p_pedido and comprador_id = auth.uid();
end;
$$;

-- Avisos a quem criou: pedido para entrar e saída de quem já estava no grupo.
create or replace function avisar_grupo()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_pedido pedidos;
  v_resumo record;
begin
  if tg_op = 'DELETE' and old.situacao <> 'no_grupo' then
    return null;
  end if;
  select * into v_pedido from pedidos where id = coalesce(new.pedido_id, old.pedido_id);
  if v_pedido is null then
    return null;
  end if;
  select * into v_resumo from resumo_grupos(array[v_pedido.id]);
  insert into avisos (empresa_id, texto, link)
  select v_pedido.comprador_id,
         case tg_op
           when 'INSERT' then format('%s quer entrar no seu leilão em grupo de %s com %s %s. Aceite ou recuse.',
                                     c.nome, v_pedido.produto, br_numero(new.quantidade), v_pedido.unidade)
           else format('%s saiu do seu leilão em grupo de %s. Total: %s %s.',
                       c.nome, v_pedido.produto, br_numero(v_resumo.quantidade_total), v_pedido.unidade)
         end,
         '/pedidos/' || v_pedido.id
  from empresas c
  where c.id = coalesce(new.comprador_id, old.comprador_id);
  return null;
end;
$$;

-- Lista de grupos perto: mostra também a situação de quem está vendo.
drop function if exists grupos_proximos();
create function grupos_proximos()
returns table (
  id uuid, comprador_nome text, cidade text, distancia_km double precision,
  produto text, categoria categoria_alimento, unidade unidade_medida,
  quantidade numeric, quantidade_total numeric, participantes bigint,
  encerra_em timestamptz, total_lances bigint, minha_quantidade numeric, minha_situacao text
)
language sql stable
security definer set search_path = public
as $$
  select p.id, c.nome, c.cidade,
         distancia_em_faixa(distancia_km(c.lat, c.lng, eu.lat, eu.lng)),
         p.produto, p.categoria, p.unidade, p.quantidade, r.quantidade_total, r.participantes,
         p.encerra_em,
         (select count(*) from lances l where l.pedido_id = p.id),
         eu_pp.quantidade, eu_pp.situacao
  from pedidos p
  join empresas c on c.id = p.comprador_id
  join empresas eu on eu.id = auth.uid()
  left join pedido_participantes eu_pp on eu_pp.pedido_id = p.id and eu_pp.comprador_id = eu.id
  cross join lateral resumo_grupos(array[p.id]) r
  where p.aceita_participantes
    and p.status = 'aberto'
    and p.encerra_em > now()
    and c.id <> eu.id
    and distancia_km(c.lat, c.lng, eu.lat, eu.lng) <= 5
  order by p.encerra_em
$$;

create or replace function compradores_interessados(chave text)
returns bigint
language sql stable
security definer set search_path = public
as $$
  select count(distinct q.comprador)
  from (
    select p.comprador_id as comprador
    from pedidos p
    where p.status = 'aberto'
      and p.encerra_em > now()
      and p.produto_chave = chave
      and p.comprador_id <> auth.uid()
      and fornecedor_pode_ver(p, auth.uid())
    union all
    select pp.comprador_id
    from pedidos p
    join pedido_participantes pp on pp.pedido_id = p.id and pp.situacao = 'no_grupo'
    where p.status = 'aberto'
      and p.encerra_em > now()
      and p.produto_chave = chave
      and p.comprador_id <> auth.uid()
      and fornecedor_pode_ver(p, auth.uid())
  ) q
$$;

revoke execute on function responder_pedido_grupo, confirmar_compra_grupo, grupos_proximos, sair_do_grupo,
  grupo_travado, resumo_grupos, fechar_pedido, compradores_interessados from public, anon;
grant execute on function responder_pedido_grupo, confirmar_compra_grupo, grupos_proximos, sair_do_grupo,
  grupo_travado, resumo_grupos, fechar_pedido, compradores_interessados to authenticated;
revoke execute on function avisar_grupo from public, anon, authenticated;

notify pgrst, 'reload schema';
