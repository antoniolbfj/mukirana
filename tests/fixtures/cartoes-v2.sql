INSERT INTO usuarios(id_usuario,nome,email) VALUES
('10000000-1000-4000-8000-100000000001','Ana teste','ana@example.invalid'),
('10000000-1000-4000-8000-100000000002','Bruno teste','bruno@example.invalid'),
('10000000-1000-4000-8000-100000000003','Carla teste','carla@example.invalid');
SELECT rpc_cartoes_salvar_v2('10000000-1000-4000-8000-100000000001','20000000-2000-4000-8000-200000000001',0,gen_random_uuid(),'Principal',1000000,10,17,ARRAY['10000000-1000-4000-8000-100000000002'::uuid]);
SELECT rpc_cartoes_salvar_v2('10000000-1000-4000-8000-100000000001','20000000-2000-4000-8000-200000000002',0,gen_random_uuid(),'Dia a dia',500000,20,27,'{}');
SELECT rpc_cartoes_salvar_v2('10000000-1000-4000-8000-100000000003','20000000-2000-4000-8000-200000000003',0,gen_random_uuid(),'Viagens',1000000,5,12,ARRAY['10000000-1000-4000-8000-100000000001'::uuid]);
INSERT INTO contas(id_conta,id_usuario,nome_conta) VALUES('40000000-4000-4000-8000-400000000001','10000000-1000-4000-8000-100000000001','Conta Ana teste');
INSERT INTO lancamentos(tipo,descricao,valor_total,data_ocorrencia,mes_referencia,tipo_origem,id_origem,status,criado_por_id)
SELECT 'Despesa','Compra teste',x.valor,'2026-10-03','2026-10-01','Cartão',c.id_cartao,'Efetivado',c.id_usuario FROM cartoes c JOIN
(VALUES('20000000-2000-4000-8000-200000000001'::uuid,'10000000-1000-4000-8000-100000000001'::uuid,1840),
('20000000-2000-4000-8000-200000000001'::uuid,'10000000-1000-4000-8000-100000000002'::uuid,285),
('20000000-2000-4000-8000-200000000002'::uuid,'10000000-1000-4000-8000-100000000001'::uuid,980),
('20000000-2000-4000-8000-200000000003'::uuid,'10000000-1000-4000-8000-100000000001'::uuid,285),
('20000000-2000-4000-8000-200000000003'::uuid,'10000000-1000-4000-8000-100000000003'::uuid,6400)) x(gid,uid,valor) ON c.id_grupo_cartao=x.gid AND c.id_usuario=x.uid;
INSERT INTO pagamentos_faturas(id_grupo_cartao,id_conta,valor,data_pagamento,mes_referencia,status,criado_por_id)
VALUES('20000000-2000-4000-8000-200000000001','40000000-4000-4000-8000-400000000001',440,'2026-10-20','2026-10-01','Efetivado','10000000-1000-4000-8000-100000000001'),
('20000000-2000-4000-8000-200000000001','40000000-4000-4000-8000-400000000001',100,'2026-10-27','2026-10-01','Pendente','10000000-1000-4000-8000-100000000001');
INSERT INTO recorrencias(id_usuario,descricao,tipo,valor_base,data_inicio,periodicidade_tipo,modo_geracao,status_recorrencia,tipo_origem,id_origem,criado_por_id)
SELECT c.id_usuario,'Recorrência teste','Despesa',180,'2026-09-25','Mensal','Manual','Ativa','Cartão',c.id_cartao,c.id_usuario FROM cartoes c WHERE c.id_grupo_cartao='20000000-2000-4000-8000-200000000001' AND c.tipo_cartao='Titular';

INSERT INTO contas(id_conta,id_usuario,nome_conta) VALUES('40000000-4000-4000-8000-400000000002','10000000-1000-4000-8000-100000000002','Conta Bruno teste');
