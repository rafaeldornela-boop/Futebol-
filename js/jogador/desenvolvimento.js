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
  // Bônus máximo acima do potencial geral em atributos-assinatura da posição
  folgaAtributoPrincipal: 9,
  // Limite abaixo do potencial geral para atributos fora da identidade do jogador
  reducaoAtributoSecundario: 10,
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
 * Garante que o jogador tenha todos os metadados de desenvolvimento e scouting
 * sem sobrescrever valores já definidos.
 */
export function garantirDesenvolvimentoJogador(jogador) {
  if (!jogador || typeof jogador !== 'object') return jogador;
  garantirIdentidadeJogador(jogador);

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
 * respeitando seu potencial geral e sua identidade posicional (um zagueiro puro
 * não vai treinar finalização até 90, e um centroavante não vira zagueiro de elite).
 */
export function calcularTetoAtributoJogador(jogador, chaveAtributo) {
  garantirDesenvolvimentoJogador(jogador);

  const potencial = jogador.potencial;
  const valorAtual = jogador.atributos?.[chaveAtributo] ?? 45;
  const posChave = normalizarChavePosicao(jogador);
  const pesos = PESOS_AVALIACAO_POSICIONAL[posChave] || PESOS_AVALIACAO_POSICIONAL.MEI;
  const pesoPosicional = pesos[chaveAtributo] || 0;

  let deslocamento = 0;
  if (pesoPosicional >= 0.18) {
    deslocamento = DESENVOLVIMENTO_CONFIG.folgaAtributoPrincipal;
  } else if (pesoPosicional >= 0.1) {
    deslocamento = 4;
  } else if (chaveAtributo === 'concentracao') {
    deslocamento = 5;
  } else if (pesoPosicional > 0) {
    deslocamento = 0;
  } else {
    deslocamento = -DESENVOLVIMENTO_CONFIG.reducaoAtributoSecundario;
  }

  const tetoPersonalizado = jogador.tetoAtributos?.[chaveAtributo];
  const tetoCalculado =
    typeof tetoPersonalizado === 'number'
      ? tetoPersonalizado
      : Math.min(
          DESENVOLVIMENTO_CONFIG.tetoAbsoluto,
          Math.max(30, Math.round(potencial + deslocamento)),
        );

  // Nunca reduz abaixo do que o jogador já atingiu
  return Math.max(valorAtual, tetoCalculado);
}

/**
 * Calcula o ganho de atributo num treino aplicando retorno decrescente:
 * - Longe do teto (gap >= 22) e jovem: pode ganhar +4 ou +5
 * - Distância média (gap 12..21): ganha +3
 * - Perto do teto (gap 5..11): ganha +2
 * - Quase no limite (gap 1..4): ganha +1
 * - No teto (gap === 0): ganha 0 (ou +1 apenas em concentração/lapidação rara)
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
  const idade = jogador.idade ?? 24;

  // Fator etário: jovens absorvem mais treino; veteranos progridem mais devagar
  let fatorIdade = 1.0;
  if (idade <= 21) {
    fatorIdade = 1.2 * curva.fatorRitmoJovem;
  } else if (idade <= curva.idadePico) {
    fatorIdade = 1.0;
  } else if (idade <= 29) {
    fatorIdade = 0.78;
  } else {
    fatorIdade = 0.58;
  }

  // Retorno decrescente suave conforme distância para o teto (ex.: 45->50->54->57->59->60)
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
  const ganho = Math.max(
    DESENVOLVIMENTO_CONFIG.ganhoMinimoTreino,
    Math.min(DESENVOLVIMENTO_CONFIG.ganhoMaximoTreino, gap, ganhoBruto),
  );

  const valorDepois = Math.min(teto, valorAtual + ganho);
  const margemRestante = Math.max(0, teto - valorDepois);
  const estagio =
    margemRestante === 0
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
 */
export function aplicarEvolucaoAtributo(jogador, chaveAtributo, ganho, origem = 'treino') {
  garantirDesenvolvimentoJogador(jogador);
  const antes = jogador.atributos?.[chaveAtributo] ?? 45;
  const depois = Math.min(100, Math.max(1, Math.round(antes + ganho)));
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
    if (jogador.historicoEvolucao.length > 24) {
      jogador.historicoEvolucao.shift();
    }
  }

  return { antes, depois, delta: deltaReal };
}

/**
 * Evolução orgânica pós-partida para jovens da base ou atletas abaixo do teto
 * que participaram da partida. Mantém o comportamento de +1 para jovens da base
 * respeitando teto/identidade.
 */
export function aplicarEvolucaoPosPartidaJogador(jogador, rng = Math.random) {
  garantirDesenvolvimentoJogador(jogador);

  const posChave = normalizarChavePosicao(jogador);
  const pesos = PESOS_AVALIACAO_POSICIONAL[posChave] || PESOS_AVALIACAO_POSICIONAL.MEI;
  const candidatos = Object.keys(pesos).filter((attr) => {
    const teto = calcularTetoAtributoJogador(jogador, attr);
    return (jogador.atributos?.[attr] ?? 45) < teto;
  });

  if (candidatos.length === 0) {
    // Fallback para manter compatibilidade com jovens da base caso algum atributo secundário ainda tenha espaço
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
      (a) => (jogador.atributos?.[a] ?? 45) < Math.min(95, jogador.potencial + 8),
    );
    if (comEspaco.length === 0) return null;
    const escolhido = comEspaco[Math.floor(rng() * comEspaco.length)];
    const res = aplicarEvolucaoAtributo(jogador, escolhido, 1, 'partida');
    return { atributo: escolhido, ...res };
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

  const res = aplicarEvolucaoAtributo(jogador, escolhido, 1, 'partida');
  return { atributo: escolhido, ...res };
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

  // Jogador já veterano perto do limite recebe leitura honesta de teto atingido
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
