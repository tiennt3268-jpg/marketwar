import { useState } from 'react';
import { useTeam } from '../context';
import { Badge, Card, COUNTRY_NAME, RangeField, SelectField } from '../components';
import { MODE_RULES, SCALE_MULT } from '../../engine/scenario';
import { COUNTRIES, ENTRY_MODES, type CountryCode, type EntryScale } from '../../engine/types';
import { fmtK, fmtNum, fmtPct } from '../../engine/util';

export default function Strategy() {
  const { game, company: co, decision: d, update, readOnly } = useTeam();
  const [c, setC] = useState<CountryCode>('CN');
  const p = co.countries[c];
  const cd = d.countries[c];
  const env = game.env[c];
  const rule = MODE_RULES[cd.entryMode];
  const m = SCALE_MULT[cd.entryScale];
  const partners = game.scenario.partners.filter((x) => x.country === c && x.kind === rule.partnerKind);
  const engaged = p.status === 'active' || p.status === 'pending';
  const capexFor = (mode: typeof cd.entryMode) => {
    const r = MODE_RULES[mode];
    if (mode === 'acquisition') {
      const t = game.scenario.partners.find((x) => x.country === c && x.kind === 'acquisition_target');
      return (t?.feeOrMargin ?? 0) * m;
    }
    return r.capex * m * (mode === 'jv' ? cd.ownershipPct : 1);
  };

  return (
    <div>
      <div className="section-title"><h1>Strategy & Market Entry</h1></div>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        {COUNTRIES.map((x) => {
          const px = co.countries[x];
          return (
            <button key={x} className={`mode-card ${x === c ? 'selected' : ''}`} onClick={() => setC(x)}>
              <div className="spread"><b>{COUNTRY_NAME[x]}</b>{px.status === 'active' ? <Badge tone="good">Active</Badge> : px.status === 'pending' ? <Badge tone="warn">Pending</Badge> : d.countries[x].entryAction === 'enter' ? <Badge tone="info">Planned</Badge> : null}</div>
              <div className="small muted">{px.mode ? MODE_RULES[px.mode].label : d.countries[x].entryAction === 'enter' ? MODE_RULES[d.countries[x].entryMode].label : 'Not entered'}</div>
            </button>
          );
        })}
      </div>

      {engaged ? (
        <Card title={`${COUNTRY_NAME[c]} · ${MODE_RULES[p.mode!].label} · ${p.status === 'active' ? 'Active' : `Active from round ${p.activationRound}`}`}>
          <div className="grid g4">
            <div className="stat"><span className="label">Partner</span><b>{game.scenario.partners.find((x) => x.id === p.partnerId)?.name ?? '—'}</b></div>
            <div className="stat"><span className="label">Ownership</span><b>{fmtPct(p.ownershipPct, 0)}</b></div>
            <div className="stat"><span className="label">Local capacity</span><b>{p.localCapacity ? `${fmtNum(p.localCapacity)} boxes` : '—'}</b></div>
            <div className="stat"><span className="label">Local assets</span><b>{fmtK(p.localAssets + p.goodwill)}</b></div>
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            {cd.entryAction === 'exit'
              ? <><Badge tone="bad">Exiting this round</Badge><button className="btn sm" disabled={readOnly} onClick={() => update((x) => { x.countries[c].entryAction = 'hold'; })}>Cancel</button></>
              : <button className="btn sm danger" disabled={readOnly} onClick={() => update((x) => { x.countries[c].entryAction = 'exit'; })}>Exit market</button>}
          </div>
        </Card>
      ) : (
        <Card title={`Entry mode · ${COUNTRY_NAME[c]}`} actions={cd.entryAction === 'enter' ? <Badge tone="info">Starts this round</Badge> : null}>
          <div className="mode-cards">
            {ENTRY_MODES.map((mode) => {
              const r = MODE_RULES[mode];
              const blocked = r.needsFullOwnership && env.foreignOwnershipCap < 1;
              const selected = cd.entryAction === 'enter' && cd.entryMode === mode;
              return (
                <button key={mode} className={`mode-card ${selected ? 'selected' : ''} ${blocked ? 'disabled' : ''}`} disabled={readOnly || blocked}
                  onClick={() => update((x) => {
                    const xc = x.countries[c];
                    xc.entryAction = 'enter';
                    xc.entryMode = mode;
                    xc.partnerId = r.partnerKind ? game.scenario.partners.find((pp) => pp.country === c && pp.kind === r.partnerKind)?.id ?? null : null;
                    if (mode === 'jv') xc.ownershipPct = Math.min(xc.ownershipPct || 0.5, env.foreignOwnershipCap);
                  })}>
                  <h3>{r.label}</h3>
                  <div className="small">Setup {fmtK(r.setupCost * m)} · Capex {fmtK(capexFor(mode))}</div>
                  <div className="small">Lead time {r.leadRounds === 0 ? 'none' : `${r.leadRounds} round${r.leadRounds > 1 ? 's' : ''}`}</div>
                  <div className="small muted">Control {r.control} · Risk {r.risk}</div>
                  <div className="small muted">Max coverage {fmtPct(r.coverageMax, 0)}{r.localCapacity ? ` · Capacity ${fmtNum(r.localCapacity * m)}` : ''}</div>
                  {blocked && <div className="small bad">Ownership cap {fmtPct(env.foreignOwnershipCap, 0)}</div>}
                </button>
              );
            })}
          </div>
          {cd.entryAction === 'enter' && (
            <div className="stack" style={{ marginTop: 16 }}>
              <div className="form-grid">
                <SelectField<EntryScale> label="Scale" value={cd.entryScale} disabled={readOnly} onChange={(v) => update((x) => { x.countries[c].entryScale = v; })}
                  options={[{ value: 'pilot', label: 'Pilot (×0.5)' }, { value: 'normal', label: 'Normal (×1)' }, { value: 'aggressive', label: 'Aggressive (×1.6)' }]} />
                {rule.partnerKind && (
                  <SelectField label="Partner" value={cd.partnerId ?? ''} disabled={readOnly} onChange={(v) => update((x) => { x.countries[c].partnerId = v || null; })}
                    options={[{ value: '', label: 'Select…' }, ...partners.map((pp) => ({ value: pp.id, label: `${pp.name} (quality ${(pp.quality * 100).toFixed(0)})` }))]} />
                )}
              </div>
              {cd.entryMode === 'jv' && (
                <RangeField label={`JV stake (cap ${fmtPct(env.foreignOwnershipCap, 0)})`} value={Math.round(cd.ownershipPct * 100)} min={10} max={Math.round(env.foreignOwnershipCap * 100)} step={5} disabled={readOnly}
                  format={(v) => `${v}%`} onChange={(v) => update((x) => { x.countries[c].ownershipPct = v / 100; })} />
              )}
              <div className="row"><button className="btn sm" disabled={readOnly} onClick={() => update((x) => { x.countries[c].entryAction = 'hold'; })}>Cancel entry</button></div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
