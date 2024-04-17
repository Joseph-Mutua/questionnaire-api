"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateUser = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const authenticateUser = (req, res, next) => {
    var _a;
    const token = ((_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.split(" ")[1]) || "";
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        if (typeof decoded !== "string" && decoded.userId) {
            req.user = { userId: decoded.userId };
            next();
        }
        else {
            res.status(401).send({ message: "Authentication failed!" });
        }
    }
    catch (error) {
        res.status(401).send({ message: "Authentication failed!" });
    }
};
exports.authenticateUser = authenticateUser;
