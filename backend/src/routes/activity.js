const express = require('express');
const db = require('../db');
const { requireSuper } = require('../auth');
const { listHistory, undo } = require('../history');

const router = express.Router();

router.get('/', async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    res.send(await listHistory('true', [], limit));
});

router.post('/:id/undo', requireSuper, async (req, res) => {
    const result = await db.transaction((client) =>
        undo(client, Number(req.params.id), req.user),
    );
    res.send(result);
});

module.exports = router;
