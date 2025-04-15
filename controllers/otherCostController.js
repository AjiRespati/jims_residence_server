const { OtherCost } = require('../models');
const logger = require('../config/logger');

exports.getAllOtherCosts = async (req, res) => {
    try {
        const data = await OtherCost.findAll();
        res.json(data);
    } catch (error) {
        logger.error(`❌ getAllOtherCosts error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getOtherCostById = async (req, res) => {
    try {
        const data = await OtherCost.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'otherCost not found' });
        res.json(data);
    } catch (error) {
        logger.error(`❌ getAllOtherCosts error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.createOtherCost = async (req, res) => {
    try {
        const data = await OtherCost.create(req.body);
        res.status(200).json(data);
    } catch (error) {
        logger.error(`❌ getAllOtherCosts error: ${error.message}`);
        logger.error(error.stack);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.updateOtherCost = async (req, res) => {
    try {
        const data = await OtherCost.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'otherCost not found' });

        await data.update(req.body);
        res.json(data);
    } catch (error) {
        logger.error(`❌ getAllOtherCosts error: ${error.message}`);
        logger.error(error.stack);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.deleteOtherCost = async (req, res) => {
    try {
        const data = await OtherCost.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'otherCost not found' });

        await data.destroy();
        res.json({ message: 'otherCost deleted successfully' });
    } catch (error) {
        logger.error(`❌ getAllOtherCosts error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};