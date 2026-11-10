import { PUBLICO, UNIDADES, type Categoria, type Publico, type Unidade } from "@/lib/dominio";
import { OpcoesCategoria } from "@/components/OpcoesCategoria";

export type ValoresOferta = {
  produto?: string;
  categoria?: Categoria;
  unidade?: Unidade;
  preco_unitario?: number | string;
  quantidade?: number | string;
  validade?: string | null;
  disponivel_a_partir?: string | null;
  vende_para?: Publico;
  descricao?: string | null;
  so_na_loja?: boolean;
};

// Campos da oferta, usados para publicar e para editar.
export function CamposOferta({ valores }: { valores: ValoresOferta }) {
  return (
    <>
      <fieldset>
        <legend className="rotulo">Como vender</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-stone-300 p-3 has-checked:border-green-600 has-checked:bg-green-50">
            <input type="radio" name="como_vender" value="app" defaultChecked={!valores.so_na_loja} className="mt-1" />
            <span>
              <span className="font-medium">Pelo app</span>
              <span className="block text-xs text-stone-500">O comprador faz o pedido aqui e você aceita ou recusa.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-stone-300 p-3 has-checked:border-amber-500 has-checked:bg-amber-50">
            <input type="radio" name="como_vender" value="loja" defaultChecked={valores.so_na_loja} className="mt-1" />
            <span>
              <span className="font-medium">Só na loja</span>
              <span className="block text-xs text-stone-500">Promoção para conferir na loja, sem compra pelo app. Seu WhatsApp aparece no anúncio.</span>
            </span>
          </label>
        </div>
      </fieldset>
      <div>
        <label className="rotulo" htmlFor="produto">Produto</label>
        <input id="produto" name="produto" required maxLength={120} defaultValue={valores.produto} className="campo" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="rotulo" htmlFor="categoria">Categoria</label>
          <select id="categoria" name="categoria" defaultValue={valores.categoria} className="campo">
            <OpcoesCategoria />
          </select>
        </div>
        <div>
          <label className="rotulo" htmlFor="unidade">Unidade</label>
          <select id="unidade" name="unidade" defaultValue={valores.unidade} className="campo">
            {Object.entries(UNIDADES).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="rotulo" htmlFor="preco_unitario">Preço por unidade (R$)</label>
          <input id="preco_unitario" name="preco_unitario" required inputMode="decimal" defaultValue={valores.preco_unitario ?? ""} className="campo" />
        </div>
        <div>
          <label className="rotulo" htmlFor="quantidade_disponivel">Quantidade disponível</label>
          <input id="quantidade_disponivel" name="quantidade_disponivel" inputMode="decimal" defaultValue={valores.quantidade ?? ""} className="campo" />
          <p className="mt-1 text-xs text-stone-500">Opcional na promoção só na loja.</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="rotulo" htmlFor="validade">Validade do produto</label>
          <input id="validade" name="validade" type="date" defaultValue={valores.validade ?? ""} className="campo" />
        </div>
        <div>
          <label className="rotulo" htmlFor="disponivel_a_partir">Disponível a partir de</label>
          <input id="disponivel_a_partir" name="disponivel_a_partir" type="date" defaultValue={valores.disponivel_a_partir ?? ""} className="campo" />
          <p className="mt-1 text-xs text-stone-500">Para ofertas de safra ainda não colhida.</p>
        </div>
      </div>
      <div>
        <label className="rotulo" htmlFor="vende_para">Vender para</label>
        <select id="vende_para" name="vende_para" defaultValue={valores.vende_para ?? "todos"} className="campo">
          {Object.entries(PUBLICO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
      </div>
      <div>
        <label className="rotulo" htmlFor="descricao">Detalhes</label>
        <textarea id="descricao" name="descricao" rows={2} maxLength={1000} defaultValue={valores.descricao ?? ""} className="campo" />
      </div>
    </>
  );
}
