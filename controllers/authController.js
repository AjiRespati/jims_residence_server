const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require("../models");
const sequelize = db.sequelize;

const { User, Tenant, Invoice, Charge, Room } = require("../models");
const logger = require('../config/logger');

exports.register = async (req, res) => {
    try {
        const { username, password, name, email, phone, address, level, updateBy } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        const count = await User.count();

        const createLevel = count === 0 ? 2 : level

        const existingUser = await User.findOne({ where: { username } });
        if (existingUser) return res.status(400).json({ message: 'Username already exists' });

        await User.create({
            username,
            password: hashedPassword,
            name,
            email,
            phone,
            address,
            level: createLevel,
            levelDesc: levelDescList[createLevel],
            updateBy
        });

        res.status(200).json({ message: 'User registered successfully' });
    } catch (error) {
        logger.error(error.message, { stack: error.stack });
        res.status(500).json({ message: 'Error registering user', error: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ where: { username } });

        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(402).json({ message: 'Invalid credentials' });
        }

        // Generate tokens
        const accessToken = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
        const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

        // Store refresh token in DB
        user.refreshToken = refreshToken;
        await user.save();

        logger.info("✅ User " + username + " login successfully.");

        res.json({ accessToken, refreshToken });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
};


exports.refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(403).json({ message: 'Refresh token required' });

        // Find user with this refresh token
        const user = await User.findOne({ where: { refreshToken } });
        if (!user) return res.status(403).json({ message: 'Invalid refresh token' });

        // Verify token
        jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, (err, decoded) => {
            if (err) return res.status(403).json({ message: 'Token expired or invalid' });

            const newAccessToken = jwt.sign({ id: decoded.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
            res.json({ accessToken: newAccessToken });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
};


exports.logout = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ message: 'Refresh token required' });

        // Remove refresh token from DB
        const user = await User.findOne({ where: { refreshToken } });
        if (!user) return res.status(403).json({ message: 'Invalid refresh token' });

        user.refreshToken = null;
        await user.save();

        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
};


exports.self = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(403).json({ message: 'Refresh token required' });

        // Remove refresh token from DB
        const user = await User.findOne({ where: { refreshToken } });
        if (!user) return res.status(403).json({ message: 'Invalid refresh token' });

        res.json({
            id: user.id,
            username: user.username,
            name: user.name,
            image: user.image,
            address: user.address,
            phone: user.phone,
            email: user.email,
            level: user.level,
            status: user.status,
            levelDesc: user.levelDesc,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Ini Untuk Hapus DB
exports.generic = async (req, res) => {
    try {
        const { table } = req.body;
        if (!table) return res.status(403).json({ message: 'Table required' });
        console.log(table);
        switch (table) {
            case "Transaction":
                // Get the QueryInterface instance
                const queryInterface = sequelize.getQueryInterface();

                // Drop the 'Transactions' table
                // The table name is typically the pluralized model name
                console.log('Attempting to drop the "Transactions" table...');
                await queryInterface.dropTable('Transactions');
                console.log('"Transactions" table dropped successfully.');
                //    let result =  await Transaction.destroy({
                //         truncate: true
                //     });
                //     console.log(result);
                break;
            case "Tenant":
                await Tenant.destroy({
                    truncate: true
                });
                break;
            case "Invoice":
                await Invoice.destroy({
                    truncate: true
                });
                break;
            case "Charge":
                await Charge.destroy({
                    truncate: true
                });
                break;
            case "Room":
                await Room.destroy({
                    truncate: true
                });
                break;
            default:
                break;
        }

        res.json({ message: `Success remove: ${table}` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: `Failed removing: ${table}, ${error}` });
    }
};

const levelDescList = [
    "Petugas Kost",
    "Admin",
    "Pemilik",
];