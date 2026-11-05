"use client";

import { useActionState, useState } from "react";
import { criarPedido, type EstadoForm } from "../acoes";
import { AssistenteIA, type ItemIA } from "@/components/AssistenteIA";
import { ReferenciaPreco } from "@/components/ReferenciaPreco";
import { CATEGORIAS, UNIDADES, type ReferenciaPreco as Referencia } from "@/lib/dominio";
import { Girando } from "@/components/Girando";
import { EscolherConvidados } from "@/components/EscolherConvidados";
import type { Contato } from "@/lib/contatos";
import { mensagemDaTela } from "@/lib/erros";

export function FormularioPedido({ produtoInicial, fornecedores }: { produtoInicial: string; fornecedores: Contato[] }) {
  const [estado, acao, enviando] = useActionState<EstadoForm, FormData>(criarPedido, {});
  const [item, setItem] = useState<Partial<ItemIA>>({ produto: produtoInicial, categoria: "hortifruti", unidade: "kg" });
  const [versao, setVersao] = useState(0);
  const [referencia, setReferencia] = useState<Referencia>();
  const [pesquisando, setPesquisando] = useState(false);
  const [erroPesquisa, setErroPesquisa] = useState<string>();
  const [precoMaximo, setPrecoMaximo] = useState("");

  async function pesquisar(form: HTMLFormElement) {
    const dados = new FormData(form);
    setPesquisando(true);
    setErroPesquisa(undefined);
    try {
      const resposta = await fetch("/api/ia/preco", {
        method: "POST",
        body: JSON.stringify({
          produto: dados.get("produto"),
          produto_chave: item.produto_chave,
          especificacoes: dados.get("especificacoes"),
          unidade: dados.get("unidade"),
        }),
      });
      const json = await resposta.json();
      if (!resposta.ok) throw new Error(json.erro);
      setReferencia(json);
      if (json.preco_maximo_sugerido && !precoMaximo) setPrecoMaximo(String(json.preco_maximo_sugerido));
    } catch (e) {
      setErroPesquisa(mensagemDaTela(e));
    } finally {
      setPesquisando(false);
    }
  }

  return (
    <div className="space-y-4">
      <AssistenteIA
        exemplo="Ex.: preciso de 200 kg de tomate italiano maduro, entrega até sexta em João Pessoa"
        aoPreencher={(novo) => {
          setItem(novo);
          setReferencia(undefined);
          setVersao((v) => v + 1);
        }}
      />
      <form key={versao} action={acao} className="cartao space-y-4">
        <input type="hidden" name="produto_chave" value={item.produto_chave ?? ""} />
        <input type="hidden" name="referencia_preco" value={referencia ? JSON.stringify(referencia) : ""} />
        <div>
          <label className="rotulo" htmlFor="produto">Produto</label>
          <input id="produto" name="produto" required maxLength={120} defaultValue={item.produto} className="campo" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div>
            <label className="rotulo" htmlFor="quantidade">Quantidade</label>
            <input id="quantidade" name="quantidade" required inputMode="decimal" defaultValue={item.quantidade ?? ""} className="campo" />
          </div>
          <div>
            <label className="rotulo" htmlFor="unidade">Unidade</label>
            <select id="unidade" name="unidade" defaultValue={item.unidade} className="campo">
              {Object.entries(UNIDADES).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="rotulo" htmlFor="categoria">Categoria</label>
            <select id="categoria" name="categoria" defaultValue={item.categoria} className="campo">
              {Object.entries(CATEGORIAS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="rotulo" htmlFor="especificacoes">Especificações</label>
          <textarea id="especificacoes" name="especificacoes" rows={2} maxLength={1000} defaultValue={item.especificacoes} placeholder="Tipo, classe, corte, embalagem..." className="campo" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="rotulo" htmlFor="entrega_ate">Entregar até</label>
            <input id="entrega_ate" name="entrega_ate" type="date" className="campo" />
          </div>
          <div>
            <label className="rotulo" htmlFor="validade_minima_dias">Validade mínima (dias)</label>
            <input id="validade_minima_dias" name="validade_minima_dias" type="number" min={0} defaultValue={item.validade_minima_dias ?? ""} className="campo" />
          </div>
        </div>

        <div className="space-y-2">
          <button type="button" disabled={pesquisando} onClick={(e) => pesquisar(e.currentTarget.form!)} className="botao-secundario w-full">
            {pesquisando ? <Girando texto="Pesquisando preços na internet..." /> : "Pesquisar preço de mercado com IA"}
          </button>
          {erroPesquisa && <p className="erro">{erroPesquisa}</p>}
          {referencia && <ReferenciaPreco referencia={referencia} />}
        </div>

        <div>
          <label className="rotulo" htmlFor="preco_maximo">Preço máximo por unidade (opcional)</label>
          <input id="preco_maximo" name="preco_maximo" inputMode="decimal" value={precoMaximo} onChange={(e) => setPrecoMaximo(e.target.value)} className="campo" />
        </div>

        <fieldset>
          <legend className="rotulo">Os fornecedores podem ver os preços uns dos outros?</legend>
          <label className="flex items-start gap-2 py-1">
            <input type="radio" name="lances_visiveis" value="sim" defaultChecked className="mt-1" />
            <span><strong>Sim, leilão aberto.</strong> Cada um vê o menor lance e tenta cobrir.</span>
          </label>
          <label className="flex items-start gap-2 py-1">
            <input type="radio" name="lances_visiveis" value="nao" className="mt-1" />
            <span><strong>Não, leilão fechado.</strong> Só você vê os preços.</span>
          </label>
        </fieldset>

        <label className="flex items-start gap-2 rounded-lg border border-stone-200 p-3">
          <input type="checkbox" name="aceita_participantes" value="sim" className="mt-1" />
          <span>
            <strong>Leilão em grupo:</strong> deixar quem mora a até 5 km entrar neste leilão com a própria quantidade.
            <span className="block text-sm text-stone-500">Com mais gente, o volume cresce e o vendedor tem motivo para baixar o preço. Cada um fecha e paga a sua parte direto ao vendedor.</span>
          </span>
        </label>

        <EscolherConvidados tipo="fornecedor" contatos={fornecedores} />

        <div>
          <label className="rotulo" htmlFor="duracao_horas">Receber lances por</label>
          <select id="duracao_horas" name="duracao_horas" defaultValue="24" className="campo">
            <option value="2">2 horas</option>
            <option value="6">6 horas</option>
            <option value="24">1 dia</option>
            <option value="72">3 dias</option>
            <option value="168">7 dias</option>
          </select>
          <p className="mt-1 text-xs text-stone-500">Para perecíveis, prefira prazos curtos. Lance nos últimos 5 minutos prorroga o prazo.</p>
        </div>

        {estado.erro && <p className="erro">{estado.erro}</p>}
        <button disabled={enviando} className="botao w-full">{enviando ? "Publicando..." : "Publicar leilão"}</button>
      </form>
    </div>
  );
}
