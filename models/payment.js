module.exports = (sequelize, DataTypes) => {
    const Payment = sequelize.define("Payment", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        tenantId: { type: DataTypes.UUID, allowNull: false },
        // roomId: { type: DataTypes.UUID, allowNull: false },
        amount: { type: DataTypes.FLOAT, allowNull: false },
        transactionType: { type: DataTypes.ENUM('debit', 'credit'), allowNull: false },
        transactionImagePath: { type: DataTypes.STRING },
        description: { type: DataTypes.TEXT },
        updateBy: { type: DataTypes.STRING }
    }, { timestamps: true });

    Payment.associate = (models) => {
        Payment.belongsTo(models.Tenant, { foreignKey: "tenantId" });
        // Payment.belongsTo(models.Room, { foreignKey: "roomId" });
        Payment.hasMany(models.RoomPrice, { foreignKey: "paymentId", onDelete: "CASCADE" });
        Payment.hasMany(models.AdditionalPrice, { foreignKey: "paymentId", onDelete: "CASCADE" });
        Payment.hasMany(models.OtherCost, { foreignKey: "paymentId", onDelete: "CASCADE" });
    };

    return Payment;
};
