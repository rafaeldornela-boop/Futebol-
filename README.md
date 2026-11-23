# Prancheta 11 — Futebol Tático Vertical por Zonas (Carreira Roguelike)

Jogo de futebol tático de técnico por turnos em **HTML, CSS e JavaScript puros** (ES Modules, sem backend e sem dependências de execução), combinando partida tática vertical de 17 zonas, modo campanha roguelike com mapa de 12 camadas, meta-progressão de clube e **ciclo completo de carreira dos jogadores** através das temporadas.

---

## Como rodar

- **Desenvolvimento local**: servidor estático na porta `3000` (`npm run dev`).
- **Testes automatizados (`node:test`)**:
  ```bash
  npm test
  ```

---

## Principais Sistemas Implementados

### 1. Campo Vertical de 17 Zonas & Partida por Turnos
- **Grade vertical**: 3 corredores (`E`, `C`, `D`) × 5 faixas (`1` defesa → `5` ataque) = 15 zonas (`Z1-E` .. `Z5-D`) + `GK` (meu goleiro) e `GKR` (goleiro rival).
- **16 turnos por lado**: partidas dinâmicas com posse, passe, condução, drible (`Dibrar`), cruzamento da linha de fundo, finalização (chute colocado e chute bomba com rebote), bolas paradas interativas (escanteio, falta, pênalti), disputas de segunda bola e narração natural sem expor porcentagens cruas.
- **4 formações táticas** (`4-3-3`, `4-4-2`, `3-5-2`, `4-2-3-1`) com mapa de calor de pressão por fase (`ATRÁS`, `MEIO`, `FRENTE`), **3 posturas táticas** (`Equilibrada`, `Ofensiva`, `Defensiva`) e **relógio de decisão** opcional nas dificuldades 1–5.
- **Defesa baseada em estamina**: ordens defensivas (`Pressionar`, `Fechar linha de passe`, `Recuar o bloco`, `Falta tática`) e habilidades defensivas ativas gastam estamina dos jogadores envolvidos, com fadiga afetando atributos em faixas (`×1,00`, `×0,92`, `×0,82`, `×0,70`).
- **Habilidades especiais guiadas por dados** (`js/dados/habilidades.js` + `js/regras/habilidades.js`): ativas ofensivas, ativas defensivas e passivas.

### 2. Identidade Individual, Atributos (escala 40–50) & Apresentação Qualitativa
- **Elenco inicial realista**: média funcional entre **40 e 50**, com alta variância entre atributos conforme o perfil de cada atleta — deixando espaço real para evolução e valorizando contratações.
- **Avaliação posicional ponderada** (`js/jogador/identidade.js`): cada posição pondera os atributos relevantes para a função (sem penalizar um zagueiro por finalização baixa).
- **Familiaridade posicional granular**: substitui penalidade fixa única por níveis reais (`Natural`, `Adaptado`, `Improvisado`, `Fora de função`, `Deslocado`).
- **Pé dominante e qualidade do pé fraco (1–5)**: influencia contextualmente passes sob pressão, inversões, cruzamentos e ângulos de finalização.
- **Camada mental (`Concentração`)**: atua sob pressão alta, fadiga tardia e momentos decisivos (com ganchos prontos para futuros atributos mentais).
- **Apresentação qualitativa (`js/ui/apresentacao.js`)**: a interface normal traduz atributos, chances e potencial de olheiro em leitura qualitativa (`Muito fraco` → `Excepcional`, `Muito seguro` → `Muito arriscado`, barras visuais), mantendo números exatos apenas no painel **Detalhes do cálculo (Debug)** e na **Ferramenta de Equilíbrio (200 partidas)**.

### 3. Ciclo Completo de Carreira dos Jogadores & Temporadas
- **Idade e 7 faixas de carreira** (`js/jogador/carreira.js`):
  - `16–18`: Formação · `19–21`: Jovem · `22–25`: Desenvolvimento · `26–29`: Auge · `30–32`: Veterano · `33–35`: Declínio · `36+`: Veterano em fim de carreira.
  - A idade avança **+1 ano apenas na virada de temporada (`avancarTemporada()`)** e nunca após partidas individuais. Jogadores contratados no meio da temporada preservam sua idade atual.
- **Desenvolvimento e teto de potencial** (`js/jogador/desenvolvimento.js` + `carreira.js`):
  - Evolução direcionada apenas em atributos elegíveis da posição (nunca `+1` plano em tudo), com retorno decrescente, influência da curva individual (`precoce`, `equilibrada`, `tardia`), minutagem e possibilidade realista de estagnação.
  - **O potencial individual nunca é ultrapassado.**
- **Auge, declínio gradual e longevidade individual**:
  - No auge (`26–29`), há estabilidade alta e refinamento técnico/mental suave.
  - A partir de `30–32+`, cada atleta entra em declínio gradual conforme sua **longevidade oculta** (goleiros duram mais). Atributos físicos (`velocidade`) caem primeiro, enquanto atributos mentais (`concentracao`) e técnico-táticos (`passe`, `dominio`, `posicionamento`, `tecnica`, `interceptacao`) resistem fortemente — tornando veteranos opções táticas úteis.
- **Experiência e estatísticas de carreira**: partidas, gols, assistências e títulos aumentam a experiência acumulada (com retorno decrescente limitado).
- **Aposentadoria progressiva e Hall da Fama**:
  - Probabilidade crescente por idade (baixa em `36–37`, moderada em `38–39`, alta em `40+`, ajustada por longevidade e posição; não automática aos 36).
  - Aposentados são removidos do elenco ativo, registrados em `historicoAposentados` (com nome, idade, clube, posição, atributos finais, jogos, gols, assistências, títulos e temporada) e bloqueados de reaparecer no mercado.
- **Mercado consciente de idade e valor multifatorial**:
  - Perfis coerentes (`Promessa` 16–21, `Jogador pronto` 22–29, `Veterano` 30–35, `Veterano de experiência` 32+ com menos velocidade e alto mental/técnico, além de `Joias da Base` 16–19).
  - Valor de mercado considera atributos atuais, idade, potencial ponderado pela faixa etária, habilidades, posição e especialização.
- **Virada de temporada centralizada (`avancarTemporada()`)**: função única protegida contra execução duplicada que avança temporada, envelhece elenco, aplica desenvolvimento/declínio, processa aposentadorias, atualiza mercado e regenera o mapa da nova temporada.

### 4. Modo Campanha & Meta-Progressão do Clube
- **Mapa vertical de 12 camadas** determinístico por **seed**, sem cruzamento de caminhos, com 9 tipos de nó (`Partida`, `Treino`, `Mercado`, `Patrocínio`, `Fisioterapia`, `Torcida`, `Descanso`, `Evento`, `Misterioso`) e `Chefão` na camada 12.
- **Meta-progressão (`js/meta/meta.js`)**: Pontos de Legado, dificuldades `0–5`, melhorias permanentes (`Torcida`, `Estádio`, `Base`, `Equipamentos`), uniformes, clubes iniciais, técnicos, pacotes de conteúdo, conquistas, sala de troféus e exportação/importação JSON.

---

## Estrutura de Pastas

```text
index.html
css/style.css
js/
  main.js                     # Orquestração da UI, campanha e partida
  dados/
    zonas.js                  # Grade vertical 3×5 + GK/GKR, vizinhança, distância, espelho
    formacoes.js              # 4-3-3, 4-4-2, 3-5-2, 4-2-3-1 e movimentação por fase
    habilidades.js            # Catálogo de habilidades especiais orientado a dados
    times.js                  # Elenco inicial (escala 40–50) e modelo rival
  jogador/
    identidade.js             # Avaliação posicional, familiaridade, pé dominante, concentração
    desenvolvimento.js        # Potencial, tetos, treinos com retorno decrescente, scouting
    carreira.js               # Idade, 7 faixas, longevidade, experiência, declínio, aposentadoria
  regras/
    calculo.js                # Pressão dupla e cálculos de passe, condução, drible, cruzamento, chute
    defesa.js                 # Ordens defensivas por estamina, falta tática e contra-ataque
    estamina.js               # Custos, fadiga e atributos efetivos
    habilidades.js            # Modificadores ativos/passivos
    lances.js                 # Disputas de segunda bola, encadeamento e narração natural
    partida.js                # Motor da partida (16 turnos/lado) e `partida()` encapsulada
    postura.js                # Posturas táticas e adaptação da IA
    substituicao.js           # Substituições (até 5/jogo) e trocas automáticas do rival
  rival/ia.js                 # IA tática do adversário
  campanha/
    constantes.js             # Parâmetros econômicos, mapa e tipos de nó
    estado.js                 # Estado da campanha, valor de mercado, rivais e persistência segura
    mapa.js                   # Gerador de mapa 12 camadas por seed sem cruzamento
    eventos.js                # Eventos narrativos da campanha
    nos.js                    # Resolução de nós, mercado etário e `avancarTemporada()`
  meta/meta.js                # Legado, melhorias do clube, clubes/técnicos, conquistas e JSON
  debug/simulacao.js          # Simulador headless (200 partidas) para balanceamento
  ui/
    apresentacao.js           # Leitura qualitativa (atributos, chances, pressão, carreira)
    campo.js                  # Renderização do campo vertical, chips, prévia e painel debug
    clube.js                  # Tela do Clube (melhorias e desbloqueios)
    formacao.js               # Mapa de calor de pressão por formação e fase
    mapa.js                   # HUD da campanha, mapa SVG e diário
    menu.js                   # Menu inicial (clube, técnico, dificuldade, seed)
    relogio.js                # Relógio de decisão
    telas.js                  # Escalação, Treino, Mercado, Elenco/Hall da Fama, Fim de Campanha
    trofeus.js                # Sala de Troféus
tests/
  regras.test.mjs             # Suíte automatizada de regras (node:test)
```
