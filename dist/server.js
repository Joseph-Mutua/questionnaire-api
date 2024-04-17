"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const db_1 = require("./config/db");
const migration_1 = require("./config/db/migration");
//Routes
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const formRoutes_1 = __importDefault(require("./routes/formRoutes"));
if (process.env.NODE_ENV !== "PRODUCTION") {
    dotenv_1.default.config({
        path: "config/.env",
    });
}
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
app.use((0, cors_1.default)({
    origin: ["http://localhost:3000"],
    credentials: true,
}));
app.use((0, helmet_1.default)());
app.use((0, morgan_1.default)("tiny"));
app.use(express_1.default.json());
app.use("/api/v1/user", userRoutes_1.default);
app.use("/api/v1/form", formRoutes_1.default);
(0, migration_1.runMigrations)();
(0, db_1.connectDB)()
    .then(() => {
    app.listen(port, () => {
        console.log(`[server]: Server is running at http://localhost:${port}`);
    });
})
    .catch((error) => {
    console.error("Failed to connect to the database!", error);
});
