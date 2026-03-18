import { useEffect, useState } from 'react';
import type { SimStats } from '../types/sim';
import type { SimToMain } from '../types/messages';

const HISTORY_LENGTH = 500;

export function useSimStats(worker: Worker | null): {
  stats: SimStats | null;
  history: SimStats[];
  error: string | null;
} {
  const [stats, setStats] = useState<SimStats | null>(null);
  const [history, setHistory] = useState<SimStats[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!worker) return;

    function onMessage(e: MessageEvent<SimToMain>) {
      const msg = e.data;
      if (msg.type === 'READY') {
        console.log('[App] Worker READY, SAB received');
      }
      if (msg.type === 'STATS') {
        console.log('[App] STATS received — tick', msg.stats.tick, 'pop', msg.stats.population);
        setStats(msg.stats);
        setHistory(prev => {
          const next = [...prev, msg.stats];
          return next.length > HISTORY_LENGTH ? next.slice(next.length - HISTORY_LENGTH) : next;
        });
      }
      if (msg.type === 'ERROR') {
        console.error('[App] Worker ERROR:', msg.message);
        setError(msg.message);
      }
    }

    worker.addEventListener('message', onMessage);
    return () => worker.removeEventListener('message', onMessage);
  }, [worker]);

  return { stats, history, error };
}
