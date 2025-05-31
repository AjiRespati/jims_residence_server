const express = require('express');
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { upload, imageCompressor } = require("../middleware/uploadMiddleware");

const {
    getAllTenants,
    getTenantById,
    createTenant,
    updateTenant,
    deleteTenant,
    tenantCheckout
} = require('../controllers/tenantController');

router.get('/', authMiddleware, getAllTenants);
router.get('/:id', authMiddleware, getTenantById);
router.post('/', authMiddleware, createTenant);
router.put("/:id", authMiddleware, upload.single("image"), imageCompressor, updateTenant);
router.delete('/:id', authMiddleware, deleteTenant);
router.post('/:id/checkout', authMiddleware, tenantCheckout);

module.exports = router;