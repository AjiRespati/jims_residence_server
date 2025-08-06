// models/invoice.js
module.exports = (sequelize, DataTypes) => {
    const Invoice = sequelize.define("Invoice", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        tenantId: { type: DataTypes.UUID, allowNull: true }, // Link to the tenant this invoice is for
        roomId: { type: DataTypes.UUID, allowNull: true }, // Context: which room this invoice covers
        priceId: { type: DataTypes.UUID, allowNull: true }, // Context: which price this invoice covers
        periodStart: { type: DataTypes.DATE, allowNull: false }, // Start date of the billing period covered
        periodEnd: { type: DataTypes.DATE, allowNull: false }, // End date of the billing period covered
        issueDate: { type: DataTypes.DATE, allowNull: false }, // The date the invoice was generated
        dueDate: { type: DataTypes.DATE, allowNull: false }, // 🔥 The date the invoice payment is due (replaces timelimit on Payment)
        totalAmountDue: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 }, // Calculated sum of all linked Charges
        totalAmountPaid: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 }, // Sum of related transactions/payments received
        status: { type: DataTypes.ENUM('Draft', 'Issued', 'Unpaid', 'PartiallyPaid', 'Paid', 'Void', 'Cancelled'), allowNull: false, defaultValue: 'Issued' }, // 🔥 Status of the entire invoice (replaces paymentStatus on Payment)
        description: { type: DataTypes.TEXT }, // Optional general description for the invoice
        invoicePaymentProofPath: { type: DataTypes.STRING }, // Proof for this transaction
        createBy: { type: DataTypes.STRING },
        updateBy: { type: DataTypes.STRING },
    }, { timestamps: true });

    Invoice.associate = (models) => {
        Invoice.belongsTo(models.Tenant, { foreignKey: "tenantId" });
        Invoice.belongsTo(models.Room, { foreignKey: "roomId" });
        Invoice.hasMany(models.Charge, { foreignKey: "invoiceId", as: 'Charges', onDelete: 'CASCADE' });
        Invoice.hasMany(models.Transaction, { foreignKey: "invoiceId", as: 'Transactions', onDelete: 'SET NULL' });
    };

    return Invoice;
};