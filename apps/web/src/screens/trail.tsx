/** The trail: who did what, at what authority, on which evidence; overrides first. */
import { useEffect, useState } from 'react';
import { useApi } from '../lib/api';
import { useApp } from '../app/state';
import { TrailList } from '../app/case';
import { Empty, Hero, Screen, Select } from '../app/ui';

export function TrailScreen() {
  const { route } = useApp();
  const [overrides, setOverrides] = useState(false); const [actor, setActor] = useState(''); const [caseRef, setCaseRef] = useState('');
  useEffect(() => { if (route.param === 'overrides=1') setOverrides(true); else if (route.param?.startsWith('case=')) setCaseRef(route.param.slice(5)); }, [route.param]);
  const { data, error } = useApi<any[]>(`/trail?${overrides ? 'overrides=1&' : ''}${actor ? `actor=${actor}&` : ''}${caseRef ? `case=${encodeURIComponent(caseRef)}&` : ''}`, { poll: 10000 });
  if (error) return <Empty>{error}</Empty>;
  return (
    <Screen hero={<Hero eyebrow="Trail" title="How do I know what it did?" lede="Actor, act, autonomy, the system interface called, before and after, and, where a person disagreed, the override and its reason. Overrides are the most valuable rows: evidence the person is still in charge, and in a real deployment the training data." />} banner={false}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={overrides} onChange={(e) => setOverrides(e.target.checked)} /> overrides only</label>
        <Select value={actor} onChange={setActor} className="h-9 w-48 text-[13px]"><option value="">Every actor</option>{['raqib', 'fahis', 'mushir', 'hami', 'munaffidh', 'rafiq', 'muraqib', 'billing_officer', 'billing_manager', 'finance', 'roaming_analyst', 'noc', 'cvm_manager', 'service_agent', 'enterprise_manager'].map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}</Select>
        <input className="input h-9 w-56 text-[13px]" placeholder="Case reference" value={caseRef} onChange={(e) => setCaseRef(e.target.value)} />
        <span className="text-[12px] text-muted-foreground">{data?.length ?? 0} entries (latest 200)</span>
      </div>
      <TrailList rows={data ?? []} />
    </Screen>
  );
}
