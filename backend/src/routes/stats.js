const express = require('express');
const db = require('../db');

const router = express.Router();

const WEEKS = 12;
const TIME_ZONE = process.env.APP_TIMEZONE || 'UTC';

router.get('/', async (req, res) => {
    const [perUser, tasks, projects, byWeek] = await Promise.all([
        db.query(
            `SELECT u.id, u.display_name,
                    count(t.id) AS total,
                    count(t.id) FILTER (WHERE t.state = 'done') AS done
             FROM users u LEFT JOIN tasks t ON t.owner_id = u.id
             WHERE u.active
             GROUP BY u.id ORDER BY lower(u.display_name)`,
        ),
        db.query(
            `SELECT count(*) AS total, count(*) FILTER (WHERE state = 'done') AS done
             FROM tasks`,
        ),
        db.query(
            `SELECT count(*) AS total, count(*) FILTER (WHERE state = 'done') AS done,
                    count(*) FILTER (WHERE NOT active) AS inactive,
                    count(*) FILTER (WHERE active AND state = 'todo') AS open
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
             SELECT to_char(w.week, 'YYYY-MM-DD') AS week, count(p.id) AS completed
             FROM weeks w
             LEFT JOIN projects p ON p.state = 'done'
                 AND date_trunc('week', p.completed_at AT TIME ZONE $1) = w.week
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
        projectsCompletedByWeek: byWeek.rows.map((row) => ({
            week: row.week,
            completed: Number(row.completed),
        })),
    });
});

module.exports = router;
