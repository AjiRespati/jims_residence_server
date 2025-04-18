
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
        status: { type: DataTypes.ENUM("new", "active", "inactive"), allowNull: false, defaultValue: "new" },
        updateBy: { type: DataTypes.STRING, allowNull: true }
    }, { timestamps: true });
    return User;
};
