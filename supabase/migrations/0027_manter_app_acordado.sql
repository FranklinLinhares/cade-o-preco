-- Mantém o app "acordado": a cada 5 minutos o banco chama /api/aquecer no app
-- publicado. Assim a primeira tela depois de um tempo parado não espera o servidor
-- da Vercel e o banco acordarem (eram de 5 a 8 s; com tudo acordado, menos de 1 s).
-- Só onde existe pg_cron (o Supabase); nos testes locais o bloco é pulado.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    -- Recria a tarefa se a migração rodar de novo.
    perform cron.unschedule(jobid) from cron.job where jobname = 'manter-app-acordado';
    perform cron.schedule(
      'manter-app-acordado',
      '*/5 * * * *',
      $job$select net.http_get(url := 'https://cade-o-preco.vercel.app/api/aquecer', timeout_milliseconds := 10000)$job$
    );
  end if;
end
$$;
