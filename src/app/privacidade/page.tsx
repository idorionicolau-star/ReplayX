import type { Metadata } from 'next';
import { LegalLayout } from '@/components/legal/LegalLayout';
import { Contact } from '@/components/legal/Contact';
import { OPERATOR } from '@/lib/legal';

export const metadata: Metadata = { title: 'Política de privacidade — ReplayX' };

export default function Privacidade() {
  return (
    <LegalLayout title="Política de privacidade">
      <p>Explicamos que dados o ReplayX recolhe, para que servem e quais são os seus direitos. O responsável pelo tratamento dos dados é {OPERATOR}, titular do ReplayX.</p>

      <h2>1. Que dados recolhemos</h2>
      <ul>
        <li>
          <b>Conta:</b> nome, e-mail e foto (se entrar com Google) ou e-mail e nome (se se registar com e-mail). A palavra-passe é gerida pelo Firebase (Google): nós nunca a vemos.
        </li>
        <li>
          <b>O que guarda na plataforma:</b> definições, layout dos gráficos, desenhos, alertas, estratégias, sessões de replay e o registo das suas operações simuladas. Ficam no seu
          dispositivo e, se tiver conta, também na nuvem (Firebase Firestore), para os ter em qualquer aparelho.
        </li>
        <li>
          <b>Plano e pagamentos:</b> o plano, a data de fim, e por cada pagamento a referência, o valor, o plano e o estado. <b>Não guardamos</b> números de telefone nem de cartão; esses dados são
          tratados pela ZumboPay.
        </li>
        <li>
          <b>Dados técnicos:</b> o endereço IP e dados do pedido ficam nos registos do alojamento e dos serviços que usamos, por segurança e funcionamento.
        </li>
      </ul>

      <h2>2. Para que usamos</h2>
      <ul>
        <li>Prestar o serviço: entrar na conta, mostrar gráficos e sincronizar os seus dados.</li>
        <li>Processar pagamentos e ativar o plano Pro.</li>
        <li>Segurança, prevenção de abusos e suporte.</li>
        <li>Enviar as notificações que ativar (alertas).</li>
      </ul>
      <p>Não vendemos os seus dados nem os usamos para publicidade.</p>

      <h2>3. Com quem partilhamos</h2>
      <ul>
        <li>
          <b>Google / Firebase:</b> autenticação e base de dados (guardar os seus dados na nuvem).
        </li>
        <li>
          <b>Vercel:</b> alojamento da aplicação.
        </li>
        <li>
          <b>ZumboPay:</b> pagamentos por M-Pesa e cartão.
        </li>
        <li>
          <b>Deriv, Binance e Yahoo Finance:</b> fontes de preços. O seu navegador contacta a Deriv e a Binance diretamente; os dados do Yahoo, as notícias e o calendário passam pelo
          nosso servidor. Os símbolos que consulta chegam a estas fontes, mas não lhes enviamos os dados da sua conta.
        </li>
      </ul>
      <p>Também podemos divulgar dados se a lei o exigir.</p>

      <h2>4. Modo convidado, armazenamento local e notificações</h2>
      <ul>
        <li>No modo convidado nada vai para a nuvem: tudo fica no seu dispositivo.</li>
        <li>Usamos o armazenamento do navegador e um “service worker” para guardar as suas definições, abrir a aplicação sem internet e mostrar notificações.</li>
        <li>As notificações só aparecem se as autorizar, e pode desligá-las nas definições do navegador.</li>
      </ul>

      <h2>5. Quanto tempo guardamos</h2>
      <p>
        Guardamos os dados enquanto a conta existir. Pode pedir a eliminação a qualquer momento: apagamos a conta e os dados associados, exceto os registos de pagamentos, que podemos manter
        durante o tempo exigido por lei para efeitos contabilísticos.
      </p>

      <h2>6. Os seus direitos</h2>
      <p>Pode pedir acesso aos seus dados, corrigi-los, exportá-los, eliminá-los ou opor-se a certo tratamento. Para isso, contacte-nos (abaixo).</p>

      <h2>7. Segurança</h2>
      <p>Usamos serviços reconhecidos (Google, Vercel), ligações cifradas e regras de acesso para que cada utilizador só aceda aos seus dados. Nenhum sistema é infalível; proteja a sua conta com uma palavra-passe forte.</p>

      <h2>8. Menores</h2>
      <p>A plataforma é para maiores de 18 anos. Não recolhemos dados de menores de propósito.</p>

      <h2>9. Alterações</h2>
      <p>Podemos atualizar esta política. A data de atualização está no topo, e avisaremos na plataforma se a mudança for importante.</p>

      <h2>10. Contacto</h2>
      <Contact />
    </LegalLayout>
  );
}
