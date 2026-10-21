-- OPTIONAL: run manually only on an approved local DEVELOPMENT MySQL 8 server.
-- Authenticate interactively with your own administrative account.
-- These statements deliberately fail if the database or account already exists.
-- Do not run them on SaaP, shared or production instances without owner approval.
CREATE DATABASE export_accounting_dev
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- MySQL displays a generated password. Put it only in your local backend/.env.
-- Never paste that password into source control, tickets or documentation.
CREATE USER 'export_app'@'127.0.0.1' IDENTIFIED BY RANDOM PASSWORD;
GRANT ALL PRIVILEGES ON export_accounting_dev.* TO 'export_app'@'127.0.0.1';
