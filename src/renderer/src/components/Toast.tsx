import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import styles from '../styles/toast.module.css';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

export interface ToastApi {
  toast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

// 未在 Provider 内使用时返回 noop, 避免崩溃(降级, 不影响功能)
const NOOP_API: ToastApi = {
  toast: () => {},
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
};

let counter = 0;

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  return ctx ?? NOOP_API;
}

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  warning: '!',
  info: 'ℹ',
};

/**
 * 全局 Toast 通知 Provider。
 * - 替代散落在各页面的 alert/confirm, 统一非阻塞反馈。
 * - error 默认 5s, 其余 3s 自动消失; 点击或关闭按钮可立即移除。
 * - 样式跟随 global.css 的笔记本纸张主题与深色模式。
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = `toast-${++counter}`;
      setToasts((prev) => [...prev.slice(-4), { id, type, message }]);
      const duration = type === 'error' ? 5000 : 3000;
      const timer = setTimeout(() => remove(id), duration);
      timers.current.set(id, timer);
    },
    [remove],
  );

  const api: ToastApi = {
    toast,
    success: (m) => toast(m, 'success'),
    error: (m) => toast(m, 'error'),
    warning: (m) => toast(m, 'warning'),
    info: (m) => toast(m, 'info'),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.container}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`${styles.toast} ${styles[t.type]}`}
            role="alert"
            onClick={() => remove(t.id)}
          >
            <span className={styles.icon}>{ICONS[t.type]}</span>
            <span className={styles.message}>{t.message}</span>
            <button
              className={styles.close}
              aria-label="关闭"
              onClick={(e) => {
                e.stopPropagation();
                remove(t.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
