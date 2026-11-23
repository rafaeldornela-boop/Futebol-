/**
 * Constantes centrais e balanceamento do Modo Campanha.
 */

export const CAMPANHA_CONFIG = Object.freeze({
  storageKey: 'prancheta11_campanha_v1',
  dinheiroInicial: 300,
  maxElenco: 18,
  minElenco: 11,
  derrotasSeguidasLimite: 3,

  // Estrutura do mapa estilo Slay the Spire
  totalCamadas: 12,
  nosPorCamadaMin: 3,
  nosPorCamadaMax: 4,

  // Pesos de sorteio das camadas 3 a 10
  pesosNosCamadasMeio: Object.freeze({
    partida: 40,
    treino: 12,
    evento: 12,
    misterioso: 12,
    descanso: 10,
    mercado: 8,
    patrocinio: 6,
    fisioterapia: 6,
    torcida: 4,
  }),

  // Mínimos garantidos ao longo de um mapa completo
  minimosNoMapa: Object.freeze({
    treino: 2,
    mercado: 1,
    fisioterapia: 1,
    patrocinio: 1,
  }),

  // Regras entre nós e pós-partida
  recuperacaoEstaminaEntreNos: 10,
  limiarEstaminaLesao: 20,
  chanceLesaoAbaixoLimiar: 0.25,

  // Renda por resultado de partida
  rendaPartida: Object.freeze({
    vitoria: 150,
    empate: 60,
    derrota: 20,
  }),

  // Patrocínio
  patrocinioImediatoMin: 200,
  patrocinioImediatoMax: 300,
  patrocinioPartidasDuracao: 4,
  patrocinioPorPartidaMin: 80,
  patrocinioPorPartidaMax: 115,

  // Treino e Torcida
  bonusAtributoTreino: 3,
  opcoesTreinoSorteadas: 3,
  moralTorcida: 3,

  // Mercado
  mercadoQuantidadeJogadores: 4,
  mercadoPrecoMin: 100,
  mercadoPrecoMax: 400,
  mercadoFatorVenda: 0.5,

  // Nó misterioso
  misteriosoBonusDinheiro: 100,
  opcoesMisterioso: Object.freeze(['evento', 'partida', 'dinheiro', 'descanso']),

  // Força base dos rivais: mediaInicialTitulares - 6 + 2.5 * camada (+ 6 no chefão)
  rivalDescontoBase: 6,
  rivalGanhoPorCamada: 2.5,
  rivalBonusChefao: 6,
  rivalVariacaoAtributo: 8,
});

export const TIPOS_NO = Object.freeze({
  PARTIDA: 'partida',
  TREINO: 'treino',
  EVENTO: 'evento',
  MISTERIOSO: 'misterioso',
  DESCANSO: 'descanso',
  MERCADO: 'mercado',
  PATROCINIO: 'patrocinio',
  FISIOTERAPIA: 'fisioterapia',
  TORCIDA: 'torcida',
  CHEFAO: 'chefao',
});

export const METADADOS_NO = Object.freeze({
  partida: Object.freeze({
    id: 'partida',
    nome: 'Partida',
    tituloTela: 'Escalação para a Partida',
    descricao: 'Escolha os 11 titulares e enfrente o adversário da rodada.',
    simbolo: '⚽',
  }),
  treino: Object.freeze({
    id: 'treino',
    nome: 'Treino',
    tituloTela: 'Centro de Treinamento',
    descricao: 'Evolua +3 em um atributo ou ensine uma habilidade compatível.',
    simbolo: '⚡',
  }),
  evento: Object.freeze({
    id: 'evento',
    nome: 'Evento',
    tituloTela: 'Decisão de Bastidores',
    descricao: 'Uma situação inesperada exige posicionamento do técnico.',
    simbolo: '📜',
  }),
  misterioso: Object.freeze({
    id: 'misterioso',
    nome: 'Misterioso',
    tituloTela: 'Nó Misterioso',
    descricao: 'O destino sorteia entre evento, partida, dinheiro ou descanso.',
    simbolo: '?',
  }),
  descanso: Object.freeze({
    id: 'descanso',
    nome: 'Descanso Total',
    tituloTela: 'Concentração & Descanso',
    descricao: 'Todo o elenco recupera 100% da estamina.',
    simbolo: '⛺',
  }),
  mercado: Object.freeze({
    id: 'mercado',
    nome: 'Mercado',
    tituloTela: 'Janela de Transferências',
    descricao: 'Contrate reforços ou negocie jogadores por 50% do valor.',
    simbolo: '⇄',
  }),
  patrocinio: Object.freeze({
    id: 'patrocinio',
    nome: 'Patrocínio',
    tituloTela: 'Mesa de Patrocínio',
    descricao: 'Escolha entre dinheiro imediato ou contrato para 4 jogos.',
    simbolo: '$',
  }),
  fisioterapia: Object.freeze({
    id: 'fisioterapia',
    nome: 'Fisioterapia',
    tituloTela: 'Departamento Médico',
    descricao: 'Recupera todos os jogadores lesionados do elenco.',
    simbolo: '+',
  }),
  torcida: Object.freeze({
    id: 'torcida',
    nome: 'Torcida',
    tituloTela: 'Recepção da Torcida',
    descricao: 'Moral +3 em todos os atributos para a próxima partida.',
    simbolo: '★',
  }),
  chefao: Object.freeze({
    id: 'chefao',
    nome: 'Chefão',
    tituloTela: 'Grande Final — Chefão',
    descricao: 'Confronto decisivo pelo título da campanha.',
    simbolo: '♛',
  }),
});
