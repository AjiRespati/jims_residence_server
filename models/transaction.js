// models/transaction.js (Modified - Allow invoiceId to be nullable)
module.exports = (sequelize, DataTypes) => {
    const Transaction = sequelize.define("Transaction", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        invoiceId: { type: DataTypes.UUID, allowNull: true }, // 🔥 Changed to allowNull: true to allow expenses not linked to invoices

        amount: { type: DataTypes.FLOAT, allowNull: false }, // The amount of the transaction
        transactionDate: { type: DataTypes.DATE, allowNull: false }, // The date of the transaction
        method: { type: DataTypes.ENUM('Cash', 'Bank Transfer', 'Online Payment', 'Other'), allowNull: false }, // Method of payment/receipt
        transactionProofPath: { type: DataTypes.STRING }, // Proof for this transaction
        description: { type: DataTypes.TEXT }, // Description for this transaction
        createBy: { type: DataTypes.STRING },
        updateBy: { type: DataTypes.STRING },
        // tenantId association removed previously is correct if linking via Invoice for tenant payments
        // If tracking expenses, tenantId is not relevant here.
    }, { timestamps: true });

    Transaction.associate = (models) => {
        // A Transaction belongs to one Invoice (now optional)
        Transaction.belongsTo(models.Invoice, { foreignKey: "invoiceId" });
        // If you added tenantId back for easier queries, keep its association
        // Transaction.belongsTo(models.Tenant, { foreignKey: "tenantId" });
    };

    return Transaction;
};