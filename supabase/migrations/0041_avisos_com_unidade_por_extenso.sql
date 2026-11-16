-- Cadê o Preço: os avisos do sino e do celular escreviam a unidade como código
-- ("3 duzia", "5 un", "R$ 2,00 por l"). Agora saem por extenso, como nas telas:
-- "3 dúzias", "5 unidades", "R$ 2,00 por litro".
--
-- Em vez de mexer nas 13 funções que escrevem avisos, um gatilho ajusta o texto
-- antes de gravar (e antes de ir para o celular, que lê o aviso já gravado).

create or replace function unidades_por_extenso(texto text)
returns text
language plpgsql immutable
set search_path = public
as $$
declare
  u record;
begin
  for u in
    select * from (values
      ('l', 'litro', 'litros'),
      ('un', 'unidade', 'unidades'),
      ('duzia', 'dúzia', 'dúzias'),
      ('pacote', 'pacote', 'pacotes'),
      ('caixa', 'caixa', 'caixas'),
      ('fardo', 'fardo', 'fardos')
    ) as t (codigo, singular, plural)
  loop
    -- 0 a 1,99: singular ("1 dúzia", "1,5 litro"); o resto, plural ("3 dúzias").
    texto := regexp_replace(texto, '\m([01](,\d+)?) ' || u.codigo || '\M', '\1 ' || u.singular, 'g');
    texto := regexp_replace(texto, '\m(\d+(,\d+)?) ' || u.codigo || '\M', '\1 ' || u.plural, 'g');
    -- Preço: "R$ 2,00 por l" -> "R$ 2,00 por litro".
    texto := regexp_replace(texto, '\mpor ' || u.codigo || '\M', 'por ' || u.singular, 'g');
  end loop;
  return texto;
end;
$$;

create or replace function avisos_unidade_por_extenso()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.texto := unidades_por_extenso(new.texto);
  return new;
end;
$$;
revoke execute on function avisos_unidade_por_extenso() from public, anon, authenticated;

drop trigger if exists avisos_unidade_por_extenso on avisos;
create trigger avisos_unidade_por_extenso before insert on avisos
  for each row execute function avisos_unidade_por_extenso();

-- Os avisos que já estão no sino também.
update avisos set texto = unidades_por_extenso(texto) where texto <> unidades_por_extenso(texto);
