// models/transaction.js
module.exports = (sequelize, DataTypes) => {
    const Transaction = sequelize.define("Transaction", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        invoiceId: { type: DataTypes.UUID, allowNull: false }, // Link to the Invoice being paid
        // Optional: You might want to keep tenantId here for easier queries from Tenant to Transactions directly,
        // but it's technically redundant as you can get it via Transaction -> Invoice -> Tenant.
        // tenantId: { type: DataTypes.UUID, allowNull: false },

        amount: { type: DataTypes.FLOAT, allowNull: false }, // The amount of THIS payment received
        transactionDate: { type: DataTypes.DATE, allowNull: false }, // 🔥 This is your paymentDate field
        method: { type: DataTypes.ENUM('Cash', 'Bank Transfer', 'Online Payment', 'Other'), allowNull: false }, // Method of payment
        transactionProofPath: { type: DataTypes.STRING }, // 🔥 This is your transactionImagePath field
        description: { type: DataTypes.TEXT }, // Description for this payment transaction (e.g., reference number)
        createBy: { type: DataTypes.STRING },
        updateBy: { type: DataTypes.STRING },
    }, { timestamps: true });

    Transaction.associate = (models) => {
        // A Transaction belongs to one Invoice
        Transaction.belongsTo(models.Invoice, { foreignKey: "invoiceId" });

        // Optional: If keeping tenantId on Transaction
        // Transaction.belongsTo(models.Tenant, { foreignKey: "tenantId" });
    };

    return Transaction;
};