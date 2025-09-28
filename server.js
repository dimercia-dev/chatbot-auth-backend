require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const crypto = require('crypto');

const PORT = process.env.PORT || 4000;


// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

// Connexion DB
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
pool.connect(err => {
  if (err) {
    console.error('Erreur connexion DB:', err);
  } else {
    console.log('✅ Connecté à la base Neon');
  }
});

// Config Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Vérifier la config email
transporter.verify((error, success) => {
  if (error) {
    console.error('Erreur config email:', error);
  } else {
    console.log('✅ Email configuré correctement');
  }
});

// Endpoint test d’envoi d’email
app.post('/send-email', async (req, res) => {
  const { to, subject, text } = req.body;
  if (!to || !subject || !text) {
    return res.status(400).json({ error: 'Champs manquants: to, subject, text' });
  }

  try {
    await transporter.sendMail({
      from: `"Mon App" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text
    });
    res.json({ success: true, message: 'Email envoyé !' });
  } catch (err) {
    console.error('Erreur envoi mail', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// … ici tes autres routes (signup, login, verify, logout etc.)
// (garde le même code mais sans re-déclarer express, nodemailer ou app.listen)

// Route de santé
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    time: new Date(),
    database: 'Connected',
    email: 'Ready'
  });
});

// Lancement du serveur UNE SEULE FOIS
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur d'authentification démarré sur le port ${PORT}`);
  console.log(`📧 Email configuré avec: ${process.env.EMAIL_USER}`);
  console.log(`🗄️  Base de données: Neon PostgreSQL`);
});
