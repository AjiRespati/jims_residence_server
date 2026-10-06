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
        const {
            level, status, ownerId, password,
            name, phone, address, NIKNumber,
            bankName, bankAccountName, bankAccountNumber,
        } = req.body;
        const caller = req.userRecord;

        const existingUser = await User.findByPk(id);
        if (!existingUser) return res.status(404).json({ error: 'user not found' });

        // Pemilik (1) can only touch their own Penjaga (level 0).
        if (caller.level === 1) {
            if (existingUser.ownerId !== caller.id || existingUser.level !== 0) {
                return res.status(403).json({ message: 'Forbidden' });
            }
            if (level !== undefined && level !== null && level !== '' && Number(level) !== 0) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }

        if (level !== undefined && level !== null && level !== '') {
            existingUser.level = Number(level);
            existingUser.levelDesc = levelDescList[Number(level)];
        }
        if (status !== undefined && status !== null && status !== '') {
            existingUser.status = status;
        }
        if (ownerId !== undefined) {
            if (caller.level !== 2) return res.status(403).json({ message: 'Forbidden' });
            existingUser.ownerId = ownerId || null;
        }
        if (password) {
            existingUser.password = await bcrypt.hash(password, 10);
        }

        // Owner profile fields (Admin editing a Pemilik, etc.)
        if (name !== undefined) existingUser.name = name;
        if (phone !== undefined) existingUser.phone = phone === '' ? null : phone;
        if (address !== undefined) existingUser.address = address;
        if (NIKNumber !== undefined) existingUser.NIKNumber = NIKNumber;
        if (bankName !== undefined) existingUser.bankName = bankName;
        if (bankAccountName !== undefined) existingUser.bankAccountName = bankAccountName;
        if (bankAccountNumber !== undefined) existingUser.bankAccountNumber = bankAccountNumber;
        if (req.imagePath) existingUser.signatureImagePath = req.imagePath;

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
