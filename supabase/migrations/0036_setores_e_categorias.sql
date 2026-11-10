-- Setores: Armazém (as categorias de alimentos de sempre) e Embalagens e limpeza.
-- O setor é só um agrupamento na tela (src/lib/dominio.ts); no banco entram as
-- categorias novas e as unidades que esse setor usa. Nada do que já existe muda.
alter type categoria_alimento add value if not exists 'embalagens';
alter type categoria_alimento add value if not exists 'limpeza';
alter type categoria_alimento add value if not exists 'higiene';

alter type unidade_medida add value if not exists 'pacote';
alter type unidade_medida add value if not exists 'caixa';
alter type unidade_medida add value if not exists 'fardo';

notify pgrst, 'reload schema';
