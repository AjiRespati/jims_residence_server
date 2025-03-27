const { RoomHistory } = require('../models');
const logger = require('../config/logger');

exports.getAllRoomHistorys = async (req, res) => {
    try {
        const data = await RoomHistory.findAll();
        res.json(data);
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getRoomHistoryById = async (req, res) => {
    try {
        const data = await RoomHistory.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'roomHistory not found' });
        res.json(data);
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.createRoomHistory = async (req, res) => {
    try {
        const data = await RoomHistory.create(req.body);
        res.status(200).json(data);
    } catch (error) {
        logger.error(error);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.updateRoomHistory = async (req, res) => {
    try {
        const data = await RoomHistory.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'roomHistory not found' });

        await data.update(req.body);
        res.json(data);
    } catch (error) {
        logger.error(error);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.deleteRoomHistory = async (req, res) => {
    try {
        const data = await RoomHistory.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'roomHistory not found' });

        await data.destroy();
        res.json({ message: 'roomHistory deleted successfully' });
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};