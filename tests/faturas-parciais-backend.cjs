// Controllers/modelos reais, somente PostgreSQL local.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{seed,ctx,sql}=require('./faturas-parciais-fixture.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));checks++;},fails=(fn,re)=>{assert.throws(fn,re);checks++;};
const f=seed(),token='owner-token',period={Mes_Inicial:f.month,Mes_Final:f.month};
const detail=()=>ctx.cartoesNovoDetalhar(token,f.group,period).group;
const request=(value,patch={})=>({ID_Grupo_Cartao:f.group,Mes_Referencia:f.month,ID_Conta:f.bank,Valor:value,Data_Pagamento:'2026-10-26',Status:'Efetivado',Observacao:'Teste pagamento simples',...patch});
const count=()=>sql('SELECT count(*) FROM lancamentos'),first=sql("SELECT md5(to_jsonb(p)::text) FROM pagamentos_faturas p WHERE id_pagamento_fatura='"+f.payment+"'");
const payments=()=>JSON.parse(sql("SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') FROM pagamentos_faturas p WHERE id_grupo_cartao='"+f.group+"'"));
eq(detail().openCents,'4000');const before=count();
// O pagamento não efetiva compras nem modifica as despesas do cartão.
sql("UPDATE lancamentos SET status='Pendente' WHERE id_lancamento='"+f.entry+"'");
fails(()=>ctx.registrarPagamentoFaturaCartao(token,request(1,{Mes_Referencia:''})),/competência/);
fails(()=>ctx.registrarPagamentoFaturaCartao(token,request(0)),/maior que zero/);
fails(()=>ctx.registrarPagamentoFaturaCartao('expired',request(1)),/expirada/);
ctx.registrarPagamentoFaturaCartao(token,request(20));eq(detail().openCents,'2000');eq(detail().paidCents,'8000');eq(count(),before);
eq(sql("SELECT status FROM lancamentos WHERE id_lancamento='"+f.entry+"'"),'Pendente');
const second=payments().find(p=>p.id_pagamento_fatura!==f.payment).id_pagamento_fatura;
ctx.atualizarPagamentoFaturaCartao(token,request(40,{ID_Pagamento_Fatura:second,Mes_Referencia:'2026-11-01'}));eq(detail().openCents,'0');eq(detail().creditCents,'0');
ctx.atualizarPagamentoFaturaCartao(token,request(45,{ID_Pagamento_Fatura:second}));eq(detail().openCents,'0');eq(detail().creditCents,'500');
ctx.registrarPagamentoFaturaCartao(token,request(10));eq(detail().creditCents,'1500');eq(count(),before);
eq(sql("SELECT md5(to_jsonb(p)::text) FROM pagamentos_faturas p WHERE id_pagamento_fatura='"+f.payment+"'"),first);
let pack=ctx.lancamentosNovoListar(token,{});const legs=pack.rows.filter(r=>r.entryId===second);eq(legs.length,2);eq(legs.map(r=>r.signedCents).sort(),['-4500','4500']);eq(legs.every(r=>r.type==='transfer'),true);
// O mesmo pagamento em Lançamentos aceita crédito e preserva a idempotência.
const credit=pack.accounts.find(a=>a.linkedGroup===f.group&&a.kind==='Conta'),id=crypto.randomUUID(),op=crypto.randomUUID();
const transfer={id,operationId:op,version:0,type:'transfer',description:'Crédito por transferência',amountCents:'2500',date:'2026-10-26',origin:f.bank,destination:credit.id,invoiceMonth:f.month,classification:'variable',mode:'single',status:'done',shares:[]};
ctx.lancamentosNovoSalvar(token,transfer);ctx.lancamentosNovoSalvar(token,transfer);eq(detail().creditCents,'4000');eq(payments().filter(p=>p.id_pagamento_fatura===id).length,1);eq(count(),before);
ctx.excluirPagamentoFaturaCartao(token,id);eq(detail().creditCents,'1500');eq(count(),before);
// Editar o primeiro parcial para quitar, ou para deixar crédito, é permitido.
const edit=seed(),editRequest={...request(100),ID_Grupo_Cartao:edit.group,ID_Pagamento_Fatura:edit.payment};
ctx.atualizarPagamentoFaturaCartao(token,editRequest);eq(ctx.cartoesNovoDetalhar(token,edit.group,period).group.openCents,'0');
ctx.atualizarPagamentoFaturaCartao(token,{...editRequest,Valor:110});eq(ctx.cartoesNovoDetalhar(token,edit.group,period).group.creditCents,'1000');
console.log(JSON.stringify({checks,result:'PASS',coverage:'partial/full/credit, edits and additional transfers, canonical ledger legs, replay, no expense or purchase-status changes, month and permission validation'}));
