const db = require("../models");
const sequelize = db.sequelize;
const Sequelize = db.Sequelize;
const { Op } = Sequelize;

const { BoardingHouse, Price, Room, Tenant, Payment, AdditionalPrice, OtherCost } = require('../models');
const logger = require('../config/logger');

exports.getAllRooms = async (req, res) => {
    try {
        // Extract filter parameters from query string
        const { boardingHouseId, dateFrom, dateTo } = req.query;

        // Prepare the where clause for the main Room query
        const roomWhere = {};
        let isDateFilterApplied = false;

        // Add date filter if dateFrom and dateTo are provided and valid
        if (dateFrom && dateTo) {
            const fromDate = new Date(dateFrom);
            const toDate = new Date(dateTo);

            if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime())) {
                // Adjust toDate to include the entire end day
                toDate.setHours(23, 59, 59, 999);

                roomWhere.createdAt = {
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
                roomWhere.createdAt = {
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
                roomWhere.createdAt = {
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

        // Define the BoardingHouse include configuration
        const boardingHouseIncludeConfig = {
            model: BoardingHouse, // Include BoardingHouse nested within Room
            attributes: ['id', 'name', 'address'], // Include relevant attributes
            where: boardingHouseWhere, // Apply where clause directly here
            required: isBoardingHouseFilterApplied // Require BoardingHouse if filtering by it
        };

        // Find all rooms and include the associated BoardingHouse, Price,
        // and ONLY Active AdditionalPrice and OtherCost records
        // Apply the filter for BoardingHouse by making the BoardingHouse include required
        const rooms = await Room.findAll({
            where: roomWhere, // 🔥 Apply the date filter to the main query
            include: [
                boardingHouseIncludeConfig, // Use the prepared BoardingHouse include configuration
                {
                    model: Price,
                    attributes: ['id', 'roomSize', 'amount', 'name', 'description'] // Still fetch Price to get amount and roomSize
                },
                {
                    model: Tenant,
                    as: 'Tenants',
                    where: { tenancyStatus: 'Active' },
                    order: [['startDate', 'DESC'], ['createdAt', 'DESC']],
                    limit: 1,
                    required: false,
                    // include: [{ model: Payment, attributes: ['id', 'totalAmount', 'paymentDate', 'paymentStatus', 'description'] }] // Payments are handled via Tenant -> Invoice -> Transaction
                },
                {
                    model: AdditionalPrice, // Include ONLY Active AdditionalPrice records for calculation
                    attributes: ['amount'], // Only need the amount for calculation
                    where: { status: 'active' },
                    required: false // Use LEFT JOIN
                },
                {
                    model: OtherCost, // Include ONLY Active OtherCost records for calculation
                    attributes: ['amount'], // Only need the amount for calculation
                    where: { status: 'active' },
                    required: false // Use LEFT JOIN
                }
            ],
            order: [['roomNumber', 'ASC']], // Default order
            // The boardingHouseId filter is applied via the 'required' include and its where clause
        });

        const formattedRooms = rooms.map(room => {
            const roomData = room.toJSON(); // Get plain JSON object

            let totalPrice = 0;
            let roomSize = null;

            // 1. Add Price amount and get roomSize
            if (roomData.Price) {
                totalPrice += roomData.Price.amount;
                roomSize = roomData.Price.roomSize; // Get roomSize from Price
                delete roomData.Price; // Remove the Price object from the final response
            }

            // 2. Add sum of Active AdditionalPrice amounts
            if (roomData.AdditionalPrices && roomData.AdditionalPrices.length > 0) {
                const additionalPriceTotal = roomData.AdditionalPrices.reduce((sum, ap) => sum + ap.amount, 0);
                totalPrice += additionalPriceTotal;
                delete roomData.AdditionalPrices; // Remove the AdditionalPrices array from the final response
            } else {
                delete roomData.AdditionalPrices; // Remove the AdditionalPrices array if empty
            }

            // 3. Add sum of Active OtherCost amounts
            if (roomData.OtherCosts && roomData.OtherCosts.length > 0) {
                const otherCostTotal = roomData.OtherCosts.reduce((sum, oc) => sum + oc.amount, 0);
                totalPrice += otherCostTotal;
                delete roomData.OtherCosts; // Remove the OtherCosts array from the final response
            } else {
                delete roomData.OtherCosts; // Remove the OtherCosts array if empty
            }


            // Handle latestTenant formatting (kept from previous version)
            if (roomData.Tenants && roomData.Tenants.length > 0) {
                roomData.latestTenant = roomData.Tenants[0];
                delete roomData.Tenants;
            } else {
                roomData.latestTenant = null;
                delete roomData.Tenants;
            }

            // Add roomSize and calculated totalPrice to the room data
            roomData.roomSize = roomSize;
            roomData.totalPrice = totalPrice;

            return roomData;
        });

        let message = 'Rooms retrieved successfully with calculated total price';
        if (isBoardingHouseFilterApplied && isDateFilterApplied) {
            message = `Rooms retrieved successfully for Boarding House ID: ${boardingHouseId} and date range: ${dateFrom} to ${dateTo}`;
        } else if (isBoardingHouseFilterApplied) {
            message = `Rooms retrieved successfully for Boarding House ID: ${boardingHouseId}`;
        } else if (isDateFilterApplied) {
            message = `Rooms retrieved successfully for date range: ${dateFrom} to ${dateTo}`;
        }


        res.status(200).json({
            success: true,
            message: message,
            data: formattedRooms
        });

    } catch (error) {
        logger.error(`❌ getAllRooms error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Method to get a single room by its ID with associations
exports.getRoomById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Room ID is required',
                data: null
            });
        }

        // Find the room by primary key and include most specified associated models
        // Include the latest active Tenant, but NOT their payments
        const room = await Room.findByPk(id, {
            include: [
                {
                    model: BoardingHouse,
                    attributes: ['id', 'name', 'address', 'description']
                },
                {
                    model: Price,
                    attributes: ['id', 'roomSize', 'amount', 'name', 'description', 'status'] // Keep Price object for response
                },
                {
                    model: Tenant, // Include associated Tenants
                    as: 'Tenants', // Use the alias defined in the association
                    where: {
                        tenancyStatus: 'Active' // Filter for active tenants
                    },
                    order: [
                        ['startDate', 'DESC'], // Order to get the latest active tenant first
                        ['createdAt', 'DESC']
                    ],
                    limit: 1, // Still limit to only the latest active tenant here
                    required: false, // Use false (LEFT JOIN) so rooms without active tenants are still included
                    // *** Payments include removed from here ***
                },
                {
                    model: AdditionalPrice, // Include ONLY Active AdditionalPrice records
                    attributes: ['id', 'amount', 'name', 'description', 'status', 'createBy', 'updateBy'],
                    where: { status: 'active' },
                    required: false,
                    order: [['createdAt', 'ASC']]
                },
                {
                    model: OtherCost, // Include ONLY Active OtherCost records
                    attributes: ['id', 'amount', 'name', 'description', 'status', 'createBy', 'updateBy'],
                    where: { status: 'active' },
                    required: false,
                    order: [['createdAt', 'ASC']]
                }
                // RoomHistory is intentionally excluded
            ]
        });

        // Check if the room was found
        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found',
                data: null
            });
        }

        const roomData = room.toJSON();

        // Process the Tenants array to get the single latestTenant object
        // The nested Payments are NOT fetched here anymore
        let latestTenant = null;
        if (roomData.Tenants && roomData.Tenants.length > 0) {
            latestTenant = roomData.Tenants[0];
            delete roomData.Tenants; // Remove the original array
        } else {
            delete roomData.Tenants; // Remove the original array if empty
        }

        // Attach the latestTenant object (without Payments) to the room data
        roomData.latestTenant = latestTenant;


        // Calculate totalPrice based on fetched active costs (Price, AdditionalPrices, OtherCosts)
        let totalPrice = 0;

        // 1. Add Price amount
        if (roomData.Price) {
            totalPrice += roomData.Price.amount;
            // Keep Price object in roomData for getRoomById response
        }

        // 2. Add sum of Active AdditionalPrice amounts
        if (roomData.AdditionalPrices && roomData.AdditionalPrices.length > 0) {
            const additionalPriceTotal = roomData.AdditionalPrices.reduce((sum, ap) => sum + ap.amount, 0);
            totalPrice += additionalPriceTotal;
            // Keep AdditionalPrices array in roomData
        }

        // 3. Add sum of Active OtherCost amounts
        if (roomData.OtherCosts && roomData.OtherCosts.length > 0) {
            const otherCostTotal = roomData.OtherCosts.reduce((sum, oc) => sum + oc.amount, 0);
            totalPrice += otherCostTotal;
            // Keep OtherCosts array in roomData
        }

        // Add calculated totalPrice to the room data
        roomData.totalPrice = totalPrice;


        res.status(200).json({
            success: true,
            message: 'Room retrieved successfully with specified details and calculated total price (excluding tenant payments)',
            data: roomData
        });

    } catch (error) {
        logger.error(`❌ getRoomById error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.createRoom = async (req, res) => {
    try {

        const { boardingHouseId, priceId, roomNumber, roomSize, roomStatus, description } = req.body;

        // Basic validation - now includes priceId
        if (!boardingHouseId || !priceId || !roomNumber || !roomSize || !roomStatus) {
            return res.status(400).json({ message: 'Required fields are missing: boardingHouseId, priceId, roomNumber, roomSize, roomStatus' });
        }

        // Check if the boarding house exists
        const boardingHouse = await BoardingHouse.findByPk(boardingHouseId);
        if (!boardingHouse) {
            return res.status(404).json({ message: 'Boarding House not found' });
        }

        // Check if the price exists and belongs to the correct boarding house
        const price = await Price.findOne({
            where: {
                id: priceId,
                boardingHouseId: boardingHouseId // Ensure the price belongs to the specified boarding house
            }
        });
        if (!price) {
            return res.status(404).json({ message: 'Price not found or does not belong to the specified Boarding House' });
        }

        // Note: roomSize is now redundant in the Room model if priceId fully determines it.
        // However, your model still includes it. We'll create the room with the provided size,
        // but ideally, the frontend/logic should ensure roomSize matches the price's roomSize.
        // For this controller, we'll proceed as is but keep the potential inconsistency in mind.

        // Create the room using boardingHouseId and priceId
        const newRoom = await Room.create({
            boardingHouseId,
            priceId, // Use the provided priceId
            roomNumber,
            roomSize: price.roomSize, // Still includes roomSize based on your model
            roomStatus,
            description,
            createBy: req.user.username
        });

        // Fetch the newly created room with its associations for the response
        const createdRoomWithAssociations = await Room.findByPk(newRoom.id, {
            include: [
                {
                    model: BoardingHouse,
                    attributes: ['id', 'name', 'address']
                },
                {
                    model: Price,
                    attributes: ['id', 'roomSize', 'amount', 'name', 'description']
                }
            ]
        });


        // Return the created room object which now includes BoardingHouse and Price
        // The previous requirement was to send room, BoardingHouse, and Price separately.
        // With the new relation, including them directly in the room object is cleaner.
        // We will return the created room object which has the included associations.
        res.status(200).json(createdRoomWithAssociations);

    } catch (error) {
        console.error('Error creating room:', error);
        logger.error(`❌ createRoom error: ${error.message}`);
        logger.error(error.stack);

        // Handle Sequelize validation errors specifically
        if (error.name === 'SequelizeValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Validation error creating room',
                error: error.errors.map(err => err.message)
            });
        }
        // Handle other potential errors
        res.status(500).json({
            success: false,
            message: 'Error creating room',
            error: error.message
        });
    }
};

exports.updateRoom = async (req, res) => {
    // Start a transaction
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { additionalPrices, otherCosts, ...roomUpdateData } = req.body;

        if (!id) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: 'Room ID is required',
                data: null
            });
        }

        const room = await Room.findByPk(id, { transaction: t });

        if (!room) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: 'Room not found',
                data: null
            });
        }

        // Optional: Basic validation for incoming boardingHouseId or priceId if they are being updated
        if (roomUpdateData.boardingHouseId) {
            const boardingHouse = await BoardingHouse.findByPk(roomUpdateData.boardingHouseId, { transaction: t });
            if (!boardingHouse) {
                await t.rollback();
                return res.status(404).json({ message: 'Provided Boarding House not found' });
            }
        }
        if (roomUpdateData.priceId) {
            const price = await Price.findOne({
                where: {
                    id: roomUpdateData.priceId,
                    boardingHouseId: roomUpdateData.boardingHouseId || room.boardingHouseId
                },
                transaction: t
            });
            if (!price) {
                await t.rollback();
                return res.status(404).json({ message: 'Provided Price not found or does not belong to the specified Boarding House' });
            }
        }

        const validRoomUpdateFields = ['boardingHouseId', 'priceId', 'roomNumber', 'roomStatus', 'description', 'updateBy'];
        const roomFieldsToUpdate = {};
        validRoomUpdateFields.forEach(field => {
            if (roomUpdateData[field] !== undefined) {
                roomFieldsToUpdate[field] = roomUpdateData[field];
            }
        });

        // 2. Update the Room record (only if there are fields to update)
        if (Object.keys(roomFieldsToUpdate).length > 0) {
            await room.update(roomFieldsToUpdate, { transaction: t });
        }

        // 3. Handle AdditionalPrice records (Update existing to inactive and Create new ones if array is provided)
        if (additionalPrices !== undefined) { // Check if the additionalPrices array is present in the body
            // Update all existing active AdditionalPrice records for this room to 'inactive'
            await AdditionalPrice.update(
                { status: 'inactive', updateBy: roomFieldsToUpdate.updateBy || 'System' },
                { where: { roomId: room.id, status: 'active' }, transaction: t }
            );

            // If the incoming array is not empty, create new 'active' records
            if (Array.isArray(additionalPrices) && additionalPrices.length > 0) {
                const additionalPriceData = additionalPrices.map(ap => ({
                    amount: ap.amount,
                    name: ap.name || 'Unnamed Additional Price',
                    description: ap.description,
                    status: 'active', // Set status to active for new items
                    createBy: req.user.username,
                    updateBy: req.user.username,
                    roomId: room.id,
                }));
                await AdditionalPrice.bulkCreate(additionalPriceData, { transaction: t });
            }
        }

        // 4. Handle OtherCost records (Update existing to inactive and Create new ones if array is provided)
        if (otherCosts !== undefined) { // Check if the otherCosts array is present in the body
            // Update all existing active OtherCost records for this room to 'inactive'
            await OtherCost.update(
                { status: 'inactive', updateBy: roomFieldsToUpdate.updateBy || 'System' },
                { where: { roomId: room.id, status: 'active' }, transaction: t }
            );

            // If the incoming array is not empty, create new 'active' records
            if (Array.isArray(otherCosts) && otherCosts.length > 0) {
                const otherCostData = otherCosts.map(oc => ({
                    amount: oc.amount,
                    name: oc.name || 'Unnamed Other Cost',
                    description: oc.description,
                    status: 'active', // Set status to active for new items
                    createBy: req.user.username,
                    updateBy: req.user.username,
                    roomId: room.id,
                }));
                await OtherCost.bulkCreate(otherCostData, { transaction: t });
            }
        }


        // If all operations succeeded, commit the transaction
        await t.commit();

        // 5. Fetch the updated room with its primary associations AND the NEWLY ACTIVE lists for confirmation
        const updatedRoom = await Room.findByPk(room.id, {
            include: [
                { model: BoardingHouse, attributes: ['id', 'name', 'address'] },
                { model: Price, attributes: ['id', 'roomSize', 'amount', 'name', 'description'] },
                {
                    model: AdditionalPrice,
                    attributes: ['id', 'amount', 'name', 'description', 'status', 'createBy'],
                    where: { status: 'active' }, // Fetch only active ones for the response
                    required: false // Use LEFT JOIN
                },
                {
                    model: OtherCost,
                    attributes: ['id', 'amount', 'name', 'description', 'status', 'createBy'],
                    where: { status: 'active' }, // Fetch only active ones for the response
                    required: false // Use LEFT JOIN
                }
            ]
        });


        res.status(200).json({
            success: true,
            message: 'Room and associated details updated successfully (status updated for old items)',
            data: updatedRoom
        });

    } catch (error) {
        logger.error(`❌ updateRoom error: ${error.message}`);
        logger.error(error.stack);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.deleteRoom = async (req, res) => {
    try {
        const data = await Room.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'room not found' });

        await data.destroy();
        res.json({ message: 'room deleted successfully' });
    } catch (error) {
        logger.error(`❌ deleteRoom error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};