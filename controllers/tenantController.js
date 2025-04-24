const db = require("../models");
const sequelize = db.sequelize;
// const Sequelize = db.Sequelize;

const { Tenant, Room, Price, AdditionalPrice, OtherCost, Payment, BoardingHouse } = require('../models');
const logger = require('../config/logger');
const path = require("path");
const fs = require("fs");

exports.getAllTenants = async (req, res) => {
    try {
        // Find all tenants and include specified associated data
        // Data is fetched with includes, we will flatten it later
        const tenants = await Tenant.findAll({
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
                {
                    model: Room, // Include the associated Room
                    attributes: ['roomNumber'], // Select roomNumber to access it
                    include: [
                        {
                            model: BoardingHouse, // Include BoardingHouse nested within Room
                            attributes: ['name'] // Select name to access it
                        }
                    ],
                    required: true // Ensure only tenants with associated rooms are returned
                },
                {
                    model: Payment, // Include associated Payments
                    attributes: [
                        'id',
                        'totalAmount',
                        'transactionType',
                        'timelimit',
                        'paymentDate',
                        'paymentStatus',
                        'description',
                        'createBy',
                        'updateBy'
                    ],
                    where: {
                        paymentStatus: 'unpaid' // Filter for unpaid payments only
                    },
                    required: false // Use LEFT JOIN so tenants without unpaid payments are also included
                }
            ]
        });

        // Flatten the response structure
        const flattenedTenants = tenants.map(tenant => {
            const tenantData = tenant.toJSON(); // Convert Sequelize instance to plain JSON object

            // Extract roomNumber and boardingHouseName from nested objects
            const roomNumber = tenantData.Room ? tenantData.Room.roomNumber : null;
            const boardingHouseName = (tenantData.Room && tenantData.Room.BoardingHouse) ? tenantData.Room.BoardingHouse.name : null;

            // Add roomNumber and boardingHouseName as top-level properties
            tenantData.roomNumber = roomNumber;
            tenantData.boardingHouseName = boardingHouseName;

            // Remove the original nested Room object
            delete tenantData.Room;

            // The Payments array is already a direct property of the tenantData object,
            // so it remains in place.

            return tenantData;
        });


        res.status(200).json({
            success: true,
            message: 'Tenants retrieved successfully with unpaid payments, room number, and boarding house name',
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
                'dueDate',
                'banishDate',
                'createBy',
                'updateBy'
            ],
            include: [
                {
                    model: Room, // Include the associated Room
                    attributes: ['id', 'roomNumber', 'roomStatus', 'description'], // Select relevant Room attributes
                    include: [
                        {
                            model: BoardingHouse, // Include the associated BoardingHouse nested within Room
                            attributes: ['id', 'name', 'address'] // Select relevant BoardingHouse attributes
                        }
                    ],
                    required: false // Use LEFT JOIN in case a tenant somehow has no room associated
                },
                {
                    model: Payment, // Include ALL associated Payments for this tenant
                    attributes: [ // Select relevant Payment attributes
                        'id',
                        'totalAmount',
                        'transactionType',
                        'timelimit',
                        'paymentDate',
                        'paymentStatus',
                        'description',
                        'createBy',
                        'updateBy'
                    ],
                    required: false, // Use LEFT JOIN so tenants without payments are also included
                    order: [['createdAt', 'DESC']] // Optional: Order payments, e.g., by most recent first
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
            message: 'Tenant retrieved successfully with associated details',
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