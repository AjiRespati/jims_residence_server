
const db = require("../models");
const sequelize = db.sequelize;
const { Tenant, Room, OtherCost, Invoice, Charge } = require('../models');
const logger = require('../config/logger');
const { startOfDay, addDays, format, isValid } = require('date-fns');


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
    const {
        roomId,
        name,
        amount,
        description,
        isOneTime = true,
        invoiceIssueDate,
        invoiceDueDate
    } = req.body;

    if (!roomId || !name || amount === undefined || amount === null || !invoiceIssueDate || !invoiceDueDate) {
        return res.status(400).json({ message: 'Missing required fields: roomId, name, amount, invoiceIssueDate, invoiceDueDate.' });
    }

    // Validate date formats
    const parsedIssueDate = startOfDay(new Date(invoiceIssueDate));
    const parsedDueDate = startOfDay(new Date(invoiceDueDate));

    if (!isValid(parsedIssueDate) || !isValid(parsedDueDate)) {
        return res.status(400).json({ message: 'Invalid date format for invoiceIssueDate or invoiceDueDate.' });
    }

    let transaction;
    try {
        transaction = await sequelize.transaction();

        // 1. Find the Room
        const room = await Room.findByPk(roomId, { transaction });

        if (!room) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Room not found.' });
        }

        // 2. Find the active Tenant currently assigned to this Room
        // This is the correct way to ensure you get THE active tenant for the room.
        const activeTenant = await Tenant.findOne({
            where: {
                roomId: room.id,
                tenancyStatus: 'Active'
            },
            attributes: ['id', 'name', 'tenancyStatus'], // Only fetch necessary attributes
            transaction
        });

        if (!activeTenant) {
            await transaction.rollback();
            return res.status(400).json({ message: `No active tenant found for Room ${room.roomNumber}. Cannot add OtherCost.` });
        }

        logger.info(`Found active tenant ${activeTenant.name} (${activeTenant.id}) for Room ${room.roomNumber}.`);

        // 3. Create the OtherCost record
        // If it's a one-time charge, set its status to 'billed' immediately
        // and link it to the invoice that will be created.
        const otherCostStatus = isOneTime ? 'billed' : 'active';

        const newOtherCost = await OtherCost.create({
            roomId: room.id,
            name,
            amount,
            description: description || `One-time charge: ${name}`,
            status: otherCostStatus,
            isOneTime: isOneTime,
            createBy: req.user ? req.user.name : 'System/Admin', // Assuming req.user exists from auth middleware
            updateBy: req.user ? req.user.name : 'System/Admin',
        }, { transaction });

        // 4. Create a dedicated Invoice for this OtherCost (if it's a one-time charge)
        if (isOneTime) {
            const newInvoice = await Invoice.create({
                tenantId: activeTenant.id, // Use the ID of the found active tenant
                roomId: room.id,
                periodStart: parsedIssueDate, // For one-time, period can be the issue date
                periodEnd: parsedIssueDate,   // For one-time, period can be the issue date
                issueDate: parsedIssueDate,   // User provided issue date
                dueDate: parsedDueDate,       // User provided due date
                banishDate: addDays(parsedDueDate, 7), // Example: Banish 7 days after due date
                totalAmountDue: parseFloat(amount), // Only this OtherCost's amount
                totalAmountPaid: 0,
                status: 'Issued', // Or 'Due'
                description: `Ad-hoc Invoice for ${name} (Room ${room.roomNumber})`,
                createBy: req.user ? req.user.name : 'System/Admin',
                updateBy: req.user ? req.user.name : 'System/Admin',
            }, { transaction });

            // 5. Create a Charge record for this OtherCost within the new Invoice
            await Charge.create({
                invoiceId: newInvoice.id,
                name: newOtherCost.name,
                amount: newOtherCost.amount,
                description: newOtherCost.description,
                transactionType: 'debit',
                createBy: req.user ? req.user.name : 'System/Admin',
                updateBy: req.user ? req.user.name : 'System/Admin',
            }, { transaction });

            // 6. Update the OtherCost to link it to the newly created invoice
            await newOtherCost.update({ invoiceId: newInvoice.id }, { transaction });

            await transaction.commit();
            return res.status(201).json({
                message: 'One-time OtherCost created and invoiced successfully.',
                otherCost: newOtherCost,
                invoice: newInvoice
            });

        } else { // If it's a recurring OtherCost (isOneTime=false)
            await transaction.commit();
            return res.status(200).json({
                message: 'Recurring OtherCost created successfully. It will be included in future monthly invoices.',
                otherCost: newOtherCost
            });
        }

    } catch (error) {
        if (transaction) {
            await transaction.rollback();
        }
        logger.error(`❌ Error creating OtherCost or invoice: ${error.message}`);
        logger.error(error.stack);
        return res.status(500).json({ message: 'Failed to create OtherCost or invoice.', error: error.message });
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