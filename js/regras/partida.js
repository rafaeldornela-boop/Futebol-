/**
 * Motor central da partida por turnos no campo vertical de 17 zonas.
 *
 * Responsável por:
 * - Reposicionar os times no início de cada turno conforme a fase da bola
 * - Avaliar passes, conduções e finalizações com modificadores de defesa e bônus
 * - Executar jogadas com sorteio 1..100 (acerto, erro de execução até +20, desarme/interceptação)
 * - Orquestrar ordens defensivas contra o rival, recálculo (< 35%) e contra-ataques
 */

import { aplicarMovimentoDeTurno } from '../dados/formacoes.js';
import { clonarTimesPadrao } from '../dados/times.js';
import {
  obterCorredor,
  obterDistanciaZonas,
  obterFaixa,
  obterZonaGolAlvo,
  obterZonaProprioGoleiro,
  podeFinalizarNaZona,
  saoZonasVizinhos,
  ZONAS,
  zonaParaPontoDeVista,
} from '../dados/zonas.js';
import {
  calcularChanceConducao,
  calcularChanceFinalizacao,
  calcularChancePasse,
  calcularMapaPressao,
  classificarTipoPasse,
  DEFESA_CONFIG,
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

export const TURNOS_POR_LADO = 10;

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

  aplicarMovimentoDeTurno(
    meu,
    'meuTime',
    estado.zonaBola,
    portadorMeu,
    meu.formacao,
    deslocamentoMeu,
    { cobrarDeslocamento: cobrarDeslocamento && cobrarMeu, reducaoMeta },
  );
  aplicarMovimentoDeTurno(
    rival,
    'rival',
    estado.zonaBola,
    portadorRival,
    rival.formacao,
    0,
    { cobrarDeslocamento: cobrarDeslocamento && cobrarRival, reducaoMeta: 0 },
  );
}

/**
 * Cria o estado inicial da partida com meu zagueiro (ZAG1) com a bola em Z1-C.
 */
export function criarPartida(timesPersonalizados = null, opcoes = {}) {
  const times = timesPersonalizados ? structuredClone(timesPersonalizados) : clonarTimesPadrao();
  inicializarHabilidadesTimes(times);
  const zagueiroInicial = encontrarJogadorSaida(times.meuTime);
  const modsMeta =
    opcoes?.modificadoresMeta ||
    timesPersonalizados?.modificadoresMeta ||
    timesPersonalizados?.meuTime?.modificadoresMeta ||
    null;

  const estado = {
    times,
    modificadoresMeta: modsMeta ? structuredClone(modsMeta) : null,
    participantesMeuIds: new Set((times.meuTime.jogadores || []).map((j) => j.id)),
    placar: { meuTime: 0, rival: 0 },
    turnosMaximosPorLado: TURNOS_POR_LADO,
    turnosJogados: { meuTime: 0, rival: 0 },
    substituicoes: { meuTime: 0, rival: 0 },
    substituicaoNoTurno: { meuTime: false, rival: false },
    ultimaSubstituicaoRival: null,
    timeComBola: 'meuTime',
    portadorId: zagueiroInicial.id,
    zonaBola: 'Z1-C',
    encerrada: false,
    bonusContraAtaqueMeu: false,
    bonusProximaJogadaRival: 0,
    defesaTurno: null,
    defesaRivalTurno: null,
    ultimoCalculo: null,
    ultimaJogada: {
      tipo: 'inicio',
      time: 'meuTime',
      texto: `Apita o árbitro! ${zagueiroInicial.nomeCurto} (${zagueiroInicial.posicao}) inicia com a bola em Z1-C. Toque nele para passar ou conduzir.`,
    },
    historico: [],
    estatisticas: {
      meuTime: { passesCertos: 0, passesTentados: 0, finalizacoes: 0, interceptacoes: 0 },
      rival: { passesCertos: 0, passesTentados: 0, finalizacoes: 0, interceptacoes: 0 },
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
  const ajustesChance = obterAjustesChanceTurno(estado, idAtacante, 'passe', tipo.id);

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
  const ajustesChance = obterAjustesChanceTurno(estado, idAtacante, 'conduzir');

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
 * Prévia de finalização na faixa 5, Z4-C ou faixas 3-4 via Chute de fora.
 */
export function avaliarFinalizacao(estado, { habilidadeId = null } = {}) {
  const idAtacante = estado.timeComBola;
  const idDefensor = obterAdversario(idAtacante);
  const timeAtacante = estado.times[idAtacante];
  const timeDefensor = estado.times[idDefensor];

  const atacante = encontrarJogador(timeAtacante, estado.portadorId);
  if (!atacante) return null;

  let infoHab = null;
  if (habilidadeId) {
    infoHab = avaliarHabilidadeOfensivaPortador(estado, atacante, habilidadeId);
    if (!infoHab || !infoHab.disponivel) return null;
    if (infoHab.habilidade.efeito?.tipo !== 'finalizacao_faixas') return null;
    const faixa = obterFaixa(atacante.zona, idAtacante);
    const permitidas = infoHab.habilidade.efeito.faixasPermitidas || [3, 4];
    if (!permitidas.includes(faixa)) return null;
  } else if (!podeFinalizarNaZona(atacante.zona, idAtacante)) {
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
  });

  if (!calculo) return null;

  return {
    acao: 'finalizar',
    passador: atacante,
    receptor: goleiro,
    zonaOrigem: atacante.zona,
    zonaDestino: obterZonaGolAlvo(idAtacante),
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

  const timeAtacante = estado.times[estado.timeComBola];
  const golAlvo = obterZonaGolAlvo(estado.timeComBola);
  const proprioGol = obterZonaProprioGoleiro(estado.timeComBola);
  const opcoes = [];

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
  if (previa.acao === 'finalizar') {
    return avaliarFinalizacao(estado, { habilidadeId });
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
  estado.ultimaSubstituicaoRival = null;

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
  }

  estado.timeComBola = timeEscolhido;
  estado.zonaBola = zonaEscolhida;
  estado.portadorId = portadorEscolhido;
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
  if (a.acao === 'passe') return a.receptor?.id === b.receptor?.id;
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
      texto: `Marcação mantida. ${defesa.intencaoAtual.passador.nomeCurto} prepara ${defesa.intencaoAtual.calculo.tipo.rotulo.toLowerCase()} (${defesa.intencaoAtual.calculo.chance}%).`,
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
    let textoCartao = 'Sem cartão.';
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
        textoCartao = `Cartão amarelo para ${marcador.nomeCurto} (${chanceAmarelo}%, sorteio ${sorteioCartao}).`;
      }
    } else if (marcador) {
      textoCartao = `${marcador.nomeCurto} escapa do cartão (${chanceAmarelo}%, sorteio ${sorteioCartao}).`;
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

    // Reinicia o turno do rival com bola parada (+10 em passes)
    sincronizarPosicoesTurno(estado, { cobrarDeslocamento: false });
    const novaEscolha = escolherNovaJogadaRival
      ? escolherNovaJogadaRival(estado, rng)
      : listarOpcoesLegais(estado)[0] || defesa.intencaoInicial;

    defesa.intencaoAtual = novaEscolha;
    defesa.trocouJogada = true;
    defesa.fase = 'pronto_execucao';

    const texto = `Falta tática de ${marcador?.nomeCurto || 'marcador'} (−8 est.)! ${textoCartao} Rival reinicia com bola parada (+10% em passes).`;
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
    ? `Chance caiu abaixo de 35% e o rival mudou para ${intencaoFinal.passador.nomeCurto} → ${intencaoFinal.receptor ? intencaoFinal.receptor.nomeCurto : intencaoFinal.zonaDestino} (${intencaoFinal.calculo.chance}%).`
    : `Chance recalculada para ${intencaoFinal.calculo.chance}%.`;

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
 * Executa uma jogada previamente avaliada (`passe`, `conduzir` ou `finalizar`).
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

  // Em finalização do meu time, o goleiro rival pode ativar Voo (25%) antes da resolução
  let previaEfetiva = previa;
  let vooRivalAtivado = null;
  if (idAtacante === 'meuTime' && previa.acao === 'finalizar') {
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

  // Consome bônus de jogada única que já foram aplicados neste cálculo
  if (idAtacante === 'meuTime') {
    estado.bonusContraAtaqueMeu = false;
  } else {
    estado.bonusProximaJogadaRival = 0;
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

  const prefixoHab = habilidadeAtiva ? `[${habilidadeAtiva.nome}] ` : '';
  const sufixoVooRival = vooRivalAtivado
    ? ` (${vooRivalAtivado.jogadorNome} ativou Voo +${vooRivalAtivado.bonusDefesa} def.!)`
    : '';

  let resultado;
  let ativouContraAtaque = false;

  if (acao === 'passe') {
    estado.estatisticas[idAtacante].passesTentados += 1;

    if (sorteio <= chance) {
      estado.estatisticas[idAtacante].passesCertos += 1;
      resultado = {
        tipo: 'acerto',
        acao,
        time: idAtacante,
        sorteio,
        chance,
        desfecho: 'Acerto',
        texto: `${prefixoHab}${passador.nomeCurto} acertou passe ${calculo.tipo.rotulo.toLowerCase()} para ${receptor.nomeCurto} em ${receptor.zona} (${chance}%, sorteio ${sorteio}).`,
      };
      concluirTurno(estado, idAtacante, receptor.zona, receptor.id, rngHabilidade);
    } else if (sorteio <= limiteErroExecucao) {
      const saida = descreverSaidaDeBola(zonaDestino, idAtacante);
      const zonaReinicio = obterZonaReinicioRival(zonaDestino, saida.tipo, idDefensor);
      const cobradorRival =
        saida.tipo === 'tiro-de-meta'
          ? encontrarGoleiro(timeDefensor)
          : encontrarJogadorNaOuPertoDaZona(timeDefensor, zonaReinicio, {
              ignorarGoleiro: true,
            });
      resultado = {
        tipo: saida.tipo,
        acao,
        time: idAtacante,
        sorteio,
        chance,
        desfecho: `Erro de execução (${saida.rotulo})`,
        texto: `${prefixoHab}Erro de execução! Passe de ${passador.nomeCurto} saiu em ${saida.rotulo} na zona ${zonaDestino} (chance ${chance}%, sorteio ${sorteio}). Posse com ${timeDefensor.nome}.`,
      };
      concluirTurno(estado, idDefensor, zonaReinicio, cobradorRival.id, rngHabilidade);
    } else {
      estado.estatisticas[idDefensor].interceptacoes += 1;
      const interceptador = escolherInterceptadorNaZona(timeDefensor, zonaDestino);
      ativouContraAtaque = verificarAtivacaoContraAtaque(
        estadoSnapshotAntes,
        'interceptacao',
        idDefensor,
      );
      if (ativouContraAtaque) estado.bonusContraAtaqueMeu = true;
      resultado = {
        tipo: 'interceptacao',
        acao,
        time: idAtacante,
        sorteio,
        chance,
        desfecho: 'Interceptação',
        texto: `${prefixoHab}${interceptador.nomeCurto} interceptou o passe de ${passador.nomeCurto} em ${zonaDestino} (chance ${chance}%, sorteio ${sorteio})!${ativouContraAtaque ? ' Contra-ataque (+10% na próxima jogada)!' : ''}`,
      };
      concluirTurno(estado, idDefensor, zonaDestino, interceptador.id, rngHabilidade);
    }
  } else if (acao === 'conduzir') {
    if (sorteio <= chance) {
      resultado = {
        tipo: 'conducao',
        acao,
        time: idAtacante,
        sorteio,
        chance,
        desfecho: 'Acerto',
        texto: `${prefixoHab}${passador.nomeCurto} conduziu a bola até ${zonaDestino} (${chance}%, sorteio ${sorteio}).`,
      };
      concluirTurno(estado, idAtacante, zonaDestino, passador.id, rngHabilidade);
    } else if (sorteio <= limiteErroExecucao) {
      const saida = descreverSaidaDeBola(zonaDestino, idAtacante);
      const zonaReinicio = obterZonaReinicioRival(zonaDestino, saida.tipo, idDefensor);
      const cobradorRival =
        saida.tipo === 'tiro-de-meta'
          ? encontrarGoleiro(timeDefensor)
          : encontrarJogadorNaOuPertoDaZona(timeDefensor, zonaReinicio, {
              ignorarGoleiro: true,
            });
      resultado = {
        tipo: saida.tipo,
        acao,
        time: idAtacante,
        sorteio,
        chance,
        desfecho: `Erro de execução (${saida.rotulo})`,
        texto: `${prefixoHab}Erro na condução! ${passador.nomeCurto} adiantou demais e a bola saiu em ${saida.rotulo} (chance ${chance}%, sorteio ${sorteio}). Posse com ${timeDefensor.nome}.`,
      };
      concluirTurno(estado, idDefensor, zonaReinicio, cobradorRival.id, rngHabilidade);
    } else {
      estado.estatisticas[idDefensor].interceptacoes += 1;
      const desarmador = escolherInterceptadorNaZona(timeDefensor, zonaDestino);
      ativouContraAtaque = verificarAtivacaoContraAtaque(
        estadoSnapshotAntes,
        'desarme',
        idDefensor,
      );
      if (ativouContraAtaque) estado.bonusContraAtaqueMeu = true;
      resultado = {
        tipo: 'interceptacao',
        acao,
        time: idAtacante,
        sorteio,
        chance,
        desfecho: 'Desarme',
        texto: `${prefixoHab}${desarmador.nomeCurto} desarmou ${passador.nomeCurto} em ${zonaDestino} (chance ${chance}%, sorteio ${sorteio})!${ativouContraAtaque ? ' Contra-ataque (+10% na próxima jogada)!' : ''}`,
      };
      concluirTurno(estado, idDefensor, zonaDestino, desarmador.id, rngHabilidade);
    }
  } else if (acao === 'finalizar') {
    estado.estatisticas[idAtacante].finalizacoes += 1;
    const goleiroRival = encontrarGoleiro(timeDefensor);

    if (sorteio <= chance) {
      estado.placar[idAtacante] += 1;
      const saidaRival = encontrarJogadorSaida(timeDefensor);
      const zonaSaida = idDefensor === 'rival' ? 'Z5-C' : 'Z1-C';
      resultado = {
        tipo: 'gol',
        acao,
        time: idAtacante,
        sorteio,
        chance,
        desfecho: 'GOL!',
        texto: `${prefixoHab}GOL! ${passador.nomeCurto} finalizou de ${passador.zona} e venceu ${goleiroRival.nomeCurto} (chance ${chance}%, sorteio ${sorteio})!${sufixoVooRival}`,
      };
      concluirTurno(estado, idDefensor, zonaSaida, saidaRival.id, rngHabilidade);
    } else if (sorteio <= limiteErroExecucao) {
      const zonaGoleiro = obterZonaProprioGoleiro(idDefensor);
      resultado = {
        tipo: 'tiro-de-meta',
        acao,
        time: idAtacante,
        sorteio,
        chance,
        desfecho: 'Para fora (tiro de meta)',
        texto: `${prefixoHab}${passador.nomeCurto} finalizou para fora! Tiro de meta para ${goleiroRival.nomeCurto} (${chance}%, sorteio ${sorteio}).${sufixoVooRival}`,
      };
      concluirTurno(estado, idDefensor, zonaGoleiro, goleiroRival.id, rngHabilidade);
    } else {
      const zonaGoleiro = obterZonaProprioGoleiro(idDefensor);
      resultado = {
        tipo: 'defesa',
        acao,
        time: idAtacante,
        sorteio,
        chance,
        desfecho: 'Defesa do goleiro',
        texto: `${prefixoHab}Defendeu ${goleiroRival.nomeCurto}! Chute de ${passador.nomeCurto} parado (${chance}%, sorteio ${sorteio}).${sufixoVooRival}`,
      };
      concluirTurno(estado, idDefensor, zonaGoleiro, goleiroRival.id, rngHabilidade);
    }
  }

  // Se foi usada a ordem "Pressionar o portador" e o rival acertou, próxima jogada dele ganha +10
  if (
    idAtacante === 'rival' &&
    ordemUsadaNoTurnoRival === 'pressionar' &&
    (resultado.tipo === 'acerto' || resultado.tipo === 'conducao' || resultado.tipo === 'gol')
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
    { modificadoresMeta: opcoes.modificadoresMeta || meuTime?.modificadoresMeta || null },
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
