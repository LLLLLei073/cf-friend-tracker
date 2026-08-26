import styles from '../styles/command-palette.module.css';

interface Shortcut {
  keys: string;
  desc: string;
  group: string;
}

const SHORTCUTS: Shortcut[] = [
  // 全局
  { group: '全局', keys: 'Ctrl + K', desc: '打开全局搜索(好友/题目/比赛/页面)' },
  { group: '全局', keys: 'Ctrl + /', desc: '打开快捷键帮助' },
  { group: '全局', keys: 'Alt', desc: '唤起 Alt 轮盘导航(长按)' },
  { group: '全局', keys: 'Esc', desc: '关闭当前弹窗 / 面板' },
  // 列表内
  { group: '列表', keys: '↑ ↓', desc: '在命令面板/列表中上下选择' },
  { group: '列表', keys: 'Enter', desc: '确认选择并跳转' },
  // 题目页
  { group: '刷题', keys: 'Ctrl + S', desc: '保存代码(做题页)' },
  // 通用
  { group: '通用', keys: '右键', desc: '好友列表右键打开操作菜单(关注/备注/分组/删除)' },
];

const GROUPS = ['全局', '列表', '刷题', '通用'];

interface Props {
  onClose: () => void;
}

/**
 * 快捷键中心: 展示应用内全部快捷键, 按 group 分组。
 * 通过 Ctrl+/ 唤起。样式复用命令面板。
 */
export default function ShortcutHelp({ onClose }: Props) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <div className={styles.footer} style={{ justifyContent: 'space-between', padding: '14px 16px' }}>
          <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>快捷键</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        <div className={styles.results}>
          {GROUPS.map((g) => {
            const list = SHORTCUTS.filter((s) => s.group === g);
            if (list.length === 0) return null;
            return (
              <div key={g} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    padding: '4px 10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {g}
                </div>
                {list.map((s) => (
                  <div
                    key={s.desc}
                    className={styles.row}
                    style={{ cursor: 'default' }}
                  >
                    <div className={styles.rowText}>
                      <span className={styles.rowTitle}>{s.desc}</span>
                    </div>
                    <kbd
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {s.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
