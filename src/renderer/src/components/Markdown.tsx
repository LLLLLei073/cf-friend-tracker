import React from 'react';

/**
 * 安全的最小化 Markdown 渲染器。
 * - 不依赖 dangerouslySetInnerHTML，所有文本都作为 React 文本节点渲染，自动转义，杜绝 XSS。
 * - 仅实现更新说明常用的子集：标题 / 有序·无序列表 / 引用 / 代码块 / 行内 **粗体** *斜体* `代码` [链接](url)。
 * - 链接仅允许 http(s)，避免 javascript: 等危险协议。
 */

type Block =
  | { type: 'code'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'paragraph'; text: string };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (/^```/.test(line.trim())) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i]);
        i++;
      }
      i++; // 跳过结束的 ``` 围栏
      blocks.push({ type: 'code', text: buf.join('\n') });
      continue;
    }

    // 空行
    if (line.trim() === '') {
      i++;
      continue;
    }

    // 标题
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ type: 'heading', level: h[1].length, text: h[2] });
      i++;
      continue;
    }

    // 引用
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', text: buf.join(' ') });
      continue;
    }

    // 列表
    if (/^(\s*)([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^(\s*)([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^(\s*)([-*]|\d+\.)\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    // 段落：收集连续的普通行
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i].trim()) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^(\s*)([-*]|\d+\.)\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'paragraph', text: para.join('\n') });
  }

  return blocks;
}

const INLINE_RE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1]) {
      nodes.push(
        <code
          key={key++}
          style={{
            background: 'rgba(127,127,127,0.18)',
            padding: '1px 4px',
            borderRadius: 4,
            fontFamily: 'monospace',
            fontSize: 12,
          }}
        >
          {m[1].slice(1, -1)}
        </code>
      );
    } else if (m[2]) {
      nodes.push(<strong key={key++}>{m[2].slice(2, -2)}</strong>);
    } else if (m[3]) {
      nodes.push(<em key={key++}>{m[3].slice(1, -1)}</em>);
    } else if (m[4]) {
      const label = m[4];
      const url = m[5];
      nodes.push(
        <a key={key++} href={url} target="_blank" rel="noreferrer">
          {label}
        </a>
      );
    }
    last = INLINE_RE.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export default function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={className} style={{ whiteSpace: 'normal', lineHeight: 1.6 }}>
      {blocks.map((b, idx) => {
        switch (b.type) {
          case 'code':
            return (
              <pre
                key={idx}
                style={{
                  background: 'rgba(127,127,127,0.15)',
                  padding: '8px 10px',
                  borderRadius: 6,
                  overflowX: 'auto',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  margin: '6px 0',
                }}
              >
                <code>{b.text}</code>
              </pre>
            );
          case 'heading': {
            const size = b.level >= 2 ? 13 : 14;
            return (
              <div
                key={idx}
                style={{ fontWeight: 700, marginTop: 8, marginBottom: 4, fontSize: size }}
              >
                {renderInline(b.text)}
              </div>
            );
          }
          case 'quote':
            return (
              <blockquote
                key={idx}
                style={{
                  borderLeft: '3px solid var(--border, #888)',
                  margin: '6px 0',
                  paddingLeft: 10,
                  color: 'var(--text-muted)',
                }}
              >
                {renderInline(b.text)}
              </blockquote>
            );
          case 'list':
            return b.ordered ? (
              <ol key={idx} style={{ margin: '4px 0', paddingLeft: 22 }}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ol>
            ) : (
              <ul key={idx} style={{ margin: '4px 0', paddingLeft: 22 }}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ul>
            );
          case 'paragraph': {
            const lines = b.text.split('\n');
            return (
              <p key={idx} style={{ margin: '6px 0' }}>
                {lines.map((ln, j) => (
                  <React.Fragment key={j}>
                    {j > 0 && <br />}
                    {renderInline(ln)}
                  </React.Fragment>
                ))}
              </p>
            );
          }
          default:
            return null;
        }
      })}
    </div>
  );
}
