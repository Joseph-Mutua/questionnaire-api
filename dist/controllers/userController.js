"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.register = void 0;
const db_1 = require("../config/db");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const register = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password } = req.body;
    const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
    const client = yield db_1.pool.connect();
    try {
        yield client.query("BEGIN");
        const insertUserText = "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING userId, email";
        const insertUserValues = [email, hashedPassword];
        const result = yield client.query(insertUserText, insertUserValues);
        yield client.query("COMMIT");
        const user = result.rows[0];
        const token = generateToken(user.id);
        res.status(201).send({ user, token });
    }
    catch (error) {
        yield client.query("ROLLBACK");
        const errorMessage = error.message;
        res.status(500).send(errorMessage);
    }
    finally {
        client.release();
    }
});
exports.register = register;
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password } = req.body;
    try {
        const findUserText = "SELECT userId, password FROM users WHERE email = $1";
        const findUserValues = [email];
        const result = yield db_1.pool.query(findUserText, findUserValues);
        if (result.rows.length === 0) {
            return res.status(404).send("User Not Found");
        }
        const user = result.rows[0];
        const validPassword = yield bcryptjs_1.default.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).send("Invalid Credentials");
        }
        const token = generateToken(user.userId);
        res.send({ user: { userId: user.userId, email }, token });
    }
    catch (error) {
        const errorMessage = error.message;
        res.status(500).send(errorMessage);
    }
});
exports.login = login;
function generateToken(userId) {
    return jsonwebtoken_1.default.sign({ userId: userId }, process.env.JWT_SECRET, {
        expiresIn: "1h",
    });
}
