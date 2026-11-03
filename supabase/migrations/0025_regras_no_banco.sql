-- As regras que a tela confere passam a valer também no banco, para quem chama
-- a API direto: documento, localização, tamanho dos textos, convidados e o
-- endereço de notificação do celular.

-- 1. CPF/CNPJ conferido pelos dígitos e travado depois de cadastrado.
--    Documentos de teste (começam com 000, modo de testes) continuam aceitos e
--    podem ser trocados por um documento de verdade.
create or replace function digito_verificador(numeros text, pesos int[])
returns int
language sql immutable
as $$
  select case when s % 11 < 2 then 0 else 11 - s % 11 end
  from (select sum(substr(numeros, i, 1)::int * pesos[i]) s from generate_subscripts(pesos, 1) i) t
$$;

create or replace function documento_confere(doc text, cnpj boolean)
returns boolean
language sql immutable
as $$
  select case
    when doc like '000%' then true
    when doc !~ '^\d+$' or doc ~ '^(\d)\1+$' then false
    when cnpj then length(doc) = 14
      and digito_verificador(doc, array[5,4,3,2,9,8,7,6,5,4,3,2]) = substr(doc, 13, 1)::int
      and digito_verificador(doc, array[6,5,4,3,2,9,8,7,6,5,4,3,2]) = substr(doc, 14, 1)::int
    else length(doc) = 11
      and digito_verificador(doc, array[10,9,8,7,6,5,4,3,2]) = substr(doc, 10, 1)::int
      and digito_verificador(doc, array[11,10,9,8,7,6,5,4,3,2]) = substr(doc, 11, 1)::int
  end
$$;

create or replace function conferir_empresa()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cnpj boolean := new.tipo_documento::text = 'cnpj';
begin
  if tg_op = 'UPDATE' and old.documento not like '000%'
     and (new.documento <> old.documento or v_cnpj <> (old.tipo_documento::text = 'cnpj')) then
    raise exception 'O CPF ou CNPJ não pode ser trocado depois do cadastro.';
  end if;
  if (tg_op = 'INSERT' or new.documento <> old.documento) and not documento_confere(new.documento, v_cnpj) then
    raise exception '% inválido.', case when v_cnpj then 'CNPJ' else 'CPF' end;
  end if;
  -- Agricultor é quem tem CPF com CAF ou inscrição estadual de produtor rural.
  if new.agricultor and new.tipo_documento::text not in ('cpf_caf', 'cpf_ie') then
    new.agricultor := false;
  end if;
  -- Localização guardada só com 2 casas (cerca de 1 km): ninguém descobre o
  -- endereço exato mudando a própria posição e vendo o que aparece.
  new.lat := round(new.lat::numeric, 2);
  new.lng := round(new.lng::numeric, 2);
  return new;
end;
$$;
drop trigger if exists conferir_empresa on empresas;
create trigger conferir_empresa before insert or update on empresas
  for each row execute function conferir_empresa();
revoke execute on function conferir_empresa() from public, anon, authenticated;

update empresas set lat = round(lat::numeric, 2), lng = round(lng::numeric, 2)
where lat <> round(lat::numeric, 2) or lng <> round(lng::numeric, 2);

-- 2. Textos com tamanho de gente: vão para avisos e notificações de outras contas.
alter table pedidos drop constraint if exists pedidos_textos_tamanho;
alter table pedidos add constraint pedidos_textos_tamanho
  check (char_length(produto) <= 120 and char_length(coalesce(especificacoes, '')) <= 1000);
alter table ofertas drop constraint if exists ofertas_textos_tamanho;
alter table ofertas add constraint ofertas_textos_tamanho
  check (char_length(produto) <= 120 and char_length(coalesce(descricao, '')) <= 1000);

-- 3. Convidados só entre os próprios contatos (como na tela), até 200.
create or replace function conferir_convidados()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_dono uuid := (to_jsonb(new) ->> case tg_table_name when 'pedidos' then 'comprador_id' else 'fornecedor_id' end)::uuid;
begin
  if new.convidados is null then
    return new;
  end if;
  if cardinality(new.convidados) > 200 then
    raise exception 'Escolha até 200 convidados.';
  end if;
  if exists (
    select 1 from unnest(new.convidados) c
    where not exists (select 1 from contatos where dono_id = v_dono and contato_id = c)
  ) then
    raise exception 'Convide só quem está nos seus contatos.';
  end if;
  return new;
end;
$$;
revoke execute on function conferir_convidados() from public, anon, authenticated;
drop trigger if exists conferir_convidados on pedidos;
create trigger conferir_convidados before insert or update of convidados on pedidos
  for each row execute function conferir_convidados();
drop trigger if exists conferir_convidados on ofertas;
create trigger conferir_convidados before insert or update of convidados on ofertas
  for each row execute function conferir_convidados();

-- 4. Notificação no celular só para os serviços de push dos navegadores
--    (Google, Mozilla, Apple, Microsoft), não para qualquer endereço.
create or replace function registrar_celular(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or not exists (select 1 from empresas where id = auth.uid()) then
    raise exception 'Entre na sua conta para receber avisos no celular.';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/'
     or length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Este navegador não enviou um endereço de notificação válido.';
  end if;
  insert into push_inscricoes (endpoint, empresa_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set empresa_id = excluded.empresa_id, p256dh = excluded.p256dh, auth = excluded.auth, criado_em = now();
end;
$$;
revoke execute on function registrar_celular(text, text, text) from public, anon;
grant execute on function registrar_celular(text, text, text) to authenticated;

notify pgrst, 'reload schema';
