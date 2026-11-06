# ReplayX — Estado Atual do Projeto e Funcionalidades

> **Documento de Referência Técnica e Comercial**  
> Data: Novembro de 2026  
> Repositório: `https://github.com/idorionicolau-star/ReplayX`  
> Localização: `C:\Users\DELL\Digital projects\EA\ReplayX`

---

## 1. Visão Geral
O **ReplayX** é uma plataforma profissional de gráficos e trading no navegador ao estilo TradingView, focada em **Bar Replay com troca de timeframe a quente**, **backtesting manual/automático**, **criação de estratégias** e **paper trading** com cotações em tempo real. Suporta índices sintéticos (Deriv), forex, metais, criptomoedas, índices e ações.

---

## 2. Stack Tecnológica
* **Framework Web:** Next.js 16 (App Router, Server Components e rotas dinâmicas)
* **Frontend:** React 19, TypeScript 5.9, Tailwind CSS v4, Lucide Icons, CodeMirror (editor de código)
* **Gráficos:** TradingView Lightweight Charts v5.2, Fancy Canvas
* **Estado e Armazenamento:** Zustand v5 (com persistência local), Firebase / Firestore (sincronização na nuvem)
* **Autenticação:** Firebase Auth (Google Login, E-mail/Palavra-passe, Modo Convidado)
* **Pagamentos & Faturação:** ZumboPay (M-Pesa e Cartão de crédito/débito em MZN)
* **Execução & Algoritmos:** Web Workers nativos para otimização e backtesting sem travar o ecrã
* **MQL5:** Integração e robô dedicado para MetaTrader 5

---

## 3. Funcionalidades Atuais Implementadas

### 3.1. Gráficos e Layouts
* **Tipos de Velas:** Velas japonesas, barras OHLC, Heikin Ashi, Linha, Área, Linha de Base, Colunas e Hollow Candles.
* **Intervalos / Timeframes:** 1m a 12h, 1D, 1W, 1M e intervalos personalizados (ex.: `7m`, `90m`, `3h`).
* **Multi-Gráficos (Layouts):** Suporte para **1, 2 (horizontal/vertical), 3 e 4 gráficos simultâneos sincronizados** (símbolo, tempo e cruz de mira sincronizados).
* **Definições TradingView:** Personalização de cores (corpo, pavio, borda), gradientes de fundo, grelha, mira, marca d'água, escalas logarítmica e percentual, contagem decrescente para o fecho da vela.
* **Barra Inferior:** Atalhos rápidos de períodos (1D, 5D, 1M, 3M, 6M, YTD, 1A, Tudo), ir para data específica, fuso horário ajustável.

### 3.2. Ferramentas de Desenho (28 Ferramentas)
* Linha de tendência, raio, linha com seta, linha horizontal/vertical, canal paralelo, retração e extensão de Fibonacci, forquilha de Andrews, retângulo, elipse, triângulo, texto, régua, medições.
* **Ferramenta de Posição Longa e Curta** com cálculo automático de risco/retorno (R:R), ganho e perda projetada.
* **Alinhamento angular magnético (15° em 15°)**, modelos personalizáveis de desenhos, copiar/colar (Ctrl+C / Ctrl+V).

### 3.3. Indicadores Técnicos (+50 Indicadores)
* **Osciladores e Médias:** SMA, EMA, WMA, HMA, DEMA, TEMA, VWMA, RSI, Stoch RSI, MACD, Bollinger, Keltner, Supertrend, Ichimoku, Parabolic SAR, ADX, ATR, etc.
* **Indicadores Proprietários de Método (Sem repintura):**
  * **Topo e Fundo Duplo:** Deteção automática com zonas de rejeição, combinação e expansão, cálculo de R e saída inteligente.
  * **Curva de Capital com Retiradas:** Simulação de gestão de banca e retiradas periódicas de lucro.
  * **Perfil de Volume (Volume Profile):** Faixas de preço, POC (Point of Control) e áreas de valor (VAH/VAL).
  * **Footprint + Layer Line:** Estrutura e fluxo de ordens.
  * **Estrutura de Mercado Top-Down:** Mapeamento de topos/fundos reais, BOS e CHoCH multi-tempo gráfico.
  * **Apocalypse:** Deteção estatística de inícios de pernadas longas.

### 3.4. Motor de Bar Replay
* Início por clique no gráfico, por data específica ou seleção aleatória (treino cego).
* Avanço barra a barra manual, reprodução automática em múltiplas velocidades.
* **Mudança de tempo gráfico durante o replay sem quebrar o estado e sem revelar o futuro** (reconstrói as velas a partir dos dados menores).
* Execução intra-barra simulando spread, comissão e derrapagem (slippage).
* Replay sincronizado em múltiplos gráficos ao mesmo tempo.

### 3.5. Simulação e Diário de Trading
* Contas virtuais separadas para **Replay** e **Paper Trading em tempo real**.
* Ordens a mercado, limite, stop, SL/TP arrastáveis no gráfico, breakeven e trailing stop.
* Diário automático com estatísticas detalhadas: Curva de Capital, Taxa de Acerto (Winrate), Fator de Lucro, R múltiplos, MAE/MFE, Drawdown máximo e Simulação de Monte Carlo.

### 3.6. Automação, Bots e Estratégias
* **Construtor Visual (No-Code):** Criação de regras de entrada e saída por blocos ("SE ... ENTÃO ...") com filtros e regras de risco.
* **Editor de Scripts em JavaScript (Estilo Pine Script):**
  * Editor integrado com realce de sintaxe e autocompletar CodeMirror.
  * Funções disponíveis: `ta.ema()`, `ta.crossover()`, `strategy.entry()`, `strategy.close()`, etc.
* **Otimizador de Estratégias:** Otimização por força bruta (grelha) ou Algoritmos Genéticos.
* **Walk-Forward:** Teste de robustez contra overfitting (treina numa janela e valida na seguinte).
* **Robô Real para MetaTrader 5:**
  * Ficheiro dedicado: `mql5/ReplayX_DoubleTop.mq5` (mais de 900 linhas em MQL5).
  * Executa a estratégia de Topo e Fundo Duplo direto em conta Demo ou Real do MT5 via Algo Trading.

### 3.7. Alertas e Notificações
* Alertas sobre preço, indicadores técnicos ou linhas de desenho.
* Condições: cruza, cruza acima/abaixo, entra/sai de canal, maior/menor que.
* Frequência: só uma vez, uma vez por barra, no fecho da barra ou sempre.
* Notificações atuais: Janela popup no ecrã, Alerta sonoro e Push notification no dispositivo.

### 3.8. App Instalável (PWA)
* Suporte nativo para instalar no Android, iOS, Windows e Mac.
* Funciona em modo ecrã inteiro sem a barra do navegador, com suporte a gestos de toque no ecrã e zoom com dois dedos.

---

## 4. Planos, Preços e Monetização

O sistema de faturação está centralizado em `src/core/plans.ts` e integrado com a **ZumboPay**:

| Plano | Período | Preço (MZN) | Vantagens |
|---|:---:|:---:|---|
| **Grátis** | Vitalício | 0 MT | Replay a partir de 15m, 1 gráfico, 3 indicadores/gráfico, 3 backtests/dia. |
| **Teste Pro** | 14 dias | Grátis | Contas novas recebem 14 dias de Pro automaticamente. |
| **Mensal Pro** | 1 mês (+2 dias tolerância) | **100 MT** | Replay em todos os intervalos (1m, 5m, s), até 4 gráficos sincronizados, indicadores e backtests ilimitados, otimizador e walk-forward. |
| **Trimestral Pro** | 3 meses (+2 dias tolerância) | **270 MT** | Todos os benefícios Pro (poupança de 10%). |
| **Anual Pro** | 12 meses (+2 dias tolerância) | **1000 MT** | Todos os benefícios Pro (poupança de 17%). |

* **Processamento de Pagamento:**
  * Rota `/api/billing/checkout`: Inicia a cobrança segura na ZumboPay.
  * Rota `/api/billing/webhook`: Processa a confirmação via assinatura criptográfica HMAC-SHA256 e ativa o Pro no Firestore sem intervenção manual.
  * O Pro ativa em tempo real na tela do utilizador via listener do Firestore (`onSnapshot`).

### 4.1. Funil de Vendas e Conversão de Convidados (20 Minutos)
* **Degustação Livre (20 minutos):** O visitante entra sem fricção com 1 clique. Durante 20 minutos explora a plataforma, testa o replay e faz análises nos gráficos.
* **Badge com Contador no Topo:** Indicador visual `⏱️ Demonstração · 18:42` que pisca suavemente nos últimos 3 minutos.
* **Bloqueio Amigável com Retenção:** Ao fim dos 20 minutos, o modal `GuestExpiredDialog` surge com a mensagem persuasiva:
  > *"Não terminou! A sua jornada está só a começar. Registe-se agora para continuar o seu teste grátis sem perder os seus desenhos, configurações e histórico!"*
* **Migração Transparente de Dados:** Ao conectar a conta com Google ou E-mail, todos os desenhos e análises feitos nos 20 minutos são sincronizados automaticamente na nuvem (`cloud.ts`) e o utilizador ganha **14 dias de Pro Grátis**.

---

## 5. Feeds de Dados de Mercado
* **Deriv:** Índices Sintéticos (Volatility, Boom & Crash, Step, Jump), Forex, Ouro/Metais e Cripto (WebSocket streaming).
* **Binance:** Todos os pares de Criptomoedas ao vivo.
* **Yahoo Finance:** Ações globais, índices e futuros.

---

## 6. Mapeamento com a Procura do Cliente (Reunião de Sábado)

| Requisito do Cliente no WhatsApp | Situação no ReplayX | Observações |
|---|:---:|---|
| **Abrir 3 a 4 janelas ao mesmo tempo** | ✅ **Pronto** | Layout nativo para até 4 gráficos sincronizados no plano Pro. |
| **Sem junk / lixo visual fora do Fullscreen** | ✅ **Pronto** | Interface limpa, modo tela cheia, sem anúncios ou feeds sociais. |
| **Rodar bots / scripts sem limites abusivos** | ✅ **Pronto** | Scripts JS, construtor visual, backtester sem limite e robô MT5. |
| **Envio de sinais para Telegram / Webhook** | 🟡 **Falta adicionar** | TradingView cobra caro por webhooks. O ReplayX tem o motor de alertas completo, faltando apenas plugar o webhook/Telegram como canal de saída. |

---

## 7. Estrutura de Pastas Principais
```text
ReplayX/
├── mql5/
│   ├── README.md
│   └── ReplayX_DoubleTop.mq5          # Robô Expert Advisor para MT5
├── src/
│   ├── app/                          # Rotas Next.js (terminal, login, checkout, webhooks)
│   ├── chart/                        # Controladores de gráfico e canvas
│   ├── components/
│   │   ├── chart/                    # Painéis e legendas do gráfico
│   │   ├── dialogs/                  # Diálogos (Alertas, Upgrade, Indicadores)
│   │   ├── strategy/                 # Construtor visual, editor de scripts, otimizador
│   │   └── terminal/                 # Layouts do terminal e monitor de alertas
│   ├── core/
│   │   ├── alerts.ts                 # Regras puras dos alertas
│   │   ├── feed/                     # Conectores Deriv, Binance, Yahoo
│   │   ├── indicators/               # Mais de 50 indicadores calculados
│   │   ├── plans.ts                  # Definição dos planos (100 MT, Pro, Grátis)
│   │   ├── strategy/                 # Backtester, executor e scripts
│   │   └── trading/                  # Motor de ordens, lots e estatísticas
│   ├── lib/                          # Firebase, áudio, notificações e estado de billing
│   └── server/                       # Lógica de servidor (ZumboPay, Firebase Admin)
└── tests/                            # Testes automatizados unitários e de integração
```
