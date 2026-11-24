import { Contact } from '@/components/legal/Contact';
import { OPERATOR } from '@/lib/legal';
import { PLANS, TRIAL_DAYS, FREE_LIMITS } from '@/core/plans';
import { PtPrevails } from './PtPrevails';

const PLAN_EN: Record<string, string> = { mensal: 'monthly', trimestral: 'quarterly', anual: 'yearly' };
const mzn = (n: number) => `${n.toLocaleString('en-US')} MT`;

/** Termos de utilização em inglês (tradução; em caso de dúvida vale o português). */
export function TermsEn() {
  return (
    <>
      <PtPrevails />
      <p>
        These terms apply to the use of ReplayX (“the platform”), provided and owned by {OPERATOR}, owner of the platform and of the ReplayX brand. By creating an account, entering as a guest
        or using the platform, you accept these terms, the <a href="/privacidade">Privacy policy</a> and the <a href="/aviso-de-risco">Risk warning</a>.
      </p>

      <h2>1. What ReplayX is</h2>
      <p>
        ReplayX is a charting, study and simulation tool: it lets you view markets, review the past with “Bar Replay”, place <b>simulated</b> trades, test strategies and create alerts.{' '}
        <b>It is not a broker</b>, it does not receive money to invest, it does not send orders to any market and it does not provide financial advice.
      </p>

      <h2>2. Account</h2>
      <ul>
        <li>You can sign in with Google, with email and password, or as a guest (in which case your data stays only on your device).</li>
        <li>You must be at least 18 years old.</li>
        <li>You are responsible for keeping your password secure and for everything done in your account.</li>
        <li>You must provide truthful information and not share your account with others to get around the plan limits.</li>
      </ul>

      <h2>3. Plans and payments</h2>
      <ul>
        <li>
          <b>Free plan:</b> replay from {FREE_LIMITS.replayMinTf}, 1 chart, {FREE_LIMITS.indicatorsPerChart} indicators per chart and {FREE_LIMITS.backtestsPerDay} backtests per day.
        </li>
        <li>
          <b>Pro trial:</b> new accounts get {TRIAL_DAYS} days of free Pro.
        </li>
        <li>
          <b>Pro plan:</b> {PLANS.map((p) => `${PLAN_EN[p.id] ?? p.id} ${mzn(p.amount)}`).join(', ')}.
        </li>
        <li>Payment is made in meticais (MZN), by M-Pesa or card, through ZumboPay. We do not see or store your phone number or card details.</li>
        <li>
          <b>There is no automatic renewal.</b> Pro lasts for the period you paid for (plus 2 days of grace). Paying before the end adds to the current period. Nothing is charged without your
          confirmation.
        </li>
        <li>We may change prices and plan limits, with prior notice. Changes do not affect periods already paid.</li>
        <li>
          <b>Refunds:</b> payments are non-refundable, except for incorrect or duplicate charges, or where required by law. If you believe there was an error, contact support within 7 days.
        </li>
        <li>When Pro ends, the account moves to the free plan. Your data is kept.</li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>You may not:</p>
      <ul>
        <li>use the platform for illegal purposes or to harm others;</li>
        <li>try to access other users’ accounts or data, or the server, outside normal use;</li>
        <li>bulk-copy, resell or redistribute the market data, strategies or content of the platform;</li>
        <li>get around the plan limits, payment or technical protections.</li>
      </ul>

      <h2>5. Market data</h2>
      <p>
        Prices come from third-party sources (for example Deriv, Binance and Yahoo Finance) and there are also simulated markets. They may have delays, gaps or errors, and may become unavailable
        without notice. We do not guarantee that they are accurate, complete or continuous. Synthetic indices are third-party products and are not related to real markets.
      </p>

      <h2>6. Simulations and results</h2>
      <p>
        Trades, backtests and statistics in ReplayX are simulations. Simulated results <b>do not guarantee</b> real results: real execution has spreads, slippage, liquidity and emotions that
        the simulation does not reproduce. Read the <a href="/aviso-de-risco">Risk warning</a>.
      </p>

      <h2>7. Ownership and attributions</h2>
      <p>
        The software, the ReplayX brand and its own content are the property of {OPERATOR}, which holds all rights to them. The drawings, strategies and notes you create remain yours. Charts
        use Lightweight Charts™ by TradingView, Inc. (Copyright © TradingView, Inc.). ReplayX is not affiliated with, sponsored or endorsed by TradingView, Inc., Deriv, Binance or Yahoo; the
        names belong to their respective owners.
      </p>

      <h2>8. Availability and liability</h2>
      <p>
        The platform is provided “as is”. We strive to keep it running, but there may be interruptions, errors or data loss. Alerts are only checked while the application is open and may
        fail or arrive late; <b>you should not rely on them for financial decisions</b>. To the extent permitted by law, we are not liable for losses or damages resulting from the use of the
        platform, including investment decisions made based on it.
      </p>

      <h2>9. Suspension and termination</h2>
      <p>You may stop using the platform and request deletion of your account at any time. We may suspend or close accounts that violate these terms, giving notice whenever possible.</p>

      <h2>10. Changes to these terms</h2>
      <p>We may update these terms. The update date is at the top; if the change is significant, we will notify you on the platform. Continuing to use it after the change means you accept it.</p>

      <h2>11. Governing law</h2>
      <p>These terms are governed by the laws of the Republic of Mozambique.</p>

      <h2>12. Contact</h2>
      <Contact />
    </>
  );
}
