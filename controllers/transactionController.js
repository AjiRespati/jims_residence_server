const db = require("../models");
const sequelize = db.sequelize;
// const Sequelize = db.Sequelize;

const { Tenant, Transaction, Invoice, Room } = require('../models');
const logger = require('../config/logger');
const path = require("path");
const fs = require("fs");


// Method to record a new payment transaction
exports.recordPayment = async (req, res) => {
    logger.info("✅ SAMPE SINI GAK?????         .....");
    const t = await sequelize.transaction(); // Start a transaction

    try {
        const {
            invoiceId,
            amount,
            transactionDate, // The date the payment was made
            method,
            description, // Optional description for the transaction
            // transactionProofPath is assumed to be set by middleware on req.transactionProofPath
        } = req.body;

        // Validate required fields for a transaction
        if (!invoiceId || amount === undefined || amount === null || !transactionDate || !method) {
            await t.rollback();
            return res.status(400).json({ message: 'Required transaction fields are missing: invoiceId, amount, transactionDate, method' });
        }

        // Ensure amount is a positive number
        if (typeof amount !== 'number' || amount <= 0) {
            await t.rollback();
            return res.status(400).json({ message: 'Amount must be a positive number' });
        }

        // Ensure transactionDate is a valid date
        const paymentDate = new Date(transactionDate);
        if (isNaN(paymentDate.getTime())) {
            await t.rollback();
            return res.status(400).json({ message: 'Invalid transactionDate format' });
        }


        // 1. Find the related Invoice within the transaction
        const invoice = await Invoice.findByPk(invoiceId, { transaction: t });

        if (!invoice) {
            await t.rollback();
            return res.status(404).json({ message: 'Invoice not found' });
        }

        // 2. Validate Invoice status (e.g., cannot pay a Void or already Paid invoice)
        if (invoice.status === 'Paid' || invoice.status === 'Void') {
            await t.rollback();
            return res.status(400).json({ message: `Cannot record payment for an invoice with status '${invoice.status}'.` });
        }

        // 3. Create the Transaction record
        const newTransaction = await Transaction.create({
            invoiceId: invoice.id,
            amount: amount,
            transactionDate: paymentDate, // Use validated date
            method: method,
            transactionProofPath: req.transactionProofPath || null, // Get path from middleware or set null
            description: description,
            createBy: req.user.username,
            updateBy: req.user.username,
        }, { transaction: t }); // Include the transaction


        // 4. Update the Invoice's totalAmountPaid
        const updatedTotalAmountPaid = invoice.totalAmountPaid + amount;
        let newInvoiceStatus = invoice.status; // Start with current status

        // Determine the new status based on the updated total paid amount
        if (updatedTotalAmountPaid >= invoice.totalAmountDue) {
            newInvoiceStatus = 'Paid'; // Invoice is now fully paid or overpaid
        } else if (updatedTotalAmountPaid > 0) {
            newInvoiceStatus = 'PartiallyPaid'; // Invoice is partially paid
        } else {
            newInvoiceStatus = 'Unpaid'; // Should only happen if amount was 0, but good as a fallback
            // Note: Status is 'Issued' initially, changes to 'Unpaid' if due date passes.
            // Logic for due date passing would be separate (e.g., a scheduled task).
        }

        // 5. Update the Invoice record with the new total paid and status
        await invoice.update({
            totalAmountPaid: updatedTotalAmountPaid,
            status: newInvoiceStatus,
            updateBy: req.user.username, // Update the invoice updater
        }, { transaction: t });


        // If all operations were successful, commit the transaction
        await t.commit();

        // 6. Fetch the created transaction with basic invoice info for response
        const transactionWithInvoice = await Transaction.findByPk(newTransaction.id, {
            attributes: ['id', 'invoiceId', 'amount', 'transactionDate', 'method', 'transactionProofPath', 'description', 'createBy', 'createdAt'],
            include: [
                {
                    model: Invoice,
                    attributes: ['id', 'dueDate', 'totalAmountDue', 'totalAmountPaid', 'status'], // Include key invoice details
                    include: [ // Include Tenant and Room from Invoice for context
                        { model: Tenant, attributes: ['id', 'name'] },
                        { model: Room, attributes: ['id', 'roomNumber'] }
                    ]
                }
            ]
        });


        res.status(200).json({
            success: true,
            message: 'Payment transaction recorded and invoice updated successfully',
            data: transactionWithInvoice // Return the created transaction with details
        });

    } catch (error) {
        logger.error(`❌ recordPayment error: ${error.message}`);
        logger.error(error.stack);
        // If any error occurs, rollback the transaction
        await t.rollback();
        // Optional: If an error occurred *after* middleware uploaded a file, you might want to delete the file here too.
        // This requires checking if req.transactionProofPath exists in the catch block.
        if (req.transactionProofPath) {
            const fullPath = path.join(__dirname, '..', req.transactionProofPath);
            // Added a timeout because unlink might fail immediately if the file system is busy after an error
            setTimeout(() => {
                fs.unlink(fullPath, (err) => {
                    if (err) logger.error(`❌ Error deleting uploaded transaction proof after error: ${fullPath}`, err);
                    else logger.info(`🗑️ Deleted uploaded transaction proof after error: ${fullPath}`);
                });
            }, 100); // Small delay
        }
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};

// Method to get all transactions (optional)
exports.getAllTransactions = async (req, res) => {
    try {
        // Optional: Implement filtering, pagination, sorting
        const transactions = await Transaction.findAll({
            attributes: ['id', 'invoiceId', 'amount', 'transactionDate', 'method', 'description', 'createBy', 'createdAt'],
            include: [
                {
                    model: Invoice, // Include the associated Invoice
                    attributes: ['id', 'dueDate', 'totalAmountDue', 'totalAmountPaid', 'status'],
                    include: [ // Include Tenant and Room from Invoice
                        { model: Tenant, attributes: ['id', 'name'] },
                        { model: Room, attributes: ['id', 'roomNumber'] }
                    ]
                }
            ],
            order: [['transactionDate', 'DESC']], // Order by most recent transaction date
        });

        res.status(200).json({
            success: true,
            message: 'Transactions retrieved successfully',
            data: transactions
        });

    } catch (error) {
        logger.error(`❌ getAllTransactions error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Method to get a single transaction by its ID
exports.getTransactionById = async (req, res) => {
    try {
        const { id } = req.params; // Extract the transaction ID

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Transaction ID is required',
                data: null
            });
        }

        const transaction = await Transaction.findByPk(id, {
            attributes: ['id', 'invoiceId', 'amount', 'transactionDate', 'method', 'transactionProofPath', 'description', 'createBy', 'updateBy', 'createdAt', 'updatedAt'],
            include: [
                {
                    model: Invoice, // Include the associated Invoice
                    attributes: ['id', 'periodStart', 'periodEnd', 'issueDate', 'dueDate', 'totalAmountDue', 'totalAmountPaid', 'status', 'description'],
                    include: [ // Include Tenant and Room from Invoice
                        { model: Tenant, attributes: ['id', 'name', 'phone'] },
                        { model: Room, attributes: ['id', 'roomNumber', 'roomSize'] }
                    ]
                }
            ]
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: 'Transaction not found',
                data: null
            });
        }

        res.status(200).json({
            success: true,
            message: 'Transaction retrieved successfully with associated invoice details',
            data: transaction
        });

    } catch (error) {
        logger.error(`❌ getTransactionById error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
