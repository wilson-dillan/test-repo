const GREETING = 'Wilson Services Mass Save';

module.exports = async (req, res) => {
    res.send({
        greeting: GREETING,
    });
};
