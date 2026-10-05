# ReplayX

Plataforma de trading no navegador, ao estilo do TradingView, feita para **Bar Replay**, **backtest manual e automático** e **criação de estratégias** (visual ou em script) — com os índices sintéticos da Deriv, forex, metais, cripto, índices, futuros e ações.

Funciona sem configuração: `npm install && npm run dev` e abre `http://localhost:3000`.

---

## O que tem

### Gráfico
- Velas, barras OHLC, Heikin Ashi, linha, área, linha de base, colunas e "hollow candles".
- **Qualquer intervalo**: 1m … 12h, 1D, 1W, 1M e intervalos personalizados (ex.: `7m`, `90m`, `3h`). Escreve o número e carrega Enter.
- Layouts de 1, 2 (horizontal/vertical), 3 e 4 gráficos com sincronização de símbolo, intervalo e cruz (no replay, todos os gráficos andam no mesmo instante).
- **Definições do gráfico** como no TradingView: cores do corpo, borda e pavio das velas, linha/área, fundo (cor única ou gradiente), grelha, mira, texto das escalas e marca de água; escala normal, logarítmica, percentagem ou indexada a 100; etiqueta e linha do último preço; **contador de tempo até ao fecho da vela**. Seletor de cores com as tuas cores guardadas, código hex e opacidade.
- **Barra de baixo** como no TradingView: períodos 1D, 5D, 1M, 3M, 6M, YTD, 1A, 5A e Tudo (escolhem o intervalo e o tempo à vista), ir para uma data (sem replay), relógio com o fuso horário e escalas %, log e auto.
- Botões de navegação por cima do gráfico (afastar, aproximar, para trás, para a frente, repor) e **“+” junto à escala de preços** (alerta, ordem ou linha horizontal nesse preço).
- **Eventos económicos** (⚡) no fundo do gráfico para forex e metais, com a descrição ao passar o rato.
- Auto-escala, fuso horário configurável, temas claro e escuro, cores personalizáveis.
- Lista de observação com preços em tempo real, pesquisa de símbolos (incluindo todos os pares da Binance e o pesquisador do Yahoo), símbolos recentes e favoritos.

### Ferramentas de desenho (28)
Linha de tendência, raio, linha de informação, linha estendida, linha com seta, linha horizontal / raio horizontal / vertical / cruz, canal paralelo, retração e extensão de Fibonacci, forquilha de Andrews, retângulo, elipse, triângulo, caminho, pincel, texto, nota, etiqueta de preço, setas, **posição longa e curta** (com resultado calculado), intervalo de preço, intervalo de datas e régua.
Íman (OHLC, também com Ctrl), bloquear/ocultar, desfazer/refazer, árvore de objetos, estilos editáveis (cor, espessura, tracejado, níveis de Fibonacci). Os desenhos ficam ancorados ao tempo e preço, por isso **mantêm-se ao mudar de intervalo**.

- **Favoritos:** estrela nas ferramentas e nos indicadores; barra flutuante de favoritos (arrasta-se) e menu rápido de indicadores favoritos.
- **Alinhar ângulo:** com Shift ou pelo botão da bússola, as linhas encaixam de 15 em 15° (horizontal, 45°, vertical…) e mostram os graus.
- **Texto nas linhas:** botão “T” na barra do desenho; posição (início/centro/fim) e por cima/sobre/por baixo da linha, cor, tamanho, negrito e itálico.
- **Modelos:** guarda o estilo e o texto de um desenho com um nome e volta a usá-lo noutros (“Modelo” → “Guardar como modelo…”).
- **Visibilidade por intervalo:** mostrar um desenho só em minutos, horas, dias, semanas ou meses.
- **Copiar/colar** desenhos com Ctrl+C / Ctrl+V.
- **Replay no telemóvel:** aparece uma linha de corte (✂) com uma pega que se **arrasta livremente** até ao ponto de partida (perto das margens o gráfico desloca-se sozinho); mostra a data, tem **ajuste fino** (‹ › de barra em barra) e só começa ao tocar em "Começar aqui".
- **Zoom com dois dedos** rápido e progressivo (quanto mais depressa abres os dedos, mais aproxima), e mover o gráfico com os dois dedos.
- **Barra de ferramentas no telemóvel** estável: fica aberta enquanto mudas opções e fecha ao escolher uma ferramenta. Com uma ferramenta ativa, tocar no desenho selecionado edita-o em vez de criar outro. Botão para esconder as barras de baixo.
- **Telemóvel:** toque mais tolerante, pegas maiores e uma **lupa** (como no MT5) que mostra ampliado o ponto debaixo do dedo.

### Indicadores (36)
Médias (SMA, EMA, WMA, HMA, DEMA, TEMA, VWMA e cruzamento), Bollinger, Keltner, Donchian, VWAP, Supertrend, Parabolic SAR, Ichimoku, ZigZag, Regressão linear, Pivots, Fractais, Volume, RSI, MACD, Estocástico, Stoch RSI, CCI, Williams %R, ADX/DMI, ATR, Desvio padrão, Largura de Bollinger, Momentum, ROC, Awesome Oscillator, TRIX, Aroon, OBV, MFI, CMF e mais. Todos com parâmetros, cores e painéis próprios.

A legenda de cada indicador fica no topo do seu painel e acompanha quando mudas a altura dos painéis. **Toca (ou clica) no nome** para abrir as ações: ocultar, definições, adicionar alerta e remover.

### Bar Replay
- Escolhe o ponto de partida clicando no gráfico, por data, ou ao acaso.
- Avançar/recuar barra a barra, reprodução automática com várias velocidades, "avançar por" um intervalo diferente do gráfico (ex.: gráfico em 1h, avançar de 5 em 5 minutos).
- **Mudar de intervalo durante o replay** sem revelar o futuro: a barra em formação é reconstruída a partir dos intervalos mais finos.
- Vários gráficos em replay sincronizado no mesmo instante.
- Conta de simulação com ordens a mercado, limite e stop, SL/TP, trailing stop, arrastar linhas de SL/TP no gráfico, break-even e fecho individual ou de todas as posições.
- Execução **dentro da barra** (o preço percorre abertura → extremo mais próximo → outro extremo → fecho), spread, derrapagem e comissão configuráveis.
- Sessões guardadas: retoma um replay mais tarde exatamente onde o deixaste.

### Paper trading em tempo real
A mesma conta de simulação a correr sobre os preços ao vivo.

### Alertas (como no TradingView)
- **Fonte:** preço ou qualquer indicador do gráfico (RSI, médias, MACD…).
- **Condição:** cruza, cruza para cima/baixo, maior/menor que, entra/sai do canal, dentro/fora do canal.
- **Alvo:** valor, canal entre dois valores, desenho (linha de tendência, raio, linha estendida, horizontal, canal paralelo, retângulo), outro indicador ou o preço.
- **Frequência:** só uma vez, uma vez por barra, uma vez por barra no fecho, sempre. Validade opcional, nome e mensagem com `{{ticker}}`, `{{close}}`, `{{value}}`, `{{time}}`, `{{interval}}`.
- **Aviso:** janela no ecrã até ser fechada, som e notificação no telemóvel/computador. Funcionam também durante o replay.
- Criar pelo painel de alertas, pelo botão direito no gráfico, pelo sino de um desenho ou de um indicador na legenda.
- Os alertas são verificados no navegador: precisam da app aberta (no telemóvel o sistema pode pausá-la em segundo plano).

### App instalável (PWA)
Instala-se no telemóvel e no computador (Android/Chrome: botão "Instalar"; iPhone: Partilhar → Adicionar ao ecrã principal). Abre em ecrã inteiro, funciona sem internet com a última versão guardada, avisa quando há versão nova e tem atalhos para o Replay e os Alertas. As notificações dos alertas usam o service worker; no iPhone precisam da app instalada (iOS 16.4+).

### Diário e estatísticas
Lista de operações com notas e etiquetas, curva de capital, lucro líquido, taxa de acerto, fator de lucro, expectativa, múltiplos R, MAE/MFE, drawdown máximo, sequências, análise por dia da semana, hora e direção e **simulação de Monte Carlo**.

### Estratégias
- **Construtor visual**: regras de entrada/saída por blocos (indicadores, preços, cruzamentos, comparações, filtros de sessão), gestão de risco (SL/TP por ATR, pontos ou percentagem, risco por operação, trailing). Modelos prontos para começar.
- **Scripts** em JavaScript com API ao estilo Pine (`ta.ema`, `ta.crossover`, `strategy.entry`, `plot`, `input`…), editor com realce e autocompletar, erros com número da linha. Os scripts também podem ser usados só como **indicadores**.
- **Testador de estratégias**: resultados, curva de capital, lista de operações e marcadores no gráfico.
- **Otimizador** (grelha, aleatório ou genético) por lucro, fator de lucro, Sharpe, expectativa ou drawdown.
- **Walk-forward** (treina numa janela, testa na seguinte) com eficiência calculada — é assim que a estratégia "aprende" e é validada em dados que nunca viu.
- **Multi-mercado**: corre a mesma estratégia em vários símbolos e intervalos de uma vez.
- Tudo corre num Web Worker para não bloquear o gráfico.

### Notícias e calendário
Notícias de forex, cripto, ações e matérias-primas (RSS públicos) e calendário económico semanal.

### Planos
- **Grátis:** replay a partir de 15m, 1 gráfico, 3 indicadores por gráfico e 3 backtests por dia.
- **Pro** (100 MT/mês, 270 MT/trimestre, 1000 MT/ano): replay em todos os intervalos, até 4 gráficos, indicadores e backtests sem limite, otimizador, walk-forward e multi-mercado.
- Contas novas têm 7 dias de Pro grátis. Os preços e limites estão em `src/core/plans.ts`.
- O plano vem do documento `replayx_users/{uid}` no Firestore (só o servidor o escreve). O pagamento é feito pela **ZumboPay** (M-Pesa e cartão) pelas rotas `/api/billing/checkout`, `/api/billing/status` e `/api/billing/webhook`: o preço vem sempre do servidor, o webhook valida a assinatura, a ativação é idempotente e pagar antes do fim soma ao período em curso. Sem renovação automática.
- Contas novas: 7 dias de Pro. Páginas legais em `/termos`, `/privacidade` e `/aviso-de-risco` (rever com um advogado antes de vender).

### Conta
Login com **Google** ou **e-mail/palavra-passe** (Firebase Auth), recuperação de palavra-passe e **modo convidado** (tudo fica só no navegador). Com sessão iniciada, as configurações, layouts, desenhos, contas, sessões de replay, estratégias e alertas são sincronizados no Firestore.

---

## Fontes de dados (todas gratuitas e sem chave)

| Fonte | Mercados | Como |
|---|---|---|
| **Deriv** (WebSocket público) | Índices sintéticos (Volatility, Volatility 1s, Boom/Crash, Step, Jump, Range Break, Bear/Bull, DEX, Drift Switch, baskets), forex, metais, índices OTC | `ticks_history` + subscrição de ticks; troca automática entre o endpoint novo e os antigos |
| **Binance** (REST + WebSocket) | Todos os pares à vista | klines + streams |
| **Yahoo Finance** (via rotas `/api/market/*` do próprio servidor) | Índices, futuros, ações, ETFs | evita CORS |
| **Simulado** | Mercados sintéticos gerados localmente | funciona offline e serve para testes |
| RSS públicos / Forex Factory (via `/api/news` e `/api/calendar`) | Notícias e calendário | — |

Não é preciso configurar nenhuma chave de API.

---

## Executar

```bash
npm install
npm run dev          # http://localhost:3000
```

Produção:

```bash
npm run build
npm start
```

### Publicar na Vercel
1. Importa este repositório na Vercel (framework: Next.js; não precisa de variáveis de ambiente).
2. No [Firebase Console](https://console.firebase.google.com/) → projeto **coffee-spark-ai-barista-e7a91** → *Authentication* → *Settings* → *Authorized domains*, adiciona o domínio da Vercel (ex.: `replayx.vercel.app`). Sem isto o login com Google mostra "domínio não autorizado" (o login por e-mail e o modo convidado funcionam na mesma).
3. As regras do Firestore estão neste repositório (`firestore.rules`). Publica-as a partir daqui (precisa do [Firebase CLI](https://firebase.google.com/docs/cli) e de `firebase login`):
   ```bash
   firebase deploy --only firestore:rules
   ```
   Ou, sem instalar nada: copia o conteúdo de `firestore.rules` para *Firestore Database* → *Rules* na consola e carrega em *Publish*.
   Até lá a sincronização na nuvem falha com "permissão negada" e a app continua a guardar tudo localmente.

### Pagamentos (ZumboPay)
1. Na Vercel → *Settings → Environment Variables*, define `ZUMBOPAY_API_KEY`, `ZUMBOPAY_MERCHANT_ID`, `ZUMBOPAY_WALLET_ID`, `ZUMBOPAY_WEBHOOK_SECRET` e `FIREBASE_SERVICE_ACCOUNT_KEY` (JSON da chave de serviço do Firebase: *Project settings → Service accounts → Generate new private key*).
2. No painel da ZumboPay (*Programadores → Webhooks*) acrescenta `https://<o-teu-domínio>/api/billing/webhook` com os eventos `payment.succeeded`, `payment.failed` e `payment.refunded`. A mesma conta pode servir o MajorStockX: o ReplayX ignora os pagamentos que não são seus.
3. Define também `NEXT_PUBLIC_OPERATOR_NAME` (opcional: por omissão aparece **Major Group** como titular), `NEXT_PUBLIC_SUPPORT_EMAIL` e `NEXT_PUBLIC_SUPPORT_WHATSAPP` (aparecem nas páginas legais) e, quando tiveres, `NEXT_PUBLIC_DERIV_APP_ID`.
4. Faz uma compra de teste de 100 MT e confirma que o Pro se ativa sozinho.

### Outro projeto Firebase (opcional)
Por omissão usa o projeto Firebase próprio do ReplayX (`coffee-spark-ai-barista-e7a91`). Para usar outro, copia `.env.example` para `.env.local`, preenche as variáveis `NEXT_PUBLIC_FIREBASE_*`, muda o projeto em `.firebaserc` e publica as regras nesse projeto.

---

## Testes

```bash
npm run typecheck
npm run lint
npm test             # testes unitários (vitest): intervalos, agregação, dados simulados, motor de ordens, backtester, scripts, otimizador, RSS
npm run build && npm run test:e2e   # ponta a ponta (Playwright)
```

Os testes de ponta a ponta simulam a Deriv (endpoint novo e antigo) e a Binance, fazem um replay completo com mudança de intervalo, ordens e diário, verificam desenhos entre intervalos e correm o testador, scripts e otimizador. Para usar um Chromium já instalado:

```bash
PW_CHROMIUM=/caminho/para/chrome npm run test:e2e
```

---

## Atalhos

| Tecla | Ação |
|---|---|
| Shift + → / ← | Replay: avançar / recuar uma barra |
| Shift + ↓ | Replay: reproduzir / pausa |
| Escrever letras | Procurar símbolo |
| Números + Enter | Mudar intervalo (`15`, `4h`, `1D`…) |
| `/` | Indicadores |
| Alt + T / H / V / F | Tendência / horizontal / vertical / Fibonacci |
| Alt + Shift + R | Retângulo |
| Alt + L / Alt + S | Posição longa / curta |
| Alt + B / Alt + N | Comprar / vender a mercado |
| Ctrl + Z / Ctrl + Y | Desfazer / refazer |
| Delete | Apagar desenho selecionado |
| Alt + R | Repor vista |

---

## Estrutura

```
src/
  core/            lógica sem interface (testável)
    feed/          fornecedores de dados (deriv, binance, yahoo, demo), cache e agregação de intervalos
    indicators/    funções de análise técnica e registo de indicadores
    trading/       motor de ordens/posições e estatísticas
    strategy/      backtester, construtor visual, scripts, otimizador, walk-forward, worker
  chart/           controlador do lightweight-charts, desenhos, interação, sobreposições
  replay/          motor do Bar Replay
  store/           estado (zustand) persistido e sincronizado
  lib/             Firebase, autenticação, sincronização, formatação
  server/          RSS e utilitários das rotas de API
  app/             páginas e rotas de API (Next.js)
  components/      interface (terminal, painéis, diálogos, estratégia)
tests/             testes unitários
e2e/               testes de ponta a ponta
```

Feito com Next.js, React, TypeScript, Tailwind CSS, [lightweight-charts](https://github.com/tradingview/lightweight-charts), zustand e Firebase.

> Aviso: ferramenta de estudo e simulação. Nenhuma ordem é enviada a uma corretora e nada aqui é aconselhamento financeiro.
