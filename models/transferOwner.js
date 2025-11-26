// models/expense.js
module.exports = (sequelize, DataTypes) => {
    const TransferOwner = sequelize.define("TransferOwner", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        boardingHouseId: { type: DataTypes.UUID, allowNull: false }, // Link to the boarding house the expense is for
        amount: { type: DataTypes.FLOAT, allowNull: false }, // The expense amount
        transferDate: { type: DataTypes.DATE, allowNull: false }, // The date the expense was incurred or paid
        proofPath: { type: DataTypes.STRING }, // Path to receipt or invoice proof image/document
        description: { type: DataTypes.TEXT }, // Optional detailed description
        createBy: { type: DataTypes.STRING },
        updateBy: { type: DataTypes.STRING },
    }, { timestamps: true });

    TransferOwner.associate = (models) => {
        // An TransferOwner belongs to one BoardingHouse
        TransferOwner.belongsTo(models.BoardingHouse, { foreignKey: "boardingHouseId" });
        // You might add other associations here if expenses relate to rooms, etc.
    };

    return TransferOwner;
};
