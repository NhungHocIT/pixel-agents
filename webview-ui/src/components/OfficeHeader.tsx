import { useEffect, useState } from 'react';

import { isSoundEnabled, setSoundEnabled } from '../notificationSound.js';
import { transport } from '../transport/index.js';
import type { TransportState } from '../transport/types.js';
import { Button } from './ui/Button.js';

const CONNECTION: Record<TransportState, { label: string; dot: string }> = {
  connected: { label: 'đã kết nối', dot: 'bg-status-success' },
  connecting: { label: 'đang kết nối…', dot: 'bg-status-permission' },
  reconnecting: { label: 'đang kết nối lại…', dot: 'bg-status-permission' },
  disconnected: { label: 'mất kết nối', dot: 'bg-status-error' },
};

/** Weekday as written in Vietnamese: CN, T2 … T7. */
const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const pad = (n: number) => String(n).padStart(2, '0');
const formatClock = (d: Date) =>
  `${WEEKDAY[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

interface OfficeHeaderProps {
  version: string;
  onOpenChangelog: () => void;
}

/**
 * The bar across the top of the desktop standalone window: the app's name and
 * whether the server is connected on the left; the version, a clock and the
 * notification-sound switch on the right.
 */
export function OfficeHeader({ version, onOpenChangelog }: OfficeHeaderProps) {
  const [state, setState] = useState<TransportState>(transport.state);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Re-read on mount in case the state changed before this subscribed.
    setState(transport.state);
    return transport.onStateChange(setState);
  }, []);

  // The clock ticks every second; the re-render also picks up a sound
  // toggle made in Settings (notificationSound has no subscription).
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const conn = CONNECTION[state];
  const soundOn = isSoundEnabled();
  const toggleSound = () => {
    setSoundEnabled(!soundOn);
    transport.send({ type: 'setSoundEnabled', enabled: !soundOn });
    setNow(new Date());
  };

  return (
    <div className="shrink-0 flex items-center gap-12 px-12 py-4 bg-bg border-b-2 border-border text-sm">
      <span className="text-text">Pixel Agents</span>
      <span className="flex items-center gap-6 text-xs text-text-muted">
        <span className={`size-6 shrink-0 ${conn.dot}`} />
        {conn.label}
      </span>

      <div className="ml-auto flex items-center gap-12">
        {version && (
          <button
            type="button"
            onClick={onOpenChangelog}
            className="px-6 border-2 border-border text-xs text-text-muted hover:text-text cursor-pointer bg-transparent"
            title="Xem có gì mới"
          >
            v{version}
          </button>
        )}
        <span className="text-xs text-text-muted tabular-nums">{formatClock(now)}</span>
        <Button
          variant={soundOn ? 'active' : 'ghost'}
          size="sm"
          onClick={toggleSound}
          title="Âm báo khi agent xong lượt hoặc cần bạn"
        >
          Âm thanh: {soundOn ? 'bật' : 'tắt'}
        </Button>
      </div>
    </div>
  );
}
