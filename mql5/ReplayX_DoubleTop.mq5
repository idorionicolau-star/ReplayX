//+------------------------------------------------------------------+
//|                                          ReplayX_DoubleTop.mq5   |
//|  Topo e Fundo Duplo (rejeição, combinação de 2 velas, expansão)  |
//|  Porte do indicador "Topo e Fundo Duplo" do ReplayX.             |
//|  Só decide com velas fechadas; uma operação de cada vez.         |
//+------------------------------------------------------------------+
#property copyright "Major Group"
#property version   "1.00"
#property strict

#include <Trade/Trade.mqh>

//--- Entradas do padrão
input group "Padrão (topo duplo / fundo duplo)"
input double InpSens        = 2.0;   // Oscilação mínima do 1.º topo (ATR)
input double InpTolPips     = 0.0;   // Mesmo nível: tolerância em pips (0 = automática)
input double InpTolAtr      = 0.2;   // Mesmo nível automático (ATR)
input double InpTolPct      = 5.0;   // Mesmo nível automático (% da altura do padrão)
input double InpMinDepth    = 2.5;   // Profundidade mínima do vale (ATR)
input double InpWick        = 0.5;   // Pavio mínimo da rejeição (fração da vela)
input double InpExpansion   = 1.0;   // Corpo mínimo da expansão (ATR)
input int    InpMaxBars     = 50;    // Velas máximas do 1.º topo até à entrada (0 = sem limite)

input group "Stop, saída e breakeven"
input double InpStopBuf     = 0.1;   // Folga do stop além da caixa (ATR)
input bool   InpTpNear      = true;  // Saída no fundo/topo mais próximo que ainda está de pé
input double InpTpRatio     = 0.6;   // (saída antiga) vale conta a partir de (fração da pernada)
input double InpMinR        = 1.0;   // R mínimo (entrada longe demais não entra; 0 = sem limite)
input double InpMaxTargetAtr= 20.0;  // Alvo máximo desde a entrada (ATR; 0 = sem limite)
input double InpBePct       = 0.0;   // Breakeven: quando anda esta % do caminho até à saída (0 = não usa; BE desligado por padrão)
input double InpBeAt        = 0.0;   // Breakeven em R (só se a % acima for 0; 0 = sem breakeven)
input double InpBePips      = 0.0;   // Breakeven: folga para spread e comissões (pips; 0 = 0,1 ATR)

input group "Risco e proteções"
input double InpRiskPct     = 10.0;  // Risco por operação (% do saldo; 10 = conta pequena, agressivo)
input double InpFixedLot    = 0.0;   // Lote fixo (0 = calcula pelo risco)
input double InpMaxSpreadPips = 0.0; // Não entra com spread maior que isto (pips; 0 = sem limite)
input int    InpMaxConsecLosses = 0; // Pára o dia depois de N perdas seguidas (0 = desligado)
input double InpMaxDailyLossPct = 0.0; // Pára o dia com esta perda (% do saldo; 0 = desligado)
input bool   InpAllowBuy    = true;  // Permitir compras
input bool   InpAllowSell   = true;  // Permitir vendas

input group "Desenho no gráfico"
input bool   InpDraw        = true;  // Desenhar caixa, stop, entrada, saída, setas, resultados e cartão
input bool   InpDrawHistory = true;  // Desenhar também os sinais do histórico de aquecimento

input group "Geral"
input long   InpMagic       = 20251018; // Número mágico
input int    InpWarmBars    = 3000;  // Velas de histórico para aquecer (não opera)
input int    InpDeviation   = 30;    // Derrapagem máxima (pontos)

//--- Constantes do padrão (as mesmas do indicador)
#define MAX_ZONES 6
#define WAIT_BARS 6
#define MIN_GAP   3
#define PIERCE    3.0
#define ATR_LEN   14

//--- Série de velas própria (índice 0 = a mais antiga guardada)
double   gO[], gH[], gL[], gC[], gAtr[];
datetime gT[];
int      gN = 0;
double   gPip = 0.0;
// estado do ATR de Wilder
double   gAtrPrev = 0.0;
double   gAtrSeed = 0.0;
int      gAtrCount = 0;
bool     gAtrReady = false;

// Distância a favor (em preço) a partir da qual o stop vai para o breakeven; 0 = breakeven desligado
double BeDistance(double entry, double stop, double target)
  {
   if(InpBePct > 0.0) return InpBePct / 100.0 * MathAbs(entry - target);
   if(InpBeAt > 0.0) return InpBeAt * MathAbs(entry - stop);
   return 0.0;
  }

struct SPoint { int idx; double price; };

struct SZone
  {
   SPoint first;
   double firstBody;
   SPoint origin;
   SPoint valley;
   int    touchedAt;   // -1 = ainda não tocou
   bool   hasSecond;
   SPoint second;
   double secondBody;
   bool   dead;
  };

struct SSignal
  {
   bool   fired;
   int    idx;
   double entry;
   double stop;
   double target;
   int    trigger;     // 0 rejeição, 1 combinação, 2 expansão
   double boxHi;       // caixa (no espaço espelhado)
   double boxLo;
   int    firstIdx;
   int    secondIdx;
   int    targetIdx;   // vela de onde vem a saída
  };

//--- Registo de cada sinal (preços reais) para desenhar e para o placar
struct SRec
  {
   int    id;
   int    dir;         // 1 compra, -1 venda
   int    firstIdx, secondIdx, idx, targetIdx;
   double boxHi, boxLo, entry, stop, target;
   int    trigger;
   int    beIdx;       // -1 = sem breakeven
   double beStop;
   int    exitIdx;     // -1 = em curso
   int    result;      // 0 em curso, 1 alvo, 2 stop, 3 breakeven
  };

//+------------------------------------------------------------------+
//| Um lado do padrão. s = +1: topos duplos (vendas).               |
//| s = -1: fundos duplos (compras), com os preços espelhados.       |
//+------------------------------------------------------------------+
class CDtScanner
  {
public:
   double s;
   // oscilações (zigue-zague)
   int    pdir;
   SPoint phi, plo, pcand;
   // fundos confirmados (os mais recentes no fim) e zonas
   SPoint lows[];
   int    nl;
   bool   hasLastL;
   SPoint lastL;
   SZone  zones[];
   int    nz;
   // operação virtual (só no aquecimento)
   bool   vOpen;
   int    vIdx;
   double vEntry, vStop, vTarget, vBeStop;
   bool   vBe;

   void   Init(double sign);
   void   OnFirstBar();
   double H(int i) { return s > 0 ? gH[i] : -gL[i]; }
   double L(int i) { return s > 0 ? gL[i] : -gH[i]; }
   double O(int i) { return s * gO[i]; }
   double C(int i) { return s * gC[i]; }
   SPoint LowestFrom(int from, int to);
   SPoint HighestFrom(int from, int to);
   bool   DetectPivot(int i, int &pidx, double &pprice, int &ptype);
   void   VirtualExits(int t);
   bool   Step(int t, bool busy, SSignal &sig);
   void   AddLow(int idx, double price);
   bool   Standing(const SPoint &c, int t);
  };

void CDtScanner::Init(double sign)
  {
   s = sign;
   pdir = 0;
   nl = 0;
   nz = 0;
   hasLastL = false;
   vOpen = false;
   vBe = false;
   ArrayResize(lows, 0);
   ArrayResize(zones, 0);
  }

void CDtScanner::OnFirstBar()
  {
   phi.idx = 0;  phi.price = H(0);
   plo.idx = 0;  plo.price = L(0);
   pcand.idx = 0; pcand.price = 0;
  }

SPoint CDtScanner::LowestFrom(int from, int to)
  {
   SPoint best;
   best.idx = to; best.price = L(to);
   for(int j = from; j <= to; j++)
      if(L(j) <= best.price) { best.idx = j; best.price = L(j); }
   return best;
  }

SPoint CDtScanner::HighestFrom(int from, int to)
  {
   SPoint best;
   best.idx = to; best.price = H(to);
   for(int j = from; j <= to; j++)
      if(H(j) >= best.price) { best.idx = j; best.price = H(j); }
   return best;
  }

// Zigue-zague causal: uma viragem só se confirma quando o preço anda sens*ATR contra ela.
// ptype: 1 = topo (H), -1 = fundo (L).
bool CDtScanner::DetectPivot(int i, int &pidx, double &pprice, int &ptype)
  {
   double t = InpSens * gAtr[i];
   double h = H(i), l = L(i);
   if(pdir == 0)
     {
      if(h > phi.price) { phi.idx = i; phi.price = h; }
      if(l < plo.price) { plo.idx = i; plo.price = l; }
      if(phi.price - l >= t && phi.idx != i)
        {
         pidx = phi.idx; pprice = phi.price; ptype = 1;
         pdir = -1;
         pcand = LowestFrom(phi.idx + 1, i);
         return true;
        }
      if(h - plo.price >= t && plo.idx != i)
        {
         pidx = plo.idx; pprice = plo.price; ptype = -1;
         pdir = 1;
         pcand = HighestFrom(plo.idx + 1, i);
         return true;
        }
      return false;
     }
   if(pdir == 1)
     {
      if(h > pcand.price) { pcand.idx = i; pcand.price = h; }
      else if(pcand.price - l >= t)
        {
         pidx = pcand.idx; pprice = pcand.price; ptype = 1;
         pdir = -1;
         pcand = LowestFrom(pidx + 1, i);
         return true;
        }
     }
   else
     {
      if(l < pcand.price) { pcand.idx = i; pcand.price = l; }
      else if(h - pcand.price >= t)
        {
         pidx = pcand.idx; pprice = pcand.price; ptype = -1;
         pdir = 1;
         pcand = HighestFrom(pidx + 1, i);
         return true;
        }
     }
   return false;
  }

void CDtScanner::AddLow(int idx, double price)
  {
   if(nl >= 40)
     {
      for(int k = 1; k < nl; k++) lows[k - 1] = lows[k];
      nl--;
     }
   ArrayResize(lows, nl + 1);
   lows[nl].idx = idx;
   lows[nl].price = price;
   nl++;
  }

// Um fundo só vale como saída se ainda está de pé: nenhuma vela depois dele foi mais baixa.
bool CDtScanner::Standing(const SPoint &c, int t)
  {
   for(int j = c.idx + 1; j <= t; j++)
      if(L(j) < c.price) return false;
   return true;
  }

// A operação virtual fecha no stop ou no alvo (na mesma vela, conta primeiro o stop).
void CDtScanner::VirtualExits(int t)
  {
   if(!vOpen || t <= vIdx) return;
   double stop = vBe ? vBeStop : vStop;
   if(H(t) >= stop) { vOpen = false; return; }
   if(L(t) <= vTarget) { vOpen = false; return; }
   double bd = BeDistance(vEntry, vStop, vTarget);
   if(bd > 0.0 && !vBe && L(t) <= vEntry - bd)
     {
      vBe = true;
      double off = InpBePips > 0.0 ? InpBePips * gPip : 0.1 * gAtr[t];
      vBeStop = vEntry - off;
     }
  }

// Processa a vela t (já fechada). Devolve true se há uma entrada nova (valores no espaço espelhado).
bool CDtScanner::Step(int t, bool busy, SSignal &sig)
  {
   sig.fired = false;
   double a = gAtr[t];

   // oscilações confirmadas nesta vela: cada topo novo abre uma zona
   int pidx; double pprice; int ptype;
   if(DetectPivot(t, pidx, pprice, ptype))
     {
      if(ptype == -1)
        {
         lastL.idx = pidx; lastL.price = pprice; hasLastL = true;
         AddLow(pidx, pprice);
        }
      else if(hasLastL)
        {
         SPoint valley; valley.idx = pidx; valley.price = L(pidx);
         for(int j = pidx + 1; j <= t; j++)
            if(L(j) < valley.price) { valley.idx = j; valley.price = L(j); }
         if(nz >= MAX_ZONES)
           {
            for(int k = 1; k < nz; k++) zones[k - 1] = zones[k];
            nz--;
           }
         ArrayResize(zones, nz + 1);
         zones[nz].first.idx = pidx; zones[nz].first.price = pprice;
         zones[nz].firstBody = MathMax(O(pidx), C(pidx));
         zones[nz].origin = lastL;
         zones[nz].valley = valley;
         zones[nz].touchedAt = -1;
         zones[nz].hasSecond = false;
         zones[nz].second.idx = -1; zones[nz].second.price = 0;
         zones[nz].secondBody = -DBL_MAX;
         zones[nz].dead = false;
         nz++;
        }
     }

   double tolPrice = InpTolPips > 0.0 ? InpTolPips * gPip : 0.0;
   bool fired = false;
   // a zona mais recente primeiro
   for(int zi = nz - 1; zi >= 0; zi--)
     {
      if(zones[zi].dead) continue;
      double top = zones[zi].first.price;
      // topo antigo demais para ser o primeiro ponto do W
      if(InpMaxBars > 0 && t - zones[zi].first.idx > InpMaxBars) { zones[zi].dead = true; continue; }
      // mesmo nível
      double tol = tolPrice > 0.0 ? tolPrice : MathMax(InpTolAtr * a, InpTolPct / 100.0 * (top - zones[zi].valley.price));
      // rompimento: fecho acima do nível, ou pavio que passa muito dele, já é outro nível
      if(C(t) > top + tol || H(t) > top + PIERCE * tol) { zones[zi].dead = true; continue; }
      bool deepEnough = (top - zones[zi].valley.price) >= InpMinDepth * a;
      bool reaches = H(t) >= top - tol;
      int prevTouch = zones[zi].touchedAt;
      if(zones[zi].touchedAt < 0)
        {
         if(L(t) < zones[zi].valley.price) { zones[zi].valley.idx = t; zones[zi].valley.price = L(t); }
         if(!(reaches && deepEnough && t - zones[zi].first.idx >= MIN_GAP)) continue;
         zones[zi].touchedAt = t;
        }
      else if(reaches)
        {
         zones[zi].touchedAt = t;
        }
      else if(t - zones[zi].touchedAt > WAIT_BARS)
        {
         // tocou e foi embora sem confirmar: esse toque passa a ser o 1.º topo do teste seguinte
         if(zones[zi].hasSecond)
           {
            zones[zi].first.idx = zones[zi].second.idx;
            zones[zi].first.price = top;
            zones[zi].firstBody = zones[zi].secondBody;
            zones[zi].valley.idx = t; zones[zi].valley.price = L(t);
            for(int j = zones[zi].second.idx + 1; j < t; j++)
               if(L(j) < zones[zi].valley.price) { zones[zi].valley.idx = j; zones[zi].valley.price = L(j); }
           }
         zones[zi].touchedAt = -1;
         zones[zi].hasSecond = false;
         zones[zi].secondBody = -DBL_MAX;
         continue;
        }
      if(!zones[zi].hasSecond || H(t) > zones[zi].second.price)
        { zones[zi].second.idx = t; zones[zi].second.price = H(t); zones[zi].hasSecond = true; }
      zones[zi].secondBody = MathMax(zones[zi].secondBody, MathMax(O(t), C(t)));

      double range = H(t) - L(t);
      double upperWick = H(t) - MathMax(O(t), C(t));
      double body = MathAbs(C(t) - O(t));
      // rejeição
      bool rejection = reaches && range >= 0.8 * a && upperWick >= InpWick * range && C(t) < top - 0.3 * a;
      // combinação: a vela anterior (verde) e esta (vermelha forte) vistas como uma só vela
      double cHigh = MathMax(H(t - 1), H(t));
      double cRange = cHigh - MathMin(L(t - 1), L(t));
      bool combo = (reaches || prevTouch == t - 1) &&
                   C(t - 1) > O(t - 1) && C(t) < O(t) &&
                   body >= 0.6 * a && cRange >= 0.8 * a &&
                   (cHigh - MathMax(O(t - 1), C(t))) >= InpWick * cRange &&
                   C(t) < top - 0.3 * a;
      // expansão
      bool expansion = C(t) < O(t) && body >= InpExpansion * a && t - zones[zi].touchedAt <= 1;
      if(fired || !(rejection || combo || expansion)) continue;
      // já há uma operação aberta: esta confirmação passa
      if(busy) { zones[zi].dead = true; continue; }

      double boxHi = MathMax(top, zones[zi].second.price);
      double lowerTop = MathMin(top, zones[zi].second.price);
      double boxLo = MathMin(lowerTop - 0.15 * a, MathMax(MathMax(zones[zi].firstBody, zones[zi].secondBody), lowerTop - 0.35 * a));
      double entry = C(t);
      double stop = boxHi + InpStopBuf * a;
      double leg = top - zones[zi].origin.price;
      bool useValley = (leg <= 0.0) || (top - zones[zi].valley.price >= InpTpRatio * leg);
      SPoint targetFrom = useValley ? zones[zi].valley : zones[zi].origin;
      if(InpTpNear)
        {
         double risk = stop - entry;
         double room = MathMax(InpMinR * risk, 1e-12);
         bool have = false;
         SPoint best; best.idx = -1; best.price = 0;
         for(int k = 0; k <= nl + 1; k++)
           {
            SPoint c;
            if(k < nl) c = lows[k];
            else if(k == nl) c = zones[zi].valley;
            else c = zones[zi].origin;
            if(c.price <= entry - room && (!have || c.price > best.price) && Standing(c, t))
              { best = c; have = true; }
           }
         if(have) targetFrom = best;
        }
      double target = targetFrom.price;
      zones[zi].dead = true;
      if(!(target < entry) || !(stop > entry)) continue;
      if(InpMinR > 0.0 && (entry - target) / (stop - entry) < InpMinR) continue;
      if(InpMaxTargetAtr > 0.0 && entry - target > InpMaxTargetAtr * a) continue;
      fired = true;
      sig.fired = true;
      sig.idx = t;
      sig.entry = entry;
      sig.stop = stop;
      sig.target = target;
      sig.trigger = rejection ? 0 : (combo ? 1 : 2);
      sig.boxHi = boxHi;
      sig.boxLo = boxLo;
      sig.firstIdx = zones[zi].first.idx;
      sig.secondIdx = zones[zi].second.idx;
      sig.targetIdx = targetFrom.idx;
      // operação virtual (aquecimento)
      vOpen = true; vIdx = t; vEntry = entry; vStop = stop; vTarget = target; vBe = false; vBeStop = 0;
      busy = true;
     }

   // limpa as zonas mortas
   int w = 0;
   for(int k = 0; k < nz; k++)
      if(!zones[k].dead) { if(w != k) zones[w] = zones[k]; w++; }
   nz = w;
   ArrayResize(zones, nz);
   return sig.fired;
  }

//+------------------------------------------------------------------+
CDtScanner gSell;   // topos duplos
CDtScanner gBuy;    // fundos duplos (espelho)
CTrade     gTrade;
bool       gWarm = true;
datetime   gLastBar = 0;

//--- ATR de Wilder como o do indicador (nas primeiras velas usa a amplitude da vela)
double ComputeAtr(int i)
  {
   double tr = (i == 0) ? gH[0] - gL[0]
                        : MathMax(gH[i] - gL[i], MathMax(MathAbs(gH[i] - gC[i - 1]), MathAbs(gL[i] - gC[i - 1])));
   double out = EMPTY_VALUE;
   if(!gAtrReady)
     {
      gAtrSeed += tr;
      gAtrCount++;
      if(gAtrCount == ATR_LEN) { gAtrPrev = gAtrSeed / ATR_LEN; gAtrReady = true; out = gAtrPrev; }
     }
   else
     {
      gAtrPrev = (gAtrPrev * (ATR_LEN - 1) + tr) / ATR_LEN;
      out = gAtrPrev;
     }
   if(out == EMPTY_VALUE || !(out > 0.0)) out = MathMax(gH[i] - gL[i], 1e-9);
   return out;
  }

void AppendBar(const MqlRates &r)
  {
   ArrayResize(gO, gN + 1); ArrayResize(gH, gN + 1); ArrayResize(gL, gN + 1);
   ArrayResize(gC, gN + 1); ArrayResize(gAtr, gN + 1); ArrayResize(gT, gN + 1);
   gO[gN] = r.open; gH[gN] = r.high; gL[gN] = r.low; gC[gN] = r.close; gT[gN] = r.time;
   gAtr[gN] = ComputeAtr(gN);
   gN++;
  }

bool FindPosition(ulong &ticket)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      ticket = tk;
      return true;
     }
   return false;
  }

//--- Perdas do dia (fecho das operações do EA)
void TodayStats(double &profit, int &consecLosses)
  {
   profit = 0.0;
   consecLosses = 0;
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   dt.hour = 0; dt.min = 0; dt.sec = 0;
   datetime from = StructToTime(dt);
   if(!HistorySelect(from, TimeCurrent() + 60)) return;
   int total = HistoryDealsTotal();
   bool streak = true;
   for(int i = total - 1; i >= 0; i--)
     {
      ulong tk = HistoryDealGetTicket(i);
      if(tk == 0) continue;
      if(HistoryDealGetInteger(tk, DEAL_MAGIC) != InpMagic) continue;
      if(HistoryDealGetString(tk, DEAL_SYMBOL) != _Symbol) continue;
      if(HistoryDealGetInteger(tk, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;
      double p = HistoryDealGetDouble(tk, DEAL_PROFIT) + HistoryDealGetDouble(tk, DEAL_COMMISSION) + HistoryDealGetDouble(tk, DEAL_SWAP);
      profit += p;
      if(streak)
        {
         if(p < 0.0) consecLosses++;
         else streak = false;
        }
     }
  }

bool TradingAllowed()
  {
   if(InpMaxConsecLosses <= 0 && InpMaxDailyLossPct <= 0.0) return true;
   double profit; int losses;
   TodayStats(profit, losses);
   if(InpMaxConsecLosses > 0 && losses >= InpMaxConsecLosses) return false;
   if(InpMaxDailyLossPct > 0.0)
     {
      double startBal = AccountInfoDouble(ACCOUNT_BALANCE) - profit;
      if(startBal > 0.0 && profit <= -startBal * InpMaxDailyLossPct / 100.0) return false;
     }
   return true;
  }

double NormalizeLot(double lots)
  {
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(step <= 0.0) step = 0.01;
   lots = MathFloor(lots / step) * step;
   if(lots < vmin) lots = vmin;
   if(lots > vmax) lots = vmax;
   return NormalizeDouble(lots, 8);
  }

double LotForRisk(double riskDist)
  {
   if(InpFixedLot > 0.0) return NormalizeLot(InpFixedLot);
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   if(tickSize <= 0.0 || tickValue <= 0.0 || riskDist <= 0.0) return 0.0;
   double money = AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPct / 100.0;
   double lossPerLot = riskDist / tickSize * tickValue;
   if(lossPerLot <= 0.0) return 0.0;
   return NormalizeLot(money / lossPerLot);
  }

void OpenTrade(bool buy, const SSignal &sig, double sign)
  {
   // volta dos preços espelhados aos preços reais
   double stop = sign * sig.stop;
   double target = sign * sig.target;
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double price = buy ? ask : bid;
   if(buy  && !(stop < price && target > price)) { Print("Compra ignorada: stop/alvo do lado errado do preço"); return; }
   if(!buy && !(stop > price && target < price)) { Print("Venda ignorada: stop/alvo do lado errado do preço"); return; }
   double spreadPips = (ask - bid) / gPip;
   if(InpMaxSpreadPips > 0.0 && spreadPips > InpMaxSpreadPips) { Print("Entrada ignorada: spread ", DoubleToString(spreadPips, 1), " pips"); return; }
   double minDist = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   if(MathAbs(price - stop) < minDist || MathAbs(price - target) < minDist) { Print("Entrada ignorada: stop/alvo dentro do nível mínimo da corretora"); return; }
   double lots = LotForRisk(MathAbs(price - stop));
   if(lots <= 0.0) { Print("Entrada ignorada: lote calculado inválido"); return; }
   stop = NormalizeDouble(stop, _Digits);
   target = NormalizeDouble(target, _Digits);
   string why = sig.trigger == 0 ? "rejeicao" : (sig.trigger == 1 ? "combinacao" : "expansao");
   bool ok = buy ? gTrade.Buy(lots, _Symbol, 0.0, stop, target, "DT " + why)
                 : gTrade.Sell(lots, _Symbol, 0.0, stop, target, "DT " + why);
   if(!ok) Print("Falha na ordem: ", gTrade.ResultRetcode(), " ", gTrade.ResultRetcodeDescription());
   else    Print((buy ? "COMPRA " : "VENDA "), why, " lote ", DoubleToString(lots, 2), " SL ", DoubleToString(stop, _Digits), " TP ", DoubleToString(target, _Digits));
  }

//+------------------------------------------------------------------+
//| Registo dos sinais, desenho e placar                             |
//+------------------------------------------------------------------+
SRec gRec[];
int  gNRec = 0;
int  gRecId = 0;
#define PFX "RXDT_"

bool CanDraw()
  {
   if(!InpDraw) return false;
   if(MQLInfoInteger(MQL_TESTER) && !MQLInfoInteger(MQL_VISUAL_MODE)) return false;
   return true;
  }

void PutLine(const string name, datetime t1, double p1, datetime t2, double p2, color col)
  {
   if(ObjectFind(0, name) < 0)
     {
      ObjectCreate(0, name, OBJ_TREND, 0, t1, p1, t2, p2);
      ObjectSetInteger(0, name, OBJPROP_COLOR, col);
      ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
      ObjectSetInteger(0, name, OBJPROP_RAY_RIGHT, false);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
     }
   ObjectMove(0, name, 0, t1, p1);
   ObjectMove(0, name, 1, t2, p2);
  }

void PutText(const string name, datetime t, double price, const string text, color col, ENUM_ANCHOR_POINT anchor)
  {
   if(ObjectFind(0, name) < 0)
     {
      ObjectCreate(0, name, OBJ_TEXT, 0, t, price);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 8);
     }
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, anchor);
   ObjectMove(0, name, 0, t, price);
  }

double RecR(const SRec &r)
  {
   double risk = MathAbs(r.stop - r.entry);
   if(risk <= 0.0 || r.result == 0) return 0.0;
   if(r.result == 2) return -1.0;
   if(r.result == 1) return MathAbs(r.target - r.entry) / risk;
   return (r.dir < 0 ? (r.entry - r.beStop) : (r.beStop - r.entry)) / risk;
  }

string TriggerName(int k) { return k == 0 ? "rejeição" : (k == 1 ? "combinação" : "expansão"); }

void DrawRec(int k)
  {
   if(!CanDraw()) return;
   SRec r = gRec[k];
   bool buy = r.dir > 0;
   string base = PFX + IntegerToString(r.id) + "_";
   int last = gN - 1;
   int endIdx = r.exitIdx >= 0 ? r.exitIdx : last;
   datetime tEnd = gT[endIdx];
   color colBox = buy ? clrLavender : clrMistyRose;
   color colEdge = buy ? clrRoyalBlue : clrCrimson;
   string nb = base + "box";
   int boxEnd = MathMax(r.idx, r.secondIdx + 1);
   if(boxEnd > last) boxEnd = last;
   if(ObjectFind(0, nb) < 0)
     {
      ObjectCreate(0, nb, OBJ_RECTANGLE, 0, gT[r.firstIdx], r.boxHi, gT[boxEnd], r.boxLo);
      ObjectSetInteger(0, nb, OBJPROP_COLOR, colEdge);
      ObjectSetInteger(0, nb, OBJPROP_FILL, true);
      ObjectSetInteger(0, nb, OBJPROP_BACK, true);
      ObjectSetInteger(0, nb, OBJPROP_SELECTABLE, false);
     }
   ObjectSetInteger(0, nb, OBJPROP_BGCOLOR, colBox);
   PutLine(base + "stop", gT[r.firstIdx], r.stop, tEnd, r.stop, clrTomato);
   PutText(base + "stopt", gT[(r.firstIdx + endIdx) / 2], r.stop, "Stop", clrTomato, buy ? ANCHOR_UPPER : ANCHOR_LOWER);
   PutLine(base + "entry", gT[r.idx], r.entry, tEnd, r.entry, clrSilver);
   PutText(base + "entryt", gT[(r.idx + endIdx) / 2], r.entry, "Entrada", clrGray, buy ? ANCHOR_LOWER : ANCHOR_UPPER);
   PutLine(base + "tp", gT[r.targetIdx], r.target, tEnd, r.target, clrTeal);
   PutText(base + "tpt", gT[(r.targetIdx + endIdx) / 2], r.target, "Saída", clrTeal, buy ? ANCHOR_LOWER : ANCHOR_UPPER);
   string na = base + "seta";
   if(ObjectFind(0, na) < 0)
     {
      ObjectCreate(0, na, buy ? OBJ_ARROW_BUY : OBJ_ARROW_SELL, 0, gT[r.idx], r.entry);
      ObjectSetInteger(0, na, OBJPROP_SELECTABLE, false);
     }
   PutText(base + "sinal", gT[r.idx], buy ? gL[r.idx] : gH[r.idx], (buy ? "COMPRA (" : "VENDA (") + TriggerName(r.trigger) + ")", buy ? clrRoyalBlue : clrCrimson, buy ? ANCHOR_UPPER : ANCHOR_LOWER);
   if(r.beIdx >= 0) PutText(base + "be", gT[r.beIdx], r.entry, "BE", clrGray, buy ? ANCHOR_UPPER : ANCHOR_LOWER);
   if(r.result == 1)
      PutText(base + "res", gT[r.exitIdx], r.target, "✓ alvo +" + DoubleToString(RecR(r), 1) + "R", clrTeal, buy ? ANCHOR_LOWER : ANCHOR_UPPER);
   else if(r.result == 2)
      PutText(base + "res", gT[r.exitIdx], r.stop, "✗ stop -1R", clrTomato, buy ? ANCHOR_UPPER : ANCHOR_LOWER);
   else if(r.result == 3)
      PutText(base + "res", gT[r.exitIdx], r.beStop, "= saiu no BE (cobre custos)", clrGray, buy ? ANCHOR_UPPER : ANCHOR_LOWER);
  }

void DrawPanel()
  {
   if(!CanDraw()) return;
   int closed = 0, wins = 0, stops = 0, bes = 0;
   double sum = 0.0;
   for(int i = 0; i < gNRec; i++)
     {
      if(gRec[i].result == 0) continue;
      closed++;
      if(gRec[i].result == 1) wins++;
      else if(gRec[i].result == 2) stops++;
      else bes++;
      sum += RecR(gRec[i]);
     }
   string txt = "Topo/fundo duplo: " + IntegerToString(gNRec) + " sinais\n";
   if(closed > 0)
     {
      txt += IntegerToString(wins) + " alvos · " + IntegerToString(stops) + " stops";
      if(bes > 0) txt += " · " + IntegerToString(bes) + " no BE";
      txt += " (" + IntegerToString((int)MathRound(100.0 * wins / closed)) + "%)\n";
      txt += "soma " + (sum >= 0 ? "+" : "") + DoubleToString(sum, 2) + "R · média " + (sum >= 0 ? "+" : "") + DoubleToString(sum / closed, 2) + "R por sinal\n";
     }
   else txt += "ainda sem sinais fechados\n";
   double a = gN > 0 ? gAtr[gN - 1] : 0.0;
   double pips = InpTolPips > 0.0 ? InpTolPips : (MathMax(InpTolAtr * a, 0.0) / gPip);
   txt += "mesmo nível: ±" + DoubleToString(pips, pips >= 10 ? 0 : 1) + " pips" + (InpTolPips > 0.0 ? "" : " ou " + DoubleToString(InpTolPct, 0) + "% do padrão (automático)");
   Comment(txt);
  }

void AddRecord(bool buy, const SSignal &sig, double sign)
  {
   ArrayResize(gRec, gNRec + 1);
   SRec r;
   gRecId++;
   r.id = gRecId;
   r.dir = buy ? 1 : -1;
   r.firstIdx = sig.firstIdx; r.secondIdx = sig.secondIdx; r.idx = sig.idx; r.targetIdx = sig.targetIdx;
   // de volta aos preços reais
   r.boxHi = sign > 0 ? sig.boxHi : -sig.boxLo;
   r.boxLo = sign > 0 ? sig.boxLo : -sig.boxHi;
   r.entry = sign * sig.entry; r.stop = sign * sig.stop; r.target = sign * sig.target;
   r.trigger = sig.trigger;
   r.beIdx = -1; r.beStop = 0.0; r.exitIdx = -1; r.result = 0;
   gRec[gNRec] = r;
   gNRec++;
   if(gWarm && !InpDrawHistory) return;
   DrawRec(gNRec - 1);
  }

// Resultado de cada sinal vela a vela (como no indicador: na mesma vela conta primeiro o stop)
void UpdateRecords(int t)
  {
   for(int k = 0; k < gNRec; k++)
     {
      if(gRec[k].result != 0) continue;
      if(t <= gRec[k].idx) continue;
      bool sell = gRec[k].dir < 0;
      double stopNow = gRec[k].beIdx >= 0 ? gRec[k].beStop : gRec[k].stop;
      bool changed = false;
      if(sell ? gH[t] >= stopNow : gL[t] <= stopNow)
        { gRec[k].exitIdx = t; gRec[k].result = gRec[k].beIdx >= 0 ? 3 : 2; changed = true; }
      else if(sell ? gL[t] <= gRec[k].target : gH[t] >= gRec[k].target)
        { gRec[k].exitIdx = t; gRec[k].result = 1; changed = true; }
      else if(gRec[k].beIdx < 0)
        {
         double bd = BeDistance(gRec[k].entry, gRec[k].stop, gRec[k].target);
         bool reached = bd > 0.0 && (sell ? gL[t] <= gRec[k].entry - bd : gH[t] >= gRec[k].entry + bd);
         if(reached)
           {
            double off = InpBePips > 0.0 ? InpBePips * gPip : 0.1 * gAtr[t];
            gRec[k].beIdx = t;
            gRec[k].beStop = sell ? gRec[k].entry - off : gRec[k].entry + off;
            changed = true;
           }
        }
      if(!gWarm || InpDrawHistory)
        {
         if(changed || gRec[k].result == 0) DrawRec(k);
        }
     }
  }

//--- Vela nova fechada: avança as duas pesquisas
void ProcessBar()
  {
   int t = gN - 1;
   if(t == 0) { gSell.OnFirstBar(); gBuy.OnFirstBar(); return; }
   SSignal sSig, bSig;
   sSig.fired = false; bSig.fired = false;
   UpdateRecords(t);
   if(gWarm)
     {
      gSell.VirtualExits(t);
      gBuy.VirtualExits(t);
      bool busy = gSell.vOpen || gBuy.vOpen;
      if(gSell.Step(t, busy, sSig)) AddRecord(false, sSig, 1.0);
      busy = gSell.vOpen || gBuy.vOpen;
      if(gBuy.Step(t, busy, bSig)) AddRecord(true, bSig, -1.0);
      return;
     }
   ulong tk;
   bool busy = FindPosition(tk);
   bool allowed = TradingAllowed();
   bool sFired = gSell.Step(t, busy || !allowed || !InpAllowSell, sSig);
   if(sFired) AddRecord(false, sSig, 1.0);
   if(sFired && !busy && allowed && InpAllowSell) { OpenTrade(false, sSig, 1.0); busy = FindPosition(tk); }
   bool bFired = gBuy.Step(t, busy || !allowed || !InpAllowBuy, bSig);
   if(bFired) AddRecord(true, bSig, -1.0);
   if(bFired && !busy && allowed && InpAllowBuy) OpenTrade(true, bSig, -1.0);
   DrawPanel();
  }

void SyncBars()
  {
   MqlRates r[];
   int want = 60;
   int got = CopyRates(_Symbol, _Period, 1, want, r);
   if(got <= 0) return;
   ArraySetAsSeries(r, false);
   for(int i = 0; i < got; i++)
     {
      if(gN > 0 && r[i].time <= gT[gN - 1]) continue;
      AppendBar(r[i]);
      ProcessBar();
     }
  }

//--- Breakeven por tick: stop além da entrada quando anda BeAt x o risco a favor
void ManageBreakeven()
  {
   if(InpBePct <= 0.0 && InpBeAt <= 0.0) return;
   ulong tk;
   if(!FindPosition(tk)) return;
   if(!PositionSelectByTicket(tk)) return;
   bool buy = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY;
   double open = PositionGetDouble(POSITION_PRICE_OPEN);
   double sl = PositionGetDouble(POSITION_SL);
   double tp = PositionGetDouble(POSITION_TP);
   if(sl <= 0.0) return;
   // breakeven já feito: o stop está do lado do lucro
   if(buy ? sl >= open : sl <= open) return;
   // distância a favor que dispara o breakeven: % do caminho até ao alvo (ou R, se não há alvo)
   double bd = tp > 0.0 ? BeDistance(open, sl, tp) : InpBeAt * MathAbs(open - sl);
   if(bd <= 0.0) return;
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double off = InpBePips > 0.0 ? InpBePips * gPip : 0.1 * (gN > 0 ? gAtr[gN - 1] : 0.0);
   if(buy && bid >= open + bd)
     {
      double nsl = NormalizeDouble(open + off, _Digits);
      if(nsl < bid - SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point)
         gTrade.PositionModify(tk, nsl, tp);
     }
   else if(!buy && ask <= open - bd)
     {
      double nsl = NormalizeDouble(open - off, _Digits);
      if(nsl > ask + SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point)
         gTrade.PositionModify(tk, nsl, tp);
     }
  }

//+------------------------------------------------------------------+
int OnInit()
  {
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   gPip = (digits == 3 || digits == 5) ? 10.0 * _Point : _Point;
   gN = 0; gNRec = 0; gRecId = 0; ArrayResize(gRec, 0);
   ObjectsDeleteAll(0, PFX);
   gAtrReady = false; gAtrCount = 0; gAtrSeed = 0.0; gAtrPrev = 0.0;
   gSell.Init(1.0);
   gBuy.Init(-1.0);
   gWarm = true;

   MqlRates r[];
   int got = CopyRates(_Symbol, _Period, 1, MathMax(InpWarmBars, 200), r);
   if(got < 100)
     {
      Print("Histórico insuficiente (", got, " velas). Abre o gráfico e espera o histórico carregar.");
      return INIT_FAILED;
     }
   ArraySetAsSeries(r, false);
   for(int i = 0; i < got; i++)
     {
      AppendBar(r[i]);
      ProcessBar();
     }
   gWarm = false;
   gLastBar = iTime(_Symbol, _Period, 0);
   DrawPanel();

   gTrade.SetExpertMagicNumber(InpMagic);
   gTrade.SetDeviationInPoints(InpDeviation);
   gTrade.SetTypeFillingBySymbol(_Symbol);
   PrintFormat("ReplayX DoubleTop pronto: %d velas, pip = %s", gN, DoubleToString(gPip, _Digits));
   return INIT_SUCCEEDED;
  }

void OnTick()
  {
   ManageBreakeven();
   datetime bar = iTime(_Symbol, _Period, 0);
   if(bar == gLastBar) return;
   gLastBar = bar;
   SyncBars();
  }

void OnDeinit(const int reason)
  {
   // no testador deixa os desenhos no fim para poderes ver; no gráfico normal limpa
   if(!MQLInfoInteger(MQL_TESTER))
     {
      ObjectsDeleteAll(0, PFX);
      Comment("");
     }
  }
