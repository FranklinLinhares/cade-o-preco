-- Cadê o Preço: área do administrador (/admin).
--
-- Quem está na tabela administradores vê os números do app, a lista de contas,
-- ofertas e leilões, e pode:
--   * bloquear uma conta (não entra mais, não publica nada, as ofertas saem da
--     vitrine e os leilões abertos são cancelados) e desbloquear depois;
--   * tirar uma oferta do ar (e devolver depois);
--   * tirar um leilão aberto do ar (cancelado, sem volta).
-- Cada ação fica registrada em admin_registros e a conta afetada recebe um aviso.
--
-- Tudo passa por funções que conferem se quem chama é administrador; as tabelas
-- do app não ganham nenhuma permissão nova.
--
-- Para virar administrador, rode uma vez no SQL Editor (com o e-mail da conta):
--   insert into administradores (usuario_id)
--   select id from auth.users where email = 'seu-email@exemplo.com';

-- ---------------------------------------------------------------------------
-- Quem é administrador
-- ---------------------------------------------------------------------------

create table if not exists administradores (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table administradores enable row level security;
-- Sem política: ninguém lê nem escreve pela API; só pelas funções abaixo e pelo SQL Editor.
revoke all on administradores from anon, authenticated;

create or replace function eh_admin()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (select 1 from administradores where usuario_id = (select auth.uid()))
$$;
revoke execute on function eh_admin() from public, anon;
grant execute on function eh_admin() to authenticated;

create or replace function exigir_admin()
returns void
language plpgsql stable
security definer set search_path = public
as $$
begin
  if not eh_admin() then
    raise exception 'Só o administrador pode fazer isso.';
  end if;
end;
$$;
revoke execute on function exigir_admin() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Registro das ações
-- ---------------------------------------------------------------------------

create table if not exists admin_registros (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users (id) on delete set null,
  acao text not null,
  alvo_tipo text not null check (alvo_tipo in ('conta', 'oferta', 'leilao')),
  alvo_id uuid not null,
  alvo_nome text not null,
  motivo text check (char_length(coalesce(motivo, '')) <= 300),
  criado_em timestamptz not null default now()
);
create index if not exists admin_registros_criado_em on admin_registros (criado_em desc);
alter table admin_registros enable row level security;
revoke all on admin_registros from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Marcas de bloqueio e de retirada
-- ---------------------------------------------------------------------------

alter table empresas add column if not exists bloqueada_em timestamptz;
alter table empresas add column if not exists bloqueio_motivo text;
alter table ofertas add column if not exists removida_em timestamptz;
alter table pedidos add column if not exists removido_em timestamptz;

-- A conta não pode tirar o próprio bloqueio, nem pôr de volta uma oferta retirada
-- (a API deixa cada conta editar as próprias linhas).
create or replace function proteger_marcas_admin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if eh_admin() then
    return new;
  end if;
  if tg_table_name = 'empresas' then
    new.bloqueada_em := old.bloqueada_em;
    new.bloqueio_motivo := old.bloqueio_motivo;
  elsif tg_table_name = 'ofertas' then
    new.removida_em := old.removida_em;
    if new.removida_em is not null and new.ativa then
      raise exception 'Esta oferta foi retirada pelo administrador do Cadê o Preço.';
    end if;
  elsif tg_table_name = 'pedidos' then
    new.removido_em := old.removido_em;
  end if;
  return new;
end;
$$;
revoke execute on function proteger_marcas_admin() from public, anon, authenticated;

drop trigger if exists proteger_marcas_admin on empresas;
create trigger proteger_marcas_admin before update on empresas
  for each row execute function proteger_marcas_admin();
drop trigger if exists proteger_marcas_admin on ofertas;
create trigger proteger_marcas_admin before update on ofertas
  for each row execute function proteger_marcas_admin();
drop trigger if exists proteger_marcas_admin on pedidos;
create trigger proteger_marcas_admin before update on pedidos
  for each row execute function proteger_marcas_admin();

-- Ninguém nasce com as marcas: quem cadastra pela API não escolhe esses campos.
create or replace function limpar_marcas_admin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'empresas' then
    new.bloqueada_em := null;
    new.bloqueio_motivo := null;
  elsif tg_table_name = 'ofertas' then
    new.removida_em := null;
  elsif tg_table_name = 'pedidos' then
    new.removido_em := null;
  end if;
  return new;
end;
$$;
revoke execute on function limpar_marcas_admin() from public, anon, authenticated;

drop trigger if exists limpar_marcas_admin on empresas;
create trigger limpar_marcas_admin before insert on empresas
  for each row execute function limpar_marcas_admin();
drop trigger if exists limpar_marcas_admin on ofertas;
create trigger limpar_marcas_admin before insert on ofertas
  for each row execute function limpar_marcas_admin();
drop trigger if exists limpar_marcas_admin on pedidos;
create trigger limpar_marcas_admin before insert on pedidos
  for each row execute function limpar_marcas_admin();

-- Conta bloqueada não publica nem negocia, mesmo com um login que ainda não venceu.
create or replace function barrar_conta_bloqueada()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (select 1 from empresas where id = (select auth.uid()) and bloqueada_em is not null) then
    raise exception 'Sua conta está bloqueada no Cadê o Preço.';
  end if;
  return new;
end;
$$;
revoke execute on function barrar_conta_bloqueada() from public, anon, authenticated;

drop trigger if exists barrar_conta_bloqueada on ofertas;
create trigger barrar_conta_bloqueada before insert on ofertas
  for each row execute function barrar_conta_bloqueada();
drop trigger if exists barrar_conta_bloqueada on pedidos;
create trigger barrar_conta_bloqueada before insert on pedidos
  for each row execute function barrar_conta_bloqueada();
drop trigger if exists barrar_conta_bloqueada on lances;
create trigger barrar_conta_bloqueada before insert on lances
  for each row execute function barrar_conta_bloqueada();
drop trigger if exists barrar_conta_bloqueada on reservas;
create trigger barrar_conta_bloqueada before insert on reservas
  for each row execute function barrar_conta_bloqueada();
drop trigger if exists barrar_conta_bloqueada on pedido_participantes;
create trigger barrar_conta_bloqueada before insert on pedido_participantes
  for each row execute function barrar_conta_bloqueada();
drop trigger if exists barrar_conta_bloqueada on avaliacoes;
create trigger barrar_conta_bloqueada before insert on avaliacoes
  for each row execute function barrar_conta_bloqueada();

-- O aviso aos participantes de um leilão em grupo diz quem cancelou.
create or replace function avisar_grupo_cancelado()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into avisos (empresa_id, texto, link)
  select pp.comprador_id,
         case when new.removido_em is not null
           then format('O leilão em grupo de %s foi retirado pelo administrador do Cadê o Preço.', new.produto)
           else format('O leilão em grupo de %s foi cancelado por quem criou.', new.produto)
         end,
         '/pedidos/' || new.id
  from pedido_participantes pp
  where pp.pedido_id = new.id;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leitura para a tela /admin
-- ---------------------------------------------------------------------------

create or replace function admin_resumo()
returns jsonb
language plpgsql stable
security definer set search_path = public
as $$
begin
  perform exigir_admin();
  return jsonb_build_object(
    'contas', (select count(*) from empresas),
    'contas_7d', (select count(*) from empresas where criado_em >= now() - interval '7 days'),
    'contas_ativas_7d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '7 days'),
    'bloqueadas', (select count(*) from empresas where bloqueada_em is not null),
    'ofertas_ativas', (select count(*) from ofertas where ativa and valida_ate > now()),
    'ofertas_7d', (select count(*) from ofertas where criado_em >= now() - interval '7 days'),
    'leiloes_abertos', (select count(*) from pedidos where status = 'aberto' and encerra_em > now()),
    'leiloes_7d', (select count(*) from pedidos where criado_em >= now() - interval '7 days'),
    'lances_7d', (select count(*) from lances where criado_em >= now() - interval '7 days'),
    'negocios_30d', (select count(*) from compras where origem <> 'externa' and criado_em >= now() - interval '30 days'),
    'valor_30d', (select coalesce(sum(quantidade * preco_unitario), 0) from compras where origem <> 'externa' and criado_em >= now() - interval '30 days')
  );
end;
$$;

create or replace function admin_contas(busca text default null)
returns table (
  id uuid, nome text, nome_completo text, email text, telefone text, tipo_documento text,
  documento text, cidade text, uf text, criado_em timestamptz, ultimo_acesso timestamptz,
  ofertas bigint, leiloes bigint, negocios bigint, bloqueada_em timestamptz, bloqueio_motivo text,
  administrador boolean
)
language plpgsql stable
security definer set search_path = public
as $$
begin
  perform exigir_admin();
  return query
  select e.id, e.nome, e.nome_completo, u.email::text, e.telefone, e.tipo_documento::text,
         e.documento, e.cidade, e.uf::text, e.criado_em, u.last_sign_in_at,
         (select count(*) from ofertas o where o.fornecedor_id = e.id),
         (select count(*) from pedidos p where p.comprador_id = e.id),
         (select count(*) from compras c where c.origem <> 'externa' and (c.comprador_id = e.id or c.fornecedor_id = e.id)),
         e.bloqueada_em, e.bloqueio_motivo,
         exists (select 1 from administradores a where a.usuario_id = e.id)
  from empresas e
  left join auth.users u on u.id = e.id
  where coalesce(busca, '') = ''
     or e.nome ilike '%' || busca || '%'
     or coalesce(e.nome_completo, '') ilike '%' || busca || '%'
     or coalesce(u.email::text, '') ilike '%' || busca || '%'
     or e.documento like '%' || regexp_replace(busca, '\D', '', 'g') || '%' and regexp_replace(busca, '\D', '', 'g') <> ''
     or e.cidade ilike '%' || busca || '%'
  order by e.criado_em desc
  limit 200;
end;
$$;

create or replace function admin_ofertas(busca text default null)
returns table (
  id uuid, produto text, categoria text, unidade text, preco_unitario numeric,
  quantidade_disponivel numeric, ativa boolean, valida_ate timestamptz, criado_em timestamptz,
  removida_em timestamptz, fornecedor_id uuid, fornecedor_nome text, cidade text, uf text
)
language plpgsql stable
security definer set search_path = public
as $$
begin
  perform exigir_admin();
  return query
  select o.id, o.produto, o.categoria::text, o.unidade::text, o.preco_unitario,
         o.quantidade_disponivel, o.ativa, o.valida_ate, o.criado_em,
         o.removida_em, e.id, e.nome, e.cidade, e.uf::text
  from ofertas o
  join empresas e on e.id = o.fornecedor_id
  where coalesce(busca, '') = ''
     or o.produto ilike '%' || busca || '%'
     or e.nome ilike '%' || busca || '%'
  order by o.criado_em desc
  limit 200;
end;
$$;

create or replace function admin_leiloes(busca text default null)
returns table (
  id uuid, produto text, categoria text, unidade text, quantidade numeric,
  status text, encerra_em timestamptz, criado_em timestamptz, removido_em timestamptz,
  lances bigint, comprador_id uuid, comprador_nome text, cidade text, uf text
)
language plpgsql stable
security definer set search_path = public
as $$
begin
  perform exigir_admin();
  return query
  select p.id, p.produto, p.categoria::text, p.unidade::text, p.quantidade,
         p.status::text, p.encerra_em, p.criado_em, p.removido_em,
         (select count(*) from lances l where l.pedido_id = p.id),
         e.id, e.nome, e.cidade, e.uf::text
  from pedidos p
  join empresas e on e.id = p.comprador_id
  where coalesce(busca, '') = ''
     or p.produto ilike '%' || busca || '%'
     or e.nome ilike '%' || busca || '%'
  order by p.criado_em desc
  limit 200;
end;
$$;

create or replace function admin_ver_registros()
returns table (acao text, alvo_tipo text, alvo_id uuid, alvo_nome text, motivo text, criado_em timestamptz)
language plpgsql stable
security definer set search_path = public
as $$
begin
  perform exigir_admin();
  return query
  select r.acao, r.alvo_tipo, r.alvo_id, r.alvo_nome, r.motivo, r.criado_em
  from admin_registros r
  order by r.criado_em desc
  limit 100;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ações
-- ---------------------------------------------------------------------------

create or replace function admin_registrar(p_acao text, p_tipo text, p_id uuid, p_nome text, p_motivo text)
returns void
language sql
security definer set search_path = public
as $$
  insert into admin_registros (admin_id, acao, alvo_tipo, alvo_id, alvo_nome, motivo)
  values ((select auth.uid()), p_acao, p_tipo, p_id, p_nome, nullif(trim(left(coalesce(p_motivo, ''), 300)), ''))
$$;
revoke execute on function admin_registrar(text, text, uuid, text, text) from public, anon, authenticated;

create or replace function admin_bloquear_conta(conta uuid, motivo text default null)
returns void
language plpgsql
security definer set search_path = public, auth
as $$
declare
  v_nome text;
begin
  perform exigir_admin();
  if conta = (select auth.uid()) then
    raise exception 'Você não pode bloquear a própria conta.';
  end if;
  if exists (select 1 from administradores where usuario_id = conta) then
    raise exception 'Não dá para bloquear outro administrador.';
  end if;
  update empresas set bloqueada_em = now(), bloqueio_motivo = nullif(trim(left(coalesce(motivo, ''), 300)), '')
  where id = conta and bloqueada_em is null
  returning nome into v_nome;
  if v_nome is null then
    raise exception 'Conta não encontrada ou já bloqueada.';
  end if;
  -- Some da vitrine e dos leilões de quem compra.
  update ofertas set ativa = false where fornecedor_id = conta and ativa;
  update pedidos set status = 'cancelado', removido_em = now() where comprador_id = conta and status = 'aberto';
  -- Não entra mais (o login atual cai quando vencer, em até 1 hora).
  update auth.users set banned_until = now() + interval '100 years' where id = conta;
  delete from auth.sessions where user_id = conta;
  perform admin_registrar('bloqueou', 'conta', conta, v_nome, motivo);
end;
$$;

create or replace function admin_desbloquear_conta(conta uuid)
returns void
language plpgsql
security definer set search_path = public, auth
as $$
declare
  v_nome text;
begin
  perform exigir_admin();
  update empresas set bloqueada_em = null, bloqueio_motivo = null
  where id = conta and bloqueada_em is not null
  returning nome into v_nome;
  if v_nome is null then
    raise exception 'Conta não encontrada ou não está bloqueada.';
  end if;
  update auth.users set banned_until = null where id = conta;
  insert into avisos (empresa_id, texto, link)
  values (conta, 'Sua conta foi desbloqueada. Suas ofertas continuam pausadas: abra Minhas ofertas para publicar de novo.', '/ofertas');
  perform admin_registrar('desbloqueou', 'conta', conta, v_nome, null);
end;
$$;

create or replace function admin_tirar_oferta(oferta uuid, motivo text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_produto text;
  v_dono uuid;
begin
  perform exigir_admin();
  update ofertas set ativa = false, removida_em = now()
  where id = oferta and removida_em is null
  returning produto, fornecedor_id into v_produto, v_dono;
  if v_produto is null then
    raise exception 'Oferta não encontrada ou já retirada.';
  end if;
  insert into avisos (empresa_id, texto, link)
  values (v_dono, format('Sua oferta de %s foi retirada da vitrine pelo administrador do Cadê o Preço.%s', v_produto,
                         coalesce(' Motivo: ' || nullif(trim(left(coalesce(motivo, ''), 300)), ''), '')), '/ofertas');
  perform admin_registrar('tirou do ar', 'oferta', oferta, v_produto, motivo);
end;
$$;

create or replace function admin_devolver_oferta(oferta uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_produto text;
  v_dono uuid;
begin
  perform exigir_admin();
  update ofertas set removida_em = null
  where id = oferta and removida_em is not null
  returning produto, fornecedor_id into v_produto, v_dono;
  if v_produto is null then
    raise exception 'Oferta não encontrada ou não está retirada.';
  end if;
  insert into avisos (empresa_id, texto, link)
  values (v_dono, format('Sua oferta de %s foi liberada. Ela continua pausada: abra Minhas ofertas para publicar de novo.', v_produto), '/ofertas');
  perform admin_registrar('liberou', 'oferta', oferta, v_produto, null);
end;
$$;

create or replace function admin_tirar_leilao(leilao uuid, motivo text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_produto text;
  v_dono uuid;
begin
  perform exigir_admin();
  update pedidos set status = 'cancelado', removido_em = now()
  where id = leilao and status = 'aberto'
  returning produto, comprador_id into v_produto, v_dono;
  if v_produto is null then
    raise exception 'Só dá para tirar do ar um leilão aberto.';
  end if;
  insert into avisos (empresa_id, texto, link)
  values (v_dono, format('Seu leilão de %s foi retirado pelo administrador do Cadê o Preço.%s', v_produto,
                         coalesce(' Motivo: ' || nullif(trim(left(coalesce(motivo, ''), 300)), ''), '')), '/pedidos/' || leilao);
  perform admin_registrar('tirou do ar', 'leilao', leilao, v_produto, motivo);
end;
$$;

-- Só usuários logados chamam; cada função ainda confere se é administrador.
revoke execute on function admin_resumo(), admin_contas(text), admin_ofertas(text), admin_leiloes(text),
  admin_ver_registros(), admin_bloquear_conta(uuid, text), admin_desbloquear_conta(uuid),
  admin_tirar_oferta(uuid, text), admin_devolver_oferta(uuid), admin_tirar_leilao(uuid, text)
  from public, anon;
grant execute on function admin_resumo(), admin_contas(text), admin_ofertas(text), admin_leiloes(text),
  admin_ver_registros(), admin_bloquear_conta(uuid, text), admin_desbloquear_conta(uuid),
  admin_tirar_oferta(uuid, text), admin_devolver_oferta(uuid), admin_tirar_leilao(uuid, text)
  to authenticated;

notify pgrst, 'reload schema';
