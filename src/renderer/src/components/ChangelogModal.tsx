import { CHANGELOG } from '../data/changelog';
import styles from '../styles/changelog.module.css';

interface ChangelogModalProps {
  onClose: () => void;
  initialVersion?: string; // 只显示这个版本，不显示全部
}

export default function ChangelogModal({ onClose, initialVersion }: ChangelogModalProps) {
  const entries = initialVersion
    ? CHANGELOG.filter((e) => e.version === initialVersion)
    : CHANGELOG;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>📝 更新日志</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.body}>
          {entries.map((entry) => (
            <div key={entry.version} className={styles.entry}>
              <div className={styles.entryHeader}>
                <span className={styles.versionBadge}>v{entry.version}</span>
                <span className={styles.entryDate}>{entry.date}</span>
              </div>
              <h3 className={styles.entryTitle}>{entry.title}</h3>
              <ul className={styles.featureList}>
                {entry.features.map((f, i) => (
                  <li key={i} className={styles.featureItem}>
                    <span className={styles.featureIcon}>{f.icon}</span>
                    <span className={styles.featureText}>{f.text}</span>
                  </li>
                ))}
              </ul>
              {entry.fixes && entry.fixes.length > 0 && (
                <ul className={styles.featureList}>
                  {entry.fixes.map((f, i) => (
                    <li key={i} className={styles.featureItem}>
                      <span className={styles.featureIcon}>{f.icon}</span>
                      <span className={styles.featureText}>{f.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        <div className={styles.footer}>
          <button className={styles.confirmBtn} onClick={onClose}>
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
