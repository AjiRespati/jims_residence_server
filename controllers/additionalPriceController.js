const { AdditionalPrice } = require('../models');
const logger = require('../config/logger');

exports.getAllAdditionalPrices = async (req, res) => {
    try {
        const data = await AdditionalPrice.findAll();
        res.json(data);
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getAdditionalPriceById = async (req, res) => {
    try {
        const data = await AdditionalPrice.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'additionalPrice not found' });
        res.json(data);
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.createAdditionalPrice = async (req, res) => {
    try {
        const data = await AdditionalPrice.create(req.body);
        res.status(201).json(data);
    } catch (error) {
        logger.error(error);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.updateAdditionalPrice = async (req, res) => {
    try {
        const data = await AdditionalPrice.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'additionalPrice not found' });

        await data.update(req.body);
        res.json(data);
    } catch (error) {
        logger.error(error);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.deleteAdditionalPrice = async (req, res) => {
    try {
        const data = await AdditionalPrice.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'additionalPrice not found' });

        await data.destroy();
        res.json({ message: 'additionalPrice deleted successfully' });
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};