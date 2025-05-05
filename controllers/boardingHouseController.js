const db = require("../models");
const sequelize = db.sequelize;
// const Sequelize = db.Sequelize;
// const { Op } = Sequelize;

const { BoardingHouse, Room } = require('../models');
const logger = require('../config/logger');

exports.getAllBoardingHouses = async (req, res) => {
    try {
        // Fetch all boarding houses and include aggregated room counts
        const data = await BoardingHouse.findAll({
            attributes: [
                'id',
                'name',
                'address',
                'description',
                'createdAt',
                'updatedAt',
                // Add aggregated counts of associated Rooms
                [
                    sequelize.fn('COUNT', sequelize.col('Rooms.id')),
                    'totalRoomsCount' // Alias for the total count
                ],
                [
                    // Count rooms where roomStatus is 'Tersedia'
                    sequelize.fn('COUNT', sequelize.literal('CASE WHEN "Rooms"."roomStatus" = \'Tersedia\' THEN "Rooms"."id" ELSE NULL END')),
                    'availableRoomsCount' // Alias for the 'Tersedia' count
                ],
                [
                    // Count rooms where roomStatus is 'Terisi'
                    sequelize.fn('COUNT', sequelize.literal('CASE WHEN "Rooms"."roomStatus" = \'Terisi\' THEN "Rooms"."id" ELSE NULL END')),
                    'occupiedRoomsCount' // Alias for the 'Terisi' count
                ]
            ],
            include: [
                {
                    model: Room, // Include the associated Rooms
                    attributes: [], // We don't need Room attributes in the final output, just its ID for counting
                    required: false // Use LEFT JOIN to include boarding houses even if they have no rooms
                }
            ],
            group: ['BoardingHouse.id'], // Group the results by boarding house ID to get counts per boarding house
            order: [["createdAt", "DESC"]] // Order the boarding houses
        });

        // The result 'data' will be an array of BoardingHouse objects,
        // each with the added 'totalRoomsCount', 'availableRoomsCount', and 'occupiedRoomsCount' attributes.

        res.status(200).json({
            success: true,
            message: 'Boarding houses retrieved successfully with room counts',
            data: data
        });

    } catch (error) {
        logger.error(`❌ getAllBoardingHouses error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.getBoardingHouseById = async (req, res) => {
    try {
        const data = await BoardingHouse.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'BoardingHouse not found' });
        res.json(data);
    } catch (error) {
        logger.error(`❌ getBoardingHouseById error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.createBoardingHouse = async (req, res) => {
    try {
        const data = await BoardingHouse.create(req.body);
        res.status(200).json(data);
    } catch (error) {
        logger.error(`❌ createBoardingHouse error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: error.message });
    }
};

exports.updateBoardingHouse = async (req, res) => {
    try {
        const data = await BoardingHouse.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'BoardingHouse not found' });

        await data.update(req.body);
        res.json(data);
    } catch (error) {
        logger.error(`❌ updateBoardingHouse = async (req, res) => {
            error: ${error.message}`);
        logger.error(error.stack);
        res.status(400).json({ error: 'Bad Request' });
    }
};

exports.deleteBoardingHouse = async (req, res) => {
    try {
        const data = await BoardingHouse.findByPk(req.params.id);
        if (!data) return res.status(404).json({ error: 'BoardingHouse not found' });

        await data.destroy();
        res.json({ message: 'BoardingHouse deleted successfully' });
    } catch (error) {
        logger.error(`❌ deleteBoardingHouse error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};