module.exports = (sequelize, DataTypes) => {
    const RoomPrice = sequelize.define("RoomPrice", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        paymentId: { type: DataTypes.UUID, allowNull: false },
        amount: { type: DataTypes.FLOAT, allowNull: false },
        name: { type: DataTypes.STRING },
        description: { type: DataTypes.TEXT },
        createBy: { type: DataTypes.STRING },
        updateBy: { type: DataTypes.STRING },
        status: { type: DataTypes.ENUM("active", "inactive"), allowNull: false, defaultValue: "active" },
    }, { timestamps: true });

    RoomPrice.associate = (models) => {
        RoomPrice.belongsTo(models.Payment, { foreignKey: "paymentId" });
    };

    return RoomPrice;
};