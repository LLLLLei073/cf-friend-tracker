import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { RunAllResult, RunResult, SampleTest } from '../shared/types';

const COMPILE_TIMEOUT_MS = 30000; // 编译超时
const RUN_TIMEOUT_MS = 10000; // 单样例运行超时（防止死循环卡死）
const MAX_OUTPUT = 10 * 1024 * 1024; // 单程输出上限, 防止爆内存

// 探测可用的 g++ 编译器。userPath 优先（用户在设置中指定的路径）,
// 否则依次尝试常见 MinGW 路径, 最后回退到系统 PATH 中的 g++。
export function detectCompiler(userPath?: string): string | null {
  const candidates: string[] = [];
  if (userPath && userPath.trim()) candidates.push(userPath.trim());
  candidates.push('D:\\mingw64\\bin\\g++.exe', 'C:\\mingw64\\bin\\g++.exe', 'g++');

  for (const c of candidates) {
    if (!c) continue;
    if (path.isAbsolute(c)) {
      if (fs.existsSync(c)) return c;
    } else {
      try {
        const r = spawnSync(c, ['--version'], { timeout: 5000 });
        if (r.status === 0) return c;
      } catch {
        // 忽略探测失败, 尝试下一个
      }
    }
  }
  return null;
}

interface ProcOut {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  error?: string;
}

// 异步运行子进程, 支持超时强杀。相比 spawnSync 不会阻塞主进程事件循环。
function runProcess(
  cmd: string,
  args: string[],
  input: string,
  timeoutMs: number,
): Promise<ProcOut> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true });
    } catch (e) {
      resolve({ stdout: '', stderr: '', exitCode: null, timedOut: false, error: (e as Error).message });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
      if (stdout.length > MAX_OUTPUT) stdout = stdout.slice(0, MAX_OUTPUT);
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > MAX_OUTPUT) stderr = stderr.slice(0, MAX_OUTPUT);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // 忽略
      }
    }, timeoutMs);

    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: null, timedOut: false, error: e.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, timedOut });
    });

    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // 忽略清理失败（临时目录, 系统会自动回收）
  }
}

// 编译并运行 C++ 代码, 对所有样例对拍, 返回结构化结果
export async function runCode(
  code: string,
  samples: SampleTest[],
  userCompilerPath?: string,
): Promise<RunAllResult> {
  const compiler = detectCompiler(userCompilerPath);
  if (!compiler) {
    return {
      results: [],
      allPassed: false,
      compilerPath: null,
      compileError:
        '未找到 C++ 编译器（g++）。请在「设置」中配置 MinGW g++ 路径（例如 D:\\mingw64\\bin\\g++.exe），并确保已安装。',
    };
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-run-'));
  const src = path.join(tmp, 'sol.cpp');
  const exe = path.join(tmp, 'sol.exe');
  fs.writeFileSync(src, code, 'utf-8');

  const comp = await runProcess(compiler, ['-std=c++17', '-O2', '-o', exe, src], '', COMPILE_TIMEOUT_MS);
  if (comp.exitCode !== 0) {
    cleanup(tmp);
    const msg = (comp.stderr || comp.stdout || '编译失败').slice(0, 4000);
    return {
      results: [],
      allPassed: false,
      compilerPath: compiler,
      compileError: msg,
    };
  }

  const results: RunResult[] = [];
  let allPassed = true;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const start = Date.now();
    const r = await runProcess(exe, [], s.input, RUN_TIMEOUT_MS);
    const timeMs = Date.now() - start;

    const actual = (r.stdout ?? '').replace(/\r\n/g, '\n');
    const expected = (s.output ?? '').replace(/\r\n/g, '\n');
    const passed = !r.timedOut && r.exitCode === 0 && actual.trim() === expected.trim();
    if (!passed) allPassed = false;

    results.push({
      index: i,
      input: s.input,
      expected: s.output,
      actual,
      passed,
      exitCode: r.exitCode,
      error:
        r.error ??
        (r.timedOut
          ? '运行超时（>10s），可能存在死循环'
          : r.exitCode !== 0
            ? r.stderr || '运行时错误（非零退出码）'
            : undefined),
      timedOut: r.timedOut,
      timeMs,
    });
  }

  cleanup(tmp);
  return { results, allPassed, compilerPath: compiler };
}
