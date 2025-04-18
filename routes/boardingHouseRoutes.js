const express = require('express');
const router = express.Router();
const {
    getAllBoardingHouses,
    getBoardingHouseById,
    createBoardingHouse,
    updateBoardingHouse,
    deleteBoardingHouse
} = require('../controllers/boardingHouseController');

router.get('/', getAllBoardingHouses);
router.get('/:id', getBoardingHouseById);
router.post('/', createBoardingHouse);
router.put('/:id', updateBoardingHouse);
router.delete('/:id', deleteBoardingHouse);

module.exports = router;