/**
 * Lógica pura de resolução de todos os 9 tipos de nó + Chefão da campanha.
 *
 * Responsável por:
 * - Escalação automática (11 titulares + 7 reservas saudáveis) e validação de escalação manual
 * - Construção do time pronto para `partida(meuTime, rival, opcoes)` aplicando moral
 * - Pós-partida: renda, contratos de patrocínio, lesões (<20 estamina -> 25%), recuperação +10,
 *   limpeza da moral, derrotas seguidas (3 = demissão) e vitória/derrota no chefão
 * - Treino, Descanso Total, Fisioterapia, Patrocínio, Torcida, Mercado, Evento e Misterioso
 */

import {
  jogadorPodeTerHabilidade,
  obterHabilidadesDisponiveis,
} from '../dados/habilidades.js';
import {
  atualizarStatusPosicaoJogador,
  ehPosicaoNatural,
  FORMACAO_PADRAO,
  obterFormacao,
  obterPapeisFormacao,
  POSICOES_PREFERIDAS_PAPEL,
  SETOR_DO_PAPEL,
} from '../dados/formacoes.js';
import { POSTURA_PADRAO } from '../regras/postura.js';
import { modificadoresMeta } from '../meta/meta.js';
import { criarInstanciaHabilidade } from '../regras/habilidades.js';
import { CAMPANHA_CONFIG, TIPOS_NO } from './constantes.js';
import { obterEventosDisponiveis } from './eventos.js';
import {
  ATRIBUTOS_LINHA,
  calcularMediaJogador,
  calcularMediaTitularesInicial,
  calcularValorMercadoJogador,
  criarEstadoCampanhaBase,
  criarRng,
  inteiroAleatorio,
  ROTULOS_ATRIBUTOS,
} from './estado.js';
import { gerarMapaCampanha } from './mapa.js';
import {
  aplicarEvolucaoAtributo,
  aplicarEvolucaoPosPartidaJogador,
  calcularGanhoTreinoAtributo,
  garantirDesenvolvimentoJogador,
} from '../jogador/desenvolvimento.js';
import {
  aplicarDeclinioTemporada,
  aplicarDesenvolvimentoTemporada,
  avaliarAposentadoriaJogador,
  criarRegistroAposentadoria,
  envelhecerJogador,
  normalizarIdade,
  obterFaixaCarreira,
  registrarParticipacaoPartidaCarreira,
} from '../jogador/carreira.js';
import { classificarAtributoQualitativo } from '../ui/apresentacao.js';

export function obterModsCampanha(estado) {
  return estado?.modificadoresMeta || modificadoresMeta();
}

const NOMES_MERCADO_P = Object.freeze([
  'Breno', 'Cauã', 'Diego', 'Enzo', 'Fabrício', 'Gerson', 'Hugo', 'Ícaro',
  'Jonas', 'Kevin', 'Leandro', 'Mateus', 'Nathan', 'Orlando', 'Pedro', 'Rodrigo',
  'Sandro', 'Túlio', 'Vitor', 'William',
]);

const NOMES_MERCADO_S = Object.freeze([
  'Siqueira', 'Monteiro', 'Peixoto', 'Santana', 'Borges', 'Coutinho', 'Assis', 'Paiva',
  'Cavalcanti', 'Bittencourt', 'Macedo', 'Freitas', 'Teixeira', 'Nogueira', 'Lopes', 'Ferraz',
]);

/**
 * Pontua um jogador saudável do elenco para preencher determinado papel da formação.
 */
function pontuarJogadorParaPapel(jogador, papel) {
  if (!jogador || jogador.lesionado) return -1e9;
  if (papel === 'GOL' && !jogador.ehGoleiro) return -1e6;
  if (papel !== 'GOL' && jogador.ehGoleiro) return -1e6;

  const est = typeof jogador.extras?.estamina === 'number' ? jogador.extras.estamina : 100;
  const media = calcularMediaJogador(jogador);
  const preferidas = POSICOES_PREFERIDAS_PAPEL[papel] || [];
  let bonusPos = 0;
  if (ehPosicaoNatural(jogador, papel)) {
    bonusPos = preferidas[0] === jogador.posicao ? 55 : 46;
  } else if (preferidas.includes(jogador.posicao)) {
    bonusPos = 24;
  } else if (jogador.setor === SETOR_DO_PAPEL[papel]) {
    bonusPos = 12;
  }

  const pesoEstamina = est * 0.25;
  return bonusPos + media + pesoEstamina;
}

/**
 * Seleciona automaticamente os 11 melhores jogadores disponíveis (não lesionados)
 * respeitando as posições da formação informada, mais até 7 reservas saudáveis.
 */
export function prepararEscalacaoPadrao(elenco, idFormacao = FORMACAO_PADRAO) {
  const saudaveis = (elenco || []).filter((j) => !j.lesionado);
  const papeis = obterPapeisFormacao(idFormacao);
  const usados = new Set();
  const titularesPorPapel = {};

  for (const papel of papeis) {
    const candidatos = saudaveis
      .filter((j) => !usados.has(j.id))
      .sort((a, b) => pontuarJogadorParaPapel(b, papel) - pontuarJogadorParaPapel(a, papel));
    if (candidatos.length > 0) {
      titularesPorPapel[papel] = candidatos[0].id;
      usados.add(candidatos[0].id);
    } else {
      titularesPorPapel[papel] = null;
    }
  }

  const reservasIds = saudaveis
    .filter((j) => !usados.has(j.id))
    .slice(0, 7)
    .map((j) => j.id);

  return {
    titularesPorPapel,
    reservasIds,
  };
}

/**
 * Valida a escalação para entrar em campo na formação informada.
 */
export function validarEscalacao(
  elenco,
  titularesPorPapel,
  reservasIds = [],
  idFormacao = FORMACAO_PADRAO,
) {
  const mapaElenco = new Map((elenco || []).map((j) => [j.id, j]));
  const papeis = obterPapeisFormacao(idFormacao);
  const idsTitulares = [];
  const vistos = new Set();

  for (const papel of papeis) {
    const id = titularesPorPapel?.[papel];
    const jogador = mapaElenco.get(id);
    if (!jogador) {
      return { valido: false, motivo: `Falta escalar um jogador para ${papel}.` };
    }
    if (jogador.lesionado) {
      return { valido: false, motivo: `${jogador.nomeCurto} está lesionado e não pode jogar.` };
    }
    if (papel === 'GOL' && !jogador.ehGoleiro) {
      return { valido: false, motivo: 'A vaga de GOL exige um goleiro.' };
    }
    if (papel !== 'GOL' && jogador.ehGoleiro) {
      return { valido: false, motivo: `${jogador.nomeCurto} (GOL) não pode atuar na linha.` };
    }
    if (vistos.has(id)) {
      return { valido: false, motivo: `${jogador.nomeCurto} foi escalado em duas vagas.` };
    }
    vistos.add(id);
    idsTitulares.push(id);
  }

  const reservasValidas = [];
  for (const rId of reservasIds) {
    const r = mapaElenco.get(rId);
    if (!r || r.lesionado || vistos.has(rId)) continue;
    vistos.add(rId);
    reservasValidas.push(rId);
    if (reservasValidas.length >= 7) break;
  }

  return {
    valido: true,
    idsTitulares,
    reservasValidas,
  };
}

/**
 * Monta o objeto `meuTime` pronto para `partida(meuTime, rival, opcoes)` aplicando
 * formação, postura, status de posição natural e moral em todos os atributos.
 */
export function montarTimeParaPartida(
  estado,
  titularesPorPapel,
  reservasIds,
  { formacao = FORMACAO_PADRAO, postura = POSTURA_PADRAO } = {},
) {
  const formacaoObj = obterFormacao(formacao);
  const mapaElenco = new Map(estado.elenco.map((j) => [j.id, j]));
  const mods = obterModsCampanha(estado);
  const moral = estado.moral || 0;
  const bonusAtributos = moral + (mods.bonusAtributosPartida || 0);

  const prepararJogador = (base, papel, ehReserva) => {
    const clone = garantirDesenvolvimentoJogador(structuredClone(base));
    clone.papel = papel;
    clone.ehReserva = ehReserva;
    clone.iniciaComBola = papel === 'ZAG1';
    if (ehReserva) {
      clone.foraDePosicao = false;
      clone.familiaridadeAtual = null;
    } else {
      atualizarStatusPosicaoJogador(clone);
    }
    clone.zona = ehReserva ? null : clone.ehGoleiro ? 'GK' : 'Z1-C';
    clone.zonaBase = ehReserva ? null : clone.ehGoleiro ? 'GK' : 'Z1-C';
    clone.extras = {
      estamina: typeof clone.extras?.estamina === 'number' ? clone.extras.estamina : 100,
      habilidades: (clone.extras?.habilidades || [])
        .map((h) =>
          criarInstanciaHabilidade(typeof h === 'string' ? h : h.id),
        )
        .filter(Boolean),
      cartoes: { amarelos: 0, vermelho: false },
      substituido: false,
    };

    if (bonusAtributos !== 0) {
      for (const attr of Object.keys(clone.atributos)) {
        if (attr === 'agressividade') continue;
        clone.atributos[attr] = Math.max(1, Math.min(100, clone.atributos[attr] + bonusAtributos));
      }
      if (clone.mental && typeof clone.atributos.concentracao === 'number') {
        clone.mental.concentracao = clone.atributos.concentracao;
      }
    }
    return clone;
  };

  const jogadores = formacaoObj.papeis.map((papel) =>
    prepararJogador(mapaElenco.get(titularesPorPapel[papel]), papel, false),
  );

  const reservas = (reservasIds || [])
    .map((id) => mapaElenco.get(id))
    .filter((j) => j && !j.lesionado)
    .slice(0, 7)
    .map((j) => prepararJogador(j, j.papel || j.posicao, true));

  return {
    id: 'meuTime',
    nome: mods.clubeNome || estado.clubeNome || 'Atlético Brisa',
    sigla: mods.clubeSigla || estado.clubeSigla || 'BRI',
    formacao: formacaoObj.id,
    postura,
    corPrincipal: mods.uniforme?.corPrincipal || '#163a76',
    corBorda: mods.uniforme?.corBorda || '#93c5fd',
    corDetalhe: mods.uniforme?.corDetalhe || '#f5b82e',
    corTexto: mods.uniforme?.corTexto || '#ffffff',
    modificadoresMeta: mods,
    jogadores,
    reservas,
    substituidos: [],
  };
}

/**
 * Aplica recuperação de +10 de estamina + bônus de Equipamentos/Fisiologista ao passar por um nó.
 */
export function aplicarRecuperacaoEntreNos(estado) {
  const mods = obterModsCampanha(estado);
  const ganho =
    CAMPANHA_CONFIG.recuperacaoEstaminaEntreNos + (mods.bonusRecuperacaoPorNoTotal || 0);
  for (const j of estado.elenco) {
    const atual = typeof j.extras?.estamina === 'number' ? j.extras.estamina : 100;
    j.extras.estamina = Math.min(100, atual + ganho);
  }
  return ganho;
}

function registrarVisitaNo(estado, no, detalheHistorico, { recuperarEntreNos = true } = {}) {
  estado.noAtualId = no.id;
  estado.camadaAtual = no.camada;
  if (!estado.nosVisitados.includes(no.id)) {
    estado.nosVisitados.push(no.id);
  }
  estado.noPendente = null;
  if (recuperarEntreNos) {
    aplicarRecuperacaoEntreNos(estado);
  }
  estado.historico.unshift({
    camada: no.camada,
    noId: no.id,
    tipo: no.tipo,
    ...detalheHistorico,
  });
}

/**
 * Aplica o desfecho completo de uma partida da campanha:
 * 1) Grava estamina final e marca lesionados (já sorteados em `partida()` antes da recuperação)
 * 2) Paga renda por resultado + contratos de patrocínio ativos
 * 3) Atualiza sequência de derrotas (empate zera) e limpa moral de 1 jogo
 * 4) Verifica vitória no Chefão ou derrota (3 seguidas ou derrota no Chefão)
 * 5) Aplica recuperação +10 entre nós se a campanha seguir (ou sempre ao fim do nó)
 */
export function aplicarPosPartidaCampanha(
  estado,
  resultadoPartida,
  no,
  { rngDesempateChefao = Math.random, rngEvolucao = Math.random } = {},
) {
  const mods = obterModsCampanha(estado);
  const ehChefao = no.tipo === TIPOS_NO.CHEFAO;
  let resultadoFinal = resultadoPartida.resultado;
  let notaDesempate = '';

  // Se o Chefão terminar empatado no tempo regulamentar, disputa pênaltis para decisão imediata
  if (ehChefao && resultadoFinal === 'empate') {
    const venceuPenaltis = rngDesempateChefao() < 0.52;
    resultadoFinal = venceuPenaltis ? 'vitoria' : 'derrota';
    notaDesempate = venceuPenaltis
      ? ' Empate no tempo normal; vitória nos pênaltis!'
      : ' Empate no tempo normal; derrota nos pênaltis.';
  }

  // 1. Atualiza estamina e lesões (antes da recuperação entre nós) — idade NUNCA avança por partida
  const estaminaFinal = resultadoPartida.estaminaFinal || {};
  const lesionadosSet = new Set(resultadoPartida.lesionados || []);
  const nomesLesionados = [];

  for (const j of estado.elenco) {
    if (typeof estaminaFinal[j.id] === 'number') {
      j.extras.estamina = Math.max(0, Math.min(100, estaminaFinal[j.id]));
    }
    if (lesionadosSet.has(j.id)) {
      j.lesionado = true;
      nomesLesionados.push(j.nomeCurto);
    }
  }

  // 1b. Estatísticas de carreira, experiência e evolução orgânica pós-partida (orientada pela carreira)
  const participantesSet = new Set(resultadoPartida.participantesIds || []);
  const golsPorJogador = resultadoPartida.golsPorJogador || {};
  const assistenciasPorJogador = resultadoPartida.assistenciasPorJogador || {};
  const partidaRelevante = ehChefao || (no?.camada || 1) >= 9;
  const conquistouTitulo = ehChefao && resultadoFinal === 'vitoria';

  const jovensEvoluidos = [];
  const evoluidosCarreira = [];

  for (const j of estado.elenco) {
    if (!participantesSet.has(j.id)) continue;
    garantirDesenvolvimentoJogador(j);

    registrarParticipacaoPartidaCarreira(j, {
      gols: golsPorJogador[j.id] || 0,
      assistencias: assistenciasPorJogador[j.id] || 0,
      relevante: partidaRelevante,
      titulo: conquistouTitulo,
    });

    // Jovens da base com melhoria de Categorias de Base mantêm evolução ativa pós-jogo (respeitando potencial)
    if (j.ehJovem && mods.jovemEvolucaoPorPartida > 0) {
      let resEv = null;
      for (let passo = 0; passo < mods.jovemEvolucaoPorPartida; passo += 1) {
        resEv = aplicarEvolucaoPosPartidaJogador(j, rngEvolucao);
      }
      if (resEv && resEv.delta > 0) {
        const registro = {
          jogadorId: j.id,
          nome: j.nomeCurto,
          atributo: resEv.atributo,
          rotuloAtributo: ROTULOS_ATRIBUTOS[resEv.atributo] || resEv.atributo,
          ganho: resEv.delta,
        };
        jovensEvoluidos.push(registro);
        evoluidosCarreira.push(registro);
      }
    } else {
      // Evolução orgânica desacoplada da flag ehJovem: qualquer jogador abaixo do potencial
      // pode ganhar +1 pontual conforme faixa de carreira e experiência acumulada
      const faixa = obterFaixaCarreira(j.idade);
      const chanceOrganica =
        faixa.id === 'formacao'
          ? 0.2
          : faixa.id === 'jovem'
            ? 0.16
            : faixa.id === 'desenvolvimento'
              ? 0.09
              : faixa.id === 'auge'
                ? 0.03
                : 0;
      if (chanceOrganica > 0 && rngEvolucao() < chanceOrganica) {
        const resEv = aplicarEvolucaoPosPartidaJogador(j, rngEvolucao);
        if (resEv && resEv.delta > 0) {
          evoluidosCarreira.push({
            jogadorId: j.id,
            nome: j.nomeCurto,
            atributo: resEv.atributo,
            rotuloAtributo: ROTULOS_ATRIBUTOS[resEv.atributo] || resEv.atributo,
            ganho: resEv.delta,
          });
        }
      }
    }
  }

  // 2. Recuperação entre nós (+10 base + Equipamentos + Fisiologista) após registro das lesões
  aplicarRecuperacaoEntreNos(estado);

  // 3. Renda da partida + patrocínios ativos (com Torcida) + bilheteria do Estádio
  const fatorReceita = mods.fatorReceita ?? 1;
  const rendaBaseBruta = CAMPANHA_CONFIG.rendaPartida[resultadoFinal] ?? 0;
  const rendaBase = Math.round(rendaBaseBruta * fatorReceita);

  let rendaPatrocinioBruta = 0;
  const contratosRestantes = [];

  for (const contrato of estado.contratosPatrocinio || []) {
    if (contrato.partidasRestantes > 0) {
      rendaPatrocinioBruta += contrato.valorPorPartida;
      const restante = contrato.partidasRestantes - 1;
      if (restante > 0) {
        contratosRestantes.push({ ...contrato, partidasRestantes: restante });
      }
    }
  }
  estado.contratosPatrocinio = contratosRestantes;
  const rendaPatrocinio = Math.round(rendaPatrocinioBruta * fatorReceita);
  const bilheteria = mods.bilheteriaPorPartida || 0;
  const rendaTotal = rendaBase + rendaPatrocinio + bilheteria;
  estado.dinheiro += rendaTotal;

  // 4. Estatísticas e moral de uso único
  estado.partidasDisputadas += 1;
  if (resultadoFinal === 'vitoria') {
    estado.vitorias += 1;
    estado.derrotasSeguidas = 0;
  } else if (resultadoFinal === 'empate') {
    estado.empates += 1;
    estado.derrotasSeguidas = 0;
  } else {
    estado.derrotas += 1;
    estado.derrotasSeguidas += 1;
  }

  const moralUsada = estado.moral || 0;
  estado.moral = 0;

  // 5. Atualiza nó atual e histórico
  estado.noAtualId = no.id;
  estado.camadaAtual = no.camada;
  if (!estado.nosVisitados.includes(no.id)) {
    estado.nosVisitados.push(no.id);
  }
  estado.noPendente = null;

  const placarStr = `${resultadoPartida.placar.meuTime} × ${resultadoPartida.placar.rival}`;
  const nomeRival = resultadoPartida.rivalNome || 'Adversário';
  const extrasRenda = [];
  if (rendaPatrocinio > 0) extrasRenda.push(`$${rendaPatrocinio} patrocínio`);
  if (bilheteria > 0) extrasRenda.push(`$${bilheteria} estádio`);

  const notaJovens =
    jovensEvoluidos.length > 0
      ? ` Base: ${jovensEvoluidos.map((e) => `${e.nome} +${e.ganho} ${e.rotuloAtributo}`).join(', ')}.`
      : '';

  const resumo =
    `${resultadoFinal === 'vitoria' ? 'Vitória' : resultadoFinal === 'empate' ? 'Empate' : 'Derrota'} ` +
    `(${placarStr} vs ${nomeRival}).${notaDesempate} ` +
    `Renda +$${rendaTotal}${extrasRenda.length > 0 ? ` (incl. ${extrasRenda.join(', ')})` : ''}.` +
    (nomesLesionados.length > 0 ? ` Lesões: ${nomesLesionados.join(', ')}.` : '') +
    notaJovens;

  estado.historico.unshift({
    camada: no.camada,
    noId: no.id,
    tipo: no.tipo,
    resultado: resultadoFinal,
    placar: resultadoPartida.placar,
    rivalNome: nomeRival,
    renda: rendaTotal,
    bilheteria,
    lesionados: nomesLesionados,
    jovensEvoluidos,
    moralUsada,
    resumo,
  });

  // 6. Condições de vitória/derrota da campanha
  const nomeClube = mods.clubeNome || estado.clubeNome || 'Atlético Brisa';
  if (ehChefao) {
    if (resultadoFinal === 'vitoria') {
      estado.status = 'vitoria';
      estado.motivoFim = `Campeão! O ${nomeClube} venceu ${nomeRival} por ${placarStr} na grande final.${notaDesempate}`;
    } else {
      estado.status = 'derrota';
      estado.motivoFim = `A diretoria demitiu o técnico após a derrota para ${nomeRival} na grande final (${placarStr}).${notaDesempate}`;
    }
  } else if (estado.derrotasSeguidas >= CAMPANHA_CONFIG.derrotasSeguidasLimite) {
    estado.status = 'derrota';
    estado.motivoFim = `A diretoria demitiu o técnico após ${CAMPANHA_CONFIG.derrotasSeguidasLimite} derrotas seguidas.`;
  }

  return {
    resultadoFinal,
    rendaBase,
    rendaPatrocinio,
    bilheteria,
    rendaTotal,
    nomesLesionados,
    jovensEvoluidos,
    evoluidosCarreira,
    resumo,
    statusCampanha: estado.status,
  };
}

/**
 * Gera 3 opções determinísticas de treino para um jogador específico:
 * combina evolução de atributos com retorno decrescente (respeitando potencial e teto)
 * e habilidades compatíveis (incluindo pacotes desbloqueados).
 */
export function gerarOpcoesTreinoParaJogador(estado, no, jogadorId) {
  const jogador = estado.elenco.find((j) => j.id === jogadorId);
  if (!jogador) return [];
  garantirDesenvolvimentoJogador(jogador);

  const mods = obterModsCampanha(estado);
  const habsPool = obterHabilidadesDisponiveis(mods.pacotesDesbloqueados);

  const rng = criarRng(`${estado.seed}::treino::${no.id}::${jogador.id}`);
  const opcoes = [];

  const habsAtuais = (jogador.extras?.habilidades || []).map((h) =>
    typeof h === 'string' ? h : h.id,
  );
  const podeAprenderHab = habsAtuais.length < 2;
  const habsElegiveis = podeAprenderHab
    ? habsPool.filter(
        (h) => !habsAtuais.includes(h.id) && jogadorPodeTerHabilidade(jogador, h),
      )
    : [];

  // Garante 1 opção de aprender habilidade se houver elegível (< 2)
  if (habsElegiveis.length > 0) {
    const escolhida = habsElegiveis[Math.floor(rng() * habsElegiveis.length)];
    opcoes.push({
      id: `hab:${escolhida.id}`,
      tipo: 'habilidade',
      habilidadeId: escolhida.id,
      titulo: `Aprender: ${escolhida.nome}`,
      descricao: escolhida.descricao,
    });
  }

  const attrsPool = jogador.ehGoleiro
    ? ['defesa', 'posicionamento', 'passe', 'dominio', 'concentracao']
    : [...ATRIBUTOS_LINHA, 'concentracao'];

  const embaralhados = [...attrsPool];
  for (let i = embaralhados.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [embaralhados[i], embaralhados[j]] = [embaralhados[j], embaralhados[i]];
  }

  // Prioriza atributos que ainda possuem margem real de evolução abaixo do teto
  embaralhados.sort((a, b) => {
    const ga = calcularGanhoTreinoAtributo(jogador, a).ganho;
    const gb = calcularGanhoTreinoAtributo(jogador, b).ganho;
    return (gb > 0 ? 1 : 0) - (ga > 0 ? 1 : 0);
  });

  const montarOpcaoAtributo = (attr) => {
    const prev = calcularGanhoTreinoAtributo(jogador, attr);
    const nomeAttr = ROTULOS_ATRIBUTOS[attr] || attr;
    const faixaAntes = classificarAtributoQualitativo(prev.valorAntes).rotulo;
    const faixaDepois = classificarAtributoQualitativo(prev.valorDepois).rotulo;

    let notaRitmo = 'Boa resposta esperada ao treino';
    if (prev.ganho <= 0) {
      notaRitmo = 'Próximo do limite natural — manutenção de forma';
    } else if (prev.ganho >= 4) {
      notaRitmo = 'Salto expressivo esperado';
    } else if (prev.ganho === 1) {
      notaRitmo = 'Lapidação fina perto do teto';
    }

    const mudancaNivel =
      faixaAntes !== faixaDepois
        ? `${faixaAntes} → ${faixaDepois}`
        : `Nível atual: ${faixaAntes}`;

    return {
      id: `attr:${attr}`,
      tipo: 'atributo',
      atributo: attr,
      bonus: prev.ganho,
      estagio: prev.estagio,
      titulo: `Treinar ${nomeAttr}`,
      descricao: `${mudancaNivel} · ${notaRitmo}`,
    };
  };

  for (const attr of embaralhados) {
    if (opcoes.length >= CAMPANHA_CONFIG.opcoesTreinoSorteadas) break;
    opcoes.push(montarOpcaoAtributo(attr));
  }

  return opcoes;
}

export function aplicarTreino(estado, no, jogadorId, opcaoId) {
  const jogador = estado.elenco.find((j) => j.id === jogadorId);
  if (!jogador) return { valido: false, motivo: 'Jogador não encontrado.' };
  garantirDesenvolvimentoJogador(jogador);

  const opcoes = gerarOpcoesTreinoParaJogador(estado, no, jogadorId);
  const opcao = opcoes.find((o) => o.id === opcaoId);
  if (!opcao) return { valido: false, motivo: 'Opção de treino inválida.' };

  let resumo = '';
  if (opcao.tipo === 'habilidade') {
    const habs = jogador.extras?.habilidades || [];
    if (habs.length >= 2) {
      return { valido: false, motivo: `${jogador.nomeCurto} já possui 2 habilidades.` };
    }
    const inst = criarInstanciaHabilidade(opcao.habilidadeId);
    if (!inst) return { valido: false, motivo: 'Habilidade inválida.' };
    jogador.extras.habilidades.push(inst);
    resumo = `${jogador.nomeCurto} aprendeu a habilidade ${opcao.titulo.replace('Aprender: ', '')}!`;
  } else {
    const prev = calcularGanhoTreinoAtributo(jogador, opcao.atributo);
    const nomeAttr = ROTULOS_ATRIBUTOS[opcao.atributo] || opcao.atributo;
    if (prev.ganho <= 0) {
      resumo = `${jogador.nomeCurto} manteve a forma em ${nomeAttr}, já muito perto do seu limite natural.`;
    } else {
      const ev = aplicarEvolucaoAtributo(jogador, opcao.atributo, prev.ganho, 'treino');
      const faixaAntes = classificarAtributoQualitativo(ev.antes).rotulo;
      const faixaDepois = classificarAtributoQualitativo(ev.depois).rotulo;
      const salto =
        faixaAntes !== faixaDepois
          ? ` (subiu para ${faixaDepois})`
          : prev.ganho >= 3
            ? ' (evolução nítida)'
            : ' (lapidação técnica)';
      resumo = `${jogador.nomeCurto} evoluiu em ${nomeAttr}${salto}.`;
    }
  }

  registrarVisitaNo(estado, no, { resumo });
  return { valido: true, resumo };
}

export function aplicarDescansoTotal(estado, no) {
  for (const j of estado.elenco) {
    if (!j.extras) j.extras = {};
    j.extras.estamina = 100;
  }
  const resumo = 'Descanso total concluído: todo o elenco voltou para 100% de estamina.';
  registrarVisitaNo(estado, no, { resumo }, { recuperarEntreNos: false });
  return { valido: true, resumo };
}

export function aplicarFisioterapia(estado, no) {
  const curados = [];
  for (const j of estado.elenco) {
    if (j.lesionado) {
      j.lesionado = false;
      curados.push(j.nomeCurto);
    }
  }
  const resumo =
    curados.length > 0
      ? `Fisioterapia concluída! Alta médica para: ${curados.join(', ')}.`
      : 'Fisioterapia concluída! Nenhum atleta estava lesionado, e o grupo recuperou +10 de estamina.';
  registrarVisitaNo(estado, no, { resumo });
  return { valido: true, curados, resumo };
}

export function aplicarTorcida(estado, no) {
  estado.moral += CAMPANHA_CONFIG.moralTorcida;
  const resumo = `Recepção calorosa da torcida! Moral +${CAMPANHA_CONFIG.moralTorcida} em todos os atributos na próxima partida.`;
  registrarVisitaNo(estado, no, { resumo });
  return { valido: true, moral: estado.moral, resumo };
}

export function gerarOfertasPatrocinio(estado, no) {
  const mods = obterModsCampanha(estado);
  const fatorReceita = mods.fatorReceita ?? 1;
  const rng = criarRng(`${estado.seed}::patrocinio::${no.id}`);
  const valorImediatoBase =
    Math.round(
      inteiroAleatorio(
        CAMPANHA_CONFIG.patrocinioImediatoMin,
        CAMPANHA_CONFIG.patrocinioImediatoMax,
        rng,
      ) / 10,
    ) * 10;

  let valorPorPartida =
    Math.round(
      inteiroAleatorio(
        CAMPANHA_CONFIG.patrocinioPorPartidaMin,
        CAMPANHA_CONFIG.patrocinioPorPartidaMax,
        rng,
      ) / 5,
    ) * 5;

  const partidas = CAMPANHA_CONFIG.patrocinioPartidasDuracao;
  while (valorPorPartida * partidas <= valorImediatoBase + 20) {
    valorPorPartida += 5;
  }

  const valorImediato = Math.round(valorImediatoBase * fatorReceita);
  const valorPorPartidaEfetivo = Math.round(valorPorPartida * fatorReceita);

  return [
    {
      id: 'imediato',
      nome: 'Cota Máster à Vista',
      tipo: 'imediato',
      valorImediato,
      descricao: `Receba $${valorImediato} imediatamente no caixa do clube${fatorReceita > 1 ? ' (inclui bônus Torcida)' : ''}.`,
    },
    {
      id: 'parcelado',
      nome: 'Contrato por Produtividade (4 jogos)',
      tipo: 'parcelado',
      valorPorPartida,
      valorPorPartidaEfetivo,
      partidas,
      totalPossivel: valorPorPartidaEfetivo * partidas,
      descricao: `Receba $${valorPorPartidaEfetivo} ao final de cada uma das próximas ${partidas} partidas (total $${valorPorPartidaEfetivo * partidas}).`,
    },
  ];
}

export function escolherPatrocinio(estado, no, ofertaId) {
  const ofertas = gerarOfertasPatrocinio(estado, no);
  const oferta = ofertas.find((o) => o.id === ofertaId);
  if (!oferta) return { valido: false, motivo: 'Oferta inválida.' };

  let resumo = '';
  if (oferta.tipo === 'imediato') {
    estado.dinheiro += oferta.valorImediato;
    resumo = `Patrocínio assinado: +$${oferta.valorImediato} imediatos no caixa!`;
  } else {
    estado.contratosPatrocinio.push({
      id: `${no.id}_pat`,
      nome: oferta.nome,
      valorPorPartida: oferta.valorPorPartida,
      partidasRestantes: oferta.partidas,
    });
    resumo = `Contrato assinado: +$${oferta.valorPorPartidaEfetivo} por partida pelos próximos ${oferta.partidas} jogos.`;
  }

  registrarVisitaNo(estado, no, { resumo });
  return { valido: true, resumo };
}

function sortearNomeMercadoDisponivel(rng, nomesProibidos) {
  for (let tentativa = 0; tentativa < 60; tentativa += 1) {
    const nomeP = NOMES_MERCADO_P[Math.floor(rng() * NOMES_MERCADO_P.length)];
    const nomeS = NOMES_MERCADO_S[Math.floor(rng() * NOMES_MERCADO_S.length)];
    const completo = `${nomeP} ${nomeS}`;
    if (!nomesProibidos.has(completo)) {
      nomesProibidos.add(completo);
      return { nome: completo, nomeCurto: nomeP };
    }
  }
  const fallbackP = NOMES_MERCADO_P[Math.floor(rng() * NOMES_MERCADO_P.length)];
  const sufixo = inteiroAleatorio(10, 99, rng);
  const completo = `${fallbackP} Junior ${sufixo}`;
  nomesProibidos.add(completo);
  return { nome: completo, nomeCurto: fallbackP };
}

/**
 * Gera 4 jogadores estratégicos no Mercado com perfis etários coerentes:
 * - Promessa (16–21): atributos atuais menores, potencial alto, preço impulsionado pelo teto
 * - Jogador Pronto (22–29): atributos fortes, potencial próximo do atual
 * - Veterano (30–35): bons atributos atuais, potencial limitado, mais barato que equivalente jovem
 * - Veterano de Experiência (32+): físico menor, mental/técnico/tático elevado, acessível e útil
 * (ou Destaque raro em camadas avançadas) + N jovens da Base (16–19).
 * Nunca regenera jogadores aposentados.
 */
export function gerarOfertasMercado(estado, no) {
  const mods = obterModsCampanha(estado);
  const habsPool = obterHabilidadesDisponiveis(mods.pacotesDesbloqueados);
  const fatorPreco = mods.fatorPrecoMercado ?? 1;
  const qtdJovens = mods.jovensNoMercado || 0;
  const camada = no?.camada || 1;
  const temporada = estado.temporada || 1;

  const rng = criarRng(`${estado.seed}::t${temporada}::mercado::${no.id}`);
  const nomesProibidos = new Set([
    ...(estado.elenco || []).map((j) => j.nome),
    ...(estado.aposentadosNomes || []),
    ...(estado.historicoAposentados || []).map((a) => a.nome),
  ]);
  const aposentadosIdsSet = new Set([
    ...(estado.aposentadosIds || []),
    ...(estado.historicoAposentados || []).map((a) => a.id),
  ]);

  const modelosPos = [
    { posicao: 'GOL', papel: 'GOL', setor: 'GOL', ehGoleiro: true },
    { posicao: 'ZAG', papel: 'ZAG2', setor: 'DEF', ehGoleiro: false },
    { posicao: 'LE', papel: 'LAT_E', setor: 'DEF', ehGoleiro: false },
    { posicao: 'LD', papel: 'LAT_D', setor: 'DEF', ehGoleiro: false },
    { posicao: 'VOL', papel: 'VOL', setor: 'MEI', ehGoleiro: false },
    { posicao: 'ME', papel: 'MEI_E', setor: 'MEI', ehGoleiro: false },
    { posicao: 'PE', papel: 'PONTA_E', setor: 'ATA', ehGoleiro: false },
    { posicao: 'CA', papel: 'CA', setor: 'ATA', ehGoleiro: false },
  ];

  // Escolhe 4 posições variadas
  const poolPos = [...modelosPos];
  const escolhidos = [];
  for (let i = 0; i < CAMPANHA_CONFIG.mercadoQuantidadeJogadores; i += 1) {
    const idx = Math.floor(rng() * poolPos.length);
    escolhidos.push(poolPos.splice(idx, 1)[0]);
  }

  const montarAtributosComIdentidade = (
    spec,
    nivelAlvo,
    { especialista = false, perfilVeteranoExperiencia = false } = {},
  ) => {
    const spread = especialista ? 9 : 6;
    const attr = (bias = 0) =>
      Math.max(18, Math.min(94, Math.round(nivelAlvo + bias + inteiroAleatorio(-spread, spread, rng))));

    if (spec.ehGoleiro) {
      return {
        passe: attr(perfilVeteranoExperiencia ? -2 : -10),
        dominio: attr(perfilVeteranoExperiencia ? -2 : -10),
        posicionamento: attr(perfilVeteranoExperiencia ? 10 : especialista ? 8 : 3),
        marcacao: attr(-20),
        interceptacao: attr(-4),
        desarme: attr(-20),
        velocidade: attr(perfilVeteranoExperiencia ? -20 : -14),
        tecnica: attr(-10),
        dibre: attr(-22),
        finalizacao: attr(-26),
        agressividade: inteiroAleatorio(18, 34, rng),
        concentracao: attr(perfilVeteranoExperiencia ? 12 : especialista ? 7 : 2),
        defesa: attr(especialista ? 9 : 5),
      };
    }

    const ehZAG = spec.posicao === 'ZAG';
    const ehLAT = spec.posicao === 'LE' || spec.posicao === 'LD';
    const ehVOL = spec.posicao === 'VOL';
    const ehMEI = spec.posicao === 'ME' || spec.posicao === 'MD';
    const ehPONTA = spec.posicao === 'PE' || spec.posicao === 'PD';
    const ehCA = spec.posicao === 'CA';

    const ajusteVelVet = perfilVeteranoExperiencia ? -13 : 0;
    const ajusteMentalVet = perfilVeteranoExperiencia ? 11 : 0;
    const ajusteTaticoVet = perfilVeteranoExperiencia ? 8 : 0;

    return {
      passe: attr(
        (ehMEI ? (especialista ? 11 : 7) : ehVOL ? 4 : ehZAG ? -9 : ehCA ? -10 : 0) +
          (perfilVeteranoExperiencia ? 6 : 0),
      ),
      dominio: attr(
        (ehMEI || ehCA || ehPONTA ? 5 : ehZAG ? -9 : 0) + (perfilVeteranoExperiencia ? 5 : 0),
      ),
      posicionamento: attr((ehZAG || ehVOL || ehCA ? 5 : 0) + ajusteTaticoVet),
      marcacao: attr(
        ehZAG ? (especialista ? 11 : 7) : ehVOL ? 6 : ehLAT ? 1 : ehCA || ehPONTA ? -20 : -11,
      ),
      interceptacao: attr(
        (ehVOL ? (especialista ? 11 : 7) : ehZAG ? 5 : ehCA || ehPONTA ? -18 : -8) +
          (perfilVeteranoExperiencia ? 5 : 0),
      ),
      desarme: attr(
        ehZAG ? (especialista ? 11 : 7) : ehVOL ? 6 : ehLAT ? 1 : ehCA || ehPONTA ? -20 : -11,
      ),
      velocidade: attr(
        (ehPONTA ? (especialista ? 12 : 8) : ehLAT ? 7 : ehZAG ? -10 : ehVOL ? -6 : 0) +
          ajusteVelVet,
      ),
      tecnica: attr(
        (ehMEI ? (especialista ? 10 : 7) : ehPONTA ? 6 : ehZAG ? -12 : 0) +
          (perfilVeteranoExperiencia ? 6 : 0),
      ),
      dibre: attr(
        (ehPONTA ? (especialista ? 12 : 8) : ehMEI ? 6 : ehLAT ? 2 : ehZAG ? -18 : -2) +
          (perfilVeteranoExperiencia ? -4 : 0),
      ),
      finalizacao: attr(ehCA ? (especialista ? 12 : 8) : ehPONTA ? 5 : ehMEI ? 0 : ehZAG ? -22 : -12),
      agressividade: inteiroAleatorio(26, 74, rng),
      concentracao: attr((ehZAG || ehVOL ? 4 : ehPONTA ? -4 : 0) + ajusteMentalVet),
    };
  };

  // 4 arquétipos distintos alinhados ao ciclo de carreira
  const bonusCamada = Math.min(6, Math.floor(camada / 2));
  const arquetipos = [
    {
      id: 'promessa',
      rotulo: 'Promessa',
      nivelMin: 40,
      nivelMax: 47,
      idadeMin: 16,
      idadeMax: 21,
      potBonusMin: 20,
      potBonusMax: 34,
      especialista: true,
      perfilVeteranoExperiencia: false,
      chanceHab: 0.35,
    },
    {
      id: 'jogador_pronto',
      rotulo: 'Jogador pronto',
      nivelMin: 53 + bonusCamada,
      nivelMax: 61 + bonusCamada,
      idadeMin: 22,
      idadeMax: 29,
      potBonusMin: 2,
      potBonusMax: 8,
      especialista: true,
      perfilVeteranoExperiencia: false,
      chanceHab: 0.72,
    },
    {
      id: 'veterano',
      rotulo: 'Veterano',
      nivelMin: 51 + Math.min(5, bonusCamada),
      nivelMax: 59 + Math.min(5, bonusCamada),
      idadeMin: 30,
      idadeMax: 35,
      potBonusMin: 0,
      potBonusMax: 3,
      especialista: false,
      perfilVeteranoExperiencia: false,
      chanceHab: 0.65,
    },
    camada >= 6 && rng() < 0.3
      ? {
          id: 'craque_raro',
          rotulo: 'Destaque raro',
          nivelMin: 66,
          nivelMax: 76,
          idadeMin: 23,
          idadeMax: 28,
          potBonusMin: 4,
          potBonusMax: 12,
          especialista: true,
          perfilVeteranoExperiencia: false,
          chanceHab: 0.95,
        }
      : {
          id: 'veterano_experiencia',
          rotulo: 'Veterano de experiência',
          nivelMin: 48 + Math.min(4, bonusCamada),
          nivelMax: 55 + Math.min(4, bonusCamada),
          idadeMin: 32,
          idadeMax: 36,
          potBonusMin: 0,
          potBonusMax: 2,
          especialista: false,
          perfilVeteranoExperiencia: true,
          chanceHab: 0.78,
        },
  ];

  const ofertasRegulares = escolhidos.map((spec, idx) => {
    const arq = arquetipos[idx % arquetipos.length];
    const nivelAlvo = inteiroAleatorio(arq.nivelMin, arq.nivelMax, rng);
    const idade = normalizarIdade(inteiroAleatorio(arq.idadeMin, arq.idadeMax, rng), 24);
    const { nome, nomeCurto } = sortearNomeMercadoDisponivel(rng, nomesProibidos);

    const atributos = montarAtributosComIdentidade(spec, nivelAlvo, {
      especialista: arq.especialista,
      perfilVeteranoExperiencia: arq.perfilVeteranoExperiencia,
    });
    const peRoll = rng();
    const peDominante =
      spec.posicao === 'LE'
        ? 'esquerdo'
        : spec.posicao === 'LD'
          ? 'direito'
          : peRoll < 0.1
            ? 'ambidestro'
            : peRoll < 0.36
              ? 'esquerdo'
              : 'direito';

    let idCandidato = `mer_t${temporada}_${no.id}_${idx}`;
    while (aposentadosIdsSet.has(idCandidato)) {
      idCandidato = `${idCandidato}_n`;
    }

    const jogador = {
      id: idCandidato,
      nome,
      nomeCurto,
      posicao: spec.posicao,
      papel: spec.papel,
      setor: spec.setor,
      ehGoleiro: spec.ehGoleiro,
      ehJovem: false,
      ehMercado: true,
      nivelObservacao: 1,
      arquetipoMercado: arq.rotulo,
      arquetipoMercadoId: arq.id,
      idade,
      peDominante,
      qualidadePeFraco: peDominante === 'ambidestro' ? 5 : inteiroAleatorio(1, 4, rng),
      lesionado: false,
      iniciaComBola: false,
      zona: null,
      zonaBase: null,
      atributos,
      mental: { concentracao: atributos.concentracao },
      extras: {
        estamina: 100,
        habilidades: [],
        cartoes: { amarelos: 0, vermelho: false },
        substituido: false,
      },
    };

    const notaAtual = Math.round(calcularMediaJogador(jogador));
    jogador.potencial = Math.min(
      94,
      Math.max(notaAtual, notaAtual + inteiroAleatorio(arq.potBonusMin, arq.potBonusMax, rng)),
    );
    const curvas = ['precoce', 'equilibrada', 'tardia'];
    jogador.curvaDesenvolvimento = curvas[Math.floor(rng() * curvas.length)];
    if (arq.perfilVeteranoExperiencia) {
      jogador.experiencia = inteiroAleatorio(78, 94, rng);
    }
    garantirDesenvolvimentoJogador(jogador);

    const compativeis = habsPool.filter((h) => jogadorPodeTerHabilidade(jogador, h));
    if (compativeis.length > 0 && rng() < arq.chanceHab) {
      const hab = compativeis[Math.floor(rng() * compativeis.length)];
      jogador.extras.habilidades.push(criarInstanciaHabilidade(hab.id));
    }

    const precoBase = calcularValorMercadoJogador(jogador);
    const preco = Math.max(40, Math.round(precoBase * fatorPreco));
    return {
      indice: idx,
      ehJovem: false,
      arquetipo: arq.rotulo,
      arquetipoId: arq.id,
      jogador,
      precoBase,
      preco,
      media: Math.round(calcularMediaJogador(jogador)),
    };
  });

  // Jovens promissores das Categorias de Base (16–19 anos, baratos, alto potencial, integrados ao ciclo de carreira)
  const ofertasJovens = [];
  const poolJovemPos = modelosPos.filter((m) => !m.ehGoleiro);
  for (let k = 0; k < qtdJovens; k += 1) {
    const spec =
      k === qtdJovens - 1 && qtdJovens >= 4
        ? modelosPos[0]
        : poolJovemPos[Math.floor(rng() * poolJovemPos.length)];
    const { nome, nomeCurto } = sortearNomeMercadoDisponivel(rng, nomesProibidos);
    const baseJovem = inteiroAleatorio(39, 47, rng);
    const atributos = montarAtributosComIdentidade(spec, baseJovem, { especialista: true });

    const peRoll = rng();
    const peDominante =
      spec.posicao === 'LE'
        ? 'esquerdo'
        : spec.posicao === 'LD'
          ? 'direito'
          : peRoll < 0.08
            ? 'ambidestro'
            : peRoll < 0.34
              ? 'esquerdo'
              : 'direito';

    const jogador = {
      id: `jovem_t${temporada}_${no.id}_${k}`,
      nome,
      nomeCurto,
      posicao: spec.posicao,
      papel: spec.papel,
      setor: spec.setor,
      ehGoleiro: spec.ehGoleiro,
      ehJovem: true,
      ehMercado: true,
      nivelObservacao: 1,
      arquetipoMercado: 'Joia da Base',
      arquetipoMercadoId: 'base',
      idade: normalizarIdade(inteiroAleatorio(16, 19, rng), 18),
      peDominante,
      qualidadePeFraco: peDominante === 'ambidestro' ? 5 : inteiroAleatorio(1, 3, rng),
      potencial: inteiroAleatorio(66, 84, rng),
      curvaDesenvolvimento: rng() < 0.5 ? 'precoce' : 'equilibrada',
      lesionado: false,
      iniciaComBola: false,
      zona: null,
      zonaBase: null,
      atributos,
      mental: { concentracao: atributos.concentracao },
      extras: {
        estamina: 100,
        habilidades: [],
        cartoes: { amarelos: 0, vermelho: false },
        substituido: false,
      },
    };
    garantirDesenvolvimentoJogador(jogador);

    const indice = ofertasRegulares.length + k;
    const precoBase = inteiroAleatorio(45, 70, rng);
    const preco = Math.max(30, Math.round(precoBase * fatorPreco));
    ofertasJovens.push({
      indice,
      ehJovem: true,
      arquetipo: 'Joia da Base',
      arquetipoId: 'base',
      jogador,
      precoBase,
      preco,
      media: Math.round(calcularMediaJogador(jogador)),
    });
  }

  return [...ofertasRegulares, ...ofertasJovens];
}

export function comprarJogadorMercado(estado, no, ofertaMercado, ofertasAtuais) {
  if (!ofertaMercado || ofertaMercado.comprado) {
    return { valido: false, motivo: 'Jogador indisponível.' };
  }
  if (estado.elenco.length >= CAMPANHA_CONFIG.maxElenco) {
    return {
      valido: false,
      motivo: `Elenco cheio (${estado.elenco.length}/${CAMPANHA_CONFIG.maxElenco}). Venda um jogador antes de contratar.`,
    };
  }
  if (estado.dinheiro < ofertaMercado.preco) {
    return { valido: false, motivo: 'Dinheiro insuficiente para esta contratação.' };
  }

  estado.dinheiro -= ofertaMercado.preco;
  const idadeContratado = normalizarIdade(ofertaMercado.jogador?.idade, 24);
  const contratado = structuredClone(ofertaMercado.jogador);
  contratado.id = `cmp_${no.id}_${Date.now().toString(36).slice(-4)}_${ofertaMercado.indice}`;
  // Jogador contratado durante a temporada mantém exatamente sua idade atual
  contratado.idade = idadeContratado;
  contratado.ehMercado = false;
  contratado.nivelObservacao = 2;
  contratado.temporadaContratacao = estado.temporada || 1;
  contratado.partidasNaTemporada = 0;
  garantirDesenvolvimentoJogador(contratado);

  estado.elenco.push(contratado);
  ofertaMercado.comprado = true;

  if (ofertasAtuais) {
    ofertasAtuais[ofertaMercado.indice] = ofertaMercado;
  }

  return {
    valido: true,
    jogador: contratado,
    resumo: `${contratado.nome} (${contratado.posicao}, ${contratado.idade} anos) contratado por $${ofertaMercado.preco}.`,
  };
}

export function calcularValorVendaElenco(estado, jogador) {
  const mods = obterModsCampanha(estado);
  const valorMercado = jogador?.ehJovem
    ? Math.max(60, calcularValorMercadoJogador(jogador))
    : calcularValorMercadoJogador(jogador);
  const fatorVenda =
    CAMPANHA_CONFIG.mercadoFatorVenda * (1 + (mods.bonusVendaMercadoPct || 0));
  return Math.round(valorMercado * fatorVenda);
}

export function venderJogadorElenco(estado, jogadorId) {
  if (estado.elenco.length <= CAMPANHA_CONFIG.minElenco) {
    return {
      valido: false,
      motivo: `Mínimo de ${CAMPANHA_CONFIG.minElenco} jogadores no elenco necessário para entrar em campo.`,
    };
  }
  const idx = estado.elenco.findIndex((j) => j.id === jogadorId);
  if (idx === -1) return { valido: false, motivo: 'Jogador não encontrado.' };

  const jogador = estado.elenco[idx];
  if (jogador.ehGoleiro) {
    const outrosGoleiros = estado.elenco.filter((j) => j.ehGoleiro && j.id !== jogador.id);
    if (outrosGoleiros.length === 0) {
      return { valido: false, motivo: 'Você precisa manter pelo menos 1 goleiro no elenco.' };
    }
  }

  const mods = obterModsCampanha(estado);
  const valorVenda = calcularValorVendaElenco(estado, jogador);

  estado.elenco.splice(idx, 1);
  estado.dinheiro += valorVenda;

  const pct = Math.round(50 * (1 + (mods.bonusVendaMercadoPct || 0)));
  return {
    valido: true,
    valorVenda,
    jogador,
    resumo: `${jogador.nome} negociado por $${valorVenda} (${pct}% do valor de mercado).`,
  };
}

export function sairDoMercado(estado, no, resumo = 'Mercado encerrado.') {
  registrarVisitaNo(estado, no, { resumo });
  return { valido: true, resumo };
}

export function sortearEventoCampanha(estado, no) {
  const mods = obterModsCampanha(estado);
  const pool = obterEventosDisponiveis(mods.pacotesDesbloqueados);
  const rng = criarRng(`${estado.seed}::evento::${no.id}`);
  const idx = Math.floor(rng() * pool.length);
  return pool[idx];
}

export function aplicarEscolhaEvento(estado, no, evento, escolhaId) {
  const escolha = evento?.escolhas?.find((e) => e.id === escolhaId);
  if (!escolha) return { valido: false, motivo: 'Escolha inválida.' };

  const rng = criarRng(`${estado.seed}::evento_exec::${no.id}::${escolhaId}`);
  const res = escolha.aplicar(estado, rng);
  if (!res?.valido) return res;

  registrarVisitaNo(estado, no, { resumo: `${evento.titulo}: ${res.resumo}` });
  return { valido: true, resumo: res.resumo };
}

/**
 * Sorteia o resultado do nó Misterioso (?) entre:
 * 'evento', 'partida' (média), 'dinheiro' (+100) ou 'descanso'.
 */
export function sortearResultadoMisterioso(estado, no) {
  const mods = obterModsCampanha(estado);
  const rng = criarRng(`${estado.seed}::misterioso::${no.id}`);
  const opcoes = CAMPANHA_CONFIG.opcoesMisterioso;
  const desfecho = opcoes[Math.floor(rng() * opcoes.length)];

  if (desfecho === 'dinheiro') {
    return {
      tipo: 'dinheiro',
      titulo: 'Patrocinador Relâmpago!',
      descricao: `Uma ação local rendeu +$${CAMPANHA_CONFIG.misteriosoBonusDinheiro} inesperados para o clube.`,
    };
  }
  if (desfecho === 'descanso') {
    return {
      tipo: 'descanso',
      titulo: 'Pousada Tranquila',
      descricao: 'O elenco encontrou um refúgio silencioso e descansou completamente (100% estamina).',
    };
  }
  if (desfecho === 'partida') {
    const forcaMedia = Math.round((estado.mediaInicialTitulares + 6 + (mods.bonusForcaRival || 0)) * 10) / 10;
    return {
      tipo: 'partida',
      forcaPersonalizada: forcaMedia,
      titulo: 'Desafio Surpresa!',
      descricao: `Um adversário de força média desafiou o ${mods.clubeNome || 'Atlético Brisa'} para uma partida extra.`,
    };
  }
  const evento = sortearEventoCampanha(estado, no);
  return {
    tipo: 'evento',
    evento,
    titulo: evento.titulo,
    descricao: evento.descricao,
  };
}

export function concluirMisteriosoDireto(estado, no, desfechoMisterioso) {
  if (desfechoMisterioso.tipo === 'dinheiro') {
    estado.dinheiro += CAMPANHA_CONFIG.misteriosoBonusDinheiro;
    const resumo = `Nó misterioso: +$${CAMPANHA_CONFIG.misteriosoBonusDinheiro} no caixa do clube.`;
    registrarVisitaNo(estado, no, { resumo });
    return { valido: true, resumo };
  }
  if (desfechoMisterioso.tipo === 'descanso') {
    for (const j of estado.elenco) {
      j.extras.estamina = 100;
    }
    const resumo = 'Nó misterioso virou descanso total: todo o elenco com 100% de estamina!';
    registrarVisitaNo(estado, no, { resumo }, { recuperarEntreNos: false });
    return { valido: true, resumo };
  }
  return { valido: false, motivo: 'Este resultado misterioso exige interação própria.' };
}

/**
 * Promove um jovem da base (16–18 anos) como reposição de emergência caso aposentadorias
 * deixem o clube abaixo do mínimo de jogadores ou sem goleiro.
 */
function criarReposicaoBaseEmergencia(estado, { ehGoleiro = false, indice = 0, rng }) {
  const nomesProibidos = new Set([
    ...(estado.elenco || []).map((j) => j.nome),
    ...(estado.aposentadosNomes || []),
    ...(estado.historicoAposentados || []).map((a) => a.nome),
  ]);
  const { nome, nomeCurto } = sortearNomeMercadoDisponivel(rng, nomesProibidos);
  const spec = ehGoleiro
    ? { posicao: 'GOL', papel: 'GOL', setor: 'GOL', ehGoleiro: true }
    : { posicao: 'ME', papel: 'MEI_E', setor: 'MEI', ehGoleiro: false };
  const base = inteiroAleatorio(39, 45, rng);
  const s = (b = 0) => Math.max(20, Math.min(72, Math.round(base + b + inteiroAleatorio(-4, 4, rng))));

  const atributos = ehGoleiro
    ? {
        passe: s(-8),
        dominio: s(-8),
        posicionamento: s(3),
        marcacao: s(-18),
        interceptacao: s(-6),
        desarme: s(-18),
        velocidade: s(-12),
        tecnica: s(-10),
        dibre: s(-20),
        finalizacao: s(-24),
        agressividade: inteiroAleatorio(20, 34, rng),
        concentracao: s(2),
        defesa: s(5),
      }
    : {
        passe: s(5),
        dominio: s(4),
        posicionamento: s(2),
        marcacao: s(-6),
        interceptacao: s(-2),
        desarme: s(-6),
        velocidade: s(4),
        tecnica: s(5),
        dibre: s(4),
        finalizacao: s(-2),
        agressividade: inteiroAleatorio(30, 58, rng),
        concentracao: s(1),
      };

  const jovem = {
    id: `base_t${estado.temporada || 1}_${indice}`,
    nome,
    nomeCurto,
    posicao: spec.posicao,
    papel: spec.papel,
    setor: spec.setor,
    ehGoleiro: spec.ehGoleiro,
    ehJovem: true,
    idade: normalizarIdade(inteiroAleatorio(16, 18, rng), 17),
    potencial: inteiroAleatorio(62, 78, rng),
    lesionado: false,
    iniciaComBola: false,
    zona: null,
    zonaBase: null,
    atributos,
    mental: { concentracao: atributos.concentracao },
    extras: {
      estamina: 100,
      habilidades: [],
      cartoes: { amarelos: 0, vermelho: false },
      substituido: false,
    },
  };
  return garantirDesenvolvimentoJogador(jovem);
}

/**
 * Orquestrador central da passagem de temporada (`avancarTemporada()`).
 *
 * Protegido contra execução duplicada na mesma virada (via `temporadaEsperada` ou `chaveTransicao`):
 * 1) Incrementa `estado.temporada` (+1)
 * 2) Envelhece todos os jogadores ativos (+1 ano)
 * 3) Aplica desenvolvimento sazonal direcionado (respeitando potencial como teto)
 * 4) Aplica declínio gradual individualizado (físicos primeiro; mentais/técnicos resistentes)
 * 5) Avalia aposentadorias → remove do elenco ativo, grava registro completo no histórico
 *    e exclui futuros retornos no mercado (garantindo mínimo de elenco / 1 goleiro)
 * 6) Atualiza histórico da campanha e prepara mercado/mapa para a nova temporada
 */
export function avancarTemporada(
  estado,
  {
    rng = null,
    temporadaEsperada = null,
    chaveTransicao = null,
    prepararNovoMapa = true,
  } = {},
) {
  if (!estado || !Array.isArray(estado.elenco)) {
    return { avancou: false, motivo: 'Estado de campanha inválido.' };
  }

  const temporadaAtual = typeof estado.temporada === 'number' && estado.temporada >= 1
    ? estado.temporada
    : 1;
  estado.temporada = temporadaAtual;

  // Proteção explícita contra execução duplicada na mesma virada de temporada
  if (typeof temporadaEsperada === 'number' && temporadaAtual !== temporadaEsperada) {
    return {
      avancou: false,
      jaExecutada: true,
      temporadaAtual,
      motivo: `Temporada ${temporadaEsperada} já foi avançada.`,
    };
  }
  if (chaveTransicao && estado.ultimaChaveTransicaoTemporada === chaveTransicao) {
    return {
      avancou: false,
      jaExecutada: true,
      temporadaAtual,
      motivo: 'Transição de temporada já executada.',
    };
  }

  const rngEfetivo =
    typeof rng === 'function'
      ? rng
      : criarRng(`${estado.seed}::avancar_temporada::t${temporadaAtual}`);

  const novaTemporada = temporadaAtual + 1;
  estado.temporada = novaTemporada;
  estado.ultimaTemporadaAvancada = temporadaAtual;
  if (chaveTransicao) {
    estado.ultimaChaveTransicaoTemporada = chaveTransicao;
  }

  if (!Array.isArray(estado.historicoAposentados)) estado.historicoAposentados = [];
  if (!Array.isArray(estado.aposentadosIds)) estado.aposentadosIds = [];
  if (!Array.isArray(estado.aposentadosNomes)) estado.aposentadosNomes = [];

  const envelhecidos = [];
  const desenvolvidos = [];
  const declinios = [];
  const aposentados = [];
  const promovidosBase = [];
  const elencoRestante = [];

  const nomeClube = estado.clubeNome || 'Atlético Brisa';

  for (const jogador of estado.elenco) {
    garantirDesenvolvimentoJogador(jogador);

    // 1. Envelhecer +1 ano
    const env = envelhecerJogador(jogador, 1);
    envelhecidos.push({
      id: jogador.id,
      nome: jogador.nomeCurto || jogador.nome,
      idadeAntes: env.idadeAntes,
      idadeDepois: env.idadeDepois,
      faixa: env.faixaCarreira.id,
    });

    // 2. Desenvolvimento sazonal
    const dev = aplicarDesenvolvimentoTemporada(jogador, rngEfetivo);
    jogador.partidasNaTemporada = 0;
    if (dev.evoluiu && dev.alteracoes.length > 0) {
      desenvolvidos.push({
        id: jogador.id,
        nome: jogador.nomeCurto || jogador.nome,
        alteracoes: dev.alteracoes,
      });
    }

    // 3. Declínio gradual individualizado
    const dec = aplicarDeclinioTemporada(jogador, rngEfetivo);
    if (dec.declinou && dec.alteracoes.length > 0) {
      declinios.push({
        id: jogador.id,
        nome: jogador.nomeCurto || jogador.nome,
        alteracoes: dec.alteracoes,
      });
    }

    // 4. Avaliação de aposentadoria
    const avApos = avaliarAposentadoriaJogador(jogador, rngEfetivo);
    if (avApos.aposentou) {
      jogador.aposentado = true;
      const registro = criarRegistroAposentadoria(jogador, {
        clube: nomeClube,
        temporada: temporadaAtual,
      });
      estado.historicoAposentados.push(registro);
      if (!estado.aposentadosIds.includes(jogador.id)) {
        estado.aposentadosIds.push(jogador.id);
      }
      if (!estado.aposentadosNomes.includes(jogador.nome)) {
        estado.aposentadosNomes.push(jogador.nome);
      }
      aposentados.push(registro);
      continue;
    }

    // Recuperação de pré-temporada para quem segue ativo
    jogador.lesionado = false;
    if (!jogador.extras) jogador.extras = {};
    jogador.extras.estamina = 100;
    elencoRestante.push(jogador);
  }

  estado.elenco = elencoRestante;

  // Garante mínimo de 1 goleiro e mínimo de 11 jogadores no elenco para evitar soft-lock
  let idxRep = 0;
  if (!estado.elenco.some((j) => j.ehGoleiro)) {
    const golBase = criarReposicaoBaseEmergencia(estado, {
      ehGoleiro: true,
      indice: idxRep,
      rng: rngEfetivo,
    });
    idxRep += 1;
    estado.elenco.push(golBase);
    promovidosBase.push(golBase);
  }
  while (estado.elenco.length < CAMPANHA_CONFIG.minElenco) {
    const rep = criarReposicaoBaseEmergencia(estado, {
      ehGoleiro: false,
      indice: idxRep,
      rng: rngEfetivo,
    });
    idxRep += 1;
    estado.elenco.push(rep);
    promovidosBase.push(rep);
  }

  // 5. Preparar estado de mercado e pré-temporada
  estado.mercadoTemporada = novaTemporada;
  estado.mediaInicialTitulares = calcularMediaTitularesInicial(estado.elenco);

  const partesResumo = [
    `Início da Temporada ${novaTemporada}: elenco envelheceu +1 ano.`,
  ];
  if (desenvolvidos.length > 0) {
    partesResumo.push(`${desenvolvidos.length} atleta(s) evoluíram.`);
  }
  if (declinios.length > 0) {
    partesResumo.push(`${declinios.length} veterano(s) sentiram desgaste físico.`);
  }
  if (aposentados.length > 0) {
    partesResumo.push(
      `Aposentadoria(s): ${aposentados.map((a) => `${a.nome} (${a.idadeAposentadoria}a)`).join(', ')}.`,
    );
  }
  const resumo = partesResumo.join(' ');

  estado.resumoUltimaTemporada = {
    temporadaAnterior: temporadaAtual,
    temporadaNova: novaTemporada,
    envelhecidos,
    desenvolvidos,
    declinios,
    aposentados,
    promovidosBase: promovidosBase.map((j) => ({ id: j.id, nome: j.nome, posicao: j.posicao })),
    resumo,
  };

  estado.historico.unshift({
    camada: 0,
    noId: `temporada_${novaTemporada}`,
    tipo: 'temporada',
    resumo,
  });

  // 6. Regenerar mapa e reabrir jornada caso solicitado para continuar a carreira
  if (prepararNovoMapa) {
    const mods = obterModsCampanha(estado);
    const bonusDificuldade = mods.bonusForcaRival || 0;
    estado.mapa = gerarMapaCampanha(
      `${estado.seed}::T${novaTemporada}`,
      estado.mediaInicialTitulares,
      bonusDificuldade,
    );
    estado.noAtualId = null;
    estado.camadaAtual = 0;
    estado.nosVisitados = [];
    estado.noPendente = null;
    estado.derrotasSeguidas = 0;
    estado.moral = 0;
    estado.status = 'em_andamento';
    estado.motivoFim = '';
    estado.metaFinalizada = false;
  }

  return {
    avancou: true,
    jaExecutada: false,
    temporadaAnterior: temporadaAtual,
    temporadaNova: novaTemporada,
    envelhecidos,
    desenvolvidos,
    declinios,
    aposentados,
    promovidosBase,
    resumo,
  };
}

/**
 * Helper de alto nível para criar uma nova campanha já com o mapa gerado e modificadoresMeta aplicados.
 */
export function iniciarNovaCampanha(seed = null, metaEstado = null, opcoesMeta = {}) {
  const mods = modificadoresMeta(metaEstado, opcoesMeta);
  return criarEstadoCampanhaBase({
    seed,
    geradorMapa: gerarMapaCampanha,
    modificadores: mods,
  });
}
