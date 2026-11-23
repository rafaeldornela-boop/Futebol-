/**
 * Renderização das telas de nós da campanha (Escalação, Treino, Mercado, Patrocínio,
 * Evento, Descanso, Fisioterapia, Torcida, Misterioso), Inspetor de Elenco e Fim de Campanha.
 */

import { PAPEIS_433 } from '../dados/formacoes.js';
import { CAMPANHA_CONFIG, METADADOS_NO } from '../campanha/constantes.js';
import {
  ATRIBUTOS_LINHA,
  calcularMediaJogador,
  calcularValorMercadoJogador,
  ROTULOS_ATRIBUTOS,
} from '../campanha/estado.js';
import {
  aplicarEscolhaEvento,
  aplicarTreino,
  calcularValorVendaElenco,
  comprarJogadorMercado,
  concluirMisteriosoDireto,
  escolherPatrocinio,
  gerarOfertasMercado,
  gerarOfertasPatrocinio,
  gerarOpcoesTreinoParaJogador,
  prepararEscalacaoPadrao,
  sairDoMercado,
  sortearEventoCampanha,
  sortearResultadoMisterioso,
  validarEscalacao,
  venderJogadorElenco,
} from '../campanha/nos.js';
import { obterEstamina, obterFaixaFadiga } from '../regras/estamina.js';
import { obterHabilidadesJogador } from '../regras/habilidades.js';

const ROTULOS_PAPEIS = Object.freeze({
  GOL: 'GOL',
  ZAG1: 'ZAG (Cob.)',
  ZAG2: 'ZAG',
  LAT_E: 'LAT E',
  LAT_D: 'LAT D',
  VOL: 'VOL',
  MEI_E: 'MEI E',
  MEI_D: 'MEI D',
  PONTA_E: 'PONTA E',
  PONTA_D: 'PONTA D',
  CA: 'CA',
});

function el(tag, classe, texto) {
  const node = document.createElement(tag);
  if (classe) node.className = classe;
  if (texto !== undefined && texto !== null) node.textContent = String(texto);
  return node;
}

function formatarResumoAttrs(jogador) {
  const a = jogador.atributos;
  if (jogador.ehGoleiro) {
    return `DEF\u00A0${a.defesa} · POS\u00A0${a.posicionamento} · PAS\u00A0${a.passe} · DOM\u00A0${a.dominio}`;
  }
  return `PAS\u00A0${a.passe} · DOM\u00A0${a.dominio} · MAR\u00A0${a.marcacao} · DES\u00A0${a.desarme} · VEL\u00A0${a.velocidade} · FIN\u00A0${a.finalizacao}`;
}

function criarBarraEstaminaElenco(jogador) {
  const est = obterEstamina(jogador);
  const faixa = obterFaixaFadiga(est);
  const wrap = el('div', 'camp-est-wrap');
  const txt = el('span', `camp-est-txt nivel-${faixa.cor} num-tabular`, `Est. ${est}%`);
  const trilha = el('span', 'camp-est-trilha');
  const fill = el('span', `barra-estamina-fill nivel-${faixa.cor}`);
  fill.style.width = `${est}%`;
  trilha.appendChild(fill);
  wrap.append(txt, trilha);
  return wrap;
}

/**
 * Renderiza a tela de Escalação (11 titulares + reservas do elenco) antes da partida.
 */
export function renderizarTelaEscalacao(
  container,
  estado,
  no,
  rival,
  { onEntrarEmCampo, onVoltarMapa } = {},
) {
  const inicial = prepararEscalacaoPadrao(estado.elenco);
  let titularesPorPapel = { ...inicial.titularesPorPapel };
  let papelSelecionado = null;
  let mensagemErro = '';

  const redesenhar = () => {
    container.innerHTML = '';

    const mapaElenco = new Map(estado.elenco.map((j) => [j.id, j]));
    const idsTitulares = new Set(Object.values(titularesPorPapel).filter(Boolean));
    const reservasIds = estado.elenco
      .filter((j) => !j.lesionado && !idsTitulares.has(j.id))
      .slice(0, 7)
      .map((j) => j.id);
    const extrasFora = estado.elenco.filter(
      (j) => !idsTitulares.has(j.id) && !reservasIds.includes(j.id),
    );

    const cabecalho = el('div', 'no-cabecalho');
    const nomeClube = estado.clubeNome || 'Atlético Brisa';
    const dif = estado.dificuldade || 0;
    const nomeTec = estado.tecnicoNome || 'Clássico';
    cabecalho.append(
      el(
        'div',
        'no-tipo-etiqueta',
        no.tipo === 'chefao'
          ? `GRANDE FINAL · CAMADA 12 · NÍVEL ${dif}`
          : `CAMADA ${no.camada} · PARTIDA · NÍVEL ${dif}`,
      ),
      el('h2', 'no-titulo', `${nomeClube} × ${rival.nome}`),
      el(
        'p',
        'no-subtitulo',
        `Força do adversário: ${rival.classificacaoForca} (média ~${Math.round(rival.forcaAlvo)}) · Téc. ${nomeTec}` +
          (estado.moral !== 0
            ? ` · Moral ativa: ${estado.moral > 0 ? `+${estado.moral}` : estado.moral} em todos atributos nesta partida`
            : ''),
      ),
    );

    const barraAcoesTopo = el('div', 'escalacao-barra-acoes');
    const btnAuto = el('button', 'btn-secundario', 'Auto-escalar melhores');
    btnAuto.type = 'button';
    btnAuto.addEventListener('click', () => {
      const auto = prepararEscalacaoPadrao(estado.elenco);
      titularesPorPapel = { ...auto.titularesPorPapel };
      papelSelecionado = null;
      mensagemErro = '';
      redesenhar();
    });

    const dica = el(
      'span',
      'escalacao-dica',
      papelSelecionado
        ? `Selecionado ${ROTULOS_PAPEIS[papelSelecionado]}: toque em outro jogador ou reserva para trocar.`
        : 'Toque em uma vaga titular e depois em um reserva (ou outro titular) para trocar.',
    );

    barraAcoesTopo.append(btnAuto, dica);

    const grade = el('div', 'escalacao-grade');

    // Coluna 1: 11 Titulares (4-3-3)
    const colTitulares = el('div', 'escalacao-coluna');
    colTitulares.appendChild(el('h3', 'escalacao-col-titulo', 'Titulares (4-3-3 · 11 vagas)'));
    const listaTitulares = el('div', 'escalacao-lista');

    for (const papel of PAPEIS_433) {
      const jId = titularesPorPapel[papel];
      const j = mapaElenco.get(jId);
      const selecionado = papelSelecionado === papel;

      const btn = el(
        'button',
        `escalacao-card${selecionado ? ' selecionado' : ''}`,
      );
      btn.type = 'button';
      btn.dataset.papelSlot = papel;

      const topo = el('div', 'escalacao-card-topo');
      topo.append(
        el('span', 'escalacao-papel', ROTULOS_PAPEIS[papel] || papel),
        el('strong', 'escalacao-nome', j ? `${j.nome} (${j.posicao})` : 'Vaga aberta'),
        el('span', 'escalacao-ovr num-tabular', j ? `OVR ${Math.round(calcularMediaJogador(j))}` : '—'),
      );
      btn.appendChild(topo);

      if (j) {
        const sub = el('div', 'escalacao-card-sub');
        sub.append(
          el('span', 'escalacao-attrs', formatarResumoAttrs(j)),
          criarBarraEstaminaElenco(j),
        );
        btn.appendChild(sub);

        const habs = obterHabilidadesJogador(j);
        if (habs.length > 0) {
          btn.appendChild(
            el('div', 'escalacao-habs', `Habilidades: ${habs.map((h) => h.nome).join(' · ')}`),
          );
        }
      }

      btn.addEventListener('click', () => {
        mensagemErro = '';
        if (!papelSelecionado) {
          papelSelecionado = papel;
        } else if (papelSelecionado === papel) {
          papelSelecionado = null;
        } else {
          // Troca dois titulares (respeitando GOL só por GOL)
          const jA = mapaElenco.get(titularesPorPapel[papelSelecionado]);
          const jB = mapaElenco.get(titularesPorPapel[papel]);
          if (Boolean(jA?.ehGoleiro) !== Boolean(jB?.ehGoleiro)) {
            mensagemErro = 'Goleiro só pode trocar por goleiro.';
          } else {
            const temp = titularesPorPapel[papelSelecionado];
            titularesPorPapel[papelSelecionado] = titularesPorPapel[papel];
            titularesPorPapel[papel] = temp;
            papelSelecionado = null;
          }
        }
        redesenhar();
      });

      listaTitulares.appendChild(btn);
    }
    colTitulares.appendChild(listaTitulares);

    // Coluna 2: Banco (até 7) + Outros / Lesionados
    const colBanco = el('div', 'escalacao-coluna');
    colBanco.appendChild(
      el('h3', 'escalacao-col-titulo', `Banco de Reservas (${reservasIds.length}/7)`),
    );
    const listaBanco = el('div', 'escalacao-lista');

    const renderizarCandidatoBanco = (j, ehExtra) => {
      const btn = el(
        'button',
        `escalacao-card${j.lesionado ? ' lesionado' : ''}${ehExtra ? ' nao-relacionado' : ''}`,
      );
      btn.type = 'button';
      btn.disabled = j.lesionado || !papelSelecionado;

      const topo = el('div', 'escalacao-card-topo');
      topo.append(
        el('span', 'escalacao-papel', j.lesionado ? 'LES.' : ehExtra ? 'FORA' : 'RES'),
        el('strong', 'escalacao-nome', `${j.nome} (${j.posicao})`),
        el('span', 'escalacao-ovr num-tabular', `OVR ${Math.round(calcularMediaJogador(j))}`),
      );
      btn.appendChild(topo);

      const sub = el('div', 'escalacao-card-sub');
      sub.append(
        el('span', 'escalacao-attrs', formatarResumoAttrs(j)),
        criarBarraEstaminaElenco(j),
      );
      btn.appendChild(sub);

      const habs = obterHabilidadesJogador(j);
      if (habs.length > 0) {
        btn.appendChild(
          el('div', 'escalacao-habs', `Habilidades: ${habs.map((h) => h.nome).join(' · ')}`),
        );
      }

      btn.addEventListener('click', () => {
        if (!papelSelecionado || j.lesionado) return;
        const precisaGol = papelSelecionado === 'GOL';
        if (Boolean(j.ehGoleiro) !== precisaGol) {
          mensagemErro = precisaGol
            ? 'A vaga de GOL exige um goleiro.'
            : 'Goleiro não pode atuar na linha.';
          redesenhar();
          return;
        }
        titularesPorPapel[papelSelecionado] = j.id;
        papelSelecionado = null;
        mensagemErro = '';
        redesenhar();
      });

      return btn;
    };

    for (const rId of reservasIds) {
      const r = mapaElenco.get(rId);
      if (r) listaBanco.appendChild(renderizarCandidatoBanco(r, false));
    }

    if (extrasFora.length > 0) {
      listaBanco.appendChild(
        el('div', 'escalacao-sep-extras', 'Demais atletas / Lesionados (não vão ao banco)'),
      );
      for (const ex of extrasFora) {
        listaBanco.appendChild(renderizarCandidatoBanco(ex, true));
      }
    }

    colBanco.appendChild(listaBanco);
    grade.append(colTitulares, colBanco);

    const rodape = el('div', 'no-rodape');
    if (mensagemErro) {
      rodape.appendChild(el('p', 'no-aviso-erro', mensagemErro));
    }

    const botoesRodape = el('div', 'no-acoes-rodape');
    if (!no.ehMisterioso && typeof onVoltarMapa === 'function') {
      const btnVoltar = el('button', 'btn-secundario', 'Voltar ao Mapa');
      btnVoltar.type = 'button';
      btnVoltar.addEventListener('click', onVoltarMapa);
      botoesRodape.appendChild(btnVoltar);
    }

    const btnJogar = el('button', 'btn-primario', 'Entrar em Campo');
    btnJogar.type = 'button';
    btnJogar.id = 'btn-entrar-em-campo';
    btnJogar.addEventListener('click', () => {
      const check = validarEscalacao(estado.elenco, titularesPorPapel, reservasIds);
      if (!check.valido) {
        mensagemErro = check.motivo;
        redesenhar();
        return;
      }
      onEntrarEmCampo?.({
        titularesPorPapel,
        reservasIds: check.reservasValidas,
      });
    });

    botoesRodape.appendChild(btnJogar);
    rodape.appendChild(botoesRodape);

    container.append(cabecalho, barraAcoesTopo, grade, rodape);
  };

  redesenhar();
}

/**
 * Renderiza o nó de Treino.
 */
export function renderizarTelaTreino(container, estado, no, { onConcluir } = {}) {
  let jogadorSelecionadoId = estado.elenco[0]?.id || null;
  let feedbackConcluido = '';

  const redesenhar = () => {
    container.innerHTML = '';
    const cab = el('div', 'no-cabecalho');
    cab.append(
      el('div', 'no-tipo-etiqueta', `CAMADA ${no.camada} · TREINO`),
      el('h2', 'no-titulo', METADADOS_NO.treino.tituloTela),
      el('p', 'no-subtitulo', METADADOS_NO.treino.descricao),
    );
    container.appendChild(cab);

    if (feedbackConcluido) {
      const box = el('div', 'no-feedback-box');
      box.appendChild(el('p', 'no-feedback-texto', feedbackConcluido));
      const btn = el('button', 'btn-primario', 'Continuar no Mapa');
      btn.type = 'button';
      btn.addEventListener('click', () => onConcluir?.());
      box.appendChild(btn);
      container.appendChild(box);
      return;
    }

    const layout = el('div', 'treino-layout');

    // Lista de jogadores do elenco
    const colJogadores = el('div', 'escalacao-coluna');
    colJogadores.appendChild(el('h3', 'escalacao-col-titulo', '1. Escolha o jogador'));
    const listaJog = el('div', 'escalacao-lista');

    for (const j of estado.elenco) {
      const habs = obterHabilidadesJogador(j);
      const btn = el(
        'button',
        `escalacao-card${j.id === jogadorSelecionadoId ? ' selecionado' : ''}`,
      );
      btn.type = 'button';
      const topo = el('div', 'escalacao-card-topo');
      topo.append(
        el('span', 'escalacao-papel', j.posicao),
        el('strong', 'escalacao-nome', j.nome),
        el('span', 'escalacao-ovr num-tabular', `Hab ${habs.length}/2`),
      );
      btn.appendChild(topo);
      btn.appendChild(el('div', 'escalacao-attrs', formatarResumoAttrs(j)));
      btn.addEventListener('click', () => {
        jogadorSelecionadoId = j.id;
        redesenhar();
      });
      listaJog.appendChild(btn);
    }
    colJogadores.appendChild(listaJog);

    // 3 opções sorteadas para o jogador selecionado
    const colOpcoes = el('div', 'escalacao-coluna');
    const jogAtual = estado.elenco.find((j) => j.id === jogadorSelecionadoId);
    colOpcoes.appendChild(
      el(
        'h3',
        'escalacao-col-titulo',
        `2. Escolha 1 dos 3 treinos para ${jogAtual?.nomeCurto || ''}`,
      ),
    );
    const listaOpcoes = el('div', 'no-opcoes-lista');
    const opcoes = jogAtual ? gerarOpcoesTreinoParaJogador(estado, no, jogAtual.id) : [];

    for (const op of opcoes) {
      const cardBtn = el('button', 'no-opcao-card');
      cardBtn.type = 'button';
      cardBtn.dataset.treinoOpcao = op.id;
      cardBtn.append(
        el('strong', 'no-opcao-titulo', op.titulo),
        el('span', 'no-opcao-desc', op.descricao),
      );
      cardBtn.addEventListener('click', () => {
        const res = aplicarTreino(estado, no, jogAtual.id, op.id);
        if (res.valido) {
          feedbackConcluido = res.resumo;
          redesenhar();
        }
      });
      listaOpcoes.appendChild(cardBtn);
    }
    colOpcoes.appendChild(listaOpcoes);

    layout.append(colJogadores, colOpcoes);
    container.appendChild(layout);
  };

  redesenhar();
}

/**
 * Renderiza o nó de Mercado (4 jogadores à venda + vender jogadores do elenco por 50%).
 */
export function renderizarTelaMercado(container, estado, no, { onConcluir } = {}) {
  const ofertas = gerarOfertasMercado(estado, no);
  let mensagem = '';

  const redesenhar = () => {
    container.innerHTML = '';
    const mods = estado.modificadoresMeta || {};
    const pctVenda = Math.round(50 * (1 + (mods.bonusVendaMercadoPct || 0)));
    const temDescontoCompra = (mods.fatorPrecoMercado ?? 1) < 1;

    const cab = el('div', 'no-cabecalho');
    cab.append(
      el('div', 'no-tipo-etiqueta', `CAMADA ${no.camada} · MERCADO · CAIXA $${estado.dinheiro}`),
      el('h2', 'no-titulo', METADADOS_NO.mercado.tituloTela),
      el(
        'p',
        'no-subtitulo',
        `Elenco atual: ${estado.elenco.length}/${CAMPANHA_CONFIG.maxElenco} jogadores. Vendas rendem ${pctVenda}% do valor de mercado.` +
          (temDescontoCompra ? ' Desconto de Negociador (−15% nas compras) aplicado.' : ''),
      ),
    );
    container.appendChild(cab);

    if (mensagem) {
      container.appendChild(el('div', 'no-feedback-inline', mensagem));
    }

    const layout = el('div', 'escalacao-grade');

    // Coluna 1: Jogadores disponíveis (4 padrão + N jovens da base)
    const colCompra = el('div', 'escalacao-coluna');
    colCompra.appendChild(
      el('h3', 'escalacao-col-titulo', `Disponíveis para contratação (${ofertas.length})`),
    );
    const listaCompra = el('div', 'escalacao-lista');

    for (const ofe of ofertas) {
      const j = ofe.jogador;
      const card = el(
        'div',
        `mercado-card${ofe.comprado ? ' comprado' : ''}${ofe.ehJovem ? ' jovem-base' : ''}`,
      );
      const topo = el('div', 'escalacao-card-topo');
      topo.append(
        el('span', 'escalacao-papel', ofe.ehJovem ? `${j.posicao} · BASE` : j.posicao),
        el('strong', 'escalacao-nome', j.nome),
        el('span', 'escalacao-ovr num-tabular', `OVR ${ofe.media} · $${ofe.preco}`),
      );
      card.appendChild(topo);
      card.appendChild(el('div', 'escalacao-attrs', formatarResumoAttrs(j)));

      if (ofe.ehJovem) {
        card.appendChild(
          el('div', 'escalacao-habs', 'Promessa da base: ganha +1 em atributo aleatório a cada partida disputada.'),
        );
      }

      const habs = obterHabilidadesJogador(j);
      if (habs.length > 0) {
        card.appendChild(
          el('div', 'escalacao-habs', `Habilidade: ${habs.map((h) => h.nome).join(', ')}`),
        );
      }

      const btnComprar = el(
        'button',
        'btn-primario btn-mercado-acao',
        ofe.comprado ? 'Contratado' : `Contratar ($${ofe.preco})`,
      );
      btnComprar.type = 'button';
      btnComprar.disabled =
        ofe.comprado ||
        estado.dinheiro < ofe.preco ||
        estado.elenco.length >= CAMPANHA_CONFIG.maxElenco;
      btnComprar.addEventListener('click', () => {
        const res = comprarJogadorMercado(estado, no, ofe, ofertas);
        mensagem = res.valido ? res.resumo : res.motivo;
        redesenhar();
      });
      card.appendChild(btnComprar);
      listaCompra.appendChild(card);
    }
    colCompra.appendChild(listaCompra);

    // Coluna 2: Vender jogador do elenco
    const colVenda = el('div', 'escalacao-coluna');
    colVenda.appendChild(
      el('h3', 'escalacao-col-titulo', `Seu elenco (${estado.elenco.length}/18 · venda por ${pctVenda}%)`),
    );
    const listaVenda = el('div', 'escalacao-lista');

    const totalGoleiros = estado.elenco.filter((x) => x.ehGoleiro).length;
    for (const j of estado.elenco) {
      const valorVenda = calcularValorVendaElenco(estado, j);
      const card = el('div', 'mercado-card');
      const topo = el('div', 'escalacao-card-topo');
      topo.append(
        el('span', 'escalacao-papel', j.ehJovem ? `${j.posicao} · BASE` : j.posicao),
        el('strong', 'escalacao-nome', `${j.nome}${j.lesionado ? ' (Les.)' : ''}`),
        el('span', 'escalacao-ovr num-tabular', `OVR ${Math.round(calcularMediaJogador(j))}`),
      );
      card.appendChild(topo);

      const btnVender = el(
        'button',
        'btn-secundario btn-mercado-acao',
        `Vender (+$${valorVenda})`,
      );
      btnVender.type = 'button';
      btnVender.disabled =
        estado.elenco.length <= CAMPANHA_CONFIG.minElenco ||
        (j.ehGoleiro && totalGoleiros <= 1);
      btnVender.addEventListener('click', () => {
        const res = venderJogadorElenco(estado, j.id);
        mensagem = res.valido ? res.resumo : res.motivo;
        redesenhar();
      });
      card.appendChild(btnVender);
      listaVenda.appendChild(card);
    }
    colVenda.appendChild(listaVenda);

    layout.append(colCompra, colVenda);
    container.appendChild(layout);

    const rodape = el('div', 'no-rodape');
    const btnSair = el('button', 'btn-primario', 'Concluir Mercado e Voltar ao Mapa');
    btnSair.type = 'button';
    btnSair.addEventListener('click', () => {
      sairDoMercado(estado, no, mensagem || 'Janela de transferências concluída.');
      onConcluir?.();
    });
    rodape.appendChild(btnSair);
    container.appendChild(rodape);
  };

  redesenhar();
}

/**
 * Renderiza o nó de Patrocínio (2 ofertas).
 */
export function renderizarTelaPatrocinio(container, estado, no, { onConcluir } = {}) {
  const ofertas = gerarOfertasPatrocinio(estado, no);
  let feedback = '';

  const redesenhar = () => {
    container.innerHTML = '';
    const cab = el('div', 'no-cabecalho');
    cab.append(
      el('div', 'no-tipo-etiqueta', `CAMADA ${no.camada} · PATROCÍNIO`),
      el('h2', 'no-titulo', METADADOS_NO.patrocinio.tituloTela),
      el('p', 'no-subtitulo', METADADOS_NO.patrocinio.descricao),
    );
    container.appendChild(cab);

    if (feedback) {
      const box = el('div', 'no-feedback-box');
      box.appendChild(el('p', 'no-feedback-texto', feedback));
      const btn = el('button', 'btn-primario', 'Continuar no Mapa');
      btn.type = 'button';
      btn.addEventListener('click', () => onConcluir?.());
      box.appendChild(btn);
      container.appendChild(box);
      return;
    }

    const grade = el('div', 'no-opcoes-duplas');
    for (const ofe of ofertas) {
      const card = el('div', 'no-oferta-card');
      card.append(
        el('strong', 'no-opcao-titulo', ofe.nome),
        el('p', 'no-opcao-desc', ofe.descricao),
      );
      const btn = el('button', 'btn-primario', 'Assinar Contrato');
      btn.type = 'button';
      btn.addEventListener('click', () => {
        const res = escolherPatrocinio(estado, no, ofe.id);
        if (res.valido) {
          feedback = res.resumo;
          redesenhar();
        }
      });
      card.appendChild(btn);
      grade.appendChild(card);
    }
    container.appendChild(grade);
  };

  redesenhar();
}

/**
 * Renderiza um Evento (sorteado diretamente ou via nó Misterioso).
 */
export function renderizarTelaEvento(
  container,
  estado,
  no,
  eventoForcado = null,
  { onConcluir } = {},
) {
  const evento = eventoForcado || sortearEventoCampanha(estado, no);
  let feedback = '';
  let erro = '';

  const redesenhar = () => {
    container.innerHTML = '';
    const cab = el('div', 'no-cabecalho');
    cab.append(
      el('div', 'no-tipo-etiqueta', `CAMADA ${no.camada} · EVENTO · CAIXA $${estado.dinheiro}`),
      el('h2', 'no-titulo', evento.titulo),
      el('p', 'no-subtitulo', evento.descricao),
    );
    container.appendChild(cab);

    if (feedback) {
      const box = el('div', 'no-feedback-box');
      box.appendChild(el('p', 'no-feedback-texto', feedback));
      const btn = el('button', 'btn-primario', 'Continuar no Mapa');
      btn.type = 'button';
      btn.addEventListener('click', () => onConcluir?.());
      box.appendChild(btn);
      container.appendChild(box);
      return;
    }

    if (erro) {
      container.appendChild(el('p', 'no-aviso-erro', erro));
    }

    const lista = el('div', 'no-opcoes-lista');
    for (const esc of evento.escolhas) {
      const btn = el('button', 'no-opcao-card');
      btn.type = 'button';
      btn.append(
        el('strong', 'no-opcao-titulo', esc.rotulo),
        el('span', 'no-opcao-consequencia', esc.consequencia),
      );
      btn.addEventListener('click', () => {
        const res = aplicarEscolhaEvento(estado, no, evento, esc.id);
        if (!res.valido) {
          erro = res.motivo;
          redesenhar();
          return;
        }
        feedback = res.resumo;
        erro = '';
        redesenhar();
      });
      lista.appendChild(btn);
    }
    container.appendChild(lista);
  };

  redesenhar();
}

/**
 * Renderiza nós de resolução simples (Descanso Total, Fisioterapia, Torcida, Misterioso).
 */
export function renderizarTelaSimples(
  container,
  no,
  titulo,
  subtitulo,
  resumoResultado,
  { onConcluir } = {},
) {
  container.innerHTML = '';
  const cab = el('div', 'no-cabecalho');
  cab.append(
    el('div', 'no-tipo-etiqueta', `CAMADA ${no.camada} · ${METADADOS_NO[no.tipo]?.nome.toUpperCase() || ''}`),
    el('h2', 'no-titulo', titulo),
    el('p', 'no-subtitulo', subtitulo),
  );

  const box = el('div', 'no-feedback-box');
  box.appendChild(el('p', 'no-feedback-texto', resumoResultado));
  const btn = el('button', 'btn-primario', 'Continuar no Mapa');
  btn.type = 'button';
  btn.addEventListener('click', () => onConcluir?.());
  box.appendChild(btn);

  container.append(cab, box);
}

/**
 * Resolve e renderiza o nó Misterioso (?).
 */
export function renderizarTelaMisterioso(
  container,
  estado,
  no,
  { onConcluir, onIniciarPartidaSurpresa } = {},
) {
  const desfecho = sortearResultadoMisterioso(estado, no);

  if (desfecho.tipo === 'evento') {
    renderizarTelaEvento(container, estado, no, desfecho.evento, { onConcluir });
    return;
  }

  if (desfecho.tipo === 'partida') {
    container.innerHTML = '';
    const cab = el('div', 'no-cabecalho');
    cab.append(
      el('div', 'no-tipo-etiqueta', `CAMADA ${no.camada} · NÓ MISTERIOSO`),
      el('h2', 'no-titulo', desfecho.titulo),
      el('p', 'no-subtitulo', desfecho.descricao),
    );
    const box = el('div', 'no-feedback-box');
    box.appendChild(
      el(
        'p',
        'no-feedback-texto',
        'Prepare a escalação para enfrentar o adversário de força média!',
      ),
    );
    const btn = el('button', 'btn-primario', 'Ir para Escalação');
    btn.type = 'button';
    btn.addEventListener('click', () =>
      onIniciarPartidaSurpresa?.(desfecho.forcaPersonalizada),
    );
    box.appendChild(btn);
    container.append(cab, box);
    return;
  }

  const res = concluirMisteriosoDireto(estado, no, desfecho);
  renderizarTelaSimples(
    container,
    no,
    desfecho.titulo,
    desfecho.descricao,
    res.resumo,
    { onConcluir },
  );
}

/**
 * Preenche o modal de inspeção completa do elenco (acessível do mapa).
 */
export function renderizarModalElenco(container, estado) {
  container.innerHTML = '';
  for (const j of estado.elenco) {
    const habs = obterHabilidadesJogador(j);
    const valor = calcularValorMercadoJogador(j);

    const card = el('div', `elenco-insp-card${j.lesionado ? ' lesionado' : ''}`);
    const topo = el('div', 'escalacao-card-topo');
    topo.append(
      el('span', 'escalacao-papel', j.ehJovem ? `${j.posicao} · BASE` : j.posicao),
      el('strong', 'escalacao-nome', `${j.nome}${j.lesionado ? ' · LESIONADO' : ''}`),
      el(
        'span',
        'escalacao-ovr num-tabular',
        `OVR ${Math.round(calcularMediaJogador(j))} · $${valor}`,
      ),
    );
    card.append(topo, criarBarraEstaminaElenco(j));

    const gradeAttrs = el('div', 'elenco-insp-attrs');
    const chaves = j.ehGoleiro
      ? ['defesa', 'posicionamento', 'passe', 'dominio', 'interceptacao']
      : ATRIBUTOS_LINHA;
    for (const c of chaves) {
      const item = el('span', 'elenco-insp-attr num-tabular', `${ROTULOS_ATRIBUTOS[c].slice(0, 3).toUpperCase()} ${j.atributos[c]}`);
      gradeAttrs.appendChild(item);
    }
    card.appendChild(gradeAttrs);

    if (habs.length > 0) {
      card.appendChild(
        el('div', 'escalacao-habs', `Habilidades: ${habs.map((h) => h.nome).join(' · ')}`),
      );
    }

    container.appendChild(card);
  }
}

/**
 * Renderiza a tela de Fim de Campanha (Vitória ou Demissão) com resumo dos Pontos de Legado.
 */
export function renderizarTelaFimCampanha(estado, resultadoMeta = null) {
  const elTitulo = document.getElementById('fim-camp-titulo');
  const elSubtitulo = document.getElementById('fim-camp-subtitulo');
  const elStats = document.getElementById('fim-camp-stats');
  const elLegado = document.getElementById('fim-camp-legado');
  const elHistorico = document.getElementById('fim-camp-historico');

  if (!estado) return;

  if (elTitulo) {
    elTitulo.textContent =
      estado.status === 'vitoria' ? 'Campeão da Temporada!' : 'Fim da Campanha';
    elTitulo.dataset.vitoria = estado.status === 'vitoria' ? 'true' : 'false';
  }
  if (elSubtitulo) {
    elSubtitulo.textContent = estado.motivoFim || '';
  }

  if (elStats) {
    elStats.innerHTML = '';
    const itens = [
      { valor: `${estado.clubeSigla || 'BRI'} · Nív. ${estado.dificuldade || 0}`, rotulo: 'Clube / Dif.' },
      { valor: `${estado.vitorias}-${estado.empates}-${estado.derrotas}`, rotulo: 'V-E-D' },
      { valor: `$${estado.dinheiro}`, rotulo: 'Caixa Final' },
      { valor: `${estado.nosVisitados.length}/${CAMPANHA_CONFIG.totalCamadas}`, rotulo: 'Camadas' },
    ];
    for (const it of itens) {
      const card = el('div', 'stat-final-item');
      card.append(
        el('span', 'stat-final-valor', it.valor),
        el('span', 'stat-final-rotulo', it.rotulo),
      );
      elStats.appendChild(card);
    }
  }

  if (elLegado) {
    elLegado.innerHTML = '';
    const legado = resultadoMeta?.pontos || resultadoMeta?.legado;
    const desb = resultadoMeta?.desbloqueios || resultadoMeta;
    if (legado) {
      elLegado.hidden = false;
      const cabLegado = el('div', 'legado-resumo-topo');
      cabLegado.append(
        el('strong', 'legado-resumo-titulo', 'Pontos de Legado Ganhos'),
        el('span', 'legado-resumo-total num-tabular', `+${legado.total} pts`),
      );
      elLegado.appendChild(cabLegado);

      const p = legado.parcelas || {};
      const listaDet = el('div', 'legado-resumo-detalhes num-tabular');
      const linhas = [
        `Camadas completadas (${legado.camadasCompletadas} × 2): +${p.camadas ?? 0}`,
        `Vitórias (${legado.vitorias} × 3): +${p.vitorias ?? 0}`,
        `Empates (${legado.empates} × 1): +${p.empates ?? 0}`,
        `Chefão (${legado.venceuChefao ? 'Vencido' : 'Não vencido'}): +${p.chefao ?? 0}`,
        `Dificuldade (Nível ${legado.dificuldade} × 5): +${p.dificuldade ?? 0}`,
      ];
      for (const l of linhas) {
        listaDet.appendChild(el('span', 'legado-linha', l));
      }
      elLegado.appendChild(listaDet);

      const novaDif = desb?.desbloqueouDificuldade ?? null;
      if (novaDif !== null && novaDif !== undefined) {
        elLegado.appendChild(
          el(
            'div',
            'legado-alerta-extra',
            `🔓 Dificuldade Nível ${novaDif} desbloqueada!`,
          ),
        );
      }
      if (desb?.trofeu) {
        elLegado.appendChild(
          el(
            'div',
            'legado-alerta-extra',
            `🏆 Troféu registrado na Sala de Troféus (${desb.trofeu.placarChefao}).`,
          ),
        );
      }
      if (desb?.novasConquistas && desb.novasConquistas.length > 0) {
        elLegado.appendChild(
          el(
            'div',
            'legado-alerta-extra',
            `★ Nova(s) conquista(s): ${desb.novasConquistas.map((c) => c.nome).join(', ')}`,
          ),
        );
      }
    } else {
      elLegado.hidden = true;
    }
  }

  if (elHistorico) {
    elHistorico.innerHTML = '';
    for (const h of [...(estado.historico || [])].reverse()) {
      const item = el('div', 'camp-historico-item');
      item.append(
        el('div', 'camp-historico-topo', `Camada ${h.camada} · ${METADADOS_NO[h.tipo]?.nome || h.tipo}`),
        el('div', 'camp-historico-desc', h.resumo || ''),
      );
      elHistorico.appendChild(item);
    }
  }
}
