# ReplayX

Plataforma de trading no navegador, ao estilo do TradingView, feita para **Bar Replay**, **backtest manual e automático** e **criação de estratégias** (visual ou em script) — com os índices sintéticos da Deriv, forex, metais, cripto, índices, futuros e ações.

Funciona sem configuração: `npm install && npm run dev` e abre `http://localhost:3000`.

---

## O que tem

### Gráfico
- Velas, barras OHLC, Heikin Ashi, linha, área, linha de base, colunas e "hollow candles".
- **Qualquer intervalo**: 1m … 12h, 1D, 1W, 1M e intervalos personalizados (ex.: `7m`, `90m`, `3h`). Escreve o número e carrega Enter.
- Layouts de 1, 2 (horizontal/vertical), 3 e 4 gráficos com sincronização de símbolo, intervalo e cruz (no replay, todos os gráficos andam no mesmo instante).
- Escala logarítmica, auto-escala, fuso horário configurável, temas claro e escuro, cores personalizáveis.
- Lista de observação com preços em tempo real, pesquisa de símbolos (incluindo todos os pares da Binance e o pesquisador do Yahoo), símbolos recentes e favoritos.

### Ferramentas de desenho (28)
Linha de tendência, raio, linha de informação, linha estendida, linha com seta, linha horizontal / raio horizontal / vertical / cruz, canal paralelo, retração e extensão de Fibonacci, forquilha de Andrews, retângulo, elipse, triângulo, caminho, pincel, texto, nota, etiqueta de preço, setas, **posição longa e curta** (com resultado calculado), intervalo de preço, intervalo de datas e régua.
Íman (OHLC), bloquear/ocultar, desfazer/refazer, árvore de objetos, estilos editáveis (cor, espessura, tracejado, níveis de Fibonacci). Os desenhos ficam ancorados ao tempo e preço, por isso **mantêm-se ao mudar de intervalo**.

### Indicadores (36)
Médias (SMA, EMA, WMA, HMA, DEMA, TEMA, VWMA e cruzamento), Bollinger, Keltner, Donchian, VWAP, Supertrend, Parabolic SAR, Ichimoku, ZigZag, Regressão linear, Pivots, Fractais, Volume, RSI, MACD, Estocástico, Stoch RSI, CCI, Williams %R, ADX/DMI, ATR, Desvio padrão, Largura de Bollinger, Momentum, ROC, Awesome Oscillator, TRIX, Aroon, OBV, MFI, CMF e mais. Todos com parâmetros, cores e painéis próprios.

### Bar Replay
- Escolhe o ponto de partida clicando no gráfico, por data, ou ao acaso.
- Avançar/recuar barra a barra, reprodução automática com várias velocidades, "avançar por" um intervalo diferente do gráfico (ex.: gráfico em 1h, avançar de 5 em 5 minutos).
- **Mudar de intervalo durante o replay** sem revelar o futuro: a barra em formação é reconstruída a partir dos intervalos mais finos.
- Vários gráficos em replay sincronizado no mesmo instante.
- Conta de simulação com ordens a mercado, limite e stop, SL/TP, trailing stop, arrastar linhas de SL/TP no gráfico, break-even e fecho individual ou de todas as posições.
- Execução **dentro da barra** (o preço percorre abertura → extremo mais próximo → outro extremo → fecho), spread, derrapagem e comissão configuráveis.
- Sessões guardadas: retoma um replay mais tarde exatamente onde o deixaste.

### Paper trading em tempo real
A mesma conta de simulação a correr sobre os preços ao vivo, com alertas de preço e de cruzamento.

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
- **Pro** (450 MT/mês, 1200 MT/trimestre, 4500 MT/ano): replay em todos os intervalos, até 4 gráficos, indicadores e backtests sem limite, otimizador, walk-forward e multi-mercado.
- Contas novas têm 7 dias de Pro grátis. Os preços e limites estão em `src/core/plans.ts`.
- O plano vem do documento `replayx_users/{uid}` no Firestore (só o servidor o escreve). O pagamento é feito pela ZumboPay (M-Pesa, e-Mola, cartão) através das rotas `/api/billing/checkout` e `/api/billing/status`, **que ainda não estão incluídas** — o botão de pagar mostra "pagamentos ainda não estão ativos" até lá.

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
2. No [Firebase Console](https://console.firebase.google.com/) → projeto **gen-lang-client-0528145915** → *Authentication* → *Settings* → *Authorized domains*, adiciona o domínio da Vercel (ex.: `replayx.vercel.app`). Sem isto o login com Google mostra "domínio não autorizado" (o login por e-mail e o modo convidado funcionam na mesma).
3. As regras do Firestore estão neste repositório (`firestore.rules`). Publica-as a partir daqui (precisa do [Firebase CLI](https://firebase.google.com/docs/cli) e de `firebase login`):
   ```bash
   firebase deploy --only firestore:rules
   ```
   Ou, sem instalar nada: copia o conteúdo de `firestore.rules` para *Firestore Database* → *Rules* na consola e carrega em *Publish*.
   Até lá a sincronização na nuvem falha com "permissão negada" e a app continua a guardar tudo localmente.

### Outro projeto Firebase (opcional)
Por omissão usa o projeto Firebase próprio do ReplayX (`gen-lang-client-0528145915`). Para usar outro, copia `.env.example` para `.env.local`, preenche as variáveis `NEXT_PUBLIC_FIREBASE_*`, muda o projeto em `.firebaserc` e publica as regras nesse projeto.

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
