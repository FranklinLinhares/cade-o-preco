-- Alerta de segurança do Supabase ("Function Search Path Mutable"): as duas
-- funções que conferem CPF/CNPJ passam a usar um search_path fixo, como as demais.
alter function public.digito_verificador(text, int[]) set search_path = public;
alter function public.documento_confere(text, boolean) set search_path = public;
