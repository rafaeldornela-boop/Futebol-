# Prancheta 11 — Futebol Tático por Zonas

Jogo de futebol de técnico por turnos em **HTML, CSS e JavaScript puros** (sem React, sem backend e sem banco de dados), totalmente em português do Brasil.

## Estrutura do Projeto

```text
├── index.html              # Tela inicial, placar, campo vertical em 17 zonas, defesa e modais
├── css/
│   └── style.css           # Estilo do campo vertical 3×5 + GK/GKR, pressão e responsividade
├── js/
│   ├── main.js             # Inicialização, tela inicial com seed, fluxo da campanha e partida
│   ├── campanha/
│   │   ├── constantes.js   # Constantes de campanha (dinheiro, pesos do mapa, renda, lesão, rivais)
│   │   ├── eventos.js      # Catálogo de 8 eventos com 2–3 escolhas e consequências explícitas
│   │   ├── estado.js       # Estado da campanha, PRNG por seed, persistência em localStorage e rivais
│   │   ├── mapa.js         # Gerador de mapa 12 camadas sem cruzamento estilo Slay the Spire
│   │   └── nos.js          # Lógica dos 9 tipos de nó + chefão, escalação, pós-partida e mercado
│   ├── dados/
│   │   ├── zonas.js        # Grade 3×5 (Z1-E..Z5-D) + GK e GKR, distância, vizinhança e espelho
│   │   ├── formacoes.js    # Formação 4-3-3 por fase (atrás, meio, frente) e balanço lateral
│   │   ├── habilidades.js  # Catálogo declarativo das 10 habilidades especiais (nível, custo, usos, efeito)
│   │   └── times.js        # Dois times fictícios (11 titulares + 7 reservas cada, estamina 100 e habilidades)
│   ├── regras/
│   │   ├── estamina.js     # Constantes no topo; faixas de fadiga, custo das jogadas e deslocamento
│   │   ├── habilidades.js  # Motor de modificadores de habilidades ativas e passivas
│   │   ├── calculo.js      # Constantes no topo; eficiência, pressão dupla, passes, condução e chute
│   │   ├── defesa.js       # Ordens defensivas por estamina, fallback por eficiência, falta tática e contra-ataque
│   │   ├── substituicao.js # Até 5 trocas/partida (1/turno sem gastar turno) e auto-troca do rival (<30 est.)
│   │   └── partida.js      # Motor da partida + função encapsulada partida(meuTime, rival, opcoes)
│   ├── debug/
│   │   └── simulacao.js    # Ferramenta de equilíbrio (200 partidas automáticas com IA dos dois lados)
│   ├── meta/
│   │   ├── constantes.js   # Custos de melhorias, uniformes, clubes, técnicos, pacotes e 5 conquistas
│   │   ├── melhorias.js    # Compra de níveis (0–5) do Clube e compra/equipe de uniformes
│   │   ├── desbloqueios.js # Desbloqueio de clubes, técnicos, pacotes, troféus e conquistas
│   │   └── meta.js         # Estado persistente, Pontos de Legado, JSON e modificadoresMeta()
│   ├── rival/
│   │   └── ia.js           # IA genérica (meuTime/rival) com peso proporcional à chance e 25% habilidades
│   └── ui/
│       ├── campo.js        # Renderização vertical, chips com uniforme/estamina/habilidades, linha SVG e cálculo
│       ├── clube.js        # Tela do Clube (melhorias, uniformes, desbloqueios e backup JSON)
│       ├── mapa.js         # Mapa vertical em 12 camadas com arestas SVG, força do rival e HUD
│       ├── menu.js         # Menu inicial (clube, técnico, dificuldade 0–5, seed e navegação)
│       ├── telas.js        # Escalação, Treino, Mercado (incl. Base), Patrocínio, Eventos e Fim de Campanha
│       └── trofeus.js      # Sala de Troféus e painel das 5 Conquistas
└── README.md               # Documentação do projeto
```

## Como Rodar

Como o jogo utiliza módulos ES nativos do navegador (`<script type="module">`), sirva a pasta do projeto com um servidor HTTP local:

```bash
# Opção 1: Python 3
python3 -m http.server 8000

# Opção 2: Node.js
npx serve .
```

Em seguida, abra `http://localhost:8000` no navegador.

## Meta-Progressão (Entre Campanhas)

Todo efeito permanente entre campanhas passa exclusivamente por `modificadoresMeta()` (`js/meta/meta.js`), mantendo o restante do jogo desacoplado:

- **Pontos de Legado**: ganhos ao fim de toda campanha (mesmo com derrota) pela fórmula `2 × camadas completadas + 3 × vitórias + 1 × empates + 30 (se vencer o Chefão) + 5 × nível de dificuldade`.
- **Dificuldade (0 a 5)**: cada nível soma `+3` à força base dos rivais; vencer no nível `N` desbloqueia `N + 1`.
- **Tela do Clube**:
  - **Torcida** (`0–5`): `+4%` de receita em partidas e patrocínios por nível.
  - **Estádio** (`0–5`): bilheteria extra por partida = `15 × nível do estádio × (1 + 0,10 × nível da torcida)`.
  - **Categorias de base** (`0–5`): o mercado sempre oferece `N` jovens baratos (`45–55`), que evoluem `+1` atributo aleatório por partida disputada.
  - **Equipamentos** (`0–5`): `+2` estamina recuperada entre nós e `−2%` nos custos de estamina na partida por nível.
  - **Uniformes**: 6 paletas de cores desbloqueáveis aplicadas aos chips do seu time em campo.
  - **Clubes iniciais**: `Equilibrado` (grátis), `Retranca` (20 pts: DEF `+4`, ATA `−3`) e `Ataque Total` (30 pts: ATA `+4`, DEF `−3`).
  - **Técnicos**: `Clássico` (grátis), `Motivador` (15 pts: `+2` atributos na partida), `Negociador` (20 pts: compras `−15%`, vendas `+10%`) e `Fisiologista` (25 pts: `+5` estamina entre nós).
  - **Pacotes de conteúdo** (20 pts cada): 2 pacotes com 3 habilidades novas cada e 2 pacotes com 3 eventos novos cada.
- **Sala de Troféus e Backup JSON**: registra campanhas vencidas (clube, técnico, dificuldade, seed e placar da final), 5 conquistas e exportação/importação manual em JSON (além de `localStorage` protegido em `try/catch`).
- **Ferramenta de Equilíbrio (Modo Debug)**: acessível pelo menu inicial, roda 200 partidas automáticas com a IA nos dois lados exibindo `%` vitórias/empates/derrotas, média de gols e média de estamina final.

## Modo Campanha

- **Elenco e Seed**: O clube inicia com `$300` e 18 jogadores (`2 GOL, 6 DEF, 5 MEI, 5 ATA`). Toda a campanha é gerada por uma **seed visível** (repetível na tela inicial ou no resumo final) e salva automaticamente no `localStorage` com `try/catch`.
- **Mapa em 12 Camadas**: Suba da camada 1 até o **Chefão** (camada 12) por caminhos que se fundem sem cruzamento. Camadas 1–2 têm só partidas; camada 11 é descanso total; camadas 3–10 sorteiam entre `Partida`, `Treino` (`>=2`), `Evento`, `Misterioso`, `Descanso`, `Mercado` (`>=1`), `Patrocínio` (`>=1`), `Fisioterapia` (`>=1`) e `Torcida`.
- **Entre Nós e Lesões**: Passar por qualquer nó que não seja descanso recupera `+10` de estamina no elenco (+ bônus de Equipamentos e Fisiologista). Antes dessa recuperação, atletas que terminarem a partida com estamina `< 20` têm `25%` de chance de sofrer lesão (impedidos de jogar até a `Fisioterapia`).
- **Vitória e Demissão**: Vencer o Chefão consagra o título da temporada; perder 3 partidas seguidas (empate zera a sequência) ou perder na final demite o técnico.

## Núcleo da Partida

- **Campo Vertical (17 zonas)**: `GK` embaixo (faixa 0), grade `3 × 5` (`Z1-E` a `Z5-D`, faixas 1 a 5) e `GKR` no topo (faixa 6). Distância calculada pela maior diferença entre faixa e corredor, com vizinhança inclusive diagonal.
- **Formação 4-3-3 por fase**: os times se reposicionam no início de cada turno conforme a fase da bola (`ATRÁS`, `MEIO`, `FRENTE`), mantendo balanço defensivo (o lateral oposto ao da bola não passa da faixa 2).
- **Estamina e Fadiga (`estamina.js`)**: jogadores começam com 100 (sem recuperação na partida). A fadiga multiplica **todos** os atributos usados nos cálculos (`70–100: ×1,00 | 40–69: ×0,92 | 20–39: ×0,82 | <20: ×0,70`).
  - **Custo das jogadas**: passe curto/trás/lateral (`2`/`1`), frente (`3`/`2`), longo/invertido (`5`/`3`), conduzir (`6`), finalizar (`6`) e deslocamento de zona-base no turno (`1` por faixa mudada).
- **Pressão Dupla (0–100)**:
  - **No portador**: força `desarme × 0,6 + marcação × 0,4` (já com multiplicador de fadiga).
  - **Na linha de passe**: força `interceptação × 0,6 + marcação × 0,4` (pinta as zonas de vermelho).
- **Defesa Interativa por Estamina**: no turno do rival, ele anuncia origem → destino, tipo e chance; cada ordem mostra o custo e quem vai gastar (com fallback automático por maior eficiência):
  - `Pressionar o portador` (−10 est. nos 2 maiores na bola) · `Fechar linha de passe` (−6 est. nos 2 maiores no destino) · `Recuar o bloco` (custo só de deslocamento) · `Falta tática` (−8 est. no maior na bola, risco de amarelo/vermelho) · `Manter marcação` (0 est.).
- **Habilidades Especiais (`dados/habilidades.js` e `regras/habilidades.js`)**: jogadores têm 0 a 2 habilidades em sistema guiado por dados (nível inicial 1).
  - **Ofensivas ativas** (1 uso, gastam estamina do portador): `Passe de infiltração` (−50% pressão no destino em passe frente/longo, custo 8), `Arrancada` (conduz 2 zonas, base 60, custo 10) e `Chute de fora` (finaliza das faixas 3–4, base 10, custo 8).
  - **Defensivas ativas** (1 uso, ordens no turno do rival): `Carrinho cirúrgico` (pressão no portador ×2 sem risco de falta, custo 10) e `Voo` (+15 na defesa do goleiro em finalização, custo 10).
  - **Passivas**: `Leitura de jogo` (+10% força de interceptação), `Saída de bola` (+10% passes do goleiro), `Passe de primeira` (+5% passes curtos/laterais), `Liderança` (+3 posicionamento ao time em campo) e `Fôlego` (−20% custos de estamina do jogador), além de 6 habilidades dos pacotes desbloqueáveis.
- **Substituições (`substituicao.js`)**: 7 reservas por time (`1 GOL, 2 DEF, 2 MEI, 2 ATA`), até 5 trocas na partida e 1 por turno (sem gastar o turno). O reserva herda a vaga, goleiro só troca por goleiro, e o rival troca automaticamente quem ficar abaixo de 30 de estamina.
- **Contra-ataque**: recuperar a bola por desarme ou interceptação quando o rival estava na fase `FRENTE` concede `+10%` na sua primeira jogada.
