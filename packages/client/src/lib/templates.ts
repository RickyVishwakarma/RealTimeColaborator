export interface DocTemplate {
  id: string;
  name: string;
  title: string;
  description: string;
  /** HTML seeded into the editor (empty string = blank document). */
  html: string;
}

export const TEMPLATES: DocTemplate[] = [
  {
    id: 'blank',
    name: 'Blank',
    title: 'Untitled',
    description: 'Start from scratch.',
    html: '',
  },
  {
    id: 'meeting-notes',
    name: 'Meeting notes',
    title: 'Meeting notes',
    description: 'Agenda, attendees, action items.',
    html: `
      <h1>Meeting notes</h1>
      <p><strong>Date:</strong> </p>
      <p><strong>Attendees:</strong> </p>
      <h2>Agenda</h2>
      <ul><li>Item one</li><li>Item two</li></ul>
      <h2>Discussion</h2>
      <p></p>
      <h2>Action items</h2>
      <ul><li>[ ] Owner — task</li></ul>`,
  },
  {
    id: 'prd',
    name: 'Product spec',
    title: 'Product spec',
    description: 'Problem, goals, scope, milestones.',
    html: `
      <h1>Product spec</h1>
      <h2>Problem</h2>
      <p>What are we solving and for whom?</p>
      <h2>Goals & non-goals</h2>
      <ul><li>Goal: </li><li>Non-goal: </li></ul>
      <h2>Proposed solution</h2>
      <p></p>
      <h2>Milestones</h2>
      <ol><li>Milestone 1</li></ol>`,
  },
  {
    id: 'blog',
    name: 'Blog post',
    title: 'Blog post',
    description: 'Title, intro, sections, conclusion.',
    html: `
      <h1>Title</h1>
      <blockquote>One-line hook.</blockquote>
      <h2>Introduction</h2>
      <p></p>
      <h2>Main section</h2>
      <p></p>
      <h2>Conclusion</h2>
      <p></p>`,
  },
];

export function templateById(id: string | undefined): DocTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
