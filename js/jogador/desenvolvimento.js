/**
 * Sistema de potencial, curva de desenvolvimento, teto de atributos,
 * evolução com retorno decrescente e rótulos qualitativos de observação (scouting).
 *
 * Princípios:
 * - Potencial é separado da capacidade atual (nunca um simples "atual + X").
 * - Treinos têm retorno decrescente conforme o atributo/jogador se aproxima do teto.
 * - A identidade natural do jogador limita quão longe atributos fora do perfil sobem.
 * - O potencial nunca aparece como número bruto na UI normal — apenas por leitura qualitativa.
 */

import {
  calcularAvaliacaoPosicional,
  garantirIdentidadeJogador,
  normalizarChavePosicao,
  PESOS_AVALIACAO_POSICIONAL,
} from './identidade.js';
import {
  calcularTetoEstritoAtributo,
  garantirCarreiraJogador,
  obterFaixaCarreira,
} from './carreira.js';

export const CURVAS_DESENVOLVIMENTO = Object.freeze({
  precoce: Object.freeze({
    id: 'precoce',
    rotulo: 'Evolução rápida',
    fatorRitmoJovem: 1.25,
    idadePico: 24,
  }),
  equilibrada: Object.freeze({
    id: 'equilibrada',
    rotulo: 'Curva equilibrada',
    fatorRitmoJovem: 1.0,
    idadePico: 26,
  }),
  tardia: Object.freeze({
    id: 'tardia',
    rotulo: 'Amadurecimento tardio',
    fatorRitmoJovem: 0.88,
    idadePico: 28,
  }),
});

export const ROTULOS_POTENCIAL_OLHEIRO = Object.freeze([
  { id: 'excepcional', minPotencial: 82, rotulo: 'Potencial excepcional' },
  { id: 'grande', minPotencial: 73, rotulo: 'Grande potencial' },
  { id: 'bom', minPotencial: 64, rotulo: 'Bom potencial' },
  { id: 'promissor', minPotencial: 56, rotulo: 'Promissor' },
  { id: 'pouco_promissor', minPotencial: 0, rotulo: 'Pouco promissor' },
]);

export const DESENVOLVIMENTO_CONFIG = Object.freeze({
  ganhoMaximoTreino: 5,
  ganhoMinimoTreino: 1,
  tetoAbsoluto: 94,
  // Atributos-assinatura podem alcançar até o potencial individual (nunca ultrapassando-o)
  folgaAtributoPrincipal: 0,
  // Limite abaixo do potencial geral para atributos fora da identidade do jogador
  reducaoAtributoSecundario: 12,
});

function hashDeterministico(texto) {
  let h = 2166136261 >>> 0;
  const s = String(texto || 'dev');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deduz um potencial coerente e independente de "atual + constante fixa"
 * para atletas legados que não possuam o campo `potencial`.
 */
export function deduzirPotencialPadrao(jogador) {
  const atual = calcularAvaliacaoPosicional(jogador);
  const idade = jogador.idade ?? 24;
  const h = hashDeterministico(`pot|${jogador.id || ''}|${jogador.nome || ''}`);

  let margem;
  if (jogador.ehJovem || idade <= 20) {
    margem = 14 + (h % 21); // +14..+34 (grande variância em jovens)
  } else if (idade <= 24) {
    margem = 7 + (h % 16); // +7..+22
  } else if (idade <= 27) {
    margem = 2 + (h % 9); // +2..+10
  } else {
    margem = h % 5; // +0..+4 (veteranos perto do teto)
  }

  return Math.max(Math.round(atual), Math.min(92, Math.round(atual + margem)));
}

/**
 * Garante que o jogador tenha todos os metadados de desenvolvimento, carreira e scouting
 * sem sobrescrever valores já definidos.
 */
export function garantirDesenvolvimentoJogador(jogador) {
  if (!jogador || typeof jogador !== 'object') return jogador;
  garantirIdentidadeJogador(jogador);
  garantirCarreiraJogador(jogador);

  if (typeof jogador.potencial !== 'number' || !Number.isFinite(jogador.potencial)) {
    jogador.potencial = deduzirPotencialPadrao(jogador);
  } else {
    const atual = Math.round(calcularAvaliacaoPosicional(jogador));
    jogador.potencial = Math.max(atual, Math.min(95, Math.round(jogador.potencial)));
  }

  const curvas = Object.keys(CURVAS_DESENVOLVIMENTO);
  if (!CURVAS_DESENVOLVIMENTO[jogador.curvaDesenvolvimento]) {
    const h = hashDeterministico(`curva|${jogador.id || ''}|${jogador.nome || ''}`);
    jogador.curvaDesenvolvimento = curvas[h % curvas.length];
  }

  // Nível de observação (0 = desconhecido, 1 = parcial, 2 = conhecido)
  if (typeof jogador.nivelObservacao !== 'number') {
    jogador.nivelObservacao = jogador.ehMercado ? 1 : 2;
  }

  if (!Array.isArray(jogador.historicoEvolucao)) {
    jogador.historicoEvolucao = [];
  }

  return jogador;
}

/**
 * Calcula o teto realista de um atributo específico para este jogador,
 * respeitando ESTRITAMENTE seu potencial individual e sua identidade posicional
 * (um zagueiro puro não treina finalização até 90, e nenhum jogador ultrapassa o seu potencial).
 */
export function calcularTetoAtributoJogador(jogador, chaveAtributo) {
  garantirDesenvolvimentoJogador(jogador);

  const potencial = jogador.potencial;
  const valorAtual = jogador.atributos?.[chaveAtributo] ?? 45;

  const tetoPersonalizado = jogador.tetoAtributos?.[chaveAtributo];
  const tetoBase =
    typeof tetoPersonalizado === 'number'
      ? Math.min(potencial, tetoPersonalizado)
      : calcularTetoEstritoAtributo(jogador, chaveAtributo);

  const tetoCalculado = Math.min(
    DESENVOLVIMENTO_CONFIG.tetoAbsoluto,
    potencial,
    Math.max(25, Math.round(tetoBase)),
  );

  // Nunca reduz abaixo do que o jogador já possui no estado atual
  return Math.max(valorAtual, tetoCalculado);
}

/**
 * Calcula o ganho de atributo num treino aplicando retorno decrescente
 * integrado às 7 faixas de carreira (formação até fim de carreira):
 * - Longe do teto (gap >= 24) e jovem: pode ganhar +4 ou +5
 * - Distância média (gap 16..23): ganha +3
 * - Perto do teto (gap 9..15): ganha +2
 * - Quase no limite (gap 1..8): ganha +1
 * - No teto (gap === 0) ou avaliação funcional já no potencial: ganha 0
 */
export function calcularGanhoTreinoAtributo(jogador, chaveAtributo, { intensidade = 1 } = {}) {
  garantirDesenvolvimentoJogador(jogador);

  const valorAtual =
    chaveAtributo === 'concentracao'
      ? jogador.atributos.concentracao ?? jogador.mental?.concentracao ?? 45
      : jogador.atributos?.[chaveAtributo] ?? 45;
  const teto = calcularTetoAtributoJogador(jogador, chaveAtributo);
  const gap = Math.max(0, teto - valorAtual);

  if (gap <= 0) {
    return {
      valorAntes: valorAtual,
      valorDepois: valorAtual,
      ganho: 0,
      teto,
      margemRestante: 0,
      estagio: 'no_teto',
    };
  }

  const curva =
    CURVAS_DESENVOLVIMENTO[jogador.curvaDesenvolvimento] ||
    CURVAS_DESENVOLVIMENTO.equilibrada;
  const faixaCarreira = obterFaixaCarreira(jogador.idade);

  // Fator etário guiado pelas faixas de carreira + curva individual
  let fatorIdade = faixaCarreira.fatorTreino;
  if (faixaCarreira.id === 'formacao' || faixaCarreira.id === 'jovem') {
    fatorIdade *= curva.fatorRitmoJovem;
  } else if (faixaCarreira.id === 'auge' && curva.id === 'tardia') {
    fatorIdade *= 1.1;
  }

  // Retorno decrescente suave conforme distância para o teto
  let ganhoBase;
  if (gap >= 24) {
    ganhoBase = 4.6;
  } else if (gap >= 16) {
    ganhoBase = 3.5;
  } else if (gap >= 9) {
    ganhoBase = 2.4;
  } else if (gap >= 4) {
    ganhoBase = 1.6;
  } else {
    ganhoBase = 1.0;
  }

  const ganhoBruto = Math.round(ganhoBase * fatorIdade * intensidade);
  let ganho = Math.max(
    DESENVOLVIMENTO_CONFIG.ganhoMinimoTreino,
    Math.min(DESENVOLVIMENTO_CONFIG.ganhoMaximoTreino, gap, ganhoBruto),
  );

  // Garante que o treino nunca empurre a avaliação funcional acima do potencial
  const potencial = jogador.potencial;
  while (ganho > 0) {
    const backup = jogador.atributos[chaveAtributo];
    jogador.atributos[chaveAtributo] = Math.min(teto, valorAtual + ganho);
    const novaAval = calcularAvaliacaoPosicional(jogador);
    jogador.atributos[chaveAtributo] = backup;
    if (novaAval <= potencial) break;
    ganho -= 1;
  }

  const valorDepois = Math.min(teto, valorAtual + ganho);
  const margemRestante = Math.max(0, teto - valorDepois);
  const estagio =
    ganho === 0 || margemRestante === 0
      ? 'no_teto'
      : margemRestante <= 5
        ? 'perto_teto'
        : margemRestante <= 14
          ? 'em_evolucao'
          : 'alto_espaco';

  return {
    valorAntes: valorAtual,
    valorDepois,
    ganho: valorDepois - valorAtual,
    teto,
    margemRestante,
    estagio,
  };
}

/**
 * Registra um marco no histórico de evolução do atleta e atualiza valor + mental se aplicável.
 * Quando o delta é positivo (treino/evolução), respeita o teto de potencial do jogador.
 */
export function aplicarEvolucaoAtributo(jogador, chaveAtributo, ganho, origem = 'treino') {
  garantirDesenvolvimentoJogador(jogador);
  const antes = jogador.atributos?.[chaveAtributo] ?? 45;
  let alvo = Math.min(100, Math.max(1, Math.round(antes + ganho)));

  if (ganho > 0 && origem !== 'evento_bruto') {
    const teto = calcularTetoAtributoJogador(jogador, chaveAtributo);
    alvo = Math.min(teto, Math.max(antes, alvo));
  }

  const depois = alvo;
  const deltaReal = depois - antes;

  jogador.atributos[chaveAtributo] = depois;
  if (chaveAtributo === 'concentracao') {
    jogador.mental.concentracao = depois;
  }

  if (deltaReal !== 0) {
    jogador.historicoEvolucao.push({
      origem,
      atributo: chaveAtributo,
      antes,
      depois,
      delta: deltaReal,
    });
    if (jogador.historicoEvolucao.length > 30) {
      jogador.historicoEvolucao.shift();
    }
  }

  return { antes, depois, delta: deltaReal };
}

/**
 * Evolução orgânica pós-partida guiada pelo ciclo de carreira (faixa etária + potencial + posição).
 * Funciona para qualquer atleta abaixo do teto (sem depender de flag isolada `ehJovem`),
 * preservando a evolução +1 dos jovens da base dentro do potencial individual.
 */
export function aplicarEvolucaoPosPartidaJogador(jogador, rng = Math.random) {
  garantirDesenvolvimentoJogador(jogador);

  const faixa = obterFaixaCarreira(jogador.idade);
  const potencial = jogador.potencial;
  const atual = calcularAvaliacaoPosicional(jogador);
  if (atual >= potencial) {
    return null;
  }

  const posChave = normalizarChavePosicao(jogador);
  const pesos = PESOS_AVALIACAO_POSICIONAL[posChave] || PESOS_AVALIACAO_POSICIONAL.MEI;
  const candidatos = Object.keys(pesos).filter((attr) => {
    if ((faixa.id === 'auge' || faixa.id === 'veterano') && attr === 'velocidade') {
      return false;
    }
    const teto = calcularTetoAtributoJogador(jogador, attr);
    return (jogador.atributos?.[attr] ?? 45) < teto;
  });

  if (candidatos.length === 0) {
    const todos = jogador.ehGoleiro
      ? ['defesa', 'posicionamento', 'passe', 'dominio', 'concentracao']
      : [
          'passe',
          'dominio',
          'posicionamento',
          'marcacao',
          'interceptacao',
          'desarme',
          'velocidade',
          'tecnica',
          'dibre',
          'finalizacao',
          'concentracao',
        ];
    const comEspaco = todos.filter(
      (a) => (jogador.atributos?.[a] ?? 45) < calcularTetoAtributoJogador(jogador, a),
    );
    if (comEspaco.length === 0) return null;
    const escolhido = comEspaco[Math.floor(rng() * comEspaco.length)];
    const res = aplicarEvolucaoAtributo(jogador, escolhido, 1, 'partida');
    return res.delta > 0 ? { atributo: escolhido, ...res } : null;
  }

  // Sorteio ponderado pela relevância posicional
  const somaPesos = candidatos.reduce((acc, c) => acc + (pesos[c] || 0.05), 0);
  let alvo = rng() * somaPesos;
  let escolhido = candidatos[0];
  for (const c of candidatos) {
    alvo -= pesos[c] || 0.05;
    if (alvo <= 0) {
      escolhido = c;
      break;
    }
  }

  // Verifica que +1 não empurra a avaliação funcional acima do potencial
  const backup = jogador.atributos[escolhido];
  jogador.atributos[escolhido] = backup + 1;
  const novaAval = calcularAvaliacaoPosicional(jogador);
  jogador.atributos[escolhido] = backup;
  if (novaAval > potencial) {
    return null;
  }

  const res = aplicarEvolucaoAtributo(jogador, escolhido, 1, 'partida');
  return res.delta > 0 ? { atributo: escolhido, ...res } : null;
}

/**
 * Traduz o potencial interno para um rótulo qualitativo de olheiro (scouting),
 * ocultando números crus na UI normal.
 */
export function classificarPotencialOlheiro(jogador) {
  garantirDesenvolvimentoJogador(jogador);

  if ((jogador.nivelObservacao ?? 2) <= 0) {
    return {
      id: 'desconhecido',
      rotulo: 'Potencial desconhecido',
      margemTexto: 'Ainda sem avaliação completa de olheiro',
    };
  }

  const atual = calcularAvaliacaoPosicional(jogador);
  const pot = jogador.potencial;
  const gap = Math.max(0, Math.round(pot - atual));
  const faixaCarreira = obterFaixaCarreira(jogador.idade);

  // Veteranos ou atletas consolidados no auge perto do limite recebem leitura honesta
  if (
    (faixaCarreira.id === 'veterano' ||
      faixaCarreira.id === 'declinio' ||
      faixaCarreira.id === 'fim_carreira') &&
    gap <= 4
  ) {
    return {
      id: 'veterano_consolidado',
      rotulo:
        faixaCarreira.id === 'fim_carreira'
          ? 'Experiência de vestiário'
          : 'Veterano consolidado',
      margemTexto: 'Entrega leitura de jogo e experiência, sem margem física de salto',
    };
  }

  if (jogador.idade >= 28 && gap <= 4) {
    return {
      id: 'consolidado',
      rotulo: 'Perto do auge',
      margemTexto: 'Jogador pronto, com pouca margem física de evolução',
    };
  }

  // Se observação parcial (mercado), pode ter incerteza qualitativa de ±1 degrau determinística
  let potPercebido = pot;
  if (jogador.nivelObservacao === 1) {
    const h = hashDeterministico(`scout|${jogador.id || ''}|${jogador.nome || ''}`);
    const ruido = (h % 7) - 3; // -3..+3
    potPercebido = Math.max(atual, Math.min(95, pot + ruido));
  }

  const faixa =
    ROTULOS_POTENCIAL_OLHEIRO.find((f) => potPercebido >= f.minPotencial) ||
    ROTULOS_POTENCIAL_OLHEIRO[ROTULOS_POTENCIAL_OLHEIRO.length - 1];

  const margemTexto =
    gap >= 18
      ? 'Muito espaço para evoluir'
      : gap >= 10
        ? 'Boa margem de crescimento'
        : gap >= 5
          ? 'Ainda pode lapidar detalhes'
          : 'Próximo do seu teto técnico';

  return {
    id: faixa.id,
    rotulo: faixa.rotulo,
    margemTexto,
  };
}
