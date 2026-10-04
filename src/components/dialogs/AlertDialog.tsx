'use client';
import { useState } from 'react';
import { useUi } from '@/store/ui';
import { useAlerts, type AlertCondition } from '@/store/alerts';
import { resolveSymbol } from '@/core/symbols';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input, NumberInput, Row, Select, Switch } from '@/components/ui/Field';
import { toast } from '@/components/ui/Toast';

export function AlertDialog() {
  const draft = useUi((s) => s.alertDraft);
  if (!draft) return null;
  return <AlertForm key={`${draft.symbolId}|${draft.price}`} draft={draft} />;
}

function AlertForm({ draft }: { draft: { symbolId: string; price: number } }) {
  const sym = resolveSymbol(draft.symbolId);
  const [price, setPrice] = useState<number | undefined>(+draft.price.toFixed(sym.precision));
  const [cond, setCond] = useState<AlertCondition>('cross');
  const [msg, setMsg] = useState('');
  const [once, setOnce] = useState(true);
  const close = () => useUi.getState().set({ alertDraft: null });
  return (
    <Dialog
      open
      onClose={close}
      title={`Alerta · ${sym.name}`}
      width={400}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (price === undefined) return;
              useAlerts.getState().add({ symbolId: draft.symbolId, price, condition: cond, message: msg.trim(), once });
              if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission();
              toast('Alerta criado', { kind: 'success' });
              close();
            }}
          >
            Criar alerta
          </Button>
        </>
      }
    >
      <div className="divide-y divide-line">
        <Row label="Condição">
          <Select className="w-44" value={cond} onChange={(e) => setCond(e.target.value as AlertCondition)}>
            <option value="cross">Cruzar (qualquer sentido)</option>
            <option value="crossUp">Cruzar para cima</option>
            <option value="crossDown">Cruzar para baixo</option>
          </Select>
        </Row>
        <Row label="Preço">
          <NumberInput className="w-44" value={price} step={Math.pow(10, -sym.precision)} onChange={setPrice} />
        </Row>
        <Row label="Só uma vez">
          <Switch checked={once} onChange={setOnce} />
        </Row>
        <div className="pt-3">
          <Input placeholder="Mensagem (opcional)" value={msg} onChange={(e) => setMsg(e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}
