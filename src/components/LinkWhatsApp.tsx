// Link para conversar pelo WhatsApp; sem telefone cadastrado não mostra um link quebrado.
export function LinkWhatsApp({ telefone, className = "underline" }: { telefone?: string | null; className?: string }) {
  if (!telefone) return <span className="text-stone-400">sem WhatsApp cadastrado</span>;
  return (
    <a href={`https://wa.me/55${telefone}`} target="_blank" rel="noreferrer" className={className}>
      WhatsApp
    </a>
  );
}
