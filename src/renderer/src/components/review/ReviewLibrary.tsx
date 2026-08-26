import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReviewState } from '../../types';
import { useToast } from '../../components/Toast';
import { callApi, confirmDialog } from '../../utils/safe-call';
import { getRatingColor } from '../../utils/rank';
import styles from '../../styles/review.module.css';

interface Props {
  reviewState: ReviewState;
  onChanged: () => void;
}

const SOURCE_LABEL: Record<string, string> = {
  'contest-upsolve': '比赛复盘',
  timeline: '练习时间轴',
  manual: '手动添加',
  daily: '每日练习',
};

export default function ReviewLibrary({ reviewState, onChanged }: Props) {
  const toast = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<{ contestId: number; index: string; note: string } | null>(null);

  const handleRemove = async (contestId: number, index: string) => {
    const ok = await confirmDialog(`确定将 ${contestId}${index} 从复习库移除吗？`);
    if (!ok) return;
    const res = await callApi(window.api.review.remove(contestId, index), toast, {
      errorMsg: '移除失败',
    });
    if (res === true) {
      toast.success('已移除');
      onChanged();
    }
  };

  const handleClear = async () => {
    const ok = await confirmDialog('确定清空整个复习库吗？此操作不可撤销。');
    if (!ok) return;
    await callApi(window.api.review.clear(), toast, { errorMsg: '清空失败', successMsg: '已清空复习库' });
    onChanged();
  };

  const saveNote = async () => {
    if (!editing) return;
    const { contestId, index, note } = editing;
    const res = await callApi(window.api.review.setNote(contestId, index, note), toast, {
      errorMsg: '保存备注失败',
    });
    if (res === true) {
      toast.success('备注已保存');
      setEditing(null);
      onChanged();
    }
  };

  const list = reviewState.problems;

  return (
    <div>
      <div className={styles.toolbar}>
        <span className={styles.sectionHint}>共 {list.length} 道题目</span>
        <span className={styles.spacer} />
        <button className={styles.btn + ' ' + styles.btnDanger + ' ' + styles.btnSm} onClick={handleClear}>
          清空复习库
        </button>
      </div>

      {list.length === 0 ? (
        <div className={styles.empty}>
          复习库还是空的。可在「赛事复盘」的赛后补题中、或「练习时间轴」里把想练的题加入这里。
        </div>
      ) : (
        <div className={styles.libList}>
          {list.map((p) => (
            <div key={`${p.contestId}_${p.index}`} className={styles.libItem}>
              <div className={styles.libMain}>
                <div className={styles.libTitleRow}>
                  <span className={styles.probIndex}>{p.index}</span>
                  <span className={styles.libName}>{p.name ?? `${p.contestId}${p.index}`}</span>
                  {p.rating !== undefined && (
                    <span className={styles.probRating} style={{ color: getRatingColor(p.rating) }}>
                      *{p.rating}
                    </span>
                  )}
                  <span className={styles.libSource}>· {SOURCE_LABEL[p.source ?? 'manual'] ?? p.source}</span>
                </div>
                {editing?.contestId === p.contestId && editing?.index === p.index ? (
                  <textarea
                    className={styles.libNote}
                    value={editing.note}
                    autoFocus
                    placeholder="添加备注（如：复习要点、易错点）"
                    onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                    onBlur={saveNote}
                    rows={2}
                  />
                ) : (
                  (p.note || (
                    <div
                      className={styles.libNote}
                      style={{ borderStyle: 'dashed', cursor: 'text' }}
                      onClick={() => setEditing({ contestId: p.contestId, index: p.index, note: p.note ?? '' })}
                    >
                      {p.note || '点击添加备注…'}
                    </div>
                  ))
                )}
                <div className={styles.probMeta}>
                  {(p.tags ?? []).map((t) => (
                    <span key={t} className={styles.tag}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  className={styles.btn + ' ' + styles.btnSm}
                  onClick={() => navigate(`/problems/${p.contestId}/${p.index}`)}
                >
                  打开
                </button>
                <button
                  className={styles.btn + ' ' + styles.btnSm + ' ' + styles.btnDanger}
                  onClick={() => handleRemove(p.contestId, p.index)}
                >
                  移除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
