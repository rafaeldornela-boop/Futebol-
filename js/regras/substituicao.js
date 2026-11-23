/**
 * Módulo de substituições por partida e por turno.
 *
 * Regras:
 * - Até 5 substituições por partida para cada time e no máximo 1 por turno, sem gastar o turno.
 * - O reserva herda a vaga (papel, zona-base e zona atual) de quem saiu.
 * - Quem sai não volta para a partida.
 * - Goleiro só troca por goleiro.
 * - Rival substitui automaticamente quem estiver abaixo de 30 de estamina, até 5 trocas.
 */

import { ehPosicaoNatural, SETOR_DO_PAPEL } from '../dados/formacoes.js';
import { obterEstamina } from './estamina.js';

export const MAX_SUBSTITUICOES_PARTIDA = 5;
export const MAX_SUBSTITUICOES_POR_TURNO = 1;
export const LIMIAR_ESTAMINA_SUB_RIVAL = 30;

export function obterSetorDoJogador(jogador) {
  if (!jogador) return 'MEI';
  if (jogador.ehGoleiro) return 'GOL';
  return jogador.setor || SETOR_DO_PAPEL[jogador.papel] || 'MEI';
}

export function obterSubstituicoesRestantes(estado, timeId) {
  const usadas = estado?.substituicoes?.[timeId] ?? 0;
  return Math.max(0, MAX_SUBSTITUICOES_PARTIDA - usadas);
}

/**
 * Verifica se o time pode fazer substituição neste turno e, opcionalmente, para um jogador específico.
 */
export function podeSubstituir(estado, timeId, jogadorSaiId = null) {
  if (!estado || estado.encerrada) {
    return {
      permitido: false,
      motivo: 'Partida já encerrada.',
      restantesPartida: 0,
    };
  }

  const time = estado.times?.[timeId];
  if (!time) {
    return { permitido: false, motivo: 'Time inválido.', restantesPartida: 0 };
  }

  const restantesPartida = obterSubstituicoesRestantes(estado, timeId);
  if (restantesPartida <= 0) {
    return {
      permitido: false,
      motivo: `Limite de ${MAX_SUBSTITUICOES_PARTIDA} substituições atingido.`,
      restantesPartida: 0,
    };
  }

  if (estado.substituicaoNoTurno?.[timeId]) {
    return {
      permitido: false,
      motivo: 'Já foi feita 1 substituição neste turno.',
      restantesPartida,
    };
  }

  const reservas = time.reservas || [];
  if (reservas.length === 0) {
    return {
      permitido: false,
      motivo: 'Não há mais reservas disponíveis.',
      restantesPartida,
    };
  }

  if (jogadorSaiId) {
    const sai = time.jogadores.find((j) => j.id === jogadorSaiId);
    if (!sai) {
      return {
        permitido: false,
        motivo: 'Jogador não está em campo.',
        restantesPartida,
      };
    }
    if (sai.extras?.cartoes?.vermelho) {
      return {
        permitido: false,
        motivo: 'Jogador expulso não pode ser substituído.',
        restantesPartida,
      };
    }
    const compativeis = reservas.filter(
      (r) => Boolean(r.ehGoleiro) === Boolean(sai.ehGoleiro),
    );
    if (compativeis.length === 0) {
      return {
        permitido: false,
        motivo: sai.ehGoleiro
          ? 'Sem goleiro reserva disponível.'
          : 'Sem jogadores de linha no banco.',
        restantesPartida,
      };
    }
  }

  return {
    permitido: true,
    motivo: '',
    restantesPartida,
  };
}

/**
 * Lista os reservas do time com flag de compatibilidade para o jogador que vai sair.
 */
export function listarReservasDisponiveis(estado, timeId, jogadorSaiId) {
  const time = estado.times?.[timeId];
  if (!time) return [];
  const sai = time.jogadores.find((j) => j.id === jogadorSaiId);
  const reservas = time.reservas || [];

  return reservas.map((reserva) => {
    const compativel = sai
      ? Boolean(reserva.ehGoleiro) === Boolean(sai.ehGoleiro)
      : true;
    const motivoIncompativel = compativel
      ? ''
      : sai?.ehGoleiro
        ? 'Goleiro só troca por goleiro'
        : 'Reserva é goleiro';
    return {
      reserva,
      compativel,
      motivoIncompativel,
    };
  });
}

/**
 * Realiza a substituição sem gastar o turno.
 * O reserva herda vaga (papel, zonaBase, zona) e posse de bola caso o substituído fosse o portador.
 */
export function executarSubstituicao(estado, timeId, jogadorSaiId, jogadorEntraId) {
  const checagem = podeSubstituir(estado, timeId, jogadorSaiId);
  if (!checagem.permitido) {
    return { valido: false, motivo: checagem.motivo };
  }

  const time = estado.times[timeId];
  const idxSai = time.jogadores.findIndex((j) => j.id === jogadorSaiId);
  const idxEntra = time.reservas.findIndex((r) => r.id === jogadorEntraId);

  if (idxSai === -1 || idxEntra === -1) {
    return { valido: false, motivo: 'Jogador titular ou reserva não encontrado.' };
  }

  const sai = time.jogadores[idxSai];
  const entra = time.reservas[idxEntra];

  if (Boolean(sai.ehGoleiro) !== Boolean(entra.ehGoleiro)) {
    return { valido: false, motivo: 'Goleiro só pode ser trocado por goleiro.' };
  }

  // Herda vaga tática e posição atual
  entra.papel = sai.papel;
  entra.zonaBase = sai.zonaBase;
  entra.zona = sai.zona;
  entra.iniciaComBola = sai.iniciaComBola;
  entra.foraDePosicao = !ehPosicaoNatural(entra, sai.papel);

  // Quem sai não volta
  sai.zona = null;
  sai.zonaBase = null;
  sai.foraDePosicao = false;
  if (!sai.extras) sai.extras = {};
  sai.extras.substituido = true;

  time.jogadores[idxSai] = entra;
  time.reservas.splice(idxEntra, 1);
  if (!time.substituidos) time.substituidos = [];
  time.substituidos.push(sai);

  if (estado.timeComBola === timeId && estado.portadorId === sai.id) {
    estado.portadorId = entra.id;
  }

  estado.substituicoes[timeId] += 1;
  estado.substituicaoNoTurno[timeId] = true;

  const texto = `Substituição no ${time.nome}: sai ${sai.nomeCurto} (${obterEstamina(sai)}% est.), entra ${entra.nomeCurto} (${entra.posicao}, 100% est.) na vaga de ${sai.papel}.`;

  return {
    valido: true,
    sai,
    entra,
    restantesPartida: obterSubstituicoesRestantes(estado, timeId),
    texto,
  };
}

function pontuarReservaParaVaga(reserva, setorAlvo, papelAlvo = null) {
  const setorRes = obterSetorDoJogador(reserva);
  const bonusSetor = setorRes === setorAlvo ? 40 : 0;
  const bonusNatural = papelAlvo && ehPosicaoNatural(reserva, papelAlvo) ? 20 : 0;
  const a = reserva.atributos;
  const media =
    (a.passe + a.dominio + a.posicionamento + a.marcacao + a.desarme + a.tecnica + a.velocidade) /
    7;
  return bonusSetor + bonusNatural + media + (reserva.ehGoleiro ? a.defesa || 0 : 0);
}

/**
 * IA do rival: substitui automaticamente o jogador com estamina abaixo de 30,
 * respeitando 1 troca por turno e até 5 por partida.
 */
export function verificarSubstituicaoAutomaticaRival(estado) {
  const checagem = podeSubstituir(estado, 'rival');
  if (!checagem.permitido) return null;

  const rival = estado.times.rival;
  const cansados = rival.jogadores
    .filter(
      (j) =>
        !j.extras?.cartoes?.vermelho &&
        obterEstamina(j) < LIMIAR_ESTAMINA_SUB_RIVAL,
    )
    .sort((a, b) => obterEstamina(a) - obterEstamina(b));

  for (const sai of cansados) {
    const setorAlvo = obterSetorDoJogador(sai);
    const compativeis = (rival.reservas || [])
      .filter((r) => Boolean(r.ehGoleiro) === Boolean(sai.ehGoleiro))
      .sort(
        (a, b) =>
          pontuarReservaParaVaga(b, setorAlvo, sai.papel) -
          pontuarReservaParaVaga(a, setorAlvo, sai.papel),
      );

    if (compativeis.length > 0) {
      return executarSubstituicao(estado, 'rival', sai.id, compativeis[0].id);
    }
  }

  return null;
}
