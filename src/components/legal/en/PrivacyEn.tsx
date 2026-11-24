import { Contact } from '@/components/legal/Contact';
import { OPERATOR } from '@/lib/legal';
import { PtPrevails } from './PtPrevails';

/** Política de privacidade em inglês (tradução; em caso de dúvida vale o português). */
export function PrivacyEn() {
  return (
    <>
      <PtPrevails />
      <p>We explain what data ReplayX collects, what it is used for and what your rights are. The data controller is {OPERATOR}, owner of ReplayX.</p>

      <h2>1. What data we collect</h2>
      <ul>
        <li>
          <b>Account:</b> name, email and photo (if you sign in with Google) or email and name (if you register with email). Your password is managed by Firebase (Google): we never see it.
        </li>
        <li>
          <b>What you save on the platform:</b> settings, chart layout, drawings, alerts, strategies, replay sessions and the log of your simulated trades. They stay on your device and, if
          you have an account, also in the cloud (Firebase Firestore), so you have them on any device.
        </li>
        <li>
          <b>Plan and payments:</b> the plan, the end date, and for each payment the reference, amount, plan and status. <b>We do not store</b> phone or card numbers; that data is handled by
          ZumboPay.
        </li>
        <li>
          <b>Technical data:</b> your IP address and request data are kept in the logs of the hosting and services we use, for security and operation.
        </li>
      </ul>

      <h2>2. What we use it for</h2>
      <ul>
        <li>Providing the service: signing in, showing charts and syncing your data.</li>
        <li>Processing payments and activating the Pro plan.</li>
        <li>Security, abuse prevention and support.</li>
        <li>Sending the notifications you turn on (alerts).</li>
      </ul>
      <p>We do not sell your data or use it for advertising.</p>

      <h2>3. Who we share it with</h2>
      <ul>
        <li>
          <b>Google / Firebase:</b> authentication and database (storing your data in the cloud).
        </li>
        <li>
          <b>Vercel:</b> application hosting.
        </li>
        <li>
          <b>ZumboPay:</b> M-Pesa and card payments.
        </li>
        <li>
          <b>Deriv, Binance and Yahoo Finance:</b> price sources. Your browser contacts Deriv and Binance directly; Yahoo data, news and the calendar go through our server. The symbols you
          look up reach these sources, but we do not send them your account data.
        </li>
      </ul>
      <p>We may also disclose data if required by law.</p>

      <h2>4. Guest mode, local storage and notifications</h2>
      <ul>
        <li>In guest mode nothing goes to the cloud: everything stays on your device.</li>
        <li>We use browser storage and a “service worker” to save your settings, open the application without internet and show notifications.</li>
        <li>Notifications only appear if you allow them, and you can turn them off in the browser settings.</li>
      </ul>

      <h2>5. How long we keep it</h2>
      <p>
        We keep data while the account exists. You can request deletion at any time: we delete the account and associated data, except payment records, which we may keep for the period
        required by law for accounting purposes.
      </p>

      <h2>6. Your rights</h2>
      <p>You can request access to your data, correct it, export it, delete it or object to certain processing. To do so, contact us (below).</p>

      <h2>7. Security</h2>
      <p>We use well-known services (Google, Vercel), encrypted connections and access rules so that each user can only access their own data. No system is infallible; protect your account with a strong password.</p>

      <h2>8. Minors</h2>
      <p>The platform is for people aged 18 and over. We do not knowingly collect data from minors.</p>

      <h2>9. Changes</h2>
      <p>We may update this policy. The update date is at the top, and we will notify you on the platform if the change is significant.</p>

      <h2>10. Contact</h2>
      <Contact />
    </>
  );
}
