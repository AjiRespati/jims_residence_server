const { BoardingHouse, Price, Room, AdditionalPrice, OtherCost, Tenant, } = require('../models');
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
                    required: false // Use false (LEFT JOIN) so rooms without active tenants are also included
                }

            ]
        });

        // The fetched room objects now directly contain the included BoardingHouse and Price objects
        res.status(200).json({            
            success: true,
            message: 'Rooms retrieved successfully with latest active tenant',
            data: rooms
        });

    } catch (error) {
        logger.error(`❌ getAllRooms error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getRoomById = async (req, res) => {
    try {
        const { id } = req.params;

        // Find room with related AdditionalPrice, OtherCost, and latest Tenant
        const room = await Room.findByPk(id, {
            include: [
                {
                    model: AdditionalPrice,
                    as: 'AdditionalPrices',
                },
                {
                    model: OtherCost,
                    as: 'OtherCosts',
                },
                {
                    model: Tenant,
                    as: 'Tenants',
                    order: [['createdAt', 'DESC']],
                    limit: 1,
                }
            ]
        });

        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        // Calculate total price
        const basicPrice = room.basicPrice || 0;
        const additionalPriceTotal = room.AdditionalPrices.reduce((sum, item) => sum + item.amount, 0);
        const otherCostTotal = room.OtherCosts.reduce((sum, item) => sum + item.amount, 0);
        const totalPrice = basicPrice + additionalPriceTotal + otherCostTotal;

        // Get the latest tenant if available
        const latestTenant = room.Tenants.length > 0 ? room.Tenants[0] : null;

        let response = {
            ...room.get({ plain: true }),
            totalPrice,
            latestTenant,
        }

        const { Tenants, ...newResponse } = response

        res.json(newResponse);
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
    try {
        const data = await Room.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'room not found' });

        await data.update(req.body);

        // Find room with related AdditionalPrice, OtherCost, and latest Tenant
        const room = await Room.findByPk(req.params.id, {
            include: [
                {
                    model: AdditionalPrice,
                    as: 'AdditionalPrices',
                },
                {
                    model: OtherCost,
                    as: 'OtherCosts',
                },
                {
                    model: Tenant,
                    as: 'Tenants',
                    order: [['createdAt', 'DESC']],
                    limit: 1,
                }
            ]
        });

        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        // Calculate total price
        const basicPrice = room.basicPrice || 0;
        const additionalPriceTotal = room.AdditionalPrices.reduce((sum, item) => sum + item.amount, 0);
        const otherCostTotal = room.OtherCosts.reduce((sum, item) => sum + item.amount, 0);
        const totalPrice = basicPrice + additionalPriceTotal + otherCostTotal;

        // Get the latest tenant if available
        const latestTenant = room.Tenants.length > 0 ? room.Tenants[0] : null;

        res.json({
            ...room.get({ plain: true }),
            totalPrice,
            latestTenant,
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