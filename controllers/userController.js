const bcrypt = require('bcryptjs');
const { User } = require('../models');
const logger = require('../config/logger');

exports.getAllUsers = async (req, res) => {
    try {
        const caller = req.userRecord;
        let where = {};
        if (caller.level === 1) {
            // Pemilik sees only their own staff (Penjaga).
            where = { ownerId: caller.id };
        } else if (caller.level === 0) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        // Admin (2) sees everyone.

        const data = await User.findAll({
            where,
            order: [["createdAt", "DESC"]]
        });

        data.forEach(el => {
            el['password'] = undefined;
        });

        res.json(data);
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getUserById = async (req, res) => {
    try {
        const data = await User.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'user not found' });
        res.json(data);
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { level, status, ownerId, password } = req.body;
        const caller = req.userRecord;

        const existingUser = await User.findByPk(id);
        if (!existingUser) return res.status(404).json({ error: 'user not found' });

        // Pemilik (1) can only touch their own Penjaga (level 0).
        if (caller.level === 1) {
            if (existingUser.ownerId !== caller.id || existingUser.level !== 0) {
                return res.status(403).json({ message: 'Forbidden' });
            }
            if (level !== undefined && level !== null && level !== 0) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }

        if (level !== undefined && level !== null) {
            existingUser.level = level;
            existingUser.levelDesc = levelDescList[level];
        }
        if (status !== undefined && status !== null) {
            existingUser.status = status;
        }
        if (ownerId !== undefined) {
            if (caller.level !== 2) return res.status(403).json({ message: 'Forbidden' });
            existingUser.ownerId = ownerId;
        }
        if (password) {
            existingUser.password = await bcrypt.hash(password, 10);
        }

        await existingUser.save();
        existingUser.password = undefined;
        logger.info(`User updated: ${id}`);

        res.json(existingUser);
    } catch (error) {
        logger.error(error);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const caller = req.userRecord;
        const data = await User.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'user not found' });

        if (caller.level === 1) {
            if (data.ownerId !== caller.id || data.level !== 0) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }

        await data.destroy();
        res.json({ message: 'user deleted successfully' });
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const levelDescList = [
    "Penjaga Kost",
    "Pemilik",
    "Admin",
];
