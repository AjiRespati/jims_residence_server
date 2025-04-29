const { User, Salesman, SubAgent, Agent } = require('../models');
const logger = require('../config/logger');

exports.getAllUsers = async (req, res) => {
    try {
        let data = await User.findAll({
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

exports.createUser = async (req, res) => {
    try {
        const data = await User.create(req.body);
        res.status(200).json(data);
    } catch (error) {
        logger.error(error);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { level, status } = req.body;

        // 1. find user by id
        const existingUser = await User.findByPk(id);
        if (!existingUser) return res.status(404).json({ error: 'user not found' });

        const { name, image, address, phone, email } = existingUser;

        existingUser.level = (level === undefined || level === null) ? existingUser.level : level;
        existingUser.status = status || existingUser.status;
        existingUser.levelDesc = levelDescList[(level === undefined || level === null) ? existingUser.level : level];

        await existingUser.save();
        logger.info(`User updated: ${id}`);

        res.json(existingUser);
    } catch (error) {
        logger.error(error);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const data = await User.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'user not found' });

        await data.destroy();
        res.json({ message: 'user deleted successfully' });
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const levelDescList = [
    "Penjaga Kost",
    "Admin",
    "Pemilik",
];