'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, Cloud, CloudOff, Crown, Download, Keyboard, LogOut, RefreshCw, UserPlus } from 'lucide-react';
import { promptInstall, usePwa } from '@/lib/pwa';
import { notifyDevice, notifyPermission, requestNotifyPermission } from '@/lib/notify';
import { IosInstallHelp } from './PwaPrompts';
import { toast } from '@/components/ui/Toast';
import { openUpgrade } from '@/lib/billing';
import { logout, useAuth } from '@/lib/auth';
import { flushSync, stopSync, useSync } from '@/lib/cloud';
import { useUi } from '@/store/ui';
import { Popover } from '@/components/ui/Popover';
import { MenuItem, MenuList, MenuSeparator } from '@/components/ui/Menu';
import { cn } from '@/components/ui/cn';

export function UserMenu() {
  const user = useAuth((s) => s.user);
  const sync = useSync();
  const router = useRouter();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const pwa = usePwa();
  if (!user) return null;
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const dot = sync.state === 'ok' ? 'bg-up' : sync.state === 'syncing' ? 'bg-warn animate-pulse-soft' : sync.state === 'error' ? 'bg-down' : 'bg-faint';
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen((o) => !o)} className="relative ml-0.5 shrink-0 rounded-full p-0.5 hover:bg-hover" aria-label="Conta" data-testid="user-menu">
        {user.photo ? (
          <img src={user.photo} alt="" className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">{initials || '?'}</span>
        )}
        <span className={cn('absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-panel', dot)} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} placement="bottom-end">
        <MenuList className="w-[270px]">
          <div className="px-3 pt-1 pb-2">
            <div className="truncate text-[13px] font-semibold">{user.name}</div>
            <div className="truncate text-xs text-muted">{user.guest ? 'Modo convidado — dados só neste dispositivo' : user.email}</div>
          </div>
          {!user.guest && (
            <div className="mx-3 mb-2 flex items-start gap-2 rounded-md bg-sunken px-2.5 py-2 text-xs">
              {sync.state === 'error' ? <CloudOff size={14} className="mt-0.5 shrink-0 text-down" /> : <Cloud size={14} className="mt-0.5 shrink-0 text-accent" />}
              <span className="text-muted">
                {sync.state === 'ok' && 'Sincronizado com a nuvem.'}
                {sync.state === 'syncing' && 'A sincronizar…'}
                {sync.state === 'off' && 'Sincronização desligada.'}
                {sync.state === 'error' && sync.message}
              </span>
            </div>
          )}
          <MenuSeparator />
          {!user.guest && <MenuItem icon={<RefreshCw size={15} />} label="Guardar na nuvem agora" onClick={() => void flushSync()} />}
          {user.guest && (
            <MenuItem
              icon={<UserPlus size={15} />}
              label="Entrar / criar conta"
              onClick={async () => {
                await logout();
                router.replace('/');
              }}
            />
          )}
          <MenuItem
            icon={<Crown size={15} />}
            label="Plano e pagamentos"
            onClick={() => {
              setOpen(false);
              openUpgrade();
            }}
          />
          {!pwa.standalone && (pwa.canInstall || pwa.ios) && (
            <MenuItem
              icon={<Download size={15} />}
              label="Instalar a app"
              onClick={async () => {
                setOpen(false);
                if (pwa.canInstall) await promptInstall();
                else setIosHelp(true);
              }}
            />
          )}
          <MenuItem
            icon={<BellRing size={15} />}
            label={notifyPermission() === 'granted' ? 'Testar notificação' : 'Ativar notificações'}
            onClick={async () => {
              setOpen(false);
              const p = await requestNotifyPermission();
              if (p === 'granted') {
                const ok = await notifyDevice('ReplayX', 'As notificações dos alertas estão a funcionar.', 'rx-test');
                if (!ok) toast('Não foi possível mostrar a notificação', { kind: 'error' });
              } else if (p === 'denied') toast('Notificações bloqueadas', { kind: 'error', body: 'Ative-as nas definições do site no navegador.' });
              else if (p === 'unsupported') toast('Este navegador não suporta notificações', { kind: 'warning', body: pwa.ios ? 'No iPhone, instale primeiro a app no ecrã principal.' : undefined });
            }}
          />
          <MenuItem icon={<Keyboard size={15} />} label="Atalhos de teclado" onClick={() => useUi.getState().set({ shortcuts: true })} />
          <MenuSeparator />
          <MenuItem
            icon={<LogOut size={15} />}
            label="Terminar sessão"
            danger
            onClick={async () => {
              await flushSync().catch(() => undefined);
              stopSync();
              await logout();
              router.replace('/');
            }}
          />
        </MenuList>
      </Popover>
      <IosInstallHelp open={iosHelp} onClose={() => setIosHelp(false)} />
    </>
  );
}
