Database
The Community Library Management System 
uses MySQL as its database management 
system. The database is hosted on Enzonic 
Cloud, allowing the application to store and 
retrieve information online.
The database contains three main tables:
Users: Stores information about registered 
members, administrators and librarians.
Books: Stores book details such as title, 
author, genre, ISBN and available quantity.
Transactions: Records book borrowing, 
returning and stock additions.
The Express backend connects to the MySQL 
database using the mysql2 package. Database 
connection details are configured through 
environment variables to keep sensitive 
information separate from the application 
source code.
Running the Application
Backend
The backend is built using Node.js and 
Express.js. It handles user authentication, book 
management, transactions and communication 
with the MySQL database.
To run the backend, open a terminal in the 
backend folder and execute:
bash
npm install
npm start
The API runs on port 5000.
The database connection can be checked 
through the API health endpoint:
http://localhost:5000/api/health
Frontend
The frontend was developed using React. It 
communicates with the backend through the 
Fetch API.
To run the frontend, open another terminal in the 
frontend folder and execute:
bash
npm install
npm run dev
The application can then be accessed through 
the local development URL provided by Vite.
User Accounts and Permissions
The system supports three user roles:
Administrator: Manages books, users and 
library transactions.
Librarian: Manages books, users and library 
transactions.
Member: Views available books and 
participates in borrowing and returning 
books.
User passwords are hashed before being stored 
in the database, while JWT is used to manage 
authenticated sessions.