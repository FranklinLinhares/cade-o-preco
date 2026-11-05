-- Cadê o Preço: leilão em grupo (Fase 1).
--
-- Quem cria o leilão (a organizadora) pode aceitar outras pessoas. Compradores
-- a até 5 km dela tocam "Quero também" e informam só a sua quantidade; produto,
-- especificações e prazo são os dela. O vendedor vê a quantidade somada e dá o
-- lance por unidade, como sempre. Quando a organizadora escolhe o vencedor, cada
-- participante ganha a sua própria compra, no mesmo preço, com conclusão e
-- avaliação separadas.
--
-- Regras:
--   * participante a até 5 km da organizadora, no modo Comprar;
--   * no máximo o dobro da quantidade da organizadora por pessoa, e 30 pessoas;
--   * sair (ou mudar a quantidade para menos) é livre até o primeiro lance;
--     depois do primeiro lance, só até 2 horas antes do fim;
--   * com participantes e lance, a organizadora não cancela mais o leilão;
--   * o vendedor vê só "N pessoas, total X" até o negócio fechar.

alter table pedidos add column if not exists aceita_participantes boolean not null default false;

create table if not exists pedido_participantes (
  pedido_id uuid not null references pedidos (id) on delete cascade,
  comprador_id uuid not null references empresas (id) on delete cascade,
  quantidade numeric(12, 2) not null check (quantidade > 0),
  entrou_em timestamptz not null default now(),
  primary key (pedido_id, comprador_id)
);
create index if not exists pedido_participantes_comprador_idx on pedido_participantes (comprador_id);

alter table pedido_participantes enable row level security;
-- Cada participante vê a própria linha; a organizadora vê todas do seu leilão.
-- Os outros (vendedores, outros participantes) veem só o resumo por resumo_grupos().
create policy "participante e organizadora veem o grupo" on pedido_participantes
  for select to authenticated using (
    comprador_id = (select auth.uid())
    or exists (select 1 from pedidos p where p.id = pedido_id and p.comprador_id = (select auth.uid()))
  );
-- Entrar, mudar e sair só pelas funções abaixo, que conferem as regras.
revoke insert, update, delete on pedido_participantes from anon, authenticated;

-- Quem pode entrar precisa conseguir abrir o leilão em grupo, mesmo que ele
-- seja só para fornecedores convidados (os convidados limitam quem dá lance).
drop policy "pedidos visíveis a usuários logados" on pedidos;
create policy "pedidos visíveis a usuários logados" on pedidos
  for select to authenticated using (
    convidados is null
    or aceita_participantes
    or comprador_id = (select auth.uid())
    or (select auth.uid()) = any (convidados)
  );

-- Participantes acompanham os lances como a organizadora.
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
      where pp.pedido_id = lances.pedido_id and pp.comprador_id = (select auth.uid())
    )
  );

-- Com participantes e algum lance, o grupo está "travado": a organizadora não
-- cancela mais. A política de cancelar simplesmente não pega esses leilões.
create or replace function grupo_travado(p_pedido uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (select 1 from pedido_participantes where pedido_id = p_pedido)
     and exists (select 1 from lances where pedido_id = p_pedido)
$$;

alter policy "comprador cancela os próprios pedidos" on pedidos
  using ((comprador_id = (select auth.uid())) and (status = 'aberto'::status_pedido) and not grupo_travado(id))
  with check ((comprador_id = (select auth.uid())) and (status = 'cancelado'::status_pedido));

-- Resumo de cada grupo: quantas pessoas entraram e a quantidade total (com a
-- da organizadora). Não mostra quem são.
create or replace function resumo_grupos(p_ids uuid[])
returns table (pedido_id uuid, participantes bigint, quantidade_total numeric)
language sql stable
security definer set search_path = public
as $$
  select p.id,
         (select count(*) from pedido_participantes pp where pp.pedido_id = p.id),
         p.quantidade + coalesce((select sum(pp.quantidade) from pedido_participantes pp where pp.pedido_id = p.id), 0)
  from pedidos p
  where p.id = any (p_ids)
$$;

-- Entra no grupo ou muda a própria quantidade.
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
  elsif p_quantidade < v_atual.quantidade then
    perform conferir_saida_do_grupo(v_pedido, 'diminuir a sua quantidade');
  end if;

  insert into pedido_participantes (pedido_id, comprador_id, quantidade)
  values (p_pedido, v_eu.id, p_quantidade)
  on conflict (pedido_id, comprador_id) do update set quantidade = excluded.quantidade
  returning * into v_linha;
  return v_linha;
end;
$$;

-- Depois do primeiro lance, sair ou diminuir só até 2 horas antes do fim:
-- o vendedor baixou o preço contando com aquela quantidade.
create or replace function conferir_saida_do_grupo(v_pedido pedidos, o_que text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if v_pedido.status <> 'aberto' or v_pedido.encerra_em <= now() then
    raise exception 'Este leilão já foi encerrado.';
  end if;
  if exists (select 1 from lances where pedido_id = v_pedido.id)
     and v_pedido.encerra_em - now() < interval '2 hours' then
    raise exception 'Já tem lance e faltam menos de 2 horas para o fim: não dá mais para %.', o_que;
  end if;
end;
$$;

create or replace function sair_do_grupo(p_pedido uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_pedido pedidos;
begin
  select * into v_pedido from pedidos where id = p_pedido for update;
  if v_pedido is null
     or not exists (select 1 from pedido_participantes where pedido_id = p_pedido and comprador_id = auth.uid()) then
    raise exception 'Você não está neste grupo.';
  end if;
  perform conferir_saida_do_grupo(v_pedido, 'sair do grupo');
  delete from pedido_participantes where pedido_id = p_pedido and comprador_id = auth.uid();
end;
$$;

-- Participante não dá lance no próprio grupo.
create or replace function lance_de_participante()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (select 1 from pedido_participantes where pedido_id = new.pedido_id and comprador_id = new.fornecedor_id) then
    raise exception 'Você está no grupo deste leilão e não pode dar lance nele.';
  end if;
  return new;
end;
$$;
drop trigger if exists lance_de_participante on lances;
create trigger lance_de_participante before insert on lances
  for each row execute function lance_de_participante();

-- Fechar o leilão: a compra da organizadora, como antes, e uma compra para cada
-- participante, no mesmo preço.
create or replace function fechar_pedido(p_pedido uuid, p_lance uuid)
returns pedidos
language plpgsql
security definer set search_path = public
as $$
declare
  v_pedido pedidos;
  v_lance lances;
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

  update pedidos set status = 'fechado', lance_vencedor_id = v_lance.id
  where id = p_pedido returning * into v_pedido;

  insert into compras (comprador_id, fornecedor_id, produto, produto_chave, categoria,
                       unidade, quantidade, preco_unitario, origem, pedido_id)
  values (v_pedido.comprador_id, v_lance.fornecedor_id, v_pedido.produto, v_pedido.produto_chave,
          v_pedido.categoria, v_pedido.unidade, v_pedido.quantidade, v_lance.preco_unitario,
          'leilao', v_pedido.id);

  insert into compras (comprador_id, fornecedor_id, produto, produto_chave, categoria,
                       unidade, quantidade, preco_unitario, origem, pedido_id)
  select pp.comprador_id, v_lance.fornecedor_id, v_pedido.produto, v_pedido.produto_chave,
         v_pedido.categoria, v_pedido.unidade, pp.quantidade, v_lance.preco_unitario,
         'leilao', v_pedido.id
  from pedido_participantes pp
  where pp.pedido_id = p_pedido;

  insert into avisos (empresa_id, texto, link)
  select pp.comprador_id,
         format('O leilão em grupo de %s fechou com %s a %s por %s. Combine a entrega pelo WhatsApp.',
                v_pedido.produto, f.nome, br_reais(v_lance.preco_unitario), v_pedido.unidade),
         '/pedidos/' || v_pedido.id
  from pedido_participantes pp
  join empresas f on f.id = v_lance.fornecedor_id
  where pp.pedido_id = p_pedido;

  return v_pedido;
end;
$$;

-- Avisos do grupo: a organizadora sabe quem entrou ou saiu; os participantes
-- sabem quando o leilão é cancelado.
create or replace function avisar_grupo()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_pedido pedidos;
  v_resumo record;
begin
  select * into v_pedido from pedidos where id = coalesce(new.pedido_id, old.pedido_id);
  if v_pedido is null then
    return null;
  end if;
  select * into v_resumo from resumo_grupos(array[v_pedido.id]);
  insert into avisos (empresa_id, texto, link)
  select v_pedido.comprador_id,
         case tg_op
           when 'INSERT' then format('%s entrou no seu leilão em grupo de %s com %s %s. Total: %s %s.',
                                     c.nome, v_pedido.produto, br_numero(new.quantidade), v_pedido.unidade,
                                     br_numero(v_resumo.quantidade_total), v_pedido.unidade)
           else format('%s saiu do seu leilão em grupo de %s. Total: %s %s.',
                       c.nome, v_pedido.produto, br_numero(v_resumo.quantidade_total), v_pedido.unidade)
         end,
         '/pedidos/' || v_pedido.id
  from empresas c
  where c.id = coalesce(new.comprador_id, old.comprador_id);
  return null;
end;
$$;
drop trigger if exists avisar_grupo on pedido_participantes;
create trigger avisar_grupo after insert or delete on pedido_participantes
  for each row execute function avisar_grupo();

create or replace function avisar_grupo_cancelado()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into avisos (empresa_id, texto, link)
  select pp.comprador_id, format('O leilão em grupo de %s foi cancelado por quem criou.', new.produto), '/pedidos/' || new.id
  from pedido_participantes pp
  where pp.pedido_id = new.id;
  return new;
end;
$$;
drop trigger if exists avisar_grupo_cancelado on pedidos;
create trigger avisar_grupo_cancelado after update of status on pedidos
  for each row when (new.status = 'cancelado' and old.status is distinct from 'cancelado')
  execute function avisar_grupo_cancelado();

-- Leilões em grupo abertos a até 5 km de quem está vendo (modo Comprar).
create or replace function grupos_proximos()
returns table (
  id uuid, comprador_nome text, cidade text, distancia_km double precision,
  produto text, categoria categoria_alimento, unidade unidade_medida,
  quantidade numeric, quantidade_total numeric, participantes bigint,
  encerra_em timestamptz, total_lances bigint, minha_quantidade numeric
)
language sql stable
security definer set search_path = public
as $$
  select p.id, c.nome, c.cidade,
         distancia_em_faixa(distancia_km(c.lat, c.lng, eu.lat, eu.lng)),
         p.produto, p.categoria, p.unidade, p.quantidade, r.quantidade_total, r.participantes,
         p.encerra_em,
         (select count(*) from lances l where l.pedido_id = p.id),
         (select pp.quantidade from pedido_participantes pp where pp.pedido_id = p.id and pp.comprador_id = eu.id)
  from pedidos p
  join empresas c on c.id = p.comprador_id
  join empresas eu on eu.id = auth.uid()
  cross join lateral resumo_grupos(array[p.id]) r
  where p.aceita_participantes
    and p.status = 'aberto'
    and p.encerra_em > now()
    and c.id <> eu.id
    and distancia_km(c.lat, c.lng, eu.lat, eu.lng) <= 5
  order by p.encerra_em
$$;

-- Leilões para o vendedor: a quantidade passa a ser a do grupo inteiro.
drop function if exists pedidos_proximos();
create function pedidos_proximos()
returns table (
  id uuid, comprador_nome text, cidade text, uf char(2), distancia_km double precision,
  produto text, produto_chave text, categoria categoria_alimento, unidade unidade_medida,
  quantidade numeric, preco_maximo numeric, lances_visiveis boolean,
  encerra_em timestamptz, menor_lance numeric, total_lances bigint,
  aceita_participantes boolean, participantes bigint
)
language sql stable
security definer set search_path = public
as $$
  select p.id, c.nome, c.cidade, c.uf,
         distancia_em_faixa(distancia_km(c.lat, c.lng, f.lat, f.lng)),
         p.produto, p.produto_chave, p.categoria, p.unidade, r.quantidade_total, p.preco_maximo,
         p.lances_visiveis, p.encerra_em,
         case when p.lances_visiveis then (select min(l.preco_unitario) from lances l where l.pedido_id = p.id) end,
         (select count(*) from lances l where l.pedido_id = p.id),
         p.aceita_participantes, r.participantes
  from pedidos p
  join empresas c on c.id = p.comprador_id
  join empresas f on f.id = auth.uid()
  cross join lateral resumo_grupos(array[p.id]) r
  where p.status = 'aberto'
    and p.encerra_em > now()
    and f.papel = 'fornecedor'
    and c.id <> f.id
    and fornecedor_pode_ver(p, f.id)
  order by p.encerra_em
$$;

-- "N compradores perto de você têm leilão aberto para este produto" conta
-- também quem entrou em grupo.
create or replace function compradores_interessados(chave text)
returns bigint
language sql stable
security definer set search_path = public
as $$
  select count(distinct q.comprador)
  from (
    select p.comprador_id as comprador, p.id
    from pedidos p
    where p.status = 'aberto'
      and p.encerra_em > now()
      and p.produto_chave = chave
      and p.comprador_id <> auth.uid()
      and fornecedor_pode_ver(p, auth.uid())
    union all
    select pp.comprador_id, p.id
    from pedidos p
    join pedido_participantes pp on pp.pedido_id = p.id
    where p.status = 'aberto'
      and p.encerra_em > now()
      and p.produto_chave = chave
      and p.comprador_id <> auth.uid()
      and fornecedor_pode_ver(p, auth.uid())
  ) q
$$;

-- Permissões: só usuários logados chamam as funções de tela; as de gatilho e
-- as internas ficam fechadas.
revoke execute on function grupo_travado, resumo_grupos, entrar_no_grupo, sair_do_grupo,
  grupos_proximos, pedidos_proximos, compradores_interessados, fechar_pedido from public, anon;
grant execute on function grupo_travado, resumo_grupos, entrar_no_grupo, sair_do_grupo,
  grupos_proximos, pedidos_proximos, compradores_interessados, fechar_pedido to authenticated;
revoke execute on function conferir_saida_do_grupo, lance_de_participante, avisar_grupo,
  avisar_grupo_cancelado from public, anon, authenticated;

notify pgrst, 'reload schema';
