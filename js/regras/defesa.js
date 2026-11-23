/**
 * Módulo de defesa por turnos (ordens táticas baseadas em gasto de estamina,
 * recálculo do rival, falta tática com cartões amarelo/vermelho e contra-ataque).
 */

import {
  obterFaseParaTime,
  simularDeslocamentoBloco,
} from '../dados/formacoes.js';
import {
  ehZonaLinhaDeFundo,
  ehZonaTercoFinal,
  obterFaixa,
} from '../dados/zonas.js';
import {
  calcularEficienciaNaZona,
  calcularForcaNaLinha,
  calcularForcaNoPortador,
  CRUZAMENTO_CONFIG,
  DEFESA_CONFIG,
  DIBRE_CONFIG,
  FINALIZACAO_CONFIG,
  limitar,
} from './calculo.js';
import {
  CUSTOS_ORDEM_DEFENSIVA,
  obterAtributoEfetivo,
  obterEstamina,
} from './estamina.js';
import {
  calcularCustoEstaminaComHabilidades,
  coletarModificadoresPassivosTime,
  listarHabilidadesDefensivasTime,
} from './habilidades.js';
import {
  obterAjustesChancePostura,
  obterBonusContraAtaquePostura,
  obterMultiplicadorPressaoLinhaPostura,
  POSTURA_PADRAO,
} from './postura.js';

export const ORDENS_DEFENSIVAS = Object.freeze({
  pressionar: {
    id: 'pressionar',
    nome: 'Pressionar o portador',
    resumo: 'Pressão no portador ×1,5 na bola; time sobe 1 faixa (rival +10 se acertar).',
  },
  fechar_linha: {
    id: 'fechar_linha',
    nome: 'Fechar linha de passe',
    resumo: 'Pressão na linha ×1,5 no destino anunciado e ×0,8 nas demais zonas.',
  },
  recuar: {
    id: 'recuar',
    nome: 'Recuar o bloco',
    resumo: 'Time desce 1 faixa; frente e longo rival −10, trás e lateral +5.',
  },
  falta_tatica: {
    id: 'falta_tatica',
    nome: 'Falta tática',
    resumo: 'Interrompe a jogada e rival reinicia com bola parada (+10% em passes).',
  },
  nenhuma: {
    id: 'nenhuma',
    nome: 'Manter marcação (sem ordem)',
    resumo: 'Deixar o rival executar a jogada anunciada sem gastar estamina.',
  },
});

/**
 * Ordena os jogadores de linha ativos do meu time pela maior eficiência na zona-alvo.
 */
function listarDefensoresPorEficiencia(estado, zonaAlvo, modoForca = 'portador') {
  const ativos = estado.times.meuTime.jogadores.filter(
    (j) => !j.ehGoleiro && !j.extras?.cartoes?.vermelho,
  );
  const { bonusAtributosLinha } = coletarModificadoresPassivosTime(
    estado.times.meuTime.jogadores,
  );

  return ativos
    .map((jogador) => {
      const eficiencia = calcularEficienciaNaZona(
        jogador,
        zonaAlvo,
        bonusAtributosLinha,
      );
      const forca =
        modoForca === 'linha'
          ? calcularForcaNaLinha(jogador)
          : calcularForcaNoPortador(jogador);
      return { jogador, eficiencia, forca };
    })
    .sort((a, b) => {
      if (Math.abs(b.eficiencia - a.eficiencia) > 1e-6) {
        return b.eficiencia - a.eficiencia;
      }
      if (Math.abs(b.forca - a.forca) > 1e-6) {
        return b.forca - a.forca;
      }
      return obterEstamina(b.jogador) - obterEstamina(a.jogador);
    });
}

/**
 * Seleciona quem vai gastar estamina na ordem defensiva escolhida.
 * Se algum dos jogadores de maior eficiência não tiver estamina suficiente,
 * avança para o próximo de maior eficiência; se não houver suficientes, marca indisponível.
 */
export function avaliarCustoOrdemDefensiva(estado, tipoOrdem, contextoDefesa = null) {
  const defesa = contextoDefesa || estado.defesaTurno;
  const zonaBola = defesa?.zonaBolaAnunciada || estado.zonaBola;
  const zonaDestino = defesa?.zonaDestinoAnunciada || zonaBola;

  if (tipoOrdem === 'nenhuma') {
    return {
      disponivel: true,
      envolvidos: [],
      custoTotal: 0,
      resumoCusto: '0 est.',
      rotuloEnvolvidos: 'Sem gasto de estamina.',
    };
  }

  const reducaoMeta = estado?.modificadoresMeta?.reducaoCustoEstamina || 0;

  if (tipoOrdem === 'recuar') {
    const posturaMeu = estado?.posturas?.meuTime || POSTURA_PADRAO;
    const movimentos = simularDeslocamentoBloco(
      estado.times.meuTime,
      'meuTime',
      estado.zonaBola,
      estado.times.meuTime.formacao,
      -1,
      reducaoMeta,
      posturaMeu,
    );
    const comSaldo = movimentos.filter((m) => m.estaminaAtual >= m.custo);
    const custoTotal = movimentos.reduce(
      (acc, m) => acc + Math.min(m.custo, m.estaminaAtual),
      0,
    );

    if (movimentos.length === 0 || comSaldo.length === 0) {
      return {
        disponivel: false,
        envolvidos: [],
        custoTotal: 0,
        resumoCusto: 'Indisponível',
        rotuloEnvolvidos:
          movimentos.length === 0
            ? 'Bloco já está recuado na defesa.'
            : 'Jogadores sem estamina para recuar.',
      };
    }

    const envolvidos = movimentos.map((m) => ({
      jogador: m.jogador,
      custo: m.custo,
      estaminaAntes: m.estaminaAtual,
      estaminaDepois: Math.max(0, m.estaminaAtual - m.custo),
    }));

    return {
      disponivel: true,
      envolvidos,
      custoTotal,
      resumoCusto: `Desloc. (−${custoTotal} est.)`,
      rotuloEnvolvidos: `Gasta (1/faixa): ${envolvidos.length} jogadores (${envolvidos
        .slice(0, 3)
        .map((e) => e.jogador.nomeCurto)
        .join(', ')}${envolvidos.length > 3 ? ` +${envolvidos.length - 3}` : ''}).`,
    };
  }

  if (typeof tipoOrdem === 'string' && tipoOrdem.startsWith('hab:')) {
    const lista = listarHabilidadesDefensivasTime(
      estado,
      'meuTime',
      defesa?.intencaoAtual,
    );
    const item = lista.find((h) => h.chaveOrdem === tipoOrdem);
    if (!item) {
      return {
        disponivel: false,
        envolvidos: [],
        custoTotal: 0,
        resumoCusto: '—',
        rotuloEnvolvidos: 'Habilidade defensiva não encontrada.',
      };
    }

    const envolvidos = item.disponivel
      ? [
          {
            jogador: item.jogador,
            custo: item.custo,
            custoBruto: item.custoBase,
            estaminaAntes: item.estaminaAtual,
            estaminaDepois: item.estaminaDepois,
            habilidadesCusto: item.habilidadesCusto,
          },
        ]
      : [];

    return {
      disponivel: item.disponivel,
      envolvidos,
      custoTotal: item.custo,
      resumoCusto: `−${item.custo} est. · ${item.usosRestantes}/${item.usosTotais} uso`,
      rotuloEnvolvidos: item.disponivel
        ? `${item.jogador.nomeCurto} (${item.estaminaAtual}→${item.estaminaDepois})`
        : item.motivoIndisponivel,
      habilidadeDefensiva: item,
    };
  }

  const regra = CUSTOS_ORDEM_DEFENSIVA[tipoOrdem];
  if (!regra) {
    return {
      disponivel: false,
      envolvidos: [],
      custoTotal: 0,
      resumoCusto: '—',
      rotuloEnvolvidos: 'Ordem inválida.',
    };
  }

  const zonaAlvo = tipoOrdem === 'fechar_linha' ? zonaDestino : zonaBola;
  const modoForca = tipoOrdem === 'fechar_linha' ? 'linha' : 'portador';
  const ordenados = listarDefensoresPorEficiencia(estado, zonaAlvo, modoForca);

  const candidatosComCusto = ordenados.map((item) => {
    const resCusto = calcularCustoEstaminaComHabilidades(
      item.jogador,
      regra.custoPorJogador,
      reducaoMeta,
    );
    return {
      ...item,
      custoJogador: resCusto.custoFinal,
      habilidadesCusto: resCusto.habilidades,
    };
  });

  const aptos = candidatosComCusto.filter(
    (item) => obterEstamina(item.jogador) >= item.custoJogador,
  );

  if (aptos.length < regra.quantidade) {
    return {
      disponivel: false,
      envolvidos: [],
      custoTotal: 0,
      resumoCusto:
        regra.quantidade > 1
          ? `−${regra.custoPorJogador} × ${regra.quantidade}`
          : `−${regra.custoPorJogador} est.`,
      rotuloEnvolvidos: `Indisponível: precisa de ${regra.quantidade} jogador(es) com ≥ ${regra.custoPorJogador} de estamina.`,
    };
  }

  const selecionados = aptos.slice(0, regra.quantidade).map((item) => {
    const estAntes = obterEstamina(item.jogador);
    return {
      jogador: item.jogador,
      eficiencia: Math.round(item.eficiencia * 100),
      custo: item.custoJogador,
      custoBruto: regra.custoPorJogador,
      habilidadesCusto: item.habilidadesCusto,
      estaminaAntes: estAntes,
      estaminaDepois: estAntes - item.custoJogador,
    };
  });

  const custoTotal = selecionados.reduce((acc, e) => acc + e.custo, 0);
  const temReducao = selecionados.some((e) => e.custo !== regra.custoPorJogador);
  const resumoCusto = temReducao
    ? `−${custoTotal} est. total`
    : regra.quantidade > 1
      ? `−${regra.custoPorJogador} est. × ${regra.quantidade}`
      : `−${regra.custoPorJogador} est.`;

  const listaNomes = selecionados
    .map((e) => `${e.jogador.nomeCurto} (${e.estaminaAntes}→${e.estaminaDepois})`)
    .join(', ');

  return {
    disponivel: true,
    envolvidos: selecionados,
    custoTotal,
    resumoCusto,
    rotuloEnvolvidos: `Gasta: ${listaNomes}`,
  };
}

/**
 * Seleciona o marcador do meu time mais eficiente na zona da bola para cometer a falta tática.
 */
export function escolherMarcadorFalta(estado, zonaAlvo = estado.zonaBola) {
  const plano = avaliarCustoOrdemDefensiva(estado, 'falta_tatica', {
    zonaBolaAnunciada: zonaAlvo,
  });
  if (plano.disponivel && plano.envolvidos[0]) {
    return plano.envolvidos[0].jogador;
  }
  const ordenados = listarDefensoresPorEficiencia(estado, zonaAlvo, 'portador');
  return ordenados[0]?.jogador || null;
}

/**
 * Calcula a porcentagem (0..100) de chance de cartão amarelo para o marcador da falta tática,
 * considerando a agressividade ajustada pela fadiga.
 */
export function calcularChanceCartaoAmarelo(marcador) {
  if (!marcador) return 0;
  const agr = obterAtributoEfetivo(marcador, 'agressividade') || 50;
  return limitar(Math.round(agr / DEFESA_CONFIG.divisorAgressividadeAmarelo), 1, 100);
}

/**
 * Constrói o mapa de modificadores de pressão para o time defensor neste turno.
 */
export function obterModificadoresPressaoTurno(estado, timeDefensorId) {
  const posturaDefensor = estado?.posturas?.[timeDefensorId] || POSTURA_PADRAO;
  const multLinhaPostura = obterMultiplicadorPressaoLinhaPostura(posturaDefensor);
  const extraLinha =
    multLinhaPostura !== 1 ? { multiplicadorLinhaGeral: multLinhaPostura } : {};

  const timeAtacanteId = timeDefensorId === 'rival' ? 'meuTime' : 'rival';
  const dibreAtivo = Boolean(estado?.bonusDibre?.[timeAtacanteId]);
  const zonaDibre = dibreAtivo && estado?.zonaBola ? estado.zonaBola : null;

  const aplicarReducaoDibre = (baseObj) => {
    if (!zonaDibre) return baseObj;
    const obj = baseObj ? { ...baseObj } : { ...extraLinha };
    const atualZona = obj.multiplicadorPortadorPorZona?.[zonaDibre] ?? 1;
    obj.multiplicadorPortadorPorZona = {
      ...(obj.multiplicadorPortadorPorZona || {}),
      [zonaDibre]: atualZona * (1 - DIBRE_CONFIG.reducaoPressaoPosDibre),
    };
    return obj;
  };

  if (timeDefensorId === 'rival') {
    const carrinho = estado.defesaRivalTurno?.carrinho;
    if (!carrinho) {
      return aplicarReducaoDibre(multLinhaPostura !== 1 ? extraLinha : null);
    }
    return aplicarReducaoDibre({
      ...extraLinha,
      multiplicadorPortadorPorJogador: {
        [carrinho.jogadorId]: carrinho.multiplicador,
      },
      habilidadesDefesa: [carrinho],
    });
  }

  if (timeDefensorId !== 'meuTime' || !estado.defesaTurno) {
    return aplicarReducaoDibre(multLinhaPostura !== 1 ? extraLinha : null);
  }

  const { ordem, zonaBolaAnunciada, zonaDestinoAnunciada, habilidadeAtiva } =
    estado.defesaTurno;

  if (
    habilidadeAtiva?.efeito?.tipo === 'multiplicador_pressao_portador_jogador'
  ) {
    return aplicarReducaoDibre({
      ...extraLinha,
      multiplicadorPortadorPorJogador: {
        [habilidadeAtiva.jogadorId]: habilidadeAtiva.efeito.multiplicador,
      },
      habilidadesDefesa: [habilidadeAtiva],
    });
  }

  if (ordem === 'pressionar' && zonaBolaAnunciada) {
    return aplicarReducaoDibre({
      ...extraLinha,
      multiplicadorPortadorPorZona: {
        [zonaBolaAnunciada]: DEFESA_CONFIG.multiplicadorPressionarPortador,
      },
    });
  }

  if (ordem === 'fechar_linha' && zonaDestinoAnunciada) {
    return aplicarReducaoDibre({
      ...extraLinha,
      fecharLinha: {
        zonaAlvo: zonaDestinoAnunciada,
        multAlvo: DEFESA_CONFIG.multiplicadorFecharLinhaAlvo,
        multOutras: DEFESA_CONFIG.multiplicadorFecharLinhaOutras,
      },
    });
  }

  return aplicarReducaoDibre(multLinhaPostura !== 1 ? extraLinha : null);
}

/**
 * Retorna eventual bônus ativo de defesa do goleiro para o time defensor neste turno (ex.: Voo +15).
 */
export function obterBonusDefesaGoleiroTurno(estado, timeDefensorId) {
  if (timeDefensorId === 'meuTime') {
    const hab = estado.defesaTurno?.habilidadeAtiva;
    if (hab?.efeito?.tipo === 'bonus_defesa_goleiro') {
      return {
        bonusDefesa: hab.efeito.bonusDefesa || 0,
        habilidades: [`${hab.nome} (${hab.jogadorNome}: +${hab.efeito.bonusDefesa} def.)`],
      };
    }
  }

  if (timeDefensorId === 'rival') {
    const voo = estado.defesaRivalTurno?.voo;
    if (voo) {
      return {
        bonusDefesa: voo.bonusDefesa || 0,
        habilidades: [`${voo.nome} (${voo.jogadorNome}: +${voo.bonusDefesa} def.)`],
      };
    }
  }

  return { bonusDefesa: 0, habilidades: [] };
}

/**
 * Retorna os ajustes diretos na chance (%) para o time atacante no turno atual,
 * incluindo Postura, Contra-ataque, Ímpeto (Momentum), Marcador batido (Dibre),
 * Chegada ao Terço Final, Cruzamento da Linha de Fundo e Bolas Paradas.
 */
export function obterAjustesChanceTurno(
  estado,
  timeAtacanteId,
  acao,
  tipoPasseId = null,
  contextoExtra = null,
) {
  const posturaMeu = estado?.posturas?.meuTime || POSTURA_PADRAO;
  const posturaRival = estado?.posturas?.rival || POSTURA_PADRAO;
  const posturaAtacante = timeAtacanteId === 'meuTime' ? posturaMeu : posturaRival;

  const ajustes = [
    ...obterAjustesChancePostura(posturaAtacante, acao, tipoPasseId),
  ];

  // 1. Ímpeto (Momentum) do time atacante
  const nivelImpeto = estado?.impeto?.[timeAtacanteId] || 0;
  if (nivelImpeto > 0) {
    ajustes.push({
      rotulo: `Ímpeto (Nív. ${nivelImpeto})`,
      valor: nivelImpeto * DEFESA_CONFIG.bonusPorNivelImpeto,
    });
  }

  // 2. Bônus de Marcador Batido (após Dibre bem-sucedido)
  if (estado?.bonusDibre?.[timeAtacanteId]) {
    ajustes.push({
      rotulo: 'Marcador batido (Dibre)',
      valor: DIBRE_CONFIG.bonusDibreProximaJogada,
    });
  }

  // 3. Bônus de Recepção de Cruzamento / Passe da Linha de Fundo para finalização
  if (estado?.bonusCruzamento?.[timeAtacanteId] && acao === 'finalizar') {
    ajustes.push({
      rotulo: 'Passe da linha de fundo',
      valor: CRUZAMENTO_CONFIG.bonusRecepcaoCruzamento,
    });
  }

  // 3b. Bônus de Rebote na Área (goleiro fora de posição)
  if (estado?.bonusRebote?.[timeAtacanteId] && acao === 'finalizar') {
    ajustes.push({
      rotulo: 'Rebote na área',
      valor: FINALIZACAO_CONFIG.bonusReboteArea,
    });
  }

  // 4. Chegada ao Terço Final e Passe da Linha de Fundo
  const zonaOrigem = contextoExtra?.zonaOrigem || estado?.zonaBola;
  const zonaDestino = contextoExtra?.zonaDestino || null;
  if (zonaOrigem && zonaDestino) {
    const faixaOrig = obterFaixa(zonaOrigem, timeAtacanteId);
    const faixaDest = obterFaixa(zonaDestino, timeAtacanteId);

    if (
      (acao === 'passe' || acao === 'conduzir' || acao === 'dibrar') &&
      faixaDest >= 4 &&
      faixaDest > faixaOrig
    ) {
      ajustes.push({
        rotulo: 'Infiltração terço final',
        valor: DEFESA_CONFIG.bonusInfiltracaoTercoFinal,
      });
    }

    if (
      acao === 'passe' &&
      ehZonaLinhaDeFundo(zonaOrigem, timeAtacanteId) &&
      ehZonaTercoFinal(zonaDestino, timeAtacanteId)
    ) {
      ajustes.push({
        rotulo: 'Cruzamento rasteiro (linha de fundo)',
        valor: CRUZAMENTO_CONFIG.bonusPasseLinhaDeFundo,
      });
    }
  }

  // 5. Bolas Paradas Ofensivas (Escanteio e Falta Perigosa)
  const bp = estado?.bolaParadaContexto;
  if (bp && bp.time === timeAtacanteId) {
    if (bp.tipo === 'escanteio') {
      if (acao === 'cruzar') {
        ajustes.push({
          rotulo: 'Escanteio na área',
          valor: DEFESA_CONFIG.bonusEscanteioCruzamento,
        });
      } else if (acao === 'passe') {
        const ehCurto = tipoPasseId === 'curto' || tipoPasseId === 'lateral';
        ajustes.push({
          rotulo: ehCurto ? 'Escanteio curto' : 'Escanteio ensaiado',
          valor: ehCurto ? DEFESA_CONFIG.bonusEscanteioCurto : 10,
        });
      }
    } else if (bp.tipo === 'falta_ofensiva') {
      if (acao === 'passe' || acao === 'cruzar') {
        ajustes.push({
          rotulo: 'Falta ensaiada',
          valor: DEFESA_CONFIG.bonusFaltaOfensivaPasse,
        });
      }
    }
  }

  if (timeAtacanteId === 'meuTime') {
    if (estado.bonusContraAtaqueMeu) {
      const extraPostura = obterBonusContraAtaquePostura({
        posturaRecuperador: posturaMeu,
        posturaPerdedor: posturaRival,
      });
      ajustes.push({
        rotulo:
          extraPostura > 0
            ? `Contra-ataque (+${extraPostura}% postura)`
            : 'Contra-ataque',
        valor: DEFESA_CONFIG.bonusContraAtaque + extraPostura,
      });
    }
    if ((estado.descontoRelogioAtual || 0) > 0) {
      ajustes.push({
        rotulo: 'Desconto relógio',
        valor: -Math.abs(estado.descontoRelogioAtual),
      });
    }
    return ajustes;
  }

  // Turno do time rival
  if (estado.bonusContraAtaqueRival) {
    const extraPostura = obterBonusContraAtaquePostura({
      posturaRecuperador: posturaRival,
      posturaPerdedor: posturaMeu,
    });
    ajustes.push({
      rotulo:
        extraPostura > 0
          ? `Contra-ataque rival (+${extraPostura}% postura)`
          : 'Contra-ataque rival',
      valor: DEFESA_CONFIG.bonusContraAtaque + extraPostura,
    });
  }

  if (estado.bonusProximaJogadaRival > 0) {
    ajustes.push({
      rotulo: 'Espaço pós-pressão',
      valor: estado.bonusProximaJogadaRival,
    });
  }

  if (estado.defesaTurno?.bolaParada && acao === 'passe') {
    ajustes.push({
      rotulo: 'Bola parada (falta)',
      valor: DEFESA_CONFIG.bonusBolaParadaFalta,
    });
  }

  if (estado.defesaTurno?.ordem === 'recuar' && acao === 'passe') {
    if (tipoPasseId === 'frente' || tipoPasseId === 'longo') {
      ajustes.push({
        rotulo: 'Bloco recuado (frente/longo)',
        valor: DEFESA_CONFIG.ajusteRecuarFrenteOuLongo,
      });
    } else if (tipoPasseId === 'tras' || tipoPasseId === 'lateral') {
      ajustes.push({
        rotulo: 'Bloco recuado (trás/lateral)',
        valor: DEFESA_CONFIG.ajusteRecuarTrasOuLateral,
      });
    }
  }

  return ajustes;
}

/**
 * Avalia se uma jogada recuperada (desarme ou interceptação) ativa contra-ataque
 * quando o adversário estava na fase FRENTE.
 */
export function verificarAtivacaoContraAtaque(estadoAntes, tipoResultado, timeVencedorPosse) {
  if (timeVencedorPosse !== 'meuTime' && timeVencedorPosse !== 'rival') return false;
  if (tipoResultado !== 'interceptacao' && tipoResultado !== 'desarme') return false;
  const perdedorId = timeVencedorPosse === 'meuTime' ? 'rival' : 'meuTime';
  const fasePerdedor = obterFaseParaTime(estadoAntes.zonaBola, perdedorId);
  return fasePerdedor === 'frente';
}

/**
 * Cria o registro de intenção defensiva quando o rival anuncia sua jogada.
 */
export function criarEstadoDefesaTurno(estado, intencaoInicial) {
  const marcadorFalta = escolherMarcadorFalta(estado, intencaoInicial.zonaOrigem);
  return {
    fase: 'aguardando_ordem',
    ordem: null,
    habilidadeAtiva: null,
    deslocamentoMeuTime: 0,
    bolaParada: false,
    zonaBolaAnunciada: intencaoInicial.zonaOrigem,
    zonaDestinoAnunciada: intencaoInicial.zonaDestino,
    intencaoInicial,
    intencaoAtual: intencaoInicial,
    trocouJogada: false,
    marcadorFalta,
    chanceAmarelo: calcularChanceCartaoAmarelo(marcadorFalta),
    ultimoCartao: null,
    gastosOrdem: [],
  };
}
