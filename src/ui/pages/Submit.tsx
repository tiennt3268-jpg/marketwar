import { useTeam } from '../context';
import { Badge, Card, COUNTRY_FLAG } from '../components';
import { estimateSpend, latestVersion, sanitizeDecision, validateDecision } from '../../engine/decisions';
import { sameFormula } from '../../engine/product';
import { MODE_RULES } from '../../engine/scenario';
import { COUNTRIES } from '../../engine/types';
import { fmtK, fmtNum, sum } from '../../engine/util';

const FIELD_PAGE: [RegExp, string][] = [[/^skus/, 'product'], [/^production|^outsourcing/, 'operations'], [/^shipments/, 'operations'], [/^countries\.\w+\.(entry|partner|ownership)/, 'strategy'], [/^countries/, 'marketing'], [/newLoan|debt|dividend|budget/, 'treasury']];

export default function Submit() {
  const { game, setGame, company: co, decision: d, update, readOnly, go } = useTeam();
  const clean = sanitizeDecision(d, co, game.scenario, game.round);
  const issues = validateDecision(clean, co, game);
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const spend = estimateSpend(clean, co, game);
  const pageFor = (field: string) => FIELD_PAGE.find(([re]) => re.test(field))?.[1] ?? 'overview';

  const changes: string[] = [];
  for (const s of clean.skus) {
    const ex = co.skus.find((x) => x.id === s.skuId);
    if (!ex) changes.push(`SKU mới: ${s.name}`);
    else if (!sameFormula(latestVersion(ex).formula, s.formula)) changes.push(`Đổi công thức ${s.name} → phiên bản mới`);
    if (ex && s.retire && !ex.retired) changes.push(`Ngừng SKU ${s.name}`);
  }
  for (const c of COUNTRIES) {
    const cd = clean.countries[c];
    if (cd.entryAction === 'enter') changes.push(`${COUNTRY_FLAG[c]} Thâm nhập ${c} bằng ${MODE_RULES[cd.entryMode].label} (${cd.entryScale})`);
    if (cd.entryAction === 'exit') changes.push(`${COUNTRY_FLAG[c]} Rút khỏi ${c}`);
  }
  if (clean.capacityCapex) changes.push(`Đầu tư công suất ${fmtK(clean.capacityCapex)}`);
  if (clean.newLoan) changes.push(`Vay mới ${fmtK(clean.newLoan)} ${clean.loanCurrency}`);
  changes.push(`Sản xuất ${fmtNum(sum(Object.values(clean.production)))} hộp tại VN, thuê ngoài ${fmtNum(sum(Object.values(clean.outsourcing)))}`);
  changes.push(`${clean.shipments.length} lô hàng · ${fmtNum(sum(clean.shipments.map((s) => s.qty)))} hộp`);

  const submit = () => {
    const next = { ...clean, submitted: true, revision: d.revision + 1 };
    setGame({
      ...game, decisions: { ...game.decisions, [co.id]: next },
      audit: [...game.audit, { at: new Date().toISOString(), round: game.round, actor: co.name, event: 'SUBMIT', detail: `revision ${next.revision}` }],
    });
  };
  const amend = () => {
    setGame({
      ...game, decisions: { ...game.decisions, [co.id]: { ...d, submitted: false } },
      audit: [...game.audit, { at: new Date().toISOString(), round: game.round, actor: co.name, event: 'AMEND', detail: `revision ${d.revision}` }],
    });
  };
  void update;

  return (
    <div>
      <div className="section-title"><div><h1>Kiểm tra & nộp quyết định – vòng {game.round}</h1><div className="muted small">Kiểm tra giống phía server (Decision Dependency Engine): BOM, công nghệ, trần sở hữu, hạn mức vay, ngân sách tiền mặt.</div></div>
        {d.submitted ? <Badge tone="good">✔ Đã nộp (revision {d.revision})</Badge> : <Badge tone="warn">Bản nháp (revision {d.revision})</Badge>}
      </div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Card title={`Lỗi (${errors.length})`}>
            {errors.length === 0 ? <div className="alert good small">Không có lỗi – có thể nộp.</div> : (
              <div className="stack">{errors.map((e, i) => (
                <div key={i} className="alert bad small spread"><span><b>{e.code}</b> · {e.message}</span><button className="btn sm" onClick={() => go(pageFor(e.field))}>Sửa</button></div>
              ))}</div>
            )}
          </Card>
          <Card title={`Cảnh báo (${warnings.length})`}>
            {warnings.length === 0 ? <p className="muted small">Không có cảnh báo.</p> : warnings.map((w, i) => <div key={i} className="alert warn small" style={{ marginBottom: 6 }}><b>{w.code}</b> · {w.message}</div>)}
          </Card>
        </div>
        <div className="stack">
          <Card title="Tóm tắt thay đổi">
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
            <div className="table-wrap" style={{ marginTop: 10 }}><table><tbody>
              {Object.entries(spend).filter(([, v]) => v > 0).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{fmtK(v)}</td></tr>)}
              <tr className="total"><td>Tổng chi dự kiến</td><td className="num">{fmtK(sum(Object.values(spend)))}</td></tr>
            </tbody></table></div>
          </Card>
          <Card>
            {game.phase !== 'OPEN' ? <p className="muted">Vòng đã khoá.</p> : co.isBot ? <p className="muted">Đội bot tự ra quyết định khi xử lý vòng.</p> : d.submitted ? (
              <div className="stack">
                <div className="alert good">Đã nộp. Bạn vẫn có thể rút lại để sửa trước khi Game Master khoá vòng.</div>
                <button className="btn" onClick={amend}>✎ Rút lại để chỉnh sửa</button>
              </div>
            ) : (
              <div className="stack">
                <p className="small muted">Các quyết định không đảo ngược (capex, liên doanh, mua lại, vay) sẽ được thực hiện khi xử lý vòng. Nếu không nộp, hệ thống dùng chính sách mặc định an toàn từ bản nháp hiện tại.</p>
                <button className="btn primary" disabled={errors.length > 0 || readOnly} onClick={submit}>📤 Nộp quyết định vòng {game.round}</button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
