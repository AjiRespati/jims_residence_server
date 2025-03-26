module.exports = (sequelize, DataTypes) => {
    const AdditionalPrice = sequelize.define("AdditionalPrice", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        roomId: { type: DataTypes.UUID, allowNull: false },
        amount: { type: DataTypes.FLOAT, allowNull: false },
        name: { type: DataTypes.STRING },
        description: { type: DataTypes.TEXT },
        updateBy: { type: DataTypes.STRING },
    }, { timestamps: true });

    AdditionalPrice.associate = (models) => {
        AdditionalPrice.belongsTo(models.Room, { foreignKey: "roomId" });
    };

    return AdditionalPrice;
};
