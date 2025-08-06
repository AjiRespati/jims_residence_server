const db = require("../models");
const sequelize = db.sequelize;
const Sequelize = db.Sequelize;
const { Op } = Sequelize;

const { Tenant, Room, Price, AdditionalPrice, OtherCost,
    Invoice, Charge, BoardingHouse, Transaction
} = require('../models');
const logger = require('../config/logger');
const path = require("path");
const fs = require("fs");
const {
    subDays, addMonths, endOfMonth, isLastDayOfMonth, startOfDay, format,
    parseISO, isValid, setHours, setMinutes, setSeconds, setMilliseconds
} = require('date-fns');


// Helper function to delete a file safely (copied from updateTenant for completeness)
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


exports.getAllTenants = async (req, res) => {
    try {
        const { boardingHouseId, dateFrom, dateTo } = req.query;

        const tenantWhere = {}; // Start with an empty where object

        let isDateFilterApplied = false;
        let filterFromDate, filterToDate;

        // --- Date Range Filtering Logic ---
        if (dateFrom || dateTo) {
            // Parse and validate dateFrom
            if (dateFrom) {
                filterFromDate = parseISO(dateFrom);
                if (!isValid(filterFromDate)) {
                    return res.status(400).json({ success: false, message: 'Invalid dateFrom format. Please use ISO 8601 (YYYY-MM-DD).', data: null });
                }
                filterFromDate = setHours(filterFromDate, 0, 0, 0); // Start of the day
            } else {
                filterFromDate = new Date('1900-01-01'); // Effectively no lower bound
            }

            // Parse and validate dateTo
            if (dateTo) {
                filterToDate = parseISO(dateTo);
                if (!isValid(filterToDate)) {
                    return res.status(400).json({ success: false, message: 'Invalid dateTo format. Please use ISO 8601 (YYYY-MM-DD).', data: null });
                }
                filterToDate = setHours(filterToDate, 23, 59, 59, 999); // End of the day
            } else {
                filterToDate = new Date('2100-12-31'); // Effectively no upper bound
            }

            // Validate that filterFromDate is not after filterToDate
            if (filterFromDate > filterToDate) {
                return res.status(400).json({ success: false, message: 'dateFrom cannot be after dateTo.', data: null });
            }

            // --- Updated Overlap Logic for Tenant's Presence ---
            // A tenant is considered "present" in the filter range if:
            // (their checkinDate <= filterToDate) AND
            // (their checkoutDate is NULL OR their checkoutDate >= filterFromDate)
            tenantWhere[Op.and] = [
                { checkinDate: { [Op.lte]: filterToDate } }, // Tenant checked in on or before the end of the filter period
                {
                    [Op.or]: [
                        { checkoutDate: { [Op.gte]: filterFromDate } }, // Tenant checked out on or after the start of the filter period
                        { checkoutDate: null } // Or tenant has not checked out yet (meaning they are still present)
                    ]
                }
            ];
            isDateFilterApplied = true;

        } else {
            // If no date range filter is provided, revert to showing currently active and non-checked-out tenants
            tenantWhere.tenancyStatus = 'Active';
            tenantWhere.checkoutDate = null;
        }
        // --- End Date Range Filtering Logic ---


        // Prepare the where clause for the BoardingHouse include
        const boardingHouseWhere = {};
        let isBoardingHouseFilterApplied = false;

        if (boardingHouseId) {
            boardingHouseWhere.id = boardingHouseId;
            isBoardingHouseFilterApplied = true;
        }

        // Define the Room include configuration
        const roomIncludeConfig = {
            model: Room,
            attributes: ['id', 'roomNumber', 'roomSize', 'roomStatus'],
            include: [
                {
                    model: BoardingHouse,
                    attributes: ['id', 'name'],
                    where: boardingHouseWhere,
                    required: isBoardingHouseFilterApplied
                }
            ],
            required: isBoardingHouseFilterApplied
        };


        // Find all tenants and include specified associated data
        const tenants = await Tenant.findAll({
            where: tenantWhere, // Apply the combined filters to the main query
            attributes: [
                'id', 'name', 'phone', 'NIKNumber', 'tenancyStatus',
                'checkinDate', // <-- IMPORTANT: Now includes the dedicated checkinDate
                'startDate', 'endDate', 'dueDate', 'banishDate', 'checkoutDate',
                'createBy', 'updateBy', 'NIKImagePath', 'isNIKCopyDone'
            ],
            include: [
                roomIncludeConfig,
                {
                    model: Invoice,
                    attributes: [
                        'id', 'periodStart', 'periodEnd', 'issueDate', 'dueDate',
                        'totalAmountDue', 'totalAmountPaid', 'status', 'description'
                    ],
                    where: {
                        status: ['Issued', 'Unpaid', 'PartiallyPaid']
                    },
                    required: false,
                    order: [['dueDate', 'ASC']],
                    include: [
                        {
                            model: Charge,
                            as: 'Charges',
                            attributes: ['id', 'name', 'amount', 'description', 'transactionType'],
                            required: false
                        }
                    ]
                }
            ]
            // order: [['createdAt', 'DESC']]
        });

        // Flatten the response structure
        const flattenedTenants = tenants.map(tenant => {
            const tenantData = tenant.toJSON();

            const roomNumber = tenantData.Room?.roomNumber || null;
            const boardingHouseName = tenantData.Room?.BoardingHouse?.name || null;

            tenantData.roomNumber = roomNumber;
            tenantData.boardingHouseName = boardingHouseName;

            delete tenantData.Room;

            return tenantData;
        });

        let message = 'Tenants retrieved successfully with outstanding invoices, room number, and boarding house name.';
        if (isBoardingHouseFilterApplied && isDateFilterApplied) {
            message = `Tenants retrieved successfully for Boarding House ID: ${boardingHouseId} and period overlap: ${format(filterFromDate, 'yyyy-MM-dd')} to ${format(filterToDate, 'yyyy-MM-dd')}.`;
        } else if (isBoardingHouseFilterApplied) {
            message = `Tenants retrieved successfully for Boarding House ID: ${boardingHouseId}.`;
        } else if (isDateFilterApplied) {
            message = `Tenants retrieved successfully for period overlap: ${format(filterFromDate, 'yyyy-MM-dd')} to ${format(filterToDate, 'yyyy-MM-dd')}.`;
        } else {
            message = 'Currently active and non-checked-out tenants retrieved successfully.';
        }

        // sorting after generating response
        flattenedTenants.sort((a, b) => a.roomNumber - b.roomNumber);

        res.status(200).json({
            success: true,
            message: message,
            data: flattenedTenants
        });

    } catch (error) {
        logger.error(`❌ getAllTenants error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ success: false, message: 'Internal Server Error', error: error.message });
    }
};

exports.getTenantById = async (req, res) => {
    try {
        const { id } = req.params; // Extract the tenant ID from request parameters

        // Validate if ID is provided
        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Tenant ID is required',
                data: null
            });
        }

        // Find the tenant by primary key and include associated data
        const tenant = await Tenant.findByPk(id, {
            attributes: [ // Select specific attributes for the Tenant
                'id',
                'name',
                'phone',
                'NIKNumber',
                'NIKImagePath',
                'isNIKCopyDone',
                'tenancyStatus',
                'startDate',
                'dueDate', // This might now be the tenant's contract end date, distinct from invoice due dates
                'banishDate',
                'checkinDate',
                'checkoutDate',
                'createBy',
                'updateBy'
            ],
            include: [
                {
                    model: Room, // Include the associated Room
                    attributes: ['id', 'roomNumber', 'roomSize', 'roomStatus'], // Select relevant Room attributes
                    include: [
                        {
                            model: BoardingHouse, // Include the associated BoardingHouse nested within Room
                            attributes: ['id', 'name', 'address'] // Select relevant BoardingHouse attributes
                        }
                    ],
                    required: false // Use LEFT JOIN
                },
                {
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
            ]
        });

        // Check if the tenant was found
        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'Tenant not found',
                data: null
            });
        }

        // Convert the Sequelize instance to a plain JSON object for the response
        const tenantData = tenant.toJSON();

        // Extract roomNumber and boardingHouseName from nested objects
        const roomId = tenantData.Room ? tenantData.Room.id : null;
        const roomNumber = tenantData.Room ? tenantData.Room.roomNumber : null;
        const boardingHouseName = (tenantData.Room && tenantData.Room.BoardingHouse) ? tenantData.Room.BoardingHouse.name : null;

        // Add roomNumber and boardingHouseName as top-level properties
        tenantData.roomId = roomId;
        tenantData.roomNumber = roomNumber;
        tenantData.boardingHouseName = boardingHouseName;

        // Remove the original nested Room object
        delete tenantData.Room;

        res.status(200).json({
            success: true,
            message: 'Tenant retrieved successfully with all invoices and charges',
            data: tenantData // Send the nested data
        });

    } catch (error) {
        logger.error(`❌ getTenantById error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Method to create a new tenant (MODIFIED - Calculates first invoice periodEnd)
exports.createTenant = async (req, res) => {
    let t;
    let newTenant;

    try {
        t = await sequelize.transaction();

        const {
            roomId, name, phone, NIKNumber,
            // startDate will now represent the check-in date
            startDate: checkinDateRaw, // Rename incoming startDate to checkinDateRaw
            dueDate, banishDate,
            NIKImagePath, isNIKCopyDone, tenancyStatus,
            priceAmount, priceName, priceDescription, priceRoomSize,
            additionalPrices, otherCosts
        } = req.body;

        if (!roomId || !name || !phone || !NIKNumber || !checkinDateRaw || !dueDate || priceAmount === undefined || priceAmount === null) {
            await t.rollback();
            return res.status(400).json({ message: 'Required fields are missing' });
        }

        if (typeof priceAmount !== 'number' || priceAmount < 0) {
            await t.rollback();
            return res.status(400).json({ message: 'priceAmount must be a non-negative number' });
        }

        // Parse the check-in date
        const checkinDate = new Date(checkinDateRaw);
        const invoiceDueDate = new Date(dueDate);
        let invoiceBanishDate = banishDate ? new Date(banishDate) : null;

        if (isNaN(checkinDate.getTime()) || isNaN(invoiceDueDate.getTime()) || (banishDate && isNaN(invoiceBanishDate.getTime()))) {
            await t.rollback();
            return res.status(400).json({ message: 'Invalid date format' });
        }

        const room = await Room.findByPk(roomId, { transaction: t });
        if (!room) {
            await t.rollback();
            return res.status(404).json({ message: 'Room not found.' });
        }

        // Create the main price for the room
        const newPrice = await Price.create({
            boardingHouseId: room.boardingHouseId,
            roomSize: priceRoomSize || 'Standard',
            name: priceName || 'Sewa kamar',
            amount: priceAmount,
            description: priceDescription || `Sewa kamar ${room.roomNumber || ''}`,
            createBy: req.user.username,
            updateBy: req.user.username,
            status: 'active'
        }, { transaction: t });

        // Update room with new price and status
        await room.update({ priceId: newPrice.id, updateBy: req.user.username, roomStatus: 'Terisi' }, { transaction: t }); // Changed to 'Terisi' as tenant is created

        // Create additional prices if provided
        let createdAdditionalPrices = [];
        if (Array.isArray(additionalPrices) && additionalPrices.length > 0) {
            createdAdditionalPrices = await AdditionalPrice.bulkCreate(
                additionalPrices.map(ap => ({
                    roomId: room.id,
                    amount: ap.amount,
                    name: ap.name || 'Unnamed Additional Price',
                    description: ap.description,
                    status: ap.status || 'active',
                    createBy: req.user.username,
                    updateBy: req.user.username,
                })),
                { transaction: t }
            );
        }

        // Create other costs if provided
        let createdOtherCosts = [];
        if (Array.isArray(otherCosts) && otherCosts.length > 0) {
            createdOtherCosts = await OtherCost.bulkCreate(
                otherCosts.map(oc => ({
                    roomId: room.id,
                    amount: oc.amount,
                    name: oc.name || 'Unnamed Other Cost',
                    description: oc.description,
                    status: oc.status || 'active',
                    createBy: req.user.username,
                    updateBy: req.user.username,
                })),
                { transaction: t }
            );
        }

        // Determine the period for the first invoice (based on the check-in date)
        const firstInvoicePeriodStart = checkinDate;
        let firstInvoicePeriodEnd = addMonths(firstInvoicePeriodStart, 1);
        firstInvoicePeriodEnd = isLastDayOfMonth(firstInvoicePeriodStart) ? endOfMonth(firstInvoicePeriodEnd) : subDays(firstInvoicePeriodEnd, 1);

        // Create the Tenant record
        newTenant = await Tenant.create({
            roomId,
            name,
            phone,
            NIKNumber,
            // Use checkinDate for the tenant's actual move-in date.
            // startDate and endDate will now represent the *period* for the first invoice/lease.
            startDate: firstInvoicePeriodStart, // The start of their first billing period
            endDate: firstInvoicePeriodEnd,     // The end of their first billing period
            checkoutDate: null, // Ensure this is null on creation
            dueDate: invoiceDueDate,
            banishDate,
            checkinDate: firstInvoicePeriodStart,
            NIKImagePath,
            isNIKCopyDone,
            tenancyStatus: tenancyStatus || 'Active', // Default to 'Active'
            createBy: req.user.username,
            updateBy: req.user.username
        }, { transaction: t });

        // Create the first invoice
        const firstInvoice = await Invoice.create({
            tenantId: newTenant.id,
            roomId: room.id,
            priceId: newPrice.id,
            periodStart: firstInvoicePeriodStart,
            periodEnd: firstInvoicePeriodEnd,
            issueDate: checkinDate, // Invoice is issued on check-in date
            dueDate: invoiceDueDate,
            banishDate: invoiceBanishDate,
            totalAmountDue: 0,
            totalAmountPaid: 0,
            status: 'Issued',
            description: `Initial invoice for room ${room.roomNumber || roomId} period: ${format(firstInvoicePeriodStart, 'yyyy-MM-dd')} to ${format(firstInvoicePeriodEnd, 'yyyy-MM-dd')}`,
            createBy: req.user.username,
            updateBy: req.user.username
        }, { transaction: t });

        // Create charges for the first invoice
        let chargesToCreate = [];
        let calculatedTotalAmountDue = 0;

        chargesToCreate.push({
            priceId: newPrice.id,
            invoiceId: firstInvoice.id,
            name: newPrice.name,
            amount: newPrice.amount,
            description: newPrice.description,
            transactionType: 'debit',
            createBy: req.user.username,
            updateBy: req.user.username
        });
        calculatedTotalAmountDue += newPrice.amount;

        for (const ap of createdAdditionalPrices) {
            chargesToCreate.push({
                priceId: null,
                invoiceId: firstInvoice.id,
                name: ap.name,
                amount: ap.amount,
                description: ap.description,
                transactionType: 'debit',
                createBy: req.user.username,
                updateBy: req.user.username
            });
            calculatedTotalAmountDue += ap.amount;
        }

        for (const oc of createdOtherCosts) {
            chargesToCreate.push({
                priceId: null,
                invoiceId: firstInvoice.id,
                name: oc.name,
                amount: oc.amount,
                description: oc.description,
                transactionType: 'credit',
                createBy: req.user.username,
                updateBy: req.user.username
            });
            calculatedTotalAmountDue += oc.amount;
        }

        if (chargesToCreate.length > 0) {
            await Charge.bulkCreate(chargesToCreate, { transaction: t });
        }

        // Update the first invoice with the calculated total amount due
        await firstInvoice.update({ totalAmountDue: calculatedTotalAmountDue }, { transaction: t });

        await t.commit(); // Commit the transaction

    } catch (error) {
        if (t && !t.finished) { // Check if transaction is still active
            try {
                await t.rollback(); // Rollback if error
            } catch (rollbackError) {
                logger.error(`Rollback failed: ${rollbackError.message}`);
            }
        }
        logger.error(`❌ createTenant error: ${error.message}`);
        logger.error(error.stack);
        return res.status(500).json({ message: 'Internal server error', error: error.message });
    }

    // Post-commit fetch for the response
    try {
        const tenantWithDetails = await Tenant.findByPk(newTenant.id, {
            include: [
                {
                    model: Room,
                    attributes: ['id', 'roomNumber', 'roomSize', 'roomStatus', 'priceId'],
                    include: [
                        { model: BoardingHouse, attributes: ['id', 'name'] },
                        { model: Price, attributes: ['id', 'name', 'amount', 'roomSize', 'description', 'status'] },
                        { model: AdditionalPrice, attributes: ['id', 'name', 'amount', 'description', 'status'], where: { status: 'active' }, required: false },
                        { model: OtherCost, attributes: ['id', 'name', 'amount', 'description', 'status'], where: { status: 'active' }, required: false },
                    ]
                },
                {
                    model: Invoice,
                    attributes: ['id', 'periodStart', 'periodEnd', 'issueDate', 'dueDate', 'totalAmountDue', 'totalAmountPaid', 'status', 'description', 'createBy'],
                    include: [
                        { model: Charge, as: 'Charges', attributes: ['id', 'name', 'amount', 'description', 'transactionType', 'createBy'] }
                    ]
                }
            ]
        });
        return res.status(200).json(tenantWithDetails);
    } catch (error) {
        logger.error(`❌ post-commit fetch failed: ${error.message}`);
        return res.status(500).json({ message: 'Post-commit fetch failed', error: error.message });
    }
};

exports.updateTenant = async (req, res) => {
    // No transaction needed for this specific method as per previous decision,
    // unless adding more complex related updates/creates later.
    // const t = await sequelize.transaction();

    try {
        const { id } = req.params; // Tenant ID from URL

        if (!id) {
            // await t.rollback();
            return res.status(400).json({
                success: false,
                message: 'Tenant ID is required',
                data: null
            });
        }

        // 1. Find the tenant to update
        const tenant = await Tenant.findByPk(id);

        if (!tenant) {
            // If a file was uploaded for a non-existent tenant, clean it up
            if (req.imagePath) {
                deleteFile(req.imagePath, 'Uploaded NIK image');
            }
            // await t.rollback();
            return res.status(404).json({
                success: false,
                message: 'Tenant not found',
                data: null
            });
        }

        // 2. Prepare update data from request body and image path
        const tenantUpdateData = {};
        const updatableFields = [
            'roomId',
            'name',
            'phone',
            'NIKNumber',
            'isNIKCopyDone',
            'tenancyStatus',
            'checkinDate',
            'startDate',
            'endDate',
            'dueDate',
            'banishDate',
            'updateBy' // Assuming updateBy is sent in the body
        ];

        updatableFields.forEach(field => {
            if (req.body[field] !== undefined) {
                tenantUpdateData[field] = req.body[field];
            }
        });

        // Add the NIKImagePath if a file was uploaded by the middleware
        if (req.imagePath) {
            // Before setting the new path, consider deleting the old image file
            if (tenant.NIKImagePath) {
                deleteFile(tenant.NIKImagePath, 'Old NIK image');
            }
            tenantUpdateData.NIKImagePath = req.imagePath; // Set the new image path
            tenantUpdateData.isNIKCopyDone = true; // set copy done true
        }

        // 3. Optional Validation for Foreign Keys if present in update data
        if (tenantUpdateData.boardingHouseId) {
            const boardingHouse = await BoardingHouse.findByPk(tenantUpdateData.boardingHouseId); // , { transaction: t }
            if (!boardingHouse) {
                // await t.rollback();
                return res.status(404).json({ message: 'Provided Boarding House not found' });
            }
        }

        // 4. Update the tenant record (only if there are fields to update or an image path)
        if (Object.keys(tenantUpdateData).length === 0) {
            // If no fields were sent for update and no image was uploaded
            // You might return a 304 Not Modified or just the current tenant data
            return res.status(200).json({
                success: true,
                message: 'No updates provided.',
                data: tenant.toJSON() // Return current data
            });
        }

        tenantUpdateData.updateBy = req.user.username;

        const updatedTenant = await tenant.update(tenantUpdateData); // , { transaction: t }

        // await t.commit(); // Commit transaction if used


        // 5. Fetch the updated tenant with its standard associations for the response
        const tenantDetailsInclude = [
            {
                model: Room, // Include the associated Room
                attributes: ['id', 'roomNumber', 'description', 'roomStatus'],
                include: [
                    {
                        model: BoardingHouse, // Include the associated BoardingHouse
                        attributes: ['id', 'name', 'address']
                    }
                ],
                required: false // Keep as false
            },
            // We are not including Payments here, getTenantById handles that
        ];

        const tenantWithDetails = await Tenant.findByPk(updatedTenant.id, {
            attributes: [ // Select specific attributes for the Tenant
                'id', 'name', 'phone', 'NIKNumber', 'NIKImagePath', 'isNIKCopyDone',
                'tenancyStatus', 'startDate', 'dueDate', 'banishDate', 'createBy', 'updateBy'
            ],
            include: tenantDetailsInclude
        });


        res.status(200).json({
            success: true,
            message: 'Tenant updated successfully',
            data: tenantWithDetails // Return the updated tenant with relevant details
        });

    } catch (error) {
        logger.error(`❌ updateTenant error: ${error.message}`);
        logger.error(error.stack);
        // Optional: If an error occurred *after* middleware uploaded a file, you might want to delete the file here too.
        // This requires checking if req.imagePath exists in the catch block.
        if (req.imagePath) {
            // Added a timeout because unlink might fail immediately if the file system is busy after an error
            setTimeout(() => {
                deleteFile(req.imagePath, 'Uploaded NIK image');
            }, 100); // Small delay
        }
        // await t.rollback(); // Rollback transaction if used
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
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

exports.tenantCheckout = async (req, res) => {
    const tenantId = req.params.id; // Assuming tenantId comes from URL params, e.g., /api/tenants/:id/checkout
    const {
        checkoutDate: checkoutDateRaw, // Get checkoutDate from body (optional)
        forceCheckout // Get forceCheckout boolean from body
    } = req.body;

    const checkoutDate = checkoutDateRaw ? startOfDay(new Date(checkoutDateRaw)) : startOfDay(new Date()); // Use provided date or today

    let transaction; // Declare transaction variable
    try {
        transaction = await sequelize.transaction(); // Start a new transaction

        // 1. Find the Tenant and their associated Room
        const tenant = await Tenant.findByPk(tenantId, {
            include: [
                {
                    model: Room, // Ensure Room is associated in your models
                    attributes: ['id', 'roomNumber', 'roomStatus'], // Include the correct attribute name: 'roomStatus'
                },
            ],
            transaction, // Pass transaction to the find operation
        });

        if (!tenant) {
            await transaction.rollback(); // Rollback if tenant not found
            return res.status(404).json({ success: false, message: 'Tenant not found.' });
        }

        // Check if the tenant is currently active
        if (tenant.tenancyStatus !== 'Active') {
            await transaction.rollback(); // Rollback if tenant not active
            return res.status(400).json({ success: false, message: `Tenant ${tenant.name} is not currently active (status: ${tenant.tenancyStatus}). Cannot proceed with checkout.` });
        }

        const room = tenant.Room; // Access the associated room
        if (!room) {
            await transaction.rollback(); // Rollback if room not found (shouldn't happen for an active tenant)
            return res.status(400).json({ success: false, message: `Tenant ${tenant.name} is not assigned to any room. Cannot proceed with checkout.` });
        }

        logger.info(`Attempting basic checkout for Tenant ${tenant.id} (${tenant.name}) from Room ${room.roomNumber}. Force Checkout: ${!!forceCheckout}`);

        // 2. IMPORTANT: Check for unpaid invoices
        const unpaidInvoices = await Invoice.findAll({
            where: {
                tenantId: tenant.id,
                // These are statuses that typically indicate money is still owed
                status: {
                    [Op.notIn]: ['Paid', 'Void', 'Cancelled'], // Assuming 'Cancelled' is also a final, non-unpaid status
                },
            },
            attributes: ['id', 'totalAmountDue', 'totalAmountPaid', 'status', 'periodStart', 'periodEnd', 'issueDate', 'dueDate'], // Select relevant fields
            transaction, // Pass transaction to the find operation
        });

        if (unpaidInvoices.length > 0) {
            if (forceCheckout) {
                logger.warn(`⚠️ Force checkout enabled for Tenant ${tenant.id}. Voiding ${unpaidInvoices.length} outstanding invoices.`);

                // Update unpaid invoices to 'Void' status
                const invoiceIdsToVoid = unpaidInvoices.map(inv => inv.id);
                await Invoice.update(
                    {
                        status: 'Void',
                        updateBy: req.user ? req.user.name : 'System/Admin Force Checkout',
                    },
                    {
                        where: { id: { [Op.in]: invoiceIdsToVoid } },
                        transaction
                    }
                );
                logger.info(`✅ Successfully voided invoices: ${invoiceIdsToVoid.join(', ')} for Tenant ${tenant.id}.`);

            } else {
                // If not forceCheckout, then deny checkout
                await transaction.rollback(); // Rollback if unpaid invoices exist and forceCheckout is false
                logger.warn(`❌ Checkout denied for Tenant ${tenant.id}: ${unpaidInvoices.length} outstanding invoices found and forceCheckout is false.`);
                return res.status(400).json({
                    success: false,
                    message: 'Ada tagihan belum dibayar. Harap lunasi tagihan anda.\nGunakan Force Checkout jika ingin membatalkan tagihan.',
                    unpaidInvoices: unpaidInvoices.map(inv => ({
                        id: inv.id,
                        period: `${format(inv.periodStart, 'yyyy-MM-dd')} to ${format(inv.periodEnd, 'yyyy-MM-dd')}`,
                        amountDue: parseFloat(inv.totalAmountDue),
                        amountPaid: parseFloat(inv.totalAmountPaid),
                        balance: parseFloat(inv.totalAmountDue) - parseFloat(inv.totalAmountPaid),
                        status: inv.status,
                        issueDate: format(inv.issueDate, 'yyyy-MM-dd'),
                        dueDate: format(inv.dueDate, 'yyyy-MM-dd'),
                    })),
                });
            }
        } else {
            logger.info(`Tenant ${tenant.id} has no outstanding unpaid invoices. Proceeding with checkout.`);
        }


        // 3. Change Tenant's tenancyStatus to "Inactive" and set checkoutDate
        await tenant.update(
            {
                tenancyStatus: 'Inactive',
                checkoutDate: checkoutDate, // Set the checkout date
                updateBy: req.user ? req.user.name : 'System/Admin Checkout', // Assuming req.user from auth middleware
            },
            { transaction } // Pass transaction to the update operation
        );
        logger.info(`Tenant ${tenant.id} status updated to 'Inactive'.`);

        // 4. Change related Room's status to "Tersedia"
        await room.update(
            {
                roomStatus: 'Tersedia', // This is the corrected attribute name
                priceId: null,
                updateBy: req.user ? req.user.name : 'System/Admin Checkout',
            },
            { transaction } // Pass transaction to the update operation
        );
        logger.info(`Room ${room.id} (${room.roomNumber}) roomStatus updated to 'Tersedia'.`);

        await transaction.commit(); // Commit the transaction if all operations succeed

        return res.status(200).json({
            success: true,
            message: `Tenant checkout processed successfully. ${unpaidInvoices.length > 0 && forceCheckout ? 'Outstanding invoices voided.' : 'No outstanding invoices found.'}`,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                tenancyStatus: tenant.tenancyStatus, // Will be 'Inactive'
                checkoutDate: tenant.checkoutDate,
            },
            room: {
                id: room.id,
                roomNumber: room.roomNumber,
                roomStatus: room.roomStatus, // Will be 'Tersedia'
            },
            voidedInvoicesCount: unpaidInvoices.length > 0 && forceCheckout ? unpaidInvoices.length : 0,
            // Optionally, you can return the details of voided invoices if forceCheckout was true
            // voidedInvoicesDetails: unpaidInvoices.length > 0 && forceCheckout ? unpaidInvoices.map(...) : []
        });

    } catch (error) {
        if (transaction) {
            await transaction.rollback(); // Rollback if any error occurs
        }
        logger.error(`❌ Error during tenant checkout for tenant ${tenantId}: ${error.message}`);
        logger.error(error.stack); // Log the full stack trace for debugging
        return res.status(500).json({ success: false, message: 'Failed to process tenant checkout.', error: error.message });
    }
};

exports.searchTenants = async (req, res) => {
    try {
        const { query } = req.query; // Get the search query from the URL (e.g., /api/tenants/search?query=john)

        if (!query) {
            return res.status(400).json({ success: false, message: 'Search query is required.' });
        }

        const tenants = await Tenant.findAll({
            where: {
                [Op.or]: [
                    { name: { [Op.iLike]: `%${query}%` } }, // Case-insensitive search for name
                    { phone: { [Op.iLike]: `%${query}%` } }, // Case-insensitive search for phone
                    { NIKNumber: { [Op.iLike]: `%${query}%` } } // Case-insensitive search for NIKNumber
                ]
            },
            limit: 10, // Limit the number of results for autocomplete efficiency
            order: [['name', 'ASC']] // Order results by name for consistency
        });

        res.status(200).json({
            success: true,
            message: 'Tenant query response',
            data: tenants // Send the nested data
        });
    } catch (error) {
        console.error('Error searching tenants:', error);
        res.status(500).json({
            success: false, message: 'Internal server error', error: error.message
        });
    }
};