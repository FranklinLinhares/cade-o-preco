// Roda a migração num Postgres em memória (PGlite) com um esboço do esquema
// auth do Supabase e verifica as regras de negócio principais.
// Uso: node supabase/tests/testar-sql.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
await db.exec(`
  create role authenticated;
  create role anon;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create publication supabase_realtime;
  grant usage on schema public, auth to authenticated;
`);
// Como no Supabase: tabelas novas já nascem com acesso para usuários logados,
// e cada migração pode tirar o que não deve ficar aberto.
await db.exec(`alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;`);
// Funções novas também nascem liberadas para anon e authenticated, como no Supabase.
await db.exec(`alter default privileges in schema public grant execute on functions to anon, authenticated;`);
const migracoes = new URL("../migrations/", import.meta.url);
for (const arquivo of readdirSync(migracoes).filter((a) => a.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(new URL(arquivo, migracoes), "utf8"));
}

const ids = {
  restaurante: "00000000-0000-0000-0000-000000000001", // João Pessoa
  atacado: "00000000-0000-0000-0000-000000000002",     // Cabedelo (~15 km)
  agricultor: "00000000-0000-0000-0000-000000000003",  // Sapé (~45 km)
  longe: "00000000-0000-0000-0000-000000000004",       // Campina Grande (~115 km)
};
await db.exec(`
  insert into auth.users values ('${ids.restaurante}'), ('${ids.atacado}'), ('${ids.agricultor}'), ('${ids.longe}');
  insert into empresas (id, papel, tipo_documento, documento, registro_rural, agricultor, nome, telefone, cidade, uf, lat, lng, raio_km) values
    ('${ids.restaurante}', 'comprador', 'cnpj', '11222333000181', null, false, 'Restaurante Sabor', '83999990001', 'João Pessoa', 'PB', -7.1195, -34.8450, 60),
    ('${ids.atacado}', 'fornecedor', 'cnpj', '22333444000172', null, false, 'Atacado Litoral', '83999990002', 'Cabedelo', 'PB', -6.9811, -34.8339, 30),
    ('${ids.agricultor}', 'fornecedor', 'cpf_caf', '12345678909', 'CAF-123', true, 'Sítio Boa Vista', '83999990003', 'Sapé', 'PB', -7.0936, -35.2328, 80),
    ('${ids.longe}', 'fornecedor', 'cnpj', '33444555000163', null, false, 'Distribuidora Serra', '83999990004', 'Campina Grande', 'PB', -7.2307, -35.8811, 200);
`);

async function como(uid, sql, params = []) {
  await db.exec(`set role authenticated; select set_config('test.uid', '${uid}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`reset role;`);
  }
}
async function falha(uid, sql, params, trecho) {
  await assert.rejects(como(uid, sql, params), (e) => {
    assert.match(e.message, trecho);
    return true;
  });
}

// CPF com CAF exige o número do registro rural.
await assert.rejects(db.exec(`
  insert into auth.users values ('00000000-0000-0000-0000-000000000009');
  insert into empresas (id, papel, tipo_documento, documento, nome, telefone, cidade, uf, lat, lng)
  values ('00000000-0000-0000-0000-000000000009', 'comprador', 'cpf_caf', '12345678909', 'X', '1', 'X', 'PB', 0, 0);
`), /documento_valido/);
// Pessoa física compra com CPF (cadastro único).
ids.pessoa = "00000000-0000-0000-0000-000000000005"; // João Pessoa
await db.exec(`
  insert into auth.users values ('${ids.pessoa}');
  insert into empresas (id, papel, tipo_documento, documento, nome, nome_completo, telefone, cidade, uf, lat, lng, raio_km)
  values ('${ids.pessoa}', 'comprador', 'cpf', '52998224725', 'Maria Souza', 'Maria Souza', '83999990005', 'João Pessoa', 'PB', -7.12, -34.85, 60);
`);

// Ofertas na vitrine.
await como(ids.atacado, `insert into ofertas (fornecedor_id, produto, produto_chave, categoria, unidade, preco_unitario, quantidade_disponivel)
  values ($1, 'Tomate italiano cx 20kg', 'tomate-italiano', 'hortifruti', 'kg', 4.50, 400)`, [ids.atacado]);
await como(ids.agricultor, `insert into ofertas (fornecedor_id, produto, produto_chave, categoria, unidade, preco_unitario, quantidade_disponivel)
  values ($1, 'Tomate italiano', 'tomate-italiano', 'hortifruti', 'kg', 3.90, 200)`, [ids.agricultor]);
await como(ids.longe, `insert into ofertas (fornecedor_id, produto, produto_chave, categoria, unidade, preco_unitario, quantidade_disponivel)
  values ($1, 'Tomate', 'tomate-italiano', 'hortifruti', 'kg', 2.00, 1000)`, [ids.longe]);
// Comprador não publica oferta.
await falha(ids.restaurante, `insert into ofertas (fornecedor_id, produto, produto_chave, categoria, unidade, preco_unitario, quantidade_disponivel)
  values ($1, 'x', 'x', 'graos', 'kg', 1, 1)`, [ids.restaurante], /row-level security/);

const vitrine = await como(ids.restaurante, `select fornecedor_nome, preco_unitario from vitrine_ofertas('tomate')`);
assert.deepEqual(vitrine.rows.map((r) => r.fornecedor_nome), ["Sítio Boa Vista", "Atacado Litoral"],
  "a distribuidora de Campina Grande fica fora do raio");

// Pessoa física também vê a vitrine.
assert.equal((await como(ids.pessoa, `select * from vitrine_ofertas('tomate')`)).rows.length, 2);
// Fornecedor que só vende para empresas some da vitrine da pessoa física.
await db.exec(`update empresas set negocia_com = 'pj' where id = '${ids.atacado}'`);
assert.deepEqual((await como(ids.pessoa, `select fornecedor_nome from vitrine_ofertas('tomate')`)).rows.map((r) => r.fornecedor_nome), ["Sítio Boa Vista"]);
assert.equal((await como(ids.restaurante, `select * from vitrine_ofertas('tomate')`)).rows.length, 2, "o restaurante tem CNPJ");
await db.exec(`update empresas set negocia_com = 'todos' where id = '${ids.atacado}'`);
// Oferta só para empresas: some para a pessoa física e não pode ser comprada por ela.
await db.exec(`update ofertas set vende_para = 'pj' where fornecedor_id = '${ids.agricultor}'`);
assert.deepEqual((await como(ids.pessoa, `select fornecedor_nome from vitrine_ofertas('tomate')`)).rows.map((r) => r.fornecedor_nome), ["Atacado Litoral"]);
const soEmpresas = (await db.query(`select id from ofertas where fornecedor_id = $1`, [ids.agricultor])).rows[0].id;
await falha(ids.pessoa, `select reservar_oferta($1, 1)`, [soEmpresas], /só para empresas/);
const paraRestaurante = await como(ids.restaurante, `select fornecedor_nome, fornecedor_pj from vitrine_ofertas('tomate')`);
assert.equal(paraRestaurante.rows.length, 2, "o restaurante tem CNPJ e vê a oferta só para empresas");
assert.equal(paraRestaurante.rows.find((r) => r.fornecedor_nome === "Sítio Boa Vista").fornecedor_pj, false, "agricultor com CPF");
await db.exec(`update ofertas set vende_para = 'todos' where fornecedor_id = '${ids.agricultor}'`);
// No modo Comprar a conta vê a própria oferta, mas não consegue comprá-la.
await db.exec(`update empresas set papel = 'comprador' where id = '${ids.atacado}'`);
assert.ok((await como(ids.atacado, `select fornecedor_nome from vitrine_ofertas('tomate')`)).rows.some((r) => r.fornecedor_nome === "Atacado Litoral"),
  "a própria oferta aparece na vitrine (marcada como sua no app)");
const propria = (await db.query(`select id from ofertas where fornecedor_id = $1`, [ids.atacado])).rows[0].id;
await falha(ids.atacado, `select reservar_oferta($1, 1)`, [propria], /própria oferta/);
await db.exec(`update empresas set papel = 'fornecedor' where id = '${ids.atacado}'`);

// Promoção só na loja: aparece na vitrine com o WhatsApp da loja, mas não aceita pedido.
// Distância em faixas, sem casas decimais que revelem o endereço.
for (const r of (await como(ids.restaurante, `select distancia_km from vitrine_ofertas('tomate')`)).rows) {
  assert.ok(Number.isInteger(r.distancia_km) && r.distancia_km >= 1, `distância em km inteiro: ${r.distancia_km}`);
}
assert.deepEqual(
  (await db.query(`select distancia_em_faixa(0.2) a, distancia_em_faixa(3.4) b, distancia_em_faixa(12.1) c, distancia_em_faixa(25) d`)).rows[0],
  { a: 1, b: 4, c: 15, d: 25 },
);

await db.exec(`update ofertas set so_na_loja = true where fornecedor_id = '${ids.atacado}'`);
const naLoja = (await como(ids.restaurante, `select so_na_loja, telefone_loja from vitrine_ofertas('tomate') where fornecedor_id = $1`, [ids.atacado])).rows[0];
assert.equal(naLoja.so_na_loja, true);
assert.ok(naLoja.telefone_loja, "promoção de loja mostra o WhatsApp");
await falha(ids.restaurante, `select reservar_oferta($1, 1)`, [propria], /só na loja/);
assert.equal((await db.query(`select quantidade_disponivel q from ofertas where id = $1`, [propria])).rows[0].q, "400.00", "estoque não muda");
await db.exec(`update ofertas set so_na_loja = false where fornecedor_id = '${ids.atacado}'`);
assert.equal((await como(ids.restaurante, `select telefone_loja from vitrine_ofertas('tomate') where fornecedor_id = $1`, [ids.atacado])).rows[0].telefone_loja, null,
  "oferta vendida pelo app não mostra telefone");

// Pedido aberto (lances visíveis) e pedido fechado (lances ocultos).
const amanha = "now() + interval '1 day'";
const aberto = (await como(ids.restaurante, `insert into pedidos (comprador_id, produto, produto_chave, categoria, unidade, quantidade, preco_maximo, lances_visiveis, encerra_em)
  values ($1, 'Arroz branco tipo 1', 'arroz-branco-tipo-1', 'graos', 'kg', 100, 6.00, true, ${amanha}) returning id`, [ids.restaurante])).rows[0].id;
const fechado = (await como(ids.restaurante, `insert into pedidos (comprador_id, produto, produto_chave, categoria, unidade, quantidade, lances_visiveis, encerra_em)
  values ($1, 'Feijão carioca', 'feijao-carioca', 'graos', 'kg', 50, false, ${amanha}) returning id`, [ids.restaurante])).rows[0].id;

const proximos = await como(ids.atacado, `select produto from pedidos_proximos()`);
assert.equal(proximos.rows.length, 2);
assert.equal((await como(ids.longe, `select * from pedidos_proximos()`)).rows.length, 0);
assert.equal((await como(ids.atacado, `select compradores_interessados('arroz-branco-tipo-1') n`)).rows[0].n, 1);

// Lances no leilão aberto.
await falha(ids.atacado, `select dar_lance($1, 6.50)`, [aberto], /no máximo/);
await como(ids.atacado, `select dar_lance($1, 5.80)`, [aberto]);
await falha(ids.agricultor, `select dar_lance($1, 5.80)`, [aberto], /menor que o menor lance atual/);
await como(ids.agricultor, `select dar_lance($1, 5.50)`, [aberto]);
// 5,496 vira 5,50 na coluna: precisa ser recusado em vez de empatar.
await falha(ids.atacado, `select dar_lance($1, 5.496)`, [aberto], /menor que o menor lance atual/);
await falha(ids.atacado, `select dar_lance($1, 0.004)`, [aberto], /maior que zero/);
await falha(ids.longe, `select dar_lance($1, 4.00)`, [aberto], /fora do seu raio/);
await falha(ids.restaurante, `select dar_lance($1, 4.00)`, [aberto], /Apenas fornecedores/);
// No leilão aberto o concorrente vê os preços.
assert.equal((await como(ids.atacado, `select * from lances where pedido_id = $1`, [aberto])).rows.length, 2);

// Leilão fechado: cada fornecedor só precisa baixar o próprio lance e não vê o do outro.
await como(ids.atacado, `select dar_lance($1, 8.00)`, [fechado]);
await como(ids.agricultor, `select dar_lance($1, 9.00)`, [fechado]);
await falha(ids.agricultor, `select dar_lance($1, 9.00)`, [fechado], /seu lance anterior/);
assert.equal((await como(ids.agricultor, `select * from lances where pedido_id = $1`, [fechado])).rows.length, 1);
assert.equal((await como(ids.restaurante, `select * from lances where pedido_id = $1`, [fechado])).rows.length, 2);

// Prorrogação: lance nos últimos 5 minutos empurra o encerramento.
await db.query(`update pedidos set encerra_em = now() + interval '1 minute' where id = $1`, [aberto]);
await como(ids.atacado, `select dar_lance($1, 5.40)`, [aberto]);
const restante = (await db.query(`select extract(epoch from encerra_em - now()) s from pedidos where id = $1`, [aberto])).rows[0].s;
assert.ok(Number(restante) > 290, "encerramento prorrogado para 5 minutos");

// Fechamento: só o comprador escolhe; a compra entra no histórico.
const vencedor = (await db.query(`select id from lances where pedido_id = $1 order by preco_unitario limit 1`, [aberto])).rows[0].id;
await falha(ids.atacado, `select fechar_pedido($1, $2)`, [aberto, vencedor], /não encontrado/);
await como(ids.restaurante, `select fechar_pedido($1, $2)`, [aberto, vencedor]);
await falha(ids.agricultor, `select dar_lance($1, 5.00)`, [aberto], /encerrado/);
// Pedido fechado não pode mais ser cancelado.
await como(ids.restaurante, `update pedidos set status = 'cancelado' where id = $1`, [aberto]);
assert.equal((await db.query(`select status from pedidos where id = $1`, [aberto])).rows[0].status, "fechado");

// Compra pela vitrine baixa o estoque.
const ofertaAgricultor = (await db.query(`select id from ofertas where fornecedor_id = $1`, [ids.agricultor])).rows[0].id;
await falha(ids.restaurante, `select reservar_oferta($1, 500)`, [ofertaAgricultor], /Quantidade indisponível/);
const reserva = (await como(ids.restaurante, `select id from reservar_oferta($1, 50)`, [ofertaAgricultor])).rows[0].id;
assert.equal(Number((await db.query(`select quantidade_disponivel q from ofertas where id = $1`, [ofertaAgricultor])).rows[0].q), 150);
// O pedido fica aguardando: ainda não é compra, e só o vendedor responde.
assert.equal((await db.query(`select 1 from compras where oferta_id = $1`, [ofertaAgricultor])).rows.length, 0);
await falha(ids.restaurante, `select responder_reserva($1, true)`, [reserva], /não encontrado/);
await falha(ids.atacado, `select responder_reserva($1, true)`, [reserva], /não encontrado/);
await falha(ids.restaurante, `insert into reservas (comprador_id, fornecedor_id, produto, produto_chave, categoria, unidade, quantidade, preco_unitario)
  values ($1, $2, 'x', 'x', 'graos', 'kg', 1, 1)`, [ids.restaurante, ids.agricultor], /permission denied/);
assert.equal((await como(ids.atacado, `select * from reservas`)).rows.length, 0, "outra conta não vê o pedido");
await como(ids.agricultor, `select responder_reserva($1, true)`, [reserva]);
await falha(ids.agricultor, `select responder_reserva($1, false)`, [reserva], /já foi respondido/);
await falha(ids.restaurante, `select cancelar_reserva($1)`, [reserva], /já respondeu/);
// Recusar ou desistir devolve o estoque.
const recusada = (await como(ids.restaurante, `select id from reservar_oferta($1, 20)`, [ofertaAgricultor])).rows[0].id;
await como(ids.agricultor, `select responder_reserva($1, false)`, [recusada]);
const desistida = (await como(ids.restaurante, `select id from reservar_oferta($1, 30)`, [ofertaAgricultor])).rows[0].id;
await como(ids.restaurante, `select cancelar_reserva($1)`, [desistida]);
assert.equal(Number((await db.query(`select quantidade_disponivel q from ofertas where id = $1`, [ofertaAgricultor])).rows[0].q), 150);
assert.equal((await db.query(`select count(*) n from compras where oferta_id = $1`, [ofertaAgricultor])).rows[0].n, 1);
// Quantidade arredondada antes de mexer no estoque: 0,004 não vira reserva.
await falha(ids.restaurante, `select reservar_oferta($1, 0.004)`, [ofertaAgricultor], /maior que zero/);
const meio = (await como(ids.restaurante, `select id, quantidade from reservar_oferta($1, 0.005)`, [ofertaAgricultor])).rows[0];
assert.equal(Number(meio.quantidade), 0.01);
assert.equal(Number((await db.query(`select quantidade_disponivel q from ofertas where id = $1`, [ofertaAgricultor])).rows[0].q), 149.99);
await como(ids.restaurante, `select cancelar_reserva($1)`, [meio.id]);
assert.equal(Number((await db.query(`select quantidade_disponivel q from ofertas where id = $1`, [ofertaAgricultor])).rows[0].q), 150);
// Oferta encerrada pelo vendedor continua encerrada quando um pedido é recusado.
const antesDeEncerrar = (await como(ids.restaurante, `select id from reservar_oferta($1, 5)`, [ofertaAgricultor])).rows[0].id;
await como(ids.agricultor, `update ofertas set ativa = false where id = $1`, [ofertaAgricultor]);
await como(ids.agricultor, `select responder_reserva($1, false)`, [antesDeEncerrar]);
const encerrada = (await db.query(`select quantidade_disponivel q, ativa from ofertas where id = $1`, [ofertaAgricultor])).rows[0];
assert.equal(Number(encerrada.q), 150);
assert.equal(encerrada.ativa, false, "recusar não republica a oferta encerrada");
await db.exec(`update ofertas set ativa = true where id = '${ofertaAgricultor}'`);

// Histórico semanal com variação.
await como(ids.restaurante, `insert into compras (comprador_id, fornecedor_nome, produto, produto_chave, categoria, unidade, quantidade, preco_unitario, origem, data)
  values ($1, 'Feira', 'Tomate italiano', 'tomate-italiano', 'hortifruti', 'kg', 50, 3.00, 'externa', current_date - 7)`, [ids.restaurante]);
const hist = await como(ids.restaurante, `select semana, preco_medio, variacao_pct from historico_semanal where produto_chave = 'tomate-italiano' order by semana`);
assert.equal(hist.rows.length, 2);
assert.equal(Number(hist.rows[1].variacao_pct), 30, "tomate passou de 3,00 para 3,90 (+30%)");
// Fornecedor não vê o histórico de compras de outros fornecedores.
assert.equal((await como(ids.atacado, `select * from compras where produto_chave = 'tomate-italiano'`)).rows.length, 0);

const media = await como(ids.restaurante, `select * from preco_medio_regional('arroz-branco-tipo-1')`);
assert.equal(Number(media.rows[0].preco_medio), 5.4);

// Avaliações: o comprador avalia o vendedor e o vendedor avalia o comprador.
const compraVitrine = (await db.query(`select id from compras where oferta_id = $1`, [ofertaAgricultor])).rows[0].id;
// Só avalia depois que os dois confirmam que o negócio foi concluído.
await falha(ids.restaurante, `select avaliar($1, 5)`, [compraVitrine], /confirmarem/);
await falha(ids.atacado, `select concluir_negocio($1)`, [compraVitrine], /não encontrado/);
await como(ids.restaurante, `select concluir_negocio($1)`, [compraVitrine]);
await falha(ids.agricultor, `select avaliar($1, 4)`, [compraVitrine], /confirmarem/);
await como(ids.agricultor, `select concluir_negocio($1)`, [compraVitrine]);
await como(ids.restaurante, `select avaliar($1, 5, 'Tomate ótimo, entrega no prazo')`, [compraVitrine]);
await como(ids.agricultor, `select avaliar($1, 4, 'Pagou certinho')`, [compraVitrine]);
await falha(ids.atacado, `select avaliar($1, 1)`, [compraVitrine], /não encontrado/);
await falha(ids.restaurante, `select avaliar($1, 6)`, [compraVitrine], /de 1 a 5/);
const externa = (await db.query(`select id from compras where origem = 'externa' limit 1`)).rows[0].id;
await falha(ids.restaurante, `select avaliar($1, 5)`, [externa], /fora do app/);
// Avaliar de novo substitui a nota anterior.
await como(ids.restaurante, `select avaliar($1, 3)`, [compraVitrine]);
const rep = (await como(ids.restaurante, `select * from reputacao($1)`, [[ids.agricultor, ids.restaurante]])).rows;
const doAgricultor = rep.find((r) => r.empresa_id === ids.agricultor);
const doRestaurante = rep.find((r) => r.empresa_id === ids.restaurante);
assert.equal(Number(doAgricultor.nota_vendedor), 3);
assert.equal(Number(doAgricultor.avaliacoes_vendedor), 1);
assert.equal(Number(doAgricultor.vendas), 1);
assert.equal(Number(doRestaurante.nota_comprador), 4);
assert.equal(Number(doRestaurante.compras), 2, "uma compra no leilão e uma na vitrine; a externa não conta");
// Ninguém grava avaliação direto na tabela.
await falha(ids.restaurante, `insert into avaliacoes (compra_id, avaliador_id, avaliado_id, avaliado_como, nota) values ($1, $2, $3, 'vendedor', 5)`,
  [compraVitrine, ids.restaurante, ids.atacado], /row-level security/);

// Editar e excluir ofertas: só o próprio vendedor.
await como(ids.atacado, `update ofertas set ativa = false where id = $1`, [ofertaAgricultor]);
await como(ids.atacado, `delete from ofertas where id = $1`, [ofertaAgricultor]);
assert.equal((await db.query(`select ativa from ofertas where id = $1`, [ofertaAgricultor])).rows[0].ativa, true,
  "outro vendedor não altera nem exclui a oferta");
await como(ids.agricultor, `update ofertas set preco_unitario = 3.50 where id = $1`, [ofertaAgricultor]);
assert.equal(Number((await db.query(`select preco_unitario p from ofertas where id = $1`, [ofertaAgricultor])).rows[0].p), 3.5);
await como(ids.agricultor, `delete from ofertas where id = $1`, [ofertaAgricultor]);
assert.equal((await db.query(`select 1 from ofertas where id = $1`, [ofertaAgricultor])).rows.length, 0);
// A compra feita antes continua no histórico, e a avaliação também.
const compraMantida = (await db.query(`select oferta_id from compras where id = $1`, [compraVitrine])).rows[0];
assert.equal(compraMantida.oferta_id, null);
assert.equal((await db.query(`select 1 from avaliacoes where compra_id = $1`, [compraVitrine])).rows.length, 2);

// Contatos: cada conta vê e gerencia só os próprios.
await como(ids.restaurante, `insert into contatos (dono_id, contato_id, tipo) values ($1, $2, 'fornecedor')`, [ids.restaurante, ids.longe]);
assert.equal((await como(ids.atacado, `select * from contatos`)).rows.length, 0, "outra conta não vê os contatos do restaurante");
await falha(ids.atacado, `insert into contatos (dono_id, contato_id, tipo) values ($1, $2, 'cliente')`, [ids.restaurante, ids.atacado], /row-level security/);
const achados = (await como(ids.restaurante, `select nome from encontrar_empresas('serra')`)).rows;
assert.deepEqual(achados.map((r) => r.nome), ["Distribuidora Serra"]);
assert.equal((await como(ids.restaurante, `select * from encontrar_empresas('ab')`)).rows.length, 0, "busca curta não lista ninguém");

// Leilão só para convidados: o convidado de longe participa; o vizinho não convidado não vê.
await db.exec(`update empresas set papel = 'fornecedor' where id in ('${ids.longe}', '${ids.atacado}')`);
const convite = (await como(ids.restaurante, `insert into pedidos (comprador_id, produto, produto_chave, categoria, unidade, quantidade, encerra_em, convidados)
  values ($1, 'Feijão', 'feijao', 'graos', 'kg', 100, now() + interval '1 day', array[$2]::uuid[]) returning id`, [ids.restaurante, ids.longe])).rows[0].id;
assert.ok((await como(ids.longe, `select id from pedidos_proximos()`)).rows.some((r) => r.id === convite), "convidado vê mesmo fora do raio");
assert.ok(!(await como(ids.atacado, `select id from pedidos_proximos()`)).rows.some((r) => r.id === convite), "não convidado não vê");
await como(ids.longe, `select dar_lance($1, 7.00)`, [convite]);
await falha(ids.atacado, `select dar_lance($1, 6.00)`, [convite], /convidados/);
// Nem pela API o não convidado lê o leilão; o dono e o convidado leem.
assert.equal((await como(ids.atacado, `select id from pedidos where id = $1`, [convite])).rows.length, 0, "não convidado não lê o leilão");
assert.equal((await como(ids.longe, `select id from pedidos where id = $1`, [convite])).rows.length, 1, "convidado lê o leilão");
assert.equal((await como(ids.restaurante, `select id from pedidos where id = $1`, [convite])).rows.length, 1, "dono lê o leilão");

// Oferta só para clientes escolhidos.
const ofertaFechada = (await como(ids.atacado, `insert into ofertas (fornecedor_id, produto, produto_chave, categoria, unidade, preco_unitario, quantidade_disponivel, convidados)
  values ($1, 'Arroz', 'arroz', 'graos', 'kg', 5, 100, array[$2]::uuid[]) returning id`, [ids.atacado, ids.restaurante])).rows[0].id;
assert.ok((await como(ids.restaurante, `select id from vitrine_ofertas('arroz')`)).rows.some((r) => r.id === ofertaFechada));
assert.ok(!(await como(ids.pessoa, `select id from vitrine_ofertas('arroz')`)).rows.some((r) => r.id === ofertaFechada), "quem não é cliente não vê");
await falha(ids.pessoa, `select reservar_oferta($1, 1)`, [ofertaFechada], /clientes escolhidos/);
assert.equal((await como(ids.pessoa, `select id from ofertas where id = $1`, [ofertaFechada])).rows.length, 0, "não cliente não lê a oferta pela API");
assert.equal((await como(ids.restaurante, `select id from ofertas where id = $1`, [ofertaFechada])).rows.length, 1, "cliente escolhido lê a oferta");
assert.equal((await como(ids.atacado, `select id from ofertas where id = $1`, [ofertaFechada])).rows.length, 1, "dono lê a oferta");
await como(ids.restaurante, `select reservar_oferta($1, 1)`, [ofertaFechada]);

// Levar todo o estoque esgota a oferta.
const pouca = (await como(ids.agricultor, `insert into ofertas (fornecedor_id, produto, produto_chave, categoria, unidade, preco_unitario, quantidade_disponivel)
  values ($1, 'Macaxeira', 'macaxeira', 'hortifruti', 'kg', 3.00, 10) returning id`, [ids.agricultor])).rows[0].id;
await como(ids.restaurante, `select reservar_oferta($1, 10)`, [pouca]);
const esgotada = (await db.query(`select quantidade_disponivel q, ativa from ofertas where id = $1`, [pouca])).rows[0];
assert.equal(Number(esgotada.q), 0);
assert.equal(esgotada.ativa, false);
// Desistir do pedido que esgotou a oferta a devolve à vitrine.
const reservaPouca = (await db.query(`select id from reservas where oferta_id = $1`, [pouca])).rows[0].id;
await como(ids.restaurante, `select cancelar_reserva($1)`, [reservaPouca]);
assert.equal((await db.query(`select ativa from ofertas where id = $1`, [pouca])).rows[0].ativa, true);

// Privacidade: documento, telefone e localização não aparecem para outras contas.
await falha(ids.pessoa, `select documento from empresas where id = $1`, [ids.agricultor], /permission denied/);
await falha(ids.pessoa, `select telefone from empresas where id = $1`, [ids.agricultor], /permission denied/);
await falha(ids.pessoa, `select lat from empresas where id = $1`, [ids.agricultor], /permission denied/);
assert.equal((await como(ids.pessoa, `select nome from empresas where id = $1`, [ids.agricultor])).rows[0].nome, "Sítio Boa Vista");
assert.equal((await como(ids.pessoa, `select documento from minha_empresa()`)).rows[0].documento, "52998224725");
// Telefone só de quem já fez negócio: o restaurante comprou do agricultor; a Maria, não.
assert.equal((await como(ids.restaurante, `select telefone from telefones_de_negocio($1)`, [[ids.agricultor]])).rows[0]?.telefone, "83999990003");
assert.equal((await como(ids.pessoa, `select telefone from telefones_de_negocio($1)`, [[ids.agricultor]])).rows.length, 0);
// Compra "externa" não pode apontar outra conta para conseguir o telefone dela.
await falha(ids.pessoa, `insert into compras (comprador_id, fornecedor_id, produto, produto_chave, categoria, unidade, quantidade, preco_unitario, origem)
  values ($1, $2, 'x', 'x', 'graos', 'kg', 1, 1, 'externa')`, [ids.pessoa, ids.agricultor], /row-level security/);
assert.equal((await como(ids.pessoa, `select telefone from telefones_de_negocio($1)`, [[ids.agricultor]])).rows.length, 0);
// O cadastro continua salvando, como o app faz: update na própria conta.
await como(ids.pessoa, `update empresas set nome = 'Maria S.', telefone = '83999990006', lat = -7.13 where id = $1`, [ids.pessoa]);
assert.equal((await db.query(`select nome from empresas where id = $1`, [ids.pessoa])).rows[0].nome, "Maria S.");

// E a conta nova se cadastra com insert.
await db.exec(`insert into auth.users values ('00000000-0000-0000-0000-000000000010')`);
await como("00000000-0000-0000-0000-000000000010", `insert into empresas (id, papel, tipo_documento, documento, nome, telefone, cidade, uf, lat, lng)
  values ('00000000-0000-0000-0000-000000000010', 'comprador', 'cpf', '11144477735', 'Novo', '83999990010', 'João Pessoa', 'PB', -7.12, -34.85)`);

// Limite diário da IA: 10 pesquisas por conta.
for (let i = 0; i < 10; i++) await como(ids.pessoa, `select registrar_uso_ia('pesquisa')`);
await falha(ids.pessoa, `select registrar_uso_ia('pesquisa')`, [], /limite de 10/);
await como(ids.pessoa, `select registrar_uso_ia('item')`);
await como(ids.restaurante, `select registrar_uso_ia('pesquisa')`);
// E 5 folhetos lidos por dia.
for (let i = 0; i < 5; i++) await como(ids.restaurante, `select registrar_uso_ia('folheto')`);
await falha(ids.restaurante, `select registrar_uso_ia('folheto')`, [], /limite de 5/);

// Avisos: cada evento avisa quem precisa agir.
const avisos = async (uid) => (await como(uid, `select texto, link, lido from avisos order by criado_em`)).rows.map((r) => r.texto);
assert.ok((await avisos(ids.restaurante)).some((t) => t.startsWith("Lance novo no seu leilão")), "comprador sabe do lance");
assert.ok((await avisos(ids.agricultor)).some((t) => t.includes("quer comprar")), "vendedor sabe do pedido da vitrine");
assert.ok((await avisos(ids.restaurante)).some((t) => t.includes("aceitou seu pedido")), "comprador sabe do aceite");
assert.ok((await avisos(ids.restaurante)).some((t) => t.includes("recusou seu pedido")), "comprador sabe da recusa");
assert.ok((await avisos(ids.longe)).some((t) => t.endsWith("de Feijão")), "convidado de longe é avisado");
assert.ok(!(await avisos(ids.atacado)).some((t) => t.endsWith("de Feijão")), "quem não foi convidado não é avisado");
await falha(ids.atacado, `insert into avisos (empresa_id, texto, link) values ($1, 'x', '/')`, [ids.restaurante], /permission denied/);
await como(ids.atacado, `update avisos set lido = true where empresa_id = $1`, [ids.restaurante]);
assert.ok((await db.query(`select 1 from avisos where empresa_id = $1 and not lido`, [ids.restaurante])).rows.length > 0, "outra conta não mexe nos avisos");
await como(ids.restaurante, `update avisos set lido = true where not lido`);
assert.equal((await db.query(`select 1 from avisos where empresa_id = $1 and not lido`, [ids.restaurante])).rows.length, 0);
// O texto e o link dos avisos não podem ser reescritos (0023).
await falha(ids.restaurante, `update avisos set link = '/\\golpe.com', texto = 'x'`, [], /permission denied/);

// Cancelar um leilão só muda o status (0023): não dá para escolher vencedor
// nem trocar o produto junto, o que mandaria "Você venceu..." com texto livre.
const golpe = (await como(ids.restaurante, `insert into pedidos (comprador_id, produto, produto_chave, categoria, unidade, quantidade, encerra_em)
  values ($1, 'Milho', 'milho', 'graos', 'kg', 10, ${amanha}) returning id`, [ids.restaurante])).rows[0].id;
const lanceGolpe = (await como(ids.atacado, `select id from dar_lance($1, 3.00)`, [golpe])).rows[0].id;
await falha(ids.restaurante, `update pedidos set status = 'cancelado', lance_vencedor_id = $2, produto = 'Pix pendente' where id = $1`, [golpe, lanceGolpe], /permission denied/);
assert.ok(!(await avisos(ids.atacado)).some((t) => t.includes("Pix pendente")), "dono do lance não recebe aviso falso");
await como(ids.restaurante, `update pedidos set status = 'cancelado' where id = $1`, [golpe]);
assert.equal((await db.query(`select status from pedidos where id = $1`, [golpe])).rows[0].status, "cancelado");

// Alerta de preço: avisa quando aparece oferta dentro do preço, para quem pode comprar.
await como(ids.restaurante, `insert into alertas_preco (empresa_id, produto, produto_chave, unidade, preco_maximo) values ($1, 'Cebola', 'cebola', 'kg', 4)`, [ids.restaurante]);
assert.equal((await como(ids.atacado, `select * from alertas_preco`)).rows.length, 0, "alertas são privados");
await como(ids.atacado, `insert into ofertas (fornecedor_id, produto, produto_chave, categoria, unidade, preco_unitario, quantidade_disponivel)
  values ($1, 'Cebola', 'cebola', 'hortifruti', 'kg', 5, 100)`, [ids.atacado]);
assert.ok(!(await avisos(ids.restaurante)).some((t) => t.includes("Cebola")), "acima do preço não avisa");
await como(ids.atacado, `update ofertas set preco_unitario = 3.80 where produto_chave = 'cebola'`);
assert.ok((await avisos(ids.restaurante)).some((t) => t.includes("Alerta de preço: Cebola a R$ 3,80")), "baixou de preço e avisou");

// Funções internas e chamadas sem login ficam fechadas.
const pode = async (papel, funcao) =>
  (await db.query(`select has_function_privilege($1, $2, 'execute') ok`, [papel, funcao])).rows[0].ok;
assert.equal(await pode("authenticated", "devolver_estoque(reservas)"), false, "devolver_estoque é interna");
assert.equal(await pode("authenticated", "avisar_lance()"), false, "gatilho não é chamável");
assert.equal(await pode("anon", "reservar_oferta(uuid, numeric)"), false, "sem login não reserva");
assert.equal(await pode("anon", "vitrine_ofertas(text)"), false, "sem login não vê a vitrine");
assert.equal(await pode("authenticated", "vitrine_ofertas(text)"), true, "logado vê a vitrine");
assert.equal(await pode("anon", "telefones_de_negocio(uuid[])"), false, "sem login não vê telefones");
assert.equal(await pode("authenticated", "reservar_oferta(uuid, numeric)"), true, "logado reserva");
await falha(ids.restaurante, `select devolver_estoque(r) from reservas r limit 1`, [], /permission denied/);

// Avisos no celular: cada conta ativa o próprio aparelho; a tabela não fica aberta.
await como(ids.restaurante, `select registrar_celular('https://push.exemplo/abc', 'chave', 'segredo')`);
assert.equal((await db.query(`select empresa_id from push_inscricoes`)).rows[0].empresa_id, ids.restaurante);
await falha(ids.atacado, `select * from push_inscricoes`, [], /permission denied/);
await como(ids.atacado, `select registrar_celular('https://push.exemplo/abc', 'chave', 'segredo')`);
assert.equal((await db.query(`select empresa_id from push_inscricoes`)).rows[0].empresa_id, ids.atacado, "o aparelho passa para a conta que entrou nele");
await falha(ids.atacado, `select registrar_celular('http://inseguro', 'a', 'b')`, [], /endereço de notificação válido/);
await como(ids.restaurante, `select remover_celular('https://push.exemplo/abc')`);
assert.equal((await db.query(`select 1 from push_inscricoes`)).rows.length, 1, "não remove o aparelho de outra conta");
await falha(ids.atacado, `select apagar_celular_expirado('chute', 'https://push.exemplo/abc')`, [], /Não autorizado/);
assert.equal(await pode("authenticated", "segredo_push(text)"), false, "ninguém lê o segredo pela API");
await db.query(`insert into avisos (empresa_id, texto, link) values ($1, 'teste', '/')`, [ids.atacado]);
assert.equal((await db.query(`select 1 from avisos where empresa_id = $1 and texto = 'teste'`, [ids.atacado])).rows.length, 1, "sem o cofre configurado o aviso do sino continua");

// Contatos cadastrados à mão ficam só na agenda de quem cadastrou.
await como(ids.restaurante, `insert into contatos_manuais (tipo, nome, telefone) values ('fornecedor', 'Seu Zé da Feira', '83999990000')`);
assert.equal((await como(ids.restaurante, `select nome from contatos_manuais`)).rows.length, 1);
assert.equal((await como(ids.atacado, `select nome from contatos_manuais`)).rows.length, 0, "contatos manuais são privados");
await falha(ids.atacado, `insert into contatos_manuais (dono_id, tipo, nome) values ($1, 'cliente', 'Intruso')`, [ids.restaurante], /row-level security/);
await como(ids.atacado, `delete from contatos_manuais`);
assert.equal((await db.query(`select 1 from contatos_manuais`)).rows.length, 1, "outra conta não apaga");

// Ocultar tira o item só da lista de quem ocultou.
await como(ids.restaurante, `insert into ocultos (tipo, item) values ('oferta', 'x1'), ('historico', 'cebola|kg')`);
assert.equal((await como(ids.restaurante, `select * from ocultos`)).rows.length, 2);
assert.equal((await como(ids.atacado, `select * from ocultos`)).rows.length, 0, "ocultos são privados");
await falha(ids.atacado, `insert into ocultos (empresa_id, tipo, item) values ($1, 'oferta', 'x2')`, [ids.restaurante], /row-level security/);
await como(ids.restaurante, `delete from ocultos where tipo = 'oferta'`);
assert.equal((await como(ids.restaurante, `select * from ocultos`)).rows.length, 1);

// Dá para apagar um fornecedor que venceu um leilão; o pedido fica sem vencedor.
const pedidoGanho = (await db.query(`select id from pedidos where lance_vencedor_id is not null limit 1`)).rows[0].id;
const vencedorDoPedido = (await db.query(`select l.fornecedor_id f from pedidos p join lances l on l.id = p.lance_vencedor_id where p.id = $1`, [pedidoGanho])).rows[0].f;
await db.query(`delete from auth.users where id = $1`, [vencedorDoPedido]);
assert.equal((await db.query(`select lance_vencedor_id from pedidos where id = $1`, [pedidoGanho])).rows[0].lance_vencedor_id, null);

console.log("Todos os testes do banco passaram.");
