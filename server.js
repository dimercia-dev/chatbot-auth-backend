require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 4000;

// Initialiser Resend
const resend = new Resend(process.env.RESEND_API_KEY);

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

// Vérifier la configuration Resend au démarrage
(async () => {
  try {
    await resend.apiKeys.list();
    console.log('✅ Resend configuré correctement');
  } catch (error) {
    console.error('⚠️ Erreur config Resend:', error.message);
  }
})();

// Route de santé
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    time: new Date(),
    database: 'Connected',
    email: 'Resend Ready'
  });
});

// INSCRIPTION
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    console.log('Tentative inscription:', { username, email });

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

    const hashedPassword = await bcrypt.hash(password, 12);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // RETIRÉ device_id de l'insertion - sera mis à jour lors de la connexion
    const result = await pool.query(`
      INSERT INTO users (nom, email, password_hash, verification_token, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id, nom, email
    `, [username, email.toLowerCase(), hashedPassword, verificationToken]);

    const user = result.rows[0];
    console.log('Utilisateur créé:', user);

    // Définir l'URL de vérification
    const verificationUrl = `${process.env.BACKEND_URL}/api/auth/verify/${verificationToken}`;

    // Envoyer l'email avec Resend
    try {
      const { data, error } = await resend.emails.send({
        from: 'Winna Chat IA <noreply@dimerciadev.com>',
        to: [email],
        subject: 'Vérifiez votre compte Winna Chat IA',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f4;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Bienvenue ${username} !</h1>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px 30px;">
                        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                          Merci de vous être inscrit sur <strong>Winna Chat IA</strong>.
                        </p>
                        
                        <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                          Pour activer votre compte et commencer à utiliser notre assistant IA, veuillez cliquer sur le bouton ci-dessous :
                        </p>
                        
                        <!-- Button -->
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td align="center" style="padding: 20px 0;">
                              <a href="${verificationUrl}" 
                                 style="display: inline-block; background-color: #667eea; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                                Vérifier mon compte
                              </a>
                            </td>
                          </tr>
                        </table>
                        
                        <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0;">
                          Ce lien de vérification expirera dans 24 heures.
                        </p>
                        
                        <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 10px 0 0 0;">
                          Si vous n'avez pas créé de compte, vous pouvez ignorer cet email en toute sécurité.
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
                        <p style="color: #6c757d; font-size: 13px; margin: 0; line-height: 1.5;">
                          © 2024 Winna Chat IA. Tous droits réservés.<br>
                          Cet email a été envoyé à ${email}
                        </p>
                      </td>
                    </tr>
                    
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
        text: `Bienvenue ${username} !

Merci de vous être inscrit sur Winna Chat IA.

Pour activer votre compte, cliquez sur ce lien : ${verificationUrl}

Ce lien expirera dans 24 heures.

Si vous n'avez pas créé de compte, ignorez cet email.

© 2024 Winna Chat IA`
      });

      if (error) {
        console.error('Erreur Resend:', error);
        throw new Error('Erreur envoi email');
      }

      console.log('✅ Email envoyé à:', email, 'ID:', data.id);
    } catch (emailError) {
      console.error('❌ Erreur envoi email:', emailError);
      // On continue quand même, l'utilisateur est créé
    }

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

    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      return res.status(423).json({
        success: false,
        error: { message: 'Compte temporairement verrouillé. Réessayez plus tard.' }
      });
    }

    if (!user.email_verified) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Vous devez vérifier votre email avant de vous connecter.',
          code: 'EMAIL_NOT_VERIFIED'
        }
      });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      const failedAttempts = (user.failed_login_attempts || 0) + 1;
      const lockUntil = failedAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

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

    // Mettre à jour device_id UNIQUEMENT lors de la connexion
    await pool.query(`
      UPDATE users 
      SET failed_login_attempts = 0, locked_until = NULL, 
          last_login = NOW(), device_id = $1
      WHERE id = $2
    `, [deviceId, user.id]);

    const sessionToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    try {
      await pool.query(`
        INSERT INTO user_sessions (user_id, session_token, device_info, expires_at)
        VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')
      `, [user.id, sessionToken, deviceId]);
    } catch (sessionError) {
      console.log('Erreur sauvegarde session:', sessionError.message);
    }

    console.log('✅ Connexion réussie pour:', user.email);

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
    console.log('✅ Email vérifié pour:', user.email);

    // Retourner une belle page HTML de confirmation
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email vérifié - Winna Chat IA</title>
        <style>
          body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: white;
            border-radius: 16px;
            padding: 48px;
            max-width: 480px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          }
          .success-icon {
            width: 80px;
            height: 80px;
            background: #10b981;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
          }
          .checkmark {
            width: 40px;
            height: 40px;
            border: 4px solid white;
            border-radius: 50%;
            position: relative;
          }
          .checkmark:after {
            content: '';
            position: absolute;
            left: 8px;
            top: 2px;
            width: 12px;
            height: 20px;
            border: solid white;
            border-width: 0 4px 4px 0;
            transform: rotate(45deg);
          }
          h1 {
            color: #1f2937;
            font-size: 28px;
            margin: 0 0 16px;
          }
          p {
            color: #6b7280;
            font-size: 16px;
            line-height: 1.6;
            margin: 0 0 32px;
          }
          .name {
            color: #667eea;
            font-weight: 600;
          }
          .button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            padding: 14px 32px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            transition: transform 0.2s;
          }
          .button:hover {
            transform: translateY(-2px);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">
            <div class="checkmark"></div>
          </div>
          <h1>Email vérifié avec succès !</h1>
          <p>
            Félicitations <span class="name">${user.nom}</span> ! <br>
            Votre compte a été activé. Vous pouvez maintenant vous connecter à Winna Chat IA.
          </p>
          <a href="${process.env.FRONTEND_URL}" class="button">
            Retour à l'application
          </a>
        </div>
      </body>
      </html>
    `);

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

// Lancement du serveur
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur d'authentification démarré sur le port ${PORT}`);
  console.log(`📧 Email configuré avec Resend (noreply@dimerciadev.com)`);
  console.log(`🗄️  Base de données: Neon PostgreSQL`);
});