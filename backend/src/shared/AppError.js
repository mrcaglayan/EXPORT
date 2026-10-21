export class AppError extends Error {
  constructor(status, code, message, options) {
    super(message, options);
    this.status = status;
    this.code = code;
  }
}
