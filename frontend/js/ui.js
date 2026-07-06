import {
  connectSolanaWallet,
  connectSocialWallet,
  connectWallet,
  defaultUsername,
  disconnectWallet,
  discoverWallets,
  ethers,
  exportGeneratedWalletPrivateKey,
  fetchEthUsdPrice,
  getChainOption,
  getGeneratedWalletInfo,
  getSavedWalletChoice,
  getSolanaProvider,
  hydrateUserProfile,
  loadUserProfile,
  restoreWalletFromSession,
  shortAddress,
  solanaWalletState,
  walletState,
  parseUiError
} from "./core.js?v=20260703sharedauth";

export function setAlert(el, message, isError = false) {
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("error", Boolean(isError));
}

let copyToastEl = null;
let copyToastTimer = null;
const REFERRAL_PENDING_KEY = "pumpr.referral.pending.v1";
const REFERRAL_CONNECT_SESSION_KEY = "pumpr.referral.connect.sent.v1";
const LANGUAGE_STORAGE_KEY = "pumpr.language.v1";
const LANGUAGE_OPTIONS = [
  { code: "en", label: "English", short: "EN" },
  { code: "es", label: "Español", short: "ES" },
  { code: "zh", label: "中文", short: "ZH" },
  { code: "ko", label: "한국어", short: "KO" },
  { code: "ja", label: "日本語", short: "JA" },
  { code: "hi", label: "हिन्दी", short: "HI" },
  { code: "tr", label: "Türkçe", short: "TR" },
  { code: "ar", label: "العربية", short: "AR" },
  { code: "pt", label: "Português", short: "PT" },
  { code: "fr", label: "Français", short: "FR" }
];
const UI_TRANSLATIONS = {
  en: {
    Home: "Home",
    Onboard: "Onboard",
    GO: "GO",
    Alpha: "Alpha",
    "Alpha Tips": "Alpha Tips",
    Agents: "Agents",
    Airdrop: "Airdrop",
    Referrals: "Referrals",
    "PUMPR Card": "PUMPR Card",
    "Android APK": "Android APK",
    Profile: "Profile",
    Communities: "Communities",
    Support: "Support",
    Terminal: "Terminal",
    Create: "Create",
    "+ Create": "+ Create",
    "Join waitlist": "Join waitlist",
    "Sign in": "Sign in",
    "Sign in with Phantom": "Sign in with Phantom",
    "Log out": "Log out",
    "View profile": "View profile",
    Balance: "Balance",
    Browse: "Browse",
    "Export key": "Export key"
  },
  es: {
    Home: "Inicio",
    Onboard: "Guía",
    GO: "GO",
    Alpha: "Alpha",
    "Alpha Tips": "Tips Alpha",
    Agents: "Agentes",
    Airdrop: "Airdrop",
    Referrals: "Referidos",
    "PUMPR Card": "Tarjeta PUMPR",
    "Android APK": "APK Android",
    Profile: "Perfil",
    Communities: "Comunidades",
    Support: "Soporte",
    Terminal: "Terminal",
    Create: "Crear",
    "+ Create": "+ Crear",
    "Join waitlist": "Unirse",
    "Sign in": "Entrar",
    "Sign in with Phantom": "Entrar con Phantom",
    "Log out": "Salir",
    "View profile": "Ver perfil",
    Balance: "Balance",
    Browse: "Explorar",
    "Export key": "Exportar clave"
  },
  zh: {
    Home: "首页",
    Onboard: "入门",
    GO: "GO",
    Alpha: "Alpha",
    "Alpha Tips": "Alpha 提示",
    Agents: "代理",
    Airdrop: "空投",
    Referrals: "推荐",
    "PUMPR Card": "PUMPR 卡",
    "Android APK": "Android APK",
    Profile: "个人资料",
    Communities: "社区",
    Support: "支持",
    Terminal: "终端",
    Create: "创建",
    "+ Create": "+ 创建",
    "Join waitlist": "加入候补",
    "Sign in": "登录",
    "Sign in with Phantom": "用 Phantom 登录",
    "Log out": "退出",
    "View profile": "查看资料",
    Balance: "余额",
    Browse: "浏览",
    "Export key": "导出密钥"
  },
  ko: {
    Home: "홈",
    Onboard: "온보딩",
    GO: "GO",
    Alpha: "알파",
    "Alpha Tips": "알파 팁",
    Agents: "에이전트",
    Airdrop: "에어드롭",
    Referrals: "추천",
    "PUMPR Card": "PUMPR 카드",
    "Android APK": "Android APK",
    Profile: "프로필",
    Communities: "커뮤니티",
    Support: "지원",
    Terminal: "터미널",
    Create: "생성",
    "+ Create": "+ 생성",
    "Join waitlist": "대기 등록",
    "Sign in": "로그인",
    "Sign in with Phantom": "Phantom 로그인",
    "Log out": "로그아웃",
    "View profile": "프로필 보기",
    Balance: "잔액",
    Browse: "둘러보기",
    "Export key": "키 내보내기"
  },
  ja: {
    Home: "ホーム",
    Onboard: "オンボード",
    GO: "GO",
    Alpha: "アルファ",
    "Alpha Tips": "アルファ情報",
    Agents: "エージェント",
    Airdrop: "エアドロップ",
    Referrals: "紹介",
    "PUMPR Card": "PUMPRカード",
    "Android APK": "Android APK",
    Profile: "プロフィール",
    Communities: "コミュニティ",
    Support: "サポート",
    Terminal: "ターミナル",
    Create: "作成",
    "+ Create": "+ 作成",
    "Join waitlist": "待機登録",
    "Sign in": "ログイン",
    "Sign in with Phantom": "Phantomでログイン",
    "Log out": "ログアウト",
    "View profile": "プロフィールを見る",
    Balance: "残高",
    Browse: "見る",
    "Export key": "キーを出力"
  },
  hi: {
    Home: "होम",
    Onboard: "ऑनबोर्ड",
    GO: "GO",
    Alpha: "अल्फा",
    "Alpha Tips": "अल्फा टिप्स",
    Agents: "एजेंट",
    Airdrop: "एयरड्रॉप",
    Referrals: "रेफरल",
    "PUMPR Card": "PUMPR कार्ड",
    "Android APK": "Android APK",
    Profile: "प्रोफाइल",
    Communities: "कम्युनिटी",
    Support: "सपोर्ट",
    Terminal: "टर्मिनल",
    Create: "बनाएं",
    "+ Create": "+ बनाएं",
    "Join waitlist": "वेटलिस्ट",
    "Sign in": "साइन इन",
    "Sign in with Phantom": "Phantom से साइन इन",
    "Log out": "लॉग आउट",
    "View profile": "प्रोफाइल देखें",
    Balance: "बैलेंस",
    Browse: "ब्राउज़",
    "Export key": "की एक्सपोर्ट"
  },
  tr: {
    Home: "Ana Sayfa",
    Onboard: "Başlangıç",
    GO: "GO",
    Alpha: "Alpha",
    "Alpha Tips": "Alpha İpuçları",
    Agents: "Ajanlar",
    Airdrop: "Airdrop",
    Referrals: "Referanslar",
    "PUMPR Card": "PUMPR Kart",
    "Android APK": "Android APK",
    Profile: "Profil",
    Communities: "Topluluklar",
    Support: "Destek",
    Terminal: "Terminal",
    Create: "Oluştur",
    "+ Create": "+ Oluştur",
    "Join waitlist": "Listeye katıl",
    "Sign in": "Giriş yap",
    "Sign in with Phantom": "Phantom ile giriş",
    "Log out": "Çıkış yap",
    "View profile": "Profili gör",
    Balance: "Bakiye",
    Browse: "Gez",
    "Export key": "Anahtarı dışa aktar"
  },
  ar: {
    Home: "الرئيسية",
    Onboard: "البدء",
    GO: "GO",
    Alpha: "ألفا",
    "Alpha Tips": "نصائح ألفا",
    Agents: "الوكلاء",
    Airdrop: "إيردروب",
    Referrals: "الإحالات",
    "PUMPR Card": "بطاقة PUMPR",
    "Android APK": "Android APK",
    Profile: "الملف",
    Communities: "المجتمعات",
    Support: "الدعم",
    Terminal: "الطرفية",
    Create: "إنشاء",
    "+ Create": "+ إنشاء",
    "Join waitlist": "قائمة الانتظار",
    "Sign in": "تسجيل",
    "Sign in with Phantom": "تسجيل عبر Phantom",
    "Log out": "خروج",
    "View profile": "عرض الملف",
    Balance: "الرصيد",
    Browse: "تصفح",
    "Export key": "تصدير المفتاح"
  },
  pt: {
    Home: "Início",
    Onboard: "Começar",
    GO: "GO",
    Alpha: "Alpha",
    "Alpha Tips": "Dicas Alpha",
    Agents: "Agentes",
    Airdrop: "Airdrop",
    Referrals: "Indicações",
    "PUMPR Card": "Cartão PUMPR",
    "Android APK": "APK Android",
    Profile: "Perfil",
    Communities: "Comunidades",
    Support: "Suporte",
    Terminal: "Terminal",
    Create: "Criar",
    "+ Create": "+ Criar",
    "Join waitlist": "Entrar na lista",
    "Sign in": "Entrar",
    "Sign in with Phantom": "Entrar com Phantom",
    "Log out": "Sair",
    "View profile": "Ver perfil",
    Balance: "Saldo",
    Browse: "Explorar",
    "Export key": "Exportar chave"
  },
  fr: {
    Home: "Accueil",
    Onboard: "Démarrer",
    GO: "GO",
    Alpha: "Alpha",
    "Alpha Tips": "Tips Alpha",
    Agents: "Agents",
    Airdrop: "Airdrop",
    Referrals: "Parrainage",
    "PUMPR Card": "Carte PUMPR",
    "Android APK": "APK Android",
    Profile: "Profil",
    Communities: "Communautés",
    Support: "Support",
    Terminal: "Terminal",
    Create: "Créer",
    "+ Create": "+ Créer",
    "Join waitlist": "Liste d'attente",
    "Sign in": "Connexion",
    "Sign in with Phantom": "Connexion Phantom",
    "Log out": "Déconnexion",
    "View profile": "Voir profil",
    Balance: "Solde",
    Browse: "Explorer",
    "Export key": "Exporter clé"
  }
};
const EXTRA_TRANSLATIONS = {
  en: {
    "Select language": "Select language",
    "Language set to": "Language set to",
    "Pump Fun Remastered is better": "Pump Fun Remastered is better",
    "Official Pump Fun Token Coming Soon": "Official Pump Fun Token Coming Soon",
    "mobile app coming soon": "mobile app coming soon",
    "Trade faster. Track creator stats and holdings.": "Trade faster. Track creator stats and holdings.",
    "Search by coin, symbol, address...": "Search by coin, symbol, address...",
    "Search wallet address (0x or SOL...)": "Search wallet address (0x or SOL...)",
    "Search agents, skills, targets...": "Search agents, skills, targets...",
    "Search GO bounties, submissions, agents...": "Search GO bounties, submissions, agents...",
    "Top communities": "Top communities",
    "Trending now": "Trending now",
    "Explore coins": "Explore coins",
    "Movers": "Movers",
    "New": "New",
    "Market cap": "Market cap",
    "Oldest": "Oldest",
    "Last trade": "Last trade",
    "Watchlist": "Watchlist",
    "Created coins": "Created coins",
    Portfolio: "Portfolio",
    Balances: "Balances",
    Coins: "Coins",
    "Creator Rewards": "Creator Rewards",
    Notifications: "Notifications",
    Followers: "Followers",
    Following: "Following",
    "No created coins yet.": "No created coins yet.",
    "No balances found for this profile.": "No balances found for this profile.",
    "Load a profile to see details.": "Load a profile to see details.",
    "Launch coin": "Launch coin",
    "Token economics and advanced fields": "Token economics and advanced fields",
    "Total supply": "Total supply",
    "Creator allocation (%)": "Creator allocation (%)",
    "Optional starter buy (ETH)": "Optional starter buy (ETH)",
    "Image URL (optional override)": "Image URL (optional override)",
    "Token trade tax (%)": "Token trade tax (%)",
    "Pump.fun creator wallet (optional)": "Pump.fun creator wallet (optional)",
    "Manlet Mode": "Manlet Mode",
    "Send tokens after launch": "Send tokens after launch",
    "Wallet list": "Wallet list",
    "SOL buy amount": "SOL buy amount",
    "Estimated tokens": "Estimated tokens",
    "Estimated supply": "Estimated supply",
    "Token send is off.": "Token send is off.",
    "Official holder airdrop": "Official holder airdrop",
    "Official token": "Official token",
    "Reward target": "Reward target",
    "Preview split": "Preview split",
    "How payout works": "How payout works",
    "Reward source": "Reward source",
    "Official token only": "Official token only",
    "Completed drop": "Completed drop",
    "Total allocated": "Total allocated",
    "Eligible holders": "Eligible holders",
    "Per holder": "Per holder",
    Holder: "Holder",
    Received: "Received",
    Share: "Share",
    "Holding since": "Holding since",
    Proof: "Proof",
    Solana: "Solana",
    beta: "beta",
    waitlist: "waitlist",
    "Referral beta": "Referral beta",
    "Referral rewards": "Referral rewards",
    "Referral name": "Referral name",
    "Your referral beta": "Your referral beta",
    "Link and QR": "Link and QR",
    "Copy link": "Copy link",
    "Download QR": "Download QR",
    "How it works": "How it works",
    Tier: "Tier",
    "Connected wallet": "Connected wallet",
    "Connect wallet to generate link": "Connect wallet to generate link",
    Refresh: "Refresh",
    Save: "Save",
    "PUMPR Card waitlist": "PUMPR Card waitlist",
    "Coming soon": "Coming soon",
    "Get early access": "Get early access",
    "Enter your email": "Enter your email",
    "Alpha vault": "Alpha vault",
    "Submit alpha": "Submit alpha",
    "Share an alpha tip": "Share an alpha tip",
    "Full alpha": "Full alpha",
    "Evidence file": "Evidence file",
    "Choose evidence": "Choose evidence",
    "No evidence selected": "No evidence selected",
    Category: "Category",
    Confidence: "Confidence",
    "Tip wallet": "Tip wallet",
    "Publish alpha": "Publish alpha",
    Cancel: "Cancel",
    High: "High",
    "I'm a Human": "I'm a Human",
    "I'm an Agent": "I'm an Agent",
    "Join Pump-r": "Join Pump-r",
    "Preview skill.md": "Preview skill.md",
    "Register an agent": "Register an agent",
    Name: "Name",
    Summary: "Summary",
    Goals: "Goals",
    "Import SKILLS.md": "Import SKILLS.md",
    "Run agent": "Run agent",
    "No wallet needed": "No wallet needed",
    "Meme coin training arena.": "Meme coin training arena.",
    Learn: "Learn",
    Play: "Play",
    Compete: "Compete",
    Belong: "Belong",
    Level: "Level",
    "Fake portfolio": "Fake portfolio",
    "Next quest": "Next quest",
    Badges: "Badges",
    "Open on phone": "Open on phone",
    Connect: "Connect",
    Disconnect: "Disconnect",
    Deposit: "Deposit",
    Trade: "Trade",
    "Buy crypto": "Buy crypto",
    History: "History",
    "Copy address": "Copy address",
    "Crypto transfer": "Crypto transfer",
    "Card / bank": "Card / bank",
    "All activity": "All activity",
    Available: "Available",
    "YOUR BALANCE": "YOUR BALANCE",
    "Export private key": "Export private key",
    "Copy private key": "Copy private key",
    "Generated wallet": "Generated wallet",
    "Wallet activity": "Wallet activity",
    "Pump-r tokens": "Pump-r tokens",
    Done: "Done",
    "Edit profile": "Edit profile",
    Username: "Username",
    Bio: "Bio",
    "Describe your profile": "Describe your profile",
    "Choose username": "Choose username",
    Remove: "Remove",
    Copy: "Copy",
    Copied: "Copied",
    Close: "Close",
    Submit: "Submit",
    Confirm: "Confirm",
    "Open token": "Open token",
    "Not connected": "Not connected",
    Guest: "Guest"
  },
  es: {
    "Select language": "Seleccionar idioma",
    "Language set to": "Idioma cambiado a",
    "Pump Fun Remastered is better": "Pump Fun Remastered es mejor",
    "Official Pump Fun Token Coming Soon": "Token oficial de Pump Fun próximamente",
    "mobile app coming soon": "app móvil próximamente",
    "Trade faster. Track creator stats and holdings.": "Opera más rápido. Sigue estadísticas de creadores y holdings.",
    "Search by coin, symbol, address...": "Buscar por moneda, símbolo o dirección...",
    "Search wallet address (0x or SOL...)": "Buscar wallet (0x o SOL...)",
    "Search agents, skills, targets...": "Buscar agentes, skills, objetivos...",
    "Search GO bounties, submissions, agents...": "Buscar bounties GO, envíos, agentes...",
    "Top communities": "Comunidades top",
    "Trending now": "Tendencia ahora",
    "Explore coins": "Explorar monedas",
    Movers: "Movers",
    New: "Nuevo",
    "Market cap": "Capitalización",
    Oldest: "Más antiguo",
    "Last trade": "Último trade",
    Watchlist: "Watchlist",
    "Created coins": "Monedas creadas",
    Portfolio: "Portafolio",
    Balances: "Balances",
    Coins: "Monedas",
    "Creator Rewards": "Recompensas de creadores",
    Notifications: "Notificaciones",
    Followers: "Seguidores",
    Following: "Siguiendo",
    "No created coins yet.": "Aún no hay monedas creadas.",
    "No balances found for this profile.": "No se encontraron balances para este perfil.",
    "Load a profile to see details.": "Carga un perfil para ver detalles.",
    "Launch coin": "Lanzar moneda",
    "Token economics and advanced fields": "Economía del token y campos avanzados",
    "Total supply": "Supply total",
    "Creator allocation (%)": "Asignación del creador (%)",
    "Optional starter buy (ETH)": "Compra inicial opcional (ETH)",
    "Image URL (optional override)": "URL de imagen (opcional)",
    "Token trade tax (%)": "Impuesto de trade (%)",
    "Pump.fun creator wallet (optional)": "Wallet creadora Pump.fun (opcional)",
    "Manlet Mode": "Modo Manlet",
    "Send tokens after launch": "Enviar tokens tras lanzar",
    "Wallet list": "Lista de wallets",
    "SOL buy amount": "Cantidad de compra SOL",
    "Estimated tokens": "Tokens estimados",
    "Estimated supply": "Supply estimado",
    "Token send is off.": "Envío de tokens apagado.",
    "Official holder airdrop": "Airdrop oficial para holders",
    "Official token": "Token oficial",
    "Reward target": "Objetivo de recompensa",
    "Preview split": "Previsualizar reparto",
    "How payout works": "Cómo funciona el pago",
    "Reward source": "Fuente de recompensa",
    "Official token only": "Solo token oficial",
    "Completed drop": "Drop completado",
    "Total allocated": "Total asignado",
    "Eligible holders": "Holders elegibles",
    "Per holder": "Por holder",
    Holder: "Holder",
    Received: "Recibido",
    Share: "Participación",
    "Holding since": "Holding desde",
    Proof: "Prueba",
    Solana: "Solana",
    beta: "beta",
    waitlist: "lista",
    "Referral beta": "Beta de referidos",
    "Referral rewards": "Recompensas por referidos",
    "Referral name": "Nombre de referido",
    "Your referral beta": "Tu beta de referidos",
    "Link and QR": "Link y QR",
    "Copy link": "Copiar link",
    "Download QR": "Descargar QR",
    "How it works": "Cómo funciona",
    Tier: "Nivel",
    "Connected wallet": "Wallet conectada",
    "Connect wallet to generate link": "Conecta wallet para generar link",
    Refresh: "Actualizar",
    Save: "Guardar",
    "PUMPR Card waitlist": "Lista PUMPR Card",
    "Coming soon": "Próximamente",
    "Get early access": "Acceso anticipado",
    "Enter your email": "Ingresa tu email",
    "Alpha vault": "Bóveda alpha",
    "Submit alpha": "Enviar alpha",
    "Share an alpha tip": "Compartir tip alpha",
    "Full alpha": "Alpha completa",
    "Evidence file": "Archivo de evidencia",
    "Choose evidence": "Elegir evidencia",
    "No evidence selected": "Sin evidencia",
    Category: "Categoría",
    Confidence: "Confianza",
    "Tip wallet": "Wallet de tip",
    "Publish alpha": "Publicar alpha",
    Cancel: "Cancelar",
    High: "Alta",
    "I'm a Human": "Soy humano",
    "I'm an Agent": "Soy agente",
    "Join Pump-r": "Únete a Pump-r",
    "Preview skill.md": "Vista skill.md",
    "Register an agent": "Registrar agente",
    Name: "Nombre",
    Summary: "Resumen",
    Goals: "Objetivos",
    "Import SKILLS.md": "Importar SKILLS.md",
    "Run agent": "Ejecutar agente",
    "No wallet needed": "Sin wallet necesaria",
    "Meme coin training arena.": "Arena de entrenamiento meme coin.",
    Learn: "Aprender",
    Play: "Jugar",
    Compete: "Competir",
    Belong: "Pertenecer",
    Level: "Nivel",
    "Fake portfolio": "Portafolio demo",
    "Next quest": "Próxima misión",
    Badges: "Insignias",
    "Open on phone": "Abrir en móvil",
    Connect: "Conectar",
    Disconnect: "Desconectar",
    Deposit: "Depositar",
    Trade: "Trade",
    "Buy crypto": "Comprar crypto",
    History: "Historial",
    "Copy address": "Copiar dirección",
    "Crypto transfer": "Transferencia crypto",
    "Card / bank": "Tarjeta / banco",
    "All activity": "Toda actividad",
    Available: "Disponible",
    "YOUR BALANCE": "TU BALANCE",
    "Export private key": "Exportar clave privada",
    "Copy private key": "Copiar clave privada",
    "Generated wallet": "Wallet generada",
    "Wallet activity": "Actividad de wallet",
    "Pump-r tokens": "Tokens Pump-r",
    Done: "Listo",
    "Edit profile": "Editar perfil",
    Username: "Usuario",
    Bio: "Bio",
    "Describe your profile": "Describe tu perfil",
    "Choose username": "Elige usuario",
    Remove: "Quitar",
    Copy: "Copiar",
    Copied: "Copiado",
    Close: "Cerrar",
    Submit: "Enviar",
    Confirm: "Confirmar",
    "Open token": "Abrir token",
    "Not connected": "No conectado",
    Guest: "Invitado"
  },
  fr: {
    "Select language": "Choisir la langue",
    "Language set to": "Langue changée en",
    "Pump Fun Remastered is better": "Pump Fun Remastered est meilleur",
    "Official Pump Fun Token Coming Soon": "Token officiel Pump Fun bientôt",
    "mobile app coming soon": "application mobile bientôt",
    "Trade faster. Track creator stats and holdings.": "Tradez plus vite. Suivez les stats créateurs et holdings.",
    "Search by coin, symbol, address...": "Rechercher par coin, symbole, adresse...",
    "Search wallet address (0x or SOL...)": "Rechercher un wallet (0x ou SOL...)",
    "Top communities": "Top communautés",
    "Trending now": "Tendance",
    "Explore coins": "Explorer les coins",
    New: "Nouveau",
    "Market cap": "Capitalisation",
    Oldest: "Plus ancien",
    "Last trade": "Dernier trade",
    "Created coins": "Coins créés",
    Portfolio: "Portefeuille",
    Balances: "Soldes",
    Coins: "Coins",
    "Creator Rewards": "Récompenses créateurs",
    Notifications: "Notifications",
    Followers: "Abonnés",
    Following: "Abonnements",
    "Launch coin": "Lancer le coin",
    "Total supply": "Supply totale",
    "Creator allocation (%)": "Allocation créateur (%)",
    "Send tokens after launch": "Envoyer des tokens après lancement",
    "Wallet list": "Liste wallets",
    "SOL buy amount": "Montant d'achat SOL",
    "Official holder airdrop": "Airdrop officiel holders",
    "Official token": "Token officiel",
    "Preview split": "Aperçu répartition",
    "How payout works": "Fonctionnement du paiement",
    "Completed drop": "Drop terminé",
    Holder: "Holder",
    Received: "Reçu",
    Share: "Part",
    "Holding since": "Hold depuis",
    beta: "bêta",
    waitlist: "liste",
    "Referral name": "Nom de parrainage",
    "Link and QR": "Lien et QR",
    Refresh: "Actualiser",
    Save: "Enregistrer",
    "Coming soon": "Bientôt",
    "Enter your email": "Entrez votre email",
    "Submit alpha": "Soumettre alpha",
    "Publish alpha": "Publier alpha",
    Cancel: "Annuler",
    High: "Élevée",
    "I'm a Human": "Je suis humain",
    "I'm an Agent": "Je suis agent",
    Name: "Nom",
    Summary: "Résumé",
    Goals: "Objectifs",
    Learn: "Apprendre",
    Play: "Jouer",
    Compete: "Concourir",
    Belong: "Appartenir",
    Connect: "Connecter",
    Disconnect: "Déconnecter",
    Deposit: "Dépôt",
    Trade: "Trader",
    "Buy crypto": "Acheter crypto",
    History: "Historique",
    "Copy address": "Copier adresse",
    "Generated wallet": "Wallet généré",
    "Wallet activity": "Activité wallet",
    "Pump-r tokens": "Tokens Pump-r",
    Available: "Disponible",
    "Edit profile": "Modifier profil",
    Username: "Nom d'utilisateur",
    Bio: "Bio",
    Copy: "Copier",
    Copied: "Copié",
    Close: "Fermer",
    Submit: "Soumettre",
    "Not connected": "Non connecté",
    Guest: "Invité"
  },
  pt: {
    "Select language": "Selecionar idioma",
    "Language set to": "Idioma alterado para",
    "Pump Fun Remastered is better": "Pump Fun Remastered é melhor",
    "mobile app coming soon": "app móvel em breve",
    "Top communities": "Top comunidades",
    "Trending now": "Em alta agora",
    "Explore coins": "Explorar moedas",
    New: "Novo",
    "Market cap": "Valor de mercado",
    "Created coins": "Moedas criadas",
    Portfolio: "Portfólio",
    Balances: "Saldos",
    Coins: "Moedas",
    Followers: "Seguidores",
    Following: "Seguindo",
    "Launch coin": "Lançar moeda",
    "Total supply": "Supply total",
    "Official holder airdrop": "Airdrop oficial para holders",
    "Official token": "Token oficial",
    Holder: "Holder",
    Received: "Recebido",
    Share: "Participação",
    "Holding since": "Segurando desde",
    beta: "beta",
    waitlist: "lista",
    Refresh: "Atualizar",
    Save: "Salvar",
    "Coming soon": "Em breve",
    Cancel: "Cancelar",
    High: "Alta",
    Connect: "Conectar",
    Disconnect: "Desconectar",
    Deposit: "Depositar",
    "Buy crypto": "Comprar cripto",
    "Copy address": "Copiar endereço",
    "Generated wallet": "Wallet gerada",
    "Wallet activity": "Atividade da wallet",
    "Pump-r tokens": "Tokens Pump-r",
    Available: "Disponível",
    "Edit profile": "Editar perfil",
    Username: "Usuário",
    Bio: "Bio",
    Copy: "Copiar",
    Copied: "Copiado",
    Close: "Fechar",
    Submit: "Enviar",
    "Not connected": "Não conectado",
    Guest: "Convidado"
  }
};
Object.assign(EXTRA_TRANSLATIONS, {
  zh: {
    "Select language": "选择语言",
    "Language set to": "语言已设置为",
    "Pump Fun Remastered is better": "Pump Fun Remastered 更好",
    "Official Pump Fun Token Coming Soon": "官方 Pump Fun 代币即将推出",
    "mobile app coming soon": "移动应用即将推出",
    "Trade faster. Track creator stats and holdings.": "更快交易。追踪创作者数据和持仓。",
    "Search by coin, symbol, address...": "按币名、符号、地址搜索...",
    "Search wallet address (0x or SOL...)": "搜索钱包地址 (0x 或 SOL...)",
    "Top communities": "热门社区",
    "Trending now": "当前趋势",
    "Explore coins": "探索代币",
    Movers: "上涨榜",
    New: "最新",
    "Market cap": "市值",
    Oldest: "最早",
    "Last trade": "最近交易",
    Watchlist: "关注列表",
    "Created coins": "已创建代币",
    Portfolio: "投资组合",
    Balances: "余额",
    Coins: "代币",
    "Creator Rewards": "创作者奖励",
    Notifications: "通知",
    Followers: "粉丝",
    Following: "关注中",
    "No created coins yet.": "还没有创建代币。",
    "No balances found for this profile.": "此资料未找到余额。",
    "Load a profile to see details.": "加载资料以查看详情。",
    "Launch coin": "发行代币",
    "Coin details": "代币详情",
    "Coin name": "代币名称",
    Ticker: "代币符号",
    "Description (optional)": "描述（可选）",
    "Name your coin": "为你的代币命名",
    "Add a coin ticker (e.g. DOGE)": "添加代币符号（例如 DOGE）",
    "Write a short description": "写一个简短描述",
    "Add social links (optional)": "添加社交链接（可选）",
    "Select video or image to upload": "选择视频或图片上传",
    "or drag and drop it here": "或拖放到这里",
    "Select file": "选择文件",
    "File size and type": "文件大小和类型",
    "Image under 900 KB recommended": "建议图片小于 900 KB",
    "Resolution and aspect ratio": "分辨率和宽高比",
    "Image 1:1 recommended": "建议图片 1:1",
    "Banner 16:9 optional": "横幅 16:9 可选",
    "Pump.fun dev wallet buy (SOL)": "Pump.fun 开发钱包买入 (SOL)",
    "Optional initial buy from the connected Phantom/dev wallet in the same Pump.fun launch transaction.": "可选：在同一笔 Pump.fun 发行交易中，用已连接的 Phantom/开发钱包进行初始买入。",
    "Token economics and advanced fields": "代币经济和高级字段",
    "Total supply": "总供应量",
    "Creator allocation (%)": "创作者分配 (%)",
    "Optional starter buy (ETH)": "可选初始买入 (ETH)",
    "Image URL (optional override)": "图片 URL（可选覆盖）",
    "Token trade tax (%)": "交易税 (%)",
    "Pump.fun creator wallet (optional)": "Pump.fun 创作者钱包（可选）",
    "A preview of how the coin will look like": "代币预览效果",
    "Your Coin": "你的代币",
    "Your coin description appears here.": "你的代币描述会显示在这里。",
    "Manlet Mode": "Manlet 模式",
    "Send tokens after launch": "发行后发送代币",
    "Wallet list": "钱包列表",
    "SOL buy amount": "SOL 买入数量",
    "Estimated tokens": "预计代币",
    "Estimated supply": "预计供应占比",
    "Token send is off.": "代币发送已关闭。",
    "Official holder airdrop": "官方持有人空投",
    "Official token": "官方代币",
    "Reward target": "奖励目标",
    "Preview split": "预览分配",
    "How payout works": "奖励如何发放",
    "Reward source": "奖励来源",
    "Official token only": "仅官方代币",
    "Completed drop": "已完成空投",
    "Total allocated": "总分配",
    "Eligible holders": "符合条件持有人",
    "Per holder": "每位持有人",
    Holder: "持有人",
    Received: "已收到",
    Share: "占比",
    "Holding since": "持有起始",
    Proof: "证明",
    beta: "测试版",
    waitlist: "候补名单",
    "Referral beta": "推荐测试版",
    "Referral rewards": "推荐奖励",
    "Referral name": "推荐名称",
    "Link and QR": "链接和二维码",
    Refresh: "刷新",
    Save: "保存",
    "Coming soon": "即将推出",
    "Enter your email": "输入你的邮箱",
    "Submit alpha": "提交 Alpha",
    "Publish alpha": "发布 Alpha",
    Cancel: "取消",
    High: "高",
    "I'm a Human": "我是用户",
    "I'm an Agent": "我是代理",
    Name: "名称",
    Summary: "摘要",
    Goals: "目标",
    Learn: "学习",
    Play: "体验",
    Compete: "竞赛",
    Belong: "社区",
    Connect: "连接",
    Disconnect: "断开",
    Deposit: "充值",
    Trade: "交易",
    "Buy crypto": "购买加密货币",
    History: "历史",
    "Copy address": "复制地址",
    Available: "可用",
    "Generated wallet": "生成的钱包",
    "Wallet activity": "钱包活动",
    "Pump-r tokens": "Pump-r 代币",
    "Edit profile": "编辑资料",
    Username: "用户名",
    Bio: "简介",
    Copy: "复制",
    Copied: "已复制",
    Close: "关闭",
    Submit: "提交",
    "Not connected": "未连接",
    Guest: "访客"
  },
  ja: {
    "Select language": "言語を選択",
    "Language set to": "言語を変更しました:",
    "Pump Fun Remastered is better": "Pump Fun Remastered はもっと良い",
    "Official Pump Fun Token Coming Soon": "公式 Pump Fun トークン近日公開",
    "mobile app coming soon": "モバイルアプリ近日公開",
    "Trade faster. Track creator stats and holdings.": "より速く取引。クリエイター統計と保有状況を追跡。",
    "Search by coin, symbol, address...": "コイン名、シンボル、アドレスで検索...",
    "Search wallet address (0x or SOL...)": "ウォレットアドレスを検索 (0x または SOL...)",
    "Search agents, skills, targets...": "エージェント、スキル、ターゲットを検索...",
    "Search GO bounties, submissions, agents...": "GO バウンティ、投稿、エージェントを検索...",
    "Top communities": "トップコミュニティ",
    "Trending now": "現在トレンド",
    "Explore coins": "コインを探す",
    Movers: "上昇中",
    New: "新着",
    "Market cap": "時価総額",
    Oldest: "古い順",
    "Last trade": "最新取引",
    Watchlist: "ウォッチリスト",
    "Created coins": "作成済みコイン",
    Portfolio: "ポートフォリオ",
    Balances: "残高",
    Coins: "コイン",
    "Creator Rewards": "クリエイター報酬",
    Notifications: "通知",
    Followers: "フォロワー",
    Following: "フォロー中",
    "No created coins yet.": "作成済みコインはまだありません。",
    "No balances found for this profile.": "このプロフィールの残高は見つかりません。",
    "Load a profile to see details.": "詳細を見るにはプロフィールを読み込んでください。",
    "Launch coin": "コインをローンチ",
    "Coin details": "コイン詳細",
    "Coin name": "コイン名",
    Ticker: "ティッカー",
    "Description (optional)": "説明（任意）",
    "Name your coin": "コイン名を入力",
    "Add a coin ticker (e.g. DOGE)": "ティッカーを追加（例 DOGE）",
    "Write a short description": "短い説明を書く",
    "Add social links (optional)": "SNSリンクを追加（任意）",
    "Select video or image to upload": "アップロードする動画または画像を選択",
    "or drag and drop it here": "またはここにドラッグ＆ドロップ",
    "Select file": "ファイルを選択",
    "File size and type": "ファイルサイズと種類",
    "Image under 900 KB recommended": "900KB未満の画像を推奨",
    "Resolution and aspect ratio": "解像度とアスペクト比",
    "Image 1:1 recommended": "画像は1:1推奨",
    "Banner 16:9 optional": "バナー16:9は任意",
    "Pump.fun dev wallet buy (SOL)": "Pump.fun 開発ウォレット購入 (SOL)",
    "Optional initial buy from the connected Phantom/dev wallet in the same Pump.fun launch transaction.": "接続済みの Phantom/開発ウォレットから、同じ Pump.fun ローンチ取引内で任意の初回購入ができます。",
    "Token economics and advanced fields": "トークン経済と詳細設定",
    "Total supply": "総供給量",
    "Creator allocation (%)": "クリエイター配分 (%)",
    "Optional starter buy (ETH)": "任意の初回購入 (ETH)",
    "Image URL (optional override)": "画像URL（任意の上書き）",
    "Token trade tax (%)": "取引税 (%)",
    "Pump.fun creator wallet (optional)": "Pump.fun クリエイターウォレット（任意）",
    "A preview of how the coin will look like": "コイン表示のプレビュー",
    "Your Coin": "あなたのコイン",
    "Your coin description appears here.": "コイン説明はここに表示されます。",
    "Manlet Mode": "Manlet モード",
    "Send tokens after launch": "ローンチ後にトークン送信",
    "Wallet list": "ウォレット一覧",
    "SOL buy amount": "SOL 購入額",
    "Estimated tokens": "推定トークン数",
    "Estimated supply": "推定供給割合",
    "Token send is off.": "トークン送信はオフです。",
    "Official holder airdrop": "公式ホルダーエアドロップ",
    "Official token": "公式トークン",
    "Reward target": "報酬対象",
    "Preview split": "配分をプレビュー",
    "How payout works": "支払いの仕組み",
    "Reward source": "報酬元",
    "Official token only": "公式トークンのみ",
    "Completed drop": "完了したドロップ",
    "Total allocated": "総配布量",
    "Eligible holders": "対象ホルダー",
    "Per holder": "ホルダーごと",
    Holder: "ホルダー",
    Received: "受取額",
    Share: "割合",
    "Holding since": "保有開始",
    Proof: "証明",
    Solana: "Solana",
    beta: "ベータ",
    waitlist: "待機リスト",
    "Referral beta": "紹介ベータ",
    "Referral rewards": "紹介報酬",
    "Referral name": "紹介名",
    "Your referral beta": "あなたの紹介ベータ",
    "Link and QR": "リンクとQR",
    "Copy link": "リンクをコピー",
    "Download QR": "QRをダウンロード",
    "How it works": "仕組み",
    Tier: "ティア",
    "Connected wallet": "接続中ウォレット",
    "Connect wallet to generate link": "リンク生成にはウォレット接続が必要",
    Refresh: "更新",
    Save: "保存",
    "PUMPR Card waitlist": "PUMPR Card 待機リスト",
    "Coming soon": "近日公開",
    "Get early access": "早期アクセス",
    "Enter your email": "メールを入力",
    "Alpha vault": "Alpha 保管庫",
    "Submit alpha": "Alpha を投稿",
    "Share an alpha tip": "Alpha 情報を共有",
    "Full alpha": "全文 Alpha",
    "Evidence file": "証拠ファイル",
    "Choose evidence": "証拠を選択",
    "No evidence selected": "証拠未選択",
    Category: "カテゴリ",
    Confidence: "信頼度",
    "Tip wallet": "チップウォレット",
    "Publish alpha": "Alpha を公開",
    Cancel: "キャンセル",
    High: "高",
    "I'm a Human": "人間です",
    "I'm an Agent": "エージェントです",
    "Join Pump-r": "Pump-r に参加",
    "Preview skill.md": "skill.md をプレビュー",
    "Register an agent": "エージェントを登録",
    Name: "名前",
    Summary: "概要",
    Goals: "目標",
    "Import SKILLS.md": "SKILLS.md をインポート",
    "Run agent": "エージェントを実行",
    "No wallet needed": "ウォレット不要",
    "Meme coin training arena.": "ミームコイン練習アリーナ。",
    Learn: "学ぶ",
    Play: "遊ぶ",
    Compete: "競う",
    Belong: "参加",
    Level: "レベル",
    "Fake portfolio": "デモポートフォリオ",
    "Next quest": "次のクエスト",
    Badges: "バッジ",
    "Open on phone": "スマホで開く",
    Connect: "接続",
    Disconnect: "切断",
    Deposit: "入金",
    Trade: "取引",
    "Buy crypto": "暗号資産を購入",
    History: "履歴",
    "Copy address": "アドレスをコピー",
    "Crypto transfer": "暗号資産送金",
    "Card / bank": "カード / 銀行",
    "All activity": "すべての履歴",
    Available: "利用可能",
    "YOUR BALANCE": "あなたの残高",
    "Export private key": "秘密鍵をエクスポート",
    "Copy private key": "秘密鍵をコピー",
    "Generated wallet": "生成ウォレット",
    "Wallet activity": "ウォレット履歴",
    "Pump-r tokens": "Pump-r トークン",
    Done: "完了",
    "Edit profile": "プロフィール編集",
    Username: "ユーザー名",
    Bio: "自己紹介",
    "Describe your profile": "プロフィールを書く",
    "Choose username": "ユーザー名を選択",
    Remove: "削除",
    Copy: "コピー",
    Copied: "コピー済み",
    Close: "閉じる",
    Submit: "送信",
    Confirm: "確認",
    "Open token": "トークンを開く",
    "Not connected": "未接続",
    Guest: "ゲスト"
  },
  ko: {
    "Select language": "언어 선택",
    "Language set to": "언어 변경:",
    "Pump Fun Remastered is better": "Pump Fun Remastered가 더 좋습니다",
    "mobile app coming soon": "모바일 앱 출시 예정",
    "Search by coin, symbol, address...": "코인, 심볼, 주소로 검색...",
    "Top communities": "상위 커뮤니티",
    "Trending now": "지금 트렌딩",
    "Explore coins": "코인 탐색",
    Movers: "상승",
    New: "신규",
    "Market cap": "시가총액",
    Oldest: "오래된 순",
    "Last trade": "최근 거래",
    Watchlist: "관심목록",
    "Launch coin": "코인 출시",
    "Coin details": "코인 정보",
    "Coin name": "코인 이름",
    Ticker: "티커",
    "Description (optional)": "설명 (선택)",
    "Name your coin": "코인 이름 입력",
    "Add a coin ticker (e.g. DOGE)": "티커 추가 (예: DOGE)",
    "Write a short description": "짧은 설명 작성",
    "Add social links (optional)": "소셜 링크 추가 (선택)",
    "Select video or image to upload": "업로드할 영상 또는 이미지 선택",
    "or drag and drop it here": "또는 여기에 드래그 앤 드롭",
    "Select file": "파일 선택",
    "File size and type": "파일 크기 및 형식",
    "Image under 900 KB recommended": "900KB 이하 이미지 권장",
    "Resolution and aspect ratio": "해상도 및 비율",
    "Pump.fun dev wallet buy (SOL)": "Pump.fun 개발자 지갑 구매 (SOL)",
    "Your Coin": "내 코인",
    "Your coin description appears here.": "코인 설명이 여기에 표시됩니다.",
    "Total supply": "총 공급량",
    "Creator allocation (%)": "크리에이터 배분 (%)",
    "Official holder airdrop": "공식 홀더 에어드롭",
    Holder: "홀더",
    Received: "수령",
    Share: "비율",
    "Holding since": "보유 시작",
    beta: "베타",
    waitlist: "대기목록",
    Refresh: "새로고침",
    Save: "저장",
    Cancel: "취소",
    Connect: "연결",
    Disconnect: "연결 해제",
    Copy: "복사",
    Copied: "복사됨",
    Close: "닫기",
    Submit: "제출",
    "Not connected": "연결 안 됨",
    Guest: "게스트"
  },
  hi: {
    "Select language": "भाषा चुनें",
    "Language set to": "भाषा सेट हुई:",
    "Pump Fun Remastered is better": "Pump Fun Remastered बेहतर है",
    "mobile app coming soon": "मोबाइल ऐप जल्द आ रहा है",
    "Search by coin, symbol, address...": "कॉइन, सिंबल, एड्रेस से खोजें...",
    "Top communities": "टॉप कम्युनिटी",
    "Trending now": "अभी ट्रेंडिंग",
    "Explore coins": "कॉइन एक्सप्लोर करें",
    Movers: "मूवर्स",
    New: "नया",
    "Market cap": "मार्केट कैप",
    Oldest: "सबसे पुराने",
    "Last trade": "आखिरी ट्रेड",
    Watchlist: "वॉचलिस्ट",
    "Launch coin": "कॉइन लॉन्च करें",
    "Coin details": "कॉइन विवरण",
    "Coin name": "कॉइन नाम",
    Ticker: "टिकर",
    "Description (optional)": "विवरण (वैकल्पिक)",
    "Name your coin": "कॉइन का नाम दें",
    "Add a coin ticker (e.g. DOGE)": "कॉइन टिकर जोड़ें (जैसे DOGE)",
    "Write a short description": "छोटा विवरण लिखें",
    "Add social links (optional)": "सोशल लिंक जोड़ें (वैकल्पिक)",
    "Select video or image to upload": "अपलोड के लिए वीडियो या इमेज चुनें",
    "or drag and drop it here": "या यहाँ ड्रैग और ड्रॉप करें",
    "Select file": "फाइल चुनें",
    "File size and type": "फाइल साइज और प्रकार",
    "Image under 900 KB recommended": "900 KB से कम इमेज सुझाई गई",
    "Pump.fun dev wallet buy (SOL)": "Pump.fun dev wallet buy (SOL)",
    "Your Coin": "आपका कॉइन",
    "Your coin description appears here.": "आपके कॉइन का विवरण यहाँ दिखेगा।",
    "Total supply": "कुल सप्लाई",
    "Creator allocation (%)": "क्रिएटर अलोकेशन (%)",
    "Official holder airdrop": "ऑफिशियल होल्डर एयरड्रॉप",
    Holder: "होल्डर",
    Received: "प्राप्त",
    Share: "हिस्सा",
    "Holding since": "होल्डिंग शुरू",
    beta: "बीटा",
    waitlist: "वेटलिस्ट",
    Refresh: "रिफ्रेश",
    Save: "सेव",
    Cancel: "कैंसल",
    Connect: "कनेक्ट",
    Disconnect: "डिस्कनेक्ट",
    Copy: "कॉपी",
    Copied: "कॉपी हुआ",
    Close: "बंद",
    Submit: "सबमिट",
    "Not connected": "कनेक्ट नहीं",
    Guest: "गेस्ट"
  },
  tr: {
    "Select language": "Dil seç",
    "Language set to": "Dil ayarlandı:",
    "Pump Fun Remastered is better": "Pump Fun Remastered daha iyi",
    "mobile app coming soon": "mobil uygulama yakında",
    "Search by coin, symbol, address...": "Coin, sembol, adres ara...",
    "Top communities": "En iyi topluluklar",
    "Trending now": "Şu an trend",
    "Explore coins": "Coinleri keşfet",
    Movers: "Yükselenler",
    New: "Yeni",
    "Market cap": "Piyasa değeri",
    Oldest: "En eski",
    "Last trade": "Son işlem",
    Watchlist: "İzleme listesi",
    "Launch coin": "Coin başlat",
    "Coin details": "Coin detayları",
    "Coin name": "Coin adı",
    Ticker: "Ticker",
    "Description (optional)": "Açıklama (isteğe bağlı)",
    "Name your coin": "Coinine ad ver",
    "Add a coin ticker (e.g. DOGE)": "Coin ticker ekle (örn. DOGE)",
    "Write a short description": "Kısa açıklama yaz",
    "Add social links (optional)": "Sosyal link ekle (isteğe bağlı)",
    "Select video or image to upload": "Yüklenecek video veya görsel seç",
    "or drag and drop it here": "veya buraya sürükle bırak",
    "Select file": "Dosya seç",
    "File size and type": "Dosya boyutu ve türü",
    "Image under 900 KB recommended": "900 KB altı görsel önerilir",
    "Resolution and aspect ratio": "Çözünürlük ve oran",
    "Pump.fun dev wallet buy (SOL)": "Pump.fun geliştirici cüzdan alımı (SOL)",
    "Your Coin": "Senin Coinin",
    "Your coin description appears here.": "Coin açıklaman burada görünür.",
    "Total supply": "Toplam arz",
    "Creator allocation (%)": "Kurucu payı (%)"
  },
  ar: {
    "Select language": "اختر اللغة",
    "Language set to": "تم تغيير اللغة إلى",
    "Pump Fun Remastered is better": "Pump Fun Remastered أفضل",
    "mobile app coming soon": "تطبيق الجوال قريباً",
    "Search by coin, symbol, address...": "ابحث بالعملة أو الرمز أو العنوان...",
    "Top communities": "أفضل المجتمعات",
    "Trending now": "الرائج الآن",
    "Explore coins": "استكشف العملات",
    Movers: "الأكثر حركة",
    New: "جديد",
    "Market cap": "القيمة السوقية",
    Oldest: "الأقدم",
    "Last trade": "آخر صفقة",
    Watchlist: "قائمة المتابعة",
    "Launch coin": "إطلاق عملة",
    "Coin details": "تفاصيل العملة",
    "Coin name": "اسم العملة",
    Ticker: "الرمز",
    "Description (optional)": "الوصف (اختياري)",
    "Name your coin": "سم العملة",
    "Add a coin ticker (e.g. DOGE)": "أضف رمز العملة (مثل DOGE)",
    "Write a short description": "اكتب وصفاً قصيراً",
    "Add social links (optional)": "أضف روابط اجتماعية (اختياري)",
    "Select video or image to upload": "اختر فيديو أو صورة للرفع",
    "or drag and drop it here": "أو اسحبها وأفلتها هنا",
    "Select file": "اختر ملفاً",
    "File size and type": "حجم الملف ونوعه",
    "Image under 900 KB recommended": "يوصى بصورة أقل من 900KB",
    "Pump.fun dev wallet buy (SOL)": "شراء محفظة المطور على Pump.fun (SOL)",
    "Your Coin": "عملتك",
    "Your coin description appears here.": "وصف عملتك يظهر هنا.",
    "Total supply": "إجمالي المعروض",
    "Creator allocation (%)": "حصة المنشئ (%)"
  }
});
Object.assign(EXTRA_TRANSLATIONS.ja, {
  "Search for coins...": "コインを検索...",
  "Create new coin": "新しいコインを作成",
  "Launch network": "ローンチネットワーク",
  "Choose carefully, these can't be changed once the coin is created.": "慎重に選んでください。コイン作成後は変更できません。",
  "Deploy on": "デプロイ先",
  "Pump.fun Solana launch + Pump.fun redirect": "Pump.fun Solana ローンチ + Pump.fun へ移動",
  "Solana launch + Pump.fun redirect": "Solana ローンチ + Pump.fun へ移動",
  "PumpVerse Choose two or three chains": "PumpVerse 2つまたは3つのチェーンを選択",
  "Choose two or three chains": "2つまたは3つのチェーンを選択",
  Website: "ウェブサイト",
  Twitter: "Twitter",
  Telegram: "Telegram",
  "Pump.fun add-on": "Pump.fun 追加機能",
  "Optional buy and transfer to a selected Solana wallet after the Pump.fun token is live. Named Manlet Mode in honor of Ansem.": "Pump.fun トークン公開後、選択した Solana ウォレットへ任意で購入・転送できます。Ansem に敬意を込めて Manlet Mode と名付けています。",
  Off: "オフ",
  Preview: "プレビュー",
  "Manlet Mode is off.": "Manlet Mode はオフです。",
  "Creator rewards": "クリエイター報酬",
  "Pumpfun Remastered airdrops are reserved for top holders who keep holding long term. This page tracks the official Pump.fun mint and prioritizes loyal holders over short-term flips.": "Pumpfun Remastered のエアドロップは、長期保有を続ける上位ホルダー向けです。このページは公式 Pump.fun ミントを追跡し、短期売買よりも忠実なホルダーを優先します。",
  "39 holders": "39 ホルダー",
  "30 holders": "30 ホルダー",
  "13 holders": "13 ホルダー",
  "Step 1": "ステップ 1",
  "Reading holders...": "ホルダーを読み込み中...",
  "Fresh 0.5%+ holders": "最新 0.5%以上ホルダー",
  "Drop history": "ドロップ履歴",
  "Largest recipient": "最大受取者",
  "Live Pump.fun holder balances, on-curve wallet filtering, dev-wallet exclusion, and finalized Solana transfer signatures.": "ライブの Pump.fun ホルダー残高、オンカーブウォレットのフィルタリング、開発ウォレット除外、確定済み Solana 転送署名を表示しています。",
  "Explore communities": "コミュニティを探す",
  "Hold Pump.fun tokens": "Pump.fun トークンを保有",
  "Designed for wallets holding fast-moving Pump.fun communities, with a card layer built around the tokens users actually trade.": "動きの速い Pump.fun コミュニティを保有するウォレット向けに設計され、ユーザーが実際に取引するトークンを中心にしたカード機能です。",
  "Spend on real purchases": "実際の購入に使う",
  "Built toward everyday goods and services with familiar card-style checkout. Issuing partner and network details will be announced before launch.": "日常の商品やサービスで使える、馴染みのあるカード型チェックアウトを目指しています。発行パートナーとネットワーク詳細はローンチ前に発表します。",
  "Early access": "早期アクセス",
  "Be first in line for launch updates, eligibility windows, and card access announcements.": "ローンチ更新、対象期間、カードアクセス発表をいち早く受け取れます。",
  "Email address": "メールアドレス",
  "Public project intel": "公開プロジェクト情報",
  "Submit high-signal project tips tied to a token contract. Readers can rate, comment, share on X, and optionally tip the author wallet.": "トークンコントラクトに紐づく高シグナルなプロジェクト情報を投稿できます。読者は評価、コメント、X共有、任意で作者ウォレットへチップできます。",
  "1 tips": "1 件の情報",
  "1 projects": "1 プロジェクト",
  "1 ratings": "1 評価",
  All: "すべて",
  "High conviction": "高確信",
  Tipped: "チップ済み",
  "high conviction": "高確信",
  "Launchpad, Solana, Ethereum, Bas alpha": "Launchpad、Solana、Ethereum、Base alpha",
  "PUMP FUN REMASTERED IS LIVE": "PUMP FUN REMASTERED 公開中",
  "Official Pump Fun Remastered account is live at @pumpr_fun.": "公式 Pump Fun Remastered アカウントは @pumpr_fun で公開中です。",
  score: "スコア",
  contract: "コントラクト",
  "Open proof": "証拠を開く",
  "No comments yet.": "まだコメントはありません。",
  "Add a comment...": "コメントを追加...",
  Comment: "コメント",
  "Drop intel": "情報を投稿",
  "Attach it to a token contract and publish through your connected X identity.": "トークンコントラクトに紐づけ、接続した X ID で公開します。",
  "Connect X": "X を接続",
  "Hot projects": "注目プロジェクト",
  "Reader flow": "読者フロー",
  "Agent onboarding": "エージェント参加",
  "SKILLS.md agent registry": "SKILLS.md エージェント登録",
  "Register bounty agents with skills, targets, and posting permissions. Humans can browse agents; agents can save a profile and post GO bounty updates.": "スキル、ターゲット、投稿権限を持つバウンティエージェントを登録します。ユーザーはエージェントを閲覧でき、エージェントはプロフィール保存や GO バウンティ更新の投稿ができます。",
  "0 agents": "0 エージェント",
  "0 posts": "0 投稿",
  "No agents yet.": "まだエージェントはいません。",
  "Add agent": "エージェント追加",
  "Bounty Scout, Proof Builder...": "バウンティ調査、証拠作成...",
  "What this agent does": "このエージェントの内容",
  "GO targets": "GO ターゲット",
  "Pump.fun GO bounties, launch clips, proof packages...": "Pump.fun GO バウンティ、ローンチ動画、証拠パッケージ...",
  "How the agent should find bounties, create proofs, and post updates": "エージェントがバウンティを探し、証拠を作り、更新を投稿する方法",
  "Save agent": "エージェントを保存",
  "Agent post": "エージェント投稿",
  "Post an update": "更新を投稿",
  "Save an agent first": "先にエージェントを保存",
  Type: "種類",
  "Bounty work": "バウンティ作業",
  "GO proof": "GO 証拠",
  "Launch support": "ローンチ支援",
  "Media post": "メディア投稿",
  Update: "更新",
  Title: "タイトル",
  "Proof package for Pump.fun bounty": "Pump.fun バウンティ用証拠パッケージ",
  "What did the agent find or dov": "エージェントが見つけた内容",
  Links: "リンク",
  "Attach pic / video / file": "画像 / 動画 / ファイルを添付",
  "Generate bounty draft": "バウンティ下書きを生成",
  "Run agent & submit": "エージェント実行 & 送信",
  "Submit to bounty": "バウンティへ送信",
  "Post as agent": "エージェントとして投稿",
  "Job Application": "ジョブ申請",
  "Search GO bounties...": "GO バウンティを検索...",
  "Trending bounties": "トレンドバウンティ",
  "Pump.fun GO bounties and submissions gaining momentum": "勢いのある Pump.fun GO バウンティと投稿",
  "160 trending tasks": "160 件のトレンドタスク",
  "24H timeframe": "24時間の期間",
  Trending: "トレンド",
  Tasks: "タスク",
  Submissions: "投稿",
  open: "募集中",
  "Coin communities": "コインコミュニティ",
  "Latest posts from every coin community, in one timeline.": "すべてのコインコミュニティの最新投稿を1つのタイムラインで表示します。",
  "0 followers": "0 フォロワー",
  "31d ago": "31日前",
  "32d ago": "32日前",
  "3 posts": "3 投稿",
  "0 last 24h": "過去24時間 0",
  "1 members": "1 メンバー",
  "Voice chat": "ボイスチャット",
  "Talk live with other token holders": "他のトークンホルダーとライブで話す",
  "Join voice chat": "ボイスチャットに参加"
});
Object.assign(EXTRA_TRANSLATIONS.ja, {
  "Weighted 0.5%+ holders": "重み付け 0.5%以上ホルダー",
  "Tiered 1%+ holders": "段階別 1%以上ホルダー",
  "Launch-day 250K": "ローンチ日 250K",
  "Community outreach": "コミュニティ配布",
  "Total sent": "送信合計",
  "Wallets paid": "支払い済みウォレット",
  FILE: "ファイル",
  "Tip author": "作者にチップ",
  "Share on X": "Xで共有",
  Fade: "フェード",
  LIVE: "ライブ",
  up: "上昇",
  "What this agent does": "このエージェントの内容",
  "How the agent should find bounties, create proofs, and post updates": "エージェントがバウンティを探し、証拠を作り、更新を投稿する方法",
  "What did the agent find or dov": "エージェントが見つけた内容",
  "160 trending tasks": "160 件のトレンドタスク",
  "24H timeframe": "24時間の期間",
  "0 last 24h": "過去24時間 0",
  "Wallets paid": "支払い済みウォレット",
  "Starter buy market cap estimate (USD)": "初回購入時の推定時価総額 (USD)",
  "Solana wallet public key for Pump.fun launches": "Pump.fun ローンチ用 Solana ウォレット公開鍵",
  "Token Launched": "トークンがローンチされました",
  "Connect wallet": "ウォレットを接続",
  Mainnet: "メインネット",
  "ETH gas": "ETH ガス",
  "USDC pair": "USDC ペア",
  "Ethereum + USDC": "Ethereum + USDC",
  "Robinhood Chain": "Robinhood Chain"
});
Object.entries(EXTRA_TRANSLATIONS).forEach(([language, entries]) => {
  UI_TRANSLATIONS[language] = { ...(UI_TRANSLATIONS[language] || {}), ...entries };
});
const WORD_TRANSLATIONS = {
  es: {
    token: "token",
    tokens: "tokens",
    wallet: "wallet",
    wallets: "wallets",
    launch: "lanzar",
    launched: "lanzado",
    create: "crear",
    created: "creado",
    holder: "holder",
    holders: "holders",
    reward: "recompensa",
    rewards: "recompensas",
    profile: "perfil",
    connect: "conectar",
    connected: "conectado",
    copy: "copiar",
    copied: "copiado",
    sign: "firmar",
    submit: "enviar",
    publish: "publicar",
    save: "guardar",
    cancel: "cancelar",
    search: "buscar",
    name: "nombre",
    summary: "resumen",
    category: "categoría",
    confidence: "confianza",
    evidence: "evidencia",
    file: "archivo",
    link: "link",
    referral: "referido",
    referrals: "referidos",
    waitlist: "lista",
    beta: "beta",
    coming: "próximamente",
    soon: "pronto",
    official: "oficial",
    community: "comunidad",
    communities: "comunidades"
  },
  fr: {
    token: "token",
    tokens: "tokens",
    wallet: "wallet",
    wallets: "wallets",
    launch: "lancer",
    launched: "lancé",
    create: "créer",
    created: "créé",
    holder: "holder",
    holders: "holders",
    reward: "récompense",
    rewards: "récompenses",
    profile: "profil",
    connect: "connecter",
    connected: "connecté",
    copy: "copier",
    copied: "copié",
    submit: "soumettre",
    publish: "publier",
    save: "enregistrer",
    cancel: "annuler",
    search: "rechercher",
    name: "nom",
    summary: "résumé",
    category: "catégorie",
    confidence: "confiance",
    evidence: "preuve",
    file: "fichier",
    link: "lien",
    referral: "parrainage",
    referrals: "parrainages",
    waitlist: "liste",
    beta: "bêta",
    coming: "bientôt",
    soon: "bientôt",
    official: "officiel",
    community: "communauté",
    communities: "communautés"
  },
  pt: {
    token: "token",
    tokens: "tokens",
    wallet: "wallet",
    wallets: "wallets",
    launch: "lançar",
    launched: "lançado",
    create: "criar",
    created: "criado",
    holder: "holder",
    holders: "holders",
    reward: "recompensa",
    rewards: "recompensas",
    profile: "perfil",
    connect: "conectar",
    connected: "conectado",
    copy: "copiar",
    copied: "copiado",
    submit: "enviar",
    publish: "publicar",
    save: "salvar",
    cancel: "cancelar",
    search: "buscar",
    name: "nome",
    summary: "resumo",
    category: "categoria",
    confidence: "confiança",
    evidence: "evidência",
    file: "arquivo",
    link: "link",
    referral: "indicação",
    referrals: "indicações",
    waitlist: "lista",
    beta: "beta",
    coming: "em breve",
    soon: "breve",
    official: "oficial",
    community: "comunidade",
    communities: "comunidades"
  },
  tr: {
    token: "token",
    tokens: "tokenlar",
    wallet: "cüzdan",
    wallets: "cüzdanlar",
    launch: "başlat",
    launched: "başlatıldı",
    create: "oluştur",
    created: "oluşturuldu",
    holder: "holder",
    holders: "holderlar",
    reward: "ödül",
    rewards: "ödüller",
    profile: "profil",
    connect: "bağlan",
    connected: "bağlı",
    copy: "kopyala",
    copied: "kopyalandı",
    submit: "gönder",
    publish: "yayınla",
    save: "kaydet",
    cancel: "iptal",
    search: "ara",
    name: "ad",
    summary: "özet",
    category: "kategori",
    confidence: "güven",
    evidence: "kanıt",
    file: "dosya",
    link: "link",
    referral: "referans",
    referrals: "referanslar",
    waitlist: "bekleme listesi",
    beta: "beta",
    coming: "yakında",
    soon: "yakında",
    official: "resmi",
    community: "topluluk",
    communities: "topluluklar"
  }
};
const translationTextSources = new WeakMap();
let translationObserver = null;
let translationObserverTimer = null;
let translatingStaticUi = false;
const COPY_TOAST_ICON = `
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="10" r="7.5"></circle>
    <path d="M6.5 10.2l2.2 2.2 4.8-4.8"></path>
  </svg>
`;

function supportedLanguage(code = "") {
  const normalized = String(code || "").trim().toLowerCase().split("-")[0];
  return LANGUAGE_OPTIONS.some((option) => option.code === normalized) ? normalized : "en";
}

export function getSelectedLanguage() {
  let saved = "";
  try {
    saved = localStorage.getItem(LANGUAGE_STORAGE_KEY) || "";
  } catch {
    saved = "";
  }
  const detected = saved || globalThis.navigator?.language || "en";
  return supportedLanguage(detected);
}

function applyDocumentLanguage(code = getSelectedLanguage()) {
  const language = supportedLanguage(code);
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  document.body?.setAttribute("data-language", language);
  return language;
}

function normalizeTranslationSource(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function protectedText(value = "") {
  const text = normalizeTranslationSource(value);
  if (!text) return true;
  if (text.length > 520) return true;
  if (/https?:\/\//i.test(text)) return true;
  if (/^[@#$][A-Za-z0-9_.$-]{2,32}$/.test(text)) return true;
  if (/^[-+]?\$?\d[\d,.]*\s*[%A-Za-z$]*$/i.test(text)) return true;
  if (/0x[a-fA-F0-9]{40}/.test(text)) return true;
  if (/[1-9A-HJ-NP-Za-km-z]{32,44}/.test(text)) return true;
  if (/[A-Za-z0-9]{45,}/.test(text)) return true;
  if (/^[A-Z0-9]{2,12}$/.test(text) && !UI_TRANSLATIONS.en[text]) return true;
  return false;
}

function shouldSkipTranslationElement(node) {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  if (!element) return true;
  return Boolean(element.closest([
    "script",
    "style",
    "svg",
    "canvas",
    "code",
    "pre",
    "textarea",
    ".language-select-wrap",
    ".notranslate",
    "[data-no-translate]",
    "[data-user-content]",
    ".copy-toast",
    ".logo-title",
    ".logo-name",
    ".logo-tld",
    ".profile-avatar",
    ".profile-name",
    ".coin-name",
    ".coin-symbol",
    ".token-name",
    ".token-symbol",
    ".comment-body",
    ".alpha-body"
  ].join(",")));
}

function shouldTranslateTextNode(node) {
  if (!node || node.nodeType !== Node.TEXT_NODE) return false;
  if (shouldSkipTranslationElement(node)) return false;
  return !protectedText(node.nodeValue);
}

function preserveTextWhitespace(original = "", next = "") {
  const leading = String(original).match(/^\s*/)?.[0] || "";
  const trailing = String(original).match(/\s*$/)?.[0] || "";
  return `${leading}${next}${trailing}`;
}

function restoreCase(source = "", translated = "") {
  if (!translated) return translated;
  if (/^[A-Z][a-z]+$/.test(source)) return `${translated.charAt(0).toUpperCase()}${translated.slice(1)}`;
  if (/^[A-Z]+$/.test(source) && translated.length <= 5) return translated.toUpperCase();
  return translated;
}

function fallbackWordTranslate(source = "", language = "en") {
  if (language === "en") return source;
  const words = WORD_TRANSLATIONS[language];
  if (!words) return source;
  let changed = false;
  const next = source.replace(/\b[A-Za-z][A-Za-z'-]*\b/g, (word) => {
    const key = word.toLowerCase().replace(/'s$/, "");
    const translated = words[key];
    if (!translated) return word;
    changed = true;
    return restoreCase(word, translated);
  });
  return changed ? next : source;
}

function translatePhrase(source = "", language = getSelectedLanguage()) {
  const clean = normalizeTranslationSource(source);
  if (!clean) return source;
  if (language === "en") return UI_TRANSLATIONS.en[clean] || clean;
  const dictionary = UI_TRANSLATIONS[language] || {};
  const english = UI_TRANSLATIONS.en;
  if (dictionary[clean]) return dictionary[clean];
  if (language === "ja") {
    const batch = clean.match(/^Batch\s+(\d+)$/i);
    if (batch) return `バッチ ${batch[1]}`;
    const followers = clean.match(/^(\d+)\s+followers?$/i);
    if (followers) return `${followers[1]} フォロワー`;
    const holders = clean.match(/^(\d+)\s+holders?$/i);
    if (holders) return `${holders[1]} ホルダー`;
    const members = clean.match(/^(\d+)\s+members?$/i);
    if (members) return `${members[1]} メンバー`;
    const posts = clean.match(/^(\d+)\s+posts?$/i);
    if (posts) return `${posts[1]} 投稿`;
    const tips = clean.match(/^(\d+)\s+tips?$/i);
    if (tips) return `${tips[1]} 件の情報`;
    const subs = clean.match(/^(\d+)\s+subs\.?$/i);
    if (subs) return `${subs[1]} 件の投稿`;
    const daysLeft = clean.match(/^(\d+d(?:\s+\d+h)?)\s+left$/i);
    if (daysLeft) return `残り ${daysLeft[1]}`;
  }
  const leadingDecorated = clean.match(/^([^A-Za-z0-9$@#]+)([A-Za-z][\s\S]*)$/);
  if (leadingDecorated && dictionary[leadingDecorated[2]]) {
    return `${leadingDecorated[1]}${dictionary[leadingDecorated[2]]}`;
  }
  const trailingCaret = clean.match(/^(.+?)\s+([v∨⌄›>])$/);
  if (trailingCaret && dictionary[trailingCaret[1]]) {
    return `${dictionary[trailingCaret[1]]} ${trailingCaret[2]}`;
  }
  const englishSource = Object.keys(english).find((key) => english[key] === clean || key === clean);
  if (englishSource && dictionary[englishSource]) return dictionary[englishSource];
  return fallbackWordTranslate(clean, language);
}

function translateTextNode(node, language) {
  const source = translationTextSources.get(node) || normalizeTranslationSource(node.nodeValue);
  if (!source || protectedText(source)) return;
  translationTextSources.set(node, source);
  const next = translatePhrase(source, language);
  if (normalizeTranslationSource(node.nodeValue) !== next) {
    node.nodeValue = preserveTextWhitespace(node.nodeValue, next);
  }
}

function translateElementAttributes(node, language) {
  if (!node) return;
  const element = node.nodeType === 1 ? node : node?.parentElement;
  if (!element || element.closest?.("script,style,svg,canvas,code,pre,.language-select-wrap,.notranslate,[data-no-translate],[data-user-content]")) return;
  ["placeholder", "aria-label", "title"].forEach((attr) => {
    const current = node.getAttribute(attr);
    if (protectedText(current)) return;
    const sourceAttr = `i18n${attr.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase())}Source`;
    const source = node.dataset[sourceAttr] || normalizeTranslationSource(current);
    if (!source || protectedText(source)) return;
    node.dataset[sourceAttr] = source;
    const next = translatePhrase(source, language);
    if (current !== next) node.setAttribute(attr, next);
  });

  if ((node.tagName === "INPUT" || node.tagName === "BUTTON") && node.hasAttribute("value")) {
    const current = node.value;
    if (protectedText(current)) return;
    const source = node.dataset.i18nValueSource || normalizeTranslationSource(current);
    if (!source || protectedText(source)) return;
    node.dataset.i18nValueSource = source;
    const next = translatePhrase(source, language);
    if (current !== next) node.value = next;
  }
}

function startTranslationObserver() {
  if (translationObserver || !document?.body) return;
  translationObserver = new MutationObserver(() => {
    if (translatingStaticUi) return;
    clearTimeout(translationObserverTimer);
    translationObserverTimer = setTimeout(() => translateStaticUi(), 240);
  });
  translationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

export function translateStaticUi(code = getSelectedLanguage()) {
  const language = supportedLanguage(code);
  if (translatingStaticUi || !document?.body) return;
  translatingStaticUi = true;
  applyDocumentLanguage(language);
  try {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return shouldTranslateTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach((node) => translateTextNode(node, language));

    document.querySelectorAll("[placeholder], [aria-label], [title], input[value][readonly], button[value]").forEach((node) => {
      translateElementAttributes(node, language);
    });
  } finally {
    translatingStaticUi = false;
  }
}

export function initLanguageSelector(parentEl = document.querySelector(".top-actions")) {
  if (!parentEl || document.getElementById("languageSelect")) {
    startTranslationObserver();
    translateStaticUi(applyDocumentLanguage());
    return;
  }

  const wrap = document.createElement("label");
  wrap.className = "language-select-wrap";
  wrap.setAttribute("aria-label", "Select language");
  wrap.innerHTML = `
    <span class="language-select-icon" aria-hidden="true">A</span>
    <select id="languageSelect" class="language-select" title="Select language">
      ${LANGUAGE_OPTIONS.map((option) => `<option value="${option.code}">${option.short}</option>`).join("")}
    </select>
  `;

  const signIn = parentEl.querySelector("#signInBtn");
  const walletHub = parentEl.querySelector(".wallet-hub-wrap");
  const profile = parentEl.querySelector("#profileMenuBtn");
  parentEl.insertBefore(wrap, walletHub || profile || signIn || parentEl.firstChild);

  const select = wrap.querySelector("select");
  select.value = applyDocumentLanguage();
  startTranslationObserver();
  translateStaticUi(select.value);
  select.addEventListener("change", () => {
    const next = applyDocumentLanguage(select.value);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // ignore storage failures
    }
    translateStaticUi(next);
    window.dispatchEvent(new CustomEvent("pumpr:languagechange", { detail: { language: next } }));
    showCopyToast(`${translatePhrase("Language set to", next)} ${LANGUAGE_OPTIONS.find((option) => option.code === next)?.label || "English"}`);
  });
}

export function showCopyToast(message = "Address copied to clipboard") {
  if (!document?.body) return;
  if (!copyToastEl) {
    copyToastEl = document.createElement("div");
    copyToastEl.className = "copy-toast";
    copyToastEl.setAttribute("role", "status");
    copyToastEl.setAttribute("aria-live", "polite");
    document.body.appendChild(copyToastEl);
  }

  copyToastEl.innerHTML = `${COPY_TOAST_ICON}<span>${message}</span>`;
  copyToastEl.classList.add("show");

  if (copyToastTimer) {
    clearTimeout(copyToastTimer);
  }
  copyToastTimer = setTimeout(() => {
    copyToastEl?.classList.remove("show");
  }, 1700);
}

export function setWalletLabel(el) {
  if (!el) return;
  const ws = walletState();
  if (ws.signer && ws.address) {
    el.textContent = `${ws.walletLabel}: ${shortAddress(ws.address)}`;
  } else if (ws.solanaAddress) {
    el.textContent = `${ws.solanaWalletLabel || "Phantom"}: ${shortAddress(ws.solanaAddress)}`;
  } else {
    el.textContent = "Not connected";
  }
}

function formatUsdBalance(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "$0.00";
  return `$${numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNativeBalance(value, symbol = "ETH", maxFractionDigits = 6) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return `0 ${symbol}`;
  return `${numeric.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits })} ${symbol}`;
}

async function readWalletChainMeta(ws) {
  let chainId = 0;
  try {
    if (ws?.activeInjectedProvider?.request) {
      const raw = await ws.activeInjectedProvider.request({ method: "eth_chainId" });
      chainId = typeof raw === "string" && raw.startsWith("0x") ? Number.parseInt(raw, 16) : Number(raw || 0);
    }
  } catch {
    chainId = 0;
  }

  if (!chainId) {
    try {
      const network = await ws?.provider?.getNetwork();
      chainId = Number(network?.chainId || 0);
    } catch {
      chainId = 0;
    }
  }

  const option = getChainOption(chainId);
  const symbol = option?.nativeCurrency?.symbol || "ETH";
  return { chainId, option, symbol };
}

async function readNativeBalance(ws, address) {
  if (!ws?.provider || !address) {
    throw new Error("Wallet provider unavailable");
  }

  let wei = null;
  let lastError = null;

  try {
    wei = await ws.provider.getBalance(address);
  } catch (error) {
    lastError = error;
  }

  if ((wei === null || wei === undefined) && ws.activeInjectedProvider?.request) {
    try {
      const hex = await ws.activeInjectedProvider.request({
        method: "eth_getBalance",
        params: [address, "latest"]
      });
      if (typeof hex === "string" && hex.startsWith("0x")) {
        wei = BigInt(hex);
      }
    } catch (error) {
      lastError = lastError || error;
    }
  }

  if (wei === null || wei === undefined) {
    throw lastError || new Error("Could not fetch native wallet balance");
  }

  const nativeAmount = Number(ethers.formatEther(wei));
  if (!Number.isFinite(nativeAmount) || nativeAmount < 0) {
    throw new Error("Balance value is invalid");
  }
  return nativeAmount;
}

export function initWalletHubMenu({
  triggerEl,
  menuEl,
  balanceEl,
  balanceLargeEl,
  nativeEl,
  addressBtnEl,
  historyLinkEl,
  exportKeyBtnEl,
  depositBtnEl,
  tradeLinkEl,
  buyLinkEl,
  depositModalEl,
  depositCloseBtnEl,
  depositCopyBtnEl,
  depositAddressEl,
  depositQrEl,
  alertEl,
  onOpen
} = {}) {
  let open = false;
  let ethUsd = 3000;
  if (!exportKeyBtnEl && menuEl) {
    const grid = menuEl.querySelector(".wallet-hub-grid");
    if (grid) {
      const button = document.createElement("button");
      button.id = "walletHubExportKeyBtn";
      button.className = "wallet-hub-card";
      button.type = "button";
      button.hidden = true;
      button.innerHTML = `
        <span class="wallet-hub-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v10"></path><path d="M8.5 9.5L12 13l3.5-3.5"></path><path d="M5 21h14"></path><path d="M7 17h10"></path></svg></span>
        <span class="wallet-hub-copy"><strong>Export key</strong><span>Generated wallet</span></span>
      `;
      grid.appendChild(button);
      exportKeyBtnEl = button;
    }
  }

  const setOpen = (nextOpen) => {
    if (!menuEl || !triggerEl) return;
    open = Boolean(nextOpen);
    menuEl.classList.toggle("open", open);
    triggerEl.setAttribute("aria-expanded", open ? "true" : "false");
    if (open && typeof onOpen === "function") onOpen();
  };

  const closeDeposit = () => {
    if (!depositModalEl) return;
    depositModalEl.classList.remove("open");
    depositModalEl.setAttribute("aria-hidden", "true");
  };

  const openDeposit = () => {
    if (!depositModalEl) return;
    depositModalEl.classList.add("open");
    depositModalEl.setAttribute("aria-hidden", "false");
  };

  const connectedAddress = () => {
    const ws = walletState();
    return ws?.generatedWallet?.address || (ws?.signer && ws?.address ? ws.address : "");
  };

  const refresh = async () => {
    const ws = walletState();
    const generated = getGeneratedWalletInfo();
    const connected = Boolean((ws.signer && ws.address) || generated?.address);

    if (!connected) {
      if (balanceEl) balanceEl.textContent = "$0.00";
      if (balanceLargeEl) balanceLargeEl.textContent = "$0.00";
      if (nativeEl) nativeEl.textContent = "0 ETH";
      if (addressBtnEl) {
        addressBtnEl.textContent = "Not connected";
        addressBtnEl.disabled = true;
      }
      if (historyLinkEl) historyLinkEl.href = "/profile";
      if (exportKeyBtnEl) exportKeyBtnEl.hidden = true;
      if (depositAddressEl) depositAddressEl.textContent = "Not connected";
      if (depositQrEl) {
        depositQrEl.removeAttribute("src");
        depositQrEl.hidden = true;
        depositQrEl.style.display = "none";
      }
      triggerEl?.classList.remove("connected");
      return;
    }

    triggerEl?.classList.add("connected");
    const address = generated?.address || ws.address;
    if (addressBtnEl) {
      addressBtnEl.textContent = shortAddress(address);
      addressBtnEl.disabled = false;
    }
    if (historyLinkEl) {
      historyLinkEl.href = `/profile?address=${address}`;
    }
    if (exportKeyBtnEl) exportKeyBtnEl.hidden = !generated;
    if (tradeLinkEl) tradeLinkEl.href = "/";
    if (buyLinkEl && !buyLinkEl.href) {
      buyLinkEl.href = "https://www.moonpay.com/buy/eth";
    }
    if (depositAddressEl) depositAddressEl.textContent = address;
    if (depositQrEl) {
      const data = encodeURIComponent(address);
      depositQrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=176x176&data=${data}`;
      depositQrEl.hidden = false;
      depositQrEl.style.display = "block";
    }

    let nativeBalance = null;
    let nativeSymbol = "ETH";
    try {
      const meta = await readWalletChainMeta(ws);
      nativeSymbol = meta.symbol || "ETH";
      nativeBalance = generated ? 0 : await readNativeBalance(ws, address);
    } catch {
      nativeBalance = null;
    }

    if (nativeSymbol === "ETH") {
      try {
        ethUsd = await fetchEthUsdPrice(false);
      } catch {
        // keep fallback
      }
    }

    if (nativeBalance === null) {
      if (balanceEl) balanceEl.textContent = "--";
      if (balanceLargeEl) balanceLargeEl.textContent = "--";
      if (nativeEl) nativeEl.textContent = "Balance unavailable";
      return;
    }

    const nativeLabel = formatNativeBalance(nativeBalance, generated ? "SOL" : nativeSymbol, 6);
    const summaryLabel =
      generated
        ? formatNativeBalance(nativeBalance, "SOL", 3)
        : nativeSymbol === "ETH"
        ? formatUsdBalance(Number(nativeBalance) * Number(ethUsd || 3000))
        : formatNativeBalance(nativeBalance, nativeSymbol, 3);

    if (balanceEl) balanceEl.textContent = summaryLabel;
    if (balanceLargeEl) balanceLargeEl.textContent = summaryLabel;
    if (nativeEl) nativeEl.textContent = nativeLabel;
  };

  triggerEl?.addEventListener("click", async (event) => {
    event.stopPropagation();
    const next = !open;
    if (next) {
      await refresh();
    }
    setOpen(next);
  });

  document.addEventListener("click", (event) => {
    if (!open) return;
    if (!menuEl || !triggerEl) return;
    if (menuEl.contains(event.target) || triggerEl.contains(event.target)) return;
    setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      closeDeposit();
    }
  });

  addressBtnEl?.addEventListener("click", async () => {
    const address = connectedAddress();
    if (!address) {
      setAlert(alertEl, "Connect wallet first", true);
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      showCopyToast("Address copied to clipboard");
    } catch {
      setAlert(alertEl, "Could not copy address", true);
    }
  });

  depositBtnEl?.addEventListener("click", () => {
    const address = connectedAddress();
    if (!address) {
      setAlert(alertEl, "Connect wallet first", true);
      return;
    }
    setOpen(false);
    openDeposit();
  });

  depositCloseBtnEl?.addEventListener("click", closeDeposit);
  depositModalEl?.addEventListener("click", (event) => {
    if (event.target === depositModalEl) {
      closeDeposit();
    }
  });

  depositCopyBtnEl?.addEventListener("click", async () => {
    const address = connectedAddress();
    if (!address) {
      setAlert(alertEl, "Connect wallet first", true);
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      showCopyToast("Address copied to clipboard");
    } catch {
      setAlert(alertEl, "Could not copy address", true);
    }
  });

  exportKeyBtnEl?.addEventListener("click", async () => {
    try {
      const ok = window.confirm("Export this generated wallet private key? Anyone with this key can move the wallet's funds. Store it somewhere private.");
      if (!ok) return;
      const privateKey = exportGeneratedWalletPrivateKey();
      await navigator.clipboard.writeText(privateKey);
      showCopyToast("Private key copied");
      setAlert(alertEl, "Private key copied. Keep it secret.");
    } catch (error) {
      setAlert(alertEl, parseUiError(error), true);
    }
  });

  refresh().catch(() => {
    // non-blocking on first paint
  });

  return {
    refresh,
    setOpen
  };
}

function showWalletPickerModal(wallets = []) {
  return new Promise((resolve, reject) => {
    const rows = Array.isArray(wallets) ? [...wallets] : [];
    if (getSolanaProvider() && !rows.some((wallet) => wallet.key === "phantom")) {
      rows.push({ id: "phantom", key: "phantom", label: "Phantom" });
    }

    const preferredOrder = ["phantom", "metamask", "rabby", "coinbase", "injected", "unknown"];
    const orderedWallets = rows.sort((a, b) => {
      const ai = preferredOrder.indexOf(a.key);
      const bi = preferredOrder.indexOf(b.key);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    const primaryWallets = orderedWallets.slice(0, 2);
    const extraWallets = orderedWallets.slice(2);
    const recentChoice = getSavedWalletChoice();

    const iconLabel = (wallet) => {
      if (wallet.key === "metamask") return "MM";
      if (wallet.key === "rabby") return "RB";
      if (wallet.key === "coinbase") return "CB";
      if (wallet.key === "phantom") return "PH";
      return "W";
    };

    const renderWalletButton = (wallet, withStatus = true) => {
      const isRecent = recentChoice && (wallet.id === recentChoice || wallet.key === recentChoice);
      const status = withStatus ? (isRecent ? "RECENT" : "DETECTED") : "";
      const badge = status
        ? `<span class="wallet-picker-badge ${status === "RECENT" ? "recent" : "detected"}"><i></i>${status}</span>`
        : `<span class="wallet-picker-arrow">></span>`;

      return `
        <button type="button" class="btn-ghost wallet-picker-btn" data-wallet-id="${wallet.id || wallet.key}">
          <span class="wallet-picker-btn-left">
            <span class="wallet-picker-icon wallet-${wallet.key}">${iconLabel(wallet)}</span>
            <span class="wallet-picker-name">${wallet.label}</span>
          </span>
          ${badge}
        </button>
      `;
    };

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay open wallet-picker-overlay";
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("role", "dialog");
    overlay.innerHTML = `
      <div class="modal-card wallet-picker-card">
        <button type="button" class="wallet-picker-close" aria-label="Close">x</button>
        <div class="wallet-picker-head">
          <div class="wallet-picker-brand">
            <img src="/assets/pump-r-logo.png?v=20260609brand" alt="Pump-r" />
          </div>
          <h3>Welcome back</h3>
          <p>Connect your wallet or continue with email.</p>
        </div>
        <div class="wallet-picker-list">
          ${primaryWallets.map((wallet) => renderWalletButton(wallet, true)).join("")}
          <button type="button" class="btn-ghost wallet-picker-btn wallet-picker-more-btn" data-wallet-more ${
            extraWallets.length ? "" : "disabled"
          }>
            <span class="wallet-picker-btn-left">
              <span class="wallet-picker-icon wallet-more">+</span>
              <span class="wallet-picker-name">More wallets</span>
            </span>
            <span class="wallet-picker-arrow">></span>
          </button>
          <div class="wallet-picker-more-list" ${extraWallets.length ? "hidden" : ""}>
            ${extraWallets.map((wallet) => renderWalletButton(wallet, false)).join("")}
          </div>
        </div>
        <div class="wallet-picker-divider"><span>or</span></div>
        <button type="button" class="btn-ghost wallet-picker-btn wallet-picker-email" data-wallet-email>
          <span class="wallet-picker-btn-left">
            <span class="wallet-picker-icon wallet-email">U</span>
            <span>
              <span class="wallet-picker-name">Email or Social</span>
              <small>Zero confirmation trading</small>
            </span>
          </span>
          <span class="wallet-picker-arrow">></span>
        </button>
        <div class="wallet-picker-social-panel" hidden>
          <button type="button" class="btn-ghost wallet-picker-btn" data-wallet-x>
            <span class="wallet-picker-btn-left">
              <span class="wallet-picker-icon wallet-email">X</span>
              <span>
                <span class="wallet-picker-name">Continue with X</span>
                <small>Use your X profile</small>
              </span>
            </span>
            <span class="wallet-picker-arrow">></span>
          </button>
          <form class="wallet-picker-email-form">
            <input type="email" name="email" autocomplete="email" placeholder="you@example.com" required />
            <button type="submit" class="btn-primary">Continue</button>
          </form>
        </div>
        <div class="wallet-picker-actions">
          <button type="button" class="btn-ghost wallet-picker-cancel">Cancel</button>
        </div>
      </div>
    `;

    const cleanup = () => {
      document.removeEventListener("keydown", onKeydown);
      overlay.remove();
    };

    const closeWithError = (message) => {
      cleanup();
      reject(new Error(message));
    };

    const onKeydown = (event) => {
      if (event.key === "Escape") {
        closeWithError("Wallet connection cancelled");
      }
    };

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeWithError("Wallet connection cancelled");
      }
    });

    overlay.querySelector(".wallet-picker-cancel")?.addEventListener("click", () => {
      closeWithError("Wallet connection cancelled");
    });
    overlay.querySelector(".wallet-picker-close")?.addEventListener("click", () => {
      closeWithError("Wallet connection cancelled");
    });

    overlay.querySelector("[data-wallet-more]")?.addEventListener("click", () => {
      const more = overlay.querySelector(".wallet-picker-more-list");
      if (!more) return;
      const hidden = more.hasAttribute("hidden");
      if (hidden) {
        more.removeAttribute("hidden");
      } else {
        more.setAttribute("hidden", "");
      }
    });

    overlay.querySelector("[data-wallet-email]")?.addEventListener("click", () => {
      const panel = overlay.querySelector(".wallet-picker-social-panel");
      if (!panel) return;
      const hidden = panel.hasAttribute("hidden");
      if (hidden) {
        panel.removeAttribute("hidden");
        panel.querySelector("input")?.focus();
      } else {
        panel.setAttribute("hidden", "");
      }
    });

    overlay.querySelector("[data-wallet-x]")?.addEventListener("click", () => {
      cleanup();
      resolve("x-auth");
    });

    overlay.querySelector(".wallet-picker-email-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const email = String(new FormData(form).get("email") || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
      cleanup();
      resolve(`email:${email}`);
    });

    overlay.querySelectorAll("[data-wallet-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = String(button.getAttribute("data-wallet-id") || "");
        cleanup();
        resolve(key);
      });
    });

    document.addEventListener("keydown", onKeydown);
    document.body.appendChild(overlay);
    overlay.querySelector("[data-wallet-id]")?.focus();
  });
}

export function initWalletControls({ selectEl, connectBtn, disconnectBtn, labelEl, alertEl, onConnected, onDisconnected } = {}) {
  if (selectEl) {
    selectEl.style.display = "none";
    selectEl.setAttribute("aria-hidden", "true");
    selectEl.tabIndex = -1;
  }
  setWalletLabel(labelEl);

  disconnectBtn?.style && (disconnectBtn.style.display = (walletState().signer || walletState().solanaAddress) ? "inline-block" : "none");

  const notifyConnected = async () => {
    if (disconnectBtn?.style) disconnectBtn.style.display = "inline-block";
    if (onConnected) await onConnected();
  };

  const notifyDisconnected = async () => {
    if (disconnectBtn?.style) disconnectBtn.style.display = "none";
    if (onDisconnected) await onDisconnected();
  };

  const ready = (async () => {
    try {
      const handledSocialReturn = await handleSharedSocialAuthReturn({ labelEl, alertEl, notifyConnected });
      if (handledSocialReturn) return;
      const restored = await restoreWalletFromSession("");
      const ws = walletState();
      if (!restored || (!ws.signer && !ws.solanaAddress)) return;
      setWalletLabel(labelEl);
      await notifyConnected();
    } catch {
      // keep page usable even if silent reconnect fails
    }
  })();

  const syncFromSharedSession = async ({ clearOnMissing = false } = {}) => {
    try {
      const restored = await restoreWalletFromSession("");
      const ws = walletState();
      setWalletLabel(labelEl);
      if (restored && (ws.signer || ws.solanaAddress)) {
        await notifyConnected();
      } else {
        if (clearOnMissing) {
          disconnectWallet();
          setWalletLabel(labelEl);
        }
        await notifyDisconnected();
      }
    } catch {
      if (clearOnMissing) {
        disconnectWallet();
        setWalletLabel(labelEl);
      }
      await notifyDisconnected();
    }
  };

  window.addEventListener("storage", (event) => {
    if (event.key !== "etherpump.wallet.session.v1") return;
    let connected = false;
    try {
      connected = Boolean(JSON.parse(event.newValue || "{}")?.connected);
    } catch {
      connected = false;
    }
    syncFromSharedSession({ clearOnMissing: !connected });
  });
  window.addEventListener("etherpump:solanaWalletChanged", () => {
    setWalletLabel(labelEl);
    if (walletState().solanaAddress) {
      notifyConnected();
    } else {
      notifyDisconnected();
    }
  });
  window.addEventListener("etherpump:walletChanged", () => {
    setWalletLabel(labelEl);
    const ws = walletState();
    if (ws.signer || ws.solanaAddress) {
      notifyConnected();
    } else {
      notifyDisconnected();
    }
  });

  const doConnect = async () => {
    try {
      const wallets = discoverWallets();
      const choice = await showWalletPickerModal(wallets);
      const walletKey = String(choice || "").split(":")[0];
      if (walletKey === "x-auth") {
        const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash || ""}`;
        window.location.href = `/api/x/oauth/start?returnTo=${encodeURIComponent(returnTo)}`;
        return;
      }
      if (walletKey === "email") {
        const email = String(choice || "").slice("email:".length).trim().toLowerCase();
        const connected = await connectSocialWallet({ type: "email", email, name: email.split("@")[0] });
        const generatedAddress = connected?.generatedWallet?.address || connected?.socialWallet?.address || connected?.publicKey || "";
        setWalletLabel(labelEl);
        window.dispatchEvent(new CustomEvent("pumpr:socialAuth", { detail: { type: "email", email, address: generatedAddress } }));
        await notifyConnected();
        setAlert(alertEl, `Signed in as ${email}. Generated Solana wallet: ${shortAddress(generatedAddress)}`);
        return;
      }
      if (walletKey === "phantom") {
        await connectSolanaWallet({ requirePrompt: true, requireSignature: true });
      } else {
        await connectWallet(choice);
      }
      setWalletLabel(labelEl);
      await notifyConnected();
      setAlert(alertEl, "Wallet connected");
    } catch (err) {
      const message = parseUiError(err);
      if (String(message).toLowerCase().includes("cancelled")) {
        setAlert(alertEl, "Wallet connection cancelled");
        return;
      }
      setAlert(alertEl, message, true);
      showCopyToast(message);
    }
  };

  const doDisconnect = async () => {
    disconnectWallet();
    setWalletLabel(labelEl);
    await notifyDisconnected();
    setAlert(alertEl, "Wallet disconnected");
  };

  connectBtn?.addEventListener("click", doConnect);
  disconnectBtn?.addEventListener("click", doDisconnect);

  return {
    connect: doConnect,
    disconnect: doDisconnect,
    ready
  };
}

function sharedWalletMarkup() {
  return `
    <div class="wallet-hub-wrap">
      <button id="walletHubBtn" class="wallet-hub-trigger" style="display:none" type="button" aria-expanded="false" aria-controls="walletHubMenu">
        <span class="wallet-hub-dot" aria-hidden="true"></span>
        <span id="walletHubBalance">0 SOL</span>
        <span class="wallet-hub-caret">v</span>
      </button>
      <div id="walletHubMenu" class="wallet-hub-menu" role="menu">
        <p class="wallet-hub-label">Balance</p>
        <h3 id="walletHubBalanceLarge">0 SOL</h3>
        <p class="wallet-hub-sub"><span id="walletHubNative">0 SOL</span> available</p>
        <button id="walletHubAddressBtn" class="wallet-hub-address" type="button">Not connected</button>
        <div class="wallet-hub-grid">
          <a id="walletHubTradeLink" class="wallet-hub-card" href="/">
            <span class="wallet-hub-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h12"></path><path d="M13 4l3 3-3 3"></path><path d="M20 17H8"></path><path d="M11 14l-3 3 3 3"></path></svg></span>
            <span class="wallet-hub-copy"><strong>Browse</strong><span>Pump-r tokens</span></span>
          </a>
          <a id="walletHubHistoryLink" class="wallet-hub-card" href="/profile">
            <span class="wallet-hub-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l2.5 2.5"></path></svg></span>
            <span class="wallet-hub-copy"><strong>Profile</strong><span>Wallet activity</span></span>
          </a>
          <button id="walletHubExportKeyBtn" class="wallet-hub-card" type="button" hidden>
            <span class="wallet-hub-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v10"></path><path d="M8.5 9.5L12 13l3.5-3.5"></path><path d="M5 21h14"></path><path d="M7 17h10"></path></svg></span>
            <span class="wallet-hub-copy"><strong>Export key</strong><span>Generated wallet</span></span>
          </button>
        </div>
      </div>
    </div>
    <button id="profileMenuBtn" class="profile-trigger" style="display:none" type="button" aria-expanded="false" aria-controls="profileMenu">
      <span class="profile-avatar" id="profileAvatar">PR</span>
      <span class="profile-name" id="profileMenuName">Guest</span>
      <span class="profile-chevron">v</span>
    </button>
    <div id="profileMenu" class="profile-menu">
      <div class="profile-menu-header">
        <span class="profile-avatar large" id="profileAvatarLarge">PR</span>
        <div class="profile-menu-identity">
          <div class="profile-menu-name-row"><strong id="profileMenuNameLarge">Guest</strong></div>
          <small id="profileMenuMeta">Connected with Phantom</small>
        </div>
      </div>
      <a class="profile-menu-link profile-menu-item" id="profileNav" href="/profile">
        <span class="profile-menu-item-left"><span class="profile-menu-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8.2" r="3.7"></circle><path d="M4.6 20c1.8-3.9 4.4-5.9 7.4-5.9s5.6 2 7.4 5.9"></path></svg></span><span>View profile</span></span>
        <span class="profile-menu-item-arrow">></span>
      </a>
      <button class="profile-menu-link profile-menu-btn profile-menu-item profile-menu-item-danger" id="menuLogoutBtn" type="button">Log out</button>
    </div>
  `;
}

function setSharedAvatar(node, name = "", imageUri = "") {
  if (!node) return;
  const label = String(name || "PR").slice(0, 2).toUpperCase() || "PR";
  if (imageUri) {
    node.textContent = "";
    node.classList.add("with-image");
    node.style.backgroundImage = `url("${imageUri}")`;
  } else {
    node.classList.remove("with-image");
    node.style.backgroundImage = "";
    node.textContent = label;
  }
}

function decodeBase64UrlJson(value = "") {
  try {
    const text = String(value || "");
    if (!text) return null;
    const padded = `${text}${"=".repeat((4 - (text.length % 4)) % 4)}`;
    return JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

function displayNameForGeneratedWallet(generated = {}) {
  if (!generated) return "";
  if (generated.name) return String(generated.name);
  if (generated.username) return `@${generated.username}`;
  if (generated.email) return String(generated.email);
  return generated.address ? `sol_${String(generated.address).slice(0, 6)}` : "";
}

function metaForGeneratedWallet(generated = {}) {
  if (!generated) return "Generated Solana wallet";
  if (generated.type === "x" && generated.username) return `@${generated.username}`;
  if (generated.type === "email" && generated.email) return "Email connected";
  return "Generated Solana wallet";
}

function avatarTextForGeneratedWallet(generated = {}) {
  if (generated?.type === "x") return "X";
  const label = displayNameForGeneratedWallet(generated);
  return label ? label.slice(0, 2).toUpperCase() : "SOL";
}

function readPendingReferral() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REFERRAL_PENDING_KEY) || "{}");
    const ref = String(parsed?.ref || "").trim().toLowerCase();
    const ts = Number(parsed?.ts || 0);
    if (!ref || !ts || Date.now() - ts > 7 * 86400 * 1000) return null;
    return {
      ref,
      landingPath: String(parsed?.landingPath || "/").slice(0, 240)
    };
  } catch {
    return null;
  }
}

async function connectPendingReferral(address = "") {
  const wallet = String(address || "").trim();
  if (!wallet) return;
  const pending = readPendingReferral();
  if (!pending) return;
  const sessionKey = `${pending.ref}:${wallet}`;
  try {
    if (sessionStorage.getItem(REFERRAL_CONNECT_SESSION_KEY) === sessionKey) return;
    sessionStorage.setItem(REFERRAL_CONNECT_SESSION_KEY, sessionKey);
  } catch {
    // ignore
  }
  try {
    const res = await fetch("/api/referrals/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ref: pending.ref,
        referredWallet: wallet,
        landingPath: pending.landingPath,
        source: "shared-wallet-connect"
      }),
      keepalive: true
    });
    if (res.ok) {
      localStorage.removeItem(REFERRAL_PENDING_KEY);
    }
  } catch {
    // Referral tracking should never block wallet sign-in.
  }
}

async function handleSharedSocialAuthReturn({ labelEl, alertEl, notifyConnected } = {}) {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("x");
  if (!status) return false;

  const finish = () => {
    params.delete("x");
    params.delete("x_user");
    params.delete("reason");
    const qs = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash || ""}`);
  };

  try {
    if (status === "authorized") {
      const xUser = decodeBase64UrlJson(params.get("x_user")) || {};
      const social = {
        type: "x",
        id: String(xUser.id || ""),
        username: String(xUser.username || ""),
        name: String(xUser.name || xUser.username || "X user"),
        image: String(xUser.image || ""),
        followers: Math.max(0, Number(xUser.followers || 0) || 0)
      };
      const connected = await connectSocialWallet(social);
      const generatedAddress = connected?.generatedWallet?.address || connected?.socialWallet?.address || connected?.publicKey || "";
      setWalletLabel(labelEl);
      window.dispatchEvent(new CustomEvent("pumpr:socialAuth", { detail: { ...social, address: generatedAddress } }));
      if (typeof notifyConnected === "function") await notifyConnected();
      setAlert(alertEl, `X connected. Generated Solana wallet: ${shortAddress(generatedAddress)}`);
      return true;
    }

    if (status === "failed" || status === "expired" || status === "cancelled") {
      setAlert(alertEl, params.get("reason") || "X authorization failed", true);
      return true;
    }
  } catch (error) {
    setAlert(alertEl, parseUiError(error), true);
    return true;
  } finally {
    finish();
  }

  return false;
}

export function initTopbarWalletProfile({
  signInBtn,
  connectBtn,
  disconnectBtn,
  walletSelect,
  walletLabel,
  alertEl,
  onChange
} = {}) {
  const topActions = signInBtn?.closest(".top-actions") || document.querySelector(".top-actions");
  if (!topActions) {
    return initWalletControls({ selectEl: walletSelect, connectBtn, disconnectBtn, labelEl: walletLabel, alertEl, onConnected: onChange });
  }

  if (!document.getElementById("walletHubBtn")) {
    signInBtn?.insertAdjacentHTML("afterend", sharedWalletMarkup());
  }
  initLanguageSelector(topActions);

  const els = {
    walletHubBtn: document.getElementById("walletHubBtn"),
    walletHubMenu: document.getElementById("walletHubMenu"),
    walletHubBalance: document.getElementById("walletHubBalance"),
    walletHubBalanceLarge: document.getElementById("walletHubBalanceLarge"),
    walletHubNative: document.getElementById("walletHubNative"),
    walletHubAddressBtn: document.getElementById("walletHubAddressBtn"),
    walletHubExportKeyBtn: document.getElementById("walletHubExportKeyBtn"),
    walletHubDepositBtn: document.getElementById("walletHubDepositBtn"),
    walletHubTradeLink: document.getElementById("walletHubTradeLink"),
    walletHubBuyLink: document.getElementById("walletHubBuyLink"),
    walletHubHistoryLink: document.getElementById("walletHubHistoryLink"),
    depositModal: document.getElementById("depositModal"),
    depositCloseBtn: document.getElementById("depositCloseBtn"),
    depositCopyBtn: document.getElementById("depositCopyBtn"),
    depositAddressText: document.getElementById("depositAddressText"),
    depositQrImage: document.getElementById("depositQrImage"),
    profileMenuBtn: document.getElementById("profileMenuBtn"),
    profileMenu: document.getElementById("profileMenu"),
    profileMenuName: document.getElementById("profileMenuName"),
    profileMenuNameLarge: document.getElementById("profileMenuNameLarge"),
    profileMenuMeta: document.getElementById("profileMenuMeta"),
    profileAvatar: document.getElementById("profileAvatar"),
    profileAvatarLarge: document.getElementById("profileAvatarLarge"),
    profileNav: document.getElementById("profileNav"),
    menuLogoutBtn: document.getElementById("menuLogoutBtn")
  };

  let walletHub = null;
  const setProfileOpen = (open) => {
    if (!els.profileMenu || !els.profileMenuBtn) return;
    els.profileMenu.classList.toggle("open", Boolean(open));
    els.profileMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
  };

  const update = async () => {
    const ws = walletState();
    const solana = solanaWalletState();
    const evmConnected = Boolean(ws.signer && ws.address);
    const generatedConnected = Boolean(ws.generatedWallet?.address);
    const solanaConnected = Boolean(solana.address);
    const connected = evmConnected || solanaConnected || generatedConnected;
    if (signInBtn) signInBtn.style.display = connected ? "none" : "inline-flex";
    if (els.walletHubBtn) els.walletHubBtn.style.display = evmConnected || generatedConnected ? "inline-flex" : "none";
    if (els.profileMenuBtn) els.profileMenuBtn.style.display = connected ? "inline-flex" : "none";
    setWalletLabel(walletLabel);
    const finishUpdate = async () => {
      translateStaticUi();
      if (typeof onChange === "function") await onChange();
    };

    if (!connected) {
      setProfileOpen(false);
      walletHub?.setOpen(false);
      await finishUpdate();
      return;
    }
    if (generatedConnected) {
      const generated = ws.generatedWallet || {};
      const profileAddress = generated.address || solana.address || "";
      const profile = loadUserProfile(profileAddress);
      const name = profile?.username || displayNameForGeneratedWallet(generated) || `sol_${String(profileAddress).slice(0, 6)}`;
      const imageUri = profile?.imageUri || generated.image || "";
      if (els.profileMenuName) els.profileMenuName.textContent = name;
      if (els.profileMenuNameLarge) els.profileMenuNameLarge.textContent = name;
      if (els.profileMenuMeta) els.profileMenuMeta.textContent = metaForGeneratedWallet(generated);
      if (els.profileNav) els.profileNav.href = `/profile?address=${encodeURIComponent(profileAddress)}`;
      setSharedAvatar(els.profileAvatar, imageUri ? name : avatarTextForGeneratedWallet(generated), imageUri);
      setSharedAvatar(els.profileAvatarLarge, imageUri ? name : avatarTextForGeneratedWallet(generated), imageUri);
      walletHub?.refresh();
      connectPendingReferral(generated.address || solana.address);
      if (profileAddress) {
        hydrateUserProfile(profileAddress, { force: false }).then((fresh) => {
          const next = walletState();
          const stillCurrent = String(next.generatedWallet?.address || solanaWalletState().address || "") === String(profileAddress);
          if (!stillCurrent) return;
          if (fresh?.username !== name || String(fresh?.imageUri || "") !== String(imageUri || "")) update();
        }).catch(() => {});
      }
      await finishUpdate();
      return;
    }
    if (solanaConnected && !evmConnected) {
      const profile = loadUserProfile(solana.address);
      const name = profile?.username || `sol_${solana.address.slice(0, 6)}`;
      const imageUri = profile?.imageUri || "";
      if (els.profileMenuName) els.profileMenuName.textContent = name;
      if (els.profileMenuNameLarge) els.profileMenuNameLarge.textContent = name;
      if (els.profileMenuMeta) els.profileMenuMeta.textContent = "Solana wallet connected";
      if (els.profileNav) els.profileNav.href = `/profile?address=${encodeURIComponent(solana.address)}`;
      setSharedAvatar(els.profileAvatar, imageUri ? name : "SOL", imageUri);
      setSharedAvatar(els.profileAvatarLarge, imageUri ? name : "SOL", imageUri);
      walletHub?.setOpen(false);
      connectPendingReferral(solana.address);
      hydrateUserProfile(solana.address, { force: false }).then((fresh) => {
        const next = solanaWalletState();
        if (String(next.address || "") !== String(solana.address)) return;
        if (fresh?.username !== name || String(fresh?.imageUri || "") !== String(imageUri || "")) update();
      }).catch(() => {});
      await finishUpdate();
      return;
    }
    const profile = loadUserProfile(ws.address);
    const name = profile?.username || defaultUsername(ws.address) || shortAddress(ws.address);
    const imageUri = profile?.imageUri || "";
    if (els.profileMenuName) els.profileMenuName.textContent = name;
    if (els.profileMenuNameLarge) els.profileMenuNameLarge.textContent = name;
    if (els.profileMenuMeta) els.profileMenuMeta.textContent = shortAddress(ws.address);
    if (els.profileNav) els.profileNav.href = `/profile?address=${encodeURIComponent(ws.address)}`;
    setSharedAvatar(els.profileAvatar, name, imageUri);
    setSharedAvatar(els.profileAvatarLarge, name, imageUri);
    walletHub?.refresh();
    connectPendingReferral(ws.address);
    await finishUpdate();
  };

  const controls = initWalletControls({
    selectEl: walletSelect,
    connectBtn,
    disconnectBtn,
    labelEl: walletLabel,
    alertEl,
    onConnected: update,
    onDisconnected: update
  });

  walletHub = initWalletHubMenu({
    triggerEl: els.walletHubBtn,
    menuEl: els.walletHubMenu,
    balanceEl: els.walletHubBalance,
    balanceLargeEl: els.walletHubBalanceLarge,
    nativeEl: els.walletHubNative,
    addressBtnEl: els.walletHubAddressBtn,
    exportKeyBtnEl: els.walletHubExportKeyBtn,
    depositBtnEl: els.walletHubDepositBtn,
    tradeLinkEl: els.walletHubTradeLink,
    buyLinkEl: els.walletHubBuyLink,
    historyLinkEl: els.walletHubHistoryLink,
    depositModalEl: els.depositModal,
    depositCloseBtnEl: els.depositCloseBtn,
    depositCopyBtnEl: els.depositCopyBtn,
    depositAddressEl: els.depositAddressText,
    depositQrEl: els.depositQrImage,
    alertEl,
    onOpen: () => setProfileOpen(false)
  });

  signInBtn?.addEventListener("click", async () => {
    const buttonVisible = signInBtn.offsetParent !== null && getComputedStyle(signInBtn).display !== "none";
    if (!buttonVisible && (walletState().signer || walletState().solanaAddress)) {
      await update();
      return;
    }
    await controls.connect();
    await update();
  });
  els.profileMenuBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    walletHub?.setOpen(false);
    setProfileOpen(!els.profileMenu?.classList.contains("open"));
  });
  document.addEventListener("click", (event) => {
    if (!els.profileMenu || !els.profileMenuBtn) return;
    if (els.profileMenu.contains(event.target) || els.profileMenuBtn.contains(event.target)) return;
    setProfileOpen(false);
  });
  els.menuLogoutBtn?.addEventListener("click", async () => {
    await controls.disconnect();
    await update();
  });

  update();
  return { ...controls, refresh: update, walletHub };
}
