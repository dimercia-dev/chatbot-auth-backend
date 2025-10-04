// components/EmailVerificationPage.jsx
import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Loader2, Mail, ArrowRight } from 'lucide-react';
import { useChatContext } from '../context/ChatContext';
import authApi from '../services/authApi';

const EmailVerificationPage = () => {
  const { setCurrentView, showNotification, getThemeClasses } = useChatContext();
  const [verificationStatus, setVerificationStatus] = useState('loading'); // loading, success, error
  const [message, setMessage] = useState('');
  
  const theme = getThemeClasses();

  useEffect(() => {
    const verifyEmail = async () => {
      // Extraire le token de l'URL
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token');
      
      // Alternative: extraire depuis le pathname si l'URL est /verify/TOKEN
      const pathToken = window.location.pathname.split('/verify/')[1];
      const verificationToken = token || pathToken;

      if (!verificationToken) {
        setVerificationStatus('error');
        setMessage('Token de vérification manquant');
        return;
      }

      try {
        const response = await authApi.verifyEmail(verificationToken);
        
        setVerificationStatus('success');
        setMessage(response.data?.message || 'Votre email a été vérifié avec succès !');
        
        showNotification('Email vérifié ! Vous pouvez maintenant vous connecter.', 'success');
        
        // Redirection automatique vers la page de connexion après 3 secondes
        setTimeout(() => {
          setCurrentView('login');
        }, 3000);
        
      } catch (error) {
        setVerificationStatus('error');
        setMessage(error.message || 'Erreur lors de la vérification');
        showNotification('Erreur de vérification', 'error');
      }
    };

    verifyEmail();
  }, [setCurrentView, showNotification]);

  const handleGoToLogin = () => {
    setCurrentView('login');
  };

  return (
    <div className={`min-h-screen ${theme.background} flex items-center justify-center p-4`}>
      <div className={`w-full max-w-md ${theme.card} rounded-3xl shadow-2xl p-8 border animate-fade-in`}>
        <div className="text-center">
          {/* Icône de statut */}
          <div className="mb-6">
            {verificationStatus === 'loading' && (
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center mx-auto animate-pulse">
                <Loader2 className="w-10 h-10 text-white animate-spin"/>
              </div>
            )}
            
            {verificationStatus === 'success' && (
              <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl flex items-center justify-center mx-auto animate-bounce">
                <CheckCircle className="w-10 h-10 text-white"/>
              </div>
            )}
            
            {verificationStatus === 'error' && (
              <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-pink-600 rounded-3xl flex items-center justify-center mx-auto">
                <XCircle className="w-10 h-10 text-white"/>
              </div>
            )}
          </div>

          {/* Titre */}
          <h1 className={`text-2xl font-bold ${theme.text} mb-4`}>
            {verificationStatus === 'loading' && 'Vérification en cours...'}
            {verificationStatus === 'success' && 'Email vérifié !'}
            {verificationStatus === 'error' && 'Erreur de vérification'}
          </h1>

          {/* Message */}
          <p className={`${theme.textSecondary} mb-6`}>
            {verificationStatus === 'loading' && 'Veuillez patienter pendant que nous vérifions votre email.'}
            {verificationStatus === 'success' && message}
            {verificationStatus === 'error' && message}
          </p>

          {/* Actions */}
          {verificationStatus === 'success' && (
            <div className="space-y-4">
              <button
                onClick={handleGoToLogin}
                className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl hover:from-green-600 hover:to-emerald-700 transition-all transform hover:scale-[1.02] font-semibold shadow-xl group flex items-center justify-center gap-2"
              >
                Se connecter maintenant
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform"/>
              </button>
              
              <p className={`text-xs ${theme.textSecondary}`}>
                Redirection automatique dans quelques secondes...
              </p>
            </div>
          )}

          {verificationStatus === 'error' && (
            <div className="space-y-4">
              <button
                onClick={handleGoToLogin}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-2xl hover:from-blue-600 hover:to-indigo-700 transition-all transform hover:scale-[1.02] font-semibold shadow-xl group flex items-center justify-center gap-2"
              >
                Retour à la connexion
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform"/>
              </button>
              
              <p className={`text-xs ${theme.textSecondary}`}>
                Si le problème persiste, contactez le support.
              </p>
            </div>
          )}

          {verificationStatus === 'loading' && (
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailVerificationPage;