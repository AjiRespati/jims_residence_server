const express = require('express');
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const {
    getAllTenants,
    getTenantById,
    createTenant,
    updateTenant,
    deleteTenant
} = require('../controllers/tenantController');

router.get('/', authMiddleware, getAllTenants);
router.get('/:id', authMiddleware, getTenantById);
router.post('/', authMiddleware, createTenant);
router.put('/:id', authMiddleware, updateTenant);
router.delete('/:id', authMiddleware, deleteTenant);

module.exports = router;