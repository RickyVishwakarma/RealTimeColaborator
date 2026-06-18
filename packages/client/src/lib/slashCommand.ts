import { Extension, type Range } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, {
  type SuggestionProps,
  type SuggestionKeyDownProps,
} from '@tiptap/suggestion';
import { SlashMenu, type SlashMenuRef } from '../components/SlashMenu';

export interface SlashItem {
  title: string;
  hint: string;
  icon: string;
  command: (props: { editor: Editor; range: Range }) => void;
}

const ALL_ITEMS: SlashItem[] = [
  {
    title: 'Heading 1',
    hint: 'Big section heading',
    icon: 'H1',
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    hint: 'Medium heading',
    icon: 'H2',
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    hint: 'Small heading',
    icon: 'H3',
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
  },
  {
    title: 'Bullet list',
    hint: 'Unordered list',
    icon: '•',
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'Numbered list',
    hint: 'Ordered list',
    icon: '1.',
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'Quote',
    hint: 'Blockquote',
    icon: '❝',
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'Code block',
    hint: 'Fenced code',
    icon: '{ }',
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: 'Divider',
    hint: 'Horizontal rule',
    icon: '―',
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: 'Table',
    hint: '3×3 with header',
    icon: '▦',
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    title: 'Image',
    hint: 'Insert by URL',
    icon: '🖼',
    command: ({ editor, range }) => {
      const chain = editor.chain().focus().deleteRange(range);
      const url = window.prompt('Image URL');
      if (url) chain.setImage({ src: url }).run();
      else chain.run();
    },
  },
];

function filterItems(query: string): SlashItem[] {
  const q = query.toLowerCase();
  return ALL_ITEMS.filter((i) => i.title.toLowerCase().includes(q));
}

/** Renders the popup and forwards keystrokes to it (TipTap suggestion lifecycle). */
function makeRenderer() {
  let component: ReactRenderer<SlashMenuRef> | null = null;
  let el: HTMLDivElement | null = null;

  const place = (rect: DOMRect | null | undefined): void => {
    if (!el || !rect) return;
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.bottom + 6}px`;
  };

  return {
    onStart: (props: SuggestionProps<SlashItem>) => {
      component = new ReactRenderer(SlashMenu, { props, editor: props.editor });
      el = document.createElement('div');
      el.className = 'slash-popup';
      el.style.position = 'fixed';
      el.style.zIndex = '80';
      el.appendChild(component.element);
      document.body.appendChild(el);
      place(props.clientRect?.());
    },
    onUpdate: (props: SuggestionProps<SlashItem>) => {
      component?.updateProps(props);
      place(props.clientRect?.());
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (props.event.key === 'Escape') {
        el?.remove();
        return true;
      }
      return component?.ref?.onKeyDown(props) ?? false;
    },
    onExit: () => {
      el?.remove();
      el = null;
      component?.destroy();
      component = null;
    },
  };
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }) => filterItems(query),
        command: ({ editor, range, props }) => props.command({ editor, range }),
        render: makeRenderer,
      }),
    ];
  },
});
