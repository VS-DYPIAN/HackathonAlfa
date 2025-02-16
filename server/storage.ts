import { User, InsertUser, Transaction, InsertTransaction } from "@shared/schema";
import sql from "mssql";
import createMemoryStore from "memorystore";
import session from "express-session";

const MemoryStore = createMemoryStore(session);

const dbConfig = {
  user: "vaibhavsawant",
  password: "Gamechanger@14",
  server: "al-techies.database.windows.net",
  port: 1433,
  database: "foodcoupon",
  options: {
    encrypt: true,
    trustServerCertificate: true,
    connectionTimeout: 30000,
    requestTimeout: 30000,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  },
};

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  sessionStore: session.Store;
  pool: sql.ConnectionPool;
  connect(): Promise<void>;
}

export class SqlServerStorage implements IStorage {
  pool: sql.ConnectionPool;
  sessionStore: session.Store;
  private isConnecting: boolean = false;

  constructor() {
    this.pool = new sql.ConnectionPool(dbConfig);
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // 1 day
    });
  }

  async connect(): Promise<void> {
    if (this.isConnecting) {
      console.log('Connection attempt already in progress');
      return;
    }

    this.isConnecting = true;

    try {
      if (!this.pool.connected) {
        console.log('Attempting to connect to database...');
        await this.pool.connect();
      }
      console.log('Connected to SQL Server successfully');

      // Create users table if it doesn't exist
      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' and xtype='U')
        CREATE TABLE users (
          id INT IDENTITY(1,1) PRIMARY KEY,
          username NVARCHAR(255) NOT NULL UNIQUE,
          password NVARCHAR(255) NOT NULL,
          role NVARCHAR(50) NOT NULL CHECK (role IN ('admin', 'employee', 'vendor')),
          walletBalance DECIMAL(10,2) DEFAULT 0
        )
      `);

      this.isConnecting = false;
    } catch (err) {
      this.isConnecting = false;
      console.error('Database connection error:', err);
      throw err;
    }
  }

  private async ensureConnection() {
    if (!this.pool.connected && !this.isConnecting) {
      await this.connect();
    }
  }

  async getUser(id: number): Promise<User | undefined> {
    await this.ensureConnection();
    try {
      const result = await this.pool
        .request()
        .input("id", sql.Int, id)
        .query("SELECT * FROM users WHERE id = @id");
      return result.recordset[0];
    } catch (err) {
      console.error('Error getting user by ID:', err);
      throw err;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    await this.ensureConnection();
    try {
      const result = await this.pool
        .request()
        .input("username", sql.NVarChar, username)
        .query("SELECT * FROM users WHERE username = @username");
      return result.recordset[0];
    } catch (err) {
      console.error('Error getting user by username:', err);
      throw err;
    }
  }

  async createUser(user: InsertUser): Promise<User> {
    await this.ensureConnection();
    try {
      const result = await this.pool
        .request()
        .input("username", sql.NVarChar, user.username)
        .input("password", sql.NVarChar, user.password)
        .input("role", sql.NVarChar, user.role)
        .query(`
          INSERT INTO users (username, password, role)
          OUTPUT INSERTED.*
          VALUES (@username, @password, @role)
        `);
      return result.recordset[0];
    } catch (err) {
      console.error('Error creating user:', err);
      throw err;
    }
  }

  async createTransaction(transaction: any): Promise<any> {
    await this.ensureConnection();
    try {
      // Generate a unique transaction ID
      const transactionId = 'TXN' + Date.now();
      
      const result = await this.pool
        .request()
        .input("employeeId", sql.Int, transaction.employeeId)
        .input("vendorId", sql.Int, transaction.vendorId)
        .input("amount", sql.Decimal(10,2), transaction.amount)
        .input("timestamp", sql.DateTime, transaction.timestamp)
        .input("status", sql.NVarChar, transaction.status)
        .input("transactionId", sql.NVarChar, transactionId)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM transactions)
          CREATE TABLE transactions (
            id INT IDENTITY(1,1) PRIMARY KEY,
            employeeId INT,
            vendorId INT,
            amount DECIMAL(10,2),
            timestamp DATETIME,
            status NVARCHAR(50),
            transactionId NVARCHAR(50)
          );

          INSERT INTO transactions (employeeId, vendorId, amount, timestamp, status, transactionId)
          OUTPUT INSERTED.*
          VALUES (@employeeId, @vendorId, @amount, @timestamp, @status, @transactionId);
        `);
      return result.recordset[0];
    } catch (err) {
      console.error('Error creating transaction:', err);
      throw err;
    }
  }
}

export const storage = new SqlServerStorage();
storage.connect().catch(console.error);