-- Leilão em grupo: quantidade de quem já está no grupo.
--
-- 1) Quem já foi aceito e AUMENTA a quantidade: quem criou recebe um aviso
--    (antes a mudança passava em silêncio).
-- 2) Quem ainda espera ser aceito (situação 'pedido') pode diminuir a qualquer
--    hora, como já podia cancelar o pedido; a regra das 2 horas vale só para
--    quem já está no grupo.
-- O resto da função é igual à da 0028.

create or replace function entrar_no_grupo(p_pedido uuid, p_quantidade numeric)
returns pedido_participantes
language plpgsql
security definer set search_path = public
as $$
declare
  v_pedido pedidos;
  v_eu empresas;
  v_org empresas;
  v_atual pedido_participantes;
  v_linha pedido_participantes;
begin
  p_quantidade := round(p_quantidade, 2);
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Informe uma quantidade maior que zero.';
  end if;

  select * into v_eu from empresas where id = auth.uid();
  if v_eu is null or v_eu.papel <> 'comprador' then
    raise exception 'Mude para o modo Comprar, no menu, para entrar no grupo.';
  end if;

  select * into v_pedido from pedidos where id = p_pedido for update;
  if v_pedido is null or not v_pedido.aceita_participantes then
    raise exception 'Este leilão não aceita outras pessoas.';
  end if;
  if v_pedido.status <> 'aberto' or v_pedido.encerra_em <= now() then
    raise exception 'Este leilão já foi encerrado.';
  end if;
  if v_pedido.comprador_id = v_eu.id then
    raise exception 'Você criou este leilão: ele já é seu.';
  end if;
  if exists (select 1 from lances where pedido_id = p_pedido and fornecedor_id = v_eu.id) then
    raise exception 'Você deu lance neste leilão e não pode entrar como comprador.';
  end if;

  select * into v_org from empresas where id = v_pedido.comprador_id;
  if distancia_km(v_org.lat, v_org.lng, v_eu.lat, v_eu.lng) > 5 then
    raise exception 'Só entra no grupo quem está a até 5 km de quem criou o leilão.';
  end if;
  if p_quantidade > 2 * v_pedido.quantidade then
    raise exception 'Cada pessoa pode pedir no máximo % % (o dobro do pedido de quem criou).',
      br_numero(2 * v_pedido.quantidade), v_pedido.unidade;
  end if;

  select * into v_atual from pedido_participantes where pedido_id = p_pedido and comprador_id = v_eu.id;
  if v_atual is null then
    if (select count(*) from pedido_participantes where pedido_id = p_pedido) >= 30 then
      raise exception 'Este grupo já tem 30 pessoas, o máximo.';
    end if;
  elsif p_quantidade < v_atual.quantidade and v_atual.situacao = 'no_grupo' then
    perform conferir_saida_do_grupo(v_pedido, 'diminuir a sua quantidade');
  end if;


  insert into pedido_participantes (pedido_id, comprador_id, quantidade)
  values (p_pedido, v_eu.id, p_quantidade)
  on conflict (pedido_id, comprador_id) do update set quantidade = excluded.quantidade
  returning * into v_linha;

  if v_atual is not null and v_atual.situacao = 'no_grupo' and p_quantidade > v_atual.quantidade then
    insert into avisos (empresa_id, texto, link)
    values (v_pedido.comprador_id,
            format('%s aumentou a quantidade no seu leilão em grupo de %s: de %s para %s %s.',
                   v_eu.nome, v_pedido.produto, br_numero(v_atual.quantidade), br_numero(p_quantidade), v_pedido.unidade),
            '/pedidos/' || v_pedido.id);
  end if;
  return v_linha;
end;
$$;

revoke execute on function entrar_no_grupo(uuid, numeric) from public, anon;
grant execute on function entrar_no_grupo(uuid, numeric) to authenticated;

notify pgrst, 'reload schema';
