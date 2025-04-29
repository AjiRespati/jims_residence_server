// models/room.js
module.exports = (sequelize, DataTypes) => {
    // Define the attributes in a variable first
    const roomAttributes = {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        boardingHouseId: { type: DataTypes.UUID, allowNull: false },
        priceId: { type: DataTypes.UUID, allowNull: true }, // <-- This is the definition we want to inspect
        roomNumber: { type: DataTypes.STRING, allowNull: false },
        roomStatus: { type: DataTypes.ENUM('Tersedia', 'Terisi', 'Dipesan', 'Pemeliharaan', 'Rusak'), allowNull: false },
        roomSize: { type: DataTypes.ENUM('Small', 'Standard', 'Big'), allowNull: false },
        description: { type: DataTypes.TEXT },
        createBy: { type: DataTypes.STRING },
        updateBy: { type: DataTypes.STRING }
    };

    const Room = sequelize.define("Room", roomAttributes, { timestamps: true }); // Use the attributes variable

    Room.associate = (models) => {
        Room.hasMany(models.RoomHistory, { foreignKey: "roomId", onDelete: "CASCADE" });
        Room.hasMany(models.Tenant, { foreignKey: "roomId", onDelete: "CASCADE" });
        Room.hasMany(models.Invoice, { foreignKey: "roomId", onDelete: "CASCADE" });
        Room.hasMany(models.AdditionalPrice, { foreignKey: 'roomId' });
        Room.hasMany(models.OtherCost, { foreignKey: 'roomId' });
        Room.belongsTo(models.BoardingHouse, { foreignKey: 'boardingHouseId' });
        Room.belongsTo(models.Price, { foreignKey: 'priceId' });
    };

    return Room;
};