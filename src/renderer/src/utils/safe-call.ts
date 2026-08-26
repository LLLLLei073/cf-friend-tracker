import type { ToastApi } from '../components/Toast';

/**
 * 统一封装一次 IPC 调用: 自动 try/catch, 失败时弹 toast, 成功时可选弹成功 toast。
 * 返回数据或 null(失败时), 调用方用 `if (!data) return;` 短路即可。
 *
 * 用于替代各页面散落的 `try { await api.xxx() } catch(e) { alert(e.message) }` 模板。
 *
 * 示例:
 *   const data = await callApi(window.api.cf.refreshAll(), toast, {
 *     errorMsg: '刷新失败',
 *     successMsg: '刷新成功',
 *   });
 *   if (!data) return;
 */
export async function callApi<T>(
  promise: Promise<T>,
  toast: ToastApi,
  opts?: { errorMsg?: string; successMsg?: string },
): Promise<T | null> {
  try {
    const data = await promise;
    if (opts?.successMsg) toast.success(opts.successMsg);
    return data;
  } catch (e) {
    const base = opts?.errorMsg ? `${opts.errorMsg}: ` : '';
    const msg = (e as Error)?.message || String(e);
    toast.error(`${base}${msg}`);
    return null;
  }
}

/**
 * 用 toast 替代原生 confirm。返回布尔值(用户点击「确认」true / 「取消」false)。
 * 由于原生 confirm 是阻塞的, 这里用 Promise 实现, 调用方 `await confirmDialog(...)`.
 *
 * 注意: 这是一个轻量实现, 优先 toast 风格; 若需要更复杂的表单型确认, 应使用 Modal。
 * 此处仅用于「删除好友」「清空缓存」这类简单危险操作的二次确认。
 */
export function confirmDialog(message: string): Promise<boolean> {
  // 仍用原生 confirm 保证阻塞与语义清晰; 该函数保留作为将来替换为自定义 Modal 的统一入口。
  return Promise.resolve(confirm(message));
}
