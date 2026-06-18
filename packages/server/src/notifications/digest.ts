import nodemailer, { type Transporter } from 'nodemailer';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';

/**
 * Mail transport. Uses SMTP_URL when configured; otherwise a "stream" transport
 * that captures the message instead of sending — so the digest pipeline is fully
 * exercised in dev without real SMTP (the message is logged).
 */
let transporter: Transporter | null = null;
function getTransport(): Transporter {
  if (transporter) return transporter;
  const url = process.env.SMTP_URL;
  transporter = url
    ? nodemailer.createTransport(url)
    : nodemailer.createTransport({ streamTransport: true, newline: 'unix', buffer: true });
  return transporter;
}

interface DigestRow {
  type: string;
  body: string;
  document_title: string | null;
  created_at: Date;
}

export interface DigestResult {
  count: number;
  sent: boolean;
}

/**
 * Build and "send" a digest of the user's unread notifications. Returns the
 * number of items included. No-op (count 0) when there's nothing unread.
 */
export async function sendDigest(userId: string): Promise<DigestResult> {
  const user = await query<{ email: string; display_name: string }>(
    'SELECT email, display_name FROM users WHERE id = $1',
    [userId],
  );
  if (!user.rows[0]) return { count: 0, sent: false };

  const items = await query<DigestRow>(
    `SELECT n.type, n.body, d.title AS document_title, n.created_at
     FROM notifications n
     LEFT JOIN documents d ON d.id = n.document_id
     WHERE n.user_id = $1 AND n.read_at IS NULL
     ORDER BY n.created_at DESC
     LIMIT 50`,
    [userId],
  );
  if (items.rows.length === 0) return { count: 0, sent: false };

  const rows = items.rows
    .map(
      (r) =>
        `<li style="margin:0 0 8px"><strong>${escape(r.body)}</strong>${
          r.document_title ? ` — <span style="color:#666">${escape(r.document_title)}</span>` : ''
        }</li>`,
    )
    .join('');
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px">
      <h2>Hi ${escape(user.rows[0].display_name)}, here's your Folio digest</h2>
      <p>You have ${items.rows.length} unread notification(s):</p>
      <ul style="padding-left:18px">${rows}</ul>
    </div>`;

  const info = await getTransport().sendMail({
    from: process.env.MAIL_FROM ?? 'Folio <no-reply@folio.app>',
    to: user.rows[0].email,
    subject: `Folio: ${items.rows.length} unread notification(s)`,
    html,
  });

  if (!process.env.SMTP_URL) {
    // Dev: surface the captured message so the pipeline is verifiable.
    logger.info(
      { to: user.rows[0].email, count: items.rows.length },
      'Digest generated (no SMTP configured — not delivered)',
    );
  } else {
    logger.info({ messageId: info.messageId, to: user.rows[0].email }, 'Digest email sent');
  }

  return { count: items.rows.length, sent: Boolean(process.env.SMTP_URL) };
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
