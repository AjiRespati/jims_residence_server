module.exports = (sequelize, DataTypes) => {
    const Room = sequelize.define("Room", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        roomNumber: { type: DataTypes.STRING, allowNull: false },
        roomSize: { type: DataTypes.ENUM('Kecil', 'Standard', 'Besar'), allowNull: false },
        roomStatus: { type: DataTypes.ENUM('Tersedia', 'Terisi', 'Pemeliharaan', 'Rusak'), allowNull: false },
        basicPrice: { type: DataTypes.FLOAT, allowNull: false },
        totalPrice: { type: DataTypes.FLOAT },
        description: { type: DataTypes.TEXT },
        startDate: { type: DataTypes.DATE },
        dueDate: { type: DataTypes.DATE },
        paymentDate: { type: DataTypes.DATE },
        paymentStatus: { type: DataTypes.ENUM('unpaid', 'paid') },
        updateBy: { type: DataTypes.STRING }
    }, { timestamps: true });

    Room.associate = (models) => {
        Room.hasMany(models.AdditionalPrice, { foreignKey: "roomId", onDelete: "CASCADE" });
        Room.hasMany(models.OtherCost, { foreignKey: "roomId", onDelete: "CASCADE" });
        Room.hasMany(models.RoomHistory, { foreignKey: "roomId", onDelete: "CASCADE" });
        Room.hasMany(models.Tenant, { foreignKey: "roomId", onDelete: "CASCADE" });
        Room.hasMany(models.Transaction, { foreignKey: "roomId", onDelete: "CASCADE" });
    };

    return Room;
};