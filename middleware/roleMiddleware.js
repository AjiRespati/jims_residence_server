// Minimum role level guard. Roles: 0 = Penjaga Kost, 1 = Pemilik, 2 = Admin.
const requireLevel = (minLevel) => (req, res, next) => {
    const level = req.userRecord ? req.userRecord.level : null;
    if (level === null || level === undefined || level < minLevel) {
        return res.status(403).json({ message: 'Forbidden' });
    }
    next();
};

module.exports = { requireLevel };
