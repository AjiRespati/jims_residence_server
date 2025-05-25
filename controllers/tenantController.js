const db = require("../models");
const sequelize = db.sequelize;
const Sequelize = db.Sequelize;
const { Op } = Sequelize;

const { Tenant, Room, Price, AdditionalPrice, OtherCost,
    Invoice, Charge, BoardingHouse
} = require('../models');
const logger = require('../config/logger');
const path = require("path");
const fs = require("fs");
const {
    subDays, addMonths, endOfMonth, isLastDayOfMonth
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
        // Extract filter parameters from query string
        const { boardingHouseId, dateFrom, dateTo } = req.query;

        // Prepare the where clause for the main Tenant query
        const tenantWhere = {};
        let isDateFilterApplied = false;

        // Add date filter if dateFrom and dateTo are provided and valid
        if (dateFrom && dateTo) {
            const fromDate = new Date(dateFrom);
            const toDate = new Date(dateTo);

            if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime())) {
                // Adjust toDate to include the entire end day
                toDate.setHours(23, 59, 59, 999);

                tenantWhere.startDate = { // 🔥 Filtering by Tenant's startDate
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
                tenantWhere.startDate = { // 🔥 Filtering by Tenant's startDate
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
                tenantWhere.startDate = { // 🔥 Filtering by Tenant's startDate
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
        const roomIncludeConfig = {
            model: Room, // Include the associated Room
            attributes: ['id', 'roomNumber', 'roomSize', 'roomStatus'],
            include: [
                {
                    model: BoardingHouse, // Include BoardingHouse nested within Room
                    attributes: ['id', 'name'],
                    where: boardingHouseWhere, // Apply where clause directly here
                    required: isBoardingHouseFilterApplied // Require BoardingHouse if filtering by it
                }
            ],
            required: isBoardingHouseFilterApplied // Require Room if filtering by BoardingHouse
        };


        // Find all tenants and include specified associated data
        const tenants = await Tenant.findAll({
            where: tenantWhere, // 🔥 Apply the date filter to the main query
            attributes: [
                'id',
                'name',
                'phone',
                'NIKNumber',
                'tenancyStatus',
                'startDate',
                'endDate',
                'dueDate',
                'banishDate',
                'createBy',
                'updateBy',
                'NIKImagePath',
                'isNIKCopyDone'
            ],
            include: [
                roomIncludeConfig, // Use the prepared Room include configuration
                {
                    model: Invoice, // Include associated Invoices
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
                            model: Charge, // Include the Charges within the outstanding Invoice
                            as: 'Charges',
                            attributes: ['id', 'name', 'amount', 'description', 'transactionType'],
                            required: false
                        }
                    ]
                }
            ]
        });

        // Flatten the response structure
        const flattenedTenants = tenants.map(tenant => {
            const tenantData = tenant.toJSON(); // Convert Sequelize instance to plain JSON object

            // Extract roomNumber and boardingHouseName from nested objects
            const roomNumber = tenantData.Room?.roomNumber || null;
            const boardingHouseName = tenantData.Room?.BoardingHouse?.name || null;

            // Add roomNumber and boardingHouseName as top-level properties
            tenantData.roomNumber = roomNumber;
            tenantData.boardingHouseName = boardingHouseName;

            // Remove the original nested Room object
            delete tenantData.Room;

            // The Invoices array (containing outstanding invoices, each with Charges) remains as a nested array.

            return tenantData;
        });

        let message = 'Tenants retrieved successfully with outstanding invoices, room number, and boarding house name';
        if (isBoardingHouseFilterApplied && isDateFilterApplied) {
            message = `Tenants retrieved successfully for Boarding House ID: ${boardingHouseId} and start date range: ${dateFrom} to ${dateTo}`;
        } else if (isBoardingHouseFilterApplied) {
            message = `Tenants retrieved successfully for Boarding House ID: ${boardingHouseId}`;
        } else if (isDateFilterApplied) {
            message = `Tenants retrieved successfully for start date range: ${dateFrom} to ${dateTo}`;
        }


        res.status(200).json({
            success: true,
            message: message,
            data: flattenedTenants // Send the flattened data
        });

    } catch (error) {
        logger.error(`❌ getAllTenants error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
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
        const roomNumber = tenantData.Room ? tenantData.Room.roomNumber : null;
        const boardingHouseName = (tenantData.Room && tenantData.Room.BoardingHouse) ? tenantData.Room.BoardingHouse.name : null;

        // Add roomNumber and boardingHouseName as top-level properties
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
            startDate, dueDate, banishDate,
            NIKImagePath, isNIKCopyDone, tenancyStatus,
            priceAmount, priceName, priceDescription, priceRoomSize,
            additionalPrices, otherCosts
        } = req.body;

        if (!roomId || !name || !phone || !NIKNumber || !startDate || !dueDate || priceAmount === undefined || priceAmount === null) {
            await t.rollback();
            return res.status(400).json({ message: 'Required fields are missing' });
        }

        if (typeof priceAmount !== 'number' || priceAmount < 0) {
            await t.rollback();
            return res.status(400).json({ message: 'priceAmount must be a non-negative number' });
        }

        const tenantStartDate = new Date(startDate);
        const invoiceDueDate = new Date(dueDate);
        let invoiceBanishDate = banishDate ? new Date(banishDate) : null;

        if (isNaN(tenantStartDate.getTime()) || isNaN(invoiceDueDate.getTime()) || (banishDate && isNaN(invoiceBanishDate.getTime()))) {
            await t.rollback();
            return res.status(400).json({ message: 'Invalid date format' });
        }

        const room = await Room.findByPk(roomId, { transaction: t });
        if (!room) {
            await t.rollback();
            return res.status(404).json({ message: 'Room not found.' });
        }

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

        await room.update({ priceId: newPrice.id, updateBy: req.user.username, roomStatus: 'Dipesan' }, { transaction: t });

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

        const firstInvoicePeriodStart = tenantStartDate;
        let firstInvoicePeriodEnd = addMonths(firstInvoicePeriodStart, 1);
        firstInvoicePeriodEnd = isLastDayOfMonth(firstInvoicePeriodStart) ? endOfMonth(firstInvoicePeriodEnd) : subDays(firstInvoicePeriodEnd, 1);

        newTenant = await Tenant.create({
            roomId, name, phone, NIKNumber,
            startDate: tenantStartDate, endDate: firstInvoicePeriodEnd, dueDate: invoiceDueDate, banishDate,
            NIKImagePath, isNIKCopyDone,
            tenancyStatus: tenancyStatus || 'Active',
            createBy: req.user.username, updateBy: req.user.username
        }, { transaction: t });

        const firstInvoice = await Invoice.create({
            tenantId: newTenant.id, roomId: room.id,
            periodStart: firstInvoicePeriodStart, periodEnd: firstInvoicePeriodEnd,
            issueDate: tenantStartDate, dueDate: invoiceDueDate, banishDate: invoiceBanishDate,
            totalAmountDue: 0, totalAmountPaid: 0,
            status: 'Issued',
            description: `Initial invoice for room ${room.roomNumber || roomId} period: ${firstInvoicePeriodStart.toISOString().split('T')[0]} to ${firstInvoicePeriodEnd.toISOString().split('T')[0]}`,
            createBy: req.user.username, updateBy: req.user.username
        }, { transaction: t });

        let chargesToCreate = [];
        let calculatedTotalAmountDue = 0;

        chargesToCreate.push({
            invoiceId: firstInvoice.id,
            name: newPrice.name, amount: newPrice.amount,
            description: newPrice.description,
            transactionType: 'debit',
            createBy: req.user.username, updateBy: req.user.username
        });
        calculatedTotalAmountDue += newPrice.amount;

        for (const ap of createdAdditionalPrices) {
            chargesToCreate.push({
                invoiceId: firstInvoice.id, name: ap.name,
                amount: ap.amount, description: ap.description,
                transactionType: 'debit',
                createBy: req.user.username, updateBy: req.user.username
            });
            calculatedTotalAmountDue += ap.amount;
        }

        for (const oc of createdOtherCosts) {
            chargesToCreate.push({
                invoiceId: firstInvoice.id, name: oc.name,
                amount: oc.amount, description: oc.description,
                transactionType: 'debit',
                createBy: req.user.username, updateBy: req.user.username
            });
            calculatedTotalAmountDue += oc.amount;
        }

        if (chargesToCreate.length > 0) {
            await Charge.bulkCreate(chargesToCreate, { transaction: t });
        }

        await firstInvoice.update({ totalAmountDue: calculatedTotalAmountDue }, { transaction: t });
        await t.commit();
    } catch (error) {
        if (t && !t.finished) {
            try {
                await t.rollback();
            } catch (rollbackError) {
                logger.error(`Rollback failed: ${rollbackError.message}`);
            }
        }
        logger.error(`❌ createTenant error: ${error.message}`);
        logger.error(error.stack);
        return res.status(500).json({ message: 'Internal server error', error: error.message });
    }

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
        res.status(200).json(tenantWithDetails);
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
        if (tenantUpdateData.priceId) {
            const price = await Price.findOne({
                where: {
                    id: tenantUpdateData.priceId,
                    // Check against the provided boardingHouseId if present, otherwise against the tenant's current one
                    boardingHouseId: tenantUpdateData.boardingHouseId || tenant.boardingHouseId
                }
                // , { transaction: t }
            });
            if (!price) {
                // await t.rollback();
                return res.status(404).json({ message: 'Provided Price not found or does not belong to the specified Boarding House' });
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