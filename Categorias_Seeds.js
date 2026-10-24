/**
 * Rotinas administrativas para popular categorias globais iniciais do Mukirana.
 *
 * Objetivo:
 * - Complementar o banco com uma base global intermediaria de categorias.
 * - Reaproveitar categorias ja existentes sem alterar o que o usuario usa hoje.
 * - Criar somente o que estiver faltando.
 *
 * Observacao:
 * - As funcoes abaixo devem ser executadas manualmente por um administrador no
 *   Apps Script quando for desejado revisar ou popular a base inicial.
 */

function popularCategoriasGlobaisIntermediariasMukirana_() {
  return executarCargaCategoriasGlobaisIntermediariasMukirana_(false);
}


function executarCargaCategoriasGlobaisIntermediariasMukirana_(somenteDiagnostico) {
  const categoriasExistentes = typeof listarCategoriasModel_ === "function"
    ? listarCategoriasModel_()
    : [];
  const usuarios = typeof listarUsuariosModel_ === "function"
    ? listarUsuariosModel_()
    : [];
  const catalogo = obterCatalogoCategoriasGlobaisIntermediariasMukirana_();
  const criadoPorPadrao = obterCriadorPadraoCategoriasGlobaisMukirana_(categoriasExistentes, usuarios);
  const indicePorNomeTipo = montarIndiceCategoriasPorNomeTipoMukirana_(categoriasExistentes);
  const resumo = {
    somenteDiagnostico: somenteDiagnostico === true,
    criadoPorPadrao: criadoPorPadrao,
    categoriasPrincipaisCriadas: [],
    categoriasPrincipaisReaproveitadas: [],
    subcategoriasCriadas: [],
    subcategoriasReaproveitadas: [],
    conflitos: [],
    avisos: []
  };

  catalogo.forEach(function(grupo) {
    const principal = resolverOuCriarCategoriaGlobalMukirana_({
      nome: grupo.nome,
      tipo: grupo.tipo,
      idCategoriaPai: "",
      criadoPor: criadoPorPadrao,
      indicePorNomeTipo: indicePorNomeTipo,
      somenteDiagnostico: somenteDiagnostico === true,
      resumo: resumo,
      tipoResumoCriado: "categoriasPrincipaisCriadas",
      tipoResumoReaproveitado: "categoriasPrincipaisReaproveitadas",
      contextoConflito: "Categoria principal"
    });

    if (!principal || !principal.idCategoria) {
      return;
    }

    if (principal.ativa !== true) {
      resumo.avisos.push(
        'Categoria principal "' + grupo.nome + '" ja existe, mas esta inativa. Nenhuma subcategoria nova foi vinculada a ela.'
      );
      return;
    }

    grupo.subcategorias.forEach(function(subcategoria) {
      resolverOuCriarCategoriaGlobalMukirana_({
        nome: subcategoria,
        tipo: grupo.tipo,
        idCategoriaPai: principal.idCategoria,
        criadoPor: criadoPorPadrao,
        indicePorNomeTipo: indicePorNomeTipo,
        somenteDiagnostico: somenteDiagnostico === true,
        resumo: resumo,
        tipoResumoCriado: "subcategoriasCriadas",
        tipoResumoReaproveitado: "subcategoriasReaproveitadas",
        contextoConflito: 'Subcategoria de "' + grupo.nome + '"'
      });
    });
  });

  resumo.quantidades = {
    categoriasPrincipaisCriadas: resumo.categoriasPrincipaisCriadas.length,
    categoriasPrincipaisReaproveitadas: resumo.categoriasPrincipaisReaproveitadas.length,
    subcategoriasCriadas: resumo.subcategoriasCriadas.length,
    subcategoriasReaproveitadas: resumo.subcategoriasReaproveitadas.length,
    conflitos: resumo.conflitos.length,
    avisos: resumo.avisos.length
  };

  Logger.log(JSON.stringify(resumo, null, 2));
  return resumo;
}


function resolverOuCriarCategoriaGlobalMukirana_(opcoes) {
  const chave = montarChaveCategoriaMukirana_(opcoes.nome, opcoes.tipo);
  const existentes = opcoes.indicePorNomeTipo[chave] || [];
  let categoriaCompativel = null;

  if (opcoes.idCategoriaPai) {
    categoriaCompativel = existentes.find(function(categoria) {
      return normalizarTextoCategoriaSeedMukirana_(categoria.ID_Categoria_Pai) ===
        normalizarTextoCategoriaSeedMukirana_(opcoes.idCategoriaPai);
    }) || null;
  } else {
    categoriaCompativel = existentes.find(function(categoria) {
      return !normalizarTextoCategoriaSeedMukirana_(categoria.ID_Categoria_Pai);
    }) || null;
  }

  if (categoriaCompativel) {
    opcoes.resumo[opcoes.tipoResumoReaproveitado].push({
      nome: categoriaCompativel.Nome,
      tipo: categoriaCompativel.Tipo,
      idCategoria: categoriaCompativel.ID_Categoria
    });

    return {
      idCategoria: categoriaCompativel.ID_Categoria,
      ativa: categoriaCompativel.Ativa === true
    };
  }

  if (existentes.length > 0) {
    opcoes.resumo.conflitos.push(
      opcoes.contextoConflito + ': ja existe uma categoria com o nome "' + opcoes.nome +
      '" e tipo "' + opcoes.tipo + '", mas vinculada a outra hierarquia. Nada foi alterado.'
    );
    return null;
  }

  const novaCategoria = {
    ID_Categoria: Utilities.getUuid(),
    Nome: opcoes.nome,
    Tipo: opcoes.tipo,
    ID_Categoria_Pai: opcoes.idCategoriaPai || "",
    Global: true,
    Ativa: true,
    Criado_Por: opcoes.criadoPor || ""
  };

  if (opcoes.somenteDiagnostico !== true) {
    salvarCategoriaModel_(novaCategoria);
  }

  opcoes.indicePorNomeTipo[chave] = opcoes.indicePorNomeTipo[chave] || [];
  opcoes.indicePorNomeTipo[chave].push(novaCategoria);
  opcoes.resumo[opcoes.tipoResumoCriado].push({
    nome: novaCategoria.Nome,
    tipo: novaCategoria.Tipo,
    idCategoria: novaCategoria.ID_Categoria,
    idCategoriaPai: novaCategoria.ID_Categoria_Pai || ""
  });

  return {
    idCategoria: novaCategoria.ID_Categoria,
    ativa: true
  };
}


function montarIndiceCategoriasPorNomeTipoMukirana_(categorias) {
  const indice = {};

  (categorias || []).forEach(function(categoria) {
    const chave = montarChaveCategoriaMukirana_(categoria.Nome, categoria.Tipo);
    indice[chave] = indice[chave] || [];
    indice[chave].push(categoria);
  });

  return indice;
}


function montarChaveCategoriaMukirana_(nome, tipo) {
  return normalizarTextoCategoriaSeedMukirana_(nome) + "::" + normalizarTextoCategoriaSeedMukirana_(tipo);
}


function normalizarTextoCategoriaSeedMukirana_(valor) {
  return (valor === null || valor === undefined ? "" : valor.toString())
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}


function obterCriadorPadraoCategoriasGlobaisMukirana_(categorias, usuarios) {
  const globalExistente = (categorias || []).find(function(categoria) {
    return categoria.Global === true && normalizarTextoCategoriaSeedMukirana_(categoria.Criado_Por);
  });

  if (globalExistente && globalExistente.Criado_Por) {
    return globalExistente.Criado_Por;
  }

  const administradorAtivo = (usuarios || []).find(function(usuario) {
    return usuario.Ativo === true &&
      normalizarTextoCategoriaSeedMukirana_(usuario.Papel) === "administrador" &&
      normalizarTextoCategoriaSeedMukirana_(usuario.ID_Usuario);
  });

  if (administradorAtivo) {
    return administradorAtivo.ID_Usuario;
  }

  const usuarioAtivo = (usuarios || []).find(function(usuario) {
    return usuario.Ativo === true && normalizarTextoCategoriaSeedMukirana_(usuario.ID_Usuario);
  });

  return usuarioAtivo ? usuarioAtivo.ID_Usuario : "";
}


function obterCatalogoCategoriasGlobaisIntermediariasMukirana_() {
  return [
    {
      nome: "Moradia",
      tipo: "Despesa",
      subcategorias: [
        "Aluguel",
        "Financiamento imobiliário",
        "Condomínio",
        "Energia elétrica",
        "Água",
        "Gás",
        "Internet",
        "Manutenção da casa"
      ]
    },
    {
      nome: "Alimentação",
      tipo: "Despesa",
      subcategorias: [
        "Supermercado",
        "Feira e hortifruti",
        "Padaria",
        "Restaurantes",
        "Lanches",
        "Delivery"
      ]
    },
    {
      nome: "Transporte",
      tipo: "Despesa",
      subcategorias: [
        "Combustível",
        "Transporte público",
        "Aplicativos de transporte",
        "Estacionamento e pedágio",
        "Manutenção do veículo",
        "Seguro e documentação"
      ]
    },
    {
      nome: "Saúde",
      tipo: "Despesa",
      subcategorias: [
        "Plano de saúde",
        "Consultas médicas",
        "Exames clínicos",
        "Medicamentos",
        "Dentista",
        "Academia e atividade física"
      ]
    },
    {
      nome: "Educação",
      tipo: "Despesa",
      subcategorias: [
        "Escola e faculdade",
        "Cursos livres",
        "Idiomas",
        "Livros",
        "Material de estudo"
      ]
    },
    {
      nome: "Trabalho",
      tipo: "Despesa",
      subcategorias: [
        "Ferramentas de trabalho",
        "Equipamentos profissionais",
        "Software e assinaturas profissionais",
        "Alimentação no trabalho",
        "Transporte para trabalho"
      ]
    },
    {
      nome: "Lazer",
      tipo: "Despesa",
      subcategorias: [
        "Cinema e eventos",
        "Streaming",
        "Viagens",
        "Passeios",
        "Hobbies"
      ]
    },
    {
      nome: "Cuidados pessoais",
      tipo: "Despesa",
      subcategorias: [
        "Roupas",
        "Calçados",
        "Higiene pessoal",
        "Cabeleireiro e barbearia",
        "Cosméticos"
      ]
    },
    {
      nome: "Família e dependentes",
      tipo: "Despesa",
      subcategorias: [
        "Filhos",
        "Pets",
        "Apoio familiar",
        "Mesada paga",
        "Cuidados infantis"
      ]
    },
    {
      nome: "Vida social e presentes",
      tipo: "Despesa",
      subcategorias: [
        "Presentes",
        "Festas",
        "Bares e encontros",
        "Doacoes sociais"
      ]
    },
    {
      nome: "Serviços financeiros",
      tipo: "Despesa",
      subcategorias: [
        "Tarifas bancárias",
        "Juros",
        "Anuidade de cartão",
        "Empréstimos e financiamentos"
      ]
    },
    {
      nome: "Impostos e obrigações",
      tipo: "Despesa",
      subcategorias: [
        "Imposto de renda",
        "Taxas públicas",
        "Documentação",
        "Cartório"
      ]
    },
    {
      nome: "Investimentos e patrimônio",
      tipo: "Despesa",
      subcategorias: [
        "Reserva de emergência",
        "Investimentos",
        "Previdência privada",
        "Compra de bens"
      ]
    },
    {
      nome: "Ajustes e imprevistos",
      tipo: "Despesa",
      subcategorias: [
        "Emergências",
        "Despesa não classificada",
        "Correção de saldo",
        "Ajuste manual"
      ]
    },
    {
      nome: "Trabalho principal",
      tipo: "Receita",
      subcategorias: [
        "Salário",
        "Pró-labore",
        "Férias",
        "Décimo terceiro",
        "Bônus e comissão"
      ]
    },
    {
      nome: "Renda extra",
      tipo: "Receita",
      subcategorias: [
        "Freelance",
        "Bico",
        "Consultoria",
        "Aulas",
        "Servicos eventuais"
      ]
    },
    {
      nome: "Negócios",
      tipo: "Receita",
      subcategorias: [
        "Vendas",
        "Prestação de serviços",
        "Lucro de empresa"
      ]
    },
    {
      nome: "Benefícios e auxílios",
      tipo: "Receita",
      subcategorias: [
        "Benefício em dinheiro",
        "Auxílio",
        "Bolsa",
        "Reembolso"
      ]
    },
    {
      nome: "Rendimentos financeiros",
      tipo: "Receita",
      subcategorias: [
        "Juros recebidos",
        "Dividendos",
        "Cashback",
        "Aluguel recebido"
      ]
    },
    {
      nome: "Vendas e entradas eventuais",
      tipo: "Receita",
      subcategorias: [
        "Venda de bens",
        "Venda de usados",
        "Entrada extraordinária"
      ]
    },
    {
      nome: "Receitas familiares",
      tipo: "Receita",
      subcategorias: [
        "Ajuda familiar recebida",
        "Presente em dinheiro",
        "Herança",
        "Apoio financeiro recebido"
      ]
    },
    {
      nome: "Restituições e estornos",
      tipo: "Receita",
      subcategorias: [
        "Restituição de imposto",
        "Reembolso médico",
        "Estorno de compra",
        "Devolução"
      ]
    }
  ];
}
