# ReplayX DoubleTop (MetaTrader 5)

Robô (Expert Advisor) que entra nos mesmos sinais do indicador **Topo e Fundo Duplo** do ReplayX:
topo duplo (venda) e fundo duplo (compra), com rejeição, combinação de duas velas ou expansão.

## Como instalar
1. No MetaTrader 5: **Ficheiro → Abrir pasta de dados → MQL5 → Experts**.
2. Copia `ReplayX_DoubleTop.mq5` para essa pasta.
3. Abre o **MetaEditor** (F4), abre o ficheiro e carrega em **Compilar** (F7). Não deve dar erros.
4. No MT5, arrasta o robô "ReplayX_DoubleTop" para o gráfico (ativo e tempo gráfico à tua escolha) e liga o **Algo Trading**.

## Regras (iguais ao indicador)
- Decide só com velas fechadas; uma operação de cada vez (compra ou venda).
- Stop além da caixa dos dois topos; saída no fundo (ou topo) mais próximo que ainda está de pé (não rompido) e que dê o R mínimo.
- O 1.º topo não pode ter mais de 50 velas até à entrada. Entrada longe demais (menos de 1R) ou alvo longe demais (mais de 20 ATR) não entra.
- Breakeven: quando anda a favor 1:1, o stop passa para um pouco além da entrada (folga em pips, ou 0,1 ATR). É feito a cada tick.
- Aquece com as últimas 3000 velas (não opera nelas) e só entra em sinais novos.

## Entradas principais
| Entrada | Padrão | O que faz |
|---|---|---|
| `InpTolPips` | 0 | Mesmo nível em pips (0 = automática: 0,2 ATR ou 5% da altura do padrão) |
| `InpMaxBars` | 50 | Velas máximas do 1.º topo até à entrada |
| `InpMinR` | 1 | R mínimo |
| `InpBeAt` / `InpBePips` | 1 / 0 | Breakeven (R) e folga para custos (pips) |
| `InpRiskPct` | 10 | Risco por operação, % do saldo |
| `InpFixedLot` | 0 | Lote fixo (0 = calcula pelo risco e pelo stop) |
| `InpMaxConsecLosses` / `InpMaxDailyLossPct` | 0 / 0 | Pára o dia por perdas seguidas ou perda diária (0 = desligado) |
| `InpMaxSpreadPips` | 0 | Não entra com spread maior que isto |

## Antes de usar dinheiro real
Este código **não foi compilado nem testado no MetaTrader**. Compila, corre no **Strategy Tester** (modo "Todos os ticks" ou "Ticks reais") em vários ativos e períodos, e depois usa uma conta **demo** durante uns dias.
Os resultados do robô podem diferir um pouco do indicador do ReplayX (spread, derrapagem e o breakeven por tick).
