module.exports = (sequelize, DataTypes) => {
    const Transaction = sequelize.define("Transaction", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        roomId: { type: DataTypes.UUID, allowNull: false },
        amount: { type: DataTypes.FLOAT, allowNull: false },
        transactionType: { type: DataTypes.ENUM('debit', 'credit'), allowNull: false },
        transactionImagePath: { type: DataTypes.STRING },
        description: { type: DataTypes.TEXT },
        updateBy: { type: DataTypes.STRING }
    }, { timestamps: true });

    Transaction.associate = (models) => {
        Transaction.belongsTo(models.Room, { foreignKey: "roomId" });
    };

    return Transaction;
};
