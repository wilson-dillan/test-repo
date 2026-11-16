const { config, explainError } = require('../src/mailer');

test('is off with no settings', () => {
    expect(config({}).problem).toMatch(/not set/);
});

test('uses Gmail with a user and app password, ignoring spaces', () => {
    const c = config({
        SMTP_USER: 'dillan@wilsonph.com',
        SMTP_PASSWORD: 'abcd efgh ijkl mnop',
    });
    expect(c).toMatchObject({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: 'dillan@wilsonph.com', pass: 'abcdefghijklmnop' },
        from: 'dillan@wilsonph.com',
        problem: null,
    });
});

test('flags a missing password', () => {
    expect(config({ SMTP_USER: 'dillan@wilsonph.com' }).problem).toMatch(
        /SMTP_PASSWORD/,
    );
});

test('works with a login-free local server', () => {
    const c = config({ SMTP_HOST: 'mailpit', SMTP_PORT: '1025' });
    expect(c).toMatchObject({ host: 'mailpit', secure: false, problem: null });
    expect(c.auth).toBeUndefined();
});

test('strips quotes around MAIL_FROM', () => {
    expect(
        config({ SMTP_HOST: 'x', MAIL_FROM: '"Wilson <d@wilsonph.com>"' }).from,
    ).toBe('Wilson <d@wilsonph.com>');
});

test('explains common failures', () => {
    expect(explainError({ code: 'EAUTH' })).toMatch(/App Password/);
    expect(explainError({ code: 'ETIMEDOUT' })).toMatch(/blocking/);
    expect(
        explainError({
            response: '535-5.7.8 Username and Password not accepted',
        }),
    ).toMatch(/rejected the login/);
});
