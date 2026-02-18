require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/audiobooksdb')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

app.get('/', (req, res) => res.render('index', { title: 'Audiobooks REST API' }));
app.get('/audiobooks', (req, res) => res.json({ message: 'Audiobooks ready', related: [{ href: '/', rel: 'home' }] }));

app.listen(port, () => console.log(`Server on http://localhost:${port}`));
