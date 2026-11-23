/**
 * Constantes da meta-progressão entre campanhas:
 * Pontos de legado, níveis de dificuldade (0 a 5), melhorias do clube,
 * uniformes, clubes iniciais, técnicos, pacotes de conteúdo e conquistas.
 */

export const META_STORAGE_KEY = 'prancheta11_meta_v1';
export const META_VERSAO = 1;

export const DIFICULDADE_MIN = 0;
export const DIFICULDADE_MAX = 5;
export const BONUS_RIVAL_POR_DIFICULDADE = 3;

export const PONTOS_LEGADO_CONFIG = Object.freeze({
  porCamada: 2,
  porVitoria: 3,
  porEmpate: 1,
  porChefao: 30,
  porDificuldade: 5,
});

export const MELHORIAS_CLUBE = Object.freeze({
  torcida: Object.freeze({
    id: 'torcida',
    nome: 'Torcida',
    maxNivel: 5,
    custos: Object.freeze([10, 20, 30, 45, 60]),
    descricao: '+4% de receita por nível (partidas e patrocínios) e amplia a bilheteria do estádio.',
  }),
  estadio: Object.freeze({
    id: 'estadio',
    nome: 'Estádio',
    maxNivel: 5,
    custos: Object.freeze([15, 25, 40, 55, 75]),
    descricao: 'Bilheteria por partida: 15 × nível do estádio × (1 + 0,10 × nível da torcida).',
  }),
  base: Object.freeze({
    id: 'base',
    nome: 'Categorias de base',
    maxNivel: 5,
    custos: Object.freeze([10, 20, 30, 45, 60]),
    descricao: 'O mercado oferece N jovens baratos (45–55); jovens ganham +1 atributo aleatório por partida disputada.',
  }),
  equipamentos: Object.freeze({
    id: 'equipamentos',
    nome: 'Equipamentos',
    maxNivel: 5,
    custos: Object.freeze([10, 20, 30, 45, 60]),
    descricao: '+2 de estamina recuperada por nó e −2% nos custos de estamina por nível.',
  }),
});

export const LISTA_MELHORIAS_CLUBE = Object.freeze(Object.values(MELHORIAS_CLUBE));

export const PALETAS_UNIFORME = Object.freeze({
  padrao: Object.freeze({
    id: 'padrao',
    nome: 'Azul Clássico',
    custo: 0,
    gratuita: true,
    corPrincipal: '#163a76',
    corBorda: '#93c5fd',
    corDetalhe: '#f5b82e',
    corTexto: '#ffffff',
  }),
  esmeralda: Object.freeze({
    id: 'esmeralda',
    nome: 'Verde Esmeralda',
    custo: 5,
    gratuita: false,
    corPrincipal: '#14532d',
    corBorda: '#86efac',
    corDetalhe: '#fde047',
    corTexto: '#ffffff',
  }),
  rubro_negro: Object.freeze({
    id: 'rubro_negro',
    nome: 'Rubro-Negro',
    custo: 6,
    gratuita: false,
    corPrincipal: '#7f1d1d',
    corBorda: '#fca5a5',
    corDetalhe: '#fde68a',
    corTexto: '#ffffff',
  }),
  celeste: Object.freeze({
    id: 'celeste',
    nome: 'Celeste Prata',
    custo: 7,
    gratuita: false,
    corPrincipal: '#0369a1',
    corBorda: '#7dd3fc',
    corDetalhe: '#f8fafc',
    corTexto: '#ffffff',
  }),
  roxo_real: Object.freeze({
    id: 'roxo_real',
    nome: 'Roxo Real',
    custo: 8,
    gratuita: false,
    corPrincipal: '#4c1d95',
    corBorda: '#c4b5fd',
    corDetalhe: '#fde047',
    corTexto: '#ffffff',
  }),
  ouro_negro: Object.freeze({
    id: 'ouro_negro',
    nome: 'Preto & Ouro',
    custo: 9,
    gratuita: false,
    corPrincipal: '#18181b',
    corBorda: '#f5b82e',
    corDetalhe: '#f5b82e',
    corTexto: '#f9fafb',
  }),
  laranja_solar: Object.freeze({
    id: 'laranja_solar',
    nome: 'Laranja Solar',
    custo: 10,
    gratuita: false,
    corPrincipal: '#9a3412',
    corBorda: '#fdba74',
    corDetalhe: '#fef08a',
    corTexto: '#ffffff',
  }),
});

export const LISTA_UNIFORMES = Object.freeze(Object.values(PALETAS_UNIFORME));

export const CLUBES_INICIAIS = Object.freeze({
  equilibrado: Object.freeze({
    id: 'equilibrado',
    nome: 'Atlético Brisa',
    rotuloEstilo: 'Equilibrado',
    sigla: 'BRI',
    custo: 0,
    gratuito: true,
    modDefensores: 0,
    modAtacantes: 0,
    descricao: 'Elenco padrão balanceado em todos os setores.',
  }),
  retranca: Object.freeze({
    id: 'retranca',
    nome: 'Atlético Retranca',
    rotuloEstilo: 'Retranca',
    sigla: 'RET',
    custo: 20,
    gratuito: false,
    modDefensores: 4,
    modAtacantes: -3,
    descricao: 'Defensores +4 e atacantes −3 em todos os atributos.',
  }),
  ataque_total: Object.freeze({
    id: 'ataque_total',
    nome: 'Ataque Total FC',
    rotuloEstilo: 'Ataque Total',
    sigla: 'ATQ',
    custo: 30,
    gratuito: false,
    modDefensores: -3,
    modAtacantes: 4,
    descricao: 'Atacantes +4 e defensores −3 em todos os atributos.',
  }),
});

export const LISTA_CLUBES_INICIAIS = Object.freeze(Object.values(CLUBES_INICIAIS));

export const TECNICOS_CLUBE = Object.freeze({
  padrao: Object.freeze({
    id: 'padrao',
    nome: 'Clássico (Sem bônus)',
    custo: 0,
    gratuito: true,
    bonusAtributosPartida: 0,
    fatorPrecoMercado: 1,
    bonusVendaMercadoPct: 0,
    bonusRecuperacaoPorNo: 0,
    descricao: 'Comando tradicional sem vantagem passiva extra.',
  }),
  motivador: Object.freeze({
    id: 'motivador',
    nome: 'Motivador',
    custo: 15,
    gratuito: false,
    bonusAtributosPartida: 2,
    fatorPrecoMercado: 1,
    bonusVendaMercadoPct: 0,
    bonusRecuperacaoPorNo: 0,
    descricao: '+2 em todos os atributos dos jogadores durante a partida.',
  }),
  negociador: Object.freeze({
    id: 'negociador',
    nome: 'Negociador',
    custo: 20,
    gratuito: false,
    bonusAtributosPartida: 0,
    fatorPrecoMercado: 0.85,
    bonusVendaMercadoPct: 0.1,
    bonusRecuperacaoPorNo: 0,
    descricao: 'Preços no mercado −15% e vendas de atletas +10%.',
  }),
  fisiologista: Object.freeze({
    id: 'fisiologista',
    nome: 'Fisiologista',
    custo: 25,
    gratuito: false,
    bonusAtributosPartida: 0,
    fatorPrecoMercado: 1,
    bonusVendaMercadoPct: 0,
    bonusRecuperacaoPorNo: 5,
    descricao: '+5 de estamina recuperada ao passar por cada nó.',
  }),
});

export const LISTA_TECNICOS_CLUBE = Object.freeze(Object.values(TECNICOS_CLUBE));

export const PACOTES_CONTEUDO = Object.freeze({
  pacote_hab_1: Object.freeze({
    id: 'pacote_hab_1',
    tipo: 'habilidades',
    nome: 'Pacote de Habilidades I',
    custo: 20,
    descricao: 'Adiciona 3 habilidades ao sorteio de treino: Olho clínico, Lançamento preciso e Muralha defensiva.',
  }),
  pacote_hab_2: Object.freeze({
    id: 'pacote_hab_2',
    tipo: 'habilidades',
    nome: 'Pacote de Habilidades II',
    custo: 20,
    descricao: 'Adiciona 3 habilidades ao sorteio de treino: Drible curto, Sangue frio e Reflexo felino.',
  }),
  pacote_ev_1: Object.freeze({
    id: 'pacote_ev_1',
    tipo: 'eventos',
    nome: 'Pacote de Eventos I',
    custo: 20,
    descricao: 'Adiciona 3 eventos à campanha: Peneira Aberta, Treino Tático Noturno e Visita de Ídolo.',
  }),
  pacote_ev_2: Object.freeze({
    id: 'pacote_ev_2',
    tipo: 'eventos',
    nome: 'Pacote de Eventos II',
    custo: 20,
    descricao: 'Adiciona 3 eventos à campanha: Gramado Seco, Prêmio Fair Play e Concentração Especial.',
  }),
});

export const LISTA_PACOTES_CONTEUDO = Object.freeze(Object.values(PACOTES_CONTEUDO));

export const CONQUISTAS_DEFINICOES = Object.freeze([
  Object.freeze({
    id: 'sem_derrota',
    nome: 'Temporada Invicta',
    descricao: 'Vencer uma campanha sem sofrer nenhuma derrota.',
  }),
  Object.freeze({
    id: 'goleada_chefao',
    nome: 'Final Histórica',
    descricao: 'Vencer o Chefão por 3 gols de diferença ou mais.',
  }),
  Object.freeze({
    id: 'rico_1000',
    nome: 'Clube Milionário',
    descricao: 'Terminar uma campanha com mais de $1000 em caixa.',
  }),
  Object.freeze({
    id: 'vencer_retranca',
    nome: 'Mestre da Retranca',
    descricao: 'Vencer uma campanha comandando o clube Retranca.',
  }),
  Object.freeze({
    id: 'vencer_nivel_3',
    nome: 'Campeão na Elite',
    descricao: 'Vencer uma campanha no nível de dificuldade 3 ou superior.',
  }),
]);
