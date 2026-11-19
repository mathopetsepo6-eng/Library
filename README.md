# Community Library Management System

A full-stack library management application built to match the supplied assignment brief. The frontend uses React, React Router, React hooks and the Fetch API. The backend is an Express REST API with MySQL persistence.

## Features

- Responsive cream, white and dark-brown dashboard inspired by the supplied templates.
- Login and member registration with hashed passwords and JWT sessions.
- Dashboard statistics: total book copies, users, transactions and low-stock titles.
- Book CRUD: add, edit, delete, search and view availability.
- Transaction management: borrow, return and add stock. Stock changes and transaction records are saved together in a database transaction.
- User management for administrators and librarians: add, update, list and delete accounts.
- Low-stock indicator for books with fewer than 2 copies.
- MySQL schema and sample book data are initialized automatically by the backend.

## Requirements

- Node.js 18 or newer
- MySQL 8.0 or newer (MySQL Community Server)
- MySQL Workbench (recommended for managing the database)
- npm

## 1. Install and create the MySQL database

Install MySQL Community Server and MySQL Workbench from the official MySQL downloads page: https://dev.mysql.com/downloads/installer/ . During setup, remember the password for the `root` account and keep the default port `3306`.

Open MySQL Workbench, connect to your local MySQL server, open a new SQL tab and run:

```sql
CREATE DATABASE community_library
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

The backend automatically creates the `users`, `books` and `transactions` tables and inserts sample books and a starter administrator the first time it connects.

## 2. Configure and start the backend

Open a terminal in the `backend` folder and run:

```bash
npm install
```

Copy `backend/.env.example` to `backend/.env`. On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and enter the password you chose for MySQL:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_NAME=community_library
DB_USER=root
DB_PASSWORD=your_mysql_password
JWT_SECRET=replace_with_a_long_random_secret
CLIENT_URL=http://localhost:5173
```

Then start the backend:

```bash
npm run dev
```

The API runs at `http://localhost:5000`. Check `http://localhost:5000/api/health` for its status. A successful response contains `"database":"mysql"`.

## 3. Start the frontend

Open a second terminal in the `frontend` folder and run:

```bash
npm install
```

Copy `.env.example` to `.env` if the API is not running at `http://localhost:5000/api`, then run:

```bash
npm run dev
```

Open the Vite URL shown in the terminal, normally `http://localhost:5173`.

## Demo administrator

- Email: `admin@communitylibrary.local`
- Membership ID: `ADMIN001`
- Password: `Admin123!`

Change the demo password and JWT secret before deploying publicly. New registrations are assigned the `member` role. Only an administrator or librarian can access user management and book CRUD screens.

## API routes

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | API/database health |
| POST | `/api/auth/login` | Public | Login |
| POST | `/api/auth/register` | Public | Register member |
| GET | `/api/dashboard` | Signed in | Dashboard statistics and recent transactions |
| GET | `/api/books` | Signed in | List/search books |
| POST | `/api/books` | Admin/librarian | Add book |
| PUT | `/api/books/:id` | Admin/librarian | Update book |
| DELETE | `/api/books/:id` | Admin/librarian | Delete book |
| GET | `/api/users` | Admin/librarian | List users |
| POST | `/api/users` | Admin/librarian | Add user |
| PUT | `/api/users/:id` | Admin/librarian | Update user |
| DELETE | `/api/users/:id` | Admin/librarian | Delete user |
| GET | `/api/transactions` | Signed in | Transaction history |
| POST | `/api/transactions` | Signed in | Borrow, return or add stock |

## Notes

- `borrow` decreases available stock; it is rejected if there are not enough copies.
- `return` and `stock_add` increase available stock.
- Every transaction is recorded with its book, member, type, quantity and date.
- Books with previous transaction history cannot be deleted because the transaction table preserves its history. Set the quantity to zero instead.
- MySQL is the persistent database. Browser localStorage is used only to retain the signed-in session token and user summary.
- Run the frontend production build with `npm run build` inside `frontend`.
