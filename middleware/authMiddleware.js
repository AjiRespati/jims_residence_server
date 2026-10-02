const jwt = require('jsonwebtoken');
const { User, BoardingHouse } = require('../models');

module.exports = async (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ message: 'Access denied' });

    try {
        const verified = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);

        const user = await User.findByPk(verified.id);
        if (!user) return res.status(401).json({ message: 'User not found' });
        if (user.status !== 'active') {
            return res.status(403).json({ message: 'Account is not active' });
        }

        req.user = user;           // DB user record (has username/name/level/ownerId)
        req.userRecord = user;
        req.role = user.level;     // 0 = Penjaga Kost, 1 = Pemilik, 2 = Admin

        // Resolve which boarding houses this user may access.
        // null => all (Admin); array => restricted ids.
        if (user.level >= 2) {
            req.accessibleBoardingHouseIds = null;
        } else {
            const ownerId = user.level === 1 ? user.id : user.ownerId;
            const houses = await BoardingHouse.findAll({
                where: { ownerId },
                attributes: ['id']
            });
            req.accessibleBoardingHouseIds = houses.map(h => h.id);
        }

        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
};
