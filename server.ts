import express, { Express } from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import "express-async-errors";
import { runMigrations } from "./config/db/migration";
import { Server as HTTPServer } from "http";
import { Server as SocketServer } from "socket.io";
import { ExtendedError } from "socket.io/dist/namespace";
import userRoutes from "./controllers/users";
import formRoutes from "./controllers/forms";
import formResponseRoutes from "./controllers/formResponses";
import templateRoutes from "./controllers/templates";
import errorHandler from "./middleware/error";
import { checkAuthorization } from "./helpers/forms/formControllerHelpers";

if (process.env.NODE_ENV !== "PRODUCTION") {
  dotenv.config({ path: "config/.env" });
}

const app: Express = express();
const httpServer = new HTTPServer(app);
const io = new SocketServer(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:5173"],
    credentials: true,
  },
});


io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("joinRoom", async (form_id: number, user_id: number) => {
    try {
      const isAuthorized = await checkAuthorization(user_id, form_id);
      if (isAuthorized) {
        await socket.join(form_id.toString());
        console.log(`User ${user_id} joined room for form ${form_id}`);
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

  socket.on("leaveRoom", async (form_id: number) => {
    await socket.leave(form_id.toString());
    console.log(`User left room for form ${form_id}`);
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

app.use(cors({ origin: ["http://localhost:3000", "http://localhost:5173"], credentials: true }));
app.use(helmet());
app.use(morgan("tiny"));
app.use(express.json());

app.use("/api/v1/users", userRoutes);
app.use("/api/v1/forms", formRoutes);
app.use("/api/v1/responses", formResponseRoutes);
app.use("/api/v1/templates", templateRoutes);

app.use(errorHandler);

async function initializeApp() {
  try {
    await runMigrations();

    httpServer.listen(port, () => {
      console.log(`[server]: Server is running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to initialize the application:", error);
    process.exit(1);
  }
}

initializeApp()
  .then(() => console.log("Application initialized successfully."))
  .catch((err) => console.error("Failed to initialize the application:", err));

export { io };