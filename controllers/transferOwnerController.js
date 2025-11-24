// controllers/transferController.js
const { TransferOwner, BoardingHouse } = require('../models'); 

const db = require("../models");
// const sequelize = db.sequelize;
const Sequelize = db.Sequelize;
const { Op } = Sequelize;

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


// Method to create a new transferOwner
exports.createTransferOwner = async (req, res) => {
    // No transaction needed for a single create unless linking to other models atomically
    // const t = await sequelize.transaction();

    try {
        const {
            boardingHouseId,
            amount,
            transferDate,
            description, // Optional
        } = req.body;

        // Validate required fields
        if (!boardingHouseId ||  amount === undefined || amount === null || !transferDate) {
            // If a file was uploaded for a non-existent transfer owner, clean it up
            if (req.imagePath) {
                deleteFile(req.imagePath, 'transfer owner image');
            }
            // await t.rollback();
            return res.status(400).json({ message: 'Required transferOwner fields are missing: boardingHouseId, name, amount, transferDate' });
        }

        const transferAmount = +amount;
        // Ensure transferAmount is a positive number
        if (typeof transferAmount !== 'number' || transferAmount <= 0) {
            // If a file was uploaded for a non-existent transfer owner, clean it up
            if (req.imagePath) {
                deleteFile(req.imagePath, 'transfer owner image');
            }
            // await t.rollback();
            return res.status(400).json({ message: 'Amount must be a positive number' });
        }

        // Ensure transferDate is a valid date
        const transDate = new Date(transferDate);
        if (isNaN(transDate.getTime())) {
            // If a file was uploaded for a non-existent transfer owner, clean it up
            if (req.imagePath) {
                deleteFile(req.imagePath, 'transfer owner image');
            }
            // await t.rollback();
            return res.status(400).json({ message: 'Invalid transferDate format' });
        }

        // Validate Boarding House exists
        const boardingHouse = await BoardingHouse.findByPk(boardingHouseId); // , { transaction: t }
        if (!boardingHouse) {
            // If a file was uploaded for a non-existent transfer owner, clean it up
            if (req.imagePath) {
                deleteFile(req.imagePath, 'transfer owner image');
            }
            // await t.rollback();
            return res.status(404).json({ message: 'Boarding House not found' });
        }

        // Create the TransferOwner record
        const newTransferOwner = await TransferOwner.create({
            boardingHouseId: boardingHouse.id,
            amount: transferAmount,
            transferDate: transDate, // Use validated date
            proofPath: req.imagePath || null, // Get path from middleware or set null
            description: description,
            createBy: req.user.username,
            updateBy: req.user.username,
        }); // , { transaction: t }

        // await t.commit(); // Commit transaction if used

        // Fetch the created transferOwner with its BoardingHouse for response
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
            data: expenseWithDetails // Return the created transferOwner with details
        });

    } catch (error) {
        // await t.rollback(); // Rollback transaction if used
        logger.error(`❌ createExpense error: ${error.message}`);
        logger.error(error.stack);
        // Optional: If an error occurred *after* middleware uploaded a file, clean it up.
        if (req.imagePath) {
            const fullPath = path.join(__dirname, '..', req.proofPath);
            setTimeout(() => {
                deleteFile(req.imagePath, 'transfer owner image');
            }, 100); // Small delay
        }
        res.status(500).json({ message: error.message, error: 'Internal Server Error' });
    }
};


// Method to get all expenses (optional filtering by BoardingHouse, date range, category)
exports.getAllTransferOwners = async (req, res) => {
    try {
        // Extract filter parameters from query string
        const { boardingHouseId, dateFrom, dateTo } = req.query;

        // Prepare the where clause for the main TransferOwner query
        const transferOwnerWhere = {};
        let isFilterApplied = false;

        // Filter by BoardingHouse
        if (boardingHouseId) {
            transferOwnerWhere.boardingHouseId = boardingHouseId;
            isFilterApplied = true;
        }

        // Add date filter if dateFrom and dateTo are provided and valid
        if (dateFrom && dateTo) {
            const fromDate = new Date(dateFrom);
            const toDate = new Date(dateTo);

            if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime())) {
                // Adjust toDate to include the entire end day
                toDate.setHours(23, 59, 59, 999);

                transferOwnerWhere.transferDate = { // Filtering by TransferOwner's expenseDate
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
                transferOwnerWhere.transferDate = { // Filtering by TransferOwner's expenseDate
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
                transferOwnerWhere.transferDate = { // Filtering by TransferOwner's expenseDate
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
        const transferOwners = await TransferOwner.findAll({
            where: transferOwnerWhere, // Apply the filters
            attributes: [
                'id', 'boardingHouseId', 'amount', 'transferDate',
                'proofPath', 'description', 'createBy', 'updateBy', 'createdAt', 'updatedAt'
            ],
            include: [
                { model: BoardingHouse, attributes: ['id', 'name', 'address'] }
            ],
            order: [['transferDate', 'DESC']], // Default order
        });

        let message = 'Expenses retrieved successfully';
        if (isFilterApplied) {
            message = 'Expenses retrieved successfully with filters applied';
            // You could make the message more specific based on which filters were used
        }

        res.status(200).json({
            success: true,
            message: message,
            data: transferOwners
        });

    } catch (error) {
        logger.error(`❌ getAllExpenses error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ message: error.message, error: 'Internal Server Error' });
    }
};

// Method to get a single transferOwner by its ID
exports.getExpenseById = async (req, res) => {
    try {
        const { id } = req.params; // Extract the transferOwner ID

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'TransferOwner ID is required',
                data: null
            });
        }

        const transferOwner = await TransferOwner.findByPk(id, {
            attributes: [
                'id', 'boardingHouseId', 'amount', 'transferDate',
                'proofPath', 'description', 'createBy', 'updateBy', 'createdAt', 'updatedAt'
            ],
            include: [
                { model: BoardingHouse, attributes: ['id', 'name', 'address'] }
            ]
        });

        if (!transferOwner) {
            return res.status(404).json({
                success: false,
                message: 'TransferOwner not found',
                data: null
            });
        }

        res.status(200).json({
            success: true,
            message: 'TransferOwner retrieved successfully with associated boarding house details',
            data: transferOwner
        });

    } catch (error) {
        logger.error(`❌ getExpenseById error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ message: error.message, error: 'Internal Server Error' });
    }
};

// You might add updateExpense and deleteExpense methods later
