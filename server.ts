// import express, { Express } from "express";
// import dotenv from "dotenv";
// import cors from "cors";
// import helmet from "helmet";
// import morgan from "morgan";
// import "express-async-errors";
// import { connectDB } from "./config/db";
// import { runMigrations } from "./config/db/migration";
// import { Server as HTTPServer } from "http";
// import { Server as SocketServer } from "socket.io";

// import userRoutes from "./controllers/users";
// import formRoutes from "./controllers/forms";
// import formResponseRoutes from "./controllers/formResponses";
// import errorHandler from "./middleware/error";


// if (process.env.NODE_ENV !== "PRODUCTION") {
//   dotenv.config({ path: "config/.env" });
// }

// const app: Express = express();
// const httpServer = new HTTPServer(app);
// const io = new SocketServer(httpServer, {
//   cors: {
//     origin: ["http://localhost:3000"],
//     credentials: true,
//   },
// });

// export { io };

// const port = process.env.PORT || 3000;

// app.use(cors({ origin: ["http://localhost:3000"], credentials: true }));
// app.use(helmet());
// app.use(morgan("tiny"));
// app.use(express.json());

// app.use("/api/v1/users", userRoutes);
// app.use("/api/v1/forms", formRoutes);
// app.use("/api/v1/responses", formResponseRoutes);


// app.use(errorHandler);

// async function initializeApp() {
//   try {
//     await runMigrations();
//     await connectDB();

//     httpServer.listen(port, () => {
//       console.log(`[server]: Server is running at http://localhost:${port}`);
//     });
//   } catch (error) {
//     console.error("Failed to initialize the application:", error);
//     process.exit(1);
//   }
// }

// initializeApp()
//   .then(() => console.log("Application initialized successfully."))
//   .catch((err) => console.error("Failed to initialize the application:", err));



import express, { Express } from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import "express-async-errors";
import { connectDB } from "./config/db";
import { runMigrations } from "./config/db/migration";
import { Server as HTTPServer } from "http";
import { Server as SocketServer } from "socket.io";
import { ExtendedError } from "socket.io/dist/namespace";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient, RedisClientType } from "redis";
import userRoutes from "./controllers/users";
import formRoutes from "./controllers/forms";
import formResponseRoutes from "./controllers/formResponses";
import errorHandler from "./middleware/error";
import { fetchFormDetails } from "./helpers/forms/formControllerHelpers";

import { pool } from "./config/db";

if (process.env.NODE_ENV !== "PRODUCTION") {
  dotenv.config({ path: "config/.env" });
}

const app: Express = express();
const httpServer = new HTTPServer(app);
const io = new SocketServer(httpServer, {
  cors: {
    origin: ["http://localhost:3000"],
    credentials: true,
  },
});

export {io}

const pubClient: RedisClientType = createClient({
  url: "redis://127.0.0.1:6379",
}) as RedisClientType;

const subClient: RedisClientType = pubClient.duplicate() as RedisClientType;

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  io.adapter(createAdapter(pubClient, subClient));
  console.log('Connected to Redis clients and set up adapter');
}).catch(error => {
  console.error('Failed to connect Redis clients or set up adapter:', error);
});

// Socket.IO Connection Handling
io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("joinRoom", async (formId: number, userId: number) => {
    try {
      const isAuthorized = await checkAuthorization(userId, formId);
      if (isAuthorized) {
        await socket.join(formId.toString());
        console.log(`User ${userId} joined room for form ${formId}`);
      } else {
        socket.emit("unauthorized", {
          message: "You are not authorized to join this room.",
        });
      }
    } catch (error) {
      console.error("Error joining room:", error);
      socket.emit("error", {
        message: "An error occurred while joining the room.",
      });
    }
  });

  socket.on("leaveRoom", async (formId: number) => {
    await socket.leave(formId.toString());
    console.log(`User left room for form ${formId}`);
  });

  socket.on("disconnect", (reason) => {
    console.log(`User disconnected: ${reason}`);
  });

  socket.on("error", (err: ExtendedError) => {
    if (err && err.message === "unauthorized event") {
      socket.disconnect();
    }
  });
});

const port = process.env.PORT || 3000;
app.use(cors({ origin: ["http://localhost:3000"], credentials: true }));
app.use(helmet());
app.use(morgan("tiny"));
app.use(express.json());

app.use("/api/v1/users", userRoutes);
app.use("/api/v1/forms", formRoutes);
app.use("/api/v1/responses", formResponseRoutes);
app.use(errorHandler);

async function initializeApp() {
  try {
    await runMigrations();
    await connectDB();

    httpServer.listen(port, () => {
      console.log(`[server]: Server is running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to initialize the application:", error);
    process.exit(1);
  }
}

// Check if the user is authorized to join the room (owner or editor)
async function checkAuthorization(
  userId: number,
  formId: number
): Promise<boolean> {
  const query = `
        SELECT EXISTS (
            SELECT 1 
            FROM form_user_roles fur
            JOIN roles r ON fur.role_id = r.role_id
            WHERE fur.form_id = $1 AND fur.user_id = $2 AND r.name IN ('Owner', 'Editor')
        )
    `;

  const result = await pool.query<{ exists: boolean }>(query, [formId, userId]);
  return result.rows[0].exists;
}

initializeApp()
  .then(() => console.log("Application initialized successfully."))
  .catch((err) => console.error("Failed to initialize the application:", err));
