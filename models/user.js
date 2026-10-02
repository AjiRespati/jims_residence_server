
module.exports = (sequelize, DataTypes) => {
    const User = sequelize.define('User', {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        username: { type: DataTypes.STRING, allowNull: false, unique: true },
        password: { type: DataTypes.STRING, allowNull: false },
        refreshToken: { type: DataTypes.TEXT, allowNull: true },
        name: { type: DataTypes.STRING, allowNull: true },
        image: { type: DataTypes.STRING, allowNull: true },
        address: { type: DataTypes.STRING, allowNull: true },
        phone: { type: DataTypes.STRING, allowNull: true, unique: true },
        email: { type: DataTypes.STRING, allowNull: true, unique: true },
        level: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        levelDesc: { type: DataTypes.STRING, allowNull: true },
        status: { type: DataTypes.ENUM("new", "active", "inactive"), allowNull: false, defaultValue: "inactive" },
        ownerId: { type: DataTypes.UUID, allowNull: true },
        updateBy: { type: DataTypes.STRING, allowNull: true }
    }, { timestamps: true });

    User.associate = (models) => {
        User.belongsTo(models.User, { as: "Owner", foreignKey: "ownerId", constraints: false });
        User.hasMany(models.User, { as: "Staff", foreignKey: "ownerId", constraints: false });
        User.hasMany(models.BoardingHouse, { as: "OwnedBoardingHouses", foreignKey: "ownerId", constraints: false });
    };

    return User;
};
