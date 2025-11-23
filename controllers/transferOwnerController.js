// controllers/expenseController.js
const { TransferOwner, BoardingHouse } = require('../models'); 

const db = require("../models");
const sequelize = db.sequelize;
// const Sequelize = db.Sequelize;

const logger = require('../config/logger'); // Assuming you have a logger setup
const fs = require('fs'); // Import file system module if handling proofPath uploads here
const path = require('path'); // Import path module

// Note: If proofPath is handled by middleware like NIKImagePath,
// this controller method will receive req.proofPath.
// If handling file upload directly in this controller, you'd need multer/sharp setup here.
// Assuming middleware handles proofPath similar to NIKImagePath.


// Helper function to delete a file safely (can reuse from other controllers)
// Assuming you have a common place for this or copy it here if not
const deleteFile = (filePath, logPrefix = 'File') => {
    const fullPath = path.join(__dirname, '..', filePath);
    if (!filePath || filePath === '/' || filePath.startsWith('..')) {
        logger.warn(`⚠️ Attempted to delete invalid file path: ${filePath}`);
        return;
    }

    fs.access(fullPath, fs.constants.F_OK, (err) => {
        if (err) {
            logger.warn(`⚠️ ${logPrefix} file not found for deletion: ${fullPath}`);
        } else {
            fs.unlink(fullPath, (err) => {
                if (err) logger.error(`❌ Error deleting ${logPrefix} file: ${fullPath}`, err);
                else logger.info(`🗑️ Deleted ${logPrefix} file: ${fullPath}`);
            });
        }
    });
};


// Method to create a new expense
exports.createTransferOwner = async (req, res) => {
    // No transaction needed for a single create unless linking to other models atomically
    // const t = await sequelize.transaction();

    try {
        const {
            boardingHouseId,
            amount,
            transferDate,
            description, // Optional
            // proofPath is assumed to be set by middleware on req.proofPath
        } = req.body;

        // Validate required fields
        if (!boardingHouseId ||  amount === undefined || amount === null || !transferDate) {
            // await t.rollback();
            return res.status(400).json({ message: 'Required expense fields are missing: boardingHouseId, name, amount, expenseDate, paymentMethod' });
        }

        // Ensure amount is a positive number
        if (typeof amount !== 'number' || amount <= 0) {
            // await t.rollback();
            return res.status(400).json({ message: 'Amount must be a positive number' });
        }

        // Ensure transferDate is a valid date
        const transDate = new Date(transferDate);
        if (isNaN(transDate.getTime())) {
            // await t.rollback();
            return res.status(400).json({ message: 'Invalid transferDate format' });
        }

        // Validate Boarding House exists
        const boardingHouse = await BoardingHouse.findByPk(boardingHouseId); // , { transaction: t }
        if (!boardingHouse) {
            // await t.rollback();
            return res.status(404).json({ message: 'Boarding House not found' });
        }


        // Create the TransferOwner record
        const newTransferOwner = await TransferOwner.create({
            boardingHouseId: boardingHouse.id,
            amount: amount,
            transferDate: transDate, // Use validated date
            proofPath: req.proofPath || null, // Get path from middleware or set null
            description: description,
            createBy: req.user.username,
            updateBy: req.user.username,
        }); // , { transaction: t }


        // await t.commit(); // Commit transaction if used

        // Fetch the created expense with its BoardingHouse for response
        const expenseWithDetails = await TransferOwner.findByPk(newTransferOwner.id, {
            attributes: [
                'id', 'boardingHouseId', 'amount', 'transferDate',
                'proofPath', 'description', 'createBy', 'updateBy', 'createdAt', 'updatedAt'
            ],
            include: [
                { model: BoardingHouse, attributes: ['id', 'name', 'address'] }
            ]
        });

        res.status(200).json({
            success: true,
            message: 'TransferOwner recorded successfully',
            data: expenseWithDetails // Return the created expense with details
        });

    } catch (error) {
        // await t.rollback(); // Rollback transaction if used
        logger.error(`❌ createExpense error: ${error.message}`);
        logger.error(error.stack);
        // Optional: If an error occurred *after* middleware uploaded a file, clean it up.
        if (req.proofPath) {
            const fullPath = path.join(__dirname, '..', req.proofPath);
            setTimeout(() => {
                fs.unlink(fullPath, (err) => {
                    if (err) logger.error(`❌ Error deleting uploaded proof after expense error: ${fullPath}`, err);
                    else logger.info(`🗑️ Deleted uploaded proof after expense error: ${fullPath}`);
                });
            }, 100); // Small delay
        }
        res.status(500).json({ message: error.message, error: 'Internal Server Error' });
    }
};

// Method to get all expenses (optional filtering by BoardingHouse, date range, category)
exports.getAllExpenses = async (req, res) => {
    try {
        // Extract filter parameters from query string
        const { boardingHouseId, dateFrom, dateTo, category } = req.query;

        // Prepare the where clause for the main TransferOwner query
        const expenseWhere = {};
        let isFilterApplied = false;

        // Filter by BoardingHouse
        if (boardingHouseId) {
            expenseWhere.boardingHouseId = boardingHouseId;
            isFilterApplied = true;
        }

        // Filter by Category
        if (category) {
            expenseWhere.category = category;
            isFilterApplied = true;
        }


        // Add date filter if dateFrom and dateTo are provided and valid
        if (dateFrom && dateTo) {
            const fromDate = new Date(dateFrom);
            const toDate = new Date(dateTo);

            if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime())) {
                // Adjust toDate to include the entire end day
                toDate.setHours(23, 59, 59, 999);

                expenseWhere.expenseDate = { // Filtering by TransferOwner's expenseDate
                    [Op.between]: [fromDate, toDate]
                };
                isFilterApplied = true;
            } else {
                // Handle invalid date formats
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date format for dateFrom or dateTo. UseYYYY-MM-DD.',
                    data: null
                });
            }
        } else if (dateFrom) {
            // Handle only dateFrom provided
            const fromDate = new Date(dateFrom);
            if (!isNaN(fromDate.getTime())) {
                expenseWhere.expenseDate = { // Filtering by TransferOwner's expenseDate
                    [Op.gte]: fromDate
                };
                isFilterApplied = true;
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date format for dateFrom. UseYYYY-MM-DD.',
                    data: null
                });
            }
        } else if (dateTo) {
            // Handle only dateTo provided
            const toDate = new Date(dateTo);
            if (!isNaN(toDate.getTime())) {
                toDate.setHours(23, 59, 59, 999); // Include the entire end day
                expenseWhere.expenseDate = { // Filtering by TransferOwner's expenseDate
                    [Op.lte]: toDate
                };
                isFilterApplied = true;
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date format for dateTo. UseYYYY-MM-DD.',
                    data: null
                });
            }
        }


        // Find all expenses with associated BoardingHouse
        const expenses = await TransferOwner.findAll({
            where: expenseWhere, // Apply the filters
            attributes: [
                'id', 'boardingHouseId', 'category', 'name', 'amount', 'expenseDate',
                'paymentMethod', 'proofPath', 'description', 'createBy', 'updateBy', 'createdAt', 'updatedAt'
            ],
            include: [
                { model: BoardingHouse, attributes: ['id', 'name', 'address'] }
            ],
            order: [['expenseDate', 'DESC']], // Default order
        });

        let message = 'Expenses retrieved successfully';
        if (isFilterApplied) {
            message = 'Expenses retrieved successfully with filters applied';
            // You could make the message more specific based on which filters were used
        }


        res.status(200).json({
            success: true,
            message: message,
            data: expenses
        });

    } catch (error) {
        logger.error(`❌ getAllExpenses error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ message: error.message, error: 'Internal Server Error' });
    }
};

// Method to get a single expense by its ID
exports.getExpenseById = async (req, res) => {
    try {
        const { id } = req.params; // Extract the expense ID

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'TransferOwner ID is required',
                data: null
            });
        }

        const expense = await TransferOwner.findByPk(id, {
            attributes: [
                'id', 'boardingHouseId', 'category', 'name', 'amount', 'expenseDate',
                'paymentMethod', 'proofPath', 'description', 'createBy', 'updateBy', 'createdAt', 'updatedAt'
            ],
            include: [
                { model: BoardingHouse, attributes: ['id', 'name', 'address'] }
            ]
        });

        if (!expense) {
            return res.status(404).json({
                success: false,
                message: 'TransferOwner not found',
                data: null
            });
        }

        res.status(200).json({
            success: true,
            message: 'TransferOwner retrieved successfully with associated boarding house details',
            data: expense
        });

    } catch (error) {
        logger.error(`❌ getExpenseById error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ message: error.message, error: 'Internal Server Error' });
    }
};

// You might add updateExpense and deleteExpense methods later
