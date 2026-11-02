-- Lance Certo: pela API, cada conta só muda as colunas que a própria tela muda.
--
-- Antes, a política de "cancelar leilão" só conferia o status final. Quem
-- chamasse a API direto podia cancelar e, na mesma hora, trocar o produto e o
-- lance vencedor; o gatilho avisar_vencedor então mandava "Você venceu o
-- leilão de <texto livre>" para o dono de qualquer lance (golpe pronto).
-- E nos avisos dava para reescrever o texto e o link dos próprios avisos.
--
-- As funções do banco (fechar_pedido, dar_lance...) rodam como dono da tabela
-- e continuam podendo mudar o que precisam.

revoke update on pedidos from anon, authenticated;
grant update (status) on pedidos to authenticated;

revoke update on avisos from anon, authenticated;
grant update (lido) on avisos to authenticated;
