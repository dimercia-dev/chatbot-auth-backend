require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

transporter.verify((error, success) => {
  if (error) {
    console.error('Erreur config email:', error);
  } else {
    console.log('✅ Email configuré correctement');
  }
});

// Route de santé
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    time: new Date(),
    database: 'Connected',
    email: 'Ready'
  });
});

// INSCRIPTION
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, email, password, deviceId } = req.body;

    console.log('Tentative inscription:', { username, email, deviceId });

    // Validations
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: { message: 'Tous les champs sont requis' }
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: { message: 'Le mot de passe doit contenir au moins 6 caractères' }
      });
    }

    // Vérifier si l'utilisateur existe
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: { message: 'Cette adresse email est déjà utilisée' }
      });
    }

    // Hash du mot de passe
    const hashedPassword = await bcrypt.hash(password, 12);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Insérer l'utilisateur
    const result = await pool.query(`
      INSERT INTO users (nom, email, password_hash, verification_token, device_id, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id, nom, email
    `, [username, email.toLowerCase(), hashedPassword, verificationToken, deviceId]);

    const user = result.rows[0];
    console.log('Utilisateur créé:', user);

    // Envoyer l'email de vérification
    const verificationUrl = `${process.env.FRONTEND_URL}/verify?token=${verificationToken}`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Vérifiez votre compte - Assistant IA',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">Bienvenue ${username} !</h1>
          </div>
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px;">Merci de vous être inscrit sur <strong>Assistant IA Pro</strong>.</p>
            <p style="font-size: 16px;">Pour activer votre compte, cliquez sur le bouton ci-dessous :</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" 
                 style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: bold;">
                Vérifier mon compte
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">Ce lien expire dans 24 heures.</p>
            <p style="color: #666; font-size: 14px;">Si vous n'avez pas créé ce compte, ignorez ce message.</p>
          </div>
        </div>
      `
    });

    console.log('Email envoyé à:', email);

    res.status(201).json({
      success: true,
      data: {
        message: 'Compte créé avec succès ! Vérifiez votre email pour l\'activer.',
        user: { id: user.id, nom: user.nom, email: user.email }
      }
    });

  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Erreur serveur lors de l\'inscription' }
    });
  }
});

// CONNEXION
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, deviceId } = req.body;

    console.log('Tentative connexion:', { email, deviceId });

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { message: 'Email et mot de passe requis' }
      });
    }

    // Récupérer l'utilisateur
    const result = await pool.query(`
      SELECT id, nom, email, password_hash, email_verified, failed_login_attempts, locked_until
      FROM users WHERE email = $1
    `, [email.toLowerCase()]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: { message: 'Email ou mot de passe incorrect' }
      });
    }

    const user = result.rows[0];

    // Vérifier si le compte est verrouillé
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      return res.status(423).json({
        success: false,
        error: { message: 'Compte temporairement verrouillé. Réessayez plus tard.' }
      });
    }

    // Vérifier si l'email est vérifié
    if (!user.email_verified) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Vous devez vérifier votre email avant de vous connecter.',
          code: 'EMAIL_NOT_VERIFIED'
        }
      });
    }

    // Vérifier le mot de passe
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      const failedAttempts = (user.failed_login_attempts || 0) + 1;
      const lockUntil = failedAttempts >= 5 ?
        new Date(Date.now() + 15 * 60 * 1000) : null;

      await pool.query(`
        UPDATE users 
        SET failed_login_attempts = $1, locked_until = $2
        WHERE id = $3
      `, [failedAttempts, lockUntil, user.id]);

      return res.status(401).json({
        success: false,
        error: { message: `Mot de passe incorrect (${failedAttempts}/5 tentatives)` }
      });
    }

    // Réinitialiser les tentatives échouées
    await pool.query(`
      UPDATE users 
      SET failed_login_attempts = 0, locked_until = NULL, 
          last_login = NOW(), device_id = $1
      WHERE id = $2
    `, [deviceId, user.id]);

    // Créer le token JWT
    const sessionToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Sauvegarder la session
    try {
      await pool.query(`
        INSERT INTO user_sessions (user_id, session_token, device_info, expires_at)
        VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')
      `, [user.id, sessionToken, deviceId]);
    } catch (sessionError) {
      console.log('Erreur sauvegarde session:', sessionError.message);
    }

    console.log('Connexion réussie pour:', user.email);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          nom: user.nom,
          email: user.email,
          emailVerified: user.email_verified
        },
        sessionToken,
        expiresIn: '7d'
      }
    });

  } catch (error) {
    console.error('Erreur login:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Erreur serveur lors de la connexion' }
    });
  }
});

// VÉRIFICATION EMAIL
app.get('/api/auth/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;

    console.log('Tentative vérification token:', token);

    const result = await pool.query(`
      UPDATE users 
      SET email_verified = true, verification_token = NULL, updated_at = NOW()
      WHERE verification_token = $1 AND email_verified = false
      RETURNING id, nom, email
    `, [token]);

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'Token de vérification invalide ou déjà utilisé' }
      });
    }

    const user = result.rows[0];
    console.log('Email vérifié pour:', user.email);

    res.json({
      success: true,
      data: {
        message: 'Email vérifié avec succès ! Vous pouvez maintenant vous connecter.',
        user: { nom: user.nom }
      }
    });

  } catch (error) {
    console.error('Erreur vérification:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Erreur lors de la vérification' }
    });
  }
});

// DÉCONNEXION
app.post('/api/auth/logout', async (req, res) => {
  try {
    const { sessionToken } = req.body;

    if (sessionToken) {
      await pool.query(`
        UPDATE user_sessions 
        SET is_active = false 
        WHERE session_token = $1
      `, [sessionToken]);
    }

    res.json({
      success: true,
      data: { message: 'Déconnexion réussie' }
    });

  } catch (error) {
    console.error('Erreur logout:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Erreur lors de la déconnexion' }
    });
  }
});

// Endpoint test d'envoi d'email
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

// Lancement du serveur
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur d'authentification démarré sur le port ${PORT}`);
  console.log(`📧 Email configuré avec: ${process.env.EMAIL_USER}`);
  console.log(`🗄️  Base de données: Neon PostgreSQL`);
});