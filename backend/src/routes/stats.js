const express = require('express');
const db = require('../db');

const router = express.Router();

const WEEKS = 12;
const TIME_ZONE = process.env.APP_TIMEZONE || 'America/New_York';

router.get('/', async (req, res) => {
    const [perUser, tasks, projects, byWeek] = await Promise.all([
        db.query(
            `SELECT u.id, u.display_name,
                    count(t.id) AS total,
                    count(t.id) FILTER (WHERE t.state = 'done') AS done
             FROM users u LEFT JOIN tasks t ON t.owner_id = u.id AND t.active
             WHERE u.active
             GROUP BY u.id ORDER BY lower(u.display_name)`,
        ),
        db.query(
            `SELECT count(*) AS total, count(*) FILTER (WHERE state = 'done') AS done
             FROM tasks WHERE active`,
        ),
        db.query(
            `SELECT count(*) AS total, count(*) FILTER (WHERE state = 'done') AS done,
                    count(*) FILTER (WHERE NOT active) AS inactive,
                    count(*) FILTER (WHERE active AND state <> 'done') AS open
             FROM projects`,
        ),
        db.query(
            `WITH weeks AS (
                 SELECT generate_series(
                     date_trunc('week', now() AT TIME ZONE $1) - ($2 - 1) * interval '1 week',
                     date_trunc('week', now() AT TIME ZONE $1),
                     interval '1 week'
                 ) AS week
             )
             SELECT to_char(w.week, 'YYYY-MM-DD') AS week, count(p.id) AS received
             FROM weeks w
             LEFT JOIN projects p ON p.state = 'done'
                 AND date_trunc('week', p.rebate_received_on::timestamp) = w.week
             GROUP BY w.week ORDER BY w.week`,
            [TIME_ZONE, WEEKS],
        ),
    ]);

    const counts = (row) => ({
        total: Number(row.total),
        done: Number(row.done),
    });
    res.send({
        tasksPerUser: perUser.rows.map((row) => ({
            id: row.id,
            name: row.display_name,
            ...counts(row),
        })),
        tasks: counts(tasks.rows[0]),
        projects: {
            ...counts(projects.rows[0]),
            open: Number(projects.rows[0].open),
            inactive: Number(projects.rows[0].inactive),
        },
        // Rebates received each week, by the date the rebate arrived.
        rebatesByWeek: byWeek.rows.map((row) => ({
            week: row.week,
            received: Number(row.received),
        })),
    });
});

const DAYS = 30;

// The signed-in person's last 30 days: tasks they completed (by uploading
// the document) and applications they marked submitted, per day.
router.get('/me', async (req, res) => {
    const { rows } = await db.query(
        `WITH days AS (
             SELECT generate_series(
                 (now() AT TIME ZONE $1)::date - ($2 - 1),
                 (now() AT TIME ZONE $1)::date,
                 interval '1 day'
             )::date AS day
         )
         SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
                count(h.id) FILTER (WHERE h.task_id IS NOT NULL) AS tasks,
                count(h.id) FILTER (WHERE h.task_id IS NULL) AS submitted
         FROM days d
         LEFT JOIN history h
             ON (h.created_at AT TIME ZONE $1)::date = d.day
             AND h.actor_id = $3
             AND h.action = 'update'
             AND h.field = 'state'
             AND h.new_value IN ('done', 'submitted')
             AND h.undone_at IS NULL
         GROUP BY d.day ORDER BY d.day`,
        [TIME_ZONE, DAYS, req.user.id],
    );
    res.send({
        days: rows.map((row) => ({
            day: row.day,
            tasksCompleted: Number(row.tasks),
            applicationsSubmitted: Number(row.submitted),
        })),
    });
});

module.exports = router;
