document.addEventListener("DOMContentLoaded", function() {
    // --- Firebase Configuration ---
    const firebaseConfig = {
        apiKey: "YOUR_FIREBASE_API_KEY",
        authDomain: "your-project-id.firebaseapp.com",
        databaseURL: "https://your-project-id-default-rtdb.firebaseio.com",
        projectId: "your-project-id",
        storageBucket: "your-project-id.appspot.com",
        messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
        appId: "YOUR_APP_ID",
        measurementId: "YOUR_MEASUREMENT_ID" // Optional
    };

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const auth = firebase.auth();
    const db = firebase.database();

    // --- DOM Elements ---
    const ticketsContainer = document.getElementById("tickets-container");
    const gameButton = document.getElementById('load-game-btn');
    const profileActionButton = document.getElementById('profile-action-btn');
    const walletBalanceSpan = document.querySelector('#wallet-btn .wallet-balance');
    // Modals
    const authChoiceModal = document.getElementById('auth-choice-modal');
    const registerModal = document.getElementById('register-modal');
    const loginModal = document.getElementById('login-modal');
    const userProfileModal = document.getElementById('user-profile-modal');
    // Modal Triggers & Forms
    const showLoginModalBtn = document.getElementById('show-login-modal-btn');
    const showRegisterModalBtn = document.getElementById('show-register-modal-btn');
    const switchToLoginFromRegister = document.getElementById('switch-to-login-from-register');
    const switchToRegisterFromLogin = document.getElementById('switch-to-register-from-login');
    const registerForm = document.getElementById('register-form');
    const loginForm = document.getElementById('login-form');
    // Error Messages
    const registerErrorMsg = document.getElementById('register-error');
    const loginErrorMsg = document.getElementById('login-error');
    // Profile Display
    const profileDisplayName = document.getElementById('profile-display-name');
    const profileDisplayEmail = document.getElementById('profile-display-email');
    const profileDisplayCoins = document.getElementById('profile-display-coins');
    const signOutButton = document.getElementById('sign-out-btn');

    let currentUserCoins = 0;
    let previousUserUID = null;
    let userCoinListener = null; // To store the coin listener function

    // --- Modal Management ---
    function openModal(modalId) {
        closeAllModals();
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'flex';
    }
    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'none';
    }
    function closeAllModals() {
        [authChoiceModal, registerModal, loginModal, userProfileModal].forEach(m => m && (m.style.display = 'none'));
    }
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', function() { closeModal(this.dataset.modalId); });
    });
    [authChoiceModal, registerModal, loginModal, userProfileModal].forEach(modal => {
        if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal.id); });
    });

    // --- Ticket Generation ---
    const TICKET_PRICE = 100;
    if (ticketsContainer) {
        for (let i = 1; i <= 50; i++) { // Number of tickets
            let ticketDiv = document.createElement("div");
            ticketDiv.classList.add("ticket");
            ticketDiv.dataset.ticketId = `T${String(i).padStart(3, '0')}`;
            ticketDiv.innerHTML = `<span>Ticket ${String(i).padStart(3, '0')}</span><small class="ticket-price">(${TICKET_PRICE} Coins)</small>`;
            ticketDiv.addEventListener('click', handleTicketPurchase);
            ticketsContainer.appendChild(ticketDiv);
        }
    }

    // --- Game Button ---
    if (gameButton) {
        gameButton.addEventListener('click', () => {
            const user = auth.currentUser;
            window.location.href = user ? `hgame.html?uid=${user.uid}` : 'hgame.html';
        });
    }

    // --- UI Updates ---
    function updateUserWalletDisplay(balance) {
        currentUserCoins = parseInt(balance) || 0;
        if (walletBalanceSpan) walletBalanceSpan.textContent = currentUserCoins;
        if (profileDisplayCoins) profileDisplayCoins.textContent = currentUserCoins;
    }

    function updateUserTicketDisplay(uid) {
        const userTicketsRef = db.ref(`users/${uid}/tickets`);
        userTicketsRef.once('value', snapshot => {
            const purchasedTickets = snapshot.val() || {};
            document.querySelectorAll('.ticket').forEach(ticketEl => {
                const ticketId = ticketEl.dataset.ticketId;
                const ownedTag = ticketEl.querySelector('.owned-tag');
                if (purchasedTickets[ticketId]) {
                    ticketEl.classList.add('purchased');
                    if (!ownedTag) ticketEl.insertAdjacentHTML('beforeend', ` <small class="owned-tag">(Owned)</small>`);
                } else {
                    ticketEl.classList.remove('purchased');
                    if (ownedTag) ownedTag.remove();
                }
            });
        });
    }
    
    function resetTicketDisplay() {
        document.querySelectorAll('.ticket').forEach(ticketEl => {
            ticketEl.classList.remove('purchased');
            const ownedTag = ticketEl.querySelector('.owned-tag');
            if (ownedTag) ownedTag.remove();
        });
    }


    // --- Process Pending Coins from Game ---
    function processPendingCoins(uid) {
        const pendingCoinsStr = localStorage.getItem(`pendingCoins_${uid}`);
        if (pendingCoinsStr) {
            const pendingCoins = parseInt(pendingCoinsStr);
            localStorage.removeItem(`pendingCoins_${uid}`); // Remove immediately
            if (!isNaN(pendingCoins) && pendingCoins > 0) {
                const userCoinsRef = db.ref(`users/${uid}/coins`);
                userCoinsRef.transaction((currentCoins) => (currentCoins || 0) + pendingCoins)
                    .then(() => console.log(`${pendingCoins} coins added for user ${uid}.`))
                    .catch(error => console.error("Error adding pending coins:", error));
            }
        }
    }

    // --- Ticket Purchase Logic ---
    function handleTicketPurchase(event) {
        const ticketElement = event.currentTarget;
        const ticketId = ticketElement.dataset.ticketId;
        const user = auth.currentUser;

        if (!user) {
            alert("Please log in or register to buy tickets.");
            openModal('auth-choice-modal');
            return;
        }
        if (ticketElement.classList.contains('purchased')) {
            alert(`You already own Ticket ${ticketId}.`);
            return;
        }
        if (currentUserCoins < TICKET_PRICE) {
            alert("Not enough coins. Play the game to earn more!");
            return;
        }

        if (confirm(`Buy ${ticketId} for ${TICKET_PRICE} coins?`)) {
            const userCoinsRef = db.ref(`users/${user.uid}/coins`);
            const userTicketRef = db.ref(`users/${user.uid}/tickets/${ticketId}`);

            userCoinsRef.transaction((currentCoins) => {
                if (currentCoins === null || currentCoins < TICKET_PRICE) return undefined; // Abort
                return currentCoins - TICKET_PRICE;
            }).then(result => {
                if (!result.committed) throw new Error("Coin deduction failed or insufficient funds.");
                return userTicketRef.set({ id: ticketId, purchasedAt: firebase.database.ServerValue.TIMESTAMP });
            }).then(() => {
                alert(`Successfully purchased ${ticketId}!`);
                // UI update for ticket will happen via updateUserTicketDisplay or can be done manually
                ticketElement.classList.add('purchased');
                 if (!ticketElement.querySelector('.owned-tag')) {
                    ticketElement.insertAdjacentHTML('beforeend', ` <small class="owned-tag">(Owned)</small>`);
                 }
                // Coin UI updates via listener
            }).catch(error => {
                console.error("Ticket purchase error:", error);
                alert(`Purchase failed: ${error.message}`);
            });
        }
    }

    // --- Authentication ---
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('register-name').value.trim();
            const email = document.getElementById('register-email').value.trim();
            const password = document.getElementById('register-password').value;
            const confirmPassword = document.getElementById('register-confirm-password').value;

            registerErrorMsg.textContent = ''; // Clear previous error

            if (!name) { registerErrorMsg.textContent = "Name is required."; return; }
            if (password !== confirmPassword) { registerErrorMsg.textContent = "Passwords do not match."; return; }
            if (password.length < 6) { registerErrorMsg.textContent = "Password must be at least 6 characters."; return; }

            auth.createUserWithEmailAndPassword(email, password)
                .then(userCredential => userCredential.user.updateProfile({ displayName: name })
                    .then(() => {
                        const initialCoins = 100; // Starting coins
                        db.ref(`users/${userCredential.user.uid}`).set({
                            name: name, email: email, coins: initialCoins,
                            createdAt: firebase.database.ServerValue.TIMESTAMP
                        });
                        closeModal('register-modal');
                    })
                )
                .catch(error => { registerErrorMsg.textContent = error.message; });
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            loginErrorMsg.textContent = ''; // Clear previous error

            auth.signInWithEmailAndPassword(email, password)
                .then(() => closeModal('login-modal'))
                .catch(error => { loginErrorMsg.textContent = error.message; });
        });
    }

    if (signOutButton) {
        signOutButton.addEventListener('click', () => {
            if (userCoinListener && previousUserUID) {
                db.ref(`users/${previousUserUID}/coins`).off('value', userCoinListener); // Detach specific listener
                userCoinListener = null;
            }
            auth.signOut().catch(error => console.error("Sign Out Error:", error));
            closeModal('user-profile-modal'); // Close profile modal on sign out
        });
    }

    auth.onAuthStateChanged((user) => {
        if (userCoinListener && previousUserUID) { // Detach previous listener if exists
            db.ref(`users/${previousUserUID}/coins`).off('value', userCoinListener);
            userCoinListener = null;
        }

        if (user) {
            previousUserUID = user.uid;
            profileActionButton.textContent = `Profile`;
            if (profileDisplayName) profileDisplayName.textContent = user.displayName || 'N/A';
            if (profileDisplayEmail) profileDisplayEmail.textContent = user.email;

            processPendingCoins(user.uid);

            const userCoinsRef = db.ref(`users/${user.uid}/coins`);
            userCoinListener = userCoinsRef.on('value', snapshot => { // Assign listener to variable
                updateUserWalletDisplay(snapshot.val());
            }, error => {
                console.error("Error fetching user coins:", error);
                updateUserWalletDisplay(0);
            });
            
            updateUserTicketDisplay(user.uid);
            closeAllModals();
        } else {
            previousUserUID = null;
            profileActionButton.textContent = "Login / Register";
            if (profileDisplayName) profileDisplayName.textContent = 'N/A';
            if (profileDisplayEmail) profileDisplayEmail.textContent = 'N/A';
            updateUserWalletDisplay(0);
            resetTicketDisplay();
            closeModal('user-profile-modal'); // Ensure profile modal is closed on sign out
        }
    });

    // --- Profile Action Button & Modal Switching ---
    if (profileActionButton) {
        profileActionButton.addEventListener('click', () => {
            auth.currentUser ? openModal('user-profile-modal') : openModal('auth-choice-modal');
        });
    }
    if (showLoginModalBtn) showLoginModalBtn.addEventListener('click', () => { closeModal('auth-choice-modal'); openModal('login-modal'); });
    if (showRegisterModalBtn) showRegisterModalBtn.addEventListener('click', () => { closeModal('auth-choice-modal'); openModal('register-modal'); });
    if (switchToLoginFromRegister) switchToLoginFromRegister.addEventListener('click', (e) => { e.preventDefault(); closeModal('register-modal'); openModal('login-modal'); });
    if (switchToRegisterFromLogin) switchToRegisterFromLogin.addEventListener('click', (e) => { e.preventDefault(); closeModal('login-modal'); openModal('register-modal'); });
});