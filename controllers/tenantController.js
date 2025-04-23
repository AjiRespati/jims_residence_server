const db = require("../models");
const sequelize = db.sequelize;
// const Sequelize = db.Sequelize;

const { Tenant, Room, Price, AdditionalPrice, OtherCost, Payment, BoardingHouse } = require('../models');
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
            banishDate, // Optional
            NIKImagePath, // Optional
            isNIKCopyDone, // Optional, defaults in model
            tenancyStatus, // Optional, defaults in model
            roomStatus, // Optional, defaults in model
            // paymentDate and paymentStatus are now on the Payment model
        } = req.body;

        // Basic validation for mandatory tenant fields
        if (!roomId || !name || !phone || !NIKNumber) {
            await t.rollback(); // Rollback transaction before sending error
            return res.status(400).json({ message: 'Required tenant fields are missing: roomId, name, phone, NIKNumber' });
        }

        // 1. Fetch the Room and its associated ACTIVE Price, AdditionalPrices, and OtherCosts within the transaction
        // We need more attributes now for the individual payment descriptions
        const roomWithCosts = await Room.findByPk(roomId, {
            include: [
                {
                    model: Price,
                    attributes: ['id', 'name', 'amount', 'roomSize', 'description'], // Get attributes for description
                    where: { status: 'active' },
                    required: true, // Require an active price
                },
                {
                    model: AdditionalPrice,
                    attributes: ['id', 'name', 'amount', 'description'], // Get attributes for description
                    where: { status: 'active' },
                    required: false,
                },
                {
                    model: OtherCost,
                    attributes: ['id', 'name', 'amount', 'description'], // Get attributes for description
                    where: { status: 'active' },
                    required: false,
                }
            ],
            transaction: t // Include the transaction
        });

        // Validate if room was found and has an active price
        if (!roomWithCosts || !roomWithCosts.Price) {
            await t.rollback(); // Rollback transaction
            return res.status(404).json({ message: 'Room not found or does not have an active price associated.' });
        }

        // 2. Create the Tenant record
        const newTenant = await Tenant.create({
            roomId,
            name,
            phone,
            NIKNumber,
            startDate,
            dueDate,
            banishDate,
            NIKImagePath,
            isNIKCopyDone,
            tenancyStatus: tenancyStatus || 'Active',
            createBy: req.user.username,
            updateBy: req.user.username,
        }, { transaction: t }); // Include the transaction

        // 3. Prepare and create individual Payment records for each active cost component

        const paymentsToCreate = [];

        // Payment for the main Room Price
        if (roomWithCosts.Price) {
            paymentsToCreate.push({
                tenantId: newTenant.id,
                totalAmount: roomWithCosts.Price.amount, // Amount of this specific cost
                transactionType: 'debit',
                description: `${roomWithCosts.Price.name || 'Room Price'} (${roomWithCosts.Price.roomSize})`, // Detailed description
                createBy: req.user.username,
                updateBy: req.user.username,
                timelimit: dueDate, // Due date for this payment
                paymentDate: null,
                paymentStatus: 'unpaid',
            });
        }

        // Payments for Additional Prices
        if (roomWithCosts.AdditionalPrices && roomWithCosts.AdditionalPrices.length > 0) {
            roomWithCosts.AdditionalPrices.forEach(ap => {
                paymentsToCreate.push({
                    tenantId: newTenant.id,
                    totalAmount: ap.amount, // Amount of this specific cost
                    transactionType: 'debit',
                    description: `${ap.name || 'Additional Cost'}: ${ap.description || ''}`, // Detailed description
                    createBy: req.user.username,
                    updateBy: req.user.username,
                    timelimit: dueDate, // Due date for this payment (can be adjusted per cost type if needed)
                    paymentDate: null,
                    paymentStatus: 'unpaid',
                });
            });
        }

        // Payments for Other Costs
        if (roomWithCosts.OtherCosts && roomWithCosts.OtherCosts.length > 0) {
            roomWithCosts.OtherCosts.forEach(oc => {
                paymentsToCreate.push({
                    tenantId: newTenant.id,
                    totalAmount: oc.amount, // Amount of this specific cost
                    transactionType: 'debit',
                    description: `${oc.name || 'Other Cost'}: ${oc.description || ''}`, // Detailed description
                    createBy: req.user.username,
                    updateBy: req.user.username,
                    timelimit: dueDate, // Due date for this payment (can be adjusted per cost type if needed)
                    paymentDate: null,
                    paymentStatus: 'unpaid',
                });
            });
        }

        // Create all prepared payment records in bulk
        await Payment.bulkCreate(paymentsToCreate, { transaction: t });

        // 4. Update room status

        await roomWithCosts.update(
            {
                updateBy: req.user.username,
                roomStatus: roomStatus || 'Terisi'
            },
            { transaction: t }
        );

        // If all operations were successful, commit the transaction
        await t.commit();

        // Fetch the newly created Tenant with its associated Payments for the response
        // We will include all the payments created in this transaction
        const tenantWithDetails = await Tenant.findByPk(newTenant.id, {
            include: [
                {
                    model: Room,
                    attributes: ['id', 'roomNumber', 'roomStatus'],
                    include: { // Include BoardingHouse within Room for context
                        model: BoardingHouse,
                        attributes: ['id', 'name']
                    }
                },
                {
                    model: Payment, // Include all associated Payments for this tenant
                    attributes: ['id', 'totalAmount', 'transactionType', 'timelimit', 'paymentDate', 'paymentStatus', 'description', 'createBy', 'updateBy']
                    // Optional: Filter payments created within a certain time frame if needed, but linking to new tenant ID is enough here
                    // where: { createdAt: { [db.Sequelize.Op.gte]: t.finished } } // Example to filter payments created since transaction start
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