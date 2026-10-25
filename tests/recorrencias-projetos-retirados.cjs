// Validadores legados reais: retirar Projetos não remove a autorização financeira.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {ctx,actors}=require('./faturas-transferencias-gateway.cjs');
vm.runInContext(fs.readFileSync('Recorrencias_Controller.js','utf8'),ctx);
const bank='40000000-4000-4000-8000-400000000001',cat='50000000-5000-4000-8000-500000000011',old='60000000-6000-4000-8000-600000000011';
const context={idLogado:actors.owner,contasAcessiveis:[{ID_Conta:bank,ID_Usuario:actors.owner,Ativa:true}],cartoesAcessiveis:[],categoriasAcessiveis:[{ID_Categoria:cat,Tipo:'Despesa',Ativa:true}],projetosAcessiveis:[]};
const input={Descricao:'Regra antiga',Tipo:'Despesa',Valor_Base:25,Data_Inicio:vm.runInContext('ContasNova_.today()',ctx),Periodicidade_Tipo:'Mensal',Modo_Geracao:'Manual',Tipo_Origem:'Conta',ID_Origem:bank,ID_Categoria:cat,ID_Projeto:old,Status_Lancamento:'Efetivado'};
const fresh=ctx.montarRecorrenciaParaSalvarController_(input,context,null);assert.equal(fresh.ID_Projeto,'');
const original={...fresh,ID_Projeto:old},edited=ctx.montarRecorrenciaParaSalvarController_({...input,ID_Projeto:''},context,original);assert.equal(edited.ID_Projeto,old);
assert.doesNotThrow(()=>ctx.validarChavesRecorrenciaController_(edited,context,original));
assert.throws(()=>ctx.validarChavesRecorrenciaController_({...edited,ID_Origem:'inacessivel'},context,original),/Conta/);
console.log('Recorrências: sem novos projetos, vínculo histórico preservado, projeto inacessível não bloqueia e conta inacessível continua protegida: PASS');
