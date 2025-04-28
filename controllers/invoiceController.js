const db = require("../models");
const sequelize = db.sequelize;
const Sequelize = db.Sequelize;
const { Op } = Sequelize;

const { Invoice, Charge, Transaction, Tenant, Room, BoardingHouse } = require('../models');
const logger = require('../config/logger');
const path = require("path");
const fs = require("fs");


// Method for creating a new invoice (general purpose, allows null tenant/room)
exports.createInvoice = async (req, res) => {
    const t = await sequelize.transaction(); // Start a transaction

    try {
        const {
            tenantId, // Optional for non-tenant invoices
            roomId,   // Optional for non-room specific expenses
            periodStart,
            periodEnd,
            issueDate,
            dueDate,
            description, // Optional description for the invoice header
            charges // Array of charge line item data
        } = req.body;

        // Basic validation for mandatory invoice header fields (excluding tenant/room)
        if (!periodStart || !periodEnd || !issueDate || !dueDate || !charges || !Array.isArray(charges) || charges.length === 0) {
            await t.rollback();
            return res.status(400).json({ message: 'Required invoice fields are missing or charges array is empty' });
        }

        // Optional: Validate tenantId and roomId if they are provided
        if (tenantId) {
            const tenant = await db.Tenant.findByPk(tenantId, { transaction: t });
            if (!tenant) {
                await t.rollback();
                return res.status(404).json({ message: 'Provided Tenant not found' });
            }
        }
        if (roomId) {
            const room = await db.Room.findByPk(roomId, { transaction: t });
            if (!room) {
                await t.rollback();
                return res.status(404).json({ message: 'Provided Room not found' });
            }
        }


        // 1. Create the Invoice header record
        const newInvoice = await db.Invoice.create({
            tenantId: tenantId || null, // Use provided ID or null
            roomId: roomId || null,     // Use provided ID or null
            periodStart: new Date(periodStart),
            periodEnd: new Date(periodEnd),
            issueDate: new Date(issueDate),
            dueDate: new Date(dueDate),
            totalAmountDue: 0, // Will calculate and update later
            totalAmountPaid: 0, // Initially no amount paid
            status: 'Issued', // Default status for a newly created invoice
            description: description, // Optional description for the header
            createBy: req.user.username,
            updateBy: req.user.username,
        }, { transaction: t }); // Include the transaction


        // 2. Prepare and create Charge records linked to the new Invoice
        const chargesToCreate = [];
        let calculatedTotalAmountDue = 0;

        for (const chargeData of charges) {
            // Basic validation for each charge item
            if (!chargeData.name || chargeData.amount === undefined || chargeData.amount === null) {
                await t.rollback();
                return res.status(400).json({ message: 'Each charge item must have a name and amount' });
            }

            const charge = {
                invoiceId: newInvoice.id, // Link to the new Invoice
                name: chargeData.name,
                amount: chargeData.amount,
                description: chargeData.description || null,
                transactionType: chargeData.transactionType || 'debit', // Default to debit if not provided
                createBy: req.user.username, // Use charge-specific creator or invoice creator
                updateBy: req.user.username,
            };
            chargesToCreate.push(charge);
            calculatedTotalAmountDue += charge.amount;
        }

        // Create all prepared Charge records in bulk
        if (chargesToCreate.length > 0) {
            await db.Charge.bulkCreate(chargesToCreate, { transaction: t });
        }


        // 3. Update the totalAmountDue on the Invoice record
        await newInvoice.update({ totalAmountDue: calculatedTotalAmountDue }, { transaction: t });


        // If all operations were successful, commit the transaction
        await t.commit();

        // 4. Fetch the newly created Invoice with its Charges for the response
        const invoiceWithDetails = await db.Invoice.findByPk(newInvoice.id, {
            attributes: [
                'id', 'tenantId', 'roomId', 'periodStart', 'periodEnd', 'issueDate', 'dueDate',
                'totalAmountDue', 'totalAmountPaid', 'status', 'description', 'createBy', 'updateBy', 'createdAt', 'updatedAt'
            ],
            include: [
                {
                    model: Charge,
                    as: 'Charges',
                    attributes: ['id', 'name', 'amount', 'description', 'transactionType', 'createBy', 'updateBy'],
                }
                // Include Tenant and Room if tenantId/roomId were provided and you want them in the response
                // { model: Tenant, attributes: ['id', 'name'], required: false },
                // { model: Room, attributes: ['id', 'roomNumber'], required: false },
            ]
        });


        res.status(200).json({
            success: true,
            message: 'Invoice created successfully',
            data: invoiceWithDetails // Return the created invoice with details
        });

    } catch (error) {
        // If any error occurs, rollback the transaction
        await t.rollback();
        logger.error(`❌ createInvoice error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};

// Method to get all invoices
exports.getAllInvoices = async (req, res) => {
    try {
        // Extract filter parameters from query string
        const { boardingHouseId, dateFrom, dateTo } = req.query;

        // Prepare the where clause for the main Invoice query
        const invoiceWhere = {};
        let isDateFilterApplied = false;

        // Add date filter if dateFrom and dateTo are provided and valid
        if (dateFrom && dateTo) {
            const fromDate = new Date(dateFrom);
            const toDate = new Date(dateTo);

            if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime())) {
                // Adjust toDate to include the entire end day
                toDate.setHours(23, 59, 59, 999);

                invoiceWhere.issueDate = { // 🔥 Filtering by Invoice's issueDate
                    [Op.between]: [fromDate, toDate]
                };
                isDateFilterApplied = true;
            } else {
                // Handle invalid date formats
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date format for dateFrom or dateTo. Use YYYY-MM-DD.',
                    data: null
                });
            }
        } else if (dateFrom) {
            // Handle only dateFrom provided
            const fromDate = new Date(dateFrom);
            if (!isNaN(fromDate.getTime())) {
                invoiceWhere.issueDate = { // 🔥 Filtering by Invoice's issueDate
                    [Op.gte]: fromDate
                };
                isDateFilterApplied = true;
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date format for dateFrom. Use YYYY-MM-DD.',
                    data: null
                });
            }
        } else if (dateTo) {
            // Handle only dateTo provided
            const toDate = new Date(dateTo);
            if (!isNaN(toDate.getTime())) {
                toDate.setHours(23, 59, 59, 999); // Include the entire end day
                invoiceWhere.issueDate = { // 🔥 Filtering by Invoice's issueDate
                    [Op.lte]: toDate
                };
                isDateFilterApplied = true;
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date format for dateTo. Use YYYY-MM-DD.',
                    data: null
                });
            }
        }


        // Prepare the where clause for the BoardingHouse include
        const boardingHouseWhere = {};
        let isBoardingHouseFilterApplied = false;

        if (boardingHouseId) {
            boardingHouseWhere.id = boardingHouseId;
            isBoardingHouseFilterApplied = true;
        }

        // Define the Room include configuration
        // Apply the where clause directly to the BoardingHouse include
        const roomIncludeConfig = {
            model: Room, // Include the associated Room
            attributes: ['id', 'roomNumber', 'roomSize', 'roomStatus'],
            include: [
                {
                    model: BoardingHouse, // Include BoardingHouse nested within Room
                    attributes: ['id', 'name'],
                    where: boardingHouseWhere, // 🔥 Apply where clause directly here
                    required: isBoardingHouseFilterApplied // 🔥 Require BoardingHouse if filtering by it
                }
            ],
            // 🔥 The Room include itself must be required if its nested BoardingHouse is required
            required: isBoardingHouseFilterApplied
        };

        // Find all invoices with key associations and apply the filter
        const invoices = await Invoice.findAll({
            where: invoiceWhere, // 🔥 Apply the date filter to the main query
            attributes: [
                'id',
                'periodStart',
                'periodEnd',
                'issueDate',
                'dueDate',
                'totalAmountDue',
                'totalAmountPaid',
                'status',
                'description',
                'createBy',
                'updateBy',
                'createdAt',
                'updatedAt'
            ],
            include: [
                {
                    model: Transaction, // Include the Transactions related to each Invoice
                    as: 'Transactions',
                    attributes: ['id', 'amount', 'transactionDate', 'method', 'description', 'createBy'],
                    required: false,
                    order: [['transactionDate', 'DESC']]
                },
                {
                    model: Charge, // Include the Charges within each Invoice
                    as: 'Charges',
                    attributes: ['id', 'name', 'amount', 'transactionType'],
                    required: false
                },
                {
                    model: Tenant, // Include the associated Tenant
                    attributes: ['id', 'name', 'phone', 'NIKNumber', 'tenancyStatus'],
                    required: false
                },
                roomIncludeConfig // Use the prepared Room include configuration
            ],
            order: [['issueDate', 'DESC']], // Default order
        });

        let message = 'Invoices retrieved successfully';
        if (isBoardingHouseFilterApplied && isDateFilterApplied) {
            message = `Invoices retrieved successfully for Boarding House ID: ${boardingHouseId} and issue date range: ${dateFrom} to ${dateTo}`;
        } else if (isBoardingHouseFilterApplied) {
            message = `Invoices retrieved successfully for Boarding House ID: ${boardingHouseId}`;
        } else if (isDateFilterApplied) {
            message = `Invoices retrieved successfully for issue date range: ${dateFrom} to ${dateTo}`;
        }


        res.status(200).json({
            success: true,
            message: message,
            data: invoices
        });

    } catch (error) {
        logger.error(`❌ getAllInvoices error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Method to get a single invoice by its ID
exports.getInvoiceById = async (req, res) => {
    try {
        const { id } = req.params; // Extract the invoice ID from request parameters

        // Validate if ID is provided
        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Invoice ID is required',
                data: null
            });
        }

        // Find the invoice by primary key and include all associated data
        const invoice = await Invoice.findByPk(id, {
            attributes: [
                'id',
                'periodStart',
                'periodEnd',
                'issueDate',
                'dueDate',
                'totalAmountDue',
                'totalAmountPaid',
                'status',
                'description',
                'createBy',
                'updateBy',
                'createdAt',
                'updatedAt'
            ],
            include: [
                {
                    model: Transaction, // 🔥 Include ALL Transactions related to this Invoice
                    as: 'Transactions', // Use the alias defined in the Invoice model association
                    attributes: [ // Select all relevant transaction attributes
                        'id',
                        'amount',
                        'transactionDate',
                        'method',
                        'transactionProofPath', // Include proof path for single view
                        'description',
                        'createBy',
                        'updateBy',
                        'createdAt',
                        'updatedAt'
                    ],
                    required: false, // Use LEFT JOIN so invoices without transactions are included
                    order: [['transactionDate', 'DESC']] // Optional: Order transactions
                },
                {
                    model: Charge, // Include ALL Charges within this Invoice
                    as: 'Charges', // Use the alias defined in the Invoice model association
                    attributes: [ // Select all relevant charge attributes
                        'id',
                        'name',
                        'amount',
                        'description',
                        'transactionType',
                        'createBy',
                        'updateBy',
                        'createdAt',
                        'updatedAt'
                    ],
                    required: false, // Use LEFT JOIN
                    order: [['createdAt', 'ASC']] // Optional: Order charges
                },
                {
                    model: Tenant, // Include the associated Tenant
                    attributes: ['id', 'name', 'phone', 'NIKNumber', 'tenancyStatus'], // Select relevant tenant attributes
                    required: false // Use LEFT JOIN
                },
                {
                    model: Room, // Include the associated Room for context
                    attributes: ['id', 'roomNumber', 'roomSize', 'roomStatus'],
                    include: [
                        {
                            model: BoardingHouse, // Include BoardingHouse nested within Room
                            attributes: ['id', 'name', 'address'],
                        }
                    ],
                    required: false // Use LEFT JOIN
                }
            ]
        });

        // Check if the invoice was found
        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found',
                data: null
            });
        }

        // Convert the Sequelize instance to a plain JSON object for the response
        const invoiceData = invoice.toJSON();

        res.status(200).json({
            success: true,
            message: 'Invoice retrieved successfully with associated details, charges, and transactions',
            data: invoiceData // Send the nested data
        });

    } catch (error) {
        logger.error(`❌ getInvoiceById error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Method to update an invoice (e.g., status, due date, totalAmountPaid)
exports.updateInvoice = async (req, res) => {
    // Use a transaction if updating related data (like totalAmountPaid based on a transaction)
    // For simple updates to invoice fields, a transaction might not be strictly necessary,
    // but it's good practice if the update involves multiple steps or related models.
    // const t = await sequelize.transaction();

    try {
        const { id } = req.params; // Invoice ID from URL
        const invoiceUpdateData = req.body; // Data to update the invoice

        // Validate if ID is provided
        if (!id) {
            // await t.rollback();
            return res.status(400).json({
                success: false,
                message: 'Invoice ID is required',
                data: null
            });
        }

        // 1. Find the invoice to update
        const invoice = await Invoice.findByPk(id); // , { transaction: t }

        if (!invoice) {
            // await t.rollback();
            return res.status(404).json({
                success: false,
                message: 'Invoice not found',
                data: null
            });
        }

        // 2. Prepare update data, allowing only specific fields to be updated
        const allowedUpdateFields = [
            'periodStart', // Be cautious allowing update of period dates after issue
            'periodEnd',   // Be cautious allowing update of period dates after issue
            'dueDate',
            'totalAmountPaid', // This would typically be updated when a payment transaction is recorded
            'status', // e.g., 'Paid', 'Unpaid', 'PartiallyPaid', 'Void'
            'description',
            'updateBy'
        ];

        const fieldsToUpdate = {};
        allowedUpdateFields.forEach(field => {
            if (invoiceUpdateData[field] !== undefined) {
                fieldsToUpdate[field] = invoiceUpdateData[field];
            }
        });

        // Optional: Add validation for status transitions (e.g., cannot change from Paid to Unpaid directly)
        if (fieldsToUpdate.status && invoice.status === 'Paid' && fieldsToUpdate.status !== 'Void') {
            // Example: Prevent changing status from Paid unless voiding
            // await t.rollback();
            return res.status(400).json({ success: false, message: 'Cannot change status from Paid except to Void.' });
        }


        // 3. Update the invoice record
        // Only update if there are fields to update
        if (Object.keys(fieldsToUpdate).length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No updates provided for the invoice.',
                data: invoice.toJSON() // Return current data
            });
        }

        const updatedInvoice = await invoice.update(fieldsToUpdate); // , { transaction: t }

        // await t.commit(); // Commit transaction if used

        // 4. Fetch the updated invoice with its associations for the response
        const invoiceWithDetails = await Invoice.findByPk(updatedInvoice.id, {
            attributes: [
                'id', 'periodStart', 'periodEnd', 'issueDate', 'dueDate', 'totalAmountDue',
                'totalAmountPaid', 'status', 'description', 'createBy', 'updateBy', 'createdAt', 'updatedAt'
            ],
            include: [
                { model: Tenant, attributes: ['id', 'name'] }, // Include basic tenant info
                { model: Room, attributes: ['id', 'roomNumber'] }, // Include basic room info
                {
                    model: Charge,
                    as: 'Charges',
                    attributes: ['id', 'name', 'amount', 'transactionType'], // Include key charge info
                    required: false
                }
            ]
        });


        res.status(200).json({
            success: true,
            message: 'Invoice updated successfully',
            data: invoiceWithDetails // Return the updated invoice with details
        });

    } catch (error) {
        logger.error(`❌ updateInvoice error: ${error.message}`);
        logger.error(error.stack);
        // await t.rollback(); // Rollback transaction if used
        res.status(500).json({ error: 'Internal Server Error', error: error.message });
    }
};

// Method to "delete" an invoice by marking its status as 'Void'
exports.deleteInvoice = async (req, res) => {
    // Using a transaction for soft delete is good practice
    const t = await sequelize.transaction();

    try {
        const { id } = req.params; // Invoice ID from URL

        // Validate if ID is provided
        if (!id) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: 'Invoice ID is required',
                data: null
            });
        }

        // 1. Find the invoice to void
        const invoice = await Invoice.findByPk(id, { transaction: t });

        if (!invoice) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: 'Invoice not found',
                data: null
            });
        }

        // 2. Check if the invoice can be voided (e.g., not already paid)
        // This is a business rule you might want to enforce
        if (invoice.status === 'Paid' || invoice.status === 'PartiallyPaid') {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: `Cannot void an invoice with status '${invoice.status}'.`,
                data: null
            });
        }


        // 3. Update the invoice status to 'Void'
        await invoice.update({ status: 'Void', updateBy: req.body.updateBy || 'System' }, { transaction: t });

        // You might also want to update the status of related Charges if necessary,
        // depending on your business logic (e.g., mark charges as cancelled).
        // await Charge.update({ status: 'cancelled' }, { where: { invoiceId: invoice.id }, transaction: t });


        // Commit the transaction
        await t.commit();

        res.status(200).json({
            success: true,
            message: 'Invoice voided successfully',
            data: { id: invoice.id, status: 'Void' } // Return minimal info or the voided invoice
        });

    } catch (error) {
        await t.rollback(); // Rollback transaction
        logger.error(`❌ deleteInvoice error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
