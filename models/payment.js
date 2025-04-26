module.exports = (sequelize, DataTypes) => {
    const Payment = sequelize.define("Payment", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        // tenantId: { type: DataTypes.UUID, allowNull: false },
        totalAmount: { type: DataTypes.FLOAT, allowNull: false },
        transactionName:  { type: DataTypes.STRING },
        transactionType: { type: DataTypes.ENUM('debit', 'credit'), allowNull: false },
        transactionImagePath: { type: DataTypes.STRING },
        description: { type: DataTypes.TEXT },
        createBy: { type: DataTypes.STRING },
        updateBy: { type: DataTypes.STRING },
        timelimit: { type: DataTypes.DATE },
        paymentDate: { type: DataTypes.DATE },
        paymentStatus: { type: DataTypes.ENUM('unpaid', 'paid') },
    }, { timestamps: true });

    Payment.associate = (models) => {
        // Payment.belongsTo(models.Tenant, { foreignKey: "tenantId" });
    };

    return Payment;
};