const express = require('express');
const housecall = require('../housecall');

const router = express.Router();

// Whether the search box should appear, and (when asked) whether the key
// actually works.
router.get('/status', async (req, res) => {
    if (req.query.check) return res.send(await housecall.checkConnection());
    res.send({ connected: housecall.isConfigured() });
});

router.get('/customers', async (req, res) => {
    res.send(await housecall.searchCustomers(req.query.q));
});

module.exports = router;
