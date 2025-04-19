const { BoardingHouse, Price, Room, AdditionalPrice, OtherCost, Tenant, } = require('../models');
const logger = require('../config/logger');

exports.getAllRooms = async (req, res) => {
    try {
        const { kostId } = req.params;
        let whereClause = {}
        if (kostId) whereClause['id'] = kostId;

        const rooms = await Room.findAll({
            include: [
                {
                    model: BoardingHouse, // Include the associated BoardingHouse
                    where: whereClause,
                    attributes: ['id', 'name', 'address']
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

        // Optional post-processing: Format the tenants array to just the single latest tenant object
        // The `limit: 1` in the include *should* handle this, but let's ensure the structure is clean.
        const formattedRooms = rooms.map(room => {
            const roomData = room.toJSON(); // Get plain JSON object

            // Check if tenants were included and if there's at least one (the latest active one)
            if (roomData.Tenants && roomData.Tenants.length > 0) {
                // Replace the Tenants array with the single latest tenant object
                roomData.latestActiveTenant = roomData.Tenants[0];
                delete roomData.Tenants; // Remove the original array key
            } else {
                // If no active tenants, set latestActiveTenant to null
                roomData.latestActiveTenant = null;
                delete roomData.Tenants; // Remove the original array key
            }

            // flattened BoardingHouse
            roomData.boardingHouseName = roomData.BoardingHouse.name;
            delete roomData.BoardingHouse;

            return roomData;
        });

        if (!formattedRooms || formattedRooms.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No rooms found'
            });
        }

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
        const {
            boardingHouseId,
            roomNumber,
            roomSize, // Optional, defaults to 'Standard'
            roomStatus,
            description, // Optional
        } = req.body;

        // Basic validation
        if (!boardingHouseId || !roomNumber || !roomStatus) {
            return res.status(400).json({
                success: false,
                message: 'Required fields (boardingHouseId, priceId, roomNumber, roomStatus) are missing.'
            });
        }

        // You might want to validate if the boardingHouseId exists
        const boardingHouseExists = await BoardingHouse.findByPk(boardingHouseId);
        if (!boardingHouseExists) {
            return res.status(404).json({
                success: false,
                message: `Boarding House with ID ${boardingHouseId} not found.`
            });
        }


        // Create the room
        const newRoom = await Room.create({
            boardingHouseId,
            priceId,
            roomNumber,
            roomSize, // Use provided value or let model default handle it if not provided
            roomStatus,
            description,
            createBy: req.user.username
            // Timestamps (createdAt, updatedAt) are handled automatically by Sequelize
        });

        // Optionally fetch the associated Boarding House for the response
        const roomWithBoardingHouse = await Room.findByPk(newRoom.id, {
            include: [
                {
                    model: BoardingHouse,
                    attributes: ['id', 'name', 'address']
                }
            ],
            include: [
                {
                    model: Price,
                    attributes: ['id', 'name', 'amount']
                }
            ],
        });


        res.status(200).json({
            success: true,
            message: 'Room created successfully',
            data: roomWithBoardingHouse // Respond with the created room including association
        });

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