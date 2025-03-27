const { Room, AdditionalPrice, OtherCost, Tenant, } = require('../models');
const logger = require('../config/logger');

exports.getAllRooms = async (req, res) => {
    try {
        const rooms = await Room.findAll({
            include: [
                { model: AdditionalPrice, as: 'AdditionalPrices' },
                { model: OtherCost, as: 'OtherCosts' },
                {
                    model: Tenant,
                    as: 'Tenants',
                    order: [['createdAt', 'DESC']],
                    limit: 1
                }
            ],
            order: [['createdAt', 'ASC']] // Oldest room first
        });

        const roomsWithTotalPrice = rooms.map(room => {
            const additionalPriceTotal = room.AdditionalPrices.reduce((sum, ap) => sum + ap.amount, 0);
            const otherCostTotal = room.OtherCosts.reduce((sum, oc) => sum + oc.amount, 0);
            const totalPrice = room.basicPrice + additionalPriceTotal + otherCostTotal;
            const latestTenant = room.Tenants.length > 0 ? room.Tenants[0] : null;

            let response = {
                ...room.get({ plain: true }),
                totalPrice,
                latestTenant,
            }

            const { Tenants, ...newResponse } = response

            return { ...newResponse };
        });

        res.json(roomsWithTotalPrice);
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getRoomById = async (req, res) => {
    try {
        const { id } = req.params;

        // Find room with related AdditionalPrice, OtherCost, and latest Tenant
        const room = await Room.findByPk(id, {
            include: [
                {
                    model: AdditionalPrice,
                    as: 'AdditionalPrices',
                },
                {
                    model: OtherCost,
                    as: 'OtherCosts',
                },
                {
                    model: Tenant,
                    as: 'Tenants',
                    order: [['createdAt', 'DESC']],
                    limit: 1,
                }
            ]
        });

        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        // Calculate total price
        const basicPrice = room.basicPrice || 0;
        const additionalPriceTotal = room.AdditionalPrices.reduce((sum, item) => sum + item.amount, 0);
        const otherCostTotal = room.OtherCosts.reduce((sum, item) => sum + item.amount, 0);
        const totalPrice = basicPrice + additionalPriceTotal + otherCostTotal;

        // Get the latest tenant if available
        const latestTenant = room.Tenants.length > 0 ? room.Tenants[0] : null;

        let response = {
            ...room.get({ plain: true }),
            totalPrice,
            latestTenant,
        }

        const { Tenants, ...newResponse } = response

        res.json(newResponse);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.createRoom = async (req, res) => {
    try {
        const data = await Room.create(req.body);
        res.status(200).json(data);
    } catch (error) {
        logger.error(error);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.updateRoom = async (req, res) => {
    try {
        const data = await Room.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'room not found' });

        await data.update(req.body);

        // Find room with related AdditionalPrice, OtherCost, and latest Tenant
        const room = await Room.findByPk(req.params.id, {
            include: [
                {
                    model: AdditionalPrice,
                    as: 'AdditionalPrices',
                },
                {
                    model: OtherCost,
                    as: 'OtherCosts',
                },
                {
                    model: Tenant,
                    as: 'Tenants',
                    order: [['createdAt', 'DESC']],
                    limit: 1,
                }
            ]
        });

        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        // Calculate total price
        const basicPrice = room.basicPrice || 0;
        const additionalPriceTotal = room.AdditionalPrices.reduce((sum, item) => sum + item.amount, 0);
        const otherCostTotal = room.OtherCosts.reduce((sum, item) => sum + item.amount, 0);
        const totalPrice = basicPrice + additionalPriceTotal + otherCostTotal;

        // Get the latest tenant if available
        const latestTenant = room.Tenants.length > 0 ? room.Tenants[0] : null;

        res.json({
            ...room.get({ plain: true }),
            totalPrice,
            latestTenant,
        });

    } catch (error) {
        logger.error(error);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.deleteRoom = async (req, res) => {
    try {
        const data = await Room.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'room not found' });

        await data.destroy();
        res.json({ message: 'room deleted successfully' });
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};