/** Measures: each workflow's measure, its definition, what to watch, the baseline and the verified current value. */
import { Panel } from '@cognirise/atelier/layout';
import { useApi } from '../lib/api';
import { money, num, pct } from '../lib/format';
import { Chip, DomainChip, Empty, Hero, Note, Screen, Table } from '../app/ui';

export function MeasuresScreen() {
  const { data, error } = useApi<any[]>('/measures', { poll: 15000 });
  if (error) return <Empty>{error}</Empty>;
  const fmt = (m: any, v: number | null) => (v === null ? '—' : m.unit === 'AED' ? money(v) : m.unit === '%' ? pct(v) : m.unit === 'days' ? `${num(v, 1)} days` : num(v, 1));
  return (
    <Screen hero={<Hero eyebrow="Measures" title="Verified by Muraqib, not reported by the agent that acted" lede="Each measure has a definition the owner agreed, a baseline that is the operator’s own, and a current value computed from closed cases. The Watch column names the way each measure can be gamed, so it is not." />}>
      <Note tone="warn">Illustrative targets are agreed in discovery against the operator’s baseline and validated in a scoped pilot. They are not achieved results, forecasts or guarantees. Everything on this screen is synthetic.</Note>
      <Panel title="The measures">
        <Table><thead><tr><th>Domain</th><th>Measure</th><th>Baseline</th><th>Now</th><th>Definition</th><th>Watch</th><th>Illustrative target</th></tr></thead><tbody>
          {(data ?? []).map((m) => { const better = m.current !== null && m.baseline !== null ? (m.better === 'lower' ? m.current < m.baseline : m.current > m.baseline) : null; return (
            <tr key={m.id}><td><DomainChip d={m.domain} /></td><td className="text-sm font-medium">{m.name}{m.designed ? <Chip className="ms-1">designed</Chip> : null}</td><td className="font-mono text-[12px]">{fmt(m, m.baseline)}</td><td className="font-mono text-[12px]">{m.designed ? '—' : fmt(m, m.current)}{better === null ? null : <Chip tone={better ? 'success' : 'danger'} className="ms-1">{better ? 'better' : 'worse'}</Chip>}</td><td className="text-[12px]">{m.definition}</td><td className="text-[12px] text-muted-foreground">{m.watch}</td><td className="text-[12px]">{m.target ?? 'define in discovery'}</td></tr>
          ); })}
        </tbody></Table>
      </Panel>
    </Screen>
  );
}
