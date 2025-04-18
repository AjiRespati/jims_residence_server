const { BoardingHouse } = require('../models');
const logger = require('../config/logger');

exports.getAllBoardingHouses = async (req, res) => {
    try {
        const data = await BoardingHouse.findAll();
        res.json(data);
    } catch (error) {
        logger.error(`❌ getBoardingHouses error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getBoardingHouseById = async (req, res) => {
    try {
        const data = await BoardingHouse.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'BoardingHouse not found' });
        res.json(data);
    } catch (error) {
        logger.error(`❌ getBoardingHouseById error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.createBoardingHouse = async (req, res) => {
    try {
        const data = await BoardingHouse.create(req.body);
        res.status(200).json(data);
    } catch (error) {
        logger.error(`❌ createBoardingHouse error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: error.message });
    }
};

exports.updateBoardingHouse = async (req, res) => {
    try {
        const data = await BoardingHouse.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'BoardingHouse not found' });

        await data.update(req.body);
        res.json(data);
    } catch (error) {
        logger.error(`❌ updateBoardingHouse = async (req, res) => {
            error: ${error.message}`);
        logger.error(error.stack);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.deleteBoardingHouse = async (req, res) => {
    try {
        const data = await BoardingHouse.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'BoardingHouse not found' });

        await data.destroy();
        res.json({ message: 'BoardingHouse deleted successfully' });
    } catch (error) {
        logger.error(`❌ deleteBoardingHouse error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};