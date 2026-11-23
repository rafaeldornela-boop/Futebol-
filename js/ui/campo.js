/**
 * Controlador visual do campo vertical de 17 zonas, chips com nome curto/posição/cartão,
 * camada de pressão na linha em vermelho, linha SVG com tipo e %,
 * painel de ordens defensivas e "Detalhes do cálculo".
 */

import { obterFaseParaTime } from '../dados/formacoes.js';
import { TIPOS_HABILIDADE } from '../dados/habilidades.js';
import {
  IDS_ZONAS,
  obterDistanciaZonas,
  obterZonaGolAlvo,
  podeFinalizarNaZona,
  saoZonasVizinhos,
  ZONAS,
} from '../dados/zonas.js';
import { calcularEficienciaNaZona } from '../regras/calculo.js';
import { avaliarCustoOrdemDefensiva } from '../regras/defesa.js';
import {
  formatarMultiplicador,
  obterCorEstamina,
  obterEstamina,
  obterFaixaFadiga,
} from '../regras/estamina.js';
import {
  listarHabilidadesDefensivasTime,
  listarHabilidadesOfensivasPortador,
  obterHabilidadesJogador,
} from '../regras/habilidades.js';
import {
  avaliarFinalizacao,
  avaliarPasse,
  obterPortador,
  obterPressaoDefensiva,
} from '../regras/partida.js';
import {
  MAX_SUBSTITUICOES_PARTIDA,
  podeSubstituir,
} from '../regras/substituicao.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ROTULOS_ATRIBUTOS = [
  ['passe', 'Passe'],
  ['dominio', 'Domínio'],
  ['posicionamento', 'Posicionam.'],
  ['marcacao', 'Marcação'],
  ['interceptacao', 'Intercept.'],
  ['desarme', 'Desarme'],
  ['velocidade', 'Velocidade'],
  ['tecnica', 'Técnica'],
  ['finalizacao', 'Finalização'],
  ['agressividade', 'Agressivid.'],
  ['defesa', 'Defesa'],
];

const ROTULOS_TIPO_JOGADA = {
  inicio: 'Início',
  acerto: 'Passe Certo',
  conducao: 'Condução',
  gol: 'Gol!',
  defesa: 'Defesa',
  lateral: 'Lateral',
  escanteio: 'Escanteio',
  'tiro-de-meta': 'Tiro de Meta',
  interceptacao: 'Interceptação',
  ordem: 'Ordem Tática',
  falta: 'Falta Tática',
  substituicao: 'Substituição',
};

const ROTULOS_FASE = {
  atras: 'Bola atrás',
  meio: 'Bola no meio',
  frente: 'Bola na frente',
};

function calcularOpacidadePressao(pressao) {
  if (pressao <= 0) return 0;
  return Number((0.03 + Math.pow(pressao / 100, 2.5) * 0.66).toFixed(3));
}

function criarIconeBolaSvg() {
  const span = document.createElement('span');
  span.className = 'icone-bola';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML =
    '<svg viewBox="0 0 20 20" width="13" height="13">' +
    '<circle cx="10" cy="10" r="8.5" fill="#FFFFFF" stroke="#111827" stroke-width="1.5"/>' +
    '<polygon points="10,5.2 13.8,8 12.3,12.5 7.7,12.5 6.2,8" fill="#111827"/>' +
    '</svg>';
  return span;
}

function criarIconeHabilidadeSvg() {
  const span = document.createElement('span');
  span.className = 'icone-habilidade';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML =
    '<svg viewBox="0 0 16 16" width="11" height="11">' +
    '<polygon points="8,1 10.1,5.6 15,6.2 11.4,9.6 12.3,14.5 8,12.1 3.7,14.5 4.6,9.6 1,6.2 5.9,5.6" fill="#F5B82E" stroke="#111827" stroke-width="0.9"/>' +
    '</svg>';
  return span;
}

export function criarControladorCampo({
  onCliqueJogador,
  onCliqueZona,
  onSelecionarFinalizacao,
  onSelecionarHabilidadeOfensiva,
  onConfirmarJogada,
  onCancelarJogada,
  onOrdemDefensiva,
  onAbrirSubstituicao,
}) {
  const elGradeZonas = document.getElementById('grade-zonas');
  const elSvg = document.getElementById('camada-linha-jogada');
  const elPlacarMeu = document.getElementById('placar-meu');
  const elPlacarRival = document.getElementById('placar-rival');
  const elTurnoQuem = document.getElementById('turno-quem');
  const elTurnoContagem = document.getElementById('turno-contagem');
  const elSubsContagem = document.getElementById('subs-contagem');
  const elFaseRotulo = document.getElementById('fase-atual-rotulo');
  const elAvisoBonusTurno = document.getElementById('aviso-bonus-turno');
  const elBarraConfirmacao = document.getElementById('barra-confirmacao');
  const elResumoInline = document.getElementById('resumo-jogada-inline');
  const elPainelHabPortador = document.getElementById('painel-habilidades-portador');
  const elBtnFinalizar = document.getElementById('btn-finalizar');
  const elBtnConfirmar = document.getElementById('btn-confirmar-jogada');
  const elBtnCancelar = document.getElementById('btn-cancelar-jogada');
  const elBlocoDefesa = document.getElementById('bloco-defesa');
  const elDefesaIntencaoResumo = document.getElementById('defesa-intencao-resumo');
  const elDescFaltaTatica = document.getElementById('desc-falta-tatica');
  const elListaOrdensHab = document.getElementById('lista-ordens-habilidades');
  const botoesOrdem = Array.from(document.querySelectorAll('[data-ordem]'));
  const elDetalhesCalculo = document.getElementById('detalhes-calculo');
  const elFichaJogador = document.getElementById('ficha-jogador');
  const elSeloUltima = document.getElementById('selo-ultima-jogada');
  const elTextoUltima = document.getElementById('texto-ultima-jogada');

  let ultimaPreviaDesenhada = null;

  elBtnFinalizar.addEventListener('click', () => onSelecionarFinalizacao());
  elBtnConfirmar.addEventListener('click', () => onConfirmarJogada());
  elBtnCancelar.addEventListener('click', () => onCancelarJogada());

  for (const btn of botoesOrdem) {
    btn.addEventListener('click', () => {
      onOrdemDefensiva(btn.dataset.ordem);
    });
  }

  if (typeof ResizeObserver !== 'undefined') {
    const observador = new ResizeObserver(() => {
      if (ultimaPreviaDesenhada) {
        desenharLinhaJogada(ultimaPreviaDesenhada);
      }
    });
    observador.observe(elGradeZonas);
  }

  function renderizarPlacar(estado, rivalPensando) {
    elPlacarMeu.textContent = String(estado.placar.meuTime);
    elPlacarRival.textContent = String(estado.placar.rival);

    if (estado.encerrada) {
      elTurnoQuem.textContent = 'Partida encerrada';
      elTurnoQuem.dataset.lado = 'meuTime';
    } else if (estado.timeComBola === 'meuTime') {
      elTurnoQuem.textContent = 'Seu turno';
      elTurnoQuem.dataset.lado = 'meuTime';
    } else if (estado.defesaTurno?.fase === 'aguardando_ordem') {
      elTurnoQuem.textContent = 'Defesa (sua ordem)';
      elTurnoQuem.dataset.lado = 'rival';
    } else {
      elTurnoQuem.textContent = rivalPensando ? 'Rival jogando...' : 'Turno do rival';
      elTurnoQuem.dataset.lado = 'rival';
    }

    const siglaMeu = estado.times?.meuTime?.sigla || 'BRI';
    const siglaRival = estado.times?.rival?.sigla || 'RIV';
    elTurnoContagem.textContent =
      `${siglaMeu} ${estado.turnosJogados.meuTime}/${estado.turnosMaximosPorLado} · ` +
      `${siglaRival} ${estado.turnosJogados.rival}/${estado.turnosMaximosPorLado}`;

    elSubsContagem.textContent = `Sub ${estado.substituicoes.meuTime}/${MAX_SUBSTITUICOES_PARTIDA}`;

    const faseMeu = obterFaseParaTime(estado.zonaBola, 'meuTime');
    elFaseRotulo.textContent = `Fase: ${ROTULOS_FASE[faseMeu]} · ${estado.times.meuTime.formacao}`;

    const avisos = [];
    if (estado.timeComBola === 'meuTime') {
      if (estado.bonusContraAtaqueMeu) avisos.push('Contra-ataque +10%');
      if (estado.defesaRivalTurno?.carrinho) {
        avisos.push(
          `Rival: Carrinho (${estado.defesaRivalTurno.carrinho.jogadorNome})`,
        );
      }
    } else if (estado.timeComBola === 'rival') {
      if (estado.defesaTurno?.bolaParada) {
        avisos.push('Bola parada rival (+10% passe)');
      }
      if (estado.bonusProximaJogadaRival > 0) {
        avisos.push(`Rival +${estado.bonusProximaJogadaRival}% (espaço)`);
      }
    }

    if (avisos.length > 0) {
      elAvisoBonusTurno.textContent = avisos.join(' · ');
      elAvisoBonusTurno.hidden = false;
    } else {
      elAvisoBonusTurno.hidden = true;
    }
  }

  function renderizarUltimaJogada(estado) {
    const jogada = estado.ultimaJogada;
    const tipo = jogada?.tipo || 'inicio';
    elSeloUltima.textContent = ROTULOS_TIPO_JOGADA[tipo] || 'Jogada';
    elSeloUltima.className = `selo-jogada tipo-${tipo}`;
    elTextoUltima.textContent = jogada?.texto || '';
  }

  function renderizarPainelDefesa(estado, rivalPensando) {
    const defesa = estado.defesaTurno;
    const mostrar =
      !estado.encerrada &&
      estado.timeComBola === 'rival' &&
      defesa &&
      defesa.fase === 'aguardando_ordem' &&
      !rivalPensando;

    elBlocoDefesa.hidden = !mostrar;
    if (!mostrar) return;

    const intencao = defesa.intencaoAtual;
    const destinoNome = intencao.receptor
      ? `${intencao.receptor.nomeCurto} (${intencao.zonaDestino})`
      : intencao.zonaDestino;

    const avisoSubRival = estado.ultimaSubstituicaoRival
      ? `<div class="aviso-sub-rival">${estado.ultimaSubstituicaoRival}</div>`
      : '';

    elDefesaIntencaoResumo.innerHTML =
      `${avisoSubRival}` +
      `Intenção do rival: <strong>${intencao.passador.nomeCurto} (${intencao.zonaOrigem}) → ${destinoNome}</strong> · ` +
      `${intencao.calculo.tipo.rotulo} · <strong>${intencao.calculo.chance}%</strong>`;

    const marcador = defesa.marcadorFalta;
    if (marcador) {
      elDescFaltaTatica.textContent =
        `Interrompe e rival reinicia com bola parada (+10% em passes). Amarelo (${marcador.nomeCurto}): ${defesa.chanceAmarelo}%.`;
    }

    for (const btn of botoesOrdem) {
      const ordem = btn.dataset.ordem;
      const plano = avaliarCustoOrdemDefensiva(estado, ordem, defesa);
      btn.disabled = !plano.disponivel;

      const elCusto = document.getElementById(`custo-ordem-${ordem}`);
      const elEnvolvidos = document.getElementById(`envolvidos-ordem-${ordem}`);
      if (elCusto) elCusto.textContent = plano.resumoCusto;
      if (elEnvolvidos) elEnvolvidos.textContent = plano.rotuloEnvolvidos;
    }

    if (elListaOrdensHab) {
      elListaOrdensHab.innerHTML = '';
      const habsDefesa = listarHabilidadesDefensivasTime(estado, 'meuTime', intencao);
      for (const item of habsDefesa) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-ordem-defesa btn-ordem-habilidade';
        if (item.jaUsada) {
          btn.classList.add('habilidade-usada');
        }
        btn.dataset.ordemHab = item.chaveOrdem;
        btn.disabled = !item.disponivel;

        const topo = document.createElement('span');
        topo.className = 'ordem-topo';

        const titulo = document.createElement('strong');
        titulo.textContent = `${item.habilidade.nome} · ${item.jogador.nomeCurto}`;

        const custo = document.createElement('span');
        custo.className = 'ordem-custo';
        custo.textContent = item.jaUsada
          ? 'Usada (0/1)'
          : `−${item.custo} est. · ${item.usosRestantes}/${item.usosTotais}`;

        topo.append(titulo, custo);

        const desc = document.createElement('span');
        desc.className = 'ordem-desc';
        desc.textContent = item.habilidade.descricao;

        const env = document.createElement('span');
        env.className = 'ordem-envolvidos';
        env.textContent = item.disponivel
          ? `Gasta: ${item.jogador.nomeCurto} (${item.estaminaAtual}→${item.estaminaDepois})`
          : item.motivoIndisponivel;

        btn.append(topo, desc, env);
        btn.addEventListener('click', () => {
          if (!btn.disabled) onOrdemDefensiva(item.chaveOrdem);
        });
        elListaOrdensHab.appendChild(btn);
      }
    }
  }

  function renderizarFichaJogador(jogador, timeId, estado, rivalPensando) {
    if (!jogador) {
      elFichaJogador.innerHTML =
        '<p class="texto-suave">Toque em qualquer chip para ver atributos, estamina e substituir.</p>';
      return;
    }

    elFichaJogador.innerHTML = '';

    const nomeTime = estado.times[timeId].nome;
    const cabecalho = document.createElement('div');
    cabecalho.className = 'cabecalho-ficha';

    const elNome = document.createElement('span');
    elNome.className = 'nome-ficha';
    elNome.textContent = jogador.nome;

    const elMeta = document.createElement('span');
    elMeta.className = 'meta-ficha';
    elMeta.textContent = `${jogador.posicao} · ${nomeTime}`;

    cabecalho.append(elNome, elMeta);

    const eficiencia = jogador.zona
      ? Math.round(calcularEficienciaNaZona(jogador, jogador.zona) * 100)
      : 0;
    const estamina = obterEstamina(jogador);
    const faixaFadiga = obterFaixaFadiga(estamina);
    const cartoes = jogador.extras?.cartoes;
    const textoCartao = cartoes?.vermelho
      ? ' · EXPULSO'
      : cartoes?.amarelos > 0
        ? ` · ${cartoes.amarelos} amarelo`
        : '';

    const submeta = document.createElement('div');
    submeta.className = 'submeta-ficha';
    submeta.textContent = jogador.zona
      ? `Zona: ${jogador.zona} (base: ${jogador.zonaBase}) · Efic.: ${eficiencia}%${textoCartao}`
      : `Fora de campo${textoCartao}`;

    const linhaEstamina = document.createElement('div');
    linhaEstamina.className = 'linha-estamina-ficha';

    const txtEstamina = document.createElement('span');
    txtEstamina.className = `texto-estamina-ficha nivel-${faixaFadiga.cor}`;
    txtEstamina.textContent = `Estamina: ${estamina}/100 · Fadiga ${formatarMultiplicador(faixaFadiga.multiplicador)} (${faixaFadiga.rotulo})`;

    const trilhaEst = document.createElement('div');
    trilhaEst.className = 'trilha-estamina-ficha';
    const barraEst = document.createElement('div');
    barraEst.className = `barra-estamina-fill nivel-${faixaFadiga.cor}`;
    barraEst.style.width = `${estamina}%`;
    trilhaEst.appendChild(barraEst);

    linhaEstamina.append(txtEstamina, trilhaEst);

    const grade = document.createElement('div');
    grade.className = 'grade-atributos';

    for (const [chave, rotulo] of ROTULOS_ATRIBUTOS) {
      if (chave === 'defesa' && !jogador.ehGoleiro) continue;
      const baseValor = jogador.atributos[chave];
      const efetivoValor = Math.round(baseValor * faixaFadiga.multiplicador);
      const item = document.createElement('div');
      item.className = 'item-atributo';

      const lbl = document.createElement('span');
      lbl.textContent = rotulo;

      const num = document.createElement('strong');
      num.textContent =
        faixaFadiga.multiplicador < 1
          ? `${efetivoValor} (${baseValor})`
          : String(baseValor);

      item.append(lbl, num);
      grade.appendChild(item);
    }

    elFichaJogador.append(cabecalho, submeta, linhaEstamina, grade);

    const habilidades = obterHabilidadesJogador(jogador);
    const blocoHabs = document.createElement('div');
    blocoHabs.className = 'ficha-habilidades';

    const titHabs = document.createElement('div');
    titHabs.className = 'titulo-subsecao-ficha';
    titHabs.textContent = 'Habilidades especiais';
    blocoHabs.appendChild(titHabs);

    if (habilidades.length === 0) {
      const vazio = document.createElement('p');
      vazio.className = 'texto-suave texto-hab-vazio';
      vazio.textContent = 'Nenhuma habilidade especial.';
      blocoHabs.appendChild(vazio);
    } else {
      const listaHabs = document.createElement('div');
      listaHabs.className = 'lista-habilidades-ficha';

      for (const h of habilidades) {
        const card = document.createElement('div');
        card.className = 'item-habilidade-ficha';
        if (h.tipo === TIPOS_HABILIDADE.ATIVA && (h.usosRestantes ?? 0) <= 0) {
          card.classList.add('habilidade-usada');
        }

        const topoH = document.createElement('div');
        topoH.className = 'topo-habilidade-ficha';

        const nomeH = document.createElement('strong');
        nomeH.textContent = h.nome;

        const metaH = document.createElement('span');
        metaH.className = `badge-tipo-hab ${h.tipo === TIPOS_HABILIDADE.ATIVA ? 'ativa' : 'passiva'}`;
        metaH.textContent =
          h.tipo === TIPOS_HABILIDADE.ATIVA
            ? (h.usosRestantes ?? 0) > 0
              ? `Ativa · −${h.custo} est. · ${h.usosRestantes}/${h.usosTotais}`
              : `Ativa · Usada (0/${h.usosTotais})`
            : 'Passiva';

        topoH.append(nomeH, metaH);

        const descH = document.createElement('div');
        descH.className = 'desc-habilidade-ficha';
        descH.textContent = h.descricao;

        card.append(topoH, descH);
        listaHabs.appendChild(card);
      }

      blocoHabs.appendChild(listaHabs);
    }

    elFichaJogador.appendChild(blocoHabs);

    if (timeId === 'meuTime') {
      const checagem = podeSubstituir(estado, 'meuTime', jogador.id);
      const acoesFicha = document.createElement('div');
      acoesFicha.className = 'acoes-ficha';

      const btnSub = document.createElement('button');
      btnSub.type = 'button';
      btnSub.id = 'btn-abrir-substituicao';
      btnSub.className = 'btn-secundario btn-substituir-ficha';
      btnSub.disabled = !checagem.permitido || rivalPensando || estado.encerrada;
      btnSub.textContent = checagem.permitido
        ? `Substituir ${jogador.nomeCurto} (${checagem.restantesPartida}/${MAX_SUBSTITUICOES_PARTIDA})`
        : `Substituir (${checagem.motivo})`;

      btnSub.addEventListener('click', () => {
        if (!btnSub.disabled && onAbrirSubstituicao) {
          onAbrirSubstituicao(jogador.id);
        }
      });

      acoesFicha.appendChild(btnSub);
      elFichaJogador.appendChild(acoesFicha);
    }
  }

  /**
   * Atualiza o painel de depuração "Detalhes do cálculo":
   * tipo, base, ATAQUE, estamina/fadiga dos envolvidos, pressões, ajustes, chance final e sorteio.
   */
  function renderizarDetalhesCalculo(estado, previaJogada) {
    const fonte = previaJogada
      ? {
          ...previaJogada.calculo,
          acao: previaJogada.acao,
          origemNome: previaJogada.passador.nomeCurto,
          destinoNome: previaJogada.receptor
            ? previaJogada.receptor.nomeCurto
            : previaJogada.zonaDestino,
          zonaOrigem: previaJogada.zonaOrigem,
          zonaDestino: previaJogada.zonaDestino,
          sorteio: null,
          desfecho:
            estado.timeComBola === 'rival'
              ? 'Intenção anunciada'
              : 'Prévia (aguardando confirmação)',
          gastosEstamina: null,
          gastosOrdem: estado.defesaTurno?.gastosOrdem || null,
        }
      : estado.ultimoCalculo;

    if (!fonte) {
      elDetalhesCalculo.innerHTML =
        '<p class="texto-suave">Selecione o portador e um alvo (passe, condução ou finalização) para inspecionar tipo, base, ATAQUE, estamina/fadiga, pressões e sorteio.</p>';
      return;
    }

    const nivel = fonte.classificacao?.nivel || 'arriscado';
    const textoLinha =
      fonte.acao === 'passe'
        ? fonte.zonasIntermediarias && fonte.zonasIntermediarias.length > 0
          ? `Dest. ${fonte.pressaoDestino}% + ½ Interm. (${fonte.zonasIntermediarias.join('/')}: ${fonte.pressaoIntermediaria}%) = ${fonte.pressaoTotal}%`
          : `${fonte.pressaoDestino}% (${fonte.zonaDestino})`
        : '—';

    const textoPortador =
      fonte.acao === 'conduzir'
        ? `${fonte.pressaoDestino}% (${fonte.zonaDestino})`
        : `${fonte.pressaoPortadorOrigem ?? fonte.pressaoDestino}% (${fonte.zonaOrigem})`;

    const linhas = [
      ['Jogada', `${fonte.origemNome} → ${fonte.destinoNome}`],
      ['Tipo', fonte.tipo?.rotulo || fonte.acao],
      ['Base', String(fonte.base)],
      [
        'ATAQUE',
        fonte.acao === 'finalizar'
          ? `${fonte.ataque} (GOL def. ${fonte.defesaGoleiro})`
          : `${fonte.ataque}`,
      ],
    ];

    if (fonte.jogadoresFadiga && fonte.jogadoresFadiga.length > 0) {
      for (const jf of fonte.jogadoresFadiga) {
        linhas.push([
          `Fadiga (${jf.papel || 'Ator'})`,
          `${jf.nome}: est. ${jf.estamina}% (${formatarMultiplicador(jf.multiplicador)})`,
        ]);
      }
    }

    linhas.push(['Pressão portador', textoPortador]);
    if (fonte.acao === 'passe') {
      linhas.push(['Pressão linha', textoLinha]);
    }
    linhas.push(['Peso', String(fonte.peso)]);

    if (fonte.ajustesChance && fonte.ajustesChance.length > 0) {
      const resumoAjustes = fonte.ajustesChance
        .map((a) => `${a.rotulo} ${a.valor > 0 ? '+' : ''}${a.valor}%`)
        .join(', ');
      linhas.push(['Ajustes', resumoAjustes]);
    }

    const habsLista = fonte.habilidadesAplicadas || [];
    linhas.push([
      'Habilidades',
      habsLista.length > 0 ? habsLista.join(' · ') : 'Nenhuma',
    ]);

    linhas.push(['Chance final', `${fonte.chance}%`, `valor-${nivel}`]);
    linhas.push([
      'Sorteio (1–100)',
      fonte.sorteio !== null ? `${fonte.sorteio} → ${fonte.desfecho}` : fonte.desfecho,
    ]);

    if (fonte.gastosEstamina && fonte.gastosEstamina.length > 0) {
      const resumoGastos = fonte.gastosEstamina
        .map((g) => `${g.nome} −${g.custo} (→${g.atual}%)`)
        .join(' · ');
      linhas.push(['Gasto jogada', resumoGastos]);
    }

    if (fonte.gastosOrdem && fonte.gastosOrdem.length > 0) {
      const resumoOrdem = fonte.gastosOrdem
        .slice(0, 3)
        .map((g) => `${g.nome} −${g.gasto} (→${g.atual}%)`)
        .join(' · ');
      const extra =
        fonte.gastosOrdem.length > 3 ? ` +${fonte.gastosOrdem.length - 3}` : '';
      linhas.push(['Gasto defesa', `${resumoOrdem}${extra}`]);
    }

    elDetalhesCalculo.innerHTML = '';
    for (const [rotulo, valor, classeExtra] of linhas) {
      const div = document.createElement('div');
      div.className = 'linha-detalhe';

      const r = document.createElement('span');
      r.className = 'rotulo-detalhe';
      r.textContent = rotulo;

      const v = document.createElement('span');
      v.className = `valor-detalhe ${classeExtra || ''}`.trim();
      v.textContent = valor;

      div.append(r, v);
      elDetalhesCalculo.appendChild(div);
    }
  }

  function renderizarHabilidadesPortador(
    estado,
    portador,
    { portadorSelecionado, habilidadeOfensivaModo, previaJogada, rivalPensando },
  ) {
    if (!elPainelHabPortador) return;
    elPainelHabPortador.innerHTML = '';

    const mostrar =
      portadorSelecionado &&
      !rivalPensando &&
      !estado.encerrada &&
      estado.timeComBola === 'meuTime' &&
      portador;

    if (!mostrar) {
      elPainelHabPortador.hidden = true;
      return;
    }

    const habs = listarHabilidadesOfensivasPortador(estado, portador);
    if (habs.length === 0) {
      elPainelHabPortador.hidden = true;
      return;
    }

    elPainelHabPortador.hidden = false;

    const lbl = document.createElement('span');
    lbl.className = 'rotulo-hab-portador';
    lbl.textContent = 'Habilidades:';
    elPainelHabPortador.appendChild(lbl);

    for (const info of habs) {
      const hab = info.habilidade;
      let chanceTexto = '';
      let temAlvoValido = info.aplicavel;
      let motivoFinal = info.motivoIndisponivel;

      if (hab.efeito?.tipo === 'finalizacao_faixas' && info.aplicavel) {
        const prevChute = avaliarFinalizacao(estado, { habilidadeId: hab.id });
        if (prevChute) {
          chanceTexto = ` · ${prevChute.calculo.chance}%`;
        } else {
          temAlvoValido = false;
        }
      } else if (hab.efeito?.tipo === 'passe_ignora_pressao_destino' && info.aplicavel) {
        const alvosValidos = estado.times.meuTime.jogadores.filter(
          (c) =>
            c.id !== portador.id &&
            !c.extras?.cartoes?.vermelho &&
            c.zona &&
            avaliarPasse(estado, c.id, { habilidadeId: hab.id }),
        );
        if (alvosValidos.length === 0) {
          temAlvoValido = false;
          motivoFinal = 'Sem alvo p/ frente ou longo';
        }
      }

      const disponivelReal = info.disponivel && temAlvoValido;
      const estaAtiva =
        habilidadeOfensivaModo === hab.id ||
        previaJogada?.habilidadeAtiva?.id === hab.id;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-habilidade-ofensiva';
      btn.dataset.habilidadeId = hab.id;
      if (info.jaUsada) btn.classList.add('habilidade-usada');
      if (estaAtiva) btn.classList.add('ativa');
      btn.disabled = !disponivelReal;
      btn.title = disponivelReal
        ? hab.descricao
        : `${hab.descricao} (${motivoFinal || 'Indisponível'})`;

      const nomeSpan = document.createElement('strong');
      nomeSpan.textContent = hab.nome;

      const metaSpan = document.createElement('span');
      metaSpan.className = 'meta-hab-ofensiva';
      if (info.jaUsada) {
        metaSpan.textContent = `Usada (0/${info.usosTotais})`;
      } else if (!disponivelReal) {
        metaSpan.textContent = `−${info.custo} est. · ${motivoFinal}`;
      } else {
        metaSpan.textContent = `−${info.custo} est.${chanceTexto}`;
      }

      btn.append(nomeSpan, metaSpan);
      btn.addEventListener('click', () => {
        if (!btn.disabled && onSelecionarHabilidadeOfensiva) {
          onSelecionarHabilidadeOfensiva(hab.id);
        }
      });

      elPainelHabPortador.appendChild(btn);
    }
  }

  function renderizarBarraAcao(
    estado,
    {
      portadorSelecionado,
      previaJogada,
      rivalPensando,
      habilidadeOfensivaModo,
    },
  ) {
    const portador = obterPortador(estado);
    const podeChutar =
      estado.timeComBola === 'meuTime' &&
      !estado.encerrada &&
      !rivalPensando &&
      portador &&
      podeFinalizarNaZona(portador.zona, 'meuTime');

    renderizarHabilidadesPortador(estado, portador, {
      portadorSelecionado,
      habilidadeOfensivaModo,
      previaJogada,
      rivalPensando,
    });

    if (previaJogada && !rivalPensando && estado.timeComBola === 'meuTime') {
      const c = previaJogada.calculo;
      const tagHab = previaJogada.habilidadeAtiva
        ? `[${previaJogada.habilidadeAtiva.nome}] `
        : '';
      elBarraConfirmacao.dataset.ativo = 'true';

      if (previaJogada.acao === 'passe') {
        elResumoInline.innerHTML = `${tagHab}<strong>${previaJogada.passador.nomeCurto} → ${previaJogada.receptor.nomeCurto}</strong> · ${c.tipo.rotulo} · <strong>${c.chance}%</strong>`;
        elBtnConfirmar.textContent = 'Confirmar Passe';
      } else if (previaJogada.acao === 'conduzir') {
        elResumoInline.innerHTML = `${tagHab}<strong>${previaJogada.passador.nomeCurto}</strong> conduzir até <strong>${previaJogada.zonaDestino}</strong> · <strong>${c.chance}%</strong>`;
        elBtnConfirmar.textContent = 'Confirmar Condução';
      } else {
        elResumoInline.innerHTML = `${tagHab}<strong>${previaJogada.passador.nomeCurto}</strong> finalizar de ${previaJogada.zonaOrigem} · Gol <strong>${c.chance}%</strong>`;
        elBtnConfirmar.textContent = 'Confirmar Finalização';
      }

      elBtnConfirmar.hidden = false;
      elBtnCancelar.hidden = false;
      elBtnFinalizar.hidden = !podeChutar || previaJogada.acao === 'finalizar';
      return;
    }

    elBarraConfirmacao.dataset.ativo = 'false';
    elBtnConfirmar.hidden = true;
    elBtnCancelar.hidden = true;
    elBtnFinalizar.hidden = !podeChutar;

    if (estado.encerrada) {
      elResumoInline.textContent = 'Partida encerrada após 10 turnos para cada lado.';
    } else if (estado.timeComBola === 'rival') {
      const intencao = estado.defesaTurno?.intencaoAtual;
      if (estado.defesaTurno?.fase === 'aguardando_ordem' && intencao) {
        const dest = intencao.receptor ? intencao.receptor.nomeCurto : intencao.zonaDestino;
        elResumoInline.innerHTML = `Rival anuncia: <strong>${intencao.passador.nomeCurto} → ${dest}</strong> (${intencao.calculo.tipo.rotulo}, <strong>${intencao.calculo.chance}%</strong>). Escolha uma ordem defensiva.`;
      } else if (intencao) {
        const dest = intencao.receptor ? intencao.receptor.nomeCurto : intencao.zonaDestino;
        elResumoInline.innerHTML = `Rival executa: <strong>${intencao.passador.nomeCurto} → ${dest}</strong> (${intencao.calculo.chance}%)...`;
      } else {
        elResumoInline.textContent = `${estado.times?.rival?.nome || 'Rival'} está com a bola...`;
      }
    } else if (habilidadeOfensivaModo === 'arrancada' && portador) {
      elResumoInline.innerHTML = `<strong>Arrancada ativa (${portador.nomeCurto})</strong>: toque em uma zona a <strong>2 casas</strong> destacada no campo.`;
    } else if (habilidadeOfensivaModo === 'passe_infiltracao' && portador) {
      elResumoInline.innerHTML = `<strong>Passe de infiltração ativo (${portador.nomeCurto})</strong>: toque em um companheiro à frente ou longo.`;
    } else if (portadorSelecionado && portador) {
      elResumoInline.innerHTML = `<strong>${portador.nomeCurto}</strong> selecionado (${portador.zona}). Toque em um companheiro para passar ou numa zona vizinha para conduzir.`;
    } else if (portador) {
      elResumoInline.innerHTML = `Seu turno: toque em <strong>${portador.nomeCurto} (${portador.posicao})</strong> em ${portador.zona} para jogar.`;
    }
  }

  function desenharLinhaJogada(previa) {
    elSvg.innerHTML = '';
    ultimaPreviaDesenhada = previa || null;
    if (!previa) return;

    const elOrigem = elGradeZonas.querySelector(
      `[data-jogador-id="${previa.passador.id}"]`,
    );
    const elDestino =
      previa.acao === 'passe' && previa.receptor
        ? elGradeZonas.querySelector(`[data-jogador-id="${previa.receptor.id}"]`)
        : elGradeZonas.querySelector(`[data-zona-id="${previa.zonaDestino}"]`);

    if (!elOrigem || !elDestino) return;

    const rectGrade = elGradeZonas.getBoundingClientRect();
    const rectOrigem = elOrigem.getBoundingClientRect();
    const rectDestino = elDestino.getBoundingClientRect();
    if (rectGrade.width === 0 || rectGrade.height === 0) return;

    const cx1 = rectOrigem.left - rectGrade.left + rectOrigem.width / 2;
    const cy1 = rectOrigem.top - rectGrade.top + rectOrigem.height / 2;
    const cx2 = rectDestino.left - rectGrade.left + rectDestino.width / 2;
    const cy2 = rectDestino.top - rectGrade.top + rectDestino.height / 2;

    const dx = cx2 - cx1;
    const dy = cy2 - cy1;
    const dist = Math.hypot(dx, dy) || 1;
    const recuoInicio = Math.min(18, dist * 0.22);
    const recuoFim =
      previa.acao === 'passe' ? Math.min(20, dist * 0.25) : Math.min(12, dist * 0.14);

    const x1 = cx1 + (dx / dist) * recuoInicio;
    const y1 = cy1 + (dy / dist) * recuoInicio;
    const x2 = cx2 - (dx / dist) * recuoFim;
    const y2 = cy2 - (dy / dist) * recuoFim;

    const chance = previa.calculo.chance;
    const nivel = previa.calculo.classificacao.nivel;
    const corLinha =
      nivel === 'seguro' ? '#22C55E' : nivel === 'arriscado' ? '#F59E0B' : '#EF4444';

    const defs = document.createElementNS(SVG_NS, 'defs');
    const marker = document.createElementNS(SVG_NS, 'marker');
    marker.setAttribute('id', 'ponta-seta-jogada');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    const poly = document.createElementNS(SVG_NS, 'path');
    poly.setAttribute('d', 'M 0 1 L 10 5 L 0 9 z');
    poly.setAttribute('fill', corLinha);
    marker.appendChild(poly);
    defs.appendChild(marker);
    elSvg.appendChild(defs);

    const sombra = document.createElementNS(SVG_NS, 'line');
    sombra.setAttribute('x1', String(x1));
    sombra.setAttribute('y1', String(y1));
    sombra.setAttribute('x2', String(x2));
    sombra.setAttribute('y2', String(y2));
    sombra.setAttribute('class', 'linha-jogada-sombra');
    elSvg.appendChild(sombra);

    const linha = document.createElementNS(SVG_NS, 'line');
    linha.setAttribute('x1', String(x1));
    linha.setAttribute('y1', String(y1));
    linha.setAttribute('x2', String(x2));
    linha.setAttribute('y2', String(y2));
    linha.setAttribute('stroke', corLinha);
    linha.setAttribute('marker-end', 'url(#ponta-seta-jogada)');
    linha.setAttribute('class', 'linha-jogada-principal');
    elSvg.appendChild(linha);

    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 - (dist < 110 ? 22 : 0);
    const rotuloTipo = previa.calculo.tipo.rotulo;
    const larguraPlaca = Math.max(84, rotuloTipo.length * 6.4 + 16);
    const alturaPlaca = 34;

    const grupo = document.createElementNS(SVG_NS, 'g');
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(mx - larguraPlaca / 2));
    rect.setAttribute('y', String(my - alturaPlaca / 2));
    rect.setAttribute('width', String(larguraPlaca));
    rect.setAttribute('height', String(alturaPlaca));
    rect.setAttribute('rx', '7');
    rect.setAttribute('stroke', corLinha);
    rect.setAttribute('class', 'placa-porcentagem-rect');
    grupo.appendChild(rect);

    const txtTipo = document.createElementNS(SVG_NS, 'text');
    txtTipo.setAttribute('x', String(mx));
    txtTipo.setAttribute('y', String(my - 7));
    txtTipo.setAttribute('class', 'placa-porcentagem-tipo');
    txtTipo.textContent = rotuloTipo;
    grupo.appendChild(txtTipo);

    const txtPorc = document.createElementNS(SVG_NS, 'text');
    txtPorc.setAttribute('x', String(mx));
    txtPorc.setAttribute('y', String(my + 8));
    txtPorc.setAttribute('class', 'placa-porcentagem-valor');
    txtPorc.textContent = `${chance}%`;
    grupo.appendChild(txtPorc);

    elSvg.appendChild(grupo);
  }

  function renderizar(
    estado,
    {
      portadorSelecionado = false,
      previaJogada = null,
      inspecionadoId = null,
      rivalPensando = false,
      habilidadeOfensivaModo = null,
    } = {},
  ) {
    const uni = estado.times?.meuTime?.uniforme;
    if (elGradeZonas && uni) {
      elGradeZonas.style.setProperty('--meu-bg', uni.corPrincipal || '#163a76');
      elGradeZonas.style.setProperty('--meu-borda', uni.corBorda || 'rgba(147, 197, 253, 0.5)');
      elGradeZonas.style.setProperty('--meu-detalhe', uni.corDetalhe || '#f5b82e');
      elGradeZonas.style.setProperty('--meu-texto', uni.corTexto || '#ffffff');
    }

    renderizarPlacar(estado, rivalPensando);
    renderizarUltimaJogada(estado);
    renderizarPainelDefesa(estado, rivalPensando);
    renderizarBarraAcao(estado, {
      portadorSelecionado,
      previaJogada,
      rivalPensando,
      habilidadeOfensivaModo,
    });
    renderizarDetalhesCalculo(estado, previaJogada);

    const mapaPressaoRival = obterPressaoDefensiva(estado, 'rival');
    const portador = obterPortador(estado);

    const porZona = {};
    for (const zonaId of IDS_ZONAS) porZona[zonaId] = [];

    for (const jogador of estado.times.meuTime.jogadores) {
      if (jogador.zona && !jogador.extras?.cartoes?.vermelho) {
        porZona[jogador.zona]?.push({ jogador, timeId: 'meuTime' });
      }
    }
    for (const jogador of estado.times.rival.jogadores) {
      if (jogador.zona && !jogador.extras?.cartoes?.vermelho) {
        porZona[jogador.zona]?.push({ jogador, timeId: 'rival' });
      }
    }

    const modoArrancada =
      habilidadeOfensivaModo === 'arrancada' &&
      portadorSelecionado &&
      !rivalPensando &&
      !estado.encerrada &&
      estado.timeComBola === 'meuTime';

    const modoInfiltracao =
      habilidadeOfensivaModo === 'passe_infiltracao' &&
      portadorSelecionado &&
      !rivalPensando &&
      !estado.encerrada &&
      estado.timeComBola === 'meuTime';

    for (const zonaId of IDS_ZONAS) {
      const slot = elGradeZonas.querySelector(`[data-zona-slot="${zonaId}"]`);
      if (!slot) continue;

      const infoZona = ZONAS[zonaId];
      const pressaoLinha = mapaPressaoRival[zonaId]?.pressaoLinha ?? 0;
      const pressaoPortador = mapaPressaoRival[zonaId]?.pressaoPortador ?? 0;

      const ehVizinhaConduzivel =
        !modoArrancada &&
        !modoInfiltracao &&
        portadorSelecionado &&
        !rivalPensando &&
        !estado.encerrada &&
        estado.timeComBola === 'meuTime' &&
        portador &&
        saoZonasVizinhos(portador.zona, zonaId) &&
        zonaId !== 'GKR';

      const ehDestinoArrancada =
        modoArrancada &&
        portador &&
        !infoZona.foraDaGrade &&
        obterDistanciaZonas(portador.zona, zonaId) === 2;

      const ehGolAlvo =
        !modoArrancada &&
        !rivalPensando &&
        !estado.encerrada &&
        estado.timeComBola === 'meuTime' &&
        portador &&
        podeFinalizarNaZona(portador.zona, 'meuTime') &&
        zonaId === obterZonaGolAlvo('meuTime');

      const box = document.createElement('div');
      box.className = 'zona-campo';
      box.dataset.zonaId = zonaId;
      box.dataset.pressao = String(pressaoLinha);
      box.dataset.pressaoPortador = String(pressaoPortador);

      if (ehVizinhaConduzivel) box.classList.add('zona-conduzivel');
      if (ehDestinoArrancada) box.classList.add('zona-conduzivel', 'zona-arrancada');
      if (ehGolAlvo) box.classList.add('zona-finalizavel');
      if (
        previaJogada &&
        (previaJogada.acao === 'conduzir' || previaJogada.acao === 'finalizar') &&
        previaJogada.zonaDestino === zonaId
      ) {
        box.classList.add('zona-selecionada');
      }
      if (
        estado.timeComBola === 'rival' &&
        estado.defesaTurno?.intencaoAtual?.zonaDestino === zonaId
      ) {
        box.classList.add('zona-alvo-defesa');
      }

      if (ehVizinhaConduzivel || ehDestinoArrancada || ehGolAlvo) {
        box.addEventListener('click', (evento) => {
          if (evento.target.closest('.chip-jogador')) return;
          onCliqueZona(zonaId);
        });
      }

      // Pinta a zona de vermelho conforme a pressão na linha de passe do rival
      const camada = document.createElement('div');
      camada.className = 'camada-pressao';
      camada.style.setProperty(
        '--opacidade-pressao',
        String(calcularOpacidadePressao(pressaoLinha)),
      );
      box.appendChild(camada);

      const cabecalho = document.createElement('div');
      cabecalho.className = 'cabecalho-zona';

      const titulo = document.createElement('span');
      titulo.className = 'titulo-zona';
      titulo.textContent = infoZona.nome;

      const lblPressao = document.createElement('span');
      lblPressao.className = 'valor-pressao-zona';
      lblPressao.textContent = `P ${pressaoLinha}%`;
      lblPressao.title = `Pressão rival em ${zonaId} — Linha: ${pressaoLinha}% | Portador: ${pressaoPortador}%`;

      cabecalho.append(titulo, lblPressao);
      box.appendChild(cabecalho);

      const lista = document.createElement('div');
      lista.className = 'lista-chips-zona';

      for (const { jogador, timeId } of porZona[zonaId]) {
        const temBola = estado.timeComBola === timeId && estado.portadorId === jogador.id;
        const ehMeu = timeId === 'meuTime';
        const habsJogador = obterHabilidadesJogador(jogador);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `chip-jogador ${ehMeu ? 'time-meu' : 'time-rival'}`;
        btn.dataset.jogadorId = jogador.id;
        btn.dataset.timeId = timeId;

        if (temBola) btn.classList.add('com-bola');
        if (temBola && ehMeu && portadorSelecionado) {
          btn.classList.add('portador-selecionado');
        }
        if (
          portadorSelecionado &&
          ehMeu &&
          !temBola &&
          estado.timeComBola === 'meuTime' &&
          !estado.encerrada
        ) {
          if (modoInfiltracao) {
            if (avaliarPasse(estado, jogador.id, { habilidadeId: 'passe_infiltracao' })) {
              btn.classList.add('alvo-disponivel', 'alvo-infiltracao');
            }
          } else if (!modoArrancada) {
            btn.classList.add('alvo-disponivel');
          }
        }
        if (
          previaJogada &&
          previaJogada.acao === 'passe' &&
          previaJogada.receptor?.id === jogador.id
        ) {
          btn.classList.add('alvo-previa');
        }
        if (inspecionadoId === jogador.id) {
          btn.classList.add('inspecionado');
        }

        const nomeTime = estado.times[timeId].nome;
        const estamina = obterEstamina(jogador);
        const corEstamina = obterCorEstamina(estamina);
        const sufixoBola = temBola ? ', com a bola' : '';
        const sufixoAmarelo =
          jogador.extras?.cartoes?.amarelos > 0 ? ', com cartão amarelo' : '';
        const sufixoHabs =
          habsJogador.length > 0
            ? `, habilidades: ${habsJogador.map((h) => h.nome).join(', ')}`
            : '';

        if (habsJogador.length > 0) {
          btn.title = `Habilidades: ${habsJogador.map((h) => h.nome).join(', ')}`;
        }
        btn.setAttribute(
          'aria-label',
          `${jogador.nomeCurto}, ${jogador.posicao}, ${nomeTime}, zona ${zonaId}, estamina ${estamina}%${sufixoBola}${sufixoAmarelo}${sufixoHabs}`,
        );

        const topoChip = document.createElement('span');
        topoChip.className = 'chip-conteudo-topo';

        if (temBola) {
          topoChip.appendChild(criarIconeBolaSvg());
        }
        if (jogador.extras?.cartoes?.amarelos > 0) {
          const card = document.createElement('span');
          card.className = 'indicador-cartao-amarelo';
          card.setAttribute('aria-hidden', 'true');
          topoChip.appendChild(card);
        }

        const elNome = document.createElement('span');
        elNome.className = 'nome-jogador';
        elNome.textContent = jogador.nomeCurto;

        if (habsJogador.length > 0) {
          topoChip.append(elNome, criarIconeHabilidadeSvg());
        } else {
          topoChip.append(elNome);
        }

        const elPos = document.createElement('span');
        elPos.className = 'pos-jogador';
        elPos.textContent = jogador.posicao;

        topoChip.append(elPos);

        const trilhaEst = document.createElement('span');
        trilhaEst.className = 'barra-estamina-chip';
        trilhaEst.setAttribute('aria-hidden', 'true');

        const barraEst = document.createElement('span');
        barraEst.className = `barra-estamina-fill nivel-${corEstamina}`;
        barraEst.style.width = `${estamina}%`;
        trilhaEst.appendChild(barraEst);

        btn.append(topoChip, trilhaEst);
        btn.addEventListener('click', (evento) => {
          evento.stopPropagation();
          onCliqueJogador(jogador.id, timeId);
        });

        lista.appendChild(btn);
      }

      box.appendChild(lista);

      if (ehDestinoArrancada) {
        const btnAcaoZona = document.createElement('button');
        btnAcaoZona.type = 'button';
        btnAcaoZona.className = 'btn-acao-zona btn-acao-arrancada';
        btnAcaoZona.dataset.acaoZona = zonaId;
        btnAcaoZona.textContent = 'Arrancada';
        btnAcaoZona.setAttribute('aria-label', `Arrancada para ${zonaId}`);
        btnAcaoZona.addEventListener('click', (evento) => {
          evento.stopPropagation();
          onCliqueZona(zonaId);
        });
        box.appendChild(btnAcaoZona);
      } else if (ehVizinhaConduzivel) {
        const btnAcaoZona = document.createElement('button');
        btnAcaoZona.type = 'button';
        btnAcaoZona.className = 'btn-acao-zona';
        btnAcaoZona.dataset.acaoZona = zonaId;
        btnAcaoZona.textContent = 'Conduzir';
        btnAcaoZona.setAttribute('aria-label', `Conduzir bola para ${zonaId}`);
        btnAcaoZona.addEventListener('click', (evento) => {
          evento.stopPropagation();
          onCliqueZona(zonaId);
        });
        box.appendChild(btnAcaoZona);
      } else if (ehGolAlvo) {
        const btnAcaoZona = document.createElement('button');
        btnAcaoZona.type = 'button';
        btnAcaoZona.className = 'btn-acao-zona btn-acao-chute';
        btnAcaoZona.dataset.acaoZona = zonaId;
        btnAcaoZona.textContent = 'Chutar';
        btnAcaoZona.setAttribute('aria-label', 'Finalizar ao gol');
        btnAcaoZona.addEventListener('click', (evento) => {
          evento.stopPropagation();
          onCliqueZona(zonaId);
        });
        box.appendChild(btnAcaoZona);
      }

      slot.innerHTML = '';
      slot.appendChild(box);
    }

    const idFicha = inspecionadoId || estado.portadorId;
    const jogadorMeu = estado.times.meuTime.jogadores.find((j) => j.id === idFicha);
    const jogadorRival = estado.times.rival.jogadores.find((j) => j.id === idFicha);
    if (jogadorMeu) {
      renderizarFichaJogador(jogadorMeu, 'meuTime', estado, rivalPensando);
    } else if (jogadorRival) {
      renderizarFichaJogador(jogadorRival, 'rival', estado, rivalPensando);
    }

    requestAnimationFrame(() => desenharLinhaJogada(previaJogada));
  }

  return {
    renderizar,
    desenharLinhaJogada,
  };
}
