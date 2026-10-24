/** Exercita o backend real de composição com contratos das RPCs já instaladas. */
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..');let calls=[],checks=0;
const makeId=n=>'ca700000-0000-4000-8000-'+String(n).padStart(12,'0');
const source=makeId(1),destination=makeId(2),category=makeId(3);
const regular=(n,date='2026-10-24')=>({id:makeId(n),version:1,kind:'standard',nature:n%2?'income':'expense',description:'Registro '+n,amountCents:n,date,accountId:source,categoryId:category,classification:'variable',modality:'single'});
const transfer=(n,date='2026-10-24')=>({id:makeId(n),version:1,description:'Transferência '+n,amountCents:n,date,sourceAccountId:source,destinationAccountId:destination});
let regularRows=[],transferRows=[],brokenTransfers=false;
const accounts=[{id:source,name:'Banco',type:'consumption',initialCents:null,openingDate:null,balanceCents:'-25',projectedCents:'-50',version:1},{id:destination,name:'Reserva',type:'investment',initialCents:null,openingDate:null,balanceCents:'25',projectedCents:'50',version:1}];
function rpc(name,p){
 calls.push({name,args:p});
 if(name==='mukirana_transactions_list'||name==='mukirana_transfers_list'){
  const tr=name==='mukirana_transfers_list';
  if(tr&&brokenTransfers)return {status:'invalid_session'};
  let rows=(tr?transferRows:regularRows).filter(e=>(!p.p_nature||e.nature===p.p_nature)&&(!p.p_category_id||e.categoryId===p.p_category_id)&&(!p.p_classification||e.classification===p.p_classification)&&(!p.p_account_id||[e.accountId,e.sourceAccountId,e.destinationAccountId].includes(p.p_account_id))&&(!p.p_start_date||e.date>=p.p_start_date)&&(!p.p_end_date||e.date<=p.p_end_date)&&e.description.includes(p.p_query));
  rows.sort((a,b)=>a.date>b.date?-1:a.date<b.date?1:a.id>b.id?-1:1);
  const income=rows.filter(e=>e.nature==='income').reduce((s,e)=>s+BigInt(e.amountCents),0n),expense=rows.filter(e=>e.nature==='expense').reduce((s,e)=>s+BigInt(e.amountCents),0n);
  const summary=tr?{count:rows.length,amountCents:rows.reduce((s,e)=>s+BigInt(e.amountCents),0n).toString()}:{count:rows.length,incomeCents:income.toString(),expenseCents:expense.toString(),resultCents:(income-expense).toString()};
  if(p.p_cursor_date)rows=rows.filter(e=>e.date<p.p_cursor_date||(e.date===p.p_cursor_date&&e.id<p.p_cursor_id));
  return {status:'ok',entries:rows.slice(0,p.p_limit),hasMore:rows.length>p.p_limit,summary,accounts,categories:[],today:'2026-10-24'};
 }
 if(name==='mukirana_transfers_save')return {status:'saved',entry:{id:p.p_transfer_id,version:1,description:p.p_description,amountCents:p.p_amount_cents,date:p.p_occurred_on,sourceAccountId:p.p_source_account_id,destinationAccountId:p.p_destination_account_id}};
 if(name==='mukirana_transfers_delete')return {status:'deleted'};
 throw new Error('RPC inesperada');
}
const c=vm.createContext({console,AuthService_:{requireSession(token){if(token!=='valid')throw new Error('AUTH_REQUIRED');}},SupabaseDao_:{rpc}});
for(const file of ['authentication/AuthDomain.js','accounts/AccountDomain.js','categories/CategoryDomain.js','transactions/TransactionDomain.js','transactions/TransactionDao.js','transactions/TransactionService.js','transfers/TransferDomain.js','transfers/TransferDao.js','transfers/TransferService.js','transactions/EntryDomain.js','transactions/EntryService.js','web/ApiController.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);
const run=code=>vm.runInContext(code,c);
regularRows=[regular(10),regular(11)];transferRows=[transfer(12)];
let r=run('api({action:"transactions.list",token:"valid",filter:{}})');assert.equal(r.status,'ok');assert.equal(r.entries.length,3);assert.equal(r.entries[0].nature,'transfer');assert.equal(r.summary.count,3);assert.equal(r.summary.resultCents,'1');assert.equal(r.summary.incomeCents,'11');assert.equal(r.accounts[0].balanceCents,'-25');checks++;
assert.equal(calls.filter(x=>x.name==='mukirana_transfers_list').length,1);assert.equal(calls.at(-1).args.p_user_id,undefined);checks++;
for(const nature of ['income','expense','transfer']){c.filter={nature};r=run('api({action:"transactions.list",token:"valid",filter})');assert(r.entries.every(e=>e.nature===nature));if(nature==='transfer'){assert.equal(r.summary.resultCents,'0');assert.equal(r.summary.incomeCents,'0');}}checks++;
for(const filter of [{categoryId:category},{classification:'variable'},{nature:'transfer',categoryId:category}]){c.filter=filter;calls=[];r=run('api({action:"transactions.list",token:"valid",filter})');assert(!r.entries.some(e=>e.kind==='transfer'));assert(!calls.some(x=>x.name==='mukirana_transfers_list'));}checks++;
// Mistura desigual entre origens, IDs empatados e páginas com tamanhos diversos.
for(const lengths of [[0,0],[3,0],[0,5],[80,2],[2,80],[81,83]])for(const limit of [1,2,7,50,100]){
 regularRows=Array.from({length:lengths[0]},(_,i)=>regular(100+i,`2026-10-${String(1+i%24).padStart(2,'0')}`));
 transferRows=Array.from({length:lengths[1]},(_,i)=>transfer(100+i,`2026-10-${String(1+i%24).padStart(2,'0')}`));
 let cursor=null,seen=[],iterations=0;
 do{
  c.filter={limit,cursor};r=run('api({action:"transactions.list",token:"valid",filter})');assert.equal(r.status,'ok');assert.equal(r.summary.count,lengths[0]+lengths[1]);assert(r.entries.length<=limit);
  seen.push(...r.entries.map(e=>e.kind+':'+e.id));cursor=r.nextCursor;
  assert(++iterations<200);
 }while(r.hasMore);
 assert.equal(new Set(seen).size,lengths[0]+lengths[1]);assert.equal(seen.length,lengths[0]+lengths[1]);
 const expected=[...regularRows,...transferRows.map(e=>({...e,kind:'transfer'}))].sort((a,b)=>a.date>b.date?-1:a.date<b.date?1:a.id>b.id?-1:a.id<b.id?1:a.kind.localeCompare(b.kind)).map(e=>e.kind+':'+e.id);
 assert.deepEqual(seen,expected);
}checks++;
regularRows=[{...regular(200),amountCents:99999999999999},...Array.from({length:100},(_,i)=>({...regular(201+i),nature:'expense',amountCents:99999999999999}))];transferRows=[{...transfer(999),amountCents:99999999999999}];r=run('api({action:"transactions.list",token:"valid",filter:{}})');assert.equal(r.summary.expenseCents,'10099999999999899');assert.equal(r.summary.count,102);checks++;
for(const bad of [{cursor:{standard:{id:source,date:'2026-02-30'}}},{cursor:{transfer:{id:'x',date:'2026-10-24'}}},{cursor:[]},{nature:'unknown'}]){c.filter=bad;assert.equal(run('api({action:"transactions.list",token:"valid",filter})').status,'invalid_request');}checks++;
brokenTransfers=true;assert.equal(run('api({action:"transactions.list",token:"valid",filter:{}})').status,'invalid_session');brokenTransfers=false;checks++;
c.entry={...transfer(700),nature:'transfer',version:0,userId:'attacker',categoryId:category};r=run('api({action:"transactions.save",token:"valid",entry})');assert.equal(r.status,'saved');assert.equal(r.entry.kind,'transfer');assert.equal(r.entry.nature,'transfer');assert.equal(r.entry.userId,undefined);assert.equal(r.entry.categoryId,undefined);assert.equal(calls.at(-1).name,'mukirana_transfers_save');checks++;
r=run('api({action:"transactions.delete",token:"valid",id:entry.id,version:1,kind:"transfer"})');assert.equal(r.status,'deleted');assert.equal(calls.at(-1).name,'mukirana_transfers_delete');checks++;
for(const action of ['transactions.list','transactions.save','transactions.delete']){c.action=action;assert.equal(run('api({action,token:"",entry,id:entry.id,version:1,kind:"transfer"})').status,'invalid_session');}checks++;
assert.equal(run('api({action:"transactions.delete",token:"valid",id:entry.id,version:1,kind:"unknown"})').status,'invalid_request');checks++;
console.log(JSON.stringify({passed:checks,paginationCases:30,groups:'listagem integrada, filtros, empates de IDs, paginação mista, totais exatos e rotas financeiras'}));
