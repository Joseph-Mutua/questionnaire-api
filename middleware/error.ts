import { Request, Response, ErrorRequestHandler, NextFunction } from "express";
import HttpError from "../utils/httpError";

const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  let statusCode = 500;
  let message = "Internal Server Error";
  if (err instanceof HttpError) {
    statusCode = err.statusCode;
    message = err.message;
    return res.status(statusCode).json({ error: message });
  }

  console.error("Error: ", err);
  return res.status(statusCode).json({ error: message });
};

export default errorHandler;