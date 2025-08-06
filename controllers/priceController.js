const db = require("../models");
const sequelize = db.sequelize;
const Sequelize = db.Sequelize;
const { Op } = Sequelize;

const { Price, BoardingHouse, Room, Tenant, Invoice, Charge, Transaction } = require('../models');
const logger = require('../config/logger');

exports.getAllPrices = async (req, res) => {
    try {
        const prices = await Price.findAll({
            include: [
                {
                    model: BoardingHouse, // Include the associated BoardingHouse
                    attributes: ['id', 'name', 'address']
                }
            ]
        });

        if (prices.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No prices found'
            });
        }

        const formattedPrices = prices.map(price => {
            const priceData = price.toJSON();
            // flattened BoardingHouse
            priceData.boardingHouseName = priceData.BoardingHouse.name;
            delete priceData.BoardingHouse;
            return priceData;
        });

        res.json({
            success: true,
            message: 'Get Prices successfully',
            data: formattedPrices // Respond with the created room including association
        });
    } catch (error) {
        logger.error(`❌ getAllPrices error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getPriceById = async (req, res) => {
    try {
        const data = await Price.findByPk(req.params.id, {
            include: [
                {
                    model: Room, // Include the associated Room
                    attributes: ['id', 'roomNumber', 'roomSize', 'roomStatus'], // Select relevant Room attributes
                    include: [
                        {
                            model: Tenant, // Include the associated BoardingHouse nested within Room
                            include: {
                                model: Invoice, // Include ALL associated Invoices for this tenant
                                attributes: [ // Select relevant Invoice attributes
                                    'id',
                                    'periodStart',
                                    'periodEnd',
                                    'issueDate',
                                    'dueDate', // This is the Invoice's due date
                                    'totalAmountDue',
                                    'totalAmountPaid',
                                    'status',
                                    'description',
                                    'invoicePaymentProofPath',
                                    'createBy',
                                    'updateBy'
                                ],
                                required: false, // Use LEFT JOIN so tenants without invoices are also included
                                order: [['issueDate', 'DESC']], // Optional: Order invoices, e.g., by most recent first
                                separate: true,
                                include: [
                                    {
                                        model: Charge, // Include the Charges within EACH Invoice
                                        as: 'Charges', // Use the alias defined in the Invoice model association
                                        attributes: [ // Select relevant Charge attributes
                                            'id',
                                            'name',
                                            'amount',
                                            'description',
                                            'transactionType', // 'debit' or 'credit' for the line item
                                            'createBy',
                                            'updateBy'
                                        ],
                                        required: false // Use LEFT JOIN so invoices without charges (unlikely) are included
                                    },
                                    {
                                        model: Transaction, // Include the Transaction within EACH Invoice
                                        as: 'Transactions', // Use the alias defined in the Invoice model association
                                        attributes: [ // Select relevant Transaction attributes
                                            'id',
                                            'amount',
                                            'description',
                                            'transactionDate',
                                            'createBy',
                                            'updateBy'
                                        ],
                                        required: false // Use LEFT JOIN so invoices without Transaction (unlikely) are included
                                    }
                                ]
                            }
                        }
                    ],
                    required: false // Use LEFT JOIN
                },

            ]
        });

        if (!data) return res.status(404).json({ error: 'Price not found' });

        res.json({
            success: true,
            message: 'Get Price success',
            data: data
        });
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
            boardingHouseId
        } = req.body;

        // Basic validation
        if (!roomSize || !amount || !name || !boardingHouseId) {
            return res.status(400).json({
                success: false,
                message: 'Required fields (boardingHouseId, roomSize, amount, or name) are missing.'
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
    let transaction; // Declare the transaction variable outside the try block

    try {
        // Start a transaction
        transaction = await sequelize.transaction();

        const data = await Price.findByPk(req.params.id, { transaction });
        if (!data) {
            // Rollback the transaction if the price is not found
            await transaction.rollback();
            return res.status(404).json({ error: 'Price not found' });
        }

        // Pass the transaction to each database operation
        await data.update(req.body, { transaction });

        await Charge.update(
            {
                amount: req.body.amount,
                updateBy: req.user.username,
            },
            {
                where: {
                    priceId: req.params.id
                },
                transaction // Pass the transaction here
            }
        );

        await Invoice.update(
            {
                totalAmountDue: req.body.amount,
                updateBy: req.user.username,
            },
            {
                where: {
                    priceId: req.params.id
                },
                transaction // Pass the transaction here
            });

        // If all operations were successful, commit the transaction
        await transaction.commit();

        res.json({
            success: true,
            message: 'Update Price success',
            data: data
        });

    } catch (error) {
        // If an error occurred, check if the transaction exists and roll it back
        if (transaction) {
            await transaction.rollback();
        }

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