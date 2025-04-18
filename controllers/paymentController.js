const { Payment } = require('../models');
const logger = require('../config/logger');

exports.getAllPayments = async (req, res) => {
    try {
        const data = await Payment.findAll();
        res.json(data);
    } catch (error) {
        logger.error(`❌ getAllPayments error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getPaymentById = async (req, res) => {
    try {
        const data = await Payment.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'Payment not found' });
        res.json(data);
    } catch (error) {
        logger.error(`❌ getPaymentById error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.createPayment = async (req, res) => {
    try {
        const data = await Payment.create(req.body);
        res.status(200).json(data);
    } catch (error) {
        logger.error(`❌ createPayment error: ${error.message}`);
        logger.error(error.stack);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.updatePayment = async (req, res) => {
    try {
        const data = await Payment.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'Payment not found' });

        await data.update(req.body);
        res.json(data);
    } catch (error) {
        logger.error(`❌ updatePayment error: ${error.message}`);
        logger.error(error.stack);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.deletePayment = async (req, res) => {
    try {
        const data = await Payment.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'Payment not found' });

        await data.destroy();
        res.json({ message: 'Payment deleted successfully' });
    } catch (error) {
        logger.error(`❌ deletePayment error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};