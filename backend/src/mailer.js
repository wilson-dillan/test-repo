const nodemailer = require('nodemailer');
const db = require('./db');

const {
    SMTP_HOST = 'smtp.gmail.com',
    SMTP_PORT = '465',
    SMTP_USER,
    SMTP_PASSWORD,
    MAIL_FROM,
    APP_URL = 'http://localhost',
} = process.env;

let transport;

function getTransport() {
    if (!SMTP_USER || !SMTP_PASSWORD) return null;
    if (!transport) {
        transport = nodemailer.createTransport({
            host: SMTP_HOST,
            port: Number(SMTP_PORT),
            secure: Number(SMTP_PORT) === 465,
            auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
        });
    }
    return transport;
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

// Tells a user about tasks newly assigned to them. Never throws: a mail
// problem must not fail the change that triggered it.
async function sendAssignmentEmail(userId, tasks, assignedBy) {
    if (!tasks.length || userId === assignedBy.id) return;
    try {
        const { rows } = await db.query(
            'SELECT id, display_name, email FROM users WHERE id = $1',
            [userId],
        );
        if (rows[0]?.email) await send(rows[0], tasks, assignedBy);
    } catch (err) {
        console.error(`Failed to send assignment email:`, err.message);
    }
}

async function send(user, tasks, assignedBy) {
    const lines = tasks.map((t) => ({
        label: `${t.code} · ${t.name} (${t.customerName})`,
        url: `${APP_URL.replace(/\/$/, '')}/tasks/${t.id}`,
    }));
    const subject =
        tasks.length === 1
            ? `New task: ${lines[0].label}`
            : `${tasks.length} new tasks assigned to you`;

    const mail = {
        from: MAIL_FROM || SMTP_USER,
        to: user.email,
        subject,
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

    const transporter = getTransport();
    if (!transporter) {
        console.log(
            `[email not configured] Would send "${subject}" to ${user.email}`,
        );
        return;
    }
    await transporter.sendMail(mail);
}

module.exports = { sendAssignmentEmail };
