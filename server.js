require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const logger = require("./config/logger");
const { sequelize } = require("./models");
const { startBillingTask } = require('./tasks/billingTasks'); // Adjust the path

const app = express();

//TODO: VERSIONING
const version = "1.1.0+1";

// ✅ Middlewares
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(morgan("combined", { stream: { write: (message) => logger.info(message.trim()) } }));

// ✅ Routes
const additionalPriceRoutes = require("./routes/additionalPriceRoutes");
const authRoutes = require("./routes/authRoutes");
const boardingHouseRoutes = require("./routes/boardingHouseRoutes");
const otherCostRoutes = require("./routes/otherCostRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const roomHistoryRoutes = require("./routes/roomHistoryRoutes");
const roomPriceRoutes = require("./routes/roomPriceRoutes");
const roomRoutes = require("./routes/roomRoutes");
const priceRoutes = require("./routes/priceRoutes");
const tenantRoutes = require("./routes/tenantRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const userRoutes = require("./routes/userRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const reportRoutes = require("./routes/reportRoutes");

const base = "/service";

app.get(`${base}/`, (req, res) => {
    res.status(200).json({ message: `✅ Residenza ${version} Service API is running!` });
});

// ✅ Serve Static Files (Fix the Image Error)
app.use(`${base}/api/uploads`, express.static('uploads'));

// ✅ Register Routes
app.use(`${base}/api/additionalPrice`, additionalPriceRoutes);
app.use(`${base}/api/auth`, authRoutes);
app.use(`${base}/api/boardingHouse`, boardingHouseRoutes);
app.use(`${base}/api/otherCost`, otherCostRoutes);
app.use(`${base}/api/payment`, paymentRoutes);
app.use(`${base}/api/roomHistory`, roomHistoryRoutes);
app.use(`${base}/api/roomPrice`, roomPriceRoutes);
app.use(`${base}/api/room`, roomRoutes);
app.use(`${base}/api/price`, priceRoutes);
app.use(`${base}/api/tenant`, tenantRoutes);
app.use(`${base}/api/invoice`, invoiceRoutes);
app.use(`${base}/api/transaction`, transactionRoutes);
app.use(`${base}/api/user`, userRoutes);
app.use(`${base}/api/expense`, expenseRoutes);
app.use(`${base}/api/report`, reportRoutes);

// ✅ Sync Database & Start Server
const PORT = process.env.PORT || 5000;

sequelize.sync({ alter: true })
    .then(() => {
        logger.info("✅ Database synchronized successfully.");

        startBillingTask();
        logger.info('🔥 Scheduled billing task started.');

        app.listen(PORT, () => logger.info(`🚀 Server ${version} running on port ${PORT}`));
    })
    .catch((err) => {
        console.log(err);
        logger.error("❌ Database sync error:");
        logger.error(err.message);
        logger.error(err);
    });
