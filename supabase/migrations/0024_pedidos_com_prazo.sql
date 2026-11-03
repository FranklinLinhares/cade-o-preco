-- Pedidos da vitrine com prazo, aviso quando o comprador desiste e datas no
-- horário de Fortaleza.

-- 1. Pedido sem resposta em 2 dias expira e devolve a quantidade à oferta,
--    para um pedido esquecido não prender o estoque para sempre.
alter table reservas drop constraint if exists reservas_situacao_check;
alter table reservas add constraint reservas_situacao_check
  check (situacao in ('aguardando', 'aceita', 'recusada', 'cancelada', 'expirada'));

-- Chamada pelo app antes de mostrar a vitrine e os negócios; não precisa de agendador.
create or replace function expirar_reservas()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_reserva reservas;
  v_total integer := 0;
begin
  for v_reserva in
    select * from reservas
    where situacao = 'aguardando' and criado_em < now() - interval '2 days'
    for update skip locked
  loop
    perform devolver_estoque(v_reserva);
    update reservas set situacao = 'expirada', respondido_em = now() where id = v_reserva.id;
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;
revoke execute on function expirar_reservas() from public, anon;
grant execute on function expirar_reservas() to authenticated;

-- 2. Avisos do pedido: agora também quando o comprador desiste e quando expira.
create or replace function avisar_reserva()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into avisos (empresa_id, texto, link)
    select new.fornecedor_id, format('%s quer comprar %s %s de %s. Aceite ou recuse.', c.nome, br_numero(new.quantidade), new.unidade, new.produto),
           '/negocios'
    from empresas c where c.id = new.comprador_id;
  elsif old.situacao = 'aguardando' and new.situacao in ('aceita', 'recusada') then
    insert into avisos (empresa_id, texto, link)
    select new.comprador_id,
           case new.situacao
             when 'aceita' then format('%s aceitou seu pedido de %s. Combine a entrega pelo WhatsApp.', f.nome, new.produto)
             else format('%s recusou seu pedido de %s.', f.nome, new.produto)
           end,
           '/negocios'
    from empresas f where f.id = new.fornecedor_id;
  elsif old.situacao = 'aguardando' and new.situacao = 'cancelada' then
    insert into avisos (empresa_id, texto, link)
    select new.fornecedor_id, format('%s desistiu do pedido de %s. A quantidade voltou para a sua oferta.', c.nome, new.produto), '/ofertas'
    from empresas c where c.id = new.comprador_id;
  elsif old.situacao = 'aguardando' and new.situacao = 'expirada' then
    insert into avisos (empresa_id, texto, link)
    select new.comprador_id, format('%s não respondeu em 2 dias ao seu pedido de %s, e ele foi cancelado.', f.nome, new.produto), '/vitrine'
    from empresas f where f.id = new.fornecedor_id;
    insert into avisos (empresa_id, texto, link)
    select new.fornecedor_id, format('O pedido de %s de %s expirou sem resposta. A quantidade voltou para a sua oferta.', c.nome, new.produto), '/ofertas'
    from empresas c where c.id = new.comprador_id;
  end if;
  return new;
end;
$$;
revoke execute on function avisar_reserva() from public, anon, authenticated;

-- 3. "Hoje" no horário do Brasil: uma compra às 22h não cai no dia seguinte
--    no histórico semanal, e o limite diário da IA vira à meia-noite daqui.
alter table compras alter column data set default (now() at time zone 'America/Fortaleza')::date;
alter table uso_ia alter column dia set default (now() at time zone 'America/Fortaleza')::date;

notify pgrst, 'reload schema';
