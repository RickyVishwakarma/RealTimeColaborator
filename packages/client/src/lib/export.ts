import type { Editor } from '@tiptap/react';

type Node = Record<string, unknown> & {
  type?: string;
  content?: Node[];
  text?: string;
  marks?: { type: string }[];
  attrs?: Record<string, unknown>;
};

function slug(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'document';
}

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export the document as a standalone, self-styled HTML file. */
export function exportHtml(editor: Editor, title: string): void {
  const body = editor.getHTML();
  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
  pre { background: #f4f4f5; padding: 1rem; border-radius: 8px; overflow-x: auto; }
  code { background: #f4f4f5; padding: 0.1rem 0.3rem; border-radius: 4px; }
  blockquote { border-left: 3px solid #ddd; margin: 0; padding-left: 1rem; color: #555; }
</style>
</head>
<body>
${body}
</body>
</html>`;
  download(`${slug(title)}.html`, doc, 'text/html');
}

/** Export the document as Markdown via a small ProseMirror-JSON serializer. */
export function exportMarkdown(editor: Editor, title: string): void {
  const json = editor.getJSON() as Node;
  const md = (json.content ?? []).map(serializeBlock).join('\n').trim() + '\n';
  download(`${slug(title)}.md`, md, 'text/markdown');
}

/** Open the browser print dialog (user can "Save as PDF"). */
export function printDocument(): void {
  window.print();
}

// --- Markdown serialization (covers StarterKit nodes) ---

function serializeInline(nodes: Node[] | undefined): string {
  if (!nodes) return '';
  return nodes
    .map((n) => {
      if (n.type !== 'text') return '';
      let text = n.text ?? '';
      for (const mark of n.marks ?? []) {
        if (mark.type === 'bold') text = `**${text}**`;
        else if (mark.type === 'italic') text = `*${text}*`;
        else if (mark.type === 'strike') text = `~~${text}~~`;
        else if (mark.type === 'code') text = `\`${text}\``;
      }
      return text;
    })
    .join('');
}

function serializeBlock(node: Node, depth = 0): string {
  switch (node.type) {
    case 'heading': {
      const level = Number(node.attrs?.level ?? 1);
      return `${'#'.repeat(level)} ${serializeInline(node.content)}\n`;
    }
    case 'paragraph':
      return `${serializeInline(node.content)}\n`;
    case 'blockquote':
      return (
        (node.content ?? [])
          .map((c) => `> ${serializeBlock(c, depth).trim()}`)
          .join('\n') + '\n'
      );
    case 'codeBlock':
      return `\`\`\`\n${serializeInline(node.content)}\n\`\`\`\n`;
    case 'bulletList':
      return (
        (node.content ?? [])
          .map((item) => `${'  '.repeat(depth)}- ${serializeListItem(item, depth)}`)
          .join('\n') + '\n'
      );
    case 'orderedList':
      return (
        (node.content ?? [])
          .map((item, i) => `${'  '.repeat(depth)}${i + 1}. ${serializeListItem(item, depth)}`)
          .join('\n') + '\n'
      );
    default:
      return serializeInline(node.content);
  }
}

function serializeListItem(item: Node, depth: number): string {
  return (item.content ?? [])
    .map((c) => serializeBlock(c, depth + 1).trim())
    .join(' ')
    .trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
