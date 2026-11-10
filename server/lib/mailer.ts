import { env } from "../env.js";

type Mail = { to: string; subject: string; text: string; html: string };

/** In tests, emails are captured here instead of being sent or logged. */
export const testOutbox: Mail[] = [];

/**
 * Sends transactional email through Resend's HTTP API (no SDK needed).
 * Without RESEND_API_KEY, emails are logged instead — fine for local development,
 * but password reset will not reach real users until a key and a verified domain are configured.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const e = env();
  if (e.NODE_ENV === "test") {
    testOutbox.push(mail);
    return;
  }
  if (!e.RESEND_API_KEY) {
    if (e.NODE_ENV === "production") {
      console.error(`[mail] RESEND_API_KEY missing — email "${mail.subject}" to ${redact(mail.to)} was NOT sent`);
    } else {
      console.info(`[mail:dev] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    }
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: e.EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[mail] Resend responded ${res.status} for ${redact(mail.to)}: ${body.slice(0, 300)}`);
  }
}

const redact = (email: string) => email.replace(/^(.).*(@.*)$/, "$1***$2");

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function actionEmail(opts: { heading: string; body: string; cta: string; url: string; footer: string }) {
  const text = `${opts.heading}\n\n${opts.body}\n\n${opts.cta}: ${opts.url}\n\n${opts.footer}\n\n— Code Compass`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;color:#1c1b18">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#fff;border:1px solid #e7e3da;border-radius:14px" cellpadding="0" cellspacing="0">
<tr><td style="padding:32px">
<p style="margin:0 0 24px;font-weight:600;font-size:15px">Code Compass</p>
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3">${esc(opts.heading)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4a4740">${esc(opts.body)}</p>
<a href="${esc(opts.url)}" style="display:inline-block;background:#1c1b18;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:14px;font-weight:500">${esc(opts.cta)}</a>
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#7a766c">${esc(opts.footer)}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}
