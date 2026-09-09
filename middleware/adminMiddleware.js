const jwt = require('jsonwebtoken');
const db = require('../models');
const { User } = require('../models');

module.exports = async (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ message: 'Access denied' });

    try {
        const verified = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
        const user = await User.findByPk(verified.id);

        if (!user) return res.status(401).json({ message: 'User not found' });

        // level: 0 = Petugas Kost, 1 = Admin, 2 = Pemilik
        if (user.level === undefined || user.level === null || user.level < 1) {
            return res.status(403).json({ message: 'Admin access required' });
        }

        req.user = verified;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
};
