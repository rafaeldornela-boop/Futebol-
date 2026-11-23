import test from 'node:test';
import assert from 'node:assert/strict';

import {
  espelharZona,
  IDS_ZONAS,
  IDS_ZONAS_GRADE,
  obterDistanciaZonas,
  obterFaixa,
  obterZonasIntermediarias,
  podeFinalizarNaZona,
  saoZonasVizinhos,
  ZONAS,
} from '../js/dados/zonas.js';
import {
  obterFaseParaTime,
  obterZonaBaseJogador,
} from '../js/dados/formacoes.js';
import {
  calcularChanceConducao,
  calcularChanceFinalizacao,
  calcularChancePasse,
  calcularMapaPressao,
  calcularPressaoZona,
  CHANCE_MAXIMA,
  CHANCE_MINIMA,
  classificarTipoPasse,
  FINALIZACAO_CHANCE_MAXIMA,
  FINALIZACAO_CHANCE_MINIMA,
} from '../js/regras/calculo.js';
import {
  anunciarIntencaoRival,
  aplicarOrdemDefensiva,
  avaliarConducao,
  avaliarFinalizacao,
  avaliarPasse,
  criarPartida,
  executarConducao,
  executarFinalizacao,
  executarJogada,
  executarPasse,
  fazerSubstituicao,
  TURNOS_POR_LADO,
} from '../js/regras/partida.js';
import {
  avaliarCustoOrdemDefensiva,
} from '../js/regras/defesa.js';
import {
  gastarEstamina,
  obterAtributoEfetivo,
  obterAtributoEfetivoComBonus,
  obterEstamina,
  obterMultiplicadorFadiga,
} from '../js/regras/estamina.js';
import {
  MAX_SUBSTITUICOES_PARTIDA,
  podeSubstituir,
  verificarSubstituicaoAutomaticaRival,
} from '../js/regras/substituicao.js';
import {
  LISTA_HABILIDADES,
  obterDefinicaoHabilidade,
} from '../js/dados/habilidades.js';
import {
  avaliarHabilidadeOfensivaPortador,
  listarHabilidadesDefensivasTime,
  obterHabilidadesJogador,
} from '../js/regras/habilidades.js';
import {
  escolherJogadaRival,
  PROBABILIDADE_HABILIDADE_RIVAL,
} from '../js/rival/ia.js';

test('campo vertical possui 15 zonas + GK e GKR, vizinhança diagonal, distância Chebyshev e espelho', () => {
  assert.equal(IDS_ZONAS_GRADE.length, 15);
  assert.equal(IDS_ZONAS.length, 17);

  // Vizinhança simétrica e GK/GKR tocando faixas 1 e 5 inteiras
  for (const z of IDS_ZONAS) {
    for (const v of ZONAS[z].vizinhos) {
      assert.equal(saoZonasVizinhos(v, z), true, `${v} deve ser vizinha de ${z}`);
    }
  }
  assert.deepEqual([...ZONAS.GK.vizinhos].sort(), ['Z1-C', 'Z1-D', 'Z1-E']);
  assert.deepEqual([...ZONAS.GKR.vizinhos].sort(), ['Z5-C', 'Z5-D', 'Z5-E']);
  assert.equal(saoZonasVizinhos('Z2-E', 'Z3-C'), true); // diagonal

  // Distância = max(|df|, |dc|)
  assert.equal(obterDistanciaZonas('GK', 'Z1-E'), 1);
  assert.equal(obterDistanciaZonas('GK', 'Z2-D'), 2);
  assert.equal(obterDistanciaZonas('GK', 'GKR'), 6);
  assert.equal(obterDistanciaZonas('Z1-E', 'Z1-D'), 2);

  // Espelho: faixa -> 6 - faixa, E <-> D
  assert.equal(espelharZona('GK'), 'GKR');
  assert.equal(espelharZona('Z1-E'), 'Z5-D');
  assert.equal(espelharZona('Z2-C'), 'Z4-C');
  assert.equal(obterFaixa('Z5-D', 'rival'), 1);

  // Zonas intermediárias para longo e invertido
  assert.deepEqual(obterZonasIntermediarias('Z2-E', 'Z2-D', 'invertido', 'meuTime'), ['Z2-C']);
  assert.deepEqual(obterZonasIntermediarias('Z1-C', 'Z3-C', 'longo', 'meuTime'), ['Z2-C']);
});

test('formação 4-3-3 posiciona por fase, aplica balanço do lateral oposto e espelha para rival', () => {
  assert.equal(obterFaseParaTime('Z1-C', 'meuTime'), 'atras');
  assert.equal(obterFaseParaTime('Z2-D', 'meuTime'), 'atras');
  assert.equal(obterFaseParaTime('Z3-E', 'meuTime'), 'meio');
  assert.equal(obterFaseParaTime('Z4-C', 'meuTime'), 'frente');
  assert.equal(obterFaseParaTime('Z5-E', 'rival'), 'atras');

  const latE = { papel: 'LAT_E' };
  const latD = { papel: 'LAT_D' };
  // Bola na frente em Z4-E -> lateral E sobe para Z3-E, lateral oposto (D) limitado à faixa 2 (Z2-D)
  assert.equal(obterZonaBaseJogador(latE, 'Z4-E', 'meuTime'), 'Z3-E');
  assert.equal(obterZonaBaseJogador(latD, 'Z4-E', 'meuTime'), 'Z2-D');

  // Espelhamento para o rival com bola na frente dele (Z2-C -> Z4-C do rival)
  const zag1 = { papel: 'ZAG1' };
  const gol = { papel: 'GOL' };
  assert.equal(obterZonaBaseJogador(zag1, 'Z2-C', 'rival'), 'Z5-C');
  assert.equal(obterZonaBaseJogador(gol, 'Z2-C', 'rival'), 'GKR');
});

test('pressão dupla (portador e linha de passe) varia de 0 a 100 e ignora expulsos', () => {
  const partida = criarPartida();
  const mapa = calcularMapaPressao(partida.times.rival.jogadores);
  for (const z of IDS_ZONAS) {
    assert.ok(mapa[z].pressaoPortador >= 0 && mapa[z].pressaoPortador <= 100);
    assert.ok(mapa[z].pressaoLinha >= 0 && mapa[z].pressaoLinha <= 100);
  }

  // Jogador expulso deixa de contar na pressão
  const copia = structuredClone(partida.times.rival.jogadores);
  const antes = calcularPressaoZona(copia, 'Z3-C').pressaoLinha;
  copia.find((j) => j.papel === 'VOL').extras.cartoes.vermelho = true;
  const depois = calcularPressaoZona(copia, 'Z3-C').pressaoLinha;
  assert.ok(depois < antes);
});

test('passes: curto + coerência trás >= lateral >= frente >= longo >= invertido com mesma pressão', () => {
  const passadorBase = {
    id: 'p',
    atributos: { passe: 75, dominio: 75, posicionamento: 75, velocidade: 75 },
  };
  const receptorBase = {
    id: 'r',
    atributos: { passe: 70, dominio: 75, posicionamento: 75, velocidade: 75 },
  };

  for (const pUniforme of [0, 25, 50, 75, 100]) {
    const mapa = {};
    for (const z of IDS_ZONAS) {
      mapa[z] = { pressaoPortador: pUniforme, pressaoLinha: pUniforme };
    }

    const cCurto = calcularChancePasse({
      passador: { ...passadorBase, zona: 'Z2-C', zonaBase: 'Z2-C' },
      receptor: { ...receptorBase, zona: 'Z2-C', zonaBase: 'Z2-C' },
      defensores: [],
      timeId: 'meuTime',
      mapaPressao: mapa,
    });
    const cTras = calcularChancePasse({
      passador: { ...passadorBase, zona: 'Z2-C', zonaBase: 'Z2-C' },
      receptor: { ...receptorBase, zona: 'Z1-C', zonaBase: 'Z1-C' },
      defensores: [],
      timeId: 'meuTime',
      mapaPressao: mapa,
    });
    const cLateral = calcularChancePasse({
      passador: { ...passadorBase, zona: 'Z2-C', zonaBase: 'Z2-C' },
      receptor: { ...receptorBase, zona: 'Z2-E', zonaBase: 'Z2-E' },
      defensores: [],
      timeId: 'meuTime',
      mapaPressao: mapa,
    });
    const cFrente = calcularChancePasse({
      passador: { ...passadorBase, zona: 'Z2-C', zonaBase: 'Z2-C' },
      receptor: { ...receptorBase, zona: 'Z3-C', zonaBase: 'Z3-C' },
      defensores: [],
      timeId: 'meuTime',
      mapaPressao: mapa,
    });
    const cLongo = calcularChancePasse({
      passador: { ...passadorBase, zona: 'Z1-C', zonaBase: 'Z1-C' },
      receptor: { ...receptorBase, zona: 'Z3-C', zonaBase: 'Z3-C' },
      defensores: [],
      timeId: 'meuTime',
      mapaPressao: mapa,
    });
    const cInvertido = calcularChancePasse({
      passador: { ...passadorBase, zona: 'Z2-E', zonaBase: 'Z2-E' },
      receptor: { ...receptorBase, zona: 'Z2-D', zonaBase: 'Z2-D' },
      defensores: [],
      timeId: 'meuTime',
      mapaPressao: mapa,
    });

    assert.equal(cCurto.tipo.id, 'curto');
    assert.equal(cTras.tipo.id, 'tras');
    assert.equal(cLateral.tipo.id, 'lateral');
    assert.equal(cFrente.tipo.id, 'frente');
    assert.equal(cLongo.tipo.id, 'longo');
    assert.equal(cInvertido.tipo.id, 'invertido');

    assert.ok(
      cTras.chance >= cLateral.chance &&
        cLateral.chance >= cFrente.chance &&
        cFrente.chance >= cLongo.chance &&
        cLongo.chance >= cInvertido.chance,
      `Coerência quebrada com P=${pUniforme}: trás=${cTras.chance}, lateral=${cLateral.chance}, frente=${cFrente.chance}, longo=${cLongo.chance}, inv=${cInvertido.chance}`,
    );
  }

  assert.equal(classificarTipoPasse('Z4-E', 'Z2-D', 'meuTime').id, 'invertido');
});

test('condução e finalização (faixa 5 e Z4-C chute de fora) respeitam fórmulas e limites', () => {
  const partida = criarPartida();
  const portador = partida.times.meuTime.jogadores.find((j) => j.id === partida.portadorId);

  const cond = calcularChanceConducao({
    portador,
    zonaDestino: 'Z2-C',
    defensores: partida.times.rival.jogadores,
    timeId: 'meuTime',
  });
  assert.ok(cond && cond.chance >= CHANCE_MINIMA && cond.chance <= CHANCE_MAXIMA);
  assert.equal(
    calcularChanceConducao({
      portador,
      zonaDestino: 'Z4-C',
      defensores: partida.times.rival.jogadores,
      timeId: 'meuTime',
    }),
    null,
  );

  assert.equal(podeFinalizarNaZona('Z5-C', 'meuTime'), true);
  assert.equal(podeFinalizarNaZona('Z5-E', 'meuTime'), true);
  assert.equal(podeFinalizarNaZona('Z4-C', 'meuTime'), true);
  assert.equal(podeFinalizarNaZona('Z4-E', 'meuTime'), false);

  const goleiroRival = partida.times.rival.jogadores.find((j) => j.ehGoleiro);
  const chuteZ5C = calcularChanceFinalizacao({
    atacante: { zona: 'Z5-C', atributos: { finalizacao: 88, tecnica: 80 } },
    goleiro: goleiroRival,
    defensores: partida.times.rival.jogadores,
    timeId: 'meuTime',
  });
  const chuteZ5E = calcularChanceFinalizacao({
    atacante: { zona: 'Z5-E', atributos: { finalizacao: 88, tecnica: 80 } },
    goleiro: goleiroRival,
    defensores: partida.times.rival.jogadores,
    timeId: 'meuTime',
  });
  const chuteZ4C = calcularChanceFinalizacao({
    atacante: { zona: 'Z4-C', atributos: { finalizacao: 88, tecnica: 80 } },
    goleiro: goleiroRival,
    defensores: partida.times.rival.jogadores,
    timeId: 'meuTime',
  });

  assert.ok(chuteZ5C.chance > chuteZ5E.chance && chuteZ5E.chance > chuteZ4C.chance);
  for (const c of [chuteZ5C, chuteZ5E, chuteZ4C]) {
    assert.ok(c.chance >= FINALIZACAO_CHANCE_MINIMA && c.chance <= FINALIZACAO_CHANCE_MAXIMA);
  }
});

test('estamina e fadiga: multiplicadores (1.00, 0.92, 0.82, 0.70) afetam atributos, pressão e chances', () => {
  assert.equal(obterMultiplicadorFadiga(100), 1.0);
  assert.equal(obterMultiplicadorFadiga(70), 1.0);
  assert.equal(obterMultiplicadorFadiga(69), 0.92);
  assert.equal(obterMultiplicadorFadiga(40), 0.92);
  assert.equal(obterMultiplicadorFadiga(39), 0.82);
  assert.equal(obterMultiplicadorFadiga(20), 0.82);
  assert.equal(obterMultiplicadorFadiga(19), 0.7);
  assert.equal(obterMultiplicadorFadiga(0), 0.7);

  const pInteiro = criarPartida();
  const pCansado = criarPartida();
  const mInteiro = pInteiro.times.meuTime.jogadores.find((j) => j.id === 'm2');
  const mCansado = pCansado.times.meuTime.jogadores.find((j) => j.id === 'm2');
  const rInteiro = pInteiro.times.meuTime.jogadores.find((j) => j.id === 'm8');
  const rCansado = pCansado.times.meuTime.jogadores.find((j) => j.id === 'm8');

  mCansado.extras.estamina = 15; // x0.70
  rCansado.extras.estamina = 30; // x0.82

  assert.equal(obterAtributoEfetivo(mCansado, 'passe'), mInteiro.atributos.passe * 0.7);

  const chanceInteiro = avaliarPasse(pInteiro, rInteiro.id).calculo.chance;
  const chanceCansado = avaliarPasse(pCansado, rCansado.id).calculo.chance;
  assert.ok(chanceCansado < chanceInteiro);

  // Fadiga reduz pressão defensiva do time
  const antesPressao = calcularPressaoZona(pInteiro.times.rival.jogadores, 'Z3-C').pressaoLinha;
  for (const r of pCansado.times.rival.jogadores) {
    r.extras.estamina = 15;
  }
  const depoisPressao = calcularPressaoZona(pCansado.times.rival.jogadores, 'Z3-C').pressaoLinha;
  assert.ok(depoisPressao < antesPressao);
});

test('custo de estamina das jogadas (mesmo em falha) e deslocamento de faixa no início do turno', () => {
  const p = criarPartida();
  const passador = p.times.meuTime.jogadores.find((j) => j.id === p.portadorId); // Murilo ZAG1 em Z1-C
  const receptorFrente = p.times.meuTime.jogadores.find((j) => j.papel === 'MEI_E'); // Caio em Z2-E

  const previaFrente = avaliarPasse(p, receptorFrente.id);
  assert.equal(previaFrente.calculo.tipo.id, 'frente');

  // Mesmo falhando (sorteio = 100 -> interceptação), cobra passe para frente (3 / 2)
  const execFalha = executarJogada(p, previaFrente, () => 0.99);
  assert.equal(execFalha.resultado.tipo, 'interceptacao');
  assert.equal(obterEstamina(passador), 97); // 100 - 3
  assert.equal(obterEstamina(receptorFrente), 98); // 100 - 2

  // Verifica passe curto (2 / 1)
  const p2 = criarPartida();
  const z1 = p2.times.meuTime.jogadores.find((j) => j.papel === 'ZAG1');
  const z2 = p2.times.meuTime.jogadores.find((j) => j.papel === 'ZAG2'); // ambos em Z1-C -> curto
  executarPasse(p2, z2.id, () => 0.0);
  assert.equal(obterEstamina(z1), 98);
  assert.equal(obterEstamina(z2), 99);

  // Condução cobra 6 e deslocamento de turno (mudança de fase ATRÁS -> MEIO) cobra 1 por faixa movida
  const p3 = criarPartida();
  const vol = p3.times.meuTime.jogadores.find((j) => j.papel === 'VOL'); // VOL: Z1-C (atrás) -> Z2-C (meio) = 1 faixa
  const ca3 = p3.times.meuTime.jogadores.find((j) => j.papel === 'CA'); // CA: Z4-C (atrás) -> Z5-C (meio) = 1 faixa
  p3.portadorId = vol.id;
  p3.zonaBola = 'Z2-C';
  vol.zona = 'Z2-C';
  executarConducao(p3, 'Z3-C', () => 0.0); // bola vai para Z3-C (MEIO) -> time desloca
  assert.equal(obterEstamina(vol), 100 - 6 - 1);
  assert.equal(obterEstamina(ca3), 99);

  // Finalização cobra 6
  const p4 = criarPartida();
  const ca = p4.times.meuTime.jogadores.find((j) => j.papel === 'CA');
  p4.portadorId = ca.id;
  p4.zonaBola = 'Z5-C';
  ca.zona = 'Z5-C';
  ca.zonaBase = 'Z5-C';
  executarFinalizacao(p4, () => 0.0);
  assert.equal(obterEstamina(ca), 94);
});

test('ordens defensivas sem PC: gastam estamina por eficiência com fallback, desabilitam sem estamina e aplicam falta tática', () => {
  const pDef = criarPartida();
  pDef.timeComBola = 'rival';
  const r9 = pDef.times.rival.jogadores.find((j) => j.id === 'r9');
  pDef.portadorId = r9.id;
  pDef.zonaBola = 'Z3-E';
  r9.zona = 'Z3-E';

  const pontaOposto = pDef.times.rival.jogadores.find((j) => j.papel === 'PONTA_D');
  pDef.times.rival.jogadores.forEach((j) => {
    if (j.id === pontaOposto.id) j.zona = 'Z3-D';
  });
  const intencaoDificil = avaliarPasse(pDef, pontaOposto.id);
  anunciarIntencaoRival(pDef, intencaoDificil);

  const planoFechar = avaliarCustoOrdemDefensiva(pDef, 'fechar_linha', pDef.defesaTurno);
  assert.equal(planoFechar.disponivel, true);
  assert.equal(planoFechar.envolvidos.length, 2);

  const resFechar = aplicarOrdemDefensiva(pDef, 'fechar_linha', escolherJogadaRival, () => 0.5);
  assert.equal(resFechar.valido, true);
  assert.equal(resFechar.gastosOrdem.length, 2);
  for (const g of resFechar.gastosOrdem) {
    assert.equal(g.gasto, 6);
    assert.equal(g.atual, 94);
  }

  // Fallback de eficiência: se o jogador mais eficiente na bola não tiver 10 de estamina, usa o próximo
  const pPress = criarPartida();
  pPress.timeComBola = 'rival';
  const r6 = pPress.times.rival.jogadores.find((j) => j.id === 'r6');
  pPress.portadorId = r6.id;
  pPress.zonaBola = 'Z3-C';
  r6.zona = 'Z3-C';
  anunciarIntencaoRival(pPress, escolherJogadaRival(pPress, () => 0.2));

  const planoInicialPress = avaliarCustoOrdemDefensiva(pPress, 'pressionar', pPress.defesaTurno);
  const primeiroId = planoInicialPress.envolvidos[0].jogador.id;
  const primeiroJogador = pPress.times.meuTime.jogadores.find((j) => j.id === primeiroId);
  gastarEstamina(primeiroJogador, 95); // fica com 5 (< 10)

  const planoComFallback = avaliarCustoOrdemDefensiva(pPress, 'pressionar', pPress.defesaTurno);
  assert.equal(planoComFallback.disponivel, true);
  assert.ok(!planoComFallback.envolvidos.some((e) => e.jogador.id === primeiroId));

  // Se todos os jogadores de linha ficarem abaixo do custo, desabilita pressionar e falta_tatica
  for (const j of pPress.times.meuTime.jogadores) {
    if (!j.ehGoleiro) j.extras.estamina = 3;
  }
  assert.equal(avaliarCustoOrdemDefensiva(pPress, 'pressionar', pPress.defesaTurno).disponivel, false);
  assert.equal(avaliarCustoOrdemDefensiva(pPress, 'falta_tatica', pPress.defesaTurno).disponivel, false);
  assert.equal(avaliarCustoOrdemDefensiva(pPress, 'nenhuma', pPress.defesaTurno).disponivel, true);

  // Falta tática: gasta 8 do marcador de maior eficiência, 2º cartão amarelo vira vermelho
  const pFalta = criarPartida();
  pFalta.timeComBola = 'rival';
  const r6f = pFalta.times.rival.jogadores.find((j) => j.id === 'r6');
  pFalta.portadorId = r6f.id;
  pFalta.zonaBola = 'Z3-C';
  r6f.zona = 'Z3-C';

  anunciarIntencaoRival(pFalta, escolherJogadaRival(pFalta, () => 0.2));
  const marcador = pFalta.defesaTurno.marcadorFalta;
  marcador.atributos.agressividade = 100;

  const resFalta1 = aplicarOrdemDefensiva(pFalta, 'falta_tatica', escolherJogadaRival, () => 0.0);
  assert.equal(resFalta1.valido, true);
  assert.equal(obterEstamina(marcador), 92); // 100 - 8
  assert.equal(marcador.extras.cartoes.amarelos, 1);
  assert.equal(marcador.extras.cartoes.vermelho, false);

  pFalta.defesaTurno = null;
  anunciarIntencaoRival(pFalta, escolherJogadaRival(pFalta, () => 0.2));
  pFalta.defesaTurno.marcadorFalta = marcador;
  const resFalta2 = aplicarOrdemDefensiva(pFalta, 'falta_tatica', escolherJogadaRival, () => 0.0);
  assert.equal(resFalta2.valido, true);
  assert.equal(marcador.extras.cartoes.vermelho, true);
  assert.equal(marcador.zona, null);
});

test('substituições: 7 reservas, até 5 por partida, 1 por turno sem gastar turno, herda vaga e goleiro só por goleiro', () => {
  const p = criarPartida();
  assert.equal(p.times.meuTime.reservas.length, 7);
  assert.equal(p.times.rival.reservas.length, 7);

  const goleiroTitular = p.times.meuTime.jogadores.find((j) => j.ehGoleiro);
  const reservaLinha = p.times.meuTime.reservas.find((r) => !r.ehGoleiro);
  const reservaGol = p.times.meuTime.reservas.find((r) => r.ehGoleiro);

  // Goleiro não pode trocar por jogador de linha
  const erroGol = fazerSubstituicao(p, 'meuTime', goleiroTitular.id, reservaLinha.id);
  assert.equal(erroGol.valido, false);

  // Substitui o portador atual (m2) por um defensor reserva: herda vaga, zona e posse, sem gastar turno
  const saiId = p.portadorId;
  const turnoAntes = p.turnosJogados.meuTime;
  const resSub1 = fazerSubstituicao(p, 'meuTime', saiId, reservaLinha.id);
  assert.equal(resSub1.valido, true);
  assert.equal(p.turnosJogados.meuTime, turnoAntes);
  assert.equal(p.portadorId, reservaLinha.id);
  assert.equal(reservaLinha.papel, 'ZAG1');
  assert.equal(reservaLinha.zona, 'Z1-C');
  assert.equal(p.substituicoes.meuTime, 1);

  // Quem saiu não está mais em campo nem nos reservas (não volta)
  assert.equal(p.times.meuTime.jogadores.some((j) => j.id === saiId), false);
  assert.equal(p.times.meuTime.reservas.some((r) => r.id === saiId), false);

  // Limite de 1 por turno
  const outroTitular = p.times.meuTime.jogadores.find((j) => !j.ehGoleiro && j.id !== reservaLinha.id);
  const segundoReserva = p.times.meuTime.reservas.find((r) => !r.ehGoleiro);
  const bloqueioTurno = podeSubstituir(p, 'meuTime', outroTitular.id);
  assert.equal(bloqueioTurno.permitido, false);
  assert.equal(fazerSubstituicao(p, 'meuTime', outroTitular.id, segundoReserva.id).valido, false);

  // Após jogar 1 turno, libera nova substituição; goleiro troca por goleiro
  p.substituicaoNoTurno.meuTime = false;
  assert.equal(fazerSubstituicao(p, 'meuTime', goleiroTitular.id, reservaGol.id).valido, true);

  // Simula 5 substituições máximas
  p.substituicaoNoTurno.meuTime = false;
  p.substituicoes.meuTime = MAX_SUBSTITUICOES_PARTIDA;
  assert.equal(podeSubstituir(p, 'meuTime', outroTitular.id).permitido, false);

  // Rival substitui automaticamente quando jogador fica abaixo de 30 de estamina
  const rAlvo = p.times.rival.jogadores.find((j) => !j.ehGoleiro);
  rAlvo.extras.estamina = 25;
  const autoRival = verificarSubstituicaoAutomaticaRival(p);
  assert.ok(autoRival && autoRival.valido);
  assert.equal(autoRival.sai.id, rAlvo.id);
  assert.equal(p.substituicoes.rival, 1);
});

test('contra-ataque (+10%) ativa ao recuperar por interceptação/desarme com rival na fase FRENTE', () => {
  const partida = criarPartida();
  partida.timeComBola = 'rival';
  const r10 = partida.times.rival.jogadores.find((j) => j.papel === 'CA');
  const r6 = partida.times.rival.jogadores.find((j) => j.papel === 'VOL');
  partida.portadorId = r10.id;
  partida.zonaBola = 'Z1-C'; // Rival está na faixa 5 dele = fase FRENTE
  r10.zona = 'Z1-C';
  r6.zona = 'Z2-C';

  const prev = avaliarPasse(partida, r6.id);
  anunciarIntencaoRival(partida, prev);
  aplicarOrdemDefensiva(partida, 'nenhuma');
  const exec = executarJogada(partida, prev, () => 0.99); // Interceptação do meuTime!
  assert.equal(exec.resultado.tipo, 'interceptacao');
  assert.equal(partida.timeComBola, 'meuTime');
  assert.equal(partida.bonusContraAtaqueMeu, true);

  const comp = partida.times.meuTime.jogadores.find((j) => j.id !== partida.portadorId && !j.extras.cartoes.vermelho);
  const minhaPrevia = avaliarPasse(partida, comp.id);
  assert.ok(minhaPrevia.calculo.ajustesChance.some((a) => a.rotulo === 'Contra-ataque' && a.valor === 10));
});

test('partida completa termina exatamente após 10 turnos por lado', () => {
  const partida = criarPartida();
  let passos = 0;

  while (!partida.encerrada && passos < 60) {
    passos += 1;
    if (partida.timeComBola === 'meuTime') {
      const cond = avaliarConducao(partida, 'Z2-C') || avaliarConducao(partida, 'Z1-C');
      if (cond) {
        executarConducao(partida, cond.zonaDestino, () => 0.05);
      } else {
        const comp = partida.times.meuTime.jogadores.find((j) => j.id !== partida.portadorId);
        executarPasse(partida, comp.id, () => 0.05);
      }
    } else {
      const escolha = escolherJogadaRival(partida, () => 0.35);
      anunciarIntencaoRival(partida, escolha);
      aplicarOrdemDefensiva(partida, 'nenhuma');
      executarJogada(partida, partida.defesaTurno.intencaoAtual, () => 0.05);
    }
  }

  assert.equal(partida.encerrada, true);
  assert.equal(partida.turnosJogados.meuTime, TURNOS_POR_LADO);
  assert.equal(partida.turnosJogados.rival, TURNOS_POR_LADO);
});

test('catálogo e distribuição: 10 habilidades em dados, ~7 titulares por time com 0 a 2 habilidades', () => {
  assert.equal(LISTA_HABILIDADES.length, 10);
  for (const hab of LISTA_HABILIDADES) {
    assert.ok(obterDefinicaoHabilidade(hab.id));
    assert.equal(hab.nivel, 1);
  }

  const p = criarPartida();
  const comHabMeu = p.times.meuTime.jogadores.filter(
    (j) => obterHabilidadesJogador(j).length > 0,
  );
  const comHabRival = p.times.rival.jogadores.filter(
    (j) => obterHabilidadesJogador(j).length > 0,
  );
  assert.equal(comHabMeu.length, 7);
  assert.equal(comHabRival.length, 7);

  for (const j of [...p.times.meuTime.jogadores, ...p.times.rival.jogadores]) {
    const hs = obterHabilidadesJogador(j);
    assert.ok(hs.length <= 2);
  }
});

test('habilidades passivas: Leitura de jogo (+10% intercept.), Saída de bola (+10), Passe de primeira (+5), Liderança (+3 pos. em campo) e Fôlego (-20% estamina)', () => {
  const p = criarPartida();

  // Saída de bola (m1 GOL, +10% passe)
  const m1 = p.times.meuTime.jogadores.find((j) => j.id === 'm1');
  const m2 = p.times.meuTime.jogadores.find((j) => j.id === 'm2');
  const pSemSaida = criarPartida();
  const m1Sem = pSemSaida.times.meuTime.jogadores.find((j) => j.id === 'm1');
  m1Sem.extras.habilidades = [];

  p.portadorId = m1.id;
  p.zonaBola = 'GK';
  pSemSaida.portadorId = m1Sem.id;
  pSemSaida.zonaBola = 'GK';

  const passeComSaida = avaliarPasse(p, m2.id);
  const passeSemSaida = avaliarPasse(pSemSaida, 'm2');
  assert.ok(passeComSaida.calculo.ajustesChance.some((a) => a.rotulo === 'Saída de bola' && a.valor === 10));
  assert.ok(passeComSaida.calculo.chance >= passeSemSaida.calculo.chance);

  // Passe de primeira (m6 Caio MEI_E, +5% em curto/lateral)
  const pPrim = criarPartida();
  const m6 = pPrim.times.meuTime.jogadores.find((j) => j.id === 'm6');
  const m7 = pPrim.times.meuTime.jogadores.find((j) => j.id === 'm7');
  m6.zona = 'Z2-C';
  m7.zona = 'Z2-C'; // curto
  pPrim.portadorId = m6.id;
  pPrim.zonaBola = 'Z2-C';
  const prevCurto = avaliarPasse(pPrim, m7.id);
  assert.ok(prevCurto.calculo.ajustesChance.some((a) => a.rotulo === 'Passe de primeira' && a.valor === 5));

  // Leitura de jogo (m3 Murilo ZAG1, +10% força de interceptação)
  const m3Com = p.times.meuTime.jogadores.find((j) => j.id === 'm3');
  const pSemLeitura = criarPartida();
  const m3Sem = pSemLeitura.times.meuTime.jogadores.find((j) => j.id === 'm3');
  m3Sem.extras.habilidades = [];
  const pressaoComLeitura = calcularPressaoZona([m3Com], 'Z1-C').pressaoLinha;
  const pressaoSemLeitura = calcularPressaoZona([m3Sem], 'Z1-C').pressaoLinha;
  assert.ok(pressaoComLeitura > pressaoSemLeitura);

  // Liderança (m7 Rafa em campo: +3 posicionamento para todos de linha, desaparece se sair)
  const pLid = criarPartida();
  const m7Lid = pLid.times.meuTime.jogadores.find((j) => j.id === 'm7');
  const m8Lid = pLid.times.meuTime.jogadores.find((j) => j.id === 'm8');
  m8Lid.atributos.posicionamento = 70;
  assert.equal(obterAtributoEfetivoComBonus(m2, 'posicionamento', { posicionamento: 3 }), m2.atributos.posicionamento + 3);
  const posAntes = avaliarPasse(pLid, 'm8');
  assert.ok(posAntes.calculo.habilidadesAplicadas.some((s) => s.includes('Liderança')));
  m7Lid.extras.habilidades = [];
  const posSem = avaliarPasse(pLid, 'm8');
  assert.ok(posAntes.calculo.ataque > posSem.calculo.ataque);

  // Fôlego (m2 Tiago LAT_E, -20% nos custos de estamina: condução 6 -> 4, ordem 10 -> 8)
  const pFol = criarPartida();
  const tiago = pFol.times.meuTime.jogadores.find((j) => j.id === 'm2');
  pFol.portadorId = tiago.id;
  pFol.zonaBola = tiago.zona;
  executarConducao(pFol, 'Z2-E', () => 0.0);
  assert.equal(obterEstamina(tiago), 96); // 100 - floor(6 * 0.8) = 96
});

test('habilidades ofensivas ativas: Passe de infiltração, Arrancada e Chute de fora, com custo, limite de 1 uso e trava de estamina', () => {
  // Passe de infiltração (m6 Caio MEI_E: -50% pressão destino em passe frente/longo, custo 8, 1 uso)
  const pInf = criarPartida();
  const m6 = pInf.times.meuTime.jogadores.find((j) => j.id === 'm6');
  const m11 = pInf.times.meuTime.jogadores.find((j) => j.id === 'm11'); // CA em Z4-C (longo)
  pInf.portadorId = m6.id;
  pInf.zonaBola = m6.zona;
  const normalLongo = avaliarPasse(pInf, m11.id);
  const infLongo = avaliarPasse(pInf, m11.id, { habilidadeId: 'passe_infiltracao' });
  assert.ok(infLongo && infLongo.calculo.pressaoDestino < normalLongo.calculo.pressaoDestino);
  assert.ok(infLongo.calculo.chance >= normalLongo.calculo.chance);

  // Não aceita passe para trás
  const m3 = pInf.times.meuTime.jogadores.find((j) => j.id === 'm3');
  assert.equal(avaliarPasse(pInf, m3.id, { habilidadeId: 'passe_infiltracao' }), null);

  const execInf = executarJogada(pInf, infLongo, () => 0.0);
  assert.equal(execInf.valido, true);
  // 100 - 8 (Passe de infiltração) - 2 (deslocamento Z2-E -> Z4-E na fase FRENTE após recepção em Z4-C) = 90
  assert.equal(obterEstamina(m6), 90);
  assert.equal(avaliarHabilidadeOfensivaPortador(pInf, m6, 'passe_infiltracao').disponivel, false);

  // Arrancada (m2 Tiago LAT_E tem Fôlego -> custo 10 * 0.8 = 8; conduz 2 zonas com base 60)
  const pArr = criarPartida();
  const m2 = pArr.times.meuTime.jogadores.find((j) => j.id === 'm2'); // em Z1-E
  pArr.portadorId = m2.id;
  pArr.zonaBola = 'Z1-E';
  const prevArr = avaliarConducao(pArr, 'Z3-E', { habilidadeId: 'arrancada' });
  assert.ok(prevArr);
  assert.equal(prevArr.calculo.base, 60);
  assert.equal(avaliarConducao(pArr, 'Z2-E', { habilidadeId: 'arrancada' }), null); // distância 1 inválida para Arrancada

  const execArr = executarJogada(pArr, prevArr, () => 0.0);
  assert.equal(execArr.valido, true);
  assert.equal(pArr.zonaBola, 'Z3-E');
  assert.equal(obterEstamina(m2), 91); // 100 - 8 (Arrancada com Fôlego) - 1 (deslocamento Z1-E -> Z2-E)
  assert.equal(avaliarHabilidadeOfensivaPortador(pArr, m2, 'arrancada').jaUsada, true);

  // Chute de fora (m8 Bruno PONTA_D: está em Z3-D faixa 3; finaliza de faixas 3 e 4 com base 10, custo 8, 1 uso)
  const pChute = criarPartida();
  const m8 = pChute.times.meuTime.jogadores.find((j) => j.id === 'm8'); // está em Z3-D (faixa 3)
  pChute.portadorId = m8.id;
  pChute.zonaBola = m8.zona;
  assert.equal(avaliarFinalizacao(pChute), null); // sem habilidade, faixa 3 não finaliza
  const prevChuteFora = avaliarFinalizacao(pChute, { habilidadeId: 'chute_de_fora' });
  assert.ok(prevChuteFora);
  assert.equal(prevChuteFora.calculo.base, 10);

  const execChute = executarJogada(pChute, prevChuteFora, () => 0.0);
  assert.equal(execChute.valido, true);
  // 100 - 8 (Chute de fora) - 2 (deslocamento Z3-D -> Z5-D após gol e saída rival em Z5-C) = 90
  assert.equal(obterEstamina(m8), 90);
  assert.equal(avaliarHabilidadeOfensivaPortador(pChute, m8, 'chute_de_fora').jaUsada, true);

  // Sem estamina suficiente desabilita habilidade
  const pSemEst = criarPartida();
  const m8b = pSemEst.times.meuTime.jogadores.find((j) => j.id === 'm8');
  m8b.extras.estamina = 5;
  pSemEst.portadorId = m8b.id;
  pSemEst.zonaBola = m8b.zona;
  const infoSemEst = avaliarHabilidadeOfensivaPortador(pSemEst, m8b, 'chute_de_fora');
  assert.equal(infoSemEst.aplicavel, true);
  assert.equal(infoSemEst.semEstamina, true);
  assert.equal(infoSemEst.disponivel, false);
});

test('habilidades defensivas ativas: Carrinho cirúrgico (×2 pressão, sem falta) e Voo (+15 goleiro em chute)', () => {
  // Carrinho cirúrgico (m3 Bruno ZAG1)
  const pCar = criarPartida();
  pCar.timeComBola = 'rival';
  const r9 = pCar.times.rival.jogadores.find((j) => j.id === 'r9');
  pCar.portadorId = r9.id;
  pCar.zonaBola = 'Z2-C';
  r9.zona = 'Z2-C';

  const r10 = pCar.times.rival.jogadores.find((j) => j.id === 'r10');
  const intencaoConducao = avaliarConducao(pCar, 'Z1-C');
  const intencaoPasse = avaliarPasse(pCar, r10.id);
  const alvo = intencaoConducao || intencaoPasse;
  anunciarIntencaoRival(pCar, alvo);

  const habsPasse = listarHabilidadesDefensivasTime(pCar, 'meuTime', alvo);
  const itemCarrinho = habsPasse.find((h) => h.habilidade.id === 'carrinho_cirurgico');
  const itemVooPasse = habsPasse.find((h) => h.habilidade.id === 'voo');
  assert.ok(itemCarrinho && itemCarrinho.disponivel);
  assert.ok(itemVooPasse && !itemVooPasse.disponivel); // Voo só vale em finalização

  const pressaoAntes = calcularPressaoZona(pCar.times.meuTime.jogadores, 'Z2-C').pressaoPortador;
  const resCar = aplicarOrdemDefensiva(pCar, itemCarrinho.chaveOrdem, escolherJogadaRival);
  assert.equal(resCar.valido, true);
  assert.equal(obterEstamina(itemCarrinho.jogador), 90); // 100 - 10
  assert.equal(itemCarrinho.jogador.extras.cartoes.amarelos, 0);

  const modPressao = {
    multiplicadorPortadorPorJogador: { [itemCarrinho.jogador.id]: 2 },
  };
  const pressaoComCarrinho = calcularPressaoZona(
    pCar.times.meuTime.jogadores,
    'Z2-C',
    null,
    modPressao,
  ).pressaoPortador;
  assert.ok(pressaoComCarrinho > pressaoAntes);

  // Voo (m1 Diego GOL, +15 na defesa em finalização)
  const pVoo = criarPartida();
  pVoo.timeComBola = 'rival';
  const r11 = pVoo.times.rival.jogadores.find((j) => j.papel === 'CA');
  pVoo.portadorId = r11.id;
  pVoo.zonaBola = 'Z1-C'; // faixa 5 do rival!
  r11.zona = 'Z1-C';
  const intencaoChute = avaliarFinalizacao(pVoo);
  assert.ok(intencaoChute);
  anunciarIntencaoRival(pVoo, intencaoChute);

  const habsChute = listarHabilidadesDefensivasTime(pVoo, 'meuTime', intencaoChute);
  const itemVoo = habsChute.find((h) => h.habilidade.id === 'voo');
  assert.ok(itemVoo && itemVoo.disponivel);

  const chanceAntesVoo = intencaoChute.calculo.chance;
  const resVoo = aplicarOrdemDefensiva(pVoo, itemVoo.chaveOrdem, escolherJogadaRival);
  assert.equal(resVoo.valido, true);
  assert.equal(obterEstamina(itemVoo.jogador), 90); // 100 - 10
  assert.equal(resVoo.intencaoFinal.acao, 'finalizar');
  assert.equal(resVoo.intencaoFinal.calculo.defesaGoleiro, intencaoChute.calculo.defesaGoleiro + 15);
  assert.ok(resVoo.intencaoFinal.calculo.chance <= chanceAntesVoo);
});

test('IA do rival usa habilidades ativas com chance de 25% quando aplicável', () => {
  assert.equal(PROBABILIDADE_HABILIDADE_RIVAL, 0.25);

  const p = criarPartida();
  p.timeComBola = 'rival';
  const r6 = p.times.rival.jogadores.find((j) => j.id === 'r6'); // r6 VOL tem passe_infiltracao
  p.portadorId = r6.id;
  p.zonaBola = r6.zona;

  const comHabilidade = escolherJogadaRival(p, () => 0.2, { rngHabilidade: () => 0.1 });
  assert.ok(comHabilidade?.habilidadeAtiva);
  assert.equal(comHabilidade.habilidadeAtiva.id, 'passe_infiltracao');

  const semHabilidade = escolherJogadaRival(p, () => 0.2, { rngHabilidade: () => 0.5 });
  assert.equal(semHabilidade?.habilidadeAtiva, null);
});

import {
  CAMPANHA_CONFIG,
  TIPOS_NO,
} from '../js/campanha/constantes.js';
import { EVENTOS_CAMPANHA } from '../js/campanha/eventos.js';
import {
  calcularForcaAlvoCamada,
  carregarCampanha,
  criarRng,
  gerarRivalPorCamada,
  limparCampanha,
  salvarCampanha,
} from '../js/campanha/estado.js';
import {
  gerarMapaCampanha,
  obterNosDisponiveisIds,
} from '../js/campanha/mapa.js';
import {
  aplicarDescansoTotal,
  aplicarEscolhaEvento,
  aplicarFisioterapia,
  aplicarPosPartidaCampanha,
  aplicarTorcida,
  aplicarTreino,
  comprarJogadorMercado,
  concluirMisteriosoDireto,
  escolherPatrocinio,
  gerarOfertasMercado,
  gerarOfertasPatrocinio,
  gerarOpcoesTreinoParaJogador,
  iniciarNovaCampanha,
  montarTimeParaPartida,
  prepararEscalacaoPadrao,
  sortearResultadoMisterioso,
  venderJogadorElenco,
} from '../js/campanha/nos.js';
import {
  compilarResultadoPartida,
  partida as executarPartidaEncapsulada,
} from '../js/regras/partida.js';

test('campanha: elenco inicial tem 18 jogadores (2 GOL, 6 DEF, 5 MEI, 5 ATA), dinheiro 300 e persistência tolera falha de localStorage', () => {
  const c = iniciarNovaCampanha('SEED-TESTE-1');
  assert.equal(c.seed, 'SEED-TESTE-1');
  assert.equal(c.dinheiro, 300);
  assert.equal(c.elenco.length, 18);

  const contagemSetor = { GOL: 0, DEF: 0, MEI: 0, ATA: 0 };
  for (const j of c.elenco) {
    contagemSetor[j.setor] += 1;
    assert.equal(j.lesionado, false);
  }
  assert.deepEqual(contagemSetor, { GOL: 2, DEF: 6, MEI: 5, ATA: 5 });

  // Persistência segura funciona mesmo se localStorage lançar exceção ou for nulo
  const storageQuebrado = {
    setItem() {
      throw new Error('QuotaExceededError');
    },
    getItem() {
      throw new Error('SecurityError');
    },
    removeItem() {
      throw new Error('SecurityError');
    },
  };
  assert.equal(salvarCampanha(c, storageQuebrado), false);
  assert.equal(carregarCampanha(storageQuebrado), null);
  assert.equal(limparCampanha(storageQuebrado), false);
  assert.equal(salvarCampanha(c, null), false);

  // Storage funcional salva e restaura corretamente
  const mem = new Map();
  const storageOk = {
    setItem: (k, v) => mem.set(k, v),
    getItem: (k) => mem.get(k) ?? null,
    removeItem: (k) => mem.delete(k),
  };
  assert.equal(salvarCampanha(c, storageOk), true);
  const restaurado = carregarCampanha(storageOk);
  assert.equal(restaurado.seed, 'SEED-TESTE-1');
  assert.equal(restaurado.elenco.length, 18);
});

test('mapa de campanha: 12 camadas determinísticas por seed, sem cruzamento, regras de camada e mínimos garantidos', () => {
  const seeds = ['MAPA-A', 'MAPA-B', 'MAPA-C', 'BRI-XY4821'];
  for (const seed of seeds) {
    const mapa1 = gerarMapaCampanha(seed, 71);
    const mapa2 = gerarMapaCampanha(seed, 71);
    assert.deepEqual(mapa1, mapa2); // Reprodutível pela seed

    assert.equal(mapa1.camadas.length, 12);
    assert.equal(mapa1.camadas[0].nos.every((n) => n.tipo === TIPOS_NO.PARTIDA), true);
    assert.equal(mapa1.camadas[1].nos.every((n) => n.tipo === TIPOS_NO.PARTIDA), true);
    assert.equal(mapa1.camadas[10].nos.every((n) => n.tipo === TIPOS_NO.DESCANSO), true);
    assert.equal(mapa1.camadas[11].nos.length, 1);
    assert.equal(mapa1.camadas[11].nos[0].tipo, TIPOS_NO.CHEFAO);

    // Mínimos garantidos no mapa
    const todosNos = mapa1.camadas.flatMap((cam) => cam.nos);
    const cont = {};
    for (const n of todosNos) cont[n.tipo] = (cont[n.tipo] || 0) + 1;
    assert.ok((cont.treino || 0) >= 2);
    assert.ok((cont.mercado || 0) >= 1);
    assert.ok((cont.fisioterapia || 0) >= 1);
    assert.ok((cont.patrocinio || 0) >= 1);

    // Checa conexões: 3..4 nós (camadas 1..11), 1..2 saídas, >= 1 entrada, zero cruzamentos
    for (let i = 0; i < 11; i += 1) {
      const atual = mapa1.camadas[i].nos;
      const prox = mapa1.camadas[i + 1].nos;
      assert.ok(atual.length >= 3 && atual.length <= 4);

      const mapaIndexProx = new Map(prox.map((n, idx) => [n.id, idx]));
      const entradasProx = new Set();
      const arestas = [];

      for (let col = 0; col < atual.length; col += 1) {
        const no = atual[col];
        assert.ok(no.conexoes.length >= 1 && no.conexoes.length <= 2);
        for (const destId of no.conexoes) {
          const destCol = mapaIndexProx.get(destId);
          assert.notEqual(destCol, undefined);
          entradasProx.add(destId);
          arestas.push([col, destCol]);
        }
      }

      assert.equal(entradasProx.size, prox.length, `Camada ${i + 2} com nó órfão na seed ${seed}`);

      // Nenhum par de arestas (i1 -> j1), (i2 -> j2) com i1 < i2 pode ter j1 > j2
      for (const [i1, j1] of arestas) {
        for (const [i2, j2] of arestas) {
          if (i1 < i2) {
            assert.ok(j1 <= j2, `Cruzamento detectado na camada ${i + 1}: ${i1}->${j1} e ${i2}->${j2}`);
          }
        }
      }
    }

    // Disponibilidade inicial aponta para toda a camada 1
    assert.deepEqual(
      obterNosDisponiveisIds(mapa1, null),
      mapa1.camadas[0].nos.map((n) => n.id),
    );
  }
});

test('partida() encapsulada retorna { resultado, placar, estaminaFinal, lesionados } e aplica lesões antes dos +10', async () => {
  const c = iniciarNovaCampanha('ENCAPSULADA-1');
  const esc = prepararEscalacaoPadrao(c.elenco);
  const meuTime = montarTimeParaPartida(c, esc.titularesPorPapel, esc.reservasIds);
  const no1 = c.mapa.camadas[0].nos[0];
  const rival = gerarRivalPorCamada({
    seed: c.seed,
    noId: no1.id,
    camada: no1.camada,
    mediaInicialTitulares: c.mediaInicialTitulares,
  });

  const res = await executarPartidaEncapsulada(meuTime, rival, {
    simular: true,
    rng: criarRng('SIM-1'),
  });

  assert.ok(['vitoria', 'empate', 'derrota'].includes(res.resultado));
  assert.equal(typeof res.placar.meuTime, 'number');
  assert.equal(typeof res.placar.rival, 'number');
  assert.equal(Object.keys(res.estaminaFinal).length, 18);
  assert.ok(Array.isArray(res.lesionados));

  // Testa regra exata de lesão (<20 estamina -> 25% chance antes da recuperação +10)
  const pEstado = criarPartida();
  const titularCansado = pEstado.times.meuTime.jogadores[1];
  titularCansado.extras.estamina = 15;
  const compilado = compilarResultadoPartida(pEstado, { rngLesao: () => 0.1 }); // < 0.25 -> lesiona
  assert.ok(compilado.lesionados.includes(titularCansado.id));

  const pos = aplicarPosPartidaCampanha(c, compilado, no1);
  const atletaElenco = c.elenco.find((j) => j.id === titularCansado.id);
  assert.equal(atletaElenco.lesionado, true);
  assert.equal(atletaElenco.extras.estamina, 25); // 15 + 10 recuperação entre nós
  assert.ok(pos.rendaTotal >= 20);
});

test('escalação pula lesionados, moral dura 1 partida, 3 derrotas seguidas demitem e vencer chefão vence campanha', () => {
  const c = iniciarNovaCampanha('FIM-CAMP');
  const atletaLesionado = c.elenco[2];
  atletaLesionado.lesionado = true;

  const esc = prepararEscalacaoPadrao(c.elenco);
  const escalados = [...Object.values(esc.titularesPorPapel), ...esc.reservasIds];
  assert.equal(escalados.includes(atletaLesionado.id), false);

  // Moral +3 vai para o time da partida e zera após a partida
  const noTorcida = { id: 'c3_n1', camada: 3, tipo: TIPOS_NO.TORCIDA };
  aplicarTorcida(c, noTorcida);
  assert.equal(c.moral, 3);
  const timeComMoral = montarTimeParaPartida(c, esc.titularesPorPapel, esc.reservasIds);
  const baseCA = c.elenco.find((j) => j.id === esc.titularesPorPapel.CA).atributos.finalizacao;
  const comMoralCA = timeComMoral.jogadores.find((j) => j.papel === 'CA').atributos.finalizacao;
  assert.equal(comMoralCA, Math.min(100, baseCA + 3));

  // 2 derrotas + 1 empate zera sequência
  const noP1 = { id: 'c1_n1', camada: 1, tipo: TIPOS_NO.PARTIDA };
  aplicarPosPartidaCampanha(c, { resultado: 'derrota', placar: { meuTime: 0, rival: 1 }, estaminaFinal: {}, lesionados: [] }, noP1);
  assert.equal(c.moral, 0);
  assert.equal(c.derrotasSeguidas, 1);
  aplicarPosPartidaCampanha(c, { resultado: 'derrota', placar: { meuTime: 0, rival: 2 }, estaminaFinal: {}, lesionados: [] }, noP1);
  assert.equal(c.derrotasSeguidas, 2);
  aplicarPosPartidaCampanha(c, { resultado: 'empate', placar: { meuTime: 1, rival: 1 }, estaminaFinal: {}, lesionados: [] }, noP1);
  assert.equal(c.derrotasSeguidas, 0);

  // 3 derrotas seguidas demitem o técnico
  for (let k = 0; k < 3; k += 1) {
    aplicarPosPartidaCampanha(c, { resultado: 'derrota', placar: { meuTime: 0, rival: 1 }, estaminaFinal: {}, lesionados: [] }, noP1);
  }
  assert.equal(c.status, 'derrota');
  assert.match(c.motivoFim, /demitiu/i);

  // Vitória no chefão vence a campanha
  const cWin = iniciarNovaCampanha('BOSS-WIN');
  const noChefao = cWin.mapa.camadas[11].nos[0];
  aplicarPosPartidaCampanha(cWin, { resultado: 'vitoria', placar: { meuTime: 2, rival: 0 }, estaminaFinal: {}, lesionados: [] }, noChefao);
  assert.equal(cWin.status, 'vitoria');
  assert.match(cWin.motivoFim, /Campeão/i);
});

test('nós de campanha: treino, descanso, fisioterapia, patrocínio, mercado (máx 18 e venda 50%), 8 eventos e misterioso', () => {
  const c = iniciarNovaCampanha('NOS-TEST');

  // Treino (+3 atributo ou aprender habilidade até máx 2)
  const jogSem2Habs = c.elenco.find((j) => j.extras.habilidades.length === 0);
  const noTreino = { id: 'c3_n1', camada: 3, tipo: TIPOS_NO.TREINO };
  const opcoesT = gerarOpcoesTreinoParaJogador(c, noTreino, jogSem2Habs.id);
  assert.equal(opcoesT.length, 3);
  const opHab = opcoesT.find((o) => o.tipo === 'habilidade');
  assert.ok(opHab);
  assert.equal(aplicarTreino(c, noTreino, jogSem2Habs.id, opHab.id).valido, true);
  assert.equal(jogSem2Habs.extras.habilidades.length, 1);

  // Fisioterapia cura todos os lesionados e Descanso total restaura 100
  c.elenco[0].lesionado = true;
  c.elenco[1].lesionado = true;
  c.elenco[0].extras.estamina = 40;
  aplicarFisioterapia(c, { id: 'c4_n1', camada: 4, tipo: TIPOS_NO.FISIOTERAPIA });
  assert.equal(c.elenco.some((j) => j.lesionado), false);
  assert.equal(c.elenco[0].extras.estamina, 50); // +10 entre nós

  aplicarDescansoTotal(c, { id: 'c11_n1', camada: 11, tipo: TIPOS_NO.DESCANSO });
  assert.equal(c.elenco.every((j) => j.extras.estamina === 100), true);

  // Patrocínio: 2 ofertas (imediato 200-300 vs 4 jogos somando mais)
  const noPat = { id: 'c5_n1', camada: 5, tipo: TIPOS_NO.PATROCINIO };
  const ofertasPat = gerarOfertasPatrocinio(c, noPat);
  assert.equal(ofertasPat.length, 2);
  assert.ok(ofertasPat[0].valorImediato >= 200 && ofertasPat[0].valorImediato <= 300);
  assert.ok(ofertasPat[1].totalPossivel > ofertasPat[0].valorImediato);
  escolherPatrocinio(c, noPat, 'parcelado');
  assert.equal(c.contratosPatrocinio.length, 1);
  const dinheiroAntes = c.dinheiro;
  aplicarPosPartidaCampanha(c, { resultado: 'vitoria', placar: { meuTime: 1, rival: 0 }, estaminaFinal: {}, lesionados: [] }, c.mapa.camadas[0].nos[0]);
  assert.equal(c.dinheiro, dinheiroAntes + CAMPANHA_CONFIG.rendaPartida.vitoria + ofertasPat[1].valorPorPartida);

  // Mercado: 4 jogadores, trava em 18, venda por 50% permite comprar
  const noMer = { id: 'c6_n1', camada: 6, tipo: TIPOS_NO.MERCADO };
  const ofertasMer = gerarOfertasMercado(c, noMer);
  assert.equal(ofertasMer.length, 4);
  for (const o of ofertasMer) {
    assert.ok(o.preco >= 100 && o.preco <= 400);
  }
  c.dinheiro = 500;
  assert.equal(comprarJogadorMercado(c, noMer, ofertasMer[0], ofertasMer).valido, false); // elenco está com 18
  const venda = venderJogadorElenco(c, c.elenco[10].id);
  assert.equal(venda.valido, true);
  assert.equal(c.elenco.length, 17);
  assert.equal(comprarJogadorMercado(c, noMer, ofertasMer[0], ofertasMer).valido, true);
  assert.equal(c.elenco.length, 18);

  // Eventos: 8 eventos no catálogo, todos com 2-3 escolhas
  assert.equal(EVENTOS_CAMPANHA.length, 8);
  for (const ev of EVENTOS_CAMPANHA) {
    assert.ok(ev.escolhas.length >= 2 && ev.escolhas.length <= 3);
  }
  const cEv = iniciarNovaCampanha('EV-TEST');
  const resEv = aplicarEscolhaEvento(cEv, { id: 'c4_n2', camada: 4, tipo: TIPOS_NO.EVENTO }, EVENTOS_CAMPANHA[0], 'esperar_mecanico');
  assert.equal(resEv.valido, true);

  // Misterioso resolve em um dos 4 desfechos válidos
  const cMist = iniciarNovaCampanha('MIST-TEST');
  const desfechoM = sortearResultadoMisterioso(cMist, { id: 'c7_n1', camada: 7, tipo: TIPOS_NO.MISTERIOSO });
  assert.ok(['evento', 'partida', 'dinheiro', 'descanso'].includes(desfechoM.tipo));
  if (desfechoM.tipo === 'dinheiro' || desfechoM.tipo === 'descanso') {
    assert.equal(concluirMisteriosoDireto(cMist, { id: 'c7_n1', camada: 7, tipo: TIPOS_NO.MISTERIOSO }, desfechoM).valido, true);
  }

  // Escala de força dos rivais cresce com a camada e Chefão recebe +6
  const f1 = calcularForcaAlvoCamada(71, 1, false);
  const f10 = calcularForcaAlvoCamada(71, 10, false);
  const fChefao = calcularForcaAlvoCamada(71, 12, true);
  assert.ok(f10 > f1 && fChefao > f10);
});

import {
  BONUS_RIVAL_POR_DIFICULDADE,
  CONQUISTAS_DEFINICOES,
  LISTA_MELHORIAS_CLUBE,
  LISTA_UNIFORMES,
} from '../js/meta/constantes.js';
import {
  comprarMelhoriaClube,
  comprarOuEquiparUniforme,
  obterCustoProximaMelhoria,
} from '../js/meta/melhorias.js';
import {
  comprarDesbloqueioClube,
  comprarDesbloqueioTecnico,
  comprarPacoteConteudo,
} from '../js/meta/desbloqueios.js';
import {
  calcularPontosLegado,
  carregarMeta,
  criarEstadoMetaInicial,
  exportarMetaJson,
  finalizarCampanhaNoMeta,
  importarMetaJson,
  modificadoresMeta,
  salvarMeta,
} from '../js/meta/meta.js';
import {
  calcularValorVendaElenco,
  prepararEscalacaoPadrao as prepEsc,
} from '../js/campanha/nos.js';
import {
  obterEventosDisponiveis,
  TODOS_EVENTOS_CAMPANHA,
} from '../js/campanha/eventos.js';
import {
  LISTA_TODAS_HABILIDADES,
  obterHabilidadesDisponiveis,
} from '../js/dados/habilidades.js';
import { simularPartidasEquilibrio } from '../js/debug/simulacao.js';

test('meta-progressão: pontos de legado, dificuldade 0..5 e desbloqueio por vitória', () => {
  const legDerrota = calcularPontosLegado({
    camadasCompletadas: 3,
    vitorias: 1,
    empates: 1,
    venceuChefao: false,
    dificuldade: 2,
  });
  // 2*3 + 3*1 + 1*1 + 0 + 5*2 = 20
  assert.equal(legDerrota.total, 20);

  const legVitoria = calcularPontosLegado({
    camadasCompletadas: 12,
    vitorias: 9,
    empates: 2,
    venceuChefao: true,
    dificuldade: 3,
  });
  // 2*12 + 3*9 + 1*2 + 30 + 5*3 = 24 + 27 + 2 + 30 + 15 = 98
  assert.equal(legVitoria.total, 98);

  const meta = criarEstadoMetaInicial();
  assert.equal(meta.dificuldadeMaxDesbloqueada, 0);

  // Dificuldade solicitada acima do máximo desbloqueado é limitada em modificadoresMeta()
  const modsClamped = modificadoresMeta(meta, { dificuldade: 4 });
  assert.equal(modsClamped.dificuldade, 0);
  assert.equal(modsClamped.bonusForcaRival, 0);

  // Vencer no nível 0 desbloqueia nível 1 (até o máximo 5)
  const campWin0 = iniciarNovaCampanha('META-WIN-0', meta, { dificuldade: 0 });
  campWin0.nosVisitados = Array.from({ length: 12 }, (_, i) => `c${i + 1}_n1`);
  campWin0.vitorias = 8;
  campWin0.empates = 1;
  campWin0.status = 'vitoria';
  campWin0.historico = [
    {
      camada: 12,
      tipo: TIPOS_NO.CHEFAO,
      resultado: 'vitoria',
      placar: { meuTime: 3, rival: 1 },
      rivalNome: 'Imperador FC',
    },
  ];
  const resMeta = finalizarCampanhaNoMeta(meta, campWin0);
  assert.equal(resMeta.desbloqueios.desbloqueouDificuldade, 1);
  assert.equal(meta.dificuldadeMaxDesbloqueada, 1);
  assert.equal(meta.pontosLegado, resMeta.pontos.total);

  const modsDif1 = modificadoresMeta(meta, { dificuldade: 1 });
  assert.equal(modsDif1.bonusForcaRival, BONUS_RIVAL_POR_DIFICULDADE);
});

test('meta-progressão: Tela do Clube (Torcida, Estádio, Base, Equipamentos) e Uniformes passam por modificadoresMeta()', () => {
  const meta = criarEstadoMetaInicial();
  meta.pontosLegado = 500;

  assert.equal(LISTA_MELHORIAS_CLUBE.length, 4);
  assert.equal(LISTA_UNIFORMES.length, 7); // 1 grátis + 6 desbloqueáveis
  assert.equal(obterCustoProximaMelhoria(meta, 'torcida'), 10);

  assert.equal(comprarMelhoriaClube(meta, 'torcida').valido, true); // n1
  assert.equal(comprarMelhoriaClube(meta, 'torcida').valido, true); // n2 (+8% receita)
  assert.equal(obterCustoProximaMelhoria(meta, 'torcida'), 30);
  assert.equal(comprarMelhoriaClube(meta, 'estadio').valido, true); // n1
  assert.equal(comprarMelhoriaClube(meta, 'base').valido, true); // n1 (1 jovem)
  assert.equal(comprarMelhoriaClube(meta, 'base').valido, true); // n2 (2 jovens)
  assert.equal(comprarMelhoriaClube(meta, 'equipamentos').valido, true); // n1
  assert.equal(comprarMelhoriaClube(meta, 'equipamentos').valido, true); // n2 (+4 estamina/nó, -4% custo)
  assert.equal(comprarOuEquiparUniforme(meta, 'rubro_negro').valido, true);

  const mods = modificadoresMeta(meta);
  assert.equal(mods.bonusReceitaPct, 0.08);
  assert.equal(mods.bilheteriaPorPartida, Math.round(15 * 1 * (1 + 0.1 * 2))); // 18
  assert.equal(mods.jovensNoMercado, 2);
  assert.equal(mods.bonusRecuperacaoEquipamentos, 4);
  assert.equal(mods.reducaoCustoEstamina, 0.04);
  assert.equal(mods.uniforme.id, 'rubro_negro');

  // Inicia campanha e testa mercado (2 jovens baratos 45..55), evolução (+1 por partida) e receita Torcida+Estádio
  const c = iniciarNovaCampanha('BASE-TEST', meta);
  const ofertas = gerarOfertasMercado(c, { id: 'c5_n1', camada: 5, tipo: TIPOS_NO.MERCADO });
  assert.equal(ofertas.length, 6); // 4 padrão + 2 jovens
  const jovens = ofertas.filter((o) => o.ehJovem);
  assert.equal(jovens.length, 2);
  for (const jv of jovens) {
    assert.ok(jv.preco < 100);
    assert.ok(jv.jogador.atributos.passe >= 45 && jv.jogador.atributos.passe <= 55);
  }

  // Contrata um jovem e escala como titular para validar evolução +1 atributo após partida
  venderJogadorElenco(c, c.elenco[17].id);
  const compra = comprarJogadorMercado(c, { id: 'c5_n1', camada: 5 }, jovens[0], ofertas);
  assert.equal(compra.valido, true);
  const jovemContratado = c.elenco.find((j) => j.id === compra.jogador.id);
  const somaAntes = Object.values(jovemContratado.atributos).reduce((a, b) => a + b, 0);

  const dinheiroAntes = c.dinheiro;
  const no1 = c.mapa.camadas[0].nos[0];
  const estAntes = c.elenco[5].extras.estamina;
  const pos = aplicarPosPartidaCampanha(
    c,
    {
      resultado: 'vitoria',
      placar: { meuTime: 2, rival: 0 },
      estaminaFinal: { [c.elenco[5].id]: 60 },
      lesionados: [],
      participantesIds: [jovemContratado.id],
    },
    no1,
  );

  // Renda: 40 * 1.08 = 43 + bilheteria 18 = 61
  assert.equal(pos.rendaBase, Math.round(CAMPANHA_CONFIG.rendaPartida.vitoria * 1.08));
  assert.equal(pos.bilheteria, 18);
  assert.equal(c.dinheiro, dinheiroAntes + pos.rendaTotal);
  assert.equal(pos.jovensEvoluidos.length, 1);
  const somaDepois = Object.values(jovemContratado.atributos).reduce((a, b) => a + b, 0);
  assert.equal(somaDepois, somaAntes + 1);
  // Equipamentos nível 2 => +10 base + 4 = +14 de recuperação entre nós
  assert.equal(c.elenco[5].extras.estamina, 74);

  // Redução de custo de estamina (-4% por Equipamentos n2) reduz custo no cálculo da partida
  const pSem = criarPartida();
  const zSem = pSem.times.meuTime.jogadores[2]; // Murilo (ZAG1, sem Fôlego)
  const mSem = pSem.times.meuTime.jogadores[6];
  pSem.portadorId = zSem.id;
  executarPasse(pSem, mSem.id, () => 0.01);
  const gastoSem = 100 - zSem.extras.estamina;

  const pCom = criarPartida(undefined, { modificadoresMeta: mods });
  const zCom = pCom.times.meuTime.jogadores[2];
  const mCom = pCom.times.meuTime.jogadores[6];
  pCom.portadorId = zCom.id;
  executarPasse(pCom, mCom.id, () => 0.01);
  const gastoCom = 100 - zCom.extras.estamina;

  assert.ok(gastoSem > 0);
  assert.ok(gastoCom < gastoSem);
  assert.equal(Number(gastoCom.toFixed(2)), Number((gastoSem * 0.96).toFixed(2)));
});

test('meta-progressão: Clubes iniciais, Técnicos, Pacotes de conteúdo, 5 Conquistas, Troféus e JSON', () => {
  const meta = criarEstadoMetaInicial();
  meta.pontosLegado = 400;

  assert.equal(comprarDesbloqueioClube(meta, 'retranca').valido, true);
  assert.equal(comprarDesbloqueioClube(meta, 'ataque_total').valido, true);
  assert.equal(comprarDesbloqueioTecnico(meta, 'motivador').valido, true);
  assert.equal(comprarDesbloqueioTecnico(meta, 'negociador').valido, true);
  assert.equal(comprarDesbloqueioTecnico(meta, 'fisiologista').valido, true);
  assert.equal(comprarPacoteConteudo(meta, 'pacote_hab_1').valido, true);
  assert.equal(comprarPacoteConteudo(meta, 'pacote_ev_1').valido, true);

  // Clubes modificam DEF/ATA do elenco inicial via modificadoresMeta
  const cRetranca = iniciarNovaCampanha('CLUB-RET', meta, { clubeId: 'retranca', tecnicoId: 'motivador' });
  const cAtaque = iniciarNovaCampanha('CLUB-ATA', meta, { clubeId: 'ataque_total', tecnicoId: 'negociador' });
  const defRet = cRetranca.elenco.find((j) => j.setor === 'DEF').atributos.marcacao;
  const defAta = cAtaque.elenco.find((j) => j.setor === 'DEF').atributos.marcacao;
  assert.ok(defRet > defAta);

  // Motivador dá +2 em todos atributos durante a partida
  const esc = prepEsc(cRetranca.elenco);
  const timeMotivado = montarTimeParaPartida(cRetranca, esc.titularesPorPapel, esc.reservasIds);
  const baseCa = cRetranca.elenco.find((j) => j.id === esc.titularesPorPapel.CA).atributos.finalizacao;
  const partidaCa = timeMotivado.jogadores.find((j) => j.papel === 'CA').atributos.finalizacao;
  assert.equal(partidaCa, Math.min(100, baseCa + 2));

  // Negociador dá -15% compra e +10% venda (55%)
  const ofertasNeg = gerarOfertasMercado(cAtaque, { id: 'c4_n1', camada: 4 });
  assert.equal(ofertasNeg[0].preco, Math.max(40, Math.round(ofertasNeg[0].precoBase * 0.85)));
  const vendaNeg = calcularValorVendaElenco(cAtaque, cAtaque.elenco[10]);
  const vendaPadrao = calcularValorVendaElenco({ modificadoresMeta: modificadoresMeta() }, cAtaque.elenco[10]);
  assert.ok(vendaNeg > vendaPadrao);

  // Pacotes de conteúdo ampliam habilidades e eventos disponíveis
  assert.equal(LISTA_TODAS_HABILIDADES.length, 16);
  assert.equal(TODOS_EVENTOS_CAMPANHA.length, 14);
  assert.equal(obterHabilidadesDisponiveis(meta.pacotesDesbloqueados).length, 13);
  assert.equal(obterEventosDisponiveis(meta.pacotesDesbloqueados).length, 11);

  // 5 Conquistas e Troféu em vitória épica (sem derrota, goleada 4x0 no chefão, $1200, Retranca, Dif. 3)
  assert.equal(CONQUISTAS_DEFINICOES.length, 5);
  meta.dificuldadeMaxDesbloqueada = 3;
  const campEpica = iniciarNovaCampanha('EPICA-3', meta, { clubeId: 'retranca', tecnicoId: 'fisiologista', dificuldade: 3 });
  campEpica.status = 'vitoria';
  campEpica.derrotas = 0;
  campEpica.vitorias = 10;
  campEpica.dinheiro = 1200;
  campEpica.nosVisitados = Array.from({ length: 12 }, (_, i) => `c${i + 1}_n1`);
  campEpica.historico = [
    {
      camada: 12,
      tipo: TIPOS_NO.CHEFAO,
      resultado: 'vitoria',
      placar: { meuTime: 4, rival: 0 },
      rivalNome: 'Imperador FC',
    },
  ];
  const resEpico = finalizarCampanhaNoMeta(meta, campEpica);
  assert.equal(resEpico.desbloqueios.trofeu.placarChefao, '4 × 0');
  assert.equal(meta.trofeus.length, 1);
  assert.equal(meta.conquistasDesbloqueadas.length, 5);
  assert.equal(meta.dificuldadeMaxDesbloqueada, 4);

  // Export/Import JSON + localStorage tolerante a falhas
  const json = exportarMetaJson(meta);
  const imp = importarMetaJson(json);
  assert.equal(imp.valido, true);
  assert.equal(imp.meta.trofeus.length, 1);
  assert.equal(imp.meta.conquistasDesbloqueadas.length, 5);
  assert.equal(importarMetaJson('{invalido').valido, false);

  const storageQuebrado = {
    getItem() { throw new Error('err'); },
    setItem() { throw new Error('err'); },
  };
  assert.equal(salvarMeta(meta, storageQuebrado), false);
  const fallback = carregarMeta(storageQuebrado);
  assert.equal(fallback.pontosLegado, 0);
});

test('ferramenta de equilíbrio (simulação headless) roda partidas completas com IA nos dois lados', () => {
  const sim = simularPartidasEquilibrio({
    quantidade: 20,
    forcaRival: 72,
    clubeId: 'equilibrado',
    tecnicoId: 'padrao',
  });
  assert.equal(sim.quantidade, 20);
  assert.equal(sim.vitorias + sim.empates + sim.derrotas, 20);
  assert.ok(sim.mediaGolsMeu >= 0 && sim.mediaGolsRival >= 0);
  assert.ok(sim.mediaEstaminaFinalMeu >= 0 && sim.mediaEstaminaFinalMeu <= 100);
  assert.ok(sim.mediaEstaminaFinalRival >= 0 && sim.mediaEstaminaFinalRival <= 100);
});

import {
  avaliarCruzamento,
  avaliarDibre,
  executarCruzamento,
  executarDibre,
} from '../js/regras/partida.js';
import {
  ehZonaLinhaDeFundo,
  podeCruzarNaZona,
} from '../js/dados/zonas.js';

test('atributo dibre e ação dibrar: aplica bônus pós-dibre (+12% e -50% pressão), ganha ímpeto e gera falta/pênalti ao sofrer falta no terço final', () => {
  const p = criarPartida();
  for (const j of [...p.times.meuTime.jogadores, ...p.times.rival.jogadores]) {
    assert.equal(typeof j.atributos.dibre, 'number');
    assert.ok(j.atributos.dibre >= 1 && j.atributos.dibre <= 100);
  }

  // Coloca ponta em Z4-E com marcador rival
  const ponta = p.times.meuTime.jogadores.find((j) => j.papel === 'PONTA_E');
  const marcador = p.times.rival.jogadores.find((j) => j.papel === 'LAT_D');
  ponta.zona = 'Z4-E';
  marcador.zona = 'Z4-E';
  p.portadorId = ponta.id;
  p.zonaBola = 'Z4-E';

  const prevDibreLocal = avaliarDibre(p, 'Z4-E');
  const prevDibreAvanco = avaliarDibre(p, 'Z5-E');
  assert.ok(prevDibreLocal);
  assert.ok(prevDibreAvanco);
  assert.equal(prevDibreLocal.acao, 'dibrar');
  assert.ok(prevDibreAvanco.calculo.ajustesChance.some((a) => a.rotulo === 'Infiltração terço final' && a.valor === 6));

  // Executa dibre avançando para a linha de fundo (Z5-E) com sucesso
  const estMarcadorAntes = obterEstamina(marcador);
  const resDibre = executarDibre(p, 'Z5-E', () => 0.05);
  assert.equal(resDibre.valido, true);
  assert.equal(resDibre.resultado.tipo, 'dibre');
  assert.equal(p.zonaBola, 'Z5-E');
  assert.equal(p.bonusDibre.meuTime, true);
  assert.equal(p.impeto.meuTime, 1);
  assert.ok(obterEstamina(marcador) < estMarcadorAntes); // cansou o marcador
  assert.equal(p.estatisticas.meuTime.dibresCertos, 1);

  // Próxima jogada do portador tem +12% de Marcador batido (Dibre) + +3% de Ímpeto (Nív. 1)
  const ca = p.times.meuTime.jogadores.find((j) => j.papel === 'CA');
  ca.zona = 'Z5-C';
  const prevPassePosDibre = avaliarPasse(p, ca.id);
  assert.ok(prevPassePosDibre.calculo.ajustesChance.some((a) => a.rotulo.includes('Marcador batido (Dibre)') && a.valor === 12));
  assert.ok(prevPassePosDibre.calculo.ajustesChance.some((a) => a.rotulo.includes('Ímpeto') && a.valor === 3));

  // Dibre derrubado dentro da grande área (Z5-C) por margem curta gera Pênalti
  const pPen = criarPartida();
  const caPen = pPen.times.meuTime.jogadores.find((j) => j.papel === 'CA');
  const zagPen = pPen.times.rival.jogadores.find((j) => j.papel === 'ZAG1');
  caPen.zona = 'Z5-C';
  zagPen.zona = 'Z5-C';
  pPen.portadorId = caPen.id;
  pPen.zonaBola = 'Z5-C';
  const prevPen = avaliarDibre(pPen, 'Z5-C');
  const sorteioQuase = (prevPen.calculo.chance + 5) / 100;
  const resPen = executarDibre(pPen, 'Z5-C', () => sorteioQuase);
  assert.equal(resPen.resultado.tipo, 'penalti');
  assert.equal(pPen.timeComBola, 'meuTime');
  assert.equal(pPen.bolaParadaContexto?.tipo, 'penalti');

  // Na cobrança de pênalti, a finalização tem base 78 e pressão de linha zerada
  const prevCobrancaPen = avaliarFinalizacao(pPen);
  assert.ok(prevCobrancaPen);
  assert.equal(prevCobrancaPen.calculo.base, 78);
  assert.equal(prevCobrancaPen.calculo.pressaoPortadorOrigem, 0);
});

test('cruzamento na linha de fundo, passe da linha de fundo (+15% finalização), chegada ao terço final e bolas paradas interativas', () => {
  assert.equal(ehZonaLinhaDeFundo('Z5-E', 'meuTime'), true);
  assert.equal(ehZonaLinhaDeFundo('Z5-D', 'meuTime'), true);
  assert.equal(ehZonaLinhaDeFundo('Z5-C', 'meuTime'), false);
  assert.equal(podeCruzarNaZona('Z5-E', 'meuTime'), true);
  assert.equal(podeCruzarNaZona('Z4-D', 'meuTime'), true);
  assert.equal(podeCruzarNaZona('Z3-E', 'meuTime'), false);

  const p = criarPartida();
  const ponta = p.times.meuTime.jogadores.find((j) => j.papel === 'PONTA_D');
  const ca = p.times.meuTime.jogadores.find((j) => j.papel === 'CA');
  ponta.zona = 'Z5-D';
  ca.zona = 'Z5-C';
  p.portadorId = ponta.id;
  p.zonaBola = 'Z5-D';

  // Avalia cruzamento da linha de fundo (Z5-D -> Z5-C, base 42)
  const prevCruz = avaliarCruzamento(p, ca.id);
  assert.ok(prevCruz);
  assert.equal(prevCruz.acao, 'cruzar');
  assert.equal(prevCruz.calculo.base, 42);
  assert.equal(prevCruz.receptor.id, ca.id);

  // Executa cruzamento com gol de cabeça
  const resGolCabeca = executarCruzamento(p, ca.id, () => 0.01);
  assert.equal(resGolCabeca.valido, true);
  assert.equal(resGolCabeca.resultado.tipo, 'gol');
  assert.equal(p.placar.meuTime, 1);

  // Passe rasteiro da linha de fundo para a área dá +10% no passe e prepara +15% na finalização (bonusCruzamento)
  const p2 = criarPartida();
  const pE = p2.times.meuTime.jogadores.find((j) => j.papel === 'PONTA_E');
  const ca2 = p2.times.meuTime.jogadores.find((j) => j.papel === 'CA');
  pE.zona = 'Z5-E';
  ca2.zona = 'Z5-C';
  p2.portadorId = pE.id;
  p2.zonaBola = 'Z5-E';

  const prevPasseFundo = avaliarPasse(p2, ca2.id);
  assert.ok(prevPasseFundo.calculo.ajustesChance.some((a) => a.rotulo.includes('Cruzamento rasteiro') && a.valor === 10));
  executarPasse(p2, ca2.id, () => 0.01);
  assert.equal(p2.bonusCruzamento.meuTime, true);

  const prevChuteArea = avaliarFinalizacao(p2);
  assert.ok(prevChuteArea);
  assert.ok(prevChuteArea.calculo.ajustesChance.some((a) => a.rotulo.includes('Passe da linha de fundo') && a.valor === 15));

  // Defesa difícil do goleiro em cabeceio após cruzamento espalma para Escanteio mantendo a posse ofensiva
  const p3 = criarPartida();
  const pE3 = p3.times.meuTime.jogadores.find((j) => j.papel === 'PONTA_E');
  const ca3 = p3.times.meuTime.jogadores.find((j) => j.papel === 'CA');
  pE3.zona = 'Z5-E';
  ca3.zona = 'Z5-C';
  p3.portadorId = pE3.id;
  p3.zonaBola = 'Z5-E';
  const prevCruz3 = avaliarCruzamento(p3, ca3.id);
  const resEscanteio = executarJogada(p3, prevCruz3, () => (prevCruz3.calculo.chance + 5) / 100, {
    rngHabilidade: () => 0.99,
  });
  assert.equal(resEscanteio.resultado.tipo, 'escanteio');
  assert.equal(p3.timeComBola, 'meuTime');
  assert.equal(p3.bolaParadaContexto?.tipo, 'escanteio');

  // No escanteio, cruzar na área recebe +12% de bônus
  ca3.zona = 'Z5-C';
  const prevCruzEscanteio = avaliarCruzamento(p3, ca3.id);
  assert.ok(prevCruzEscanteio);
  assert.ok(prevCruzEscanteio.calculo.ajustesChance.some((a) => a.rotulo.includes('Escanteio na área') && a.valor === 12));
});

test('finalização aprimorada: 16 turnos por lado, chute colocado (+6%) vs bomba (+rebote) e rebote na área (+16%)', () => {
  assert.equal(TURNOS_POR_LADO, 16);

  const p = criarPartida();
  const ca = p.times.meuTime.jogadores.find((j) => j.papel === 'CA');
  const ponta = p.times.meuTime.jogadores.find((j) => j.papel === 'PONTA_E');
  ca.zona = 'Z5-C';
  ponta.zona = 'Z5-E';
  p.portadorId = ca.id;
  p.zonaBola = 'Z5-C';

  const prevPadrao = avaliarFinalizacao(p, { tipoChute: 'padrao' });
  const prevColocado = avaliarFinalizacao(p, { tipoChute: 'colocado' });
  const prevBomba = avaliarFinalizacao(p, { tipoChute: 'bomba' });
  assert.ok(prevColocado.calculo.chance > prevPadrao.calculo.chance);
  assert.ok(prevColocado.calculo.chance > prevBomba.calculo.chance);

  // Bomba defendida dentro da faixa de rebote deixa atacante na área com +16% na próxima finalização
  const sorteioRebote = (prevBomba.calculo.chance + 20) / 100;
  const resRebote = executarJogada(p, prevBomba, () => sorteioRebote, {
    rngHabilidade: () => 0.99,
  });
  assert.equal(resRebote.resultado.tipo, 'rebote');
  assert.equal(p.timeComBola, 'meuTime');
  assert.equal(p.bonusRebote.meuTime, true);

  const prevPosRebote = avaliarFinalizacao(p, { tipoChute: 'colocado' });
  assert.ok(prevPosRebote.calculo.ajustesChance.some((a) => a.rotulo.includes('Rebote na área') && a.valor === 16));
});





