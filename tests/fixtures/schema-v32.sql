-- Apenas schema para PostgreSQL efêmero de teste; NÃO executar no banco real.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public."usuarios" ("id_usuario" uuid DEFAULT gen_random_uuid() NOT NULL, "nome" text NOT NULL, "email" text NOT NULL, "papel" text DEFAULT 'Usuário'::text NOT NULL, "preferencia_tema" text DEFAULT 'Claro'::text NOT NULL, "ativo" boolean DEFAULT true NOT NULL, "senha_pin" text, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."categorias" ("id_categoria" uuid DEFAULT gen_random_uuid() NOT NULL, "nome" text NOT NULL, "tipo" text NOT NULL, "id_categoria_pai" uuid, "global" boolean DEFAULT false NOT NULL, "ativa" boolean DEFAULT true NOT NULL, "criado_por" uuid, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."recorrencias_rateios" ("id_recorrencia_rateio" uuid DEFAULT gen_random_uuid() NOT NULL, "id_recorrencia" uuid NOT NULL, "id_usuario_responsavel" uuid NOT NULL, "valor_rateado" numeric(14,2) DEFAULT 0 NOT NULL, "percentual" numeric(7,4) DEFAULT 0 NOT NULL, "observacao" text, "modo_rateio" text, "criado_por_id" uuid NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone);
CREATE TABLE public."recorrencias_ocorrencias" ("id_recorrencia_ocorrencia" uuid DEFAULT gen_random_uuid() NOT NULL, "id_recorrencia" uuid NOT NULL, "data_ocorrencia" date NOT NULL, "id_lancamento_gerado" uuid, "status" text DEFAULT 'Gerada'::text NOT NULL, "observacao" text, "criado_por_id" uuid NOT NULL, "alterado_por_id" uuid, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone);
CREATE TABLE public."rateios" ("id_rateio" uuid DEFAULT gen_random_uuid() NOT NULL, "id_lancamento" uuid NOT NULL, "id_usuario_responsavel" uuid NOT NULL, "id_usuario_credor" uuid NOT NULL, "valor_rateado" numeric(14,2) DEFAULT 0 NOT NULL, "percentual" numeric(7,4) DEFAULT 0 NOT NULL, "status" text DEFAULT 'Pendente'::text NOT NULL, "criado_por_id" uuid NOT NULL, "alterado_por_id" uuid, "observacao" text, "modo_rateio" text, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone);
CREATE TABLE public."lancamentos" ("id_lancamento" uuid DEFAULT gen_random_uuid() NOT NULL, "tipo" text NOT NULL, "descricao" text NOT NULL, "valor_total" numeric(14,2) DEFAULT 0 NOT NULL, "data_ocorrencia" date NOT NULL, "mes_referencia" date NOT NULL, "id_categoria" uuid, "tipo_origem" text NOT NULL, "id_origem" uuid NOT NULL, "id_destino" uuid, "id_projeto" uuid, "email_autor" text, "status" text NOT NULL, "criado_por_id" uuid NOT NULL, "alterado_por_id" uuid, "id_grupo_parcela" uuid, "numero_parcela" integer, "total_parcelas" integer, "id_recorrencia_origem" uuid, "modo_recorrencia_origem" text, "data_ocorrencia_recorrencia" date, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone);
CREATE TABLE public."recorrencias" ("id_recorrencia" uuid DEFAULT gen_random_uuid() NOT NULL, "id_usuario" uuid NOT NULL, "descricao" text NOT NULL, "tipo" text NOT NULL, "valor_base" numeric(14,2) DEFAULT 0 NOT NULL, "data_inicio" date NOT NULL, "periodicidade_tipo" text NOT NULL, "intervalo_dias" integer, "modo_geracao" text NOT NULL, "status_recorrencia" text NOT NULL, "tipo_origem" text NOT NULL, "id_origem" uuid NOT NULL, "id_destino" uuid, "id_categoria" uuid, "id_projeto" uuid, "status_lancamento" text DEFAULT 'Pendente'::text NOT NULL, "observacao" text, "info_bloqueio" text, "criado_por_id" uuid NOT NULL, "alterado_por_id" uuid, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone);
CREATE TABLE public."orcamentos" ("id_orcamento" uuid DEFAULT gen_random_uuid() NOT NULL, "id_usuario" uuid NOT NULL, "id_categoria" uuid NOT NULL, "valor_teto" numeric(14,2) DEFAULT 0 NOT NULL, "ativo" boolean DEFAULT true NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone);
CREATE TABLE public."projetos_compartilhamentos" ("id_compartilhamento" uuid DEFAULT gen_random_uuid() NOT NULL, "id_projeto" uuid NOT NULL, "id_usuario" uuid NOT NULL, "ativo" boolean DEFAULT true NOT NULL, "papel_no_projeto" text DEFAULT 'Participante'::text NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."projetos" ("id_projeto" uuid DEFAULT gen_random_uuid() NOT NULL, "nome" text NOT NULL, "orcamento_teto" numeric(14,2) DEFAULT 0 NOT NULL, "compartilhado" boolean DEFAULT false NOT NULL, "ativo" boolean DEFAULT true NOT NULL, "criado_por" uuid NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."cartoes_compartilhados" ("id_compartilhamento" uuid DEFAULT gen_random_uuid() NOT NULL, "id_cartao" uuid NOT NULL, "id_usuario" uuid NOT NULL, "ativo" boolean DEFAULT true NOT NULL, "papel_no_cartao" text DEFAULT 'Participante'::text NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."cartoes" ("id_cartao" uuid DEFAULT gen_random_uuid() NOT NULL, "id_grupo_cartao" uuid NOT NULL, "id_usuario" uuid NOT NULL, "nome_cartao" text NOT NULL, "tipo_cartao" text NOT NULL, "ativo" boolean DEFAULT true NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."grupos_cartoes" ("id_grupo_cartao" uuid DEFAULT gen_random_uuid() NOT NULL, "id_titular" uuid NOT NULL, "nome_grupo" text NOT NULL, "limite" numeric(14,2) DEFAULT 0 NOT NULL, "dia_fechamento" smallint NOT NULL, "dia_vencimento" smallint NOT NULL, "ativo" boolean DEFAULT true NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."contas_compartilhamentos" ("id_compartilhamento" uuid DEFAULT gen_random_uuid() NOT NULL, "id_conta" uuid NOT NULL, "id_usuario" uuid NOT NULL, "ativo" boolean DEFAULT true NOT NULL, "papel_na_conta" text DEFAULT 'Participante'::text NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."contas" ("id_conta" uuid DEFAULT gen_random_uuid() NOT NULL, "id_usuario" uuid NOT NULL, "nome_conta" text NOT NULL, "saldo_inicial" numeric(14,2) DEFAULT 0 NOT NULL, "ativa" boolean DEFAULT true NOT NULL, "compartilhada" boolean DEFAULT false NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."acertos_rateios" ("id_acerto_rateio" uuid DEFAULT gen_random_uuid() NOT NULL, "mes_referencia" date NOT NULL, "id_usuario_devedor" uuid NOT NULL, "id_usuario_credor" uuid NOT NULL, "valor" numeric(14,2) NOT NULL, "data_pagamento" date, "data_recebimento" date, "modalidade" text DEFAULT 'Liquidacao'::text NOT NULL, "status" text NOT NULL, "forma_devedor" text, "forma_credor" text, "id_conta_devedor" uuid, "id_conta_credor" uuid, "id_lancamento_pagamento" uuid, "id_lancamento_recebimento" uuid, "id_pagamento_fatura" uuid, "ids_rateios" uuid[] DEFAULT '{}'::uuid[] NOT NULL, "observacao_devedor" text, "observacao_credor" text, "criado_por_id" uuid NOT NULL, "alterado_por_id" uuid, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone);
CREATE TABLE public."pagamentos_faturas" ("id_pagamento_fatura" uuid DEFAULT gen_random_uuid() NOT NULL, "id_grupo_cartao" uuid NOT NULL, "id_conta" uuid NOT NULL, "valor" numeric(14,2) NOT NULL, "data_pagamento" date NOT NULL, "mes_referencia" date NOT NULL, "status" text DEFAULT 'Efetivado'::text NOT NULL, "observacao" text, "criado_por_id" uuid NOT NULL, "alterado_por_id" uuid, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone);
ALTER TABLE public."usuarios" ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY (id_usuario);
ALTER TABLE public."categorias" ADD CONSTRAINT "categorias_pkey" PRIMARY KEY (id_categoria);
ALTER TABLE public."recorrencias_rateios" ADD CONSTRAINT "recorrencias_rateios_pkey" PRIMARY KEY (id_recorrencia_rateio);
ALTER TABLE public."recorrencias_ocorrencias" ADD CONSTRAINT "recorrencias_ocorrencias_pkey" PRIMARY KEY (id_recorrencia_ocorrencia);
ALTER TABLE public."rateios" ADD CONSTRAINT "rateios_pkey" PRIMARY KEY (id_rateio);
ALTER TABLE public."lancamentos" ADD CONSTRAINT "lancamentos_pkey" PRIMARY KEY (id_lancamento);
ALTER TABLE public."recorrencias" ADD CONSTRAINT "recorrencias_pkey" PRIMARY KEY (id_recorrencia);
ALTER TABLE public."orcamentos" ADD CONSTRAINT "orcamentos_pkey" PRIMARY KEY (id_orcamento);
ALTER TABLE public."projetos_compartilhamentos" ADD CONSTRAINT "projetos_compartilhamentos_pkey" PRIMARY KEY (id_compartilhamento);
ALTER TABLE public."projetos" ADD CONSTRAINT "projetos_pkey" PRIMARY KEY (id_projeto);
ALTER TABLE public."cartoes_compartilhados" ADD CONSTRAINT "cartoes_compartilhados_pkey" PRIMARY KEY (id_compartilhamento);
ALTER TABLE public."cartoes" ADD CONSTRAINT "cartoes_pkey" PRIMARY KEY (id_cartao);
ALTER TABLE public."grupos_cartoes" ADD CONSTRAINT "grupos_cartoes_pkey" PRIMARY KEY (id_grupo_cartao);
ALTER TABLE public."contas_compartilhamentos" ADD CONSTRAINT "contas_compartilhamentos_pkey" PRIMARY KEY (id_compartilhamento);
ALTER TABLE public."contas" ADD CONSTRAINT "contas_pkey" PRIMARY KEY (id_conta);
ALTER TABLE public."acertos_rateios" ADD CONSTRAINT "acertos_rateios_pkey" PRIMARY KEY (id_acerto_rateio);
ALTER TABLE public."pagamentos_faturas" ADD CONSTRAINT "pagamentos_faturas_pkey" PRIMARY KEY (id_pagamento_fatura);
ALTER TABLE public."usuarios" ADD CONSTRAINT "usuarios_email_unico" UNIQUE (email);
ALTER TABLE public."orcamentos" ADD CONSTRAINT "orcamentos_usuario_categoria_unico" UNIQUE (id_usuario, id_categoria);
ALTER TABLE public."projetos_compartilhamentos" ADD CONSTRAINT "projetos_compartilhamentos_unico" UNIQUE (id_projeto, id_usuario);
ALTER TABLE public."cartoes_compartilhados" ADD CONSTRAINT "cartoes_compartilhados_unico" UNIQUE (id_cartao, id_usuario);
ALTER TABLE public."cartoes" ADD CONSTRAINT "cartoes_usuario_grupo_unico" UNIQUE (id_grupo_cartao, id_usuario);
ALTER TABLE public."contas_compartilhamentos" ADD CONSTRAINT "contas_compartilhamentos_unico" UNIQUE (id_conta, id_usuario);
ALTER TABLE public."usuarios" ADD CONSTRAINT "usuarios_papel_check" CHECK ((papel = ANY (ARRAY['Administrador'::text, 'Usuário'::text, 'Usuário Virtual'::text])));
ALTER TABLE public."usuarios" ADD CONSTRAINT "usuarios_tema_check" CHECK ((preferencia_tema = ANY (ARRAY['Claro'::text, 'Escuro'::text])));
ALTER TABLE public."categorias" ADD CONSTRAINT "categorias_sem_autoreferencia" CHECK (((id_categoria_pai IS NULL) OR (id_categoria_pai <> id_categoria)));
ALTER TABLE public."categorias" ADD CONSTRAINT "categorias_tipo_check" CHECK ((tipo = ANY (ARRAY['Despesa'::text, 'Receita'::text])));
ALTER TABLE public."recorrencias_ocorrencias" ADD CONSTRAINT "recorrencias_ocorrencias_status_check" CHECK ((status = 'Gerada'::text));
ALTER TABLE public."rateios" ADD CONSTRAINT "rateios_status_check" CHECK ((status = ANY (ARRAY['Pendente'::text, 'Acertado'::text, 'Cancelado'::text])));
ALTER TABLE public."lancamentos" ADD CONSTRAINT "lancamentos_origem_check" CHECK ((tipo_origem = ANY (ARRAY['Conta'::text, 'Cartão'::text])));
ALTER TABLE public."lancamentos" ADD CONSTRAINT "lancamentos_parcela_numero_check" CHECK (((numero_parcela IS NULL) OR (numero_parcela >= 1)));
ALTER TABLE public."lancamentos" ADD CONSTRAINT "lancamentos_status_check" CHECK ((status = ANY (ARRAY['Efetivado'::text, 'Pendente'::text])));
ALTER TABLE public."lancamentos" ADD CONSTRAINT "lancamentos_tipo_check" CHECK ((tipo = ANY (ARRAY['Despesa'::text, 'Receita'::text, 'Transferência'::text])));
ALTER TABLE public."lancamentos" ADD CONSTRAINT "lancamentos_total_parcelas_check" CHECK (((total_parcelas IS NULL) OR (total_parcelas >= 1)));
ALTER TABLE public."lancamentos" ADD CONSTRAINT "lancamentos_transferencia_destino_check" CHECK (((tipo <> 'Transferência'::text) OR (id_destino IS NOT NULL)));
ALTER TABLE public."recorrencias" ADD CONSTRAINT "recorrencias_intervalo_personalizado_check" CHECK (((periodicidade_tipo <> 'Personalizada'::text) OR (intervalo_dias IS NOT NULL)));
ALTER TABLE public."recorrencias" ADD CONSTRAINT "recorrencias_modo_check" CHECK ((modo_geracao = ANY (ARRAY['Manual'::text, 'Automática'::text])));
ALTER TABLE public."recorrencias" ADD CONSTRAINT "recorrencias_origem_check" CHECK ((tipo_origem = ANY (ARRAY['Conta'::text, 'Cartão'::text])));
ALTER TABLE public."recorrencias" ADD CONSTRAINT "recorrencias_periodicidade_check" CHECK ((periodicidade_tipo = ANY (ARRAY['Mensal'::text, 'Personalizada'::text])));
ALTER TABLE public."recorrencias" ADD CONSTRAINT "recorrencias_status_check" CHECK ((status_recorrencia = ANY (ARRAY['Ativa'::text, 'Inativa'::text, 'Revisão necessária'::text])));
ALTER TABLE public."recorrencias" ADD CONSTRAINT "recorrencias_status_lancamento_check" CHECK ((status_lancamento = ANY (ARRAY['Efetivado'::text, 'Pendente'::text])));
ALTER TABLE public."recorrencias" ADD CONSTRAINT "recorrencias_tipo_check" CHECK ((tipo = ANY (ARRAY['Despesa'::text, 'Receita'::text, 'Transferência'::text])));
ALTER TABLE public."projetos_compartilhamentos" ADD CONSTRAINT "projetos_compartilhamentos_papel_check" CHECK ((papel_no_projeto = ANY (ARRAY['Dono'::text, 'Participante'::text])));
ALTER TABLE public."cartoes" ADD CONSTRAINT "cartoes_tipo_check" CHECK ((tipo_cartao = ANY (ARRAY['Titular'::text, 'Adicional'::text])));
ALTER TABLE public."grupos_cartoes" ADD CONSTRAINT "grupos_cartoes_dia_fechamento_check" CHECK (((dia_fechamento >= 1) AND (dia_fechamento <= 31)));
ALTER TABLE public."grupos_cartoes" ADD CONSTRAINT "grupos_cartoes_dia_vencimento_check" CHECK (((dia_vencimento >= 1) AND (dia_vencimento <= 31)));
ALTER TABLE public."contas_compartilhamentos" ADD CONSTRAINT "contas_compartilhamentos_papel_check" CHECK ((papel_na_conta = ANY (ARRAY['Dono'::text, 'Participante'::text])));
ALTER TABLE public."acertos_rateios" ADD CONSTRAINT "acertos_rateios_estado_valido" CHECK ((((modalidade = 'Perda'::text) AND (status = 'Efetivado'::text) AND (forma_devedor IS NULL) AND (forma_credor IS NULL) AND (id_lancamento_pagamento IS NULL) AND (id_lancamento_recebimento IS NULL) AND (id_pagamento_fatura IS NULL)) OR ((modalidade = 'Liquidacao'::text) AND (forma_devedor IS NOT NULL) AND (((forma_devedor = 'Novo'::text) AND (id_conta_devedor IS NOT NULL) AND (id_lancamento_pagamento IS NOT NULL)) OR ((forma_devedor = 'Existente'::text) AND (id_lancamento_pagamento IS NOT NULL)) OR ((forma_devedor = 'Fatura'::text) AND (id_pagamento_fatura IS NOT NULL))) AND (((status = 'Aguardando_Credor'::text) AND (forma_credor IS NULL)) OR ((status = 'Efetivado'::text) AND (forma_credor IS NOT NULL) AND (((forma_credor = 'Novo'::text) AND (id_conta_credor IS NOT NULL) AND (id_lancamento_recebimento IS NOT NULL)) OR ((forma_credor = 'Existente'::text) AND (id_lancamento_recebimento IS NOT NULL)) OR ((forma_credor = 'Sem_Movimento'::text) AND (forma_devedor = 'Fatura'::text))))))));
ALTER TABLE public."acertos_rateios" ADD CONSTRAINT "acertos_rateios_forma_credor_check" CHECK ((forma_credor = ANY (ARRAY['Novo'::text, 'Existente'::text, 'Sem_Movimento'::text])));
ALTER TABLE public."acertos_rateios" ADD CONSTRAINT "acertos_rateios_forma_devedor_check" CHECK ((forma_devedor = ANY (ARRAY['Novo'::text, 'Existente'::text, 'Fatura'::text])));
ALTER TABLE public."acertos_rateios" ADD CONSTRAINT "acertos_rateios_modalidade_check" CHECK ((modalidade = ANY (ARRAY['Liquidacao'::text, 'Perda'::text])));
ALTER TABLE public."acertos_rateios" ADD CONSTRAINT "acertos_rateios_partes_distintas" CHECK ((id_usuario_devedor <> id_usuario_credor));
ALTER TABLE public."acertos_rateios" ADD CONSTRAINT "acertos_rateios_status_check" CHECK ((status = ANY (ARRAY['Aguardando_Credor'::text, 'Efetivado'::text, 'Cancelado'::text])));
ALTER TABLE public."acertos_rateios" ADD CONSTRAINT "acertos_rateios_valor_check" CHECK ((valor > (0)::numeric));
ALTER TABLE public."pagamentos_faturas" ADD CONSTRAINT "pagamentos_faturas_status_check" CHECK ((status = ANY (ARRAY['Efetivado'::text, 'Pendente'::text])));
ALTER TABLE public."pagamentos_faturas" ADD CONSTRAINT "pagamentos_faturas_valor_check" CHECK ((valor > (0)::numeric));
ALTER TABLE public."categorias" ADD CONSTRAINT "categorias_criado_por_fkey" FOREIGN KEY (criado_por) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."categorias" ADD CONSTRAINT "categorias_id_categoria_pai_fkey" FOREIGN KEY (id_categoria_pai) REFERENCES categorias(id_categoria) ON DELETE RESTRICT;
ALTER TABLE public."recorrencias_rateios" ADD CONSTRAINT "recorrencias_rateios_criado_por_id_fkey" FOREIGN KEY (criado_por_id) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."recorrencias_rateios" ADD CONSTRAINT "recorrencias_rateios_id_recorrencia_fkey" FOREIGN KEY (id_recorrencia) REFERENCES recorrencias(id_recorrencia) ON DELETE CASCADE;
ALTER TABLE public."recorrencias_rateios" ADD CONSTRAINT "recorrencias_rateios_id_usuario_responsavel_fkey" FOREIGN KEY (id_usuario_responsavel) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."recorrencias_ocorrencias" ADD CONSTRAINT "recorrencias_ocorrencias_alterado_por_id_fkey" FOREIGN KEY (alterado_por_id) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."recorrencias_ocorrencias" ADD CONSTRAINT "recorrencias_ocorrencias_criado_por_id_fkey" FOREIGN KEY (criado_por_id) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."recorrencias_ocorrencias" ADD CONSTRAINT "recorrencias_ocorrencias_id_lancamento_gerado_fkey" FOREIGN KEY (id_lancamento_gerado) REFERENCES lancamentos(id_lancamento) ON DELETE SET NULL;
ALTER TABLE public."recorrencias_ocorrencias" ADD CONSTRAINT "recorrencias_ocorrencias_id_recorrencia_fkey" FOREIGN KEY (id_recorrencia) REFERENCES recorrencias(id_recorrencia) ON DELETE CASCADE;
ALTER TABLE public."rateios" ADD CONSTRAINT "rateios_alterado_por_id_fkey" FOREIGN KEY (alterado_por_id) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."rateios" ADD CONSTRAINT "rateios_criado_por_id_fkey" FOREIGN KEY (criado_por_id) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."rateios" ADD CONSTRAINT "rateios_id_lancamento_fkey" FOREIGN KEY (id_lancamento) REFERENCES lancamentos(id_lancamento) ON DELETE CASCADE;
ALTER TABLE public."rateios" ADD CONSTRAINT "rateios_id_usuario_credor_fkey" FOREIGN KEY (id_usuario_credor) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."rateios" ADD CONSTRAINT "rateios_id_usuario_responsavel_fkey" FOREIGN KEY (id_usuario_responsavel) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."lancamentos" ADD CONSTRAINT "lancamentos_alterado_por_id_fkey" FOREIGN KEY (alterado_por_id) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."lancamentos" ADD CONSTRAINT "lancamentos_criado_por_id_fkey" FOREIGN KEY (criado_por_id) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."lancamentos" ADD CONSTRAINT "lancamentos_id_categoria_fkey" FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria) ON DELETE RESTRICT;
ALTER TABLE public."lancamentos" ADD CONSTRAINT "lancamentos_id_destino_fkey" FOREIGN KEY (id_destino) REFERENCES contas(id_conta) ON DELETE RESTRICT;
ALTER TABLE public."lancamentos" ADD CONSTRAINT "lancamentos_id_projeto_fkey" FOREIGN KEY (id_projeto) REFERENCES projetos(id_projeto) ON DELETE RESTRICT;
ALTER TABLE public."lancamentos" ADD CONSTRAINT "lancamentos_id_recorrencia_origem_fkey" FOREIGN KEY (id_recorrencia_origem) REFERENCES recorrencias(id_recorrencia) ON DELETE SET NULL;
ALTER TABLE public."recorrencias" ADD CONSTRAINT "recorrencias_alterado_por_id_fkey" FOREIGN KEY (alterado_por_id) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."recorrencias" ADD CONSTRAINT "recorrencias_criado_por_id_fkey" FOREIGN KEY (criado_por_id) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."recorrencias" ADD CONSTRAINT "recorrencias_id_categoria_fkey" FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria) ON DELETE RESTRICT;
ALTER TABLE public."recorrencias" ADD CONSTRAINT "recorrencias_id_destino_fkey" FOREIGN KEY (id_destino) REFERENCES contas(id_conta) ON DELETE RESTRICT;
ALTER TABLE public."recorrencias" ADD CONSTRAINT "recorrencias_id_projeto_fkey" FOREIGN KEY (id_projeto) REFERENCES projetos(id_projeto) ON DELETE RESTRICT;
ALTER TABLE public."recorrencias" ADD CONSTRAINT "recorrencias_id_usuario_fkey" FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."orcamentos" ADD CONSTRAINT "orcamentos_id_categoria_fkey" FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria) ON DELETE RESTRICT;
ALTER TABLE public."orcamentos" ADD CONSTRAINT "orcamentos_id_usuario_fkey" FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE;
ALTER TABLE public."projetos_compartilhamentos" ADD CONSTRAINT "projetos_compartilhamentos_id_projeto_fkey" FOREIGN KEY (id_projeto) REFERENCES projetos(id_projeto) ON DELETE CASCADE;
ALTER TABLE public."projetos_compartilhamentos" ADD CONSTRAINT "projetos_compartilhamentos_id_usuario_fkey" FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."projetos" ADD CONSTRAINT "projetos_criado_por_fkey" FOREIGN KEY (criado_por) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."cartoes_compartilhados" ADD CONSTRAINT "cartoes_compartilhados_id_cartao_fkey" FOREIGN KEY (id_cartao) REFERENCES cartoes(id_cartao) ON DELETE CASCADE;
ALTER TABLE public."cartoes_compartilhados" ADD CONSTRAINT "cartoes_compartilhados_id_usuario_fkey" FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."cartoes" ADD CONSTRAINT "cartoes_id_grupo_cartao_fkey" FOREIGN KEY (id_grupo_cartao) REFERENCES grupos_cartoes(id_grupo_cartao) ON DELETE RESTRICT;
ALTER TABLE public."cartoes" ADD CONSTRAINT "cartoes_id_usuario_fkey" FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."grupos_cartoes" ADD CONSTRAINT "grupos_cartoes_id_titular_fkey" FOREIGN KEY (id_titular) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."contas_compartilhamentos" ADD CONSTRAINT "contas_compartilhamentos_id_conta_fkey" FOREIGN KEY (id_conta) REFERENCES contas(id_conta) ON DELETE CASCADE;
ALTER TABLE public."contas_compartilhamentos" ADD CONSTRAINT "contas_compartilhamentos_id_usuario_fkey" FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."contas" ADD CONSTRAINT "contas_id_usuario_fkey" FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."acertos_rateios" ADD CONSTRAINT "acertos_rateios_alterado_por_id_fkey" FOREIGN KEY (alterado_por_id) REFERENCES usuarios(id_usuario);
ALTER TABLE public."acertos_rateios" ADD CONSTRAINT "acertos_rateios_criado_por_id_fkey" FOREIGN KEY (criado_por_id) REFERENCES usuarios(id_usuario);
ALTER TABLE public."acertos_rateios" ADD CONSTRAINT "acertos_rateios_id_conta_credor_fkey" FOREIGN KEY (id_conta_credor) REFERENCES contas(id_conta);
ALTER TABLE public."acertos_rateios" ADD CONSTRAINT "acertos_rateios_id_conta_devedor_fkey" FOREIGN KEY (id_conta_devedor) REFERENCES contas(id_conta);
ALTER TABLE public."acertos_rateios" ADD CONSTRAINT "acertos_rateios_id_lancamento_pagamento_fkey" FOREIGN KEY (id_lancamento_pagamento) REFERENCES lancamentos(id_lancamento);
ALTER TABLE public."acertos_rateios" ADD CONSTRAINT "acertos_rateios_id_lancamento_recebimento_fkey" FOREIGN KEY (id_lancamento_recebimento) REFERENCES lancamentos(id_lancamento);
ALTER TABLE public."acertos_rateios" ADD CONSTRAINT "acertos_rateios_id_pagamento_fatura_fkey" FOREIGN KEY (id_pagamento_fatura) REFERENCES pagamentos_faturas(id_pagamento_fatura);
ALTER TABLE public."acertos_rateios" ADD CONSTRAINT "acertos_rateios_id_usuario_credor_fkey" FOREIGN KEY (id_usuario_credor) REFERENCES usuarios(id_usuario);
ALTER TABLE public."acertos_rateios" ADD CONSTRAINT "acertos_rateios_id_usuario_devedor_fkey" FOREIGN KEY (id_usuario_devedor) REFERENCES usuarios(id_usuario);
ALTER TABLE public."pagamentos_faturas" ADD CONSTRAINT "pagamentos_faturas_alterado_por_id_fkey" FOREIGN KEY (alterado_por_id) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."pagamentos_faturas" ADD CONSTRAINT "pagamentos_faturas_criado_por_id_fkey" FOREIGN KEY (criado_por_id) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE public."pagamentos_faturas" ADD CONSTRAINT "pagamentos_faturas_id_conta_fkey" FOREIGN KEY (id_conta) REFERENCES contas(id_conta) ON DELETE RESTRICT;
ALTER TABLE public."pagamentos_faturas" ADD CONSTRAINT "pagamentos_faturas_id_grupo_cartao_fkey" FOREIGN KEY (id_grupo_cartao) REFERENCES grupos_cartoes(id_grupo_cartao) ON DELETE RESTRICT;
CREATE INDEX idx_usuarios_ativo ON public.usuarios USING btree (ativo);
CREATE INDEX idx_categorias_tipo_ativa ON public.categorias USING btree (tipo, ativa);
CREATE INDEX idx_categorias_criado_por ON public.categorias USING btree (criado_por);
CREATE INDEX idx_recorrencias_rateios_recorrencia ON public.recorrencias_rateios USING btree (id_recorrencia);
CREATE UNIQUE INDEX uq_recorrencias_ocorrencias_rec_data ON public.recorrencias_ocorrencias USING btree (id_recorrencia, data_ocorrencia);
CREATE INDEX idx_recorrencias_ocorrencias_recorrencia ON public.recorrencias_ocorrencias USING btree (id_recorrencia);
CREATE INDEX idx_recorrencias_ocorrencias_lancamento ON public.recorrencias_ocorrencias USING btree (id_lancamento_gerado);
CREATE INDEX idx_rateios_lancamento ON public.rateios USING btree (id_lancamento);
CREATE INDEX idx_rateios_responsavel_status ON public.rateios USING btree (id_usuario_responsavel, status);
CREATE INDEX idx_rateios_credor_status ON public.rateios USING btree (id_usuario_credor, status);
CREATE INDEX idx_lancamentos_mes ON public.lancamentos USING btree (mes_referencia);
CREATE INDEX idx_lancamentos_usuario_mes ON public.lancamentos USING btree (criado_por_id, mes_referencia);
CREATE INDEX idx_lancamentos_categoria_mes ON public.lancamentos USING btree (id_categoria, mes_referencia);
CREATE INDEX idx_lancamentos_projeto_mes ON public.lancamentos USING btree (id_projeto, mes_referencia);
CREATE INDEX idx_lancamentos_origem_mes ON public.lancamentos USING btree (tipo_origem, id_origem, mes_referencia);
CREATE INDEX idx_lancamentos_status_mes ON public.lancamentos USING btree (status, mes_referencia);
CREATE INDEX idx_lancamentos_grupo_parcela ON public.lancamentos USING btree (id_grupo_parcela);
CREATE INDEX idx_lancamentos_recorrencia ON public.lancamentos USING btree (id_recorrencia_origem);
CREATE INDEX idx_recorrencias_usuario_status ON public.recorrencias USING btree (id_usuario, status_recorrencia);
CREATE INDEX idx_recorrencias_modo_status ON public.recorrencias USING btree (modo_geracao, status_recorrencia);
CREATE INDEX idx_orcamentos_usuario_ativo ON public.orcamentos USING btree (id_usuario, ativo);
CREATE INDEX idx_projetos_compartilhamentos_usuario ON public.projetos_compartilhamentos USING btree (id_usuario, ativo);
CREATE INDEX idx_projetos_criado_por_ativo ON public.projetos USING btree (criado_por, ativo);
CREATE INDEX idx_cartoes_usuario_ativo ON public.cartoes USING btree (id_usuario, ativo);
CREATE INDEX idx_cartoes_grupo_ativo ON public.cartoes USING btree (id_grupo_cartao, ativo);
CREATE INDEX idx_grupos_cartoes_titular_ativo ON public.grupos_cartoes USING btree (id_titular, ativo);
CREATE INDEX idx_contas_compartilhamentos_usuario ON public.contas_compartilhamentos USING btree (id_usuario, ativo);
CREATE INDEX idx_contas_usuario_ativa ON public.contas USING btree (id_usuario, ativa);
CREATE INDEX acertos_rateios_partes_mes_idx ON public.acertos_rateios USING btree (id_usuario_devedor, id_usuario_credor, mes_referencia);
CREATE INDEX acertos_rateios_status_idx ON public.acertos_rateios USING btree (status, id_usuario_credor);
CREATE INDEX acertos_rateios_pagamento_idx ON public.acertos_rateios USING btree (id_lancamento_pagamento) WHERE (id_lancamento_pagamento IS NOT NULL);
CREATE INDEX acertos_rateios_recebimento_idx ON public.acertos_rateios USING btree (id_lancamento_recebimento) WHERE (id_lancamento_recebimento IS NOT NULL);
CREATE INDEX idx_pagamentos_faturas_grupo_mes ON public.pagamentos_faturas USING btree (id_grupo_cartao, mes_referencia);
CREATE INDEX idx_pagamentos_faturas_conta_data ON public.pagamentos_faturas USING btree (id_conta, data_pagamento);
CREATE INDEX idx_pagamentos_faturas_criado_por ON public.pagamentos_faturas USING btree (criado_por_id);
CREATE OR REPLACE FUNCTION public.rpc_contexto_financeiro_mukirana(p_id_usuario uuid, p_mes_referencia date DEFAULT NULL::date, p_incluir_historico boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'usuarios', coalesce((
      select jsonb_agg(to_jsonb(u) order by u.nome)
      from public.usuarios u
    ), '[]'::jsonb),

    'categorias', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.nome)
      from public.categorias c
    ), '[]'::jsonb),

    'contas', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.nome_conta)
      from public.contas c
    ), '[]'::jsonb),

    'contas_compartilhamentos', coalesce((
      select jsonb_agg(to_jsonb(cc) order by cc.id_conta, cc.papel_na_conta, cc.id_usuario)
      from public.contas_compartilhamentos cc
      where cc.ativo = true
    ), '[]'::jsonb),

    'grupos_cartoes', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.nome_grupo)
      from public.grupos_cartoes g
    ), '[]'::jsonb),

    'cartoes', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.nome_cartao)
      from public.cartoes c
    ), '[]'::jsonb),

    'cartoes_compartilhados', coalesce((
      select jsonb_agg(to_jsonb(cc) order by cc.id_cartao, cc.id_usuario)
      from public.cartoes_compartilhados cc
      where cc.ativo = true
    ), '[]'::jsonb),

    'projetos', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.nome)
      from public.projetos p
    ), '[]'::jsonb),

    'projetos_compartilhamentos', coalesce((
      select jsonb_agg(to_jsonb(pc) order by pc.id_projeto, pc.papel_no_projeto, pc.id_usuario)
      from public.projetos_compartilhamentos pc
      where pc.ativo = true
    ), '[]'::jsonb),

    'lancamentos', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.data_ocorrencia asc)
      from public.lancamentos l
      where p_mes_referencia is null
         or l.mes_referencia = p_mes_referencia
         or (
           p_incluir_historico = true
           and l.data_ocorrencia <= (date_trunc('month', p_mes_referencia)::date + interval '1 month - 1 day')::date
         )
    ), '[]'::jsonb),

    'rateios', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at asc)
      from public.rateios r
      where p_mes_referencia is null
         or exists (
           select 1
           from public.lancamentos l
           where l.id_lancamento = r.id_lancamento
             and (
               l.mes_referencia = p_mes_referencia
               or (
                 p_incluir_historico = true
                 and l.data_ocorrencia <= (date_trunc('month', p_mes_referencia)::date + interval '1 month - 1 day')::date
               )
             )
         )
    ), '[]'::jsonb),

    'pagamentos_faturas', coalesce((
      select jsonb_agg(to_jsonb(pf) order by pf.data_pagamento asc)
      from public.pagamentos_faturas pf
      where p_mes_referencia is null
         or pf.mes_referencia = p_mes_referencia
         or pf.data_pagamento between date_trunc('month', p_mes_referencia)::date
           and (date_trunc('month', p_mes_referencia)::date + interval '1 month - 1 day')::date
         or (
           p_incluir_historico = true
           and pf.data_pagamento <= (date_trunc('month', p_mes_referencia)::date + interval '1 month - 1 day')::date
         )
    ), '[]'::jsonb),

    'orcamentos', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.created_at asc)
      from public.orcamentos o
      where o.id_usuario = p_id_usuario
    ), '[]'::jsonb),

    'recorrencias', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.data_inicio asc)
      from public.recorrencias r
      where r.id_usuario = p_id_usuario
         or r.criado_por_id = p_id_usuario
    ), '[]'::jsonb),

    'recorrencias_rateios', coalesce((
      select jsonb_agg(to_jsonb(rr) order by rr.created_at asc)
      from public.recorrencias_rateios rr
      where exists (
        select 1
        from public.recorrencias r
        where r.id_recorrencia = rr.id_recorrencia
          and (r.id_usuario = p_id_usuario or r.criado_por_id = p_id_usuario)
      )
    ), '[]'::jsonb),

    'recorrencias_ocorrencias', coalesce((
      select jsonb_agg(to_jsonb(ro) order by ro.data_ocorrencia asc)
      from public.recorrencias_ocorrencias ro
      where exists (
        select 1
        from public.recorrencias r
        where r.id_recorrencia = ro.id_recorrencia
          and (r.id_usuario = p_id_usuario or r.criado_por_id = p_id_usuario)
      )
    ), '[]'::jsonb)
  );
$function$
;
CREATE OR REPLACE FUNCTION public.rpc_cadastros_mukirana(p_id_usuario uuid, p_incluir_vinculos boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'usuarios', coalesce((
      select jsonb_agg(to_jsonb(u) order by u.nome)
      from public.usuarios u
    ), '[]'::jsonb),

    'categorias', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.tipo, c.nome)
      from public.categorias c
    ), '[]'::jsonb),

    'contas', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.nome_conta)
      from public.contas c
    ), '[]'::jsonb),

    'contas_compartilhamentos', coalesce((
      select jsonb_agg(to_jsonb(cc) order by cc.id_conta, cc.papel_na_conta, cc.id_usuario)
      from public.contas_compartilhamentos cc
      where cc.ativo = true
    ), '[]'::jsonb),

    'grupos_cartoes', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.nome_grupo)
      from public.grupos_cartoes g
    ), '[]'::jsonb),

    'cartoes', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.nome_cartao)
      from public.cartoes c
    ), '[]'::jsonb),

    'cartoes_compartilhados', coalesce((
      select jsonb_agg(to_jsonb(cc) order by cc.id_cartao, cc.id_usuario)
      from public.cartoes_compartilhados cc
      where cc.ativo = true
    ), '[]'::jsonb),

    'projetos', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.nome)
      from public.projetos p
    ), '[]'::jsonb),

    'projetos_compartilhamentos', coalesce((
      select jsonb_agg(to_jsonb(pc) order by pc.id_projeto, pc.papel_no_projeto, pc.id_usuario)
      from public.projetos_compartilhamentos pc
      where pc.ativo = true
    ), '[]'::jsonb),

    'lancamentos_vinculos', case
      when p_incluir_vinculos = true then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id_lancamento', l.id_lancamento,
          'tipo', l.tipo,
          'tipo_origem', l.tipo_origem,
          'id_origem', l.id_origem,
          'id_destino', l.id_destino
        ) order by l.data_ocorrencia asc)
        from public.lancamentos l
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  );
$function$
;
CREATE OR REPLACE FUNCTION public.rpc_fatura_cartao_mukirana(p_id_usuario uuid, p_mes_referencia date, p_id_grupo_cartao uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with cartoes_grupo as (
    select c.*
    from public.cartoes c
    where c.id_grupo_cartao = p_id_grupo_cartao
  ),
  lancamentos_fatura as (
    select l.*
    from public.lancamentos l
    where l.mes_referencia = p_mes_referencia
      and l.id_origem in (select cg.id_cartao from cartoes_grupo cg)
  )
  select jsonb_build_object(
    'usuarios', '[]'::jsonb,

    'categorias', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.tipo, c.nome)
      from public.categorias c
      where c.id_categoria in (
        select distinct lf.id_categoria
        from lancamentos_fatura lf
        where lf.id_categoria is not null
      )
    ), '[]'::jsonb),

    'contas', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.nome_conta)
      from public.contas c
    ), '[]'::jsonb),

    'contas_compartilhamentos', coalesce((
      select jsonb_agg(to_jsonb(cc) order by cc.id_conta, cc.papel_na_conta, cc.id_usuario)
      from public.contas_compartilhamentos cc
      where cc.ativo = true
    ), '[]'::jsonb),

    'grupos_cartoes', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.nome_grupo)
      from public.grupos_cartoes g
      where g.id_grupo_cartao = p_id_grupo_cartao
    ), '[]'::jsonb),

    'cartoes', coalesce((
      select jsonb_agg(to_jsonb(cg) order by cg.nome_cartao)
      from cartoes_grupo cg
    ), '[]'::jsonb),

    'cartoes_compartilhados', coalesce((
      select jsonb_agg(to_jsonb(cc) order by cc.id_cartao, cc.id_usuario)
      from public.cartoes_compartilhados cc
      where cc.ativo = true
        and cc.id_cartao in (select cg.id_cartao from cartoes_grupo cg)
    ), '[]'::jsonb),

    'projetos', '[]'::jsonb,
    'projetos_compartilhamentos', '[]'::jsonb,

    'lancamentos', coalesce((
      select jsonb_agg(to_jsonb(lf) order by lf.data_ocorrencia asc)
      from lancamentos_fatura lf
    ), '[]'::jsonb),

    'rateios', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at asc)
      from public.rateios r
      where r.id_lancamento in (select lf.id_lancamento from lancamentos_fatura lf)
    ), '[]'::jsonb),

    'pagamentos_faturas', coalesce((
      select jsonb_agg(to_jsonb(pf) order by pf.data_pagamento asc)
      from public.pagamentos_faturas pf
      where pf.id_grupo_cartao = p_id_grupo_cartao
        and (p_mes_referencia is null or pf.mes_referencia = p_mes_referencia)
    ), '[]'::jsonb),

    'orcamentos', '[]'::jsonb,
    'recorrencias', '[]'::jsonb,
    'recorrencias_rateios', '[]'::jsonb
  );
$function$
;
CREATE OR REPLACE FUNCTION public.rpc_recorrencias_mukirana(p_id_usuario uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with recorrencias_usuario as (
    select r.id_recorrencia
    from public.recorrencias r
    where r.id_usuario = p_id_usuario
       or r.criado_por_id = p_id_usuario
  ),
  lancamentos_recorrencias as (
    select l.*
    from public.lancamentos l
    where l.id_recorrencia_origem in (
      select ru.id_recorrencia
      from recorrencias_usuario ru
    )
  )
  select jsonb_build_object(
    'usuarios', coalesce((
      select jsonb_agg(to_jsonb(u) order by u.nome)
      from public.usuarios u
    ), '[]'::jsonb),

    'categorias', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.tipo, c.nome)
      from public.categorias c
    ), '[]'::jsonb),

    'contas', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.nome_conta)
      from public.contas c
    ), '[]'::jsonb),

    'contas_compartilhamentos', coalesce((
      select jsonb_agg(to_jsonb(cc) order by cc.id_conta, cc.papel_na_conta, cc.id_usuario)
      from public.contas_compartilhamentos cc
      where cc.ativo = true
    ), '[]'::jsonb),

    'grupos_cartoes', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.nome_grupo)
      from public.grupos_cartoes g
    ), '[]'::jsonb),

    'cartoes', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.nome_cartao)
      from public.cartoes c
    ), '[]'::jsonb),

    'cartoes_compartilhados', coalesce((
      select jsonb_agg(to_jsonb(cc) order by cc.id_cartao, cc.id_usuario)
      from public.cartoes_compartilhados cc
      where cc.ativo = true
    ), '[]'::jsonb),

    'projetos', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.nome)
      from public.projetos p
    ), '[]'::jsonb),

    'projetos_compartilhamentos', coalesce((
      select jsonb_agg(to_jsonb(pc) order by pc.id_projeto, pc.papel_no_projeto, pc.id_usuario)
      from public.projetos_compartilhamentos pc
      where pc.ativo = true
    ), '[]'::jsonb),

    'recorrencias', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.data_inicio asc)
      from public.recorrencias r
      where r.id_recorrencia in (
        select ru.id_recorrencia
        from recorrencias_usuario ru
      )
    ), '[]'::jsonb),

    'recorrencias_rateios', coalesce((
      select jsonb_agg(to_jsonb(rr) order by rr.created_at asc)
      from public.recorrencias_rateios rr
      where rr.id_recorrencia in (
        select ru.id_recorrencia
          from recorrencias_usuario ru
      )
    ), '[]'::jsonb),

    'recorrencias_ocorrencias', coalesce((
      select jsonb_agg(to_jsonb(ro) order by ro.data_ocorrencia asc)
      from public.recorrencias_ocorrencias ro
      where ro.id_recorrencia in (
        select ru.id_recorrencia
        from recorrencias_usuario ru
      )
    ), '[]'::jsonb),

    'lancamentos', coalesce((
      select jsonb_agg(to_jsonb(lr) order by lr.data_ocorrencia asc)
      from lancamentos_recorrencias lr
    ), '[]'::jsonb),

    'rateios', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at asc)
      from public.rateios r
      where r.id_lancamento in (
        select lr.id_lancamento
        from lancamentos_recorrencias lr
      )
    ), '[]'::jsonb),

    'orcamentos', '[]'::jsonb
  );
$function$
;
CREATE OR REPLACE FUNCTION public.gerar_ocorrencia_recorrencia(p_id_recorrencia uuid, p_data_prevista date, p_data_lancamento date, p_mes_referencia date, p_email_autor text, p_executado_por uuid, p_modo_geracao text, p_id_lancamento uuid, p_rateios jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_recorrencia public.recorrencias%rowtype;
  v_id_ocorrencia uuid := gen_random_uuid();
begin
  if p_id_recorrencia is null or p_data_prevista is null or p_data_lancamento is null or
     p_mes_referencia is null or p_executado_por is null or p_id_lancamento is null then
    raise exception 'Dados obrigatorios da geracao da recorrencia nao foram informados.';
  end if;

  if p_modo_geracao not in ('Manual', 'Automática') then
    raise exception 'Modo de geracao da ocorrencia invalido.';
  end if;

  if p_rateios is null or jsonb_typeof(p_rateios) <> 'array' then
    raise exception 'Os rateios da recorrencia devem ser enviados como uma lista.';
  end if;

  select *
    into v_recorrencia
    from public.recorrencias
   where id_recorrencia = p_id_recorrencia
   for update;

  if not found then
    raise exception 'Recorrencia nao encontrada.';
  end if;

  if v_recorrencia.id_usuario <> p_executado_por then
    raise exception 'Acesso negado: somente o proprietario pode gerar esta recorrencia.';
  end if;

  if v_recorrencia.status_recorrencia <> 'Ativa' then
    raise exception 'Somente recorrencias ativas podem gerar lancamentos.';
  end if;

  if exists (
    select 1
      from public.recorrencias_ocorrencias
     where id_recorrencia = p_id_recorrencia
       and data_ocorrencia = p_data_prevista
       and status = 'Gerada'
  ) then
    raise exception 'Esta ocorrencia ja gerou um lancamento e nao pode ser processada novamente.';
  end if;

  insert into public.lancamentos (
    id_lancamento,
    tipo,
    descricao,
    valor_total,
    data_ocorrencia,
    mes_referencia,
    id_categoria,
    tipo_origem,
    id_origem,
    id_destino,
    id_projeto,
    email_autor,
    status,
    criado_por_id,
    alterado_por_id,
    id_grupo_parcela,
    numero_parcela,
    total_parcelas,
    id_recorrencia_origem,
    modo_recorrencia_origem,
    data_ocorrencia_recorrencia,
    created_at,
    updated_at
  ) values (
    p_id_lancamento,
    v_recorrencia.tipo,
    v_recorrencia.descricao,
    v_recorrencia.valor_base,
    p_data_lancamento,
    p_mes_referencia,
    case when v_recorrencia.tipo = 'Transferência' then null else v_recorrencia.id_categoria end,
    v_recorrencia.tipo_origem,
    v_recorrencia.id_origem,
    case when v_recorrencia.tipo = 'Transferência' then v_recorrencia.id_destino else null end,
    v_recorrencia.id_projeto,
    nullif(trim(coalesce(p_email_autor, '')), ''),
    v_recorrencia.status_lancamento,
    coalesce(v_recorrencia.criado_por_id, p_executado_por),
    null,
    null,
    null,
    null,
    p_id_recorrencia,
    p_modo_geracao,
    p_data_prevista,
    now(),
    null
  );

  insert into public.rateios (
    id_rateio,
    id_lancamento,
    id_usuario_responsavel,
    id_usuario_credor,
    valor_rateado,
    percentual,
    status,
    criado_por_id,
    alterado_por_id,
    observacao,
    modo_rateio,
    created_at,
    updated_at
  )
  select
    item.id_rateio,
    p_id_lancamento,
    item.id_usuario_responsavel,
    item.id_usuario_credor,
    item.valor_rateado,
    item.percentual,
    coalesce(item.status, 'Pendente'),
    coalesce(item.criado_por_id, p_executado_por),
    item.alterado_por_id,
    item.observacao,
    item.modo_rateio,
    coalesce(item.created_at, now()),
    item.updated_at
  from jsonb_to_recordset(p_rateios) as item(
    id_rateio uuid,
    id_usuario_responsavel uuid,
    id_usuario_credor uuid,
    valor_rateado numeric,
    percentual numeric,
    status text,
    criado_por_id uuid,
    alterado_por_id uuid,
    observacao text,
    modo_rateio text,
    created_at timestamptz,
    updated_at timestamptz
  );

  insert into public.recorrencias_ocorrencias (
    id_recorrencia_ocorrencia,
    id_recorrencia,
    data_ocorrencia,
    id_lancamento_gerado,
    status,
    observacao,
    criado_por_id,
    alterado_por_id,
    created_at,
    updated_at
  ) values (
    v_id_ocorrencia,
    p_id_recorrencia,
    p_data_prevista,
    p_id_lancamento,
    'Gerada',
    case
      when p_modo_geracao = 'Manual' then 'Gerada manualmente com base na recorrencia.'
      else 'Gerada por automacao de recorrencia.'
    end,
    p_executado_por,
    null,
    now(),
    null
  );

  return jsonb_build_object(
    'id_lancamento', p_id_lancamento,
    'id_recorrencia_ocorrencia', v_id_ocorrencia,
    'id_recorrencia', p_id_recorrencia,
    'data_prevista', p_data_prevista,
    'data_lancamento', p_data_lancamento
  );
end;
$function$
;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
