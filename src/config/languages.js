/**
 * Global language configuration for Microsoft Bot.
 * Add or modify texts here to support different languages/countries.
 */

module.exports = {
  // Default fallback language
  default: 'id',

  id: {
    buttons: {
      next: [
        'Next',
        'Selanjutnya',
        'Continue',
        'Berikutnya',
        'Suivant',
        'Continuer',
        'Suivante',
        'Nächste',
      ],
      try_for_free: ['Try for free', 'Coba gratis', 'Essayez gratuitement', 'Essai gratuit'],
      setup_account: [
        'Set up account',
        'Setup Account',
        'Setup',
        'Set up',
        'Siapkan akun',
        'Atur Akun',
        'Siapkan Akun',
        'Atur',
        'Siapkan',
        'Create new account',
        'Create account',
        'Buat akun baru',
        'Buat akun',
        'Crear cuenta nueva',
        'Crear cuenta',
        'Créer un compte',
        'Configuration',
        'Configurer le compte',
        'Neues Konto erstellen',
        'Crea nuovo account',
        'Criar nova conta',
        'Mulai',
      ],
      verify: ['Verify', 'Vérifier', 'Verifikasi'],
      use_this_address: [
        'Use this address',
        'Use address',
        'Gunakan alamat ini',
        'Utiliser cette adresse',
      ],
      finish: ['Finish', 'Terminer', 'Selesai'],
      sign_in: ['Sign In', 'Sign-In', 'Masuk', 'Se connecter'],
      add_payment: [
        'Add payment method',
        'Tambah metode pembayaran',
        'Ajouter un mode de paiement',
      ],
      save: ['Save', 'Simpan', 'Enregistrer', 'Sauvegarder'],
    },
    selectors: {
      spinner_text: [
        'Tunggu sebentar',
        'Mohon tunggu',
        'Veuillez patienter',
        'Loading subtotal',
        'Chargement du sous-total',
      ],
      one_month: ['1 month', '1 bulan', '1 mes', '1 mois', '1 Monat', '1 mese', '1 mês'],
      verification_code: [
        'Verification code',
        'Kode verifikasi',
        'Code de vérification',
        'Entrez le code',
      ],
      rate_limit: [
        'too many requests',
        'reached the limit',
        'jumlah permintaan terlalu tinggi',
        'requêtes trop élevé',
      ],
      error_code_incorrect: ['code incorrect', 'incorrect code', 'code invalide', 'salah'],
      manual_review: [
        "We're checking to make sure we can offer you Microsoft products",
        "review process usually takes up to 2 days",
        "restricted until the review is complete",
        'Kami sedang memeriksa untuk memastikan kami dapat menawarkan produk',
        'Proses peninjauan biasanya memakan waktu hingga 2 hari',
      ],
    },
  },

  en: {
    buttons: {
      next: ['Next', 'Continue', 'Suivant', 'Continuer', 'Nächste'],
      try_for_free: ['Try for free', 'Essayez gratuitement', 'Essai gratuit'],
      setup_account: [
        'Set up account',
        'Setup Account',
        'Setup',
        'Set up',
        'Create new account',
        'Create account',
        'Créer un compte',
        'Configuration',
        'Configurer le compte',
        'Neues Konto erstellen',
      ],
      verify: ['Verify', 'Vérifier'],
      use_this_address: ['Use this address', 'Use address', 'Utiliser cette adresse'],
      finish: ['Finish', 'Terminer'],
      sign_in: ['Sign In', 'Sign-In', 'Se connecter'],
      add_payment: ['Add payment method', 'Ajouter un mode de paiement'],
      save: ['Save', 'Enregistrer', 'Sauvegarder'],
    },
    selectors: {
      spinner_text: [
        'Please wait',
        'Loading subtotal',
        'Veuillez patienter',
        'Chargement du sous-total',
      ],
      one_month: ['1 month', '1 mes', '1 mois', '1 Monat', '1 mese', '1 mês'],
      verification_code: ['Verification code', 'Code de vérification', 'Entrez le code'],
      rate_limit: ['too many requests', 'reached the limit', 'requêtes trop élevé'],
      error_code_incorrect: ['code incorrect', 'incorrect code', 'code invalide'],
      manual_review: [
        "We're checking to make sure we can offer you Microsoft products",
        "review process usually takes up to 2 days",
        "restricted until the review is complete",
      ],
    },
  },

  fr: {
    buttons: {
      next: ['Suivant', 'Continuer', 'Suivante', 'Next', 'Continue'],
      try_for_free: ['Essayez gratuitement', 'Essai gratuit', 'Try for free'],
      setup_account: [
        'Configurer le compte',
        'Configuration',
        'Créer un compte',
        'Set up account',
        'Setup Account',
      ],
      verify: ['Vérifier', 'Verify'],
      use_this_address: ['Utiliser cette adresse', 'Use this address', 'Use address'],
      finish: ['Terminer', 'Finish'],
      sign_in: ['Se connecter', 'Connexion', 'Sign In'],
      add_payment: ['Ajouter un mode de paiement', 'Add payment method'],
      save: ['Enregistrer', 'Sauvegarder', 'Save'],
    },
    selectors: {
      spinner_text: [
        'Veuillez patienter',
        'Chargement du sous-total',
        'Please wait',
        'Loading subtotal',
      ],
      one_month: ['1 mois', '1 month', '1 mes', '1 Monat', '1 mese', '1 mês'],
      verification_code: ['Code de vérification', 'Entrez le code', 'Verification code'],
      rate_limit: ['requêtes trop élevé', 'too many requests', 'reached the limit'],
      error_code_incorrect: ['code incorrect', 'code invalide', 'incorrect code'],
      manual_review: [
        "We're checking to make sure we can offer you Microsoft products",
        "review process usually takes up to 2 days",
        "restricted until the review is complete",
      ],
    },
  },
};
