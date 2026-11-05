-- Cadê o Preço: no leilão em grupo, o vendedor vê quem está comprando e
-- aceita (ou recusa) vender para cada participante.
--
-- Antes (0028), o vendedor via só "N pessoas, total X" e, ao fechar, cada
-- participante já virava compra. Agora:
--   * quem pode dar lance vê o nome e a quantidade de cada participante;
--   * ao fechar, a compra de quem criou o leilão sai na hora, como antes;
--     cada participante fica "aguardando" o vencedor;
--   * o vencedor aceita (vira compra, com WhatsApp e avaliação) ou recusa
--     (o participante é avisado) cada um.

alter table pedido_participantes add column if not exists situacao text not null default 'no_grupo'
  check (situacao in ('no_grupo', 'aguardando', 'aceito', 'recusado'));

-- O vencedor do leilão. Função própria (ignora as regras de acesso) para a
-- regra abaixo não ler lances, cuja regra lê esta tabela (dava laço infinito).
create or replace function venceu_o_leilao(p_pedido uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from pedidos p join lances l on l.id = p.lance_vencedor_id
    where p.id = p_pedido and l.fornecedor_id = auth.uid()
  )
$$;

-- Quem pode dar lance no leilão (e o vencedor) vê quem está no grupo.
drop policy "participante e organizadora veem o grupo" on pedido_participantes;
create policy "participante, organizadora e vendedores veem o grupo" on pedido_participantes
  for select to authenticated using (
    comprador_id = (select auth.uid())
    or exists (
      select 1 from pedidos p
      where p.id = pedido_id
        and (
          p.comprador_id = (select auth.uid())
          -- vendedores (no modo Vender) que podem dar lance neste leilão
          or (fornecedor_pode_ver(p, (select auth.uid()))
              and exists (select 1 from empresas e where e.id = (select auth.uid()) and e.papel = 'fornecedor'))
        )
    )
    or venceu_o_leilao(pedido_id)
  );

-- Fechar: a compra de quem criou sai na hora; os participantes esperam o vendedor.
create or replace function fechar_pedido(p_pedido uuid, p_lance uuid)
returns pedidos
language plpgsql
security definer set search_path = public
as $$
declare
  v_pedido pedidos;
  v_lance lances;
  v_vendedor empresas;
  v_esperando bigint;
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

  update pedido_participantes set situacao = 'aguardando' where pedido_id = p_pedido;
  get diagnostics v_esperando = row_count;

  if v_esperando > 0 then
    insert into avisos (empresa_id, texto, link)
    select pp.comprador_id,
           format('O leilão em grupo de %s fechou com %s a %s por %s. Agora %s precisa aceitar vender a sua parte.',
                  v_pedido.produto, v_vendedor.nome, br_reais(v_lance.preco_unitario), v_pedido.unidade, v_vendedor.nome),
           '/pedidos/' || v_pedido.id
    from pedido_participantes pp
    where pp.pedido_id = p_pedido;

    insert into avisos (empresa_id, texto, link)
    values (v_lance.fornecedor_id,
            format('Leilão em grupo de %s: %s comprador(es) esperam você aceitar ou recusar a venda.', v_pedido.produto, v_esperando),
            '/pedidos/' || v_pedido.id);
  end if;

  return v_pedido;
end;
$$;

-- O vencedor aceita ou recusa vender para um participante do grupo.
create or replace function responder_participante(p_pedido uuid, p_comprador uuid, p_aceitar boolean)
returns pedido_participantes
language plpgsql
security definer set search_path = public
as $$
declare
  v_pedido pedidos;
  v_lance lances;
  v_vendedor empresas;
  v_linha pedido_participantes;
begin
  select * into v_pedido from pedidos where id = p_pedido for update;
  if v_pedido is null or v_pedido.status <> 'fechado' then
    raise exception 'Leilão não encontrado.';
  end if;
  select * into v_lance from lances where id = v_pedido.lance_vencedor_id;
  if v_lance is null or v_lance.fornecedor_id <> auth.uid() then
    raise exception 'Só quem venceu o leilão responde aos compradores do grupo.';
  end if;

  select * into v_linha from pedido_participantes
  where pedido_id = p_pedido and comprador_id = p_comprador for update;
  if v_linha is null then
    raise exception 'Comprador não encontrado neste grupo.';
  end if;
  if v_linha.situacao <> 'aguardando' then
    raise exception 'Você já respondeu a este comprador.';
  end if;

  update pedido_participantes set situacao = case when p_aceitar then 'aceito' else 'recusado' end
  where pedido_id = p_pedido and comprador_id = p_comprador
  returning * into v_linha;

  select * into v_vendedor from empresas where id = v_lance.fornecedor_id;
  if p_aceitar then
    insert into compras (comprador_id, fornecedor_id, produto, produto_chave, categoria,
                         unidade, quantidade, preco_unitario, origem, pedido_id)
    values (p_comprador, v_lance.fornecedor_id, v_pedido.produto, v_pedido.produto_chave,
            v_pedido.categoria, v_pedido.unidade, v_linha.quantidade, v_lance.preco_unitario,
            'leilao', v_pedido.id);
  end if;

  insert into avisos (empresa_id, texto, link)
  values (p_comprador,
          case when p_aceitar
            then format('%s aceitou vender %s %s de %s para você. Combine a entrega pelo WhatsApp.',
                        v_vendedor.nome, br_numero(v_linha.quantidade), v_pedido.unidade, v_pedido.produto)
            else format('%s recusou vender %s para você no leilão em grupo.', v_vendedor.nome, v_pedido.produto)
          end,
          '/pedidos/' || v_pedido.id);
  return v_linha;
end;
$$;

revoke execute on function responder_participante, fechar_pedido, venceu_o_leilao from public, anon;
grant execute on function responder_participante, fechar_pedido, venceu_o_leilao to authenticated;

notify pgrst, 'reload schema';
