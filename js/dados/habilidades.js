/**
 * Catálogo de habilidades especiais guiado por dados.
 *
 * Cada habilidade define:
 * - id, nome, descricao
 * - tipo: 'ativa' | 'passiva'
 * - subtipo: 'ofensiva' | 'defensiva' | null
 * - posicoes: lista de papéis/posições elegíveis ('goleiro', 'zagueiro', 'lateral', 'volante', 'meia', 'ponta', 'atacante', 'qualquer')
 * - nivel: inicia em 1 (preparado para evolução futura por treino/mapa)
 * - custo: custo de estamina (0 para passivas)
 * - usos: limite de usos por partida (null para passivas)
 * - efeito: objeto declarativo de modificador consultado pelo motor de cálculo
 */

export const TIPOS_HABILIDADE = Object.freeze({
  ATIVA: 'ativa',
  PASSIVA: 'passiva',
});

export const PAPEL_PARA_POSICOES_HABILIDADE = Object.freeze({
  GOL: ['goleiro'],
  ZAG1: ['zagueiro'],
  ZAG2: ['zagueiro'],
  LAT_E: ['lateral'],
  LAT_D: ['lateral'],
  VOL: ['volante'],
  MEI_E: ['meia'],
  MEI_D: ['meia'],
  PONTA_E: ['ponta', 'atacante'],
  PONTA_D: ['ponta', 'atacante'],
  CA: ['atacante'],
});

export const CATALOGO_HABILIDADES = Object.freeze({
  // ==========================================================================
  // Ofensivas Ativas
  // ==========================================================================
  passe_infiltracao: Object.freeze({
    id: 'passe_infiltracao',
    nome: 'Passe de infiltração',
    descricao: 'Passe para frente ou longo ignora 50% da pressão na linha do destino.',
    tipo: TIPOS_HABILIDADE.ATIVA,
    subtipo: 'ofensiva',
    acaoAlvo: 'passe',
    posicoes: Object.freeze(['meia', 'volante']),
    nivel: 1,
    custo: 8,
    usos: 1,
    efeito: Object.freeze({
      tipo: 'passe_ignora_pressao_destino',
      tiposPassePermitidos: Object.freeze(['frente', 'longo']),
      reducaoPressaoLinhaDestino: 0.5,
      rotuloCurto: '−50% pressão dest.',
    }),
  }),

  arrancada: Object.freeze({
    id: 'arrancada',
    nome: 'Arrancada',
    descricao: 'Conduz o portador 2 zonas de uma vez com chance-base 60.',
    tipo: TIPOS_HABILIDADE.ATIVA,
    subtipo: 'ofensiva',
    acaoAlvo: 'conduzir',
    posicoes: Object.freeze(['ponta', 'lateral']),
    nivel: 1,
    custo: 10,
    usos: 1,
    efeito: Object.freeze({
      tipo: 'conducao_distancia',
      distanciaExata: 2,
      baseChance: 60,
      rotuloCurto: 'Conduz 2 zonas',
    }),
  }),

  chute_de_fora: Object.freeze({
    id: 'chute_de_fora',
    nome: 'Chute de fora',
    descricao: 'Finaliza de qualquer zona das faixas 3 e 4 com chance-base 10.',
    tipo: TIPOS_HABILIDADE.ATIVA,
    subtipo: 'ofensiva',
    acaoAlvo: 'finalizar',
    posicoes: Object.freeze(['meia', 'volante', 'atacante']),
    nivel: 1,
    custo: 8,
    usos: 1,
    efeito: Object.freeze({
      tipo: 'finalizacao_faixas',
      faixasPermitidas: Object.freeze([3, 4]),
      baseChance: 10,
      rotuloCurto: 'Chute faixas 3–4',
    }),
  }),

  // ==========================================================================
  // Defensivas Ativas
  // ==========================================================================
  carrinho_cirurgico: Object.freeze({
    id: 'carrinho_cirurgico',
    nome: 'Carrinho cirúrgico',
    descricao: 'Dobra (×2) a pressão no portador deste jogador neste turno, sem risco de falta.',
    tipo: TIPOS_HABILIDADE.ATIVA,
    subtipo: 'defensiva',
    acaoAlvo: 'ordem_defensiva',
    posicoes: Object.freeze(['zagueiro', 'lateral', 'volante']),
    nivel: 1,
    custo: 10,
    usos: 1,
    efeito: Object.freeze({
      tipo: 'multiplicador_pressao_portador_jogador',
      multiplicador: 2,
      semRiscoFalta: true,
      rotuloCurto: 'Pressão ×2 sem falta',
    }),
  }),

  voo: Object.freeze({
    id: 'voo',
    nome: 'Voo',
    descricao: '+15 na defesa do goleiro em uma finalização.',
    tipo: TIPOS_HABILIDADE.ATIVA,
    subtipo: 'defensiva',
    acaoAlvo: 'ordem_defensiva',
    posicoes: Object.freeze(['goleiro']),
    nivel: 1,
    custo: 10,
    usos: 1,
    efeito: Object.freeze({
      tipo: 'bonus_defesa_goleiro',
      somenteFinalizacao: true,
      bonusDefesa: 15,
      rotuloCurto: '+15 def. no chute',
    }),
  }),

  // ==========================================================================
  // Passivas
  // ==========================================================================
  leitura_jogo: Object.freeze({
    id: 'leitura_jogo',
    nome: 'Leitura de jogo',
    descricao: '+10% na força de interceptação deste jogador.',
    tipo: TIPOS_HABILIDADE.PASSIVA,
    subtipo: null,
    acaoAlvo: null,
    posicoes: Object.freeze(['zagueiro', 'volante']),
    nivel: 1,
    custo: 0,
    usos: null,
    efeito: Object.freeze({
      tipo: 'multiplicador_forca_interceptacao',
      multiplicador: 1.1,
      rotuloCurto: '+10% intercept.',
    }),
  }),

  saida_bola: Object.freeze({
    id: 'saida_bola',
    nome: 'Saída de bola',
    descricao: 'Passes do goleiro ganham +10 de chance.',
    tipo: TIPOS_HABILIDADE.PASSIVA,
    subtipo: null,
    acaoAlvo: 'passe',
    posicoes: Object.freeze(['goleiro']),
    nivel: 1,
    custo: 0,
    usos: null,
    efeito: Object.freeze({
      tipo: 'bonus_chance_passe',
      tiposPassePermitidos: null, // todos os passes
      bonusChance: 10,
      rotuloCurto: '+10% passe GOL',
    }),
  }),

  passe_primeira: Object.freeze({
    id: 'passe_primeira',
    nome: 'Passe de primeira',
    descricao: 'Passes curtos e laterais deste jogador ganham +5 de chance.',
    tipo: TIPOS_HABILIDADE.PASSIVA,
    subtipo: null,
    acaoAlvo: 'passe',
    posicoes: Object.freeze(['meia']),
    nivel: 1,
    custo: 0,
    usos: null,
    efeito: Object.freeze({
      tipo: 'bonus_chance_passe',
      tiposPassePermitidos: Object.freeze(['curto', 'lateral']),
      bonusChance: 5,
      rotuloCurto: '+5% curto/lat.',
    }),
  }),

  lideranca: Object.freeze({
    id: 'lideranca',
    nome: 'Liderança',
    descricao: 'Enquanto em campo, +3 de posicionamento para todos os jogadores de linha do time.',
    tipo: TIPOS_HABILIDADE.PASSIVA,
    subtipo: null,
    acaoAlvo: null,
    posicoes: Object.freeze(['volante', 'zagueiro']),
    nivel: 1,
    custo: 0,
    usos: null,
    efeito: Object.freeze({
      tipo: 'aura_atributo_linha',
      atributo: 'posicionamento',
      bonus: 3,
      rotuloCurto: '+3 pos. time',
    }),
  }),

  folego: Object.freeze({
    id: 'folego',
    nome: 'Fôlego',
    descricao: 'Reduz em 20% todos os custos de estamina deste jogador.',
    tipo: TIPOS_HABILIDADE.PASSIVA,
    subtipo: null,
    acaoAlvo: null,
    posicoes: Object.freeze(['qualquer']),
    nivel: 1,
    custo: 0,
    usos: null,
    pacoteId: null,
    efeito: Object.freeze({
      tipo: 'reducao_custo_estamina',
      reducaoPercentual: 0.2,
      rotuloCurto: '−20% estamina',
    }),
  }),
});

export const CATALOGO_HABILIDADES_PACOTES = Object.freeze({
  // Pacote 1 (pacote_hab_1)
  olho_clinico: Object.freeze({
    id: 'olho_clinico',
    nome: 'Olho clínico',
    descricao: 'Finalizações deste jogador ganham +6 de chance.',
    tipo: TIPOS_HABILIDADE.PASSIVA,
    subtipo: null,
    acaoAlvo: 'finalizar',
    posicoes: Object.freeze(['atacante', 'ponta']),
    nivel: 1,
    custo: 0,
    usos: null,
    pacoteId: 'pacote_hab_1',
    efeito: Object.freeze({
      tipo: 'bonus_chance_finalizacao',
      bonusChance: 6,
      rotuloCurto: '+6% finaliz.',
    }),
  }),
  passe_longo_preciso: Object.freeze({
    id: 'passe_longo_preciso',
    nome: 'Lançamento preciso',
    descricao: 'Passes longos e invertidos deste jogador ganham +8 de chance.',
    tipo: TIPOS_HABILIDADE.PASSIVA,
    subtipo: null,
    acaoAlvo: 'passe',
    posicoes: Object.freeze(['zagueiro', 'volante', 'meia']),
    nivel: 1,
    custo: 0,
    usos: null,
    pacoteId: 'pacote_hab_1',
    efeito: Object.freeze({
      tipo: 'bonus_chance_passe',
      tiposPassePermitidos: Object.freeze(['longo', 'invertido']),
      bonusChance: 8,
      rotuloCurto: '+8% longo/inv.',
    }),
  }),
  muralha_aerea: Object.freeze({
    id: 'muralha_aerea',
    nome: 'Muralha defensiva',
    descricao: '+10% na força de pressão no portador exercida por este defensor.',
    tipo: TIPOS_HABILIDADE.PASSIVA,
    subtipo: null,
    acaoAlvo: null,
    posicoes: Object.freeze(['zagueiro', 'lateral']),
    nivel: 1,
    custo: 0,
    usos: null,
    pacoteId: 'pacote_hab_1',
    efeito: Object.freeze({
      tipo: 'multiplicador_forca_portador',
      multiplicador: 1.1,
      rotuloCurto: '+10% pressão port.',
    }),
  }),

  // Pacote 2 (pacote_hab_2)
  drible_curto: Object.freeze({
    id: 'drible_curto',
    nome: 'Drible curto',
    descricao: 'Conduções deste jogador ganham +8 de chance.',
    tipo: TIPOS_HABILIDADE.PASSIVA,
    subtipo: null,
    acaoAlvo: 'conduzir',
    posicoes: Object.freeze(['meia', 'ponta', 'atacante']),
    nivel: 1,
    custo: 0,
    usos: null,
    pacoteId: 'pacote_hab_2',
    efeito: Object.freeze({
      tipo: 'bonus_chance_conducao',
      bonusChance: 8,
      rotuloCurto: '+8% condução',
    }),
  }),
  passe_sob_pressao: Object.freeze({
    id: 'passe_sob_pressao',
    nome: 'Sangue frio',
    descricao: 'Ignora 25% da pressão no portador na origem ao executar passes.',
    tipo: TIPOS_HABILIDADE.PASSIVA,
    subtipo: null,
    acaoAlvo: 'passe',
    posicoes: Object.freeze(['volante', 'meia', 'lateral']),
    nivel: 1,
    custo: 0,
    usos: null,
    pacoteId: 'pacote_hab_2',
    efeito: Object.freeze({
      tipo: 'reducao_pressao_portador_passe',
      reducao: 0.25,
      rotuloCurto: '−25% press. orig.',
    }),
  }),
  reflexo_felino: Object.freeze({
    id: 'reflexo_felino',
    nome: 'Reflexo felino',
    descricao: '+5 na defesa do goleiro em todas as finalizações.',
    tipo: TIPOS_HABILIDADE.PASSIVA,
    subtipo: null,
    acaoAlvo: null,
    posicoes: Object.freeze(['goleiro']),
    nivel: 1,
    custo: 0,
    usos: null,
    pacoteId: 'pacote_hab_2',
    efeito: Object.freeze({
      tipo: 'bonus_passivo_defesa_goleiro',
      bonusDefesa: 5,
      rotuloCurto: '+5 def. GOL',
    }),
  }),
});

export const CATALOGO_COMPLETO_HABILIDADES = Object.freeze({
  ...CATALOGO_HABILIDADES,
  ...CATALOGO_HABILIDADES_PACOTES,
});

// Mantém LISTA_HABILIDADES com as 10 habilidades base (compatibilidade) e expõe todas/desbloqueadas
export const LISTA_HABILIDADES = Object.freeze(Object.values(CATALOGO_HABILIDADES));
export const LISTA_TODAS_HABILIDADES = Object.freeze(
  Object.values(CATALOGO_COMPLETO_HABILIDADES),
);

export function obterDefinicaoHabilidade(habilidadeId) {
  return CATALOGO_COMPLETO_HABILIDADES[habilidadeId] || null;
}

export function obterHabilidadesDisponiveis(pacotesDesbloqueados = []) {
  const pacotesSet = new Set(Array.isArray(pacotesDesbloqueados) ? pacotesDesbloqueados : []);
  return LISTA_TODAS_HABILIDADES.filter(
    (h) => !h.pacoteId || pacotesSet.has(h.pacoteId),
  );
}

export function obterPosicoesDoJogador(jogador) {
  if (!jogador) return [];
  if (jogador.papel && PAPEL_PARA_POSICOES_HABILIDADE[jogador.papel]) {
    return PAPEL_PARA_POSICOES_HABILIDADE[jogador.papel];
  }
  if (jogador.ehGoleiro) return ['goleiro'];
  return [];
}

export function jogadorPodeTerHabilidade(jogador, habilidade) {
  const def = typeof habilidade === 'string' ? obterDefinicaoHabilidade(habilidade) : habilidade;
  if (!def) return false;
  if (def.posicoes.includes('qualquer')) return true;
  const posicoes = obterPosicoesDoJogador(jogador);
  return def.posicoes.some((p) => posicoes.includes(p));
}
