// 本地类型声明: keytar 是可选的原生模块, 未在 dependencies 中固定。
// 当用户安装 keytar 后运行时 require 可解析; 未安装时 store.ts 的 try/catch 回退明文。
// 此声明仅用于类型检查, 不引入运行时依赖。
declare module 'keytar' {
  export function getPassword(service: string, account: string): Promise<string | null>;
  export function setPassword(service: string, account: string, password: string): Promise<void>;
  export function deletePassword(service: string, account: string): Promise<boolean>;
  export function findCredentials(service: string): Promise<{ account: string; password: string }[]>;
  export function findPassword(service: string): Promise<string | null>;
}
