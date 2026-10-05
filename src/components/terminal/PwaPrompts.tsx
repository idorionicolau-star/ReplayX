'use client';
import { useEffect, useState } from 'react';
import { BellRing, Download, RefreshCw, Share, X } from 'lucide-react';
import { applyUpdate, promptInstall, usePwa } from '@/lib/pwa';
import { notifyDevice, notifyPermission, requestNotifyPermission } from '@/lib/notify';
import { useAlerts } from '@/store/alerts';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

const DISMISS_KEY = 'rx-install-dismissed';
const NOTIFY_KEY = 'rx-notify-asked';

function dismissedRecently(key: string, days: number): boolean {
  try {
    const t = Number(localStorage.getItem(key) || 0);
    return Date.now() - t < days * 86_400_000;
  } catch {
    return false;
  }
}

function remember(key: string) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* sem armazenamento */
  }
}

/** Instruções para instalar no iPhone (o Safari não tem botão de instalação). */
export function IosInstallHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Instalar no iPhone / iPad" width={380}>
      <ol className="list-decimal space-y-2 pl-5 text-[13px]">
        <li>
          Abra esta página no <b>Safari</b>.
        </li>
        <li>
          Toque em <Share size={14} className="inline align-text-bottom" /> <b>Partilhar</b> (em baixo).
        </li>
        <li>
          Escolha <b>Adicionar ao ecrã principal</b> e confirme.
        </li>
        <li>Abra o ReplayX pelo ícone novo. As notificações dos alertas só funcionam no iPhone com a app instalada (iOS 16.4 ou mais recente).</li>
      </ol>
    </Dialog>
  );
}

/** Instalar a app, ativar notificações e avisar de versões novas. */
export function PwaPrompts() {
  const { canInstall, standalone, ios, updateReady } = usePwa();
  const hasPushAlerts = useAlerts((s) => s.alerts.some((a) => a.active && a.notify.push));
  const [hideInstall, setHideInstall] = useState(true);
  const [askNotify, setAskNotify] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    // lê o armazenamento local só depois de montar (evita diferenças com o servidor)
    const t = setTimeout(() => setHideInstall(dismissedRecently(DISMISS_KEY, 14)), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!hasPushAlerts || notifyPermission() !== 'default' || dismissedRecently(NOTIFY_KEY, 3)) return;
    const t = setTimeout(() => setAskNotify(true), 0);
    return () => clearTimeout(t);
  }, [hasPushAlerts]);

  const mobile = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const showInstall = !standalone && !hideInstall && mobile && (canInstall || ios);

  return (
    <>
      {updateReady && (
        <div className="fixed bottom-16 left-1/2 z-[66] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-line bg-elev px-3 py-2 text-[13px] shadow-pop sm:bottom-6" role="status">
          <RefreshCw size={15} className="text-accent" />
          Há uma versão nova do ReplayX.
          <Button size="sm" variant="primary" onClick={applyUpdate}>
            Atualizar
          </Button>
        </div>
      )}

      {showInstall && !updateReady && (
        <div className="fixed inset-x-3 bottom-16 z-[60] flex items-center gap-3 rounded-xl border border-line bg-elev p-3 shadow-pop sm:hidden" data-testid="install-banner">
          <img src="/icons/icon-192.png" alt="" className="h-10 w-10 rounded-lg" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">Instalar o ReplayX</div>
            <div className="text-[11px] text-muted">Ecrã inteiro, abre mais depressa e recebe os alertas como notificação.</div>
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              if (canInstall) await promptInstall();
              else setIosHelp(true);
            }}
          >
            <Download size={14} /> Instalar
          </Button>
          <button
            type="button"
            aria-label="Agora não"
            onClick={() => {
              remember(DISMISS_KEY);
              setHideInstall(true);
            }}
            className="rounded p-1 text-muted"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {askNotify && (
        <div className="fixed top-14 right-3 z-[64] w-[320px] max-w-[calc(100vw-24px)] rounded-xl border border-line bg-elev p-3 shadow-pop" role="dialog" aria-label="Ativar notificações">
          <div className="flex items-start gap-3">
            <BellRing size={18} className="mt-0.5 shrink-0 text-warn" />
            <div className="min-w-0 flex-1 text-[13px]">
              <div className="font-semibold">Receber os alertas como notificação?</div>
              <div className="mt-0.5 text-xs text-muted">O sistema vai pedir autorização. Pode mudar depois nas definições do navegador.</div>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    setAskNotify(false);
                    remember(NOTIFY_KEY);
                    const p = await requestNotifyPermission();
                    if (p === 'granted') void notifyDevice('Notificações ativas', 'Vai receber aqui os alertas do ReplayX.', 'rx-test');
                  }}
                >
                  Ativar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAskNotify(false);
                    remember(NOTIFY_KEY);
                  }}
                >
                  Agora não
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <IosInstallHelp open={iosHelp} onClose={() => setIosHelp(false)} />
    </>
  );
}
