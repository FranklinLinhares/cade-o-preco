import Link from "next/link";
import { exigirEmpresa } from "@/lib/sessao";
import { buscarContatos, buscarContatosManuais, type Contato, type ContatoManual, type TipoContato } from "@/lib/contatos";
import { adicionarContato, removerContato, removerContatoManual } from "./acoes";
import { NovoContato } from "./NovoContato";

// Meus contatos: fornecedores e clientes de confiança, para convidar em leilões e ofertas.
export default async function MeusContatos({ searchParams }: PageProps<"/contatos">) {
  const { q } = await searchParams;
  const termo = typeof q === "string" ? q.trim() : "";
  const { supabase, empresa } = await exigirEmpresa();

  const [fornecedores, clientes, fornecedoresManuais, clientesManuais] = await Promise.all([
    buscarContatos(supabase, empresa.id, "fornecedor"),
    buscarContatos(supabase, empresa.id, "cliente"),
    buscarContatosManuais(supabase, empresa.id, "fornecedor"),
    buscarContatosManuais(supabase, empresa.id, "cliente"),
  ]);
  const { data } = termo ? await supabase.rpc("encontrar_empresas", { termo }) : { data: null };
  const encontrados = (data ?? []) as Contato[];
  const ids = { fornecedor: new Set(fornecedores.map((c) => c.id)), cliente: new Set(clientes.map((c) => c.id)) };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Meus contatos</h1>
        <p className="text-sm text-stone-600">
          Salve os fornecedores e clientes com quem você já negocia. Ao criar um leilão ou uma oferta, você escolhe se fica aberto para todos ou só para eles.
        </p>
      </div>

      <section className="cartao space-y-3">
        <h2 className="font-semibold">Buscar quem já usa o app</h2>
        <form className="flex flex-wrap gap-2">
          <input name="q" defaultValue={termo} placeholder="Nome, CPF ou CNPJ de quem já usa o app" className="campo min-w-48 flex-1" />
          <button className="botao">Buscar</button>
        </form>
        {termo && encontrados.length === 0 && (
          <p className="text-sm text-stone-600">Ninguém encontrado com conta no Cadê o Preço. Cadastre a pessoa abaixo.</p>
        )}
        <ul className="divide-y divide-stone-100">
          {encontrados.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Nome contato={c} />
              <div className="flex gap-2">
                {(["fornecedor", "cliente"] as const).map((tipo) =>
                  ids[tipo].has(c.id) ? (
                    <span key={tipo} className="rounded-full bg-green-50 px-3 py-1 text-sm text-green-800">É seu {tipo}</span>
                  ) : (
                    <form key={tipo} action={adicionarContato}>
                      <input type="hidden" name="contato" value={c.id} />
                      <input type="hidden" name="tipo" value={tipo} />
                      <button className="botao-secundario py-1 text-sm">+ {tipo === "fornecedor" ? "Fornecedor" : "Cliente"}</button>
                    </form>
                  ),
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <details className="cartao group space-y-3" open={fornecedores.length + clientes.length + fornecedoresManuais.length + clientesManuais.length === 0}>
        <summary className="cursor-pointer list-none font-semibold">
          <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden>▸</span>
          Cadastrar contato
        </summary>
        <p className="text-sm text-stone-600">Para quem ainda não tem conta no app. Se o CPF/CNPJ já for de uma conta, ela entra nos seus contatos e pode ser convidada para leilões e ofertas.</p>
        <NovoContato />
      </details>

      <Lista titulo="Fornecedores" vazio="Nenhum fornecedor salvo." tipo="fornecedor" contatos={fornecedores} manuais={fornecedoresManuais} />
      <Lista titulo="Clientes" vazio="Nenhum cliente salvo." tipo="cliente" contatos={clientes} manuais={clientesManuais} />
    </div>
  );
}

function Nome({ contato }: { contato: Contato }) {
  return (
    <div>
      <Link href={`/perfil/${contato.id}`} className="font-medium hover:underline">{contato.nome}</Link>
      <span className="ml-2 text-sm text-stone-500">
        {contato.cidade}/{contato.uf} · {contato.pessoa_juridica ? "Empresa" : "Pessoa física"}
      </span>
    </div>
  );
}

function Lista({ titulo, vazio, tipo, contatos, manuais }: { titulo: string; vazio: string; tipo: TipoContato; contatos: Contato[]; manuais: ContatoManual[] }) {
  return (
    <section className="cartao space-y-2">
      <h2 className="font-semibold">{titulo} ({contatos.length + manuais.length})</h2>
      {contatos.length + manuais.length === 0 && <p className="text-sm text-stone-500">{vazio}</p>}
      <ul className="divide-y divide-stone-100">
        {contatos.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <Nome contato={c} />
            <form action={removerContato}>
              <input type="hidden" name="contato" value={c.id} />
              <input type="hidden" name="tipo" value={tipo} />
              <button className="text-sm text-red-700 hover:underline">Remover</button>
            </form>
          </li>
        ))}
        {manuais.map((c) => (
          <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
            <div className="space-y-0.5">
              <div>
                <span className="font-medium">{c.nome}</span>
                <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">Ainda sem conta no app</span>
              </div>
              <div className="flex flex-wrap gap-x-3 text-sm text-stone-600">
                {c.telefone && (
                  <a href={`https://wa.me/${c.telefone.length <= 11 ? "55" : ""}${c.telefone}`} target="_blank" rel="noopener noreferrer" className="text-green-800 hover:underline">
                    WhatsApp {c.telefone}
                  </a>
                )}
                {c.email && <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>}
                {c.documento && <span>{c.documento.length === 14 ? "CNPJ" : "CPF"} {c.documento}</span>}
                {c.cidade && <span>{c.cidade}{c.uf ? `/${c.uf}` : ""}</span>}
              </div>
              {c.observacao && <p className="text-sm text-stone-500">{c.observacao}</p>}
            </div>
            <form action={removerContatoManual}>
              <input type="hidden" name="id" value={c.id} />
              <button className="text-sm text-red-700 hover:underline">Remover</button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
