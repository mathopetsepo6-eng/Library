require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'development_secret_change_me';
app.use(cors({ origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : true }));
app.use(express.json());

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const auth = (req, res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Please log in first.' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ message: 'Your session has expired. Please log in again.' }); }
};
const admin = (req, res, next) => ['admin', 'librarian'].includes(req.user?.role)
  ? next() : res.status(403).json({ message: 'Administrator or librarian access required.' });
const duplicateError = e => e.code === 'ER_DUP_ENTRY';

async function initialise() {
  const sql = fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8');
  for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await pool.query(statement);

  const [[bookCount]] = await pool.query('SELECT COUNT(*) AS count FROM books');
  if (Number(bookCount.count) === 0) {
    const samples = [
      ['The Psychology of Money','Morgan Housel','Non-Fiction','9780857197689',5],
      ['How Innovation Works','Matt Ridley','Technology','9780062916594',3],
      ['Company of One','Paul Jarvis','Business','9781328972354',1],
      ['Stupore E Tremori','Amélie Nothomb','Fiction','9782253150715',4],
      ['The Bees','Laline Paull','Fantasy','9780062331151',6],
      ['Dune','Frank Herbert','Science Fiction','9780441172719',8],
      ['Sapiens','Yuval Noah Harari','History','9780062316097',2],
      ['1984','George Orwell','Fiction','9780451524935',1],
      ['The Great Gatsby','F. Scott Fitzgerald','Fiction','9780743273565',4],
      ['To Kill a Mockingbird','Harper Lee','Fiction','9780061120084',3],
      ['Harry Potter and the Philosopher’s Stone','J. K. Rowling','Fantasy','9780747532699',5]
    ];
    for (const b of samples) await pool.query(
      'INSERT IGNORE INTO books(title,author,genre,isbn,quantity) VALUES(?,?,?,?,?)', b);
  }
  const [admins] = await pool.query('SELECT id FROM users WHERE email=?', ['admin@communitylibrary.local']);
  if (!admins.length) {
    const hash = await bcrypt.hash('Admin123!', 10);
    await pool.query('INSERT INTO users(name,membership_id,email,password_hash,role) VALUES(?,?,?,?,?)',
      ['Library Administrator','ADMIN001','admin@communitylibrary.local',hash,'admin']);
  }
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', database: 'mysql' });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) return res.status(400).json({ message: 'Enter your membership ID/email and password.' });
  const [users] = await pool.query('SELECT * FROM users WHERE LOWER(email)=LOWER(?) OR LOWER(membership_id)=LOWER(?) LIMIT 1', [identifier, identifier]);
  const user = users[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ message: 'Incorrect login details.' });
  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: { id: user.id, name: user.name, membershipId: user.membership_id, email: user.email, role: user.role } });
}));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const { name, membershipId, email, password } = req.body;
  if (!name || !membershipId || !email || !password || password.length < 6)
    return res.status(400).json({ message: 'Complete all fields. Password must contain at least 6 characters.' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const [result] = await pool.query('INSERT INTO users(name,membership_id,email,password_hash,role) VALUES(?,?,?,?,?)', [name, membershipId, email, hash, 'member']);
    const [[user]] = await pool.query('SELECT id,name,membership_id,email,role FROM users WHERE id=?', [result.insertId]);
    res.status(201).json({ user, message: 'Account created. You can now log in.' });
  } catch (e) { if (duplicateError(e)) return res.status(409).json({ message: 'Email or membership ID is already registered.' }); throw e; }
}));

app.get('/api/dashboard', auth, asyncRoute(async (_req, res) => {
  const [[books]] = await pool.query('SELECT COALESCE(SUM(quantity),0) AS total FROM books');
  const [[users]] = await pool.query('SELECT COUNT(*) AS total FROM users');
  const [[transactions]] = await pool.query('SELECT COUNT(*) AS total FROM transactions');
  const [[low]] = await pool.query('SELECT COUNT(*) AS total FROM books WHERE quantity < 2');
  const [recent] = await pool.query(`SELECT t.id,t.type,t.quantity,t.note,t.created_at,b.title AS book_title,u.name AS user_name
    FROM transactions t JOIN books b ON b.id=t.book_id LEFT JOIN users u ON u.id=t.user_id
    ORDER BY t.created_at DESC LIMIT 8`);
  res.json({ stats: { totalBooks: Number(books.total), totalUsers: Number(users.total), totalTransactions: Number(transactions.total), lowStock: Number(low.total) }, recent });
}));

app.get('/api/books', auth, asyncRoute(async (req, res) => {
  const search = `%${req.query.search || ''}%`;
  const [rows] = await pool.query('SELECT * FROM books WHERE title LIKE ? OR author LIKE ? OR genre LIKE ? ORDER BY title', [search, search, search]);
  res.json(rows);
}));
app.post('/api/books', auth, admin, asyncRoute(async (req, res) => {
  const { title, author, genre, isbn, quantity } = req.body;
  if (!title || !author || !genre || !Number.isInteger(Number(quantity)) || Number(quantity) < 0)
    return res.status(400).json({ message: 'Title, author, genre and a valid non-negative quantity are required.' });
  try {
    const [r] = await pool.query('INSERT INTO books(title,author,genre,isbn,quantity) VALUES(?,?,?,?,?)', [title, author, genre, isbn || null, Number(quantity)]);
    const [[book]] = await pool.query('SELECT * FROM books WHERE id=?', [r.insertId]);
    res.status(201).json(book);
  } catch (e) { if (duplicateError(e)) return res.status(409).json({ message: 'A book with this ISBN already exists.' }); throw e; }
}));
app.put('/api/books/:id', auth, admin, asyncRoute(async (req, res) => {
  const { title, author, genre, isbn, quantity } = req.body;
  if (!title || !author || !genre || !Number.isInteger(Number(quantity)) || Number(quantity) < 0)
    return res.status(400).json({ message: 'Please provide valid book details and quantity.' });
  try {
    const [r] = await pool.query('UPDATE books SET title=?,author=?,genre=?,isbn=?,quantity=? WHERE id=?', [title, author, genre, isbn || null, Number(quantity), req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ message: 'Book not found.' });
    const [[book]] = await pool.query('SELECT * FROM books WHERE id=?', [req.params.id]);
    res.json(book);
  } catch (e) { if (duplicateError(e)) return res.status(409).json({ message: 'A book with this ISBN already exists.' }); throw e; }
}));
app.delete('/api/books/:id', auth, admin, asyncRoute(async (req, res) => {
  try {
    const [r] = await pool.query('DELETE FROM books WHERE id=?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ message: 'Book not found.' });
    res.json({ message: 'Book deleted.' });
  } catch (e) { if (e.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ message: 'This book has transaction history and cannot be deleted. Set its quantity to zero instead.' }); throw e; }
}));

app.get('/api/users', auth, admin, asyncRoute(async (_req, res) => {
  const [rows] = await pool.query('SELECT id,name,membership_id,email,role,created_at FROM users ORDER BY created_at DESC');
  res.json(rows);
}));
app.post('/api/users', auth, admin, asyncRoute(async (req, res) => {
  const { name, membershipId, email, password, role = 'member' } = req.body;
  if (!name || !membershipId || !email || !password || !['member','admin','librarian'].includes(role))
    return res.status(400).json({ message: 'Complete all user fields.' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const [r] = await pool.query('INSERT INTO users(name,membership_id,email,password_hash,role) VALUES(?,?,?,?,?)', [name, membershipId, email, hash, role]);
    const [[user]] = await pool.query('SELECT id,name,membership_id,email,role FROM users WHERE id=?', [r.insertId]);
    res.status(201).json(user);
  } catch (e) { if (duplicateError(e)) return res.status(409).json({ message: 'Email or membership ID already exists.' }); throw e; }
}));
app.put('/api/users/:id', auth, admin, asyncRoute(async (req, res) => {
  const { name, membershipId, email, role, password } = req.body;
  if (!name || !membershipId || !email || !['member','admin','librarian'].includes(role))
    return res.status(400).json({ message: 'Please provide valid user details.' });
  try {
    let result;
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      [result] = await pool.query('UPDATE users SET name=?,membership_id=?,email=?,role=?,password_hash=? WHERE id=?', [name,membershipId,email,role,hash,req.params.id]);
    } else {
      [result] = await pool.query('UPDATE users SET name=?,membership_id=?,email=?,role=? WHERE id=?', [name,membershipId,email,role,req.params.id]);
    }
    if (!result.affectedRows) return res.status(404).json({ message: 'User not found.' });
    const [[user]] = await pool.query('SELECT id,name,membership_id,email,role FROM users WHERE id=?', [req.params.id]);
    res.json(user);
  } catch (e) { if (duplicateError(e)) return res.status(409).json({ message: 'Email or membership ID already exists.' }); throw e; }
}));
app.delete('/api/users/:id', auth, admin, asyncRoute(async (req, res) => {
  if (Number(req.params.id) === Number(req.user.id)) return res.status(400).json({ message: 'You cannot delete your own account.' });
  const [r] = await pool.query('DELETE FROM users WHERE id=?', [req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ message: 'User not found.' });
  res.json({ message: 'User deleted.' });
}));

app.get('/api/transactions', auth, asyncRoute(async (_req, res) => {
  const [rows] = await pool.query(`SELECT t.id,t.type,t.quantity,t.note,t.created_at,b.title AS book_title,u.name AS user_name,u.membership_id
    FROM transactions t JOIN books b ON b.id=t.book_id LEFT JOIN users u ON u.id=t.user_id
    ORDER BY t.created_at DESC LIMIT 200`);
  res.json(rows);
}));
app.post('/api/transactions', auth, asyncRoute(async (req, res) => {
  const { bookId, type, quantity, note, membershipId } = req.body;
  const qty = Number(quantity);
  if (type === 'stock_add' && !['admin','librarian'].includes(req.user.role))
    return res.status(403).json({ message: 'Only administrators or librarians can add stock.' });
  if (!bookId || !['borrow','return','stock_add'].includes(type) || !Number.isInteger(qty) || qty < 1)
    return res.status(400).json({ message: 'Select a book, transaction type and quantity of at least 1.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let userId = req.user.id;
    if (membershipId) {
      const [users] = await connection.query('SELECT id FROM users WHERE LOWER(membership_id)=LOWER(?)', [membershipId]);
      if (!users.length) throw Object.assign(new Error('Membership ID was not found.'), { status: 404 });
      userId = users[0].id;
    }
    const [books] = await connection.query('SELECT * FROM books WHERE id=? FOR UPDATE', [bookId]);
    if (!books.length) throw Object.assign(new Error('Book not found.'), { status: 404 });
    const delta = type === 'borrow' ? -qty : qty;
    const next = Number(books[0].quantity) + delta;
    if (next < 0) throw Object.assign(new Error(`Only ${books[0].quantity} copies are currently available.`), { status: 400 });
    await connection.query('UPDATE books SET quantity=? WHERE id=?', [next, bookId]);
    const [saved] = await connection.query('INSERT INTO transactions(book_id,user_id,type,quantity,note) VALUES(?,?,?,?,?)', [bookId,userId,type,qty,note || null]);
    await connection.commit();
    const [[transaction]] = await pool.query('SELECT * FROM transactions WHERE id=?', [saved.insertId]);
    res.status(201).json(transaction);
  } catch (e) {
    await connection.rollback();
    res.status(e.status || 500).json({ message: e.message || 'Could not save transaction.' });
  } finally { connection.release(); }
}));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Server error. Check the backend terminal for details.' });
});

initialise()
  .then(() => app.listen(PORT, () => console.log(`Community Library API running at http://localhost:${PORT}`)))
  .catch(err => { console.error('Database initialisation failed:', err); process.exit(1); });
