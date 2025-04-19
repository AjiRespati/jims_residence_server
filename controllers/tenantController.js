const { Tenant, Room } = require('../models');
const logger = require('../config/logger');

exports.getAllTenants = async (req, res) => {
    try {
        const data = await Tenant.findAll();
        res.json(data);
    } catch (error) {
        logger.error(`❌ getAllTenants error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getTenantById = async (req, res) => {
    try {
        const data = await Tenant.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'tenant not found' });
        res.json(data);
    } catch (error) {
        logger.error(`❌ getTenantById error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.createTenant = async (req, res) => {
    try {
        const { roomId } = req.body;

        const data = await Tenant.create(req.body);
        // Update the room status to "Terisi"
        await Room.update({ roomStatus: 'Terisi' }, { where: { id: roomId } });

        res.status(200).json(data);
    } catch (error) {
        logger.error(`❌ createTenant error: ${error.message}`);
        logger.error(error.stack);
        // Handle Sequelize validation errors specifically
        if (error.name === 'SequelizeValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Validation error creating room',
                error: error.errors.map(err => err.message)
            });
        }
        res.status(500).json({
            success: false,
            message: 'Error creating room',
            error: error.message
        });
    }
};

exports.updateTenant = async (req, res) => {
    try {
        const data = await Tenant.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'tenant not found' });

        await data.update(req.body);
        res.json(data);
    } catch (error) {
        logger.error(`❌ updateTenant error: ${error.message}`);
        logger.error(error.stack);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.deleteTenant = async (req, res) => {
    try {
        const data = await Tenant.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'tenant not found' });

        await data.destroy();
        res.json({ message: 'tenant deleted successfully' });
    } catch (error) {
        logger.error(`❌ deleteTenant error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};