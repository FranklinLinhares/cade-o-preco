import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirEmpresa } from "@/lib/sessao";
import { dataHora, porUnidade, reais, type Unidade, quantidade } from "@/lib/dominio";
import { BotaoConfirmar } from "@/components/BotaoConfirmar";
import { bloquearConta, desbloquearConta, devolverOferta, tirarLeilao, tirarOferta } from "./acoes";

type Resumo = {
  contas: number;
  contas_7d: number;
  contas_ativas_7d: number;
  bloqueadas: number;
  ofertas_ativas: number;
  ofertas_7d: number;
  leiloes_abertos: number;
  leiloes_7d: number;
  lances_7d: number;
  negocios_30d: number;
  valor_30d: number;
};
type Conta = {
  id: string;
  nome: string;
  nome_completo: string | null;
  email: string | null;
  telefone: string;
  tipo_documento: string;
  documento: string;
  cidade: string;
  uf: string;
  criado_em: string;
  ultimo_acesso: string | null;
  ofertas: number;
  leiloes: number;
  negocios: number;
  bloqueada_em: string | null;
  bloqueio_motivo: string | null;
  administrador: boolean;
};
type Oferta = {
  id: string;
  produto: string;
  unidade: Unidade;
  preco_unitario: number;
  quantidade_disponivel: number;
  ativa: boolean;
  valida_ate: string;
  criado_em: string;
  removida_em: string | null;
  fornecedor_id: string;
  fornecedor_nome: string;
  cidade: string;
  uf: string;
};
type Leilao = {
  id: string;
  produto: string;
  unidade: Unidade;
  quantidade: number;
  status: string;
  encerra_em: string;
  criado_em: string;
  removido_em: string | null;
  lances: number;
  comprador_id: string;
  comprador_nome: string;
  cidade: string;
  uf: string;
};
type Registro = { acao: string; alvo_tipo: string; alvo_id: string; alvo_nome: string; motivo: string | null; criado_em: string };

const ABAS = { contas: "Contas", ofertas: "Ofertas", leiloes: "Leilões", registro: "Registro" } as const;
type Aba = keyof typeof ABAS;

const TIPO_ALVO: Record<string, string> = { conta: "Conta", oferta: "Oferta", leilao: "Leilão" };

function documentoFormatado(doc: string) {
  if (doc.startsWith("000")) return "sem documento (teste)";
  if (doc.length === 14) return doc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (doc.length === 11) return doc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return doc;
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string | number; detalhe?: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-2.5">
      <p className="text-xs text-stone-500">{rotulo}</p>
      <p className="text-2xl font-bold tabular-nums">{valor}</p>
      {detalhe && <p className="text-xs text-stone-500">{detalhe}</p>}
    </div>
  );
}

// Formulário de uma ação com motivo opcional, que pergunta antes de enviar.
function AcaoComMotivo({ acao, id, rotulo, pergunta }: { acao: (form: FormData) => Promise<void>; id: string; rotulo: string; pergunta: string }) {
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="motivo" maxLength={300} placeholder="Motivo (opcional, a pessoa vê)" className="campo min-w-0 flex-1 py-1 text-sm" />
      <BotaoConfirmar pergunta={pergunta} className="botao-secundario py-1 text-sm text-red-700">
        {rotulo}
      </BotaoConfirmar>
    </form>
  );
}

// Área do administrador: números do app, contas, ofertas e leilões.
// Só abre para quem está na tabela administradores; para os outros, a página não existe.
export default async function Admin({ searchParams }: PageProps<"/admin">) {
  const params = await searchParams;
  const aba: Aba = typeof params.aba === "string" && params.aba in ABAS ? (params.aba as Aba) : "contas";
  const busca = typeof params.busca === "string" ? params.busca.trim().slice(0, 100) : "";

  const { supabase } = await exigirEmpresa();
  const { data: admin } = await supabase.rpc("eh_admin");
  if (!admin) notFound();

  const [{ data: resumo }, lista] = await Promise.all([
    supabase.rpc("admin_resumo").returns<Resumo>(),
    aba === "contas"
      ? supabase.rpc("admin_contas", { busca: busca || null })
      : aba === "ofertas"
        ? supabase.rpc("admin_ofertas", { busca: busca || null })
        : aba === "leiloes"
          ? supabase.rpc("admin_leiloes", { busca: busca || null })
          : supabase.rpc("admin_ver_registros"),
  ]);
  const itens = (lista.data ?? []) as unknown[];
  const r = resumo as Resumo | null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Área do administrador</h1>
        <p className="text-sm text-stone-600">Só você vê esta página. Toda ação fica no Registro e a conta afetada recebe um aviso.</p>
      </div>

      {r && (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Numero rotulo="Contas" valor={r.contas} detalhe={`${r.contas_7d} novas em 7 dias`} />
          <Numero rotulo="Entraram em 7 dias" valor={r.contas_ativas_7d} detalhe={r.bloqueadas ? `${r.bloqueadas} bloqueada(s)` : "nenhuma bloqueada"} />
          <Numero rotulo="Ofertas no ar" valor={r.ofertas_ativas} detalhe={`${r.ofertas_7d} criadas em 7 dias`} />
          <Numero rotulo="Leilões abertos" valor={r.leiloes_abertos} detalhe={`${r.leiloes_7d} criados em 7 dias`} />
          <Numero rotulo="Lances em 7 dias" valor={r.lances_7d} />
          <Numero rotulo="Negócios em 30 dias" valor={r.negocios_30d} detalhe={reais(r.valor_30d)} />
        </section>
      )}

      <nav className="flex flex-wrap gap-1 border-b border-stone-200">
        {(Object.keys(ABAS) as Aba[]).map((a) => (
          <Link
            key={a}
            href={`/admin?aba=${a}`}
            aria-current={a === aba ? "page" : undefined}
            className="-mb-px rounded-t-lg border border-transparent px-3 py-2 text-sm font-medium text-stone-600 hover:text-green-800 aria-[current=page]:border-stone-200 aria-[current=page]:border-b-white aria-[current=page]:bg-white aria-[current=page]:text-green-800"
          >
            {ABAS[a]}
          </Link>
        ))}
      </nav>

      {aba !== "registro" && (
        <form className="flex gap-2" action="/admin">
          <input type="hidden" name="aba" value={aba} />
          <input
            name="busca"
            defaultValue={busca}
            placeholder={aba === "contas" ? "Buscar por nome, e-mail, CPF/CNPJ ou cidade" : aba === "ofertas" ? "Buscar por produto ou vendedor" : "Buscar por produto ou comprador"}
            className="campo flex-1"
          />
          <button className="botao">Buscar</button>
        </form>
      )}

      {lista.error && <p className="erro">Não foi possível carregar a lista agora. Atualize a página.</p>}
      {!lista.error && itens.length === 0 && <p className="cartao text-stone-600">{busca ? "Nada encontrado com essa busca." : "Nada por aqui ainda."}</p>}
      {itens.length === 200 && <p className="text-sm text-stone-500">Mostrando os 200 mais recentes. Use a busca para achar outros.</p>}

      {aba === "contas" && (
        <ul className="space-y-3">
          {(itens as Conta[]).map((c) => (
            <li key={c.id} className={`cartao space-y-2 ${c.bloqueada_em ? "border-red-200 bg-red-50/50" : ""}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <Link href={`/perfil/${c.id}`} className="font-semibold hover:underline">
                  {c.nome}
                  {c.nome_completo && c.nome_completo !== c.nome && <span className="font-normal text-stone-500"> ({c.nome_completo})</span>}
                </Link>
                <span className="text-xs text-stone-500">desde {dataHora(c.criado_em)}</span>
              </div>
              <p className="text-sm break-words text-stone-600">
                {c.tipo_documento === "cnpj" ? "CNPJ" : "CPF"} {documentoFormatado(c.documento)} · {c.cidade}/{c.uf}
                <br />
                {c.email ?? "sem e-mail"} · {c.telefone}
              </p>
              <p className="text-sm text-stone-600">
                {c.ofertas} oferta(s) · {c.leiloes} leilão(ões) · {c.negocios} negócio(s) · último acesso {c.ultimo_acesso ? dataHora(c.ultimo_acesso) : "nunca"}
              </p>
              {c.administrador ? (
                <p className="text-sm font-medium text-green-800">Administrador</p>
              ) : c.bloqueada_em ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-red-800">
                    Bloqueada em {dataHora(c.bloqueada_em)}
                    {c.bloqueio_motivo && `: ${c.bloqueio_motivo}`}
                  </p>
                  <form action={desbloquearConta}>
                    <input type="hidden" name="id" value={c.id} />
                    <BotaoConfirmar pergunta={`Desbloquear ${c.nome}? A conta volta a entrar no app.`} className="botao-secundario py-1 text-sm">
                      Desbloquear
                    </BotaoConfirmar>
                  </form>
                </div>
              ) : (
                <AcaoComMotivo
                  acao={bloquearConta}
                  id={c.id}
                  rotulo="Bloquear"
                  pergunta={`Bloquear ${c.nome}? A conta não entra mais, as ofertas saem da vitrine e os leilões abertos são cancelados (esses não voltam).`}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {aba === "ofertas" && (
        <ul className="space-y-3">
          {(itens as Oferta[]).map((o) => {
            const noAr = o.ativa && new Date(o.valida_ate) > new Date();
            return (
              <li key={o.id} className={`cartao space-y-2 ${o.removida_em ? "border-red-200 bg-red-50/50" : ""}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <Link href={`/vitrine/${o.id}`} className="font-semibold hover:underline">{o.produto}</Link>
                  <span className="text-sm font-medium">{porUnidade(o.preco_unitario, o.unidade)}</span>
                </div>
                <p className="text-sm text-stone-600">
                  <Link href={`/perfil/${o.fornecedor_id}`} className="underline">{o.fornecedor_nome}</Link> · {o.cidade}/{o.uf} · criada {dataHora(o.criado_em)} ·{" "}
                  {o.removida_em ? <span className="text-red-800">retirada em {dataHora(o.removida_em)}</span> : noAr ? <span className="text-green-800">no ar</span> : "pausada ou vencida"}
                </p>
                {o.removida_em ? (
                  <form action={devolverOferta}>
                    <input type="hidden" name="id" value={o.id} />
                    <BotaoConfirmar pergunta="Liberar esta oferta? Ela continua pausada até quem vende publicar de novo." className="botao-secundario py-1 text-sm">
                      Liberar
                    </BotaoConfirmar>
                  </form>
                ) : (
                  <AcaoComMotivo acao={tirarOferta} id={o.id} rotulo="Tirar do ar" pergunta={`Tirar "${o.produto}" da vitrine? Quem vende não consegue publicar de novo até você liberar.`} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {aba === "leiloes" && (
        <ul className="space-y-3">
          {(itens as Leilao[]).map((l) => {
            const aberto = l.status === "aberto";
            return (
              <li key={l.id} className={`cartao space-y-2 ${l.removido_em ? "border-red-200 bg-red-50/50" : ""}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <Link href={`/pedidos/${l.id}`} className="font-semibold hover:underline">{l.produto}</Link>
                  <span className="text-sm">{quantidade(l.quantidade, l.unidade)} · {l.lances} lance(s)</span>
                </div>
                <p className="text-sm text-stone-600">
                  <Link href={`/perfil/${l.comprador_id}`} className="underline">{l.comprador_nome}</Link> · {l.cidade}/{l.uf} · criado {dataHora(l.criado_em)} ·{" "}
                  {l.removido_em ? (
                    <span className="text-red-800">retirado em {dataHora(l.removido_em)}</span>
                  ) : aberto ? (
                    <span className="text-green-800">aberto até {dataHora(l.encerra_em)}</span>
                  ) : (
                    l.status
                  )}
                </p>
                {aberto && <AcaoComMotivo acao={tirarLeilao} id={l.id} rotulo="Tirar do ar" pergunta={`Tirar o leilão de "${l.produto}" do ar? Ele é cancelado e não dá para desfazer.`} />}
              </li>
            );
          })}
        </ul>
      )}

      {aba === "registro" && itens.length > 0 && (
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
          {(itens as Registro[]).map((g, i) => (
            <li key={i} className="px-3 py-2.5 text-sm">
              <span className="font-medium">{TIPO_ALVO[g.alvo_tipo] ?? g.alvo_tipo}</span> {g.alvo_nome}: {g.acao}
              {g.motivo && <span className="text-stone-600"> ({g.motivo})</span>}
              <span className="block text-xs text-stone-500">{dataHora(g.criado_em)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
