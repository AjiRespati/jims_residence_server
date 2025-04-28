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

exports.createTenant = async (req, res) => {
    // Start a transaction
    const t = await sequelize.transaction();

    try {
        const {
            roomId,
            name,
            phone,
            NIKNumber,
            startDate, // Start of tenancy / First billing period start
            dueDate, // Due date for the first invoice
            banishDate, // Optional
            endDate,
            NIKImagePath, // Optional
            isNIKCopyDone, // Optional, defaults in model
            tenancyStatus, // Optional, defaults in model
            roomStatus, // Optional, defaults in model
        } = req.body;

        // Basic validation for mandatory tenant fields
        if (!roomId || !name || !phone || !NIKNumber || !startDate || !dueDate) {
            await t.rollback(); // Rollback transaction before sending error
            return res.status(400).json({ message: 'Required tenant fields are missing: roomId, name, phone, NIKNumber, startDate, dueDate' });
        }

        // Ensure startDate and dueDate are valid dates
        const tenantStartDate = new Date(startDate);
        const invoiceDueDate = new Date(dueDate);

        if (isNaN(tenantStartDate.getTime()) || isNaN(invoiceDueDate.getTime())) {
            await t.rollback();
            return res.status(400).json({ message: 'Invalid startDate or dueDate format' });
        }


        // 1. Fetch the Room and its associated ACTIVE Price, AdditionalPrices, and OtherCosts within the transaction
        const roomWithCosts = await Room.findByPk(roomId, {
            include: [
                {
                    model: Price,
                    attributes: ['id', 'name', 'amount', 'roomSize', 'description'], // Get attributes for Charge
                    where: { status: 'active' },
                    required: true, // Require an active price
                },
                {
                    model: AdditionalPrice,
                    attributes: ['id', 'name', 'amount', 'description'], // Get attributes for Charge
                    where: { status: 'active' },
                    required: false, // Don't require additional prices
                },
                {
                    model: OtherCost,
                    attributes: ['id', 'name', 'amount', 'description'], // Get attributes for Charge
                    where: { status: 'active' },
                    required: false, // Don't require other costs
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
            startDate: tenantStartDate, // Use validated date
            dueDate: invoiceDueDate, // Tenant's contract due date / First invoice due date
            banishDate,
            endDate,
            NIKImagePath,
            isNIKCopyDone,
            tenancyStatus: tenancyStatus || 'Active',
            createBy: req.user.username,
            updateBy: req.user.username,
        }, { transaction: t }); // Include the transaction

        // 3. Create the initial Invoice record for the new tenant
        // Calculate billing period dates (e.g., one month from start date)
        const invoicePeriodEnd = new Date(tenantStartDate);
        invoicePeriodEnd.setMonth(invoicePeriodEnd.getMonth() + 1);
        invoicePeriodEnd.setDate(invoicePeriodEnd.getDate() - 1); // End date is the day before the next month starts

        const firstInvoice = await Invoice.create({
            tenantId: newTenant.id,
            roomId: roomWithCosts.id, // Link to the room
            periodStart: tenantStartDate, // Billing starts on tenancy start date
            periodEnd: invoicePeriodEnd, // Billing ends one month later
            issueDate: new Date(), // Invoice issued today
            dueDate: invoiceDueDate, // Use tenant's provided dueDate for the first bill
            totalAmountDue: 0, // Will calculate and update later
            totalAmountPaid: 0, // Initially no amount paid
            status: 'Issued', // Or 'Unpaid' depending on your flow
            description: `Initial invoice for room ${roomWithCosts.roomNumber || roomId} period: ${tenantStartDate.toISOString().split('T')[0]} to ${invoicePeriodEnd.toISOString().split('T')[0]}`, // Example description
            createBy: req.user.username,
            updateBy: req.user.username,
        }, { transaction: t }); // Include the transaction


        // 4. Prepare and create Charge records for each active cost component, linking to the Invoice
        const chargesToCreate = [];
        let calculatedTotalAmountDue = 0;

        // Charge for the main Room Price
        if (roomWithCosts.Price) {
            const priceCharge = {
                invoiceId: firstInvoice.id, // Link to the new Invoice
                name: roomWithCosts.Price.name || 'Room Price',
                amount: roomWithCosts.Price.amount,
                transactionType: 'debit',
                description: roomWithCosts.Price.description || `Base rent for ${roomWithCosts.Price.roomSize} room`,

                createBy: req.user.username,
                updateBy: req.user.username,
                // Optional: costOriginType: 'price', costOriginId: roomWithCosts.Price.id
            };
            chargesToCreate.push(priceCharge);
            calculatedTotalAmountDue += priceCharge.amount;
        }

        // Charges for Additional Prices
        if (roomWithCosts.AdditionalPrices && roomWithCosts.AdditionalPrices.length > 0) {
            roomWithCosts.AdditionalPrices.forEach(ap => {
                const additionalCharge = {
                    invoiceId: firstInvoice.id, // Link to the new Invoice
                    name: ap.name || 'Additional Cost',
                    amount: ap.amount,
                    description: ap.description || 'Additional charge details',
                    transactionType: 'debit',
                    createBy: req.user.username,
                    updateBy: req.user.username,
                    // Optional: costOriginType: 'additionalPrice', costOriginId: ap.id
                };
                chargesToCreate.push(additionalCharge);
                calculatedTotalAmountDue += additionalCharge.amount;
            });
        }

        // Charges for Other Costs
        if (roomWithCosts.OtherCosts && roomWithCosts.OtherCosts.length > 0) {
            roomWithCosts.OtherCosts.forEach(oc => {
                const otherCharge = {
                    invoiceId: firstInvoice.id, // Link to the new Invoice
                    name: oc.name || 'Other Cost',
                    amount: oc.amount,
                    description: oc.description || 'Other cost details',
                    transactionType: 'debit',
                    createBy: req.user.username,
                    updateBy: req.user.username,
                    // Optional: costOriginType: 'otherCost', costOriginId: oc.id
                };
                chargesToCreate.push(otherCharge);
                calculatedTotalAmountDue += otherCharge.amount;
            });
        }

        // Create all prepared Charge records in bulk
        const createdCharges = await Charge.bulkCreate(chargesToCreate, { transaction: t });

        // 5. Update the totalAmountDue on the Invoice record
        await firstInvoice.update({ totalAmountDue: calculatedTotalAmountDue }, { transaction: t });

        await roomWithCosts.update(
            {
                updateBy: req.user.username,
                roomStatus: roomStatus || 'Terisi'
            },
            { transaction: t }
        );

        // If all operations were successful, commit the transaction
        await t.commit();

        // 6. Fetch the newly created Tenant with their first Invoice (including Charges) for the response
        const tenantWithDetails = await Tenant.findByPk(newTenant.id, {
            include: [
                {
                    model: Room,
                    attributes: ['id', 'roomNumber', 'roomSize', 'roomStatus'],
                    include: {
                        model: BoardingHouse,
                        attributes: ['id', 'name']
                    }
                },
                {
                    model: Invoice, // Include the associated Invoices
                    // Filter to include only the first invoice created in this transaction if needed,
                    // but since it's the first and only one, including all invoices for the new tenant is fine.
                    attributes: ['id', 'periodStart', 'periodEnd', 'issueDate', 'dueDate', 'totalAmountDue', 'totalAmountPaid', 'status', 'description', 'createBy'],
                    include: [
                        {
                            model: Charge, // Include the Charges within the Invoice
                            as: 'Charges', // Use the alias defined in the Invoice model association
                            attributes: ['id', 'name', 'amount', 'description', 'transactionType', 'createBy'],
                        }
                    ]
                }
            ]
        });


        res.status(200).json(tenantWithDetails); // Return the created tenant with details and their first invoice

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

// Helper function to delete a file safely
const deleteFile = (filePath, logPrefix = 'File') => {
    const fullPath = path.join(__dirname, '..', filePath);
    // Check if the file path is valid and not just the root directory or similar safeguard
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