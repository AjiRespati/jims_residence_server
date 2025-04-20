const db = require("../models");
const sequelize = db.sequelize;
// const Sequelize = db.Sequelize;

const { BoardingHouse, Price, Room, Tenant, Payment, AdditionalPrice, OtherCost } = require('../models');
const logger = require('../config/logger');

exports.getAllRooms = async (req, res) => {
    try {
        const { kostId } = req.params;
        let whereClause = {}
        if (kostId) whereClause['id'] = kostId;

        // Find all rooms and include the associated BoardingHouse and Price directly
        const rooms = await Room.findAll({
            include: [
                {
                    model: BoardingHouse,
                    where: whereClause,
                    attributes: ['id', 'name', 'address'] // Specify attributes for BoardingHouse
                },
                {
                    model: Price,
                    attributes: ['id', 'roomSize', 'amount', 'name', 'description'] // Specify attributes for Price
                },
                {
                    model: Tenant, // Include associated Tenants
                    as: 'Tenants', // Use the alias defined in the association (if any, usually the plural name)
                    where: {
                        tenancyStatus: 'Active' // Filter for active tenants
                    },
                    order: [
                        // Order tenants by a date field descending to get the latest first
                        // Assuming 'startDate' or 'createdAt' indicates the start/creation date
                        ['startDate', 'DESC'], // Or use ['createdAt', 'DESC'] depending on which is the "latest" indicator
                        ['createdAt', 'DESC'] // Fallback order
                    ],
                    limit: 1, // Limit to 1 tenant per room after ordering (this is important for performance and getting "a" latest one)
                    required: false, // Use false (LEFT JOIN) so rooms without active tenants are also included
                    include: [
                        {
                            model: Payment,
                            attributes: ['id', 'totalAmount', 'paymentDate', 'paymentStatus', 'description'] // Specify attributes for Price

                        }
                    ]
                }

            ]
        });

        const formattedRooms = rooms.map(room => {
            const roomData = room.toJSON(); // Get plain JSON object

            // Check if tenants were included and if there's at least one (the latest active one)
            if (roomData.Tenants && roomData.Tenants.length > 0) {
                // Replace the Tenants array with the single latest tenant object
                roomData.latestTenant = roomData.Tenants[0];
                delete roomData.Tenants; // Remove the original array key
            } else {
                // If no active tenants, set latestActiveTenant to null
                roomData.latestTenant = null;
                delete roomData.Tenants; // Remove the original array key
            }

            return roomData;
        });


        // The fetched room objects now directly contain the included BoardingHouse and Price objects
        res.status(200).json({
            success: true,
            message: 'Rooms retrieved successfully with latest active tenant',
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

        // Find the room by primary key and include the specified associated models
        const room = await Room.findByPk(id, {
            include: [
                {
                    model: BoardingHouse,
                    attributes: ['id', 'name', 'address', 'description'] // Include relevant BH attributes
                },
                {
                    model: Price,
                    attributes: ['id', 'roomSize', 'amount', 'name', 'description', 'status'] // Include relevant Price attributes
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
                    limit: 1, // Limit to only the latest active tenant
                    required: false, // Use false (LEFT JOIN) so rooms without active tenants are still included
                    include: [
                        {
                            model: Payment, // Include Payments for the latest active tenant
                            attributes: ['id', 'totalAmount', 'paymentDate', 'paymentStatus', 'description', 'transactionType', 'transactionImagePath'] // Include relevant Payment attributes
                            // You could include RoomPrice, AdditionalPrice, OtherCost nested here if needed from the Payment perspective
                        }
                    ]
                },
                {
                    model: AdditionalPrice, // Include ALL AdditionalPrice records for this room
                    attributes: ['id', 'amount', 'name', 'description', 'status', 'createBy', 'updateBy'], // Include relevant attributes
                    order: [['createdAt', 'ASC']] // Example order
                },
                {
                    model: OtherCost, // Include ALL OtherCost records for this room
                    attributes: ['id', 'amount', 'name', 'description', 'status', 'createBy', 'updateBy'], // Include relevant attributes
                    order: [['createdAt', 'ASC']] // Example order
                }
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

        if (roomData.Tenants && roomData.Tenants.length > 0) {
            roomData.latestTenant = roomData.Tenants[0];
            delete roomData.Tenants;
        } else {
            roomData.latestTenant = null;
            delete roomData.Tenants;
        }

        res.status(200).json({
            success: true,
            message: 'Room retrieved successfully with specified details',
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
            // roomSize, // Still includes roomSize based on your model
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
        const { id } = req.params; // Room ID from URL
        const { additionalPrices, otherCosts, ...roomUpdateData } = req.body; // Extract related data and room update data

        // Validate if ID is provided
        if (!id) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: 'Room ID is required',
                data: null
            });
        }

        // 1. Find the room to update within the transaction
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
                    // Optional: Check if the price belongs to the CURRENT or NEW boarding house
                    // depending on your business logic. Here we check against the provided boardingHouseId if present,
                    // otherwise against the room's current boardingHouseId.
                    boardingHouseId: roomUpdateData.boardingHouseId || room.boardingHouseId
                },
                transaction: t
            });
            if (!price) {
                await t.rollback();
                return res.status(404).json({ message: 'Provided Price not found or does not belong to the specified Boarding House' });
            }
        }


        // Filter req.body to get only valid Room attributes for update
        const validRoomUpdateFields = ['boardingHouseId', 'priceId', 'roomNumber', 'roomStatus', 'description', 'updateBy'];
        const roomFieldsToUpdate = {};
        validRoomUpdateFields.forEach(field => {
            if (roomUpdateData[field] !== undefined) {
                roomFieldsToUpdate[field] = roomUpdateData[field];
            }
        });


        // 2. Update the Room record
        await room.update(roomFieldsToUpdate, { transaction: t });

        // 3. Create new AdditionalPrice records if provided
        if (additionalPrices && Array.isArray(additionalPrices) && additionalPrices.length > 0) {
            const additionalPriceData = additionalPrices.map(ap => ({
                ...ap, // Copy properties from the request object
                roomId: room.id, // Link to the updated room
                // Ensure required fields for AdditionalPrice are present in 'ap' or default them
                amount: ap.amount, // Assuming amount is mandatory and present
                name: ap.name || 'Unnamed Additional Price', // Assuming name is mandatory or defaults
                status: ap.status || 'active', // Default status if not provided
                // createBy and updateBy should ideally come from the request context (e.g., authenticated user)
                createBy:  req.user.username || 'System',
                updateBy:  req.user.username || 'System',
            }));
            // Use bulkCreate for efficiency
            await AdditionalPrice.bulkCreate(additionalPriceData, { transaction: t });
        }

        // 4. Create new OtherCost records if provided
        if (otherCosts && Array.isArray(otherCosts) && otherCosts.length > 0) {
            const otherCostData = otherCosts.map(oc => ({
                ...oc, // Copy properties from the request object
                roomId: room.id, // Link to the updated room
                // Ensure required fields for OtherCost are present in 'oc' or default them
                amount: oc.amount, // Assuming amount is mandatory and present
                name: oc.name || 'Unnamed Other Cost', // Assuming name is mandatory or defaults
                status: oc.status || 'active', // Default status if not provided
                // createBy and updateBy should ideally come from the request context
                createBy:  req.user.username || 'System',
                updateBy:  req.user.username|| 'System',
            }));
            // Use bulkCreate for efficiency
            await OtherCost.bulkCreate(otherCostData, { transaction: t });
        }


        // If all operations succeeded, commit the transaction
        await t.commit();

        // 5. Fetch the updated room with its primary associations for the response
        const updatedRoom = await Room.findByPk(room.id, {
            include: [
                { model: BoardingHouse, attributes: ['id', 'name', 'address'] },
                { model: Price, attributes: ['id', 'roomSize', 'amount', 'name', 'description'] }
                // We don't include AdditionalPrice or OtherCost here to keep the response lean,
                // but you can add them if needed. The user can call getRoomById to get everything.
            ]
        });


        res.status(200).json({
            success: true,
            message: 'Room updated and related records created successfully',
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