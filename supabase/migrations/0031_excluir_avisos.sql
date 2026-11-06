-- Cadê o Preço: cada conta pode excluir os próprios avisos do sino.
-- Antes só dava para marcar como lido, e os avisos ficavam acumulando.

grant delete on avisos to authenticated;

drop policy if exists "cada conta exclui os próprios avisos" on avisos;
create policy "cada conta exclui os próprios avisos" on avisos
  for delete to authenticated using (empresa_id = (select auth.uid()));
