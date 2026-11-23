/**
 * Ponto de entrada do jogo Prancheta 11.
 *
 * Orquestra:
 * - Tela Inicial (Campanha por seed, Continuar Campanha Salva e Partida Avulsa)
 * - Modo Campanha (Mapa vertical de 12 camadas, 9 tipos de nó + Chefão, persistência segura)
 * - Núcleo da Partida encapsulado em `partida(meuTime, rival, opcoes)`
 */

import { obterZonaGolAlvo, podeFinalizarNaZona, saoZonasVizinhos } from './dados/zonas.js';
import { TIPOS_NO } from './campanha/constantes.js';
import {
  carregarCampanha,
  gerarNovaSeed,
  gerarRivalPorCamada,
  limparCampanha,
  salvarCampanha,
} from './campanha/estado.js';
import {
  aplicarDescansoTotal,
  aplicarFisioterapia,
  aplicarPosPartidaCampanha,
  aplicarTorcida,
  iniciarNovaCampanha,
  montarTimeParaPartida,
} from './campanha/nos.js';
import {
  anunciarIntencaoRival,
  aplicarOrdemDefensiva,
  avaliarConducao,
  avaliarFinalizacao,
  avaliarPasse,
  criarPartida,
  executarJogada,
  fazerSubstituicao,
  obterPortador,
  obterResumoFinal,
  partida as executarPartidaEncapsulada,
} from './regras/partida.js';
import {
  formatarMultiplicador,
  obterEstamina,
  obterFaixaFadiga,
} from './regras/estamina.js';
import {
  listarReservasDisponiveis,
  MAX_SUBSTITUICOES_PARTIDA,
  podeSubstituir,
} from './regras/substituicao.js';
import {
  avaliarHabilidadeOfensivaPortador,
  obterHabilidadesJogador,
} from './regras/habilidades.js';
import {
  carregarMeta,
  finalizarCampanhaNoMeta,
  modificadoresMeta,
  salvarMeta,
} from './meta/meta.js';
import { simularPartidasEquilibrio } from './debug/simulacao.js';
import { escolherJogadaRival } from './rival/ia.js';
import { criarControladorCampo } from './ui/campo.js';
import { renderizarTelaClube } from './ui/clube.js';
import { renderizarHudCampanha, renderizarMapaCampanha } from './ui/mapa.js';
import { renderizarMenuInicial } from './ui/menu.js';
import {
  renderizarModalElenco,
  renderizarTelaEscalacao,
  renderizarTelaEvento,
  renderizarTelaFimCampanha,
  renderizarTelaMercado,
  renderizarTelaMisterioso,
  renderizarTelaPatrocinio,
  renderizarTelaSimples,
  renderizarTelaTreino,
} from './ui/telas.js';
import { renderizarSalaTrofeus } from './ui/trofeus.js';

function criarSintetizadorSom() {
  let ctx = null;
  let mudo = false;

  function obterContexto() {
    if (mudo) return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctx) ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tocarNota(freq, duracao, tipo = 'sine', volume = 0.08, atraso = 0) {
    const audio = obterContexto();
    if (!audio) return;

    const inicio = audio.currentTime + atraso;
    const osc = audio.createOscillator();
    const ganho = audio.createGain();

    osc.type = tipo;
    osc.frequency.setValueAtTime(freq, inicio);
    ganho.gain.setValueAtTime(0.0001, inicio);
    ganho.gain.exponentialRampToValueAtTime(volume, inicio + 0.015);
    ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);

    osc.connect(ganho);
    ganho.connect(audio.destination);
    osc.start(inicio);
    osc.stop(inicio + duracao + 0.02);
  }

  return {
    alternarMudo() {
      mudo = !mudo;
      return mudo;
    },
    clique() {
      tocarNota(520, 0.06, 'triangle', 0.05);
    },
    acerto() {
      tocarNota(340, 0.08, 'sine', 0.07, 0);
      tocarNota(510, 0.1, 'triangle', 0.06, 0.05);
    },
    apito() {
      tocarNota(2100, 0.12, 'sine', 0.04, 0);
      tocarNota(2280, 0.14, 'sine', 0.035, 0.14);
    },
    interceptacao() {
      tocarNota(190, 0.14, 'sawtooth', 0.05, 0);
      tocarNota(140, 0.16, 'triangle', 0.05, 0.06);
    },
    gol() {
      tocarNota(523.25, 0.14, 'triangle', 0.09, 0);
      tocarNota(659.25, 0.14, 'triangle', 0.09, 0.1);
      tocarNota(783.99, 0.24, 'triangle', 0.1, 0.2);
      tocarNota(1046.5, 0.32, 'sine', 0.08, 0.32);
    },
  };
}

function formatarAtributosResumoReserva(reserva) {
  const a = reserva.atributos;
  if (reserva.ehGoleiro) {
    return `DEF ${a.defesa} · PAS ${a.passe} · DOM ${a.dominio} · POS ${a.posicionamento}`;
  }
  return `PAS ${a.passe} · DOM ${a.dominio} · MAR ${a.marcacao} · DES ${a.desarme} · VEL ${a.velocidade} · FIN ${a.finalizacao}`;
}

function iniciarJogo() {
  const som = criarSintetizadorSom();

  // Estado geral: 'title' | 'club' | 'trophies' | 'simulation' | 'campaign_map' | 'campaign_node' | 'campaign_over' | 'playing' | 'paused' | 'gameover'
  let estadoTela = 'title';
  let modoPartida = 'amistoso'; // 'amistoso' | 'campanha'
  let meta = carregarMeta();
  let campanha = carregarCampanha();
  let resumoPosPartidaCampanha = null;
  let resultadoMetaFimCampanha = null;
  let resolverPartidaUI = null;

  const selecaoNovaCampanha = {
    clubeId: meta.clubeSelecionadoPadrao || 'equilibrado',
    tecnicoId: meta.tecnicoSelecionadoPadrao || 'padrao',
    dificuldade: 0,
    seed: campanha?.seed || gerarNovaSeed(),
  };

  let partida = criarPartida(undefined, { modificadoresMeta: modificadoresMeta(meta) });
  let portadorSelecionado = false;
  let previaJogada = null;
  let habilidadeOfensivaModo = null;
  let inspecionadoId = partida.portadorId;
  let rivalPensando = false;
  let temporizadorRival = null;
  let substituindoJogadorId = null;
  let elencoModalAberto = false;

  // Elementos da Tela Inicial / Meta / Simulação
  const elInputSeed = document.getElementById('input-seed-titulo');
  const elConteudoClube = document.getElementById('conteudo-clube');
  const elConteudoTrofeus = document.getElementById('conteudo-trofeus');
  const elBtnSimVoltar = document.getElementById('btn-sim-voltar');
  const elSimForca = document.getElementById('sim-forca-rival');
  const elSimForcaValor = document.getElementById('sim-forca-valor');
  const elSimClube = document.getElementById('sim-clube');
  const elSimTecnico = document.getElementById('sim-tecnico');
  const elBtnRodarSimulacao = document.getElementById('btn-rodar-simulacao');
  const elSimResultado = document.getElementById('simulacao-resultado');

  // Elementos da Campanha
  const elConteudoNo = document.getElementById('conteudo-no-campanha');
  const elBtnCampVerElenco = document.getElementById('btn-camp-ver-elenco');
  const elBtnCampNova = document.getElementById('btn-camp-nova');
  const elBtnCampTitulo = document.getElementById('btn-camp-titulo');
  const elModalElenco = document.getElementById('modal-elenco-campanha');
  const elListaElenco = document.getElementById('lista-elenco-campanha');
  const elBtnFecharElenco = document.getElementById('btn-fechar-elenco');
  const elBtnFimCampClube = document.getElementById('btn-fim-camp-clube');
  const elBtnFimCampRepetirSeed = document.getElementById('btn-fim-camp-repetir-seed');
  const elBtnFimCampNova = document.getElementById('btn-fim-camp-nova');
  const elBtnFimCampTitulo = document.getElementById('btn-fim-camp-titulo');

  // Elementos da Partida
  const elSiglaMeuPlacar = document.getElementById('sigla-meu-placar');
  const elNomeMeuPlacar = document.getElementById('nome-meu-placar');
  const elNomeRivalPlacar = document.getElementById('nome-rival-placar');
  const elSiglaRivalPlacar = document.getElementById('sigla-rival-placar');
  const elBtnSom = document.getElementById('btn-som');
  const elIconeOndas = document.getElementById('icone-som-ondas');
  const elBtnPausa = document.getElementById('btn-pausa');
  const elBtnReiniciarTopo = document.getElementById('btn-reiniciar-topo');

  const elModalPausa = document.getElementById('modal-pausa');
  const elPausaPlacar = document.getElementById('pausa-placar');
  const elBtnRetomar = document.getElementById('btn-retomar');
  const elBtnReiniciarPausa = document.getElementById('btn-reiniciar-pausa');
  const elBtnVoltarTitulo = document.getElementById('btn-voltar-titulo');

  const elModalSub = document.getElementById('modal-substituicao');
  const elSubRestantesBadge = document.getElementById('sub-restantes-badge');
  const elSubSaindoInfo = document.getElementById('sub-saindo-info');
  const elListaReservas = document.getElementById('lista-reservas');
  const elBtnCancelarSub = document.getElementById('btn-cancelar-sub');

  const elModalFim = document.getElementById('modal-fim');
  const elTituloFim = document.getElementById('titulo-fim');
  const elPlacarFinalModal = document.getElementById('placar-final-modal');
  const elStatsFinais = document.getElementById('stats-finais');
  const elFimCampanhaNota = document.getElementById('fim-campanha-nota');
  const elBtnFimVoltarCampanha = document.getElementById('btn-fim-voltar-campanha');
  const elBtnJogarNovamente = document.getElementById('btn-jogar-novamente');
  const elBtnFimTitulo = document.getElementById('btn-fim-titulo');

  if (elInputSeed) {
    elInputSeed.value = selecaoNovaCampanha.seed;
  }

  function aplicarUniformeNoDom(uniforme) {
    const uni = uniforme || modificadoresMeta(meta).uniforme;
    if (!uni) return;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--meu-bg', uni.corPrincipal || '#163a76');
    rootStyle.setProperty('--meu-borda', uni.corBorda || 'rgba(147, 197, 253, 0.5)');
    rootStyle.setProperty('--meu-detalhe', uni.corDetalhe || '#f5b82e');
    rootStyle.setProperty('--meu-texto', uni.corTexto || '#ffffff');
  }

  aplicarUniformeNoDom(modificadoresMeta(meta).uniforme);

  const campoUI = criarControladorCampo({
    onCliqueJogador: tratarCliqueJogador,
    onCliqueZona: tratarCliqueZona,
    onSelecionarFinalizacao: selecionarFinalizacao,
    onSelecionarHabilidadeOfensiva: selecionarHabilidadeOfensiva,
    onConfirmarJogada: confirmarJogadaUsuario,
    onCancelarJogada: cancelarPrevia,
    onOrdemDefensiva: tratarOrdemDefensiva,
    onAbrirSubstituicao: abrirModalSubstituicao,
  });

  function limparTemporizadorRival() {
    if (temporizadorRival !== null) {
      window.clearTimeout(temporizadorRival);
      temporizadorRival = null;
    }
    rivalPensando = false;
  }

  function atualizarPlacarCabecalho() {
    if (elSiglaMeuPlacar) elSiglaMeuPlacar.textContent = partida.times.meuTime.sigla || 'BRI';
    if (elNomeMeuPlacar) elNomeMeuPlacar.textContent = partida.times.meuTime.nome;
    if (elNomeRivalPlacar) elNomeRivalPlacar.textContent = partida.times.rival.nome;
    if (elSiglaRivalPlacar) elSiglaRivalPlacar.textContent = partida.times.rival.sigla || 'RIV';

    const ehCampanha = modoPartida === 'campanha';
    if (elBtnReiniciarTopo) elBtnReiniciarTopo.hidden = ehCampanha;
    if (elBtnReiniciarPausa) elBtnReiniciarPausa.hidden = ehCampanha;
  }

  function abrirClube(feedbackInicial = '') {
    limparTemporizadorRival();
    estadoTela = 'club';
    atualizarTela(feedbackInicial);
  }

  function abrirTrofeus() {
    limparTemporizadorRival();
    estadoTela = 'trophies';
    atualizarTela();
  }

  function abrirSimulacao() {
    limparTemporizadorRival();
    estadoTela = 'simulation';
    atualizarTela();
  }

  function atualizarTela(feedbackClube = '') {
    document.body.dataset.state = estadoTela;

    elModalPausa.hidden = estadoTela !== 'paused';
    elModalFim.hidden = estadoTela !== 'gameover';
    elModalSub.hidden = estadoTela !== 'playing' || !substituindoJogadorId;
    if (elModalElenco) {
      elModalElenco.hidden =
        !elencoModalAberto || (estadoTela !== 'campaign_map' && estadoTela !== 'campaign_node');
    }

    if (estadoTela === 'title') {
      selecaoNovaCampanha.clubeId = meta.clubeSelecionadoPadrao || selecaoNovaCampanha.clubeId;
      selecaoNovaCampanha.tecnicoId = meta.tecnicoSelecionadoPadrao || selecaoNovaCampanha.tecnicoId;
      selecaoNovaCampanha.dificuldade = Math.min(
        selecaoNovaCampanha.dificuldade || 0,
        meta.dificuldadeMaxDesbloqueada || 0,
      );
      aplicarUniformeNoDom(modificadoresMeta(meta).uniforme);

      renderizarMenuInicial({
        meta,
        campanhaSalva: carregarCampanha(),
        selecao: selecaoNovaCampanha,
        onAlterarSelecao(patch) {
          Object.assign(selecaoNovaCampanha, patch);
          if (patch.clubeId) {
            meta.clubeSelecionadoPadrao = patch.clubeId;
            salvarMeta(meta);
          }
          if (patch.tecnicoId) {
            meta.tecnicoSelecionadoPadrao = patch.tecnicoId;
            salvarMeta(meta);
          }
          if (!('seed' in patch)) {
            som.clique();
            atualizarTela();
          }
        },
        onSortearSeed() {
          const nova = gerarNovaSeed();
          selecaoNovaCampanha.seed = nova;
          if (elInputSeed) elInputSeed.value = nova;
          som.clique();
        },
        onContinuarCampanha: continuarCampanhaSalva,
        onIniciarCampanha: () => iniciarCampanhaComSeed(elInputSeed?.value || selecaoNovaCampanha.seed),
        onAbrirClube: () => {
          som.clique();
          abrirClube();
        },
        onAbrirTrofeus: () => {
          som.clique();
          abrirTrofeus();
        },
        onPartidaAvulsa: () => comecarPartidaAvulsa(),
        onAbrirSimulacao: () => {
          som.clique();
          abrirSimulacao();
        },
      });
      return;
    }

    if (estadoTela === 'club') {
      renderizarTelaClube(elConteudoClube, meta, {
        feedbackInicial: typeof feedbackClube === 'string' ? feedbackClube : '',
        onMetaAtualizada(novoMeta) {
          meta = novoMeta;
          selecaoNovaCampanha.clubeId = meta.clubeSelecionadoPadrao;
          selecaoNovaCampanha.tecnicoId = meta.tecnicoSelecionadoPadrao;
          aplicarUniformeNoDom(modificadoresMeta(meta).uniforme);
        },
        onVoltarMenu: irParaTitulo,
      });
      return;
    }

    if (estadoTela === 'trophies') {
      renderizarSalaTrofeus(elConteudoTrofeus, meta, {
        onVoltarMenu: irParaTitulo,
      });
      return;
    }

    if (estadoTela === 'simulation') {
      return;
    }

    if (estadoTela === 'campaign_map') {
      renderizarMapaCampanha(campanha, {
        onSelecionarNo: entrarNoCampanha,
      });
      return;
    }

    if (estadoTela === 'campaign_node') {
      renderizarHudCampanha(campanha);
      return;
    }

    if (estadoTela === 'campaign_over') {
      renderizarHudCampanha(campanha);
      renderizarTelaFimCampanha(campanha, resultadoMetaFimCampanha);
      return;
    }

    atualizarPlacarCabecalho();

    if (estadoTela === 'paused') {
      elPausaPlacar.textContent = `${partida.placar.meuTime} × ${partida.placar.rival}`;
    }

    if (estadoTela === 'gameover') {
      renderizarModalFim();
    }

    campoUI.renderizar(partida, {
      portadorSelecionado,
      previaJogada,
      inspecionadoId,
      rivalPensando,
      habilidadeOfensivaModo,
    });
  }

  // ==========================================================================
  // Fluxo do Modo Campanha
  // ==========================================================================

  function irParaMapaCampanha() {
    limparTemporizadorRival();
    substituindoJogadorId = null;
    elencoModalAberto = false;
    if (!campanha) return irParaTitulo();

    if (campanha.status !== 'em_andamento') {
      if (!campanha.metaFinalizada) {
        resultadoMetaFimCampanha = finalizarCampanhaNoMeta(meta, campanha);
        campanha.metaFinalizada = true;
        salvarMeta(meta);
      }
      salvarCampanha(campanha);
      estadoTela = 'campaign_over';
    } else {
      salvarCampanha(campanha);
      estadoTela = 'campaign_map';
    }
    atualizarTela();
  }

  function iniciarCampanhaComSeed(seedPersonalizada = null, opcoesOverride = null) {
    limparTemporizadorRival();
    resolverPartidaUI = null;
    resumoPosPartidaCampanha = null;
    resultadoMetaFimCampanha = null;
    const seedLimpa =
      typeof seedPersonalizada === 'string' && seedPersonalizada.trim()
        ? seedPersonalizada.trim()
        : gerarNovaSeed();
    const clubeId = opcoesOverride?.clubeId || selecaoNovaCampanha.clubeId;
    const tecnicoId = opcoesOverride?.tecnicoId || selecaoNovaCampanha.tecnicoId;
    const dificuldade =
      typeof opcoesOverride?.dificuldade === 'number'
        ? opcoesOverride.dificuldade
        : selecaoNovaCampanha.dificuldade;

    campanha = iniciarNovaCampanha(seedLimpa, meta, {
      clubeId,
      tecnicoId,
      dificuldade,
    });
    aplicarUniformeNoDom(campanha.modificadoresMeta?.uniforme);
    salvarCampanha(campanha);
    selecaoNovaCampanha.seed = campanha.seed;
    if (elInputSeed) elInputSeed.value = campanha.seed;
    som.clique();
    irParaMapaCampanha();
  }

  function continuarCampanhaSalva() {
    const salva = carregarCampanha();
    if (!salva || salva.status !== 'em_andamento') return;
    campanha = salva;
    resultadoMetaFimCampanha = null;
    aplicarUniformeNoDom(campanha.modificadoresMeta?.uniforme);
    som.clique();
    irParaMapaCampanha();
  }

  function abrirEscalacaoParaPartidaCampanha(no, { forcaPersonalizada = null, ehMisterioso = false } = {}) {
    const rival = gerarRivalPorCamada({
      seed: campanha.seed,
      noId: no.id,
      camada: no.camada,
      ehChefao: no.tipo === TIPOS_NO.CHEFAO,
      mediaInicialTitulares: campanha.mediaInicialTitulares,
      forcaPersonalizada: forcaPersonalizada ?? no.rivalForca,
      bonusDificuldade: campanha.modificadoresMeta?.bonusForcaRival || 0,
    });

    const noContexto = { ...no, ehMisterioso };
    estadoTela = 'campaign_node';
    atualizarTela();

    renderizarTelaEscalacao(elConteudoNo, campanha, noContexto, rival, {
      onVoltarMapa: () => irParaMapaCampanha(),
      onEntrarEmCampo: async ({ titularesPorPapel, reservasIds }) => {
        const meuTimeEscalado = montarTimeParaPartida(
          campanha,
          titularesPorPapel,
          reservasIds,
        );

        resumoPosPartidaCampanha = null;

        // Encapsula a partida na função partida(meuTime, rival, opcoes)
        const resultadoPartida = await executarPartidaEncapsulada(
          meuTimeEscalado,
          rival,
          {
            modificadoresMeta: campanha.modificadoresMeta,
            iniciarPartidaUI(estadoPartida, concluir) {
              modoPartida = 'campanha';
              limparTemporizadorRival();
              substituindoJogadorId = null;
              partida = estadoPartida;
              portadorSelecionado = false;
              previaJogada = null;
              habilidadeOfensivaModo = null;
              inspecionadoId = partida.portadorId;
              resolverPartidaUI = concluir;
              estadoTela = 'playing';
              som.apito();
              atualizarTela();
            },
          },
        );

        resumoPosPartidaCampanha = aplicarPosPartidaCampanha(
          campanha,
          resultadoPartida,
          no,
        );
        salvarCampanha(campanha);
        estadoTela = 'gameover';
        atualizarTela();
      },
    });
  }

  function entrarNoCampanha(no) {
    if (!campanha || campanha.status !== 'em_andamento') return;
    som.clique();

    if (no.tipo === TIPOS_NO.PARTIDA || no.tipo === TIPOS_NO.CHEFAO) {
      abrirEscalacaoParaPartidaCampanha(no);
      return;
    }

    estadoTela = 'campaign_node';
    atualizarTela();

    if (no.tipo === TIPOS_NO.TREINO) {
      renderizarTelaTreino(elConteudoNo, campanha, no, {
        onConcluir: () => irParaMapaCampanha(),
      });
      return;
    }

    if (no.tipo === TIPOS_NO.MERCADO) {
      renderizarTelaMercado(elConteudoNo, campanha, no, {
        onConcluir: () => irParaMapaCampanha(),
      });
      return;
    }

    if (no.tipo === TIPOS_NO.PATROCINIO) {
      renderizarTelaPatrocinio(elConteudoNo, campanha, no, {
        onConcluir: () => irParaMapaCampanha(),
      });
      return;
    }

    if (no.tipo === TIPOS_NO.EVENTO) {
      renderizarTelaEvento(elConteudoNo, campanha, no, null, {
        onConcluir: () => irParaMapaCampanha(),
      });
      return;
    }

    if (no.tipo === TIPOS_NO.DESCANSO) {
      const res = aplicarDescansoTotal(campanha, no);
      salvarCampanha(campanha);
      renderizarTelaSimples(
        elConteudoNo,
        no,
        'Concentração & Descanso Total',
        'O grupo fez trabalho regenerativo completo.',
        res.resumo,
        { onConcluir: () => irParaMapaCampanha() },
      );
      return;
    }

    if (no.tipo === TIPOS_NO.FISIOTERAPIA) {
      const res = aplicarFisioterapia(campanha, no);
      salvarCampanha(campanha);
      renderizarTelaSimples(
        elConteudoNo,
        no,
        'Departamento Médico',
        'Avaliação física e alta clínica do elenco.',
        res.resumo,
        { onConcluir: () => irParaMapaCampanha() },
      );
      return;
    }

    if (no.tipo === TIPOS_NO.TORCIDA) {
      const res = aplicarTorcida(campanha, no);
      salvarCampanha(campanha);
      renderizarTelaSimples(
        elConteudoNo,
        no,
        'Recepção da Torcida',
        `A arquibancada empurrou o ${campanha.clubeNome || 'Atlético Brisa'} antes da rodada!`,
        res.resumo,
        { onConcluir: () => irParaMapaCampanha() },
      );
      return;
    }

    if (no.tipo === TIPOS_NO.MISTERIOSO) {
      renderizarTelaMisterioso(elConteudoNo, campanha, no, {
        onConcluir: () => irParaMapaCampanha(),
        onIniciarPartidaSurpresa: (forcaMedia) =>
          abrirEscalacaoParaPartidaCampanha(no, {
            forcaPersonalizada: forcaMedia,
            ehMisterioso: true,
          }),
      });
    }
  }

  function encerrarPartidaAtual() {
    if (modoPartida === 'campanha' && typeof resolverPartidaUI === 'function') {
      const concluir = resolverPartidaUI;
      resolverPartidaUI = null;
      concluir(partida);
      return;
    }
    estadoTela = 'gameover';
    atualizarTela();
  }

  // ==========================================================================
  // Substituição, Fim de Jogo e Fluxo da Partida
  // ==========================================================================

  function fecharModalSubstituicao({ atualizar = true } = {}) {
    substituindoJogadorId = null;
    elModalSub.hidden = true;
    if (atualizar) atualizarTela();
  }

  function abrirModalSubstituicao(jogadorId) {
    if (estadoTela !== 'playing' || rivalPensando || partida.encerrada) return;
    const checagem = podeSubstituir(partida, 'meuTime', jogadorId);
    if (!checagem.permitido) return;

    const sai = partida.times.meuTime.jogadores.find((j) => j.id === jogadorId);
    if (!sai) return;

    substituindoJogadorId = jogadorId;
    const estSai = obterEstamina(sai);
    const faixaSai = obterFaixaFadiga(estSai);

    elSubRestantesBadge.textContent = `${checagem.restantesPartida}/${MAX_SUBSTITUICOES_PARTIDA} restantes`;
    elSubSaindoInfo.innerHTML =
      `Sai: <strong>${sai.nome}</strong> (${sai.posicao} · ${sai.zona || sai.papel}) · ` +
      `Estamina <strong>${estSai}%</strong> (${formatarMultiplicador(faixaSai.multiplicador)})`;

    const lista = listarReservasDisponiveis(partida, 'meuTime', jogadorId);
    elListaReservas.innerHTML = '';

    for (const item of lista) {
      const r = item.reserva;
      const estR = obterEstamina(r);
      const faixaR = obterFaixaFadiga(estR);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-reserva';
      btn.dataset.reservaId = r.id;
      btn.disabled = !item.compativel;

      const topo = document.createElement('div');
      topo.className = 'reserva-topo';

      const nome = document.createElement('strong');
      nome.className = 'reserva-nome';
      nome.textContent = `${r.nome} (${r.posicao})`;

      const meta = document.createElement('span');
      meta.className = `reserva-estamina nivel-${faixaR.cor}`;
      meta.textContent = `${r.setor || ''} · Est. ${estR}%`;

      topo.append(nome, meta);

      const attrs = document.createElement('div');
      attrs.className = 'reserva-atributos';
      attrs.textContent = formatarAtributosResumoReserva(r);

      btn.append(topo, attrs);

      const habsR = obterHabilidadesJogador(r);
      if (habsR.length > 0) {
        const habsDiv = document.createElement('div');
        habsDiv.className = 'reserva-habilidades';
        habsDiv.textContent = `Habilidades: ${habsR.map((h) => h.nome).join(' · ')}`;
        btn.appendChild(habsDiv);
      }

      if (!item.compativel && item.motivoIncompativel) {
        const aviso = document.createElement('div');
        aviso.className = 'reserva-incompativel';
        aviso.textContent = item.motivoIncompativel;
        btn.appendChild(aviso);
      }

      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const res = fazerSubstituicao(partida, 'meuTime', jogadorId, r.id);
        if (!res.valido) return;

        substituindoJogadorId = null;
        inspecionadoId = res.entra.id;
        if (partida.timeComBola === 'meuTime') {
          portadorSelecionado = false;
          previaJogada = null;
          habilidadeOfensivaModo = null;
        } else if (partida.defesaTurno?.intencaoAtual) {
          previaJogada = partida.defesaTurno.intencaoAtual;
        }
        som.clique();
        atualizarTela();
      });

      elListaReservas.appendChild(btn);
    }

    som.clique();
    atualizarTela();
  }

  function renderizarModalFim() {
    const resumo = obterResumoFinal(partida);
    elTituloFim.textContent = resumo.titulo;
    elPlacarFinalModal.textContent = `${resumo.placarMeu} × ${resumo.placarRival}`;

    const meu = resumo.estatisticas.meuTime;
    const rival = resumo.estatisticas.rival;
    const itens = [
      { valor: `${meu.passesCertos}/${meu.passesTentados}`, rotulo: 'Seus passes certos' },
      { valor: `${meu.finalizacoes} × ${rival.finalizacoes}`, rotulo: 'Finalizações' },
      { valor: `${meu.interceptacoes} × ${rival.interceptacoes}`, rotulo: 'Interceptações' },
    ];

    elStatsFinais.innerHTML = '';
    for (const item of itens) {
      const card = document.createElement('div');
      card.className = 'stat-final-item';

      const val = document.createElement('span');
      val.className = 'stat-final-valor';
      val.textContent = item.valor;

      const lbl = document.createElement('span');
      lbl.className = 'stat-final-rotulo';
      lbl.textContent = item.rotulo;

      card.append(val, lbl);
      elStatsFinais.appendChild(card);
    }

    const ehCampanha = modoPartida === 'campanha';
    if (elBtnFimVoltarCampanha) {
      elBtnFimVoltarCampanha.hidden = !ehCampanha;
      elBtnFimVoltarCampanha.textContent =
        campanha?.status !== 'em_andamento' ? 'Ver Desfecho da Campanha' : 'Voltar ao Mapa';
    }
    if (elBtnJogarNovamente) elBtnJogarNovamente.hidden = ehCampanha;
    if (elBtnFimTitulo) elBtnFimTitulo.hidden = ehCampanha;

    if (elFimCampanhaNota) {
      if (ehCampanha && resumoPosPartidaCampanha) {
        elFimCampanhaNota.hidden = false;
        elFimCampanhaNota.textContent = resumoPosPartidaCampanha.resumo;
      } else {
        elFimCampanhaNota.hidden = true;
        elFimCampanhaNota.textContent = '';
      }
    }
  }

  function tocarSomResultado(tipo) {
    if (tipo === 'gol') som.gol();
    else if (tipo === 'acerto' || tipo === 'conducao') som.acerto();
    else if (tipo === 'interceptacao' || tipo === 'defesa') som.interceptacao();
    else if (tipo === 'lateral' || tipo === 'escanteio' || tipo === 'tiro-de-meta') som.apito();
  }

  function comecarPartidaAvulsa({ tocarApito = true } = {}) {
    modoPartida = 'amistoso';
    resolverPartidaUI = null;
    resumoPosPartidaCampanha = null;
    limparTemporizadorRival();
    substituindoJogadorId = null;
    const modsAtuais = modificadoresMeta(meta);
    partida = criarPartida(undefined, { modificadoresMeta: modsAtuais });
    partida.times.meuTime.uniforme = modsAtuais.uniforme;
    aplicarUniformeNoDom(modsAtuais.uniforme);
    portadorSelecionado = false;
    previaJogada = null;
    habilidadeOfensivaModo = null;
    inspecionadoId = partida.portadorId;
    estadoTela = 'playing';

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (tocarApito) som.apito();
    atualizarTela();
  }

  function irParaTitulo() {
    limparTemporizadorRival();
    resolverPartidaUI = null;
    substituindoJogadorId = null;
    elencoModalAberto = false;
    portadorSelecionado = false;
    previaJogada = null;
    habilidadeOfensivaModo = null;
    estadoTela = 'title';
    atualizarTela();
  }

  function pausarPartida() {
    if (estadoTela !== 'playing') return;
    limparTemporizadorRival();
    substituindoJogadorId = null;
    estadoTela = 'paused';
    atualizarTela();
  }

  function retomarPartida() {
    if (estadoTela !== 'paused') return;
    estadoTela = 'playing';
    atualizarTela();

    if (partida.timeComBola === 'rival' && !partida.encerrada) {
      if (partida.defesaTurno?.fase === 'pronto_execucao') {
        agendarExecucaoRivalPosOrdem();
      } else if (!partida.defesaTurno) {
        agendarTurnoRival();
      }
    }
  }

  function cancelarPrevia() {
    if (!previaJogada || partida.timeComBola !== 'meuTime') return;
    if (previaJogada.habilidadeAtiva?.id === 'chute_de_fora') {
      habilidadeOfensivaModo = null;
    }
    previaJogada = null;
    som.clique();
    atualizarTela();
  }

  function selecionarHabilidadeOfensiva(habilidadeId) {
    if (
      estadoTela !== 'playing' ||
      partida.timeComBola !== 'meuTime' ||
      partida.encerrada ||
      rivalPensando
    ) {
      return;
    }

    const portador = obterPortador(partida);
    if (!portador) return;

    const info = avaliarHabilidadeOfensivaPortador(partida, portador, habilidadeId);
    if (!info || !info.disponivel) return;

    if (info.habilidade.efeito?.tipo === 'finalizacao_faixas') {
      if (
        habilidadeOfensivaModo === habilidadeId &&
        previaJogada?.habilidadeAtiva?.id === habilidadeId
      ) {
        habilidadeOfensivaModo = null;
        previaJogada = null;
        som.clique();
        atualizarTela();
        return;
      }

      const avaliacao = avaliarFinalizacao(partida, { habilidadeId });
      if (!avaliacao) return;

      habilidadeOfensivaModo = habilidadeId;
      portadorSelecionado = true;
      previaJogada = avaliacao;
      som.clique();
      atualizarTela();
      return;
    }

    habilidadeOfensivaModo =
      habilidadeOfensivaModo === habilidadeId ? null : habilidadeId;
    portadorSelecionado = true;
    previaJogada = null;
    som.clique();
    atualizarTela();
  }

  function tratarCliqueJogador(jogadorId, timeId) {
    if (estadoTela !== 'playing') return;

    inspecionadoId = jogadorId;

    if (partida.timeComBola !== 'meuTime' || partida.encerrada || rivalPensando) {
      atualizarTela();
      return;
    }

    if (timeId === 'meuTime' && jogadorId === partida.portadorId) {
      portadorSelecionado = !portadorSelecionado;
      if (!portadorSelecionado) {
        previaJogada = null;
        habilidadeOfensivaModo = null;
      }
      som.clique();
      atualizarTela();
      return;
    }

    if (timeId === 'meuTime' && portadorSelecionado) {
      if (habilidadeOfensivaModo === 'passe_infiltracao') {
        const avaliacao = avaliarPasse(partida, jogadorId, {
          habilidadeId: 'passe_infiltracao',
        });
        if (avaliacao) {
          previaJogada = avaliacao;
          som.clique();
        }
        atualizarTela();
        return;
      }

      if (habilidadeOfensivaModo !== 'arrancada') {
        const avaliacao = avaliarPasse(partida, jogadorId);
        if (avaliacao) {
          previaJogada = avaliacao;
          som.clique();
        }
      }
      atualizarTela();
      return;
    }

    const portador = obterPortador(partida);
    if (
      timeId === 'rival' &&
      portador &&
      podeFinalizarNaZona(portador.zona, 'meuTime') &&
      partida.times.rival.jogadores.find((j) => j.id === jogadorId)?.ehGoleiro
    ) {
      selecionarFinalizacao();
      return;
    }

    som.clique();
    atualizarTela();
  }

  function tratarCliqueZona(zonaId) {
    if (
      estadoTela !== 'playing' ||
      partida.timeComBola !== 'meuTime' ||
      partida.encerrada ||
      rivalPensando
    ) {
      return;
    }

    const portador = obterPortador(partida);
    if (!portador) return;

    if (portadorSelecionado && habilidadeOfensivaModo === 'arrancada') {
      const avaliacao = avaliarConducao(partida, zonaId, {
        habilidadeId: 'arrancada',
      });
      if (avaliacao) {
        previaJogada = avaliacao;
        som.clique();
        atualizarTela();
      }
      return;
    }

    if (
      podeFinalizarNaZona(portador.zona, 'meuTime') &&
      zonaId === obterZonaGolAlvo('meuTime')
    ) {
      selecionarFinalizacao();
      return;
    }

    if (portadorSelecionado && saoZonasVizinhos(portador.zona, zonaId) && zonaId !== 'GKR') {
      const avaliacao = avaliarConducao(partida, zonaId);
      if (avaliacao) {
        previaJogada = avaliacao;
        som.clique();
        atualizarTela();
      }
    }
  }

  function selecionarFinalizacao() {
    if (
      estadoTela !== 'playing' ||
      partida.timeComBola !== 'meuTime' ||
      partida.encerrada ||
      rivalPensando
    ) {
      return;
    }

    const avaliacao = avaliarFinalizacao(partida);
    if (!avaliacao) return;

    habilidadeOfensivaModo = null;
    portadorSelecionado = true;
    previaJogada = avaliacao;
    som.clique();
    atualizarTela();
  }

  function confirmarJogadaUsuario() {
    if (estadoTela !== 'playing' || !previaJogada || partida.timeComBola !== 'meuTime') {
      return;
    }

    const execucao = executarJogada(partida, previaJogada);
    if (!execucao.valido) return;

    portadorSelecionado = false;
    previaJogada = null;
    habilidadeOfensivaModo = null;
    inspecionadoId = partida.portadorId;

    tocarSomResultado(execucao.resultado.tipo);

    if (partida.encerrada) {
      encerrarPartidaAtual();
      return;
    }

    atualizarTela();

    if (partida.timeComBola === 'rival') {
      agendarTurnoRival();
    }
  }

  function agendarTurnoRival() {
    if (estadoTela !== 'playing' || partida.encerrada || partida.timeComBola !== 'rival') {
      return;
    }

    limparTemporizadorRival();
    const escolha = escolherJogadaRival(partida);
    if (!escolha) {
      atualizarTela();
      return;
    }

    anunciarIntencaoRival(partida, escolha);
    previaJogada = escolha;
    inspecionadoId = escolha.passador.id;
    atualizarTela();
  }

  function tratarOrdemDefensiva(tipoOrdem) {
    if (
      estadoTela !== 'playing' ||
      partida.encerrada ||
      partida.timeComBola !== 'rival' ||
      rivalPensando ||
      partida.defesaTurno?.fase !== 'aguardando_ordem'
    ) {
      return;
    }

    const res = aplicarOrdemDefensiva(partida, tipoOrdem, escolherJogadaRival);
    if (!res.valido) return;

    if (tipoOrdem === 'nenhuma') {
      executarTurnoRivalFinal();
      return;
    }

    if (tipoOrdem === 'falta_tatica') som.apito();
    else som.clique();

    previaJogada = res.intencaoFinal;
    rivalPensando = true;
    atualizarTela();
    agendarExecucaoRivalPosOrdem();
  }

  function agendarExecucaoRivalPosOrdem() {
    limparTemporizadorRival();
    rivalPensando = true;
    temporizadorRival = window.setTimeout(() => {
      temporizadorRival = null;
      if (estadoTela !== 'playing' || partida.encerrada) {
        rivalPensando = false;
        previaJogada = null;
        return;
      }
      executarTurnoRivalFinal();
    }, 620);
  }

  function executarTurnoRivalFinal() {
    const jogadaFinal = partida.defesaTurno?.intencaoAtual;
    if (!jogadaFinal) {
      rivalPensando = false;
      previaJogada = null;
      atualizarTela();
      return;
    }

    const execucao = executarJogada(partida, jogadaFinal);
    previaJogada = null;
    habilidadeOfensivaModo = null;
    rivalPensando = false;
    inspecionadoId = partida.portadorId;

    if (execucao.valido) {
      tocarSomResultado(execucao.resultado.tipo);
    }

    if (partida.encerrada) {
      encerrarPartidaAtual();
      return;
    }

    atualizarTela();

    if (partida.timeComBola === 'rival') {
      rivalPensando = true;
      temporizadorRival = window.setTimeout(() => {
        temporizadorRival = null;
        rivalPensando = false;
        agendarTurnoRival();
      }, 580);
    }
  }

  // ==========================================================================
  // Listeners de UI
  // ==========================================================================

  elBtnSimVoltar?.addEventListener('click', irParaTitulo);

  elSimForca?.addEventListener('input', () => {
    if (elSimForcaValor) elSimForcaValor.textContent = elSimForca.value;
  });

  elBtnRodarSimulacao?.addEventListener('click', () => {
    if (!elSimResultado) return;
    const forcaRival = Number(elSimForca?.value || 71);
    const clubeId = elSimClube?.value || 'equilibrado';
    const tecnicoId = elSimTecnico?.value || 'padrao';
    const res = simularPartidasEquilibrio({
      quantidade: 200,
      forcaRival,
      clubeId,
      tecnicoId,
      meta,
    });

    elSimResultado.innerHTML = '';
    const cabRes = document.createElement('div');
    cabRes.className = 'meta-card-topo';
    const titRes = document.createElement('h3');
    titRes.className = 'escalacao-col-titulo';
    titRes.textContent = `Resultado (${res.quantidade} partidas · ${res.clubeNome} · Téc. ${res.tecnicoNome} × Rival ${res.forcaRival})`;
    const placarGeral = document.createElement('span');
    placarGeral.className = 'meta-nivel-badge num-tabular';
    placarGeral.textContent = `${res.vitorias}V · ${res.empates}E · ${res.derrotas}D`;
    cabRes.append(titRes, placarGeral);
    elSimResultado.appendChild(cabRes);

    const grade = document.createElement('div');
    grade.className = 'sim-grade-metricas';
    const metricas = [
      { valor: `${res.pctVitorias}%`, rotulo: 'Vitórias' },
      { valor: `${res.pctEmpates}%`, rotulo: 'Empates' },
      { valor: `${res.pctDerrotas}%`, rotulo: 'Derrotas' },
      { valor: `${res.mediaGolsMeu} × ${res.mediaGolsRival}`, rotulo: 'Média Gols' },
      { valor: `${res.mediaEstaminaFinalMeu}%`, rotulo: 'Est. Final Meu' },
      { valor: `${res.mediaEstaminaFinalRival}%`, rotulo: 'Est. Final Rival' },
    ];
    for (const m of metricas) {
      const card = document.createElement('div');
      card.className = 'stat-final-item';
      const val = document.createElement('span');
      val.className = 'stat-final-valor num-tabular';
      val.textContent = m.valor;
      const lbl = document.createElement('span');
      lbl.className = 'stat-final-rotulo';
      lbl.textContent = m.rotulo;
      card.append(val, lbl);
      grade.appendChild(card);
    }
    elSimResultado.appendChild(grade);
    som.clique();
  });

  elBtnCampVerElenco?.addEventListener('click', () => {
    if (!campanha) return;
    elencoModalAberto = true;
    renderizarModalElenco(elListaElenco, campanha);
    som.clique();
    atualizarTela();
  });

  elBtnFecharElenco?.addEventListener('click', () => {
    elencoModalAberto = false;
    som.clique();
    atualizarTela();
  });

  elModalElenco?.addEventListener('click', (ev) => {
    if (ev.target === elModalElenco) {
      elencoModalAberto = false;
      atualizarTela();
    }
  });

  elBtnCampNova?.addEventListener('click', () => {
    limparCampanha();
    iniciarCampanhaComSeed(gerarNovaSeed());
  });

  elBtnCampTitulo?.addEventListener('click', irParaTitulo);

  elBtnFimCampClube?.addEventListener('click', () => {
    som.clique();
    abrirClube();
  });

  elBtnFimCampRepetirSeed?.addEventListener('click', () => {
    const seedMesma = campanha?.seed || gerarNovaSeed();
    iniciarCampanhaComSeed(seedMesma, {
      clubeId: campanha?.clubeId,
      tecnicoId: campanha?.tecnicoId,
      dificuldade: campanha?.dificuldade,
    });
  });

  elBtnFimCampNova?.addEventListener('click', () => {
    limparCampanha();
    iniciarCampanhaComSeed(gerarNovaSeed());
  });

  elBtnFimCampTitulo?.addEventListener('click', irParaTitulo);

  elBtnFimVoltarCampanha?.addEventListener('click', () => {
    som.clique();
    irParaMapaCampanha();
  });

  elBtnJogarNovamente?.addEventListener('click', () => comecarPartidaAvulsa());
  elBtnRetomar?.addEventListener('click', retomarPartida);
  elBtnReiniciarPausa?.addEventListener('click', () => comecarPartidaAvulsa());
  elBtnVoltarTitulo?.addEventListener('click', irParaTitulo);
  elBtnFimTitulo?.addEventListener('click', irParaTitulo);

  elBtnCancelarSub?.addEventListener('click', () => {
    som.clique();
    fecharModalSubstituicao();
  });

  elModalSub?.addEventListener('click', (evento) => {
    if (evento.target === elModalSub) {
      som.clique();
      fecharModalSubstituicao();
    }
  });

  elBtnPausa?.addEventListener('click', (evento) => {
    evento.currentTarget.blur();
    if (estadoTela === 'playing') pausarPartida();
    else if (estadoTela === 'paused') retomarPartida();
  });

  elBtnReiniciarTopo?.addEventListener('click', (evento) => {
    evento.currentTarget.blur();
    if (modoPartida === 'amistoso') comecarPartidaAvulsa();
  });

  elBtnSom?.addEventListener('click', (evento) => {
    evento.currentTarget.blur();
    const mudo = som.alternarMudo();
    elBtnSom.setAttribute('aria-pressed', String(mudo));
    elIconeOndas.style.opacity = mudo ? '0.18' : '1';
  });

  window.addEventListener('resize', () => {
    if (estadoTela === 'campaign_map' && campanha) {
      renderizarMapaCampanha(campanha, { onSelecionarNo: entrarNoCampanha });
    }
  });

  window.addEventListener('keydown', (evento) => {
    const tecla = evento.key;

    if (
      estadoTela === 'title' &&
      (tecla === 'Enter' || tecla === ' ') &&
      !(document.activeElement instanceof HTMLInputElement)
    ) {
      evento.preventDefault();
      iniciarCampanhaComSeed(elInputSeed?.value);
      return;
    }

    if (tecla === 'm' || tecla === 'M') {
      const mudo = som.alternarMudo();
      elBtnSom.setAttribute('aria-pressed', String(mudo));
      elIconeOndas.style.opacity = mudo ? '0.18' : '1';
      return;
    }

    if (tecla === 'Escape' && elencoModalAberto) {
      evento.preventDefault();
      elencoModalAberto = false;
      atualizarTela();
      return;
    }

    if (tecla === 'Escape' && estadoTela === 'playing' && substituindoJogadorId) {
      evento.preventDefault();
      fecharModalSubstituicao();
      return;
    }

    if (
      tecla === 'Escape' &&
      (estadoTela === 'club' || estadoTela === 'trophies' || estadoTela === 'simulation')
    ) {
      evento.preventDefault();
      irParaTitulo();
      return;
    }

    if (tecla === 'Escape' || tecla === 'p' || tecla === 'P') {
      if (estadoTela === 'playing') {
        evento.preventDefault();
        pausarPartida();
      } else if (estadoTela === 'paused') {
        evento.preventDefault();
        retomarPartida();
      }
      return;
    }

    if (
      (tecla === 'r' || tecla === 'R') &&
      modoPartida === 'amistoso' &&
      (estadoTela === 'playing' || estadoTela === 'paused')
    ) {
      evento.preventDefault();
      comecarPartidaAvulsa();
      return;
    }

    if (
      tecla === 'Enter' &&
      estadoTela === 'playing' &&
      !substituindoJogadorId &&
      partida.timeComBola === 'meuTime' &&
      previaJogada &&
      !rivalPensando
    ) {
      evento.preventDefault();
      confirmarJogadaUsuario();
    }
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get('autostart') === '1') {
    const seedParam = params.get('seed');
    iniciarCampanhaComSeed(seedParam || elInputSeed?.value);
  } else if (params.get('autostart') === 'amistoso') {
    comecarPartidaAvulsa({ tocarApito: false });
  } else {
    atualizarTela();
  }
}

document.addEventListener('DOMContentLoaded', iniciarJogo);
