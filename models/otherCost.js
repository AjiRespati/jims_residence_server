module.exports = (sequelize, DataTypes) => {
    const OtherCost = sequelize.define("OtherCost", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        roomId: { type: DataTypes.INTEGER, allowNull: false },
        amount: { type: DataTypes.FLOAT, allowNull: false },
        name: { type: DataTypes.STRING },
        description: { type: DataTypes.TEXT },
        updateBy: { type: DataTypes.STRING },
    }, { timestamps: true });

    OtherCost.associate = (models) => {
        OtherCost.belongsTo(models.Room, { foreignKey: "roomId" });
    };

    return OtherCost;
};
