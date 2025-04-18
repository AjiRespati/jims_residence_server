const { RoomPrice } = require('../models');
const logger = require('../config/logger');

exports.getAllRoomPrices = async (req, res) => {
    try {
        const data = await RoomPrice.findAll();
        res.json(data);
    } catch (error) {
        logger.error(`❌ getAllRoomPrices error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getRoomPriceById = async (req, res) => {
    try {
        const data = await RoomPrice.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'RoomPrice not found' });
        res.json(data);
    } catch (error) {
        logger.error(`❌ getRoomPriceById error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.createRoomPrice = async (req, res) => {
    try {
        const data = await RoomPrice.create(req.body);
        res.status(200).json(data);
    } catch (error) {
        logger.error(`❌ createRoomPrice error: ${error.message}`);
        logger.error(error.stack);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.updateRoomPrice = async (req, res) => {
    try {
        const data = await RoomPrice.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'RoomPrice not found' });

        await data.update(req.body);
        res.json(data);
    } catch (error) {
        logger.error(`❌ updateRoomPrice error: ${error.message}`);
        logger.error(error.stack);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.deleteRoomPrice = async (req, res) => {
    try {
        const data = await RoomPrice.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'RoomPrice not found' });

        await data.destroy();
        res.json({ message: 'RoomPrice deleted successfully' });
    } catch (error) {
        logger.error(`❌ deleteRoomPrice error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};