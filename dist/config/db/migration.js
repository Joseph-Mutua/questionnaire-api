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
exports.runMigrations = void 0;
const db_1 = require("../db");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const runMigrations = () => __awaiter(void 0, void 0, void 0, function* () {
    const client = yield db_1.pool.connect();
    try {
        const migrations = fs_1.default
            .readdirSync(path_1.default.join(__dirname, "migrations"))
            .sort();
        for (const file of migrations) {
            const migration = fs_1.default.readFileSync(path_1.default.join(__dirname, "migrations", file), "utf-8");
            yield client.query(migration);
            console.log(`Executed migration: ${file}`);
        }
    }
    catch (err) {
        console.error("Migration failed.", err);
        process.exit(1);
    }
    finally {
        client.release();
    }
});
exports.runMigrations = runMigrations;
