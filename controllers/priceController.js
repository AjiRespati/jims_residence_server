const { Price, Room } = require('../models');
const logger = require('../config/logger');

exports.getAllPrices = async (req, res) => {
    try {
        const data = await Price.findAll();


        if (data.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No prices found'
            });
        }

        res.json({
            success: true,
            message: 'Get Prices successfully',
            data: data // Respond with the created room including association
        });
    } catch (error) {
        logger.error(`❌ getAllPrices error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getPriceById = async (req, res) => {
    try {
        const data = await Price.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'Price not found' });
        res.json(data);
    } catch (error) {
        logger.error(`❌ getPriceById error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.createPrice = async (req, res) => {
    try {
        const {
            roomSize,
            amount,
            name,
            description
        } = req.body;

        // Basic validation
        if (!roomSize || !amount || !name) {
            return res.status(400).json({
                success: false,
                message: 'Required fields (roomSize, amount, or name) are missing.'
            });
        }

        const data = await Price.create({
            ...req.body,
            createBy: req.user.username
        });
        // Update the room status to "Terisi"
        // await Room.update({ roomStatus: 'Terisi' }, { where: { id: roomId } });

        res.status(200).json(data);
    } catch (error) {
        logger.error(`❌ createPrice error: ${error.message}`);
        logger.error(error.stack);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.updatePrice = async (req, res) => {
    try {
        const data = await Price.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'Price not found' });

        await data.update(req.body);
        res.json(data);
    } catch (error) {
        logger.error(`❌ updatePrice error: ${error.message}`);
        logger.error(error.stack);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.deletePrice = async (req, res) => {
    try {
        const data = await Price.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'Price not found' });

        await data.destroy();
        res.json({ message: 'Price deleted successfully' });
    } catch (error) {
        logger.error(`❌ deletePrice error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};