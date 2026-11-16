const nodemailer = require('nodemailer');
const db = require('./db');

// Gmail / Google Workspace: SMTP_USER + SMTP_PASSWORD (an App Password),
// host defaults to smtp.gmail.com. Locally, compose points SMTP_HOST at
// Mailpit, a practice mailbox that needs no login.
function config(env = process.env) {
    const user = env.SMTP_USER?.trim();
    // Google shows App Passwords as "abcd efgh ijkl mnop"; the spaces are
    // only for readability.
    const password = env.SMTP_PASSWORD?.replace(/\s+/g, '');
    const host = env.SMTP_HOST?.trim() || (user ? 'smtp.gmail.com' : null);
    const port = Number(env.SMTP_PORT) || 465;
    return {
        host,
        port,
        secure: port === 465,
        auth: user && password ? { user, pass: password } : undefined,
        from:
            env.MAIL_FROM?.trim().replace(/^"(.*)"$/, '$1') ||
            user ||
            'tracker@localhost',
        appUrl: (env.APP_URL || 'http://localhost').replace(/\/$/, ''),
        problem: !host
            ? 'SMTP_USER and SMTP_PASSWORD are not set'
            : user && !password
              ? 'SMTP_PASSWORD is not set'
              : null,
    };
}

let transport;

function getTransport() {
    const c = config();
    if (c.problem) return null;
    if (!transport) {
        transport = nodemailer.createTransport({
            host: c.host,
            port: c.port,
            secure: c.secure,
            auth: c.auth,
            // Fail within seconds (instead of minutes) when the host
            // blocks outgoing mail.
            connectionTimeout: 15000,
            greetingTimeout: 10000,
            socketTimeout: 20000,
        });
    }
    return transport;
}

function describeConfig() {
    const c = config();
    if (c.problem)
        return `Email is OFF: ${c.problem}. Assignment emails will be skipped.`;
    return `Email is ON: sending through ${c.host}:${c.port}${c.auth ? ` as ${c.auth.user}` : ''} from ${c.from}`;
}

// Turns SMTP errors into something a person can act on.
function explainError(err) {
    const code = err.code || '';
    const response = err.response || err.message || '';
    if (
        code === 'EAUTH' ||
        /535|Username and Password not accepted/i.test(response)
    )
        return 'The mail server rejected the login. Check SMTP_USER, and that SMTP_PASSWORD is a Google App Password (not your normal password).';
    if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED'].includes(code))
        return `Couldn't connect to the mail server (${code}). The host may be blocking outgoing email; Render's free plan does this.`;
    if (code === 'EENVELOPE')
        return `The mail server refused the address: ${response}`;
    return `Sending failed: ${response}`;
}

function escapeHtml(value) {
    return String(value).replace(
        /[&<>"']/g,
        (c) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            })[c],
    );
}

async function send(mail) {
    const transporter = getTransport();
    if (!transporter) throw new Error(config().problem);
    await transporter.sendMail({ from: config().from, ...mail });
}

function assignmentMail(user, tasks, assignedBy) {
    const { appUrl } = config();
    const lines = tasks.map((t) => ({
        label: `${t.code} · ${t.name} (${t.customerName})`,
        url: `${appUrl}/tasks/${t.id}`,
    }));
    return {
        to: user.email,
        subject:
            tasks.length === 1
                ? `New task: ${lines[0].label}`
                : `${tasks.length} new tasks assigned to you`,
        text: [
            `Hi ${user.display_name},`,
            '',
            `${assignedBy.displayName} assigned you:`,
            ...lines.map((l) => `• ${l.label}\n  ${l.url}`),
        ].join('\n'),
        html: `<p>Hi ${escapeHtml(user.display_name)},</p>
<p>${escapeHtml(assignedBy.displayName)} assigned you:</p>
<ul>${lines
            .map(
                (l) =>
                    `<li><a href="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a></li>`,
            )
            .join('')}</ul>`,
    };
}

// Tells a user about tasks newly assigned to them. Never throws: a mail
// problem must not fail the change that triggered it. Every skip or
// failure is logged with the reason.
async function sendAssignmentEmail(userId, tasks, assignedBy) {
    const label = tasks.map((t) => t.code).join(', ');
    try {
        if (!tasks.length) return;
        const { rows } = await db.query(
            'SELECT id, display_name, email FROM users WHERE id = $1',
            [userId],
        );
        const user = rows[0];
        if (!user) return;
        if (user.id === assignedBy.id) {
            console.log(
                `[email] Not sent for ${label}: ${user.display_name} assigned it to themselves.`,
            );
            return;
        }
        if (!user.email) {
            console.log(
                `[email] Not sent for ${label}: ${user.display_name} has no email address. Add one on the Users page.`,
            );
            return;
        }
        const problem = config().problem;
        if (problem) {
            console.log(
                `[email] Not sent to ${user.email} for ${label}: ${problem}.`,
            );
            return;
        }
        await send(assignmentMail(user, tasks, assignedBy));
        console.log(`[email] Sent to ${user.email} for ${label}.`);
    } catch (err) {
        console.error(`[email] Failed for ${label}: ${explainError(err)}`);
    }
}

// For the super user's "Send test email" button. Throws an explained error.
async function sendTestEmail(to, requestedBy) {
    try {
        await send({
            to,
            subject: 'Test email from the Wilson Services tracker',
            text: `This is a test sent by ${requestedBy.displayName}. If you can read this, assignment emails will work.`,
        });
        console.log(`[email] Test email sent to ${to}.`);
    } catch (err) {
        const message =
            err.code || err.response ? explainError(err) : err.message;
        console.error(`[email] Test email to ${to} failed: ${message}`);
        throw new Error(message);
    }
}

module.exports = {
    sendAssignmentEmail,
    sendTestEmail,
    describeConfig,
    explainError,
    config,
};
