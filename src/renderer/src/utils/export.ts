/**
 * 数据导出工具函数。
 * 图片导出使用 SVG foreignObject 截图，无需额外依赖。
 * CSV/JSON/Markdown 导出纯前端实现。
 */

/**
 * 将 DOM 元素导出为 PNG 图片。
 * 使用 SVG foreignObject 方式截图，无需额外依赖。
 */
export async function exportElementAsImage(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  const width = element.offsetWidth;
  const height = element.scrollHeight;
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue('--bg-base')
    .trim() || '#F7F4ED';

  // 克隆节点
  const clone = element.cloneNode(true) as HTMLElement;

  // 序列化为 SVG
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width: ${width}px; background: ${bg};">
      ${new XMLSerializer().serializeToString(clone).replace(/#/g, '%23')}
    </div>
  </foreignObject>
</svg>`;

  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('截图失败，可能因跨域限制'));
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(2, 2);
  ctx.drawImage(img, 0, 0);

  URL.revokeObjectURL(url);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }, 'image/png');
}

/**
 * 将数据导出为 CSV 文件。
 */
export function exportCSV(
  headers: string[],
  rows: (string | number)[][],
  filename: string,
): void {
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row
        .map((cell) => {
          const str = String(cell);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(','),
    ),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.download = `${filename}.csv`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * 将数据导出为 JSON 文件。
 */
export function exportJSON(data: unknown, filename: string): void {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  link.download = `${filename}.json`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * 将数据导出为 Markdown 表格文件。
 */
export function exportMarkdown(
  headers: string[],
  rows: (string | number)[][],
  filename: string,
): void {
  const mdContent = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');

  const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
  const link = document.createElement('a');
  link.download = `${filename}.md`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}
