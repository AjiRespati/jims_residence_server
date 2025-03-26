const { Transaction } = require('../models');
const logger = require('../config/logger');

exports.getAllTransactions = async (req, res) => {
    try {
        const data = await Transaction.findAll();
        res.json(data);
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getTransactionById = async (req, res) => {
    try {
        const data = await Transaction.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'transaction not found' });
        res.json(data);
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.createTransaction = async (req, res) => {
    try {
        const data = await Transaction.create(req.body);
        res.status(201).json(data);
    } catch (error) {
        logger.error(error);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.updateTransaction = async (req, res) => {
    try {
        const data = await Transaction.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'transaction not found' });

        await data.update(req.body);
        res.json(data);
    } catch (error) {
        logger.error(error);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.deleteTransaction = async (req, res) => {
    try {
        const data = await Transaction.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'transaction not found' });

        await data.destroy();
        res.json({ message: 'transaction deleted successfully' });
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};