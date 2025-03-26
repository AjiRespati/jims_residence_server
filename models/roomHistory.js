module.exports = (sequelize, DataTypes) => {
    const RoomHistory = sequelize.define("RoomHistory", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        roomId: { type: DataTypes.UUID, allowNull: false },
        eventDate: { type: DataTypes.STRING },
        eventName: { type: DataTypes.STRING },
        description: { type: DataTypes.TEXT },
        updateBy: { type: DataTypes.STRING }
    }, { timestamps: true });

    RoomHistory.associate = (models) => {
        RoomHistory.belongsTo(models.Room, { foreignKey: "roomId" });
    };

    return RoomHistory;
};
