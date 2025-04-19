const db = require("../models");
const sequelize = db.sequelize;
// const Sequelize = db.Sequelize;

const { Tenant, Room, Price, Payment, BoardingHouse, RoomPrice } = require('../models');
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
    // Start a transaction
    const t = await sequelize.transaction();

    try {
        const {
            roomId,
            name,
            phone,
            NIKNumber,
            startDate,
            dueDate,
            NIKImagePath,
            isNIKCopyDone,
            tenancyStatus,
            paymentDate,
            paymentStatus
        } = req.body;

        // Basic validation
        if (!roomId || !name || !phone || !NIKNumber || !startDate || !dueDate) {
            await t.rollback(); // Rollback transaction before sending error
            return res.status(400).json({ message: 'Required fields are missing: roomId, name, phone, NIKNumber, startDate, dueDate' });
        }

        // 1. Fetch the Room and its associated Price within the transaction
        const roomWithPrice = await Room.findByPk(roomId, {
            include: {
                model: Price,
                attributes: ['id', 'name', 'amount', 'roomSize'], // Include necessary price attributes
                where: { status: 'active' }, // Only consider active prices
                required: true // This makes it an INNER JOIN, ensuring we only proceed if an active price exists
            },
            transaction: t // Include the transaction
        });

        if (!roomWithPrice || !roomWithPrice.Price) {
            await t.rollback(); // Rollback transaction
            return res.status(404).json({ message: 'Room not found or does not have an active price associated.' });
        }

        const priceDetails = roomWithPrice.Price;

        // 2. Create the Tenant record
        const newTenant = await Tenant.create({
            roomId,
            name,
            phone,
            NIKNumber,
            startDate,
            dueDate,
            NIKImagePath,
            isNIKCopyDone,
            tenancyStatus: tenancyStatus || 'Active', // Use provided status or default
            // paymentDate,
            // paymentStatus,
            createBy: req.user.username
        }, { transaction: t }); // Include the transaction

        // 3. Create the initial Payment record for the tenant's rent
        const initialPayment = await Payment.create({
            tenantId: newTenant.id, // Link to the new tenant
            totalAmount: priceDetails.amount, // Use the amount from the fetched price
            transactionType: 'debit', // Represents the amount owed by the tenant
            paymentDate,
            paymentStatus,
            description: `Initial rent payment for room ${roomWithPrice.roomNumber}`, // Example description
            createBy: req.user.username
        }, { transaction: t }); // Include the transaction

        // 4. Create the RoomPrice record linked to the Payment
        // const roomPriceEntry = await RoomPrice.create({
        await RoomPrice.create({
            paymentId: initialPayment.id, // Link to the new payment
            amount: priceDetails.amount, // Use the amount from the fetched price
            name: priceDetails.name || `Room Price (${priceDetails.roomSize})`, // Use price name or generate one
            description: `Room price details for ${priceDetails.roomSize} room`, // Example description
            createBy: req.user.username,
            status: 'active', // Assuming this entry is active
        }, { transaction: t }); // Include the transaction

        // If all operations were successful, commit the transaction
        await t.commit();

        // Fetch the newly created Tenant with its associations for the response
        const tenantWithDetails = await Tenant.findByPk(newTenant.id, {
            include: [
                {
                    model: Room,
                    attributes: ['id', 'roomNumber', 'roomStatus'],
                    include: {
                        model: BoardingHouse,
                        attributes: ['id', 'name']
                    }
                },
                {
                    model: Payment,
                    include: [
                        {
                            model: RoomPrice,
                            attributes: ['id', 'name', 'amount']
                        }
                        // You might include AdditionalPrice and OtherCost here if needed
                    ]
                }
            ]
        });
        res.status(200).json(tenantWithDetails); // Return the created tenant with details

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