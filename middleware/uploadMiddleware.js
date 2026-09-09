const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

// ✅ Configure multer to store image in memory buffer (instead of disk)
const storage = multer.memoryStorage();

// ✅ File filter for images and PDFs
const fileFilter = (req, file, cb) => {
    console.log("apa ini...???", file);
    if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") {
        cb(null, true);
    } else {
        cb(new Error("Only image and PDF files are allowed"), false);
    }
};

// ✅ Multer upload instance
const upload = multer({ storage, fileFilter });

// ✅ Image Compressor Middleware
const imageCompressor = async (req, res, next) => {
    const fieldFiles = req.files && !Array.isArray(req.files)
        ? Object.values(req.files).flat()
        : req.files;
    if (!req.file && !fieldFiles?.length) return next(); // Skip if no file uploaded

    const compress = async (file) => {
        const filename = `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;
        const outputPath = path.join(__dirname, '../uploads', filename);

        await sharp(file.buffer)
            .resize({ width: 800 }) // Resize to 800px width
            .jpeg({ quality: 70 }) // Compress to 70% quality
            .toFile(outputPath); // Save compressed image to 'uploads' folder

        return `/uploads/${filename}`;
    };

    // ✅ Save file as-is (no compression) — used for PDFs
    const saveRaw = (file) => {
        const ext = path.extname(file.originalname) || '';
        const filename = `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}${ext}`;
        const outputPath = path.join(__dirname, '../uploads', filename);
        fs.writeFileSync(outputPath, file.buffer);
        return `/uploads/${filename}`;
    };

    const process = (file) =>
        file.mimetype === 'application/pdf' ? saveRaw(file) : compress(file);

    try {
        if (fieldFiles?.length) {
            for (const file of fieldFiles) {
                const filePath = await process(file);
                if (file.fieldname === 'contractImage') {
                    req.contractImagePath = filePath;
                } else {
                    req.imagePath = filePath;
                }
            }
        } else if (req.file) {
            req.imagePath = await process(req.file);
        }
        next();
    } catch (error) {
        console.error("❌ Image Compression Error:", error);
        return res.status(500).json({ error: "Failed to compress image" });
    }
};

module.exports = { upload, imageCompressor };

// ✅ Delete an uploaded file from the uploads folder (safe no-op if missing)
const deleteUploadedFile = (filePath, logPrefix = 'File') => {
    if (!filePath) return;
    const fullPath = path.join(__dirname, '../uploads', path.basename(filePath));
    fs.unlink(fullPath, (err) => {
        if (err) {
            if (err.code !== 'ENOENT') {
                console.error(`❌ Error deleting ${logPrefix} (${fullPath}):`, err);
            }
        } else {
            console.log(`🗑️ Deleted ${logPrefix}: ${fullPath}`);
        }
    });
};

module.exports.deleteUploadedFile = deleteUploadedFile;
