-- Cadê o Preço: três brechas achadas na revisão de 16/11.
--
-- 1) Quem já esteve num leilão em grupo não dá lance nele. Antes, um vendedor podia
--    trocar para Comprar, entrar no grupo, ver os lances sigilosos, sair (até 2 h
--    antes do fim) e voltar a Vender para cobrir o menor lance.
-- 2) Menos avisos em massa: cada conta recebe no máximo 5 avisos de "leilão novo"
--    e 5 alertas de preço por hora vindos da mesma conta; ligar e desligar uma
--    oferta não reenvia o mesmo alerta; cada conta adiciona até 50 contatos por hora.
-- 3) Leilão em grupo vencido sem escolha não prende ninguém: 2 dias depois do prazo,
--    quem está no grupo pode sair e quem criou pode cancelar.

-- ---------------------------------------------------------------------------
-- 1. Quem saiu do grupo não dá lance
-- ---------------------------------------------------------------------------

-- Sem chave estrangeira de propósito: a linha é gravada enquanto o leilão ou a
-- conta podem estar sendo apagados, e uma linha sobrando não faz mal.
create table if not exists grupo_saidas (
  pedido_id uuid not null,
  comprador_id uuid not null,
  saiu_em timestamptz not null default now(),
  primary key (pedido_id, comprador_id)
);
alter table grupo_saidas enable row level security;
revoke all on grupo_saidas from anon, authenticated;

-- Quem só pediu para entrar (e nunca foi aceito) não viu nada: não precisa guardar.
create or replace function guardar_saida_do_grupo()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.situacao <> 'pedido' then
    insert into grupo_saidas (pedido_id, comprador_id) values (old.pedido_id, old.comprador_id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;
revoke execute on function guardar_saida_do_grupo() from public, anon, authenticated;
drop trigger if exists guardar_saida_do_grupo on pedido_participantes;
create trigger guardar_saida_do_grupo after delete on pedido_participantes
  for each row execute function guardar_saida_do_grupo();

create or replace function lance_de_participante()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (select 1 from pedido_participantes where pedido_id = new.pedido_id and comprador_id = new.fornecedor_id) then
    raise exception 'Você está no grupo deste leilão e não pode dar lance nele.';
  end if;
  if exists (select 1 from grupo_saidas where pedido_id = new.pedido_id and comprador_id = new.fornecedor_id) then
    raise exception 'Você participou do grupo deste leilão e não pode dar lance nele.';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Menos avisos em massa
-- ---------------------------------------------------------------------------

-- Conta que gerou o aviso (para limitar quantos a mesma conta manda por hora).
alter table avisos add column if not exists remetente_id uuid;
create index if not exists avisos_remetente on avisos (empresa_id, remetente_id, criado_em desc)
  where remetente_id is not null;

create or replace function avisar_leilao_novo()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into avisos (empresa_id, texto, link, remetente_id)
  select f.id,
         format('Leilão novo perto de você: %s %s de %s', br_numero(new.quantidade), new.unidade, new.produto),
         '/pedidos/' || new.id,
         new.comprador_id
  from empresas f
  where f.id <> new.comprador_id
    and (cardinality(f.categorias) = 0 or new.categoria = any (f.categorias))
    and fornecedor_pode_ver(new, f.id)
    and (select count(*) from avisos av
         where av.empresa_id = f.id and av.remetente_id = new.comprador_id
           and av.texto like 'Leilão novo%' and av.criado_em > now() - interval '1 hour') < 5;
  return new;
end;
$$;

create or replace function avisar_alerta_preco()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  -- Republicar sem baixar o preço não avisa de novo quem já recebeu este alerta.
  v_republicou boolean := tg_op = 'UPDATE' and new.preco_unitario >= old.preco_unitario;
begin
  if tg_op = 'UPDATE' and new.preco_unitario >= old.preco_unitario and old.ativa then
    return new;
  end if;
  insert into avisos (empresa_id, texto, link, remetente_id)
  select distinct a.empresa_id,
         format('Alerta de preço: %s a %s por %s na vitrine', new.produto, br_reais(new.preco_unitario), new.unidade),
         '/vitrine/' || new.id,
         new.fornecedor_id
  from alertas_preco a
  where a.produto_chave = new.produto_chave
    and a.unidade = new.unidade
    and new.preco_unitario <= a.preco_maximo
    and a.empresa_id <> new.fornecedor_id
    and comprador_pode_ver(new, a.empresa_id)
    and not (v_republicou and exists (
      select 1 from avisos av
      where av.empresa_id = a.empresa_id and av.link = '/vitrine/' || new.id
        and av.criado_em > now() - interval '7 days'))
    and (select count(*) from avisos av
         where av.empresa_id = a.empresa_id and av.remetente_id = new.fornecedor_id
           and av.texto like 'Alerta de preço%' and av.criado_em > now() - interval '1 hour') < 5;
  return new;
end;
$$;

create index if not exists contatos_dono_criado on contatos (dono_id, criado_em desc);

create or replace function limitar_contatos()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (select count(*) from contatos where dono_id = new.dono_id and criado_em > now() - interval '1 hour') >= 50 then
    raise exception 'Você adicionou muitos contatos na última hora. Tente de novo mais tarde.';
  end if;
  return new;
end;
$$;
revoke execute on function limitar_contatos() from public, anon, authenticated;
drop trigger if exists limitar_contatos on contatos;
create trigger limitar_contatos before insert on contatos
  for each row execute function limitar_contatos();

-- ---------------------------------------------------------------------------
-- 3. Grupo vencido sem escolha: 2 dias depois do prazo, ninguém fica preso
-- ---------------------------------------------------------------------------

create or replace function grupo_liberado(v_pedido pedidos)
returns boolean
language sql stable
set search_path = public
as $$
  select v_pedido.status in ('aberto', 'encerrado') and v_pedido.encerra_em < now() - interval '2 days'
$$;

create or replace function grupo_travado(p_pedido uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (select 1 from pedido_participantes where pedido_id = p_pedido and situacao = 'no_grupo')
     and exists (select 1 from lances where pedido_id = p_pedido)
     and not exists (select 1 from pedidos p where p.id = p_pedido and grupo_liberado(p))
$$;

create or replace function conferir_saida_do_grupo(v_pedido pedidos, o_que text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if grupo_liberado(v_pedido) then
    return;
  end if;
  if v_pedido.status <> 'aberto' or v_pedido.encerra_em <= now() then
    raise exception 'Este leilão já foi encerrado.';
  end if;
  if exists (select 1 from lances where pedido_id = v_pedido.id)
     and v_pedido.encerra_em - now() < interval '2 hours' then
    raise exception 'Já tem lance e faltam menos de 2 horas para o fim: não dá mais para %.', o_que;
  end if;
end;
$$;

revoke execute on function grupo_liberado(pedidos) from public, anon;
grant execute on function grupo_liberado(pedidos) to authenticated;

notify pgrst, 'reload schema';
