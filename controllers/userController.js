const { User } = require('../models');
const logger = require('../config/logger');

exports.getAllUsers = async (req, res) => {
    try {
        const data = await User.findAll();
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
        const data = await User.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'user not found' });

        await data.update(req.body);
        res.json(data);
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