/**
 * Motor central da partida por turnos no campo vertical de 17 zonas.
 *
 * Responsável por:
 * - Reposicionar os times no início de cada turno conforme a fase da bola
 * - Avaliar passes, conduções e finalizações com modificadores de defesa e bônus
 * - Executar jogadas com sorteio 1..100 (acerto, erro de execução até +20, desarme/interceptação)
 * - Orquestrar ordens defensivas contra o rival, recálculo (< 35%) e contra-ataques
 */

import {
  aplicarMovimentoDeTurno,
  obterFaseParaTime,
} from '../dados/formacoes.js';
import { clonarTimesPadrao } from '../dados/times.js';
import {
  converterDoPontoDeVista,
  ehZonaAreaPenal,
  ehZonaLinhaDeFundo,
  ehZonaTercoFinal,
  obterCorredor,
  obterDistanciaZonas,
  obterFaixa,
  obterZonaGolAlvo,
  obterZonaProprioGoleiro,
  podeCruzarNaZona,
  podeFinalizarNaZona,
  saoZonasVizinhos,
  ZONAS,
  zonaParaPontoDeVista,
} from '../dados/zonas.js';
import {
  calcularChanceConducao,
  calcularChanceCruzamento,
  calcularChanceDibre,
  calcularChanceFinalizacao,
  calcularChancePasse,
  calcularMapaPressao,
  classificarTipoPasse,
  CRUZAMENTO_CONFIG,
  DEFESA_CONFIG,
  DIBRE_CONFIG,
  FINALIZACAO_CONFIG,
  MARGEM_ERRO_EXECUCAO,
} from './calculo.js';
import {
  avaliarCustoOrdemDefensiva,
  calcularChanceCartaoAmarelo,
  criarEstadoDefesaTurno,
  escolherMarcadorFalta,
  obterAjustesChanceTurno,
  obterBonusDefesaGoleiroTurno,
  obterModificadoresPressaoTurno,
  verificarAtivacaoContraAtaque,
} from './defesa.js';
import {
  aplicarCustoEstaminaJogada,
  gastarEstamina,
  obterAtributoEfetivo,
} from './estamina.js';
import {
  avaliarHabilidadeOfensivaPortador,
  consumirUsoHabilidade,
  inicializarHabilidadesTimes,
  listarHabilidadesDefensivasTime,
  listarHabilidadesOfensivasPortador,
} from './habilidades.js';
import {
  executarSubstituicao,
  verificarSubstituicaoAutomaticaRival,
} from './substituicao.js';
import {
  decidirPosturaDinamicaRival,
  normalizarPosturaId,
  obterConfigPostura,
  podeTrocarPosturaPartida,
  POSTURA_PADRAO,
} from './postura.js';
import { garantirDesenvolvimentoJogador } from '../jogador/desenvolvimento.js';
import {
  narrarLance,
  resolverDisputaBola,
  TIPOS_DESFECHO_TECNICO,
} from './lances.js';

export const TURNOS_POR_LADO = 16;

export function obterAdversario(idTime) {
  return idTime === 'meuTime' ? 'rival' : 'meuTime';
}

export function encontrarJogador(time, jogadorId) {
  return time.jogadores.find((j) => j.id === jogadorId) || null;
}

export function encontrarGoleiro(time) {
  return time.jogadores.find((j) => j.ehGoleiro) || time.jogadores[0];
}

export function encontrarJogadorSaida(time) {
  const ativos = time.jogadores.filter((j) => !j.extras?.cartoes?.vermelho);
  return (
    ativos.find((j) => j.iniciaComBola) ||
    ativos.find((j) => j.papel === 'ZAG1') ||
    ativos.find((j) => !j.ehGoleiro) ||
    time.jogadores[0]
  );
}

/**
 * Escolhe o jogador ativo do time que está na zona (ou o mais próximo disponível)
 * para cobrar reposição ou assumir interceptação/desarme.
 */
function encontrarJogadorNaOuPertoDaZona(time, zonaAlvo, { ignorarGoleiro = false } = {}) {
  const ativos = time.jogadores.filter(
    (j) => !j.extras?.cartoes?.vermelho && (!ignorarGoleiro || !j.ehGoleiro),
  );
  const naZona = ativos.filter((j) => j.zona === zonaAlvo);
  if (naZona.length > 0) {
    return naZona[0];
  }
  return ativos[0] || time.jogadores[0];
}

/**
 * Atualiza as posições de ambos os times conforme a zona da bola
 * e eventual deslocamento temporário do bloco defensivo.
 */
export function sincronizarPosicoesTurno(
  estado,
  { cobrarDeslocamento = false, cobrarMeu = true, cobrarRival = true } = {},
) {
  const meu = estado.times.meuTime;
  const rival = estado.times.rival;
  const portadorMeu = estado.timeComBola === 'meuTime' ? estado.portadorId : null;
  const portadorRival = estado.timeComBola === 'rival' ? estado.portadorId : null;
  const deslocamentoMeu =
    estado.timeComBola === 'rival' ? estado.defesaTurno?.deslocamentoMeuTime || 0 : 0;

  const reducaoMeta = estado.modificadoresMeta?.reducaoCustoEstamina || 0;
  const posturaMeu = estado.posturas?.meuTime || POSTURA_PADRAO;
  const posturaRival = estado.posturas?.rival || POSTURA_PADRAO;

  aplicarMovimentoDeTurno(
    meu,
    'meuTime',
    estado.zonaBola,
    portadorMeu,
    meu.formacao,
    deslocamentoMeu,
    {
      cobrarDeslocamento: cobrarDeslocamento && cobrarMeu,
      reducaoMeta,
      posturaId: posturaMeu,
    },
  );
  aplicarMovimentoDeTurno(
    rival,
    'rival',
    estado.zonaBola,
    portadorRival,
    rival.formacao,
    0,
    {
      cobrarDeslocamento: cobrarDeslocamento && cobrarRival,
      reducaoMeta: 0,
      posturaId: posturaRival,
    },
  );
}

/**
 * Cria o estado inicial da partida com meu zagueiro (ZAG1) com a bola em Z1-C.
 */
export function criarPartida(timesPersonalizados = null, opcoes = {}) {
  const times = timesPersonalizados ? structuredClone(timesPersonalizados) : clonarTimesPadrao();
  for (const lado of ['meuTime', 'rival']) {
    for (const j of times[lado]?.jogadores || []) garantirDesenvolvimentoJogador(j);
    for (const j of times[lado]?.reservas || []) garantirDesenvolvimentoJogador(j);
  }
  inicializarHabilidadesTimes(times);
  const zagueiroInicial = encontrarJogadorSaida(times.meuTime);
  const modsMeta =
    opcoes?.modificadoresMeta ||
    timesPersonalizados?.modificadoresMeta ||
    timesPersonalizados?.meuTime?.modificadoresMeta ||
    null;

  const posturaMeu = normalizarPosturaId(
    opcoes?.posturaMeu || times?.meuTime?.postura,
  );
  const posturaRival = normalizarPosturaId(
    opcoes?.posturaRival || times?.rival?.postura,
  );

  const estado = {
    times,
    modificadoresMeta: modsMeta ? structuredClone(modsMeta) : null,
    dificuldadePartida: opcoes?.dificuldade ?? modsMeta?.dificuldade ?? 0,
    participantesMeuIds: new Set((times.meuTime.jogadores || []).map((j) => j.id)),
    placar: { meuTime: 0, rival: 0 },
    turnosMaximosPorLado: TURNOS_POR_LADO,
    turnosJogados: { meuTime: 0, rival: 0 },
    substituicoes: { meuTime: 0, rival: 0 },
    substituicaoNoTurno: { meuTime: false, rival: false },
    ultimaSubstituicaoRival: null,
    posturas: {
      meuTime: posturaMeu,
      rival: posturaRival,
    },
    trocasPostura: {
      meuTime: 0,
      rival: 0,
    },
    posturaTrocadaNoTurno: {
      meuTime: false,
      rival: false,
    },
    descontoRelogioAtual: 0,
    timeComBola: 'meuTime',
    portadorId: zagueiroInicial.id,
    zonaBola: 'Z1-C',
    encerrada: false,
    bonusContraAtaqueMeu: false,
    bonusContraAtaqueRival: false,
    bonusProximaJogadaRival: 0,
    impeto: {
      meuTime: 0,
      rival: 0,
    },
    bonusDibre: {
      meuTime: false,
      rival: false,
    },
    bonusCruzamento: {
      meuTime: false,
      rival: false,
    },
    bonusRebote: {
      meuTime: false,
      rival: false,
    },
    bolaParadaContexto: null,
    defesaTurno: null,
    defesaRivalTurno: null,
    ultimoCalculo: null,
    ultimaJogada: {
      tipo: 'inicio',
      time: 'meuTime',
      texto: `Apita o árbitro! ${zagueiroInicial.nomeCurto} (${zagueiroInicial.posicao}) inicia com a bola em Z1-C. Toque nele para passar, conduzir ou dibrar.`,
    },
    historico: [],
    estatisticas: {
      meuTime: {
        passesCertos: 0,
        passesTentados: 0,
        finalizacoes: 0,
        interceptacoes: 0,
        dibresCertos: 0,
        cruzamentos: 0,
        disputas: 0,
        bolasDivididas: 0,
        traves: 0,
        bloqueios: 0,
        rebotes: 0,
        defesasGoleiro: 0,
      },
      rival: {
        passesCertos: 0,
        passesTentados: 0,
        finalizacoes: 0,
        interceptacoes: 0,
        dibresCertos: 0,
        cruzamentos: 0,
        disputas: 0,
        bolasDivididas: 0,
        traves: 0,
        bloqueios: 0,
        rebotes: 0,
        defesasGoleiro: 0,
      },
    },
    extensoes: {
      marcacaoIndividual: {
        meuTime: null,
        rival: null,
      },
      hooks: [],
    },
  };

  sincronizarPosicoesTurno(estado, { cobrarDeslocamento: false });
  return estado;
}

export function obterPortador(estado) {
  return encontrarJogador(estado.times[estado.timeComBola], estado.portadorId);
}

/**
 * Calcula o mapa completo das duas pressões (portador e linha de passe)
 * de um time defensor sobre todas as 17 zonas.
 */
export function obterPressaoDefensiva(estado, timeDefensorId = 'rival') {
  const defensores = estado.times[timeDefensorId].jogadores;
  const marcacaoInd = estado.extensoes?.marcacaoIndividual?.[timeDefensorId] || null;
  const modPressao = obterModificadoresPressaoTurno(estado, timeDefensorId);
  return calcularMapaPressao(defensores, marcacaoInd, modPressao);
}

/**
 * Prévia de passe para um companheiro ativo (não expulso), opcionalmente com habilidade ativa.
 */
export function avaliarPasse(estado, receptorId, { habilidadeId = null } = {}) {
  const idAtacante = estado.timeComBola;
  const idDefensor = obterAdversario(idAtacante);
  const timeAtacante = estado.times[idAtacante];
  const timeDefensor = estado.times[idDefensor];

  const passador = encontrarJogador(timeAtacante, estado.portadorId);
  const receptor = encontrarJogador(timeAtacante, receptorId);
  if (
    !passador ||
    !receptor ||
    passador.id === receptor.id ||
    receptor.extras?.cartoes?.vermelho ||
    !receptor.zona
  ) {
    return null;
  }

  const tipo = classificarTipoPasse(passador.zona, receptor.zona, idAtacante);

  let infoHab = null;
  if (habilidadeId) {
    infoHab = avaliarHabilidadeOfensivaPortador(estado, passador, habilidadeId);
    if (!infoHab || !infoHab.disponivel) return null;
    if (infoHab.habilidade.efeito?.tipo !== 'passe_ignora_pressao_destino') {
      return null;
    }
    const permitidos = infoHab.habilidade.efeito.tiposPassePermitidos;
    if (permitidos && !permitidos.includes(tipo.id)) {
      return null;
    }
  }

  const mapaPressao = obterPressaoDefensiva(estado, idDefensor);
  const ajustesChance = obterAjustesChanceTurno(estado, idAtacante, 'passe', tipo.id, {
    zonaOrigem: passador.zona,
    zonaDestino: receptor.zona,
  });

  const calculo = calcularChancePasse({
    passador,
    receptor,
    defensores: timeDefensor.jogadores,
    timeId: idAtacante,
    aliados: timeAtacante.jogadores,
    mapaPressao,
    ajustesChance,
    habilidadeAtiva: infoHab?.habilidade || null,
  });

  return {
    acao: 'passe',
    passador,
    receptor,
    zonaOrigem: passador.zona,
    zonaDestino: receptor.zona,
    habilidadeAtiva: infoHab
      ? {
          id: infoHab.habilidade.id,
          nome: infoHab.habilidade.nome,
          acaoAlvo: infoHab.habilidade.acaoAlvo,
          custo: infoHab.habilidade.custo,
          custoFinal: infoHab.custo,
          jogadorId: passador.id,
          efeito: infoHab.habilidade.efeito,
        }
      : null,
    calculo,
  };
}

/**
 * Prévia de condução do portador para uma zona vizinha (ou 2 zonas via Arrancada).
 */
export function avaliarConducao(estado, zonaDestino, { habilidadeId = null } = {}) {
  const idAtacante = estado.timeComBola;
  const idDefensor = obterAdversario(idAtacante);
  const timeAtacante = estado.times[idAtacante];
  const timeDefensor = estado.times[idDefensor];

  const portador = encontrarJogador(timeAtacante, estado.portadorId);
  const golAlvo = obterZonaGolAlvo(idAtacante);
  const proprioGol = obterZonaProprioGoleiro(idAtacante);
  if (!portador || zonaDestino === golAlvo || zonaDestino === proprioGol) {
    return null;
  }

  let infoHab = null;
  if (habilidadeId) {
    infoHab = avaliarHabilidadeOfensivaPortador(estado, portador, habilidadeId);
    if (!infoHab || !infoHab.disponivel) return null;
    if (infoHab.habilidade.efeito?.tipo !== 'conducao_distancia') return null;
    const distExata = infoHab.habilidade.efeito.distanciaExata || 2;
    if (
      !ZONAS[zonaDestino] ||
      ZONAS[zonaDestino].foraDaGrade ||
      obterDistanciaZonas(portador.zona, zonaDestino) !== distExata
    ) {
      return null;
    }
  } else if (!saoZonasVizinhos(portador.zona, zonaDestino)) {
    return null;
  }

  const mapaPressao = obterPressaoDefensiva(estado, idDefensor);
  const ajustesChance = obterAjustesChanceTurno(estado, idAtacante, 'conduzir', null, {
    zonaOrigem: portador.zona,
    zonaDestino,
  });

  const calculo = calcularChanceConducao({
    portador,
    zonaDestino,
    defensores: timeDefensor.jogadores,
    timeId: idAtacante,
    aliados: timeAtacante.jogadores,
    mapaPressao,
    ajustesChance,
    habilidadeAtiva: infoHab?.habilidade || null,
  });

  if (!calculo) return null;

  return {
    acao: 'conduzir',
    passador: portador,
    receptor: null,
    zonaOrigem: portador.zona,
    zonaDestino,
    habilidadeAtiva: infoHab
      ? {
          id: infoHab.habilidade.id,
          nome: infoHab.habilidade.nome,
          acaoAlvo: infoHab.habilidade.acaoAlvo,
          custo: infoHab.habilidade.custo,
          custoFinal: infoHab.custo,
          jogadorId: portador.id,
          efeito: infoHab.habilidade.efeito,
        }
      : null,
    calculo,
  };
}

/**
 * Prévia de Dibre do portador (na própria zona para limpar a marcação ou avançando para zona vizinha).
 */
export function avaliarDibre(estado, zonaDestino = null) {
  const idAtacante = estado.timeComBola;
  const idDefensor = obterAdversario(idAtacante);
  const timeAtacante = estado.times[idAtacante];
  const timeDefensor = estado.times[idDefensor];

  const portador = encontrarJogador(timeAtacante, estado.portadorId);
  if (!portador || !portador.zona || ZONAS[portador.zona]?.foraDaGrade) {
    return null;
  }

  let destinoEscolhido = zonaDestino;
  if (!destinoEscolhido) {
    const zonaCentroArea = converterDoPontoDeVista('Z5-C', idAtacante);
    if (portador.zona === zonaCentroArea) {
      destinoEscolhido = portador.zona;
    } else {
      const candidatos = (ZONAS[portador.zona]?.vizinhos || []).filter(
        (z) => !ZONAS[z]?.foraDaGrade,
      );
      candidatos.sort((a, b) => {
        const distA = obterDistanciaZonas(a, zonaCentroArea);
        const distB = obterDistanciaZonas(b, zonaCentroArea);
        if (distA !== distB) return distA - distB;
        return obterFaixa(b, idAtacante) - obterFaixa(a, idAtacante);
      });
      destinoEscolhido = candidatos[0] || portador.zona;
    }
  }

  if (!ZONAS[destinoEscolhido] || ZONAS[destinoEscolhido].foraDaGrade) {
    return null;
  }
  if (
    destinoEscolhido !== portador.zona &&
    !saoZonasVizinhos(portador.zona, destinoEscolhido)
  ) {
    return null;
  }

  const mapaPressao = obterPressaoDefensiva(estado, idDefensor);
  const ajustesChance = obterAjustesChanceTurno(estado, idAtacante, 'dibrar', null, {
    zonaOrigem: portador.zona,
    zonaDestino: destinoEscolhido,
  });

  const calculo = calcularChanceDibre({
    portador,
    zonaDestino: destinoEscolhido,
    defensores: timeDefensor.jogadores,
    timeId: idAtacante,
    aliados: timeAtacante.jogadores,
    mapaPressao,
    ajustesChance,
  });

  if (!calculo) return null;

  return {
    acao: 'dibrar',
    passador: portador,
    receptor: null,
    zonaOrigem: portador.zona,
    zonaDestino: destinoEscolhido,
    habilidadeAtiva: null,
    calculo,
  };
}

/**
 * Prévia de Cruzamento da Linha de Fundo (Z5-E/Z5-D) ou Ala Ofensiva (Z4-E/Z4-D)
 * para cabeceio/voleio imediato de um companheiro posicionado na área (faixa 5 ou Z4-C).
 */
export function avaliarCruzamento(estado, receptorId = null) {
  const idAtacante = estado.timeComBola;
  const idDefensor = obterAdversario(idAtacante);
  const timeAtacante = estado.times[idAtacante];
  const timeDefensor = estado.times[idDefensor];

  const passador = encontrarJogador(timeAtacante, estado.portadorId);
  if (!passador || !podeCruzarNaZona(passador.zona, idAtacante)) {
    return null;
  }

  let receptor = receptorId ? encontrarJogador(timeAtacante, receptorId) : null;
  if (!receptor) {
    const alvosArea = timeAtacante.jogadores.filter(
      (j) =>
        j.id !== passador.id &&
        !j.ehGoleiro &&
        !j.extras?.cartoes?.vermelho &&
        j.zona &&
        ehZonaTercoFinal(j.zona, idAtacante),
    );
    if (alvosArea.length === 0) return null;
    alvosArea.sort((a, b) => {
      const aZ5C = zonaParaPontoDeVista(a.zona, idAtacante) === 'Z5-C' ? 1 : 0;
      const bZ5C = zonaParaPontoDeVista(b.zona, idAtacante) === 'Z5-C' ? 1 : 0;
      if (aZ5C !== bZ5C) return bZ5C - aZ5C;
      const faixaA = obterFaixa(a.zona, idAtacante);
      const faixaB = obterFaixa(b.zona, idAtacante);
      if (faixaA !== faixaB) return faixaB - faixaA;
      const scoreA =
        obterAtributoEfetivo(a, 'finalizacao') +
        obterAtributoEfetivo(a, 'posicionamento');
      const scoreB =
        obterAtributoEfetivo(b, 'finalizacao') +
        obterAtributoEfetivo(b, 'posicionamento');
      return scoreB - scoreA;
    });
    receptor = alvosArea[0];
  }

  if (
    !receptor ||
    receptor.id === passador.id ||
    receptor.extras?.cartoes?.vermelho ||
    !receptor.zona ||
    !ehZonaTercoFinal(receptor.zona, idAtacante)
  ) {
    return null;
  }

  const goleiro = encontrarGoleiro(timeDefensor);
  const mapaPressao = obterPressaoDefensiva(estado, idDefensor);
  const ajustesChance = obterAjustesChanceTurno(estado, idAtacante, 'cruzar', null, {
    zonaOrigem: passador.zona,
    zonaDestino: receptor.zona,
  });
  const { bonusDefesa: bonusDefesaGoleiro, habilidades: habilidadesDefesaExtra } =
    obterBonusDefesaGoleiroTurno(estado, idDefensor);

  const calculo = calcularChanceCruzamento({
    passador,
    receptor,
    goleiro,
    defensores: timeDefensor.jogadores,
    timeId: idAtacante,
    aliados: timeAtacante.jogadores,
    mapaPressao,
    ajustesChance,
    bonusDefesaGoleiro,
    habilidadesDefesaExtra,
  });

  if (!calculo) return null;

  return {
    acao: 'cruzar',
    passador,
    receptor,
    zonaOrigem: passador.zona,
    zonaDestino: receptor.zona,
    habilidadeAtiva: null,
    calculo,
  };
}

/**
 * Prévia de finalização na faixa 5, Z4-C, faixas 3-4 via Chute de fora,
 * ou em Bola Parada Ofensiva (Pênalti ou Falta Direta).
 */
export function avaliarFinalizacao(
  estado,
  { habilidadeId = null, modoBolaParada = null, tipoChute = 'padrao' } = {},
) {
  const idAtacante = estado.timeComBola;
  const idDefensor = obterAdversario(idAtacante);
  const timeAtacante = estado.times[idAtacante];
  const timeDefensor = estado.times[idDefensor];

  const atacante = encontrarJogador(timeAtacante, estado.portadorId);
  if (!atacante) return null;

  const bp = estado.bolaParadaContexto;
  const bpAtivaTime = bp && bp.time === idAtacante ? bp.tipo : null;
  let modoEfetivo = modoBolaParada;
  if (!modoEfetivo && !habilidadeId) {
    if (bpAtivaTime === 'penalti') {
      modoEfetivo = 'penalti';
    } else if (
      bpAtivaTime === 'falta_ofensiva' &&
      obterFaixa(atacante.zona, idAtacante) >= 3
    ) {
      modoEfetivo = 'falta_direta';
    }
  }

  let infoHab = null;
  if (habilidadeId) {
    infoHab = avaliarHabilidadeOfensivaPortador(estado, atacante, habilidadeId);
    if (!infoHab || !infoHab.disponivel) return null;
    if (infoHab.habilidade.efeito?.tipo !== 'finalizacao_faixas') return null;
    const faixa = obterFaixa(atacante.zona, idAtacante);
    const permitidas = infoHab.habilidade.efeito.faixasPermitidas || [3, 4];
    if (!permitidas.includes(faixa)) return null;
  } else if (
    modoEfetivo !== 'penalti' &&
    modoEfetivo !== 'falta_direta' &&
    !podeFinalizarNaZona(atacante.zona, idAtacante)
  ) {
    return null;
  }

  const goleiro = encontrarGoleiro(timeDefensor);
  const mapaPressao = obterPressaoDefensiva(estado, idDefensor);
  const ajustesChance = obterAjustesChanceTurno(estado, idAtacante, 'finalizar');
  const { bonusDefesa: bonusDefesaGoleiro, habilidades: habilidadesDefesaExtra } =
    obterBonusDefesaGoleiroTurno(estado, idDefensor);

  const calculo = calcularChanceFinalizacao({
    atacante,
    goleiro,
    defensores: timeDefensor.jogadores,
    timeId: idAtacante,
    aliados: timeAtacante.jogadores,
    mapaPressao,
    ajustesChance,
    habilidadeAtiva: infoHab?.habilidade || null,
    bonusDefesaGoleiro,
    habilidadesDefesaExtra,
    modoBolaParada: modoEfetivo,
    tipoChute,
  });

  if (!calculo) return null;

  return {
    acao: 'finalizar',
    passador: atacante,
    receptor: goleiro,
    zonaOrigem: atacante.zona,
    zonaDestino: obterZonaGolAlvo(idAtacante),
    modoBolaParada: modoEfetivo,
    tipoChute,
    habilidadeAtiva: infoHab
      ? {
          id: infoHab.habilidade.id,
          nome: infoHab.habilidade.nome,
          acaoAlvo: infoHab.habilidade.acaoAlvo,
          custo: infoHab.habilidade.custo,
          custoFinal: infoHab.custo,
          jogadorId: atacante.id,
          efeito: infoHab.habilidade.efeito,
        }
      : null,
    calculo,
  };
}

/**
 * Lista todas as jogadas legais disponíveis para o portador atual.
 */
export function listarOpcoesLegais(estado) {
  if (estado.encerrada) return [];
  const portador = obterPortador(estado);
  if (!portador) return [];

  const idAtacante = estado.timeComBola;
  const timeAtacante = estado.times[idAtacante];
  const golAlvo = obterZonaGolAlvo(idAtacante);
  const proprioGol = obterZonaProprioGoleiro(idAtacante);
  const opcoes = [];

  // Se for cobrança de pênalti, a opção principal é a cobrança direta
  if (
    estado.bolaParadaContexto?.time === idAtacante &&
    estado.bolaParadaContexto?.tipo === 'penalti'
  ) {
    const penalti = avaliarFinalizacao(estado, { modoBolaParada: 'penalti' });
    if (penalti) return [penalti];
  }

  for (const companheiro of timeAtacante.jogadores) {
    if (companheiro.id === portador.id || companheiro.extras?.cartoes?.vermelho) continue;
    const previa = avaliarPasse(estado, companheiro.id);
    if (previa) opcoes.push(previa);
  }

  for (const zonaVizinha of ZONAS[portador.zona]?.vizinhos || []) {
    if (zonaVizinha === golAlvo || zonaVizinha === proprioGol) continue;
    const previa = avaliarConducao(estado, zonaVizinha);
    if (previa) opcoes.push(previa);
  }

  // Opções de Dibre no meio/ataque
  const faixaPortador = obterFaixa(portador.zona, idAtacante);
  if (faixaPortador >= 3 && !portador.ehGoleiro) {
    const dibreLocal = avaliarDibre(estado, portador.zona);
    if (dibreLocal) opcoes.push(dibreLocal);
    for (const zonaVizinha of ZONAS[portador.zona]?.vizinhos || []) {
      if (zonaVizinha === golAlvo || zonaVizinha === proprioGol) continue;
      if (obterFaixa(zonaVizinha, idAtacante) >= faixaPortador) {
        const prevDibre = avaliarDibre(estado, zonaVizinha);
        if (prevDibre) opcoes.push(prevDibre);
      }
    }
  }

  // Opções de Cruzamento da Linha de Fundo / Ala Ofensiva
  if (podeCruzarNaZona(portador.zona, idAtacante)) {
    for (const companheiro of timeAtacante.jogadores) {
      if (
        companheiro.id === portador.id ||
        companheiro.ehGoleiro ||
        companheiro.extras?.cartoes?.vermelho ||
        !ehZonaTercoFinal(companheiro.zona, idAtacante)
      ) {
        continue;
      }
      const prevCruz = avaliarCruzamento(estado, companheiro.id);
      if (prevCruz) opcoes.push(prevCruz);
    }
  }

  const chute = avaliarFinalizacao(estado);
  if (chute) opcoes.push(chute);

  return opcoes;
}

/**
 * Lista todas as jogadas legais que utilizam habilidades ativas ofensivas disponíveis do portador atual.
 */
export function listarOpcoesHabilidadesPortador(estado) {
  if (estado.encerrada) return [];
  const portador = obterPortador(estado);
  if (!portador) return [];

  const timeAtacante = estado.times[estado.timeComBola];
  const habsDisponiveis = listarHabilidadesOfensivasPortador(estado, portador).filter(
    (h) => h.disponivel,
  );
  const opcoes = [];

  for (const info of habsDisponiveis) {
    const hab = info.habilidade;
    if (hab.efeito?.tipo === 'passe_ignora_pressao_destino') {
      for (const companheiro of timeAtacante.jogadores) {
        if (companheiro.id === portador.id || companheiro.extras?.cartoes?.vermelho) continue;
        const previa = avaliarPasse(estado, companheiro.id, { habilidadeId: hab.id });
        if (previa) opcoes.push(previa);
      }
    } else if (hab.efeito?.tipo === 'conducao_distancia') {
      for (const zId of Object.keys(ZONAS)) {
        if (ZONAS[zId].foraDaGrade) continue;
        const previa = avaliarConducao(estado, zId, { habilidadeId: hab.id });
        if (previa) opcoes.push(previa);
      }
    } else if (hab.efeito?.tipo === 'finalizacao_faixas') {
      const previa = avaliarFinalizacao(estado, { habilidadeId: hab.id });
      if (previa) opcoes.push(previa);
    }
  }

  return opcoes;
}

/**
 * Reavalia uma jogada anunciada com o estado defensivo atualizado do turno.
 */
export function reavaliarPrevia(estado, previa) {
  if (!previa) return null;
  const habilidadeId = previa.habilidadeAtiva?.id || null;
  if (previa.acao === 'passe' && previa.receptor) {
    return avaliarPasse(estado, previa.receptor.id, { habilidadeId });
  }
  if (previa.acao === 'conduzir') {
    return avaliarConducao(estado, previa.zonaDestino, { habilidadeId });
  }
  if (previa.acao === 'dibrar') {
    return avaliarDibre(estado, previa.zonaDestino);
  }
  if (previa.acao === 'cruzar') {
    return avaliarCruzamento(estado, previa.receptor?.id);
  }
  if (previa.acao === 'finalizar') {
    return avaliarFinalizacao(estado, {
      habilidadeId,
      modoBolaParada: previa.modoBolaParada || null,
      tipoChute: previa.tipoChute || 'padrao',
    });
  }
  return null;
}

/**
 * Sorteia um inteiro de 1 a 100.
 */
export function sortearD100(rng = Math.random) {
  const valor = Math.floor(rng() * 100) + 1;
  return Math.max(1, Math.min(100, valor));
}

function descreverSaidaDeBola(zona, timeAtacanteId) {
  const zonaPV = zonaParaPontoDeVista(zona, timeAtacanteId);
  const corredor = obterCorredor(zona, timeAtacanteId);
  const faixa = obterFaixa(zona, timeAtacanteId);

  if (zonaPV === 'GK') {
    return { tipo: 'escanteio', rotulo: 'escanteio' };
  }
  if (zonaPV === 'GKR' || (faixa === 5 && corredor === 'C')) {
    return { tipo: 'tiro-de-meta', rotulo: 'tiro de meta' };
  }
  return { tipo: 'lateral', rotulo: 'lateral' };
}

function obterZonaReinicioRival(zonaOcorrido, tipoSaida, timeDefensorId) {
  if (tipoSaida === 'tiro-de-meta') {
    return obterZonaProprioGoleiro(timeDefensorId);
  }
  if (tipoSaida === 'escanteio') {
    return timeDefensorId === 'rival' ? 'Z1-E' : 'Z5-D';
  }
  return zonaOcorrido;
}

/**
 * Tenta ativar uma habilidade defensiva ativa do rival (ex.: Carrinho cirúrgico ou Voo)
 * com 25% de chance quando aplicável.
 */
export function tentarAtivarHabilidadeDefensivaRival(
  estado,
  tipoContexto,
  rng = Math.random,
) {
  if (estado.encerrada) return null;

  if (tipoContexto === 'turno_meu') {
    if (estado.timeComBola !== 'meuTime' || estado.defesaRivalTurno?.carrinho) {
      return null;
    }
    const opcoes = listarHabilidadesDefensivasTime(estado, 'rival', null).filter(
      (h) =>
        h.disponivel &&
        h.habilidade.efeito?.tipo === 'multiplicador_pressao_portador_jogador',
    );
    if (opcoes.length === 0 || rng() >= 0.25) return null;

    // Prefere quem está mais perto da bola (ou único disponível)
    opcoes.sort(
      (a, b) =>
        obterDistanciaZonas(a.jogador.zona, estado.zonaBola) -
        obterDistanciaZonas(b.jogador.zona, estado.zonaBola),
    );
    const escolhida = opcoes[0];
    const gasto = gastarEstamina(escolhida.jogador, escolhida.custo);
    consumirUsoHabilidade(escolhida.jogador, escolhida.habilidade.id);

    const ativacao = {
      id: escolhida.habilidade.id,
      nome: escolhida.habilidade.nome,
      jogadorId: escolhida.jogador.id,
      jogadorNome: escolhida.jogador.nomeCurto,
      multiplicador: escolhida.habilidade.efeito.multiplicador || 2,
      custo: escolhida.custo,
      gasto,
    };
    estado.defesaRivalTurno = {
      ...(estado.defesaRivalTurno || {}),
      carrinho: ativacao,
    };
    return ativacao;
  }

  if (tipoContexto === 'finalizacao_meu') {
    if (estado.timeComBola !== 'meuTime' || estado.defesaRivalTurno?.voo) {
      return null;
    }
    const opcoes = listarHabilidadesDefensivasTime(
      estado,
      'rival',
      { acao: 'finalizar' },
    ).filter(
      (h) => h.disponivel && h.habilidade.efeito?.tipo === 'bonus_defesa_goleiro',
    );
    if (opcoes.length === 0 || rng() >= 0.25) return null;

    const escolhida = opcoes[0];
    const gasto = gastarEstamina(escolhida.jogador, escolhida.custo);
    consumirUsoHabilidade(escolhida.jogador, escolhida.habilidade.id);

    const ativacao = {
      id: escolhida.habilidade.id,
      nome: escolhida.habilidade.nome,
      jogadorId: escolhida.jogador.id,
      jogadorNome: escolhida.jogador.nomeCurto,
      bonusDefesa: escolhida.habilidade.efeito.bonusDefesa || 15,
      custo: escolhida.custo,
      gasto,
    };
    estado.defesaRivalTurno = {
      ...(estado.defesaRivalTurno || {}),
      voo: ativacao,
    };
    return ativacao;
  }

  return null;
}

function ganharImpeto(estado, timeId, delta = 1) {
  if (!estado.impeto) estado.impeto = { meuTime: 0, rival: 0 };
  const max = DEFESA_CONFIG.maxNivelImpeto || 3;
  estado.impeto[timeId] = Math.max(
    0,
    Math.min(max, (estado.impeto[timeId] || 0) + delta),
  );
}

function zerarImpeto(estado, timeId) {
  if (!estado.impeto) estado.impeto = { meuTime: 0, rival: 0 };
  estado.impeto[timeId] = 0;
}

function concluirTurno(
  estado,
  proximoTime,
  novaZonaBola,
  proximoPortadorId,
  rngHabilidade = Math.random,
) {
  const limite = estado.turnosMaximosPorLado;
  const turnosMeu = estado.turnosJogados.meuTime;
  const turnosRival = estado.turnosJogados.rival;

  const ordemAnterior = estado.defesaTurno?.ordem || null;
  estado.defesaTurno = null;
  estado.defesaRivalTurno = null;
  estado.substituicaoNoTurno = { meuTime: false, rival: false };
  estado.posturaTrocadaNoTurno = { meuTime: false, rival: false };
  estado.ultimaSubstituicaoRival = null;
  estado.descontoRelogioAtual = 0;

  // Se houve subida temporária por "Pressionar o portador", restaura a zonaBase natural
  // antes de calcular o deslocamento do novo turno para não cobrar dobra de retorno.
  if (ordemAnterior === 'pressionar') {
    for (const j of estado.times.meuTime.jogadores) {
      if (j.zonaBaseAntesOrdem) {
        j.zonaBase = j.zonaBaseAntesOrdem;
        delete j.zonaBaseAntesOrdem;
      }
    }
  }

  if (turnosMeu >= limite && turnosRival >= limite) {
    estado.encerrada = true;
    estado.timeComBola = proximoTime;
    estado.zonaBola = novaZonaBola;
    estado.portadorId = proximoPortadorId;
    estado.bolaParadaContexto = null;
    sincronizarPosicoesTurno(estado, { cobrarDeslocamento: false });
    return;
  }

  let timeEscolhido = proximoTime;
  let zonaEscolhida = novaZonaBola;
  let portadorEscolhido = proximoPortadorId;

  if (estado.turnosJogados[timeEscolhido] >= limite) {
    timeEscolhido = obterAdversario(timeEscolhido);
    zonaEscolhida = timeEscolhido === 'meuTime' ? 'Z1-C' : 'Z5-C';
    const saida = encontrarJogadorSaida(estado.times[timeEscolhido]);
    portadorEscolhido = saida.id;
    estado.bolaParadaContexto = null;
  }

  if (estado.bolaParadaContexto && estado.bolaParadaContexto.time !== timeEscolhido) {
    estado.bolaParadaContexto = null;
  }

  estado.timeComBola = timeEscolhido;
  estado.zonaBola = zonaEscolhida;
  estado.portadorId = portadorEscolhido;

  // Nos últimos 3 turnos do rival, ajusta sua postura dinamicamente conforme o placar
  if (estado.timeComBola === 'rival') {
    const turnosRestantesRival = limite - estado.turnosJogados.rival;
    const posturaDesejada = decidirPosturaDinamicaRival({
      turnosRestantesRival,
      golsRival: estado.placar.rival,
      golsMeu: estado.placar.meuTime,
      posturaAtual: estado.posturas?.rival || POSTURA_PADRAO,
    });
    if (estado.posturas) {
      estado.posturas.rival = posturaDesejada;
    }
  }

  sincronizarPosicoesTurno(estado, { cobrarDeslocamento: true });

  if (estado.timeComBola === 'rival') {
    const subRival = verificarSubstituicaoAutomaticaRival(estado);
    if (subRival?.valido) {
      estado.ultimaSubstituicaoRival = subRival.texto;
    }
  } else if (estado.timeComBola === 'meuTime') {
    tentarAtivarHabilidadeDefensivaRival(estado, 'turno_meu', rngHabilidade);
  }
}

function escolherInterceptadorNaZona(timeDefensor, zonaDestino) {
  const naZona = timeDefensor.jogadores.filter(
    (j) => !j.ehGoleiro && !j.extras?.cartoes?.vermelho && j.zona === zonaDestino,
  );
  if (naZona.length > 0) {
    return naZona.reduce((melhor, atual) =>
      obterAtributoEfetivo(atual, 'interceptacao') +
        obterAtributoEfetivo(atual, 'desarme') >
      obterAtributoEfetivo(melhor, 'interceptacao') +
        obterAtributoEfetivo(melhor, 'desarme')
        ? atual
        : melhor,
    );
  }
  return encontrarJogadorNaOuPertoDaZona(timeDefensor, zonaDestino, {
    ignorarGoleiro: true,
  });
}

/**
 * Registra a intenção inicial do rival no turno dele para permitir resposta defensiva.
 */
export function anunciarIntencaoRival(estado, intencaoInicial) {
  if (!intencaoInicial || estado.timeComBola !== 'rival') return null;
  estado.defesaTurno = criarEstadoDefesaTurno(estado, intencaoInicial);
  return estado.defesaTurno;
}

/**
 * Verifica se duas prévias representam a mesma jogada.
 */
function mesmaJogada(a, b) {
  if (!a || !b || a.acao !== b.acao) return false;
  if (a.acao === 'passe' || a.acao === 'cruzar') {
    return a.receptor?.id === b.receptor?.id;
  }
  return a.zonaDestino === b.zonaDestino;
}

/**
 * Aplica uma ordem defensiva do usuário durante o turno do rival usando estamina:
 * - 'nenhuma': sem gasto, rival executa jogada anunciada
 * - 'pressionar': os 2 de maior eficiência na bola gastam 10 cada; pressão portador ×1,5; time sobe 1 faixa
 * - 'fechar_linha': os 2 de maior eficiência no destino gastam 6 cada; pressão linha ×1,5 no destino e ×0,8 nas demais
 * - 'recuar': só o custo de deslocamento; time desce 1 faixa, frente/longo −10, trás/lateral +5
 * - 'falta_tatica': o de maior eficiência na bola gasta 8; interrompe e reinicia com bola parada (+10 passe); rola cartão
 */
export function aplicarOrdemDefensiva(
  estado,
  tipoOrdem,
  escolherNovaJogadaRival = null,
  rng = Math.random,
) {
  if (estado.encerrada || estado.timeComBola !== 'rival' || !estado.defesaTurno) {
    return { valido: false, motivo: 'Não há jogada rival aguardando ordem.' };
  }

  const defesa = estado.defesaTurno;
  if (defesa.fase !== 'aguardando_ordem') {
    return { valido: false, motivo: 'A ordem defensiva deste turno já foi definida.' };
  }

  if (tipoOrdem === 'nenhuma') {
    defesa.ordem = 'nenhuma';
    defesa.gastosOrdem = [];
    defesa.fase = 'pronto_execucao';
    return {
      valido: true,
      ordem: 'nenhuma',
      trocouJogada: false,
      gastosOrdem: [],
      intencaoFinal: defesa.intencaoAtual,
      texto: `Marcação mantida. ${defesa.intencaoAtual.passador.nomeCurto} prepara ${defesa.intencaoAtual.calculo.tipo.rotulo.toLowerCase()}.`,
    };
  }

  const plano = avaliarCustoOrdemDefensiva(estado, tipoOrdem, defesa);
  if (!plano.disponivel) {
    return {
      valido: false,
      motivo: plano.rotuloEnvolvidos || 'Estamina insuficiente para esta ordem.',
    };
  }

  defesa.ordem = tipoOrdem;
  const gastosRegistrados = [];

  if (tipoOrdem === 'falta_tatica') {
    const marcador = plano.envolvidos[0]?.jogador || defesa.marcadorFalta;
    const chanceAmarelo = calcularChanceCartaoAmarelo(marcador);
    if (marcador) {
      const resGasto = gastarEstamina(marcador, plano.envolvidos[0]?.custo ?? 8);
      gastosRegistrados.push({
        jogador: marcador,
        nome: marcador.nomeCurto,
        ...resGasto,
      });
    }
    defesa.gastosOrdem = gastosRegistrados;

    const sorteioCartao = sortearD100(rng);
    let textoCartao = 'O árbitro só adverte verbalmente.';
    let cartaoAplicado = null;

    if (marcador && sorteioCartao <= chanceAmarelo) {
      marcador.extras.cartoes.amarelos += 1;
      if (marcador.extras.cartoes.amarelos >= 2) {
        marcador.extras.cartoes.vermelho = true;
        marcador.zona = null;
        marcador.zonaBase = null;
        cartaoAplicado = 'vermelho';
        textoCartao = `Cartão vermelho! ${marcador.nomeCurto} recebe o 2º amarelo e está expulso.`;
      } else {
        cartaoAplicado = 'amarelo';
        textoCartao = `Cartão amarelo para ${marcador.nomeCurto}.`;
      }
    } else if (marcador) {
      textoCartao = `${marcador.nomeCurto} escapa do cartão.`;
    }

    defesa.bolaParada = true;
    defesa.marcadorFalta = marcador;
    defesa.chanceAmarelo = chanceAmarelo;
    defesa.ultimoCartao = {
      jogador: marcador,
      chanceAmarelo,
      sorteioCartao,
      cartao: cartaoAplicado,
    };

    // Reinicia o turno do rival com bola parada
    sincronizarPosicoesTurno(estado, { cobrarDeslocamento: false });
    const novaEscolha = escolherNovaJogadaRival
      ? escolherNovaJogadaRival(estado, rng)
      : listarOpcoesLegais(estado)[0] || defesa.intencaoInicial;

    defesa.intencaoAtual = novaEscolha;
    defesa.trocouJogada = true;
    defesa.fase = 'pronto_execucao';

    const texto = `Falta tática de ${marcador?.nomeCurto || 'marcador'} para matar a jogada! ${textoCartao} O rival reinicia na bola parada.`;
    estado.ultimaJogada = {
      tipo: 'falta',
      time: 'meuTime',
      texto,
    };

    return {
      valido: true,
      ordem: 'falta_tatica',
      trocouJogada: true,
      gastosOrdem: gastosRegistrados,
      cartao: defesa.ultimoCartao,
      intencaoFinal: novaEscolha,
      texto,
    };
  }

  // Aplica gasto de estamina conforme a ordem (incluindo habilidades ativas defensivas)
  if (typeof tipoOrdem === 'string' && tipoOrdem.startsWith('hab:')) {
    const itemHab = plano.habilidadeDefensiva;
    const envolvido = plano.envolvidos[0];
    if (envolvido && itemHab) {
      const resGasto = gastarEstamina(envolvido.jogador, envolvido.custo);
      consumirUsoHabilidade(envolvido.jogador, itemHab.habilidade.id);
      gastosRegistrados.push({
        jogador: envolvido.jogador,
        nome: envolvido.jogador.nomeCurto,
        ...resGasto,
      });
      defesa.habilidadeAtiva = {
        id: itemHab.habilidade.id,
        nome: itemHab.habilidade.nome,
        jogadorId: envolvido.jogador.id,
        jogadorNome: envolvido.jogador.nomeCurto,
        efeito: itemHab.habilidade.efeito,
      };
    }
  } else if (tipoOrdem === 'recuar') {
    defesa.deslocamentoMeuTime = -1;
    sincronizarPosicoesTurno(estado, {
      cobrarDeslocamento: true,
      cobrarMeu: true,
      cobrarRival: false,
    });
    for (const item of plano.envolvidos) {
      gastosRegistrados.push({
        jogador: item.jogador,
        nome: item.jogador.nomeCurto,
        anterior: item.estaminaAntes,
        atual: item.jogador.extras.estamina,
        gasto: item.estaminaAntes - item.jogador.extras.estamina,
      });
    }
  } else {
    for (const item of plano.envolvidos) {
      const resGasto = gastarEstamina(item.jogador, item.custo);
      gastosRegistrados.push({
        jogador: item.jogador,
        nome: item.jogador.nomeCurto,
        ...resGasto,
      });
    }
    if (tipoOrdem === 'pressionar') {
      for (const j of estado.times.meuTime.jogadores) {
        if (!j.ehGoleiro && !j.extras?.cartoes?.vermelho) {
          j.zonaBaseAntesOrdem = j.zonaBase;
        }
      }
      defesa.deslocamentoMeuTime = 1;
      sincronizarPosicoesTurno(estado, { cobrarDeslocamento: false });
    }
  }

  defesa.gastosOrdem = gastosRegistrados;

  const recalculada = reavaliarPrevia(estado, defesa.intencaoInicial);
  let intencaoFinal = recalculada || defesa.intencaoInicial;
  let trocou = false;

  const bloquearTrocaParaVoo =
    defesa.habilidadeAtiva?.efeito?.tipo === 'bonus_defesa_goleiro';

  // Se a chance anunciada cair abaixo de 35%, rival muda para a melhor alternativa
  if (
    !bloquearTrocaParaVoo &&
    intencaoFinal.calculo.chance < DEFESA_CONFIG.limiarTrocaJogadaRival
  ) {
    const alternativas = listarOpcoesLegais(estado)
      .filter((op) => !mesmaJogada(op, defesa.intencaoInicial))
      .sort((a, b) => b.calculo.chance - a.calculo.chance);

    if (alternativas.length > 0 && alternativas[0].calculo.chance > intencaoFinal.calculo.chance) {
      intencaoFinal = alternativas[0];
      trocou = true;
    }
  }

  defesa.intencaoAtual = intencaoFinal;
  defesa.trocouJogada = trocou;
  defesa.fase = 'pronto_execucao';

  const rotulosOrdem = {
    pressionar: 'Pressionar o portador',
    fechar_linha: 'Fechar linha de passe',
    recuar: 'Recuar o bloco',
  };
  const rotuloOrdem = defesa.habilidadeAtiva
    ? `${defesa.habilidadeAtiva.nome} (${defesa.habilidadeAtiva.jogadorNome})`
    : rotulosOrdem[tipoOrdem] || tipoOrdem;

  const resumoMudanca = trocou
    ? `A marcação apertou a linha e o rival mudou o plano para ${intencaoFinal.passador.nomeCurto} → ${intencaoFinal.receptor ? intencaoFinal.receptor.nomeCurto : intencaoFinal.zonaDestino}.`
    : `A marcação se ajustou em cima do lance rival.`;

  const texto = `Ordem: ${rotuloOrdem}! ${resumoMudanca}`;
  estado.ultimaJogada = {
    tipo: 'ordem',
    time: 'meuTime',
    texto,
  };

  return {
    valido: true,
    ordem: tipoOrdem,
    trocouJogada: trocou,
    gastosOrdem: gastosRegistrados,
    intencaoFinal,
    texto,
  };
}

/**
 * Executa uma substituição no time informado (até 5 na partida, 1 por turno, sem gastar o turno).
 * Atualiza os cálculos defensivos caso ocorra durante a fase de ordem defensiva.
 */
export function fazerSubstituicao(estado, timeId, jogadorSaiId, jogadorEntraId) {
  const res = executarSubstituicao(estado, timeId, jogadorSaiId, jogadorEntraId);
  if (!res.valido) return res;

  if (timeId === 'meuTime' && estado.participantesMeuIds instanceof Set) {
    estado.participantesMeuIds.add(jogadorEntraId);
  }

  if (
    estado.timeComBola === 'rival' &&
    estado.defesaTurno &&
    estado.defesaTurno.fase === 'aguardando_ordem'
  ) {
    const marcadorFalta = escolherMarcadorFalta(
      estado,
      estado.defesaTurno.zonaBolaAnunciada,
    );
    estado.defesaTurno.marcadorFalta = marcadorFalta;
    estado.defesaTurno.chanceAmarelo = calcularChanceCartaoAmarelo(marcadorFalta);
    const reavaliada = reavaliarPrevia(estado, estado.defesaTurno.intencaoAtual);
    if (reavaliada) {
      estado.defesaTurno.intencaoAtual = reavaliada;
    }
  }

  estado.ultimaJogada = {
    tipo: 'substituicao',
    time: timeId,
    texto: res.texto,
  };

  return res;
}

/**
 * Altera a postura tática do time no início do turno de ataque, sem gastar o turno
 * (máximo de 2 trocas por partida).
 */
export function trocarPosturaNaPartida(estado, novaPostura, timeId = 'meuTime') {
  const checagem = podeTrocarPosturaPartida(estado, timeId, novaPostura);
  if (!checagem.permitido) {
    return { valido: false, motivo: checagem.motivo };
  }

  const posturaFinal = normalizarPosturaId(novaPostura);
  if (!estado.posturas) {
    estado.posturas = { meuTime: POSTURA_PADRAO, rival: POSTURA_PADRAO };
  }
  if (!estado.trocasPostura) {
    estado.trocasPostura = { meuTime: 0, rival: 0 };
  }
  if (!estado.posturaTrocadaNoTurno) {
    estado.posturaTrocadaNoTurno = { meuTime: false, rival: false };
  }

  estado.posturas[timeId] = posturaFinal;
  estado.trocasPostura[timeId] += 1;
  estado.posturaTrocadaNoTurno[timeId] = true;

  sincronizarPosicoesTurno(estado, {
    cobrarDeslocamento: true,
    cobrarMeu: timeId === 'meuTime',
    cobrarRival: timeId === 'rival',
  });

  const cfg = obterConfigPostura(posturaFinal);
  const restantes = Math.max(0, 2 - estado.trocasPostura[timeId]);
  const texto = `Postura ajustada para ${cfg.nome} (${restantes} troca(s) restante(s) na partida).`;
  estado.ultimaJogada = {
    tipo: 'ordem',
    time: timeId,
    texto,
  };

  return {
    valido: true,
    postura: posturaFinal,
    restantes,
    texto,
  };
}

/**
 * Resolve o estouro do relógio de decisão no turno de ataque do usuário:
 * o rival rouba a bola por demora na zona atual, consumindo o turno do usuário.
 */
export function aplicarEstourouRelogioAtaque(estado) {
  if (!estado || estado.encerrada || estado.timeComBola !== 'meuTime') {
    return { valido: false, motivo: 'Relógio de ataque não aplicável neste momento.' };
  }

  const portador = obterPortador(estado);
  const zonaAtual = estado.zonaBola;
  const descontoAplicado = estado.descontoRelogioAtual || 0;

  estado.bonusContraAtaqueMeu = false;
  if (estado.bonusDibre) estado.bonusDibre.meuTime = false;
  if (estado.bonusCruzamento) estado.bonusCruzamento.meuTime = false;
  estado.bolaParadaContexto = null;
  zerarImpeto(estado, 'meuTime');
  ganharImpeto(estado, 'rival', 1);
  estado.descontoRelogioAtual = 0;
  estado.turnosJogados.meuTime += 1;

  const ladrao = escolherInterceptadorNaZona(estado.times.rival, zonaAtual);
  estado.estatisticas.rival.interceptacoes += 1;

  const ativouContraAtaque = verificarAtivacaoContraAtaque(
    { zonaBola: zonaAtual },
    'desarme',
    'rival',
  );
  if (ativouContraAtaque) {
    estado.bonusContraAtaqueRival = true;
  }

  const resultado = {
    tipo: 'interceptacao',
    acao: 'tempo',
    time: 'meuTime',
    sorteio: null,
    chance: 0,
    desfecho: 'Roubo por demora (tempo esgotado)',
    texto: `Tempo esgotado! ${ladrao.nomeCurto} aproveitou a demora de ${portador?.nomeCurto || 'seu time'} e roubou a bola em ${zonaAtual}.`,
  };

  estado.ultimoCalculo = {
    acao: 'tempo',
    tipo: { id: 'tempo', rotulo: 'Tempo esgotado', base: 0, peso: 0 },
    origemNome: portador?.nomeCurto || 'Portador',
    destinoNome: ladrao.nomeCurto,
    zonaOrigem: zonaAtual,
    zonaDestino: zonaAtual,
    base: 0,
    ataque: 0,
    pressaoPortadorOrigem: 0,
    pressaoDestino: 0,
    pressaoTotal: 0,
    peso: 0,
    ajustesChance:
      descontoAplicado > 0
        ? [{ rotulo: 'Desconto relógio', valor: -descontoAplicado }]
        : [],
    descontoRelogio: descontoAplicado,
    posturaMeu: estado.posturas?.meuTime || POSTURA_PADRAO,
    posturaRival: estado.posturas?.rival || POSTURA_PADRAO,
    habilidadesAplicadas: [],
    chance: 0,
    sorteio: null,
    desfecho: resultado.desfecho,
    gastosEstamina: [],
    gastosOrdem: [],
  };

  concluirTurno(estado, 'rival', zonaAtual, ladrao.id);

  if (estado.encerrada) {
    resultado.fimDeJogo = true;
  }
  estado.ultimaJogada = resultado;
  estado.historico.unshift(resultado);
  if (estado.historico.length > 25) {
    estado.historico.pop();
  }

  return {
    valido: true,
    resultado,
    estado,
    ativouContraAtaque,
  };
}

/**
 * Executa uma jogada previamente avaliada (`passe`, `conduzir`, `dibrar`, `cruzar` ou `finalizar`).
 */
export function executarJogada(
  estado,
  previa,
  rng = Math.random,
  { rngHabilidade = Math.random } = {},
) {
  if (estado.encerrada) {
    return { valido: false, motivo: 'A partida já foi encerrada.' };
  }
  if (!previa || !previa.calculo) {
    return { valido: false, motivo: 'Jogada inválida.' };
  }

  const idAtacante = estado.timeComBola;
  const idDefensor = obterAdversario(idAtacante);
  const timeAtacante = estado.times[idAtacante];
  const timeDefensor = estado.times[idDefensor];

  // Em finalização ou cruzamento do meu time, o goleiro rival pode ativar Voo (25%) antes da resolução
  let previaEfetiva = previa;
  let vooRivalAtivado = null;
  if (idAtacante === 'meuTime' && (previa.acao === 'finalizar' || previa.acao === 'cruzar')) {
    vooRivalAtivado = tentarAtivarHabilidadeDefensivaRival(
      estado,
      'finalizacao_meu',
      rngHabilidade,
    );
    if (vooRivalAtivado) {
      previaEfetiva = reavaliarPrevia(estado, previa) || previa;
    }
  }

  const { acao, passador, receptor, zonaDestino, calculo, habilidadeAtiva } = previaEfetiva;

  const estadoSnapshotAntes = { zonaBola: estado.zonaBola };
  const ordemUsadaNoTurnoRival =
    idAtacante === 'rival' ? estado.defesaTurno?.ordem || null : null;
  const gastosOrdemTurno =
    idAtacante === 'rival' ? [...(estado.defesaTurno?.gastosOrdem || [])] : [];
  const carrinhoRivalTurno =
    idAtacante === 'meuTime' ? estado.defesaRivalTurno?.carrinho || null : null;

  const descontoRelogioTurno =
    idAtacante === 'meuTime' ? estado.descontoRelogioAtual || 0 : 0;

  // Consome bônus de jogada única que já foram aplicados neste cálculo
  if (idAtacante === 'meuTime') {
    estado.bonusContraAtaqueMeu = false;
    estado.descontoRelogioAtual = 0;
  } else {
    estado.bonusContraAtaqueRival = false;
    estado.bonusProximaJogadaRival = 0;
  }
  if (estado.bonusDibre) {
    estado.bonusDibre[idAtacante] = false;
  }
  if (estado.bonusCruzamento) {
    estado.bonusCruzamento[idAtacante] = false;
  }
  if (estado.bonusRebote) {
    estado.bonusRebote[idAtacante] = false;
  }
  if (estado.bolaParadaContexto?.time === idAtacante) {
    estado.bolaParadaContexto = null;
  }

  // Consome uso da habilidade ativa ofensiva (mesmo em caso de erro)
  if (habilidadeAtiva) {
    consumirUsoHabilidade(passador, habilidadeAtiva.id);
  }

  // Gasto de estamina da jogada ocorre mesmo se a jogada falhar
  const reducaoMeta =
    idAtacante === 'meuTime' ? estado.modificadoresMeta?.reducaoCustoEstamina || 0 : 0;
  const gastosEstamina = aplicarCustoEstaminaJogada(previaEfetiva, reducaoMeta);

  estado.turnosJogados[idAtacante] += 1;

  const sorteio = sortearD100(rng);
  const chance = calculo.chance;
  const limiteErroExecucao = chance + MARGEM_ERRO_EXECUCAO;
  const sementeNarracao =
    sorteio + estado.turnosJogados.meuTime * 7 + estado.turnosJogados.rival * 11;

  let resultado;
  let ativouContraAtaque = false;
  let desfechoTecnico = null;
  let disputaInfo = null;

  const narrar = (params) =>
    narrarLance({
      acao,
      passador,
      receptor,
      zonaOrigem: previaEfetiva.zonaOrigem,
      zonaDestino,
      timeAtacanteId: idAtacante,
      timeDefensorNome: timeDefensor.nome,
      habilidadeNome: habilidadeAtiva?.nome || null,
      contextoPasse: calculo.contextoPasse || null,
      vooGoleiroNome: vooRivalAtivado?.jogadorNome || null,
      semente: sementeNarracao,
      ...params,
    });

  if (acao === 'passe') {
    estado.estatisticas[idAtacante].passesTentados += 1;
    const estAtacante = estado.estatisticas[idAtacante];
    const estDefensor = estado.estatisticas[idDefensor];

    if (sorteio <= chance) {
      const pressaoDest = calculo.pressaoDestino ?? 0;
      const estabilidadeReceptor =
        calculo.impactoConcentracao?.fatorEstabilidade ?? 1;
      const dominioReceptor = obterAtributoEfetivo(receptor, 'dominio');
      const dominioPressionadoFalhou =
        pressaoDest >= 56 &&
        sorteio > chance - 4 &&
        (dominioReceptor < 40 || estabilidadeReceptor < 0.96);

      if (dominioPressionadoFalhou) {
        estAtacante.disputas = (estAtacante.disputas || 0) + 1;
        estAtacante.bolasDivididas = (estAtacante.bolasDivididas || 0) + 1;
        const marcadorLocal = escolherInterceptadorNaZona(timeDefensor, receptor.zona);
        disputaInfo = resolverDisputaBola({
          jogadoresAtaque: timeAtacante.jogadores,
          jogadoresDefesa: timeDefensor.jogadores,
          zonaDisputa: receptor.zona,
          preferidoAtaque: receptor,
          preferidoDefesa: marcadorLocal,
          vantagemAtaque: 4,
          rng,
        });
        desfechoTecnico = TIPOS_DESFECHO_TECNICO.DOMINIO_RUIM;

        if (disputaInfo.vencedorLado === 'ataque') {
          estAtacante.passesCertos += 1;
          const dono = disputaInfo.vencedor || receptor;
          resultado = {
            tipo: 'acerto',
            desfechoTecnico,
            disputa: disputaInfo,
            acao,
            time: idAtacante,
            sorteio,
            chance,
            zonaOrigem: previaEfetiva.zonaOrigem,
            zonaDestino: receptor.zona,
            desfecho: 'Domínio difícil — mantido na dividida',
            texto: narrar({
              desfechoTecnico,
              defensor: marcadorLocal,
              vencedorDisputa: dono,
              zonaDestino: receptor.zona,
            }),
          };
          concluirTurno(estado, idAtacante, receptor.zona, dono.id, rngHabilidade);
        } else {
          estDefensor.interceptacoes += 1;
          zerarImpeto(estado, idAtacante);
          ganharImpeto(estado, idDefensor, 1);
          const vencedorDef = disputaInfo.vencedor || marcadorLocal;
          ativouContraAtaque = verificarAtivacaoContraAtaque(
            estadoSnapshotAntes,
            'interceptacao',
            idDefensor,
          );
          if (ativouContraAtaque) {
            if (idDefensor === 'meuTime') estado.bonusContraAtaqueMeu = true;
            else estado.bonusContraAtaqueRival = true;
          }
          resultado = {
            tipo: 'interceptacao',
            desfechoTecnico,
            disputa: disputaInfo,
            acao,
            time: idAtacante,
            sorteio,
            chance,
            zonaOrigem: previaEfetiva.zonaOrigem,
            zonaDestino: receptor.zona,
            desfecho: 'Domínio ruim — perda na dividida',
            texto: narrar({
              desfechoTecnico,
              defensor: marcadorLocal,
              vencedorDisputa: vencedorDef,
              zonaDestino: receptor.zona,
              ativouContraAtaque,
            }),
          };
          concluirTurno(estado, idDefensor, receptor.zona, vencedorDef.id, rngHabilidade);
        }
      } else {
        estAtacante.passesCertos += 1;
        const tipoId = calculo.tipo?.id || 'curto';
        const foiDaLinhaDeFundo =
          ehZonaLinhaDeFundo(previaEfetiva.zonaOrigem, idAtacante) &&
          ehZonaTercoFinal(receptor.zona, idAtacante);

        if (foiDaLinhaDeFundo && estado.bonusCruzamento) {
          estado.bonusCruzamento[idAtacante] = true;
        }

        if (
          tipoId === 'frente' ||
          tipoId === 'longo' ||
          tipoId === 'invertido' ||
          ehZonaTercoFinal(receptor.zona, idAtacante)
        ) {
          ganharImpeto(estado, idAtacante, 1);
        }

        desfechoTecnico =
          sorteio <= Math.round(chance * 0.42)
            ? TIPOS_DESFECHO_TECNICO.PASSE_PERFEITO
            : sorteio >= chance - 7 || pressaoDest >= 45
              ? TIPOS_DESFECHO_TECNICO.PASSE_DIFICIL
              : TIPOS_DESFECHO_TECNICO.PASSE_BOM;

        resultado = {
          tipo: 'acerto',
          desfechoTecnico,
          acao,
          time: idAtacante,
          sorteio,
          chance,
          zonaOrigem: previaEfetiva.zonaOrigem,
          zonaDestino: receptor.zona,
          desfecho:
            desfechoTecnico === TIPOS_DESFECHO_TECNICO.PASSE_PERFEITO
              ? 'Passe perfeito'
              : desfechoTecnico === TIPOS_DESFECHO_TECNICO.PASSE_DIFICIL
                ? 'Passe difícil concluído'
                : 'Passe certo',
          texto: narrar({
            desfechoTecnico,
            zonaDestino: receptor.zona,
            foiDaLinhaDeFundo,
          }),
        };
        concluirTurno(estado, idAtacante, receptor.zona, receptor.id, rngHabilidade);
      }
    } else if (sorteio <= limiteErroExecucao) {
      const pressaoDest = calculo.pressaoDestino ?? 0;
      const desviouNaLinha =
        pressaoDest >= 30 &&
        sorteio <= chance + Math.round(MARGEM_ERRO_EXECUCAO * 0.45);

      if (desviouNaLinha) {
        estAtacante.disputas = (estAtacante.disputas || 0) + 1;
        estAtacante.bolasDivididas = (estAtacante.bolasDivididas || 0) + 1;
        const marcadorLocal = escolherInterceptadorNaZona(timeDefensor, zonaDestino);
        disputaInfo = resolverDisputaBola({
          jogadoresAtaque: timeAtacante.jogadores,
          jogadoresDefesa: timeDefensor.jogadores,
          zonaDisputa: zonaDestino,
          preferidoAtaque: receptor,
          preferidoDefesa: marcadorLocal,
          vantagemAtaque: -4,
          rng,
        });
        desfechoTecnico = TIPOS_DESFECHO_TECNICO.PASSE_DESVIADO;

        if (disputaInfo.vencedorLado === 'ataque') {
          const vencedorAtq = disputaInfo.vencedor || receptor;
          resultado = {
            tipo: 'disputa',
            desfechoTecnico,
            disputa: disputaInfo,
            acao,
            time: idAtacante,
            sorteio,
            chance,
            zonaOrigem: previaEfetiva.zonaOrigem,
            zonaDestino,
            desfecho: 'Passe desviado — ataque fica com a segunda bola',
            texto: narrar({
              desfechoTecnico,
              defensor: marcadorLocal,
              vencedorDisputa: vencedorAtq,
            }),
          };
          concluirTurno(estado, idAtacante, zonaDestino, vencedorAtq.id, rngHabilidade);
        } else {
          estDefensor.interceptacoes += 1;
          zerarImpeto(estado, idAtacante);
          ganharImpeto(estado, idDefensor, 1);
          const vencedorDef = disputaInfo.vencedor || marcadorLocal;
          ativouContraAtaque = verificarAtivacaoContraAtaque(
            estadoSnapshotAntes,
            'interceptacao',
            idDefensor,
          );
          if (ativouContraAtaque) {
            if (idDefensor === 'meuTime') estado.bonusContraAtaqueMeu = true;
            else estado.bonusContraAtaqueRival = true;
          }
          resultado = {
            tipo: 'interceptacao',
            desfechoTecnico,
            disputa: disputaInfo,
            acao,
            time: idAtacante,
            sorteio,
            chance,
            zonaOrigem: previaEfetiva.zonaOrigem,
            zonaDestino,
            desfecho: 'Passe desviado — defesa vence disputa',
            texto: narrar({
              desfechoTecnico,
              defensor: marcadorLocal,
              vencedorDisputa: vencedorDef,
              ativouContraAtaque,
            }),
          };
          concluirTurno(estado, idDefensor, zonaDestino, vencedorDef.id, rngHabilidade);
        }
      } else {
        zerarImpeto(estado, idAtacante);
        const saida = descreverSaidaDeBola(zonaDestino, idAtacante);
        const zonaReinicio = obterZonaReinicioRival(zonaDestino, saida.tipo, idDefensor);
        const cobradorRival =
          saida.tipo === 'tiro-de-meta'
            ? encontrarGoleiro(timeDefensor)
            : encontrarJogadorNaOuPertoDaZona(timeDefensor, zonaReinicio, {
                ignorarGoleiro: true,
              });
        if (saida.tipo === 'escanteio') {
          estado.bolaParadaContexto = {
            tipo: 'escanteio',
            time: idDefensor,
            zona: zonaReinicio,
          };
        }
        desfechoTecnico =
          calculo.tipo?.id === 'longo' || calculo.tipo?.id === 'invertido'
            ? TIPOS_DESFECHO_TECNICO.PASSE_FORTE
            : TIPOS_DESFECHO_TECNICO.ERRO_EXECUCAO;
        resultado = {
          tipo: saida.tipo,
          desfechoTecnico,
          acao,
          time: idAtacante,
          sorteio,
          chance,
          zonaOrigem: previaEfetiva.zonaOrigem,
          zonaDestino,
          desfecho: `Erro de execução (${saida.rotulo})`,
          texto: narrar({
            desfechoTecnico,
            saidaRotulo: saida.rotulo,
          }),
        };
        concluirTurno(estado, idDefensor, zonaReinicio, cobradorRival.id, rngHabilidade);
      }
    } else {
      estDefensor.interceptacoes += 1;
      zerarImpeto(estado, idAtacante);
      ganharImpeto(estado, idDefensor, 1);
      const interceptador = escolherInterceptadorNaZona(timeDefensor, zonaDestino);
      ativouContraAtaque = verificarAtivacaoContraAtaque(
        estadoSnapshotAntes,
        'interceptacao',
        idDefensor,
      );
      if (ativouContraAtaque) {
        if (idDefensor === 'meuTime') estado.bonusContraAtaqueMeu = true;
        else estado.bonusContraAtaqueRival = true;
      }
      desfechoTecnico = TIPOS_DESFECHO_TECNICO.INTERCEPTACAO;
      resultado = {
        tipo: 'interceptacao',
        desfechoTecnico,
        acao,
        time: idAtacante,
        sorteio,
        chance,
        zonaOrigem: previaEfetiva.zonaOrigem,
        zonaDestino,
        desfecho: 'Interceptação',
        texto: narrar({
          desfechoTecnico,
          defensor: interceptador,
          ativouContraAtaque,
        }),
      };
      concluirTurno(estado, idDefensor, zonaDestino, interceptador.id, rngHabilidade);
    }
  } else if (acao === 'conduzir') {
    const estAtacante = estado.estatisticas[idAtacante];
    const estDefensor = estado.estatisticas[idDefensor];

    if (sorteio <= chance) {
      if ((calculo.deltaFaixa ?? 0) > 0 || ehZonaTercoFinal(zonaDestino, idAtacante)) {
        ganharImpeto(estado, idAtacante, 1);
      }
      desfechoTecnico = TIPOS_DESFECHO_TECNICO.VANTAGEM_CRIADA;
      resultado = {
        tipo: 'conducao',
        desfechoTecnico,
        acao,
        time: idAtacante,
        sorteio,
        chance,
        zonaOrigem: previaEfetiva.zonaOrigem,
        zonaDestino,
        desfecho: 'Condução limpa',
        texto: narrar({ desfechoTecnico }),
      };
      concluirTurno(estado, idAtacante, zonaDestino, passador.id, rngHabilidade);
    } else if (sorteio <= limiteErroExecucao) {
      const pressaoDest = calculo.pressaoDestino ?? 0;
      const bolaDividida =
        pressaoDest >= 32 &&
        sorteio <= chance + Math.round(MARGEM_ERRO_EXECUCAO * 0.45);

      if (bolaDividida) {
        estAtacante.disputas = (estAtacante.disputas || 0) + 1;
        estAtacante.bolasDivididas = (estAtacante.bolasDivididas || 0) + 1;
        const marcadorLocal = escolherInterceptadorNaZona(timeDefensor, zonaDestino);
        disputaInfo = resolverDisputaBola({
          jogadoresAtaque: timeAtacante.jogadores,
          jogadoresDefesa: timeDefensor.jogadores,
          zonaDisputa: zonaDestino,
          preferidoAtaque: passador,
          preferidoDefesa: marcadorLocal,
          vantagemAtaque: -2,
          rng,
        });
        desfechoTecnico = TIPOS_DESFECHO_TECNICO.BOLA_SOLTA;
        if (disputaInfo.vencedorLado === 'ataque') {
          const dono = disputaInfo.vencedor || passador;
          resultado = {
            tipo: 'disputa',
            desfechoTecnico,
            disputa: disputaInfo,
            acao,
            time: idAtacante,
            sorteio,
            chance,
            zonaOrigem: previaEfetiva.zonaOrigem,
            zonaDestino,
            desfecho: 'Bola dividida — ataque segue com a posse',
            texto: narrar({
              desfechoTecnico,
              defensor: marcadorLocal,
              vencedorDisputa: dono,
            }),
          };
          concluirTurno(estado, idAtacante, zonaDestino, dono.id, rngHabilidade);
        } else {
          estDefensor.interceptacoes += 1;
          zerarImpeto(estado, idAtacante);
          ganharImpeto(estado, idDefensor, 1);
          const vencedorDef = disputaInfo.vencedor || marcadorLocal;
          ativouContraAtaque = verificarAtivacaoContraAtaque(
            estadoSnapshotAntes,
            'desarme',
            idDefensor,
          );
          if (ativouContraAtaque) {
            if (idDefensor === 'meuTime') estado.bonusContraAtaqueMeu = true;
            else estado.bonusContraAtaqueRival = true;
          }
          resultado = {
            tipo: 'interceptacao',
            desfechoTecnico,
            disputa: disputaInfo,
            acao,
            time: idAtacante,
            sorteio,
            chance,
            zonaOrigem: previaEfetiva.zonaOrigem,
            zonaDestino,
            desfecho: 'Bola solta — defesa vence dividida',
            texto: narrar({
              desfechoTecnico,
              defensor: marcadorLocal,
              vencedorDisputa: vencedorDef,
              ativouContraAtaque,
            }),
          };
          concluirTurno(estado, idDefensor, zonaDestino, vencedorDef.id, rngHabilidade);
        }
      } else {
        zerarImpeto(estado, idAtacante);
        const saida = descreverSaidaDeBola(zonaDestino, idAtacante);
        const zonaReinicio = obterZonaReinicioRival(zonaDestino, saida.tipo, idDefensor);
        const cobradorRival =
          saida.tipo === 'tiro-de-meta'
            ? encontrarGoleiro(timeDefensor)
            : encontrarJogadorNaOuPertoDaZona(timeDefensor, zonaReinicio, {
                ignorarGoleiro: true,
              });
        if (saida.tipo === 'escanteio') {
          estado.bolaParadaContexto = {
            tipo: 'escanteio',
            time: idDefensor,
            zona: zonaReinicio,
          };
        }
        desfechoTecnico = TIPOS_DESFECHO_TECNICO.ERRO_EXECUCAO;
        resultado = {
          tipo: saida.tipo,
          desfechoTecnico,
          acao,
          time: idAtacante,
          sorteio,
          chance,
          zonaOrigem: previaEfetiva.zonaOrigem,
          zonaDestino,
          desfecho: `Erro de execução (${saida.rotulo})`,
          texto: narrar({
            desfechoTecnico,
            saidaRotulo: saida.rotulo,
          }),
        };
        concluirTurno(estado, idDefensor, zonaReinicio, cobradorRival.id, rngHabilidade);
      }
    } else {
      estDefensor.interceptacoes += 1;
      zerarImpeto(estado, idAtacante);
      ganharImpeto(estado, idDefensor, 1);
      const desarmador = escolherInterceptadorNaZona(timeDefensor, zonaDestino);
      ativouContraAtaque = verificarAtivacaoContraAtaque(
        estadoSnapshotAntes,
        'desarme',
        idDefensor,
      );
      if (ativouContraAtaque) {
        if (idDefensor === 'meuTime') estado.bonusContraAtaqueMeu = true;
        else estado.bonusContraAtaqueRival = true;
      }
      desfechoTecnico = TIPOS_DESFECHO_TECNICO.DESARME;
      resultado = {
        tipo: 'interceptacao',
        desfechoTecnico,
        acao,
        time: idAtacante,
        sorteio,
        chance,
        zonaOrigem: previaEfetiva.zonaOrigem,
        zonaDestino,
        desfecho: 'Desarme',
        texto: narrar({
          desfechoTecnico,
          defensor: desarmador,
          ativouContraAtaque,
        }),
      };
      concluirTurno(estado, idDefensor, zonaDestino, desarmador.id, rngHabilidade);
    }
  } else if (acao === 'dibrar') {
    const estAtacante = estado.estatisticas[idAtacante];
    const estDefensor = estado.estatisticas[idDefensor];
    const faixaAlvo = obterFaixa(zonaDestino, idAtacante);
    const margemFalta =
      DIBRE_CONFIG.margemFaltaSofrida +
      (faixaAlvo >= 4 ? DIBRE_CONFIG.bonusMargemFaltaTercoFinal : 0);
    const limiteFaltaDibre = chance + margemFalta;
    const limiteDivididaDibre = limiteFaltaDibre + 10;

    if (sorteio <= chance) {
      estAtacante.dibresCertos = (estAtacante.dibresCertos || 0) + 1;
      if (!estado.bonusDibre) estado.bonusDibre = { meuTime: false, rival: false };
      estado.bonusDibre[idAtacante] = true;
      ganharImpeto(estado, idAtacante, 1);

      const marcadorBatido = escolherInterceptadorNaZona(timeDefensor, zonaDestino);
      if (marcadorBatido) {
        gastarEstamina(marcadorBatido, 3);
      }

      desfechoTecnico =
        sorteio <= Math.round(chance * 0.5)
          ? TIPOS_DESFECHO_TECNICO.DRIBLE_LIMPO
          : TIPOS_DESFECHO_TECNICO.DEFENSOR_DESLOCADO;

      resultado = {
        tipo: 'dibre',
        desfechoTecnico,
        acao,
        time: idAtacante,
        sorteio,
        chance,
        zonaOrigem: previaEfetiva.zonaOrigem,
        zonaDestino,
        desfecho: 'Drible limpo — vantagem aberta',
        texto: narrar({
          desfechoTecnico,
          defensor: marcadorBatido,
        }),
      };
      concluirTurno(estado, idAtacante, zonaDestino, passador.id, rngHabilidade);
    } else if (
      sorteio <= limiteFaltaDibre &&
      estado.turnosJogados[idAtacante] < estado.turnosMaximosPorLado
    ) {
      const marcadorFalta = escolherInterceptadorNaZona(timeDefensor, zonaDestino);
      if (ehZonaAreaPenal(zonaDestino, idAtacante)) {
        const zonaPenalti = converterDoPontoDeVista('Z5-C', idAtacante);
        estado.bolaParadaContexto = {
          tipo: 'penalti',
          time: idAtacante,
          zona: zonaPenalti,
        };
        desfechoTecnico = TIPOS_DESFECHO_TECNICO.PENALTI;
        resultado = {
          tipo: 'penalti',
          desfechoTecnico,
          acao,
          time: idAtacante,
          sorteio,
          chance,
          zonaOrigem: previaEfetiva.zonaOrigem,
          zonaDestino: zonaPenalti,
          desfecho: 'Pênalti sofrido!',
          texto: narrar({
            desfechoTecnico,
            defensor: marcadorFalta,
            zonaDestino: zonaPenalti,
          }),
        };
        concluirTurno(estado, idAtacante, zonaPenalti, passador.id, rngHabilidade);
      } else {
        estado.bolaParadaContexto = {
          tipo: 'falta_ofensiva',
          time: idAtacante,
          zona: zonaDestino,
        };
        desfechoTecnico =
          faixaAlvo >= 3
            ? TIPOS_DESFECHO_TECNICO.FALTA_PERIGOSA
            : TIPOS_DESFECHO_TECNICO.FALTA;
        resultado = {
          tipo: 'falta',
          desfechoTecnico,
          acao,
          time: idAtacante,
          sorteio,
          chance,
          zonaOrigem: previaEfetiva.zonaOrigem,
          zonaDestino,
          desfecho: faixaAlvo >= 3 ? 'Falta perigosa sofrida!' : 'Falta sofrida',
          texto: narrar({
            desfechoTecnico,
            defensor: marcadorFalta,
          }),
        };
        concluirTurno(estado, idAtacante, zonaDestino, passador.id, rngHabilidade);
      }
    } else if (sorteio <= limiteDivididaDibre && sorteio < 96) {
      estAtacante.disputas = (estAtacante.disputas || 0) + 1;
      estAtacante.bolasDivididas = (estAtacante.bolasDivididas || 0) + 1;
      const marcadorLocal = escolherInterceptadorNaZona(timeDefensor, zonaDestino);
      disputaInfo = resolverDisputaBola({
        jogadoresAtaque: timeAtacante.jogadores,
        jogadoresDefesa: timeDefensor.jogadores,
        zonaDisputa: zonaDestino,
        preferidoAtaque: passador,
        preferidoDefesa: marcadorLocal,
        vantagemAtaque: -3,
        rng,
      });
      desfechoTecnico = TIPOS_DESFECHO_TECNICO.BOLA_ESCAPANDO;
      if (disputaInfo.vencedorLado === 'ataque') {
        const dono = disputaInfo.vencedor || passador;
        resultado = {
          tipo: 'disputa',
          desfechoTecnico,
          disputa: disputaInfo,
          acao,
          time: idAtacante,
          sorteio,
          chance,
          zonaOrigem: previaEfetiva.zonaOrigem,
          zonaDestino,
          desfecho: 'Toque do marcador — ataque ganha dividida',
          texto: narrar({
            desfechoTecnico,
            defensor: marcadorLocal,
            vencedorDisputa: dono,
          }),
        };
        concluirTurno(estado, idAtacante, zonaDestino, dono.id, rngHabilidade);
      } else {
        estDefensor.interceptacoes += 1;
        zerarImpeto(estado, idAtacante);
        ganharImpeto(estado, idDefensor, 1);
        const vencedorDef = disputaInfo.vencedor || marcadorLocal;
        ativouContraAtaque = verificarAtivacaoContraAtaque(
          estadoSnapshotAntes,
          'desarme',
          idDefensor,
        );
        if (ativouContraAtaque) {
          if (idDefensor === 'meuTime') estado.bonusContraAtaqueMeu = true;
          else estado.bonusContraAtaqueRival = true;
        }
        resultado = {
          tipo: 'interceptacao',
          desfechoTecnico,
          disputa: disputaInfo,
          acao,
          time: idAtacante,
          sorteio,
          chance,
          zonaOrigem: previaEfetiva.zonaOrigem,
          zonaDestino,
          desfecho: 'Bola escapou — defesa fica com a dividida',
          texto: narrar({
            desfechoTecnico,
            defensor: marcadorLocal,
            vencedorDisputa: vencedorDef,
            ativouContraAtaque,
          }),
        };
        concluirTurno(estado, idDefensor, zonaDestino, vencedorDef.id, rngHabilidade);
      }
    } else {
      estDefensor.interceptacoes += 1;
      zerarImpeto(estado, idAtacante);
      ganharImpeto(estado, idDefensor, 1);
      const desarmador = escolherInterceptadorNaZona(timeDefensor, zonaDestino);
      ativouContraAtaque = verificarAtivacaoContraAtaque(
        estadoSnapshotAntes,
        'desarme',
        idDefensor,
      );
      if (ativouContraAtaque) {
        if (idDefensor === 'meuTime') estado.bonusContraAtaqueMeu = true;
        else estado.bonusContraAtaqueRival = true;
      }
      desfechoTecnico = TIPOS_DESFECHO_TECNICO.DESARME;
      resultado = {
        tipo: 'interceptacao',
        desfechoTecnico,
        acao,
        time: idAtacante,
        sorteio,
        chance,
        zonaOrigem: previaEfetiva.zonaOrigem,
        zonaDestino,
        desfecho: 'Desarme no drible',
        texto: narrar({
          desfechoTecnico,
          defensor: desarmador,
          ativouContraAtaque,
        }),
      };
      concluirTurno(estado, idDefensor, zonaDestino, desarmador.id, rngHabilidade);
    }
  } else if (acao === 'cruzar') {
    const estAtacante = estado.estatisticas[idAtacante];
    const estDefensor = estado.estatisticas[idDefensor];
    estAtacante.passesTentados += 1;
    estAtacante.finalizacoes += 1;
    estAtacante.cruzamentos = (estAtacante.cruzamentos || 0) + 1;
    const goleiroRival = encontrarGoleiro(timeDefensor);
    const limiteEscanteio = chance + CRUZAMENTO_CONFIG.margemEscanteioDefesa;
    const limiteDesvioArea = limiteErroExecucao + 12;

    if (sorteio <= chance) {
      estAtacante.passesCertos += 1;
      estado.placar[idAtacante] += 1;
      ganharImpeto(estado, idAtacante, 1);
      zerarImpeto(estado, idDefensor);
      const saidaRival = encontrarJogadorSaida(timeDefensor);
      const zonaSaida = idDefensor === 'rival' ? 'Z5-C' : 'Z1-C';
      desfechoTecnico = TIPOS_DESFECHO_TECNICO.GOL;
      resultado = {
        tipo: 'gol',
        desfechoTecnico,
        acao,
        time: idAtacante,
        sorteio,
        chance,
        zonaOrigem: previaEfetiva.zonaOrigem,
        zonaDestino: obterZonaGolAlvo(idAtacante),
        desfecho: 'GOL DE CABEÇA!',
        texto: narrar({
          desfechoTecnico,
          goleiro: goleiroRival,
        }),
      };
      concluirTurno(estado, idDefensor, zonaSaida, saidaRival.id, rngHabilidade);
    } else if (
      sorteio <= limiteEscanteio &&
      estado.turnosJogados[idAtacante] < estado.turnosMaximosPorLado
    ) {
      estDefensor.defesasGoleiro = (estDefensor.defesasGoleiro || 0) + 1;
      const corredorOrig = obterCorredor(passador.zona, idAtacante);
      const zonaEscPV = corredorOrig === 'D' ? 'Z5-D' : 'Z5-E';
      const zonaEscanteio = converterDoPontoDeVista(zonaEscPV, idAtacante);
      estado.bolaParadaContexto = {
        tipo: 'escanteio',
        time: idAtacante,
        zona: zonaEscanteio,
      };
      desfechoTecnico = TIPOS_DESFECHO_TECNICO.ESCANTEIO;
      resultado = {
        tipo: 'escanteio',
        desfechoTecnico,
        acao,
        time: idAtacante,
        sorteio,
        chance,
        zonaOrigem: previaEfetiva.zonaOrigem,
        zonaDestino: zonaEscanteio,
        desfecho: 'Espalmou p/ Escanteio!',
        texto: narrar({
          desfechoTecnico,
          goleiro: goleiroRival,
          zonaDestino: zonaEscanteio,
        }),
      };
      concluirTurno(estado, idAtacante, zonaEscanteio, passador.id, rngHabilidade);
    } else if (sorteio <= limiteErroExecucao) {
      const zonaGoleiro = obterZonaProprioGoleiro(idDefensor);
      desfechoTecnico = TIPOS_DESFECHO_TECNICO.PARA_FORA;
      resultado = {
        tipo: 'tiro-de-meta',
        desfechoTecnico,
        acao,
        time: idAtacante,
        sorteio,
        chance,
        zonaOrigem: previaEfetiva.zonaOrigem,
        zonaDestino: obterZonaGolAlvo(idAtacante),
        desfecho: 'Cabeceio para fora',
        texto: narrar({
          desfechoTecnico,
          goleiro: goleiroRival,
        }),
      };
      concluirTurno(estado, idDefensor, zonaGoleiro, goleiroRival.id, rngHabilidade);
    } else if (sorteio <= limiteDesvioArea && sorteio < 96) {
      estAtacante.disputas = (estAtacante.disputas || 0) + 1;
      estAtacante.bolasDivididas = (estAtacante.bolasDivididas || 0) + 1;
      const cortador = escolherInterceptadorNaZona(timeDefensor, zonaDestino);
      disputaInfo = resolverDisputaBola({
        jogadoresAtaque: timeAtacante.jogadores,
        jogadoresDefesa: timeDefensor.jogadores,
        zonaDisputa: zonaDestino,
        preferidoAtaque: receptor,
        preferidoDefesa: cortador,
        vantagemAtaque: 0,
        rng,
      });
      desfechoTecnico = TIPOS_DESFECHO_TECNICO.DESVIO;
      if (disputaInfo.vencedorLado === 'ataque') {
        const dono = disputaInfo.vencedor || receptor;
        resultado = {
          tipo: 'disputa',
          desfechoTecnico,
          disputa: disputaInfo,
          acao,
          time: idAtacante,
          sorteio,
          chance,
          zonaOrigem: previaEfetiva.zonaOrigem,
          zonaDestino,
          desfecho: 'Corte parcial — sobra viva na área',
          texto: narrar({
            desfechoTecnico,
            defensor: cortador,
            vencedorDisputa: dono,
          }),
        };
        concluirTurno(estado, idAtacante, zonaDestino, dono.id, rngHabilidade);
      } else {
        estDefensor.interceptacoes += 1;
        zerarImpeto(estado, idAtacante);
        ganharImpeto(estado, idDefensor, 1);
        const vencedorDef = disputaInfo.vencedor || cortador;
        resultado = {
          tipo: 'interceptacao',
          desfechoTecnico,
          disputa: disputaInfo,
          acao,
          time: idAtacante,
          sorteio,
          chance,
          zonaOrigem: previaEfetiva.zonaOrigem,
          zonaDestino,
          desfecho: 'Corte parcial — defesa ganha a segunda bola',
          texto: narrar({
            desfechoTecnico,
            defensor: cortador,
            vencedorDisputa: vencedorDef,
          }),
        };
        concluirTurno(estado, idDefensor, zonaDestino, vencedorDef.id, rngHabilidade);
      }
    } else {
      estDefensor.interceptacoes += 1;
      zerarImpeto(estado, idAtacante);
      ganharImpeto(estado, idDefensor, 1);
      const cortador = escolherInterceptadorNaZona(timeDefensor, zonaDestino);
      desfechoTecnico = TIPOS_DESFECHO_TECNICO.CORTE;
      resultado = {
        tipo: 'interceptacao',
        desfechoTecnico,
        acao,
        time: idAtacante,
        sorteio,
        chance,
        zonaOrigem: previaEfetiva.zonaOrigem,
        zonaDestino,
        desfecho: 'Corte da zaga',
        texto: narrar({
          desfechoTecnico,
          defensor: cortador,
        }),
      };
      concluirTurno(estado, idDefensor, zonaDestino, cortador.id, rngHabilidade);
    }
  } else if (acao === 'finalizar') {
    const estAtacante = estado.estatisticas[idAtacante];
    const estDefensor = estado.estatisticas[idDefensor];
    estAtacante.finalizacoes += 1;
    const goleiroRival = encontrarGoleiro(timeDefensor);
    const tipoChute = calculo.tipoChute || previaEfetiva.tipoChute || 'padrao';

    const margemErroChute =
      tipoChute === 'colocado' ? 8 : MARGEM_ERRO_EXECUCAO;
    const extraBomba = tipoChute === 'bomba' ? 12 : 0;
    const limiteParaFora = chance + margemErroChute;
    const limiteRebote =
      limiteParaFora + (FINALIZACAO_CONFIG.margemReboteDefesa || 14) + extraBomba;
    const limiteEscanteio =
      limiteRebote + FINALIZACAO_CONFIG.margemEscanteioDefesa;

    const zonaAreaCentro = converterDoPontoDeVista('Z5-C', idAtacante);
    const atacantesNaArea = timeAtacante.jogadores.filter(
      (j) =>
        !j.ehGoleiro &&
        !j.extras?.cartoes?.vermelho &&
        j.zona &&
        obterFaixa(j.zona, idAtacante) === 5,
    );

    if (sorteio <= chance) {
      estado.placar[idAtacante] += 1;
      ganharImpeto(estado, idAtacante, 1);
      zerarImpeto(estado, idDefensor);
      const saidaRival = encontrarJogadorSaida(timeDefensor);
      const zonaSaida = idDefensor === 'rival' ? 'Z5-C' : 'Z1-C';
      desfechoTecnico = TIPOS_DESFECHO_TECNICO.GOL;
      resultado = {
        tipo: 'gol',
        desfechoTecnico,
        acao,
        time: idAtacante,
        sorteio,
        chance,
        zonaOrigem: previaEfetiva.zonaOrigem,
        zonaDestino: obterZonaGolAlvo(idAtacante),
        desfecho: 'GOL!',
        texto: narrar({
          desfechoTecnico,
          goleiro: goleiroRival,
          tipoChute,
          modoBolaParada: calculo.modoBolaParada || null,
          zonaDestino: previaEfetiva.zonaOrigem,
        }),
      };
      concluirTurno(estado, idDefensor, zonaSaida, saidaRival.id, rngHabilidade);
    } else if (sorteio <= limiteParaFora) {
      const pressaoChute = calculo.pressaoPortadorOrigem ?? 0;
      const acertouTrave =
        calculo.modoBolaParada !== 'penalti' && sorteio <= chance + 4;
      const chuteBloqueado =
        !acertouTrave &&
        calculo.modoBolaParada !== 'penalti' &&
        pressaoChute >= 42 &&
        sorteio <= chance + 10;

      if (acertouTrave) {
        estAtacante.traves = (estAtacante.traves || 0) + 1;
        desfechoTecnico = TIPOS_DESFECHO_TECNICO.BOLA_NA_TRAVE;
        if (
          atacantesNaArea.length > 0 &&
          estado.turnosJogados[idAtacante] < estado.turnosMaximosPorLado &&
          rng() < 0.45
        ) {
          estAtacante.disputas = (estAtacante.disputas || 0) + 1;
          disputaInfo = resolverDisputaBola({
            jogadoresAtaque: timeAtacante.jogadores,
            jogadoresDefesa: timeDefensor.jogadores,
            zonaDisputa: zonaAreaCentro,
            preferidoAtaque: atacantesNaArea[0],
            vantagemAtaque: 2,
            rng,
          });
          const ataqueFicou = disputaInfo.vencedorLado === 'ataque';
          const dono = disputaInfo.vencedor || (ataqueFicou ? atacantesNaArea[0] : goleiroRival);
          resultado = {
            tipo: ataqueFicou ? 'trave' : 'interceptacao',
            desfechoTecnico,
            disputa: disputaInfo,
            acao,
            time: idAtacante,
            sorteio,
            chance,
            zonaOrigem: previaEfetiva.zonaOrigem,
            zonaDestino: zonaAreaCentro,
            desfecho: ataqueFicou
              ? 'Na trave — sobra na área!'
              : 'Na trave — defesa afasta a sobra',
            texto: narrar({
              desfechoTecnico,
              goleiro: goleiroRival,
              vencedorDisputa: dono,
            }),
          };
          concluirTurno(
            estado,
            ataqueFicou ? idAtacante : idDefensor,
            zonaAreaCentro,
            dono.id,
            rngHabilidade,
          );
        } else {
          const zonaGoleiro = obterZonaProprioGoleiro(idDefensor);
          resultado = {
            tipo: 'trave',
            desfechoTecnico,
            acao,
            time: idAtacante,
            sorteio,
            chance,
            zonaOrigem: previaEfetiva.zonaOrigem,
            zonaDestino: obterZonaGolAlvo(idAtacante),
            desfecho: 'Bola na trave!',
            texto: narrar({
              desfechoTecnico,
              goleiro: goleiroRival,
            }),
          };
          concluirTurno(estado, idDefensor, zonaGoleiro, goleiroRival.id, rngHabilidade);
        }
      } else if (chuteBloqueado) {
        estDefensor.bloqueios = (estDefensor.bloqueios || 0) + 1;
        desfechoTecnico = TIPOS_DESFECHO_TECNICO.BLOQUEIO;
        const bloqueador = escolherInterceptadorNaZona(
          timeDefensor,
          previaEfetiva.zonaOrigem,
        );
        if (
          estado.turnosJogados[idAtacante] < estado.turnosMaximosPorLado &&
          rng() < 0.5
        ) {
          const corredorChute = obterCorredor(passador.zona, idAtacante);
          const zonaEscPV = corredorChute === 'D' ? 'Z5-D' : 'Z5-E';
          const zonaEscanteio = converterDoPontoDeVista(zonaEscPV, idAtacante);
          const cobradorEsc = encontrarJogadorNaOuPertoDaZona(timeAtacante, zonaEscanteio, {
            ignorarGoleiro: true,
          });
          estado.bolaParadaContexto = {
            tipo: 'escanteio',
            time: idAtacante,
            zona: zonaEscanteio,
          };
          resultado = {
            tipo: 'escanteio',
            desfechoTecnico,
            acao,
            time: idAtacante,
            sorteio,
            chance,
            zonaOrigem: previaEfetiva.zonaOrigem,
            zonaDestino: zonaEscanteio,
            desfecho: 'Chute bloqueado — escanteio',
            texto: narrar({
              desfechoTecnico,
              defensor: bloqueador,
              saidaRotulo: 'escanteio',
            }),
          };
          concluirTurno(estado, idAtacante, zonaEscanteio, cobradorEsc.id, rngHabilidade);
        } else {
          estAtacante.disputas = (estAtacante.disputas || 0) + 1;
          disputaInfo = resolverDisputaBola({
            jogadoresAtaque: timeAtacante.jogadores,
            jogadoresDefesa: timeDefensor.jogadores,
            zonaDisputa: previaEfetiva.zonaOrigem,
            preferidoAtaque: passador,
            preferidoDefesa: bloqueador,
            vantagemAtaque: -4,
            rng,
          });
          const ataqueFicou = disputaInfo.vencedorLado === 'ataque';
          const dono = disputaInfo.vencedor || (ataqueFicou ? passador : bloqueador);
          if (!ataqueFicou) {
            zerarImpeto(estado, idAtacante);
            ganharImpeto(estado, idDefensor, 1);
            ativouContraAtaque = verificarAtivacaoContraAtaque(
              estadoSnapshotAntes,
              'desarme',
              idDefensor,
            );
            if (ativouContraAtaque) {
              if (idDefensor === 'meuTime') estado.bonusContraAtaqueMeu = true;
              else estado.bonusContraAtaqueRival = true;
            }
          }
          resultado = {
            tipo: ataqueFicou ? 'bloqueio' : 'interceptacao',
            desfechoTecnico,
            disputa: disputaInfo,
            acao,
            time: idAtacante,
            sorteio,
            chance,
            zonaOrigem: previaEfetiva.zonaOrigem,
            zonaDestino: previaEfetiva.zonaOrigem,
            desfecho: ataqueFicou
              ? 'Chute bloqueado — sobra com ataque'
              : 'Chute bloqueado pela zaga',
            texto: narrar({
              desfechoTecnico,
              defensor: bloqueador,
              vencedorDisputa: dono,
              ativouContraAtaque,
            }),
          };
          concluirTurno(
            estado,
            ataqueFicou ? idAtacante : idDefensor,
            previaEfetiva.zonaOrigem,
            dono.id,
            rngHabilidade,
          );
        }
      } else {
        const zonaGoleiro = obterZonaProprioGoleiro(idDefensor);
        desfechoTecnico = TIPOS_DESFECHO_TECNICO.PARA_FORA;
        resultado = {
          tipo: 'tiro-de-meta',
          desfechoTecnico,
          acao,
          time: idAtacante,
          sorteio,
          chance,
          zonaOrigem: previaEfetiva.zonaOrigem,
          zonaDestino: obterZonaGolAlvo(idAtacante),
          desfecho: 'Para fora (tiro de meta)',
          texto: narrar({
            desfechoTecnico,
            goleiro: goleiroRival,
          }),
        };
        concluirTurno(estado, idDefensor, zonaGoleiro, goleiroRival.id, rngHabilidade);
      }
    } else if (
      sorteio <= limiteRebote &&
      calculo.modoBolaParada !== 'penalti' &&
      atacantesNaArea.length > 0 &&
      estado.turnosJogados[idAtacante] < estado.turnosMaximosPorLado
    ) {
      estAtacante.rebotes = (estAtacante.rebotes || 0) + 1;
      estDefensor.defesasGoleiro = (estDefensor.defesasGoleiro || 0) + 1;
      const pegadorRebote =
        atacantesNaArea.find((j) => j.zona === zonaAreaCentro) ||
        atacantesNaArea[0];
      pegadorRebote.zona = zonaAreaCentro;
      if (estado.bonusRebote) {
        estado.bonusRebote[idAtacante] = true;
      }
      desfechoTecnico = TIPOS_DESFECHO_TECNICO.REBOTE;
      resultado = {
        tipo: 'rebote',
        desfechoTecnico,
        acao,
        time: idAtacante,
        sorteio,
        chance,
        zonaOrigem: previaEfetiva.zonaOrigem,
        zonaDestino: zonaAreaCentro,
        desfecho: 'Rebote na área!',
        texto: narrar({
          desfechoTecnico,
          goleiro: goleiroRival,
          vencedorDisputa: pegadorRebote,
          zonaDestino: zonaAreaCentro,
        }),
      };
      concluirTurno(estado, idAtacante, zonaAreaCentro, pegadorRebote.id, rngHabilidade);
    } else if (
      sorteio <= limiteEscanteio &&
      estado.turnosJogados[idAtacante] < estado.turnosMaximosPorLado
    ) {
      estDefensor.defesasGoleiro = (estDefensor.defesasGoleiro || 0) + 1;
      const corredorChute = obterCorredor(passador.zona, idAtacante);
      const zonaEscPV = corredorChute === 'D' ? 'Z5-D' : 'Z5-E';
      const zonaEscanteio = converterDoPontoDeVista(zonaEscPV, idAtacante);
      const cobradorEsc = encontrarJogadorNaOuPertoDaZona(timeAtacante, zonaEscanteio, {
        ignorarGoleiro: true,
      });
      estado.bolaParadaContexto = {
        tipo: 'escanteio',
        time: idAtacante,
        zona: zonaEscanteio,
      };
      desfechoTecnico = TIPOS_DESFECHO_TECNICO.ESCANTEIO;
      resultado = {
        tipo: 'escanteio',
        desfechoTecnico,
        acao,
        time: idAtacante,
        sorteio,
        chance,
        zonaOrigem: previaEfetiva.zonaOrigem,
        zonaDestino: zonaEscanteio,
        desfecho: 'Defesa p/ Escanteio!',
        texto: narrar({
          desfechoTecnico,
          goleiro: goleiroRival,
          zonaDestino: zonaEscanteio,
        }),
      };
      concluirTurno(estado, idAtacante, zonaEscanteio, cobradorEsc.id, rngHabilidade);
    } else {
      estDefensor.defesasGoleiro = (estDefensor.defesasGoleiro || 0) + 1;
      const zonaGoleiro = obterZonaProprioGoleiro(idDefensor);
      desfechoTecnico =
        sorteio <= limiteEscanteio + 12
          ? TIPOS_DESFECHO_TECNICO.DEFESA_DIFICIL
          : (calculo.pressaoPortadorOrigem ?? 0) >= 50
            ? TIPOS_DESFECHO_TECNICO.FINALIZACAO_FRACA
            : TIPOS_DESFECHO_TECNICO.DEFESA;
      resultado = {
        tipo: 'defesa',
        desfechoTecnico,
        acao,
        time: idAtacante,
        sorteio,
        chance,
        zonaOrigem: previaEfetiva.zonaOrigem,
        zonaDestino: obterZonaGolAlvo(idAtacante),
        desfecho:
          desfechoTecnico === TIPOS_DESFECHO_TECNICO.DEFESA_DIFICIL
            ? 'Grande defesa do goleiro'
            : desfechoTecnico === TIPOS_DESFECHO_TECNICO.FINALIZACAO_FRACA
              ? 'Finalização fraca — defesa tranquila'
              : 'Defesa do goleiro',
        texto: narrar({
          desfechoTecnico,
          goleiro: goleiroRival,
        }),
      };
      concluirTurno(estado, idDefensor, zonaGoleiro, goleiroRival.id, rngHabilidade);
    }
  }

  // Se foi usada a ordem "Pressionar o portador" e o rival acertou, próxima jogada dele ganha +10
  if (
    idAtacante === 'rival' &&
    ordemUsadaNoTurnoRival === 'pressionar' &&
    (resultado.tipo === 'acerto' ||
      resultado.tipo === 'conducao' ||
      resultado.tipo === 'dibre' ||
      resultado.tipo === 'gol')
  ) {
    estado.bonusProximaJogadaRival = DEFESA_CONFIG.bonusRivalAposPressionar;
  }

  const gastosOrdemFinal = [...gastosOrdemTurno];
  if (carrinhoRivalTurno?.gasto) {
    gastosOrdemFinal.push({
      nome: `${carrinhoRivalTurno.jogadorNome} (Carrinho rival)`,
      gasto: carrinhoRivalTurno.gasto.gasto,
      anterior: carrinhoRivalTurno.gasto.anterior,
      atual: carrinhoRivalTurno.gasto.atual,
    });
  }
  if (vooRivalAtivado?.gasto) {
    gastosOrdemFinal.push({
      nome: `${vooRivalAtivado.jogadorNome} (Voo rival)`,
      gasto: vooRivalAtivado.gasto.gasto,
      anterior: vooRivalAtivado.gasto.anterior,
      atual: vooRivalAtivado.gasto.atual,
    });
  }

  estado.ultimoCalculo = {
    ...calculo,
    acao,
    origemNome: passador.nomeCurto,
    destinoNome: receptor ? receptor.nomeCurto : zonaDestino,
    zonaOrigem: previaEfetiva.zonaOrigem,
    zonaDestino,
    sorteio,
    desfecho: resultado.desfecho,
    desfechoTecnico,
    disputa: disputaInfo,
    descontoRelogio: descontoRelogioTurno,
    posturaMeu: estado.posturas?.meuTime || POSTURA_PADRAO,
    posturaRival: estado.posturas?.rival || POSTURA_PADRAO,
    impetoMeu: estado.impeto?.meuTime || 0,
    impetoRival: estado.impeto?.rival || 0,
    gastosEstamina: gastosEstamina.map((g) => ({
      nome: g.jogador.nomeCurto,
      papel: g.papel,
      custo: g.custo,
      anterior: g.anterior,
      atual: g.atual,
    })),
    gastosOrdem: gastosOrdemFinal.map((g) => ({
      nome: g.nome,
      gasto: g.gasto,
      anterior: g.anterior,
      atual: g.atual,
    })),
  };

  if (estado.encerrada) {
    resultado.fimDeJogo = true;
  }

  estado.ultimaJogada = resultado;
  estado.historico.unshift(resultado);
  if (estado.historico.length > 25) {
    estado.historico.pop();
  }

  return {
    valido: true,
    resultado,
    estado,
    ativouContraAtaque,
    gastosEstamina,
    vooRivalAtivado,
  };
}

export function executarPasse(
  estado,
  receptorId,
  rng = Math.random,
  opcoes = {},
) {
  const previa = avaliarPasse(estado, receptorId, opcoes);
  if (!previa) return { valido: false, motivo: 'Passe inválido.' };
  return executarJogada(estado, previa, rng, opcoes);
}

export function executarConducao(
  estado,
  zonaDestino,
  rng = Math.random,
  opcoes = {},
) {
  const previa = avaliarConducao(estado, zonaDestino, opcoes);
  if (!previa) return { valido: false, motivo: 'Condução inválida.' };
  return executarJogada(estado, previa, rng, opcoes);
}

export function executarDibre(
  estado,
  zonaDestino = null,
  rng = Math.random,
  opcoes = {},
) {
  const previa = avaliarDibre(estado, zonaDestino);
  if (!previa) return { valido: false, motivo: 'Dibre inválido.' };
  return executarJogada(estado, previa, rng, opcoes);
}

export function executarCruzamento(
  estado,
  receptorId = null,
  rng = Math.random,
  opcoes = {},
) {
  const previa = avaliarCruzamento(estado, receptorId);
  if (!previa) return { valido: false, motivo: 'Cruzamento indisponível nesta zona.' };
  return executarJogada(estado, previa, rng, opcoes);
}

export function executarFinalizacao(estado, rng = Math.random, opcoes = {}) {
  const previa = avaliarFinalizacao(estado, opcoes);
  if (!previa) return { valido: false, motivo: 'Finalização indisponível nesta zona.' };
  return executarJogada(estado, previa, rng, opcoes);
}

export function obterResumoFinal(estado) {
  const golsMeu = estado.placar.meuTime;
  const golsRival = estado.placar.rival;
  const nomeMeu = estado.times?.meuTime?.nome || 'Atlético Brisa';
  const nomeRival = estado.times?.rival?.nome || 'Rival';

  let titulo = 'Empate na Prancheta';
  let desfecho = 'empate';
  if (golsMeu > golsRival) {
    titulo = `Vitória do ${nomeMeu}!`;
    desfecho = 'vitoria';
  } else if (golsMeu < golsRival) {
    titulo = `Vitória: ${nomeRival}`;
    desfecho = 'derrota';
  }

  return {
    titulo,
    desfecho,
    placarMeu: golsMeu,
    placarRival: golsRival,
    estatisticas: estado.estatisticas,
  };
}

/**
 * Compila o resultado da partida encerrada no formato esperado pelo modo campanha:
 * `{ resultado, placar, estaminaFinal, lesionados }`.
 * Jogadores que atuaram e terminaram com estamina < 20 têm 25% de chance de lesão.
 */
export function compilarResultadoPartida(estado, opcoes = {}) {
  const rngLesao = opcoes.rngLesao || opcoes.rng || Math.random;
  const limiarLesao = opcoes.limiarEstaminaLesao ?? 20;
  const chanceLesao = opcoes.chanceLesao ?? 0.25;

  const golsMeu = estado.placar.meuTime;
  const golsRival = estado.placar.rival;
  const resultado =
    golsMeu > golsRival ? 'vitoria' : golsMeu < golsRival ? 'derrota' : 'empate';

  const meu = estado.times.meuTime;
  const estaminaFinal = {};
  const lesionados = [];

  const emCampoOuSairam = [...(meu.jogadores || []), ...(meu.substituidos || [])];
  for (const j of emCampoOuSairam) {
    const est = typeof j.extras?.estamina === 'number' ? j.extras.estamina : 100;
    estaminaFinal[j.id] = est;
    if (est < limiarLesao && rngLesao() < chanceLesao) {
      lesionados.push(j.id);
    }
  }

  for (const r of meu.reservas || []) {
    const est = typeof r.extras?.estamina === 'number' ? r.extras.estamina : 100;
    estaminaFinal[r.id] = est;
  }

  const participantesIds =
    estado.participantesMeuIds instanceof Set
      ? [...estado.participantesMeuIds]
      : (meu.jogadores || []).map((j) => j.id);

  return {
    resultado,
    placar: { meuTime: golsMeu, rival: golsRival },
    estaminaFinal,
    lesionados,
    participantesIds,
    rivalNome: estado.times?.rival?.nome || 'Rival',
    estatisticas: structuredClone(estado.estatisticas),
  };
}

/**
 * Encapsula uma partida completa a partir dos dois times informados.
 * - Com `opcoes.iniciarPartidaUI(estado, concluir)`: delega a execução interativa à UI.
 * - Sem callback de UI (ou com `opcoes.simular = true`): executa os turnos automaticamente.
 * Devolve Promise com `{ resultado, placar, estaminaFinal, lesionados }`.
 */
export async function partida(meuTime, rival, opcoes = {}) {
  const estado = criarPartida(
    { meuTime, rival },
    {
      modificadoresMeta: opcoes.modificadoresMeta || meuTime?.modificadoresMeta || null,
      posturaMeu: opcoes.posturaMeu || meuTime?.postura,
      posturaRival: opcoes.posturaRival || rival?.postura,
      dificuldade: opcoes.dificuldade,
    },
  );

  if (typeof opcoes.iniciarPartidaUI === 'function' && !opcoes.simular) {
    return new Promise((resolve) => {
      opcoes.iniciarPartidaUI(estado, (estadoFinal = estado) => {
        resolve(compilarResultadoPartida(estadoFinal, opcoes));
      });
    });
  }

  const rng = opcoes.rng || Math.random;
  let passos = 0;

  while (!estado.encerrada && passos < 60) {
    passos += 1;
    if (estado.timeComBola === 'meuTime') {
      const opcoesJog = listarOpcoesLegais(estado).sort(
        (a, b) => b.calculo.chance - a.calculo.chance,
      );
      const escolhida =
        typeof opcoes.escolherJogadaMeu === 'function'
          ? opcoes.escolherJogadaMeu(estado, opcoesJog)
          : opcoesJog.find((o) => o.acao === 'finalizar') || opcoesJog[0];
      if (!escolhida) break;
      executarJogada(estado, escolhida, rng, { rngHabilidade: rng });
    } else {
      const opcoesRival = listarOpcoesLegais(estado).sort(
        (a, b) => b.calculo.chance - a.calculo.chance,
      );
      const escolhidaRival =
        typeof opcoes.escolherJogadaRival === 'function'
          ? opcoes.escolherJogadaRival(estado, opcoesRival)
          : opcoesRival.find((o) => o.acao === 'finalizar') || opcoesRival[0];
      if (!escolhidaRival) break;
      anunciarIntencaoRival(estado, escolhidaRival);
      aplicarOrdemDefensiva(estado, 'nenhuma', null, rng);
      executarJogada(estado, estado.defesaTurno.intencaoAtual, rng, {
        rngHabilidade: rng,
      });
    }
  }

  return compilarResultadoPartida(estado, opcoes);
}
