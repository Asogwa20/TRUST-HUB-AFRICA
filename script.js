function getPreferredTheme() {
  return "light";
}

function applyTheme(theme) {
  const nextTheme = "light";
  document.documentElement.setAttribute("data-theme", nextTheme);
  document.documentElement.style.colorScheme = nextTheme;
  return nextTheme;
}

applyTheme(getPreferredTheme());

const thClientState = new Map();

function readClientState(key, fallback = null) {
  try {
    const value = thClientState.get(key);
    return value === undefined ? fallback : JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function writeClientState(key, value) {
  thClientState.set(key, JSON.stringify(value));
  return value;
}

function readClientText(key) {
  const value = thClientState.get(key);
  return typeof value === "string" ? value : "";
}

function writeClientText(key, value) {
  thClientState.set(key, String(value || ""));
  return value;
}

function removeClientState(key) {
  thClientState.delete(key);
}

const TrustHub = (() => {
  const CATEGORIES = [
    "Food",
    "Fashion",
    "Books",
    "School Items",
    "Drinks",
    "Gadgets",
    "Services",
    "Beauty",
    "Others"
  ];
  const DEMO_PRODUCT_NAMES = [
    "premium ankara tote bag",
    "bluetooth earbuds s2",
    "organic shea body butter",
    "portable study lamp",
    "classic sneakers"
  ];

  function safeParse(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function safeString(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalize(value) {
    return safeString(value).toLowerCase();
  }

  function slugify(value) {
    return normalize(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item";
  }

  function uniqueValues(values) {
    return Array.from(new Set((Array.isArray(values) ? values : [])
      .map((value) => safeString(value))
      .filter(Boolean)));
  }

  function buildVerificationMetadata(user = {}) {
    const source = user.verificationMetadata || {};
    const emailVerifiedAt = source.emailVerifiedAt || user.emailVerifiedAt || null;
    const defaultStatus = user.role === "seller"
      ? (emailVerifiedAt ? "Pending Review" : "Pending Email Verification")
      : (emailVerifiedAt ? "Verified" : "Pending Email Verification");

    return {
      status: safeString(source.status || user.verificationStatus) || defaultStatus,
      emailOtpSentAt: source.emailOtpSentAt || user.emailOtpSentAt || null,
      emailVerifiedAt,
      reviewedAt: source.reviewedAt || user.verifiedAt || null,
      reviewedBy: safeString(source.reviewedBy || user.verifiedBy),
      verificationDetails: safeString(source.verificationDetails || user.verificationDetails),
      documentName: safeString(source.documentName || user.verificationDocumentName),
      documentUrl: safeString(source.documentUrl || user.verificationDocumentUrl),
      documentStatus: safeString(source.documentStatus) || "",
      manualReviewRequired: user.role === "seller",
      uploadRules: safeString(source.uploadRules) || "Accepted formats: JPG, PNG, PDF. Maximum size: 5MB."
    };
  }

  function syncUserRecord(user = {}) {
    const firstName = safeString(user.firstName);
    const lastName = safeString(user.lastName);
    const preferredCategories = uniqueValues(user.preferredCategories || user.categories || []);
    const sellerCategories = uniqueValues(
      Array.isArray(user.productCategory)
        ? user.productCategory
        : safeString(user.productCategory).split(",")
    );
    const verificationMetadata = buildVerificationMetadata(user);
    const fullName = safeString(user.fullName) || `${firstName} ${lastName}`.trim();

    return {
      ...user,
      firstName,
      lastName,
      fullName,
      email: safeString(user.email),
      phone: safeString(user.phone),
      location: safeString(user.location),
      state: safeString(user.state) || "Enugu",
      country: safeString(user.country) || "Nigeria",
      whatYouSell: safeString(user.whatYouSell),
      school: safeString(user.school),
      productCategory: sellerCategories.join(", "),
      productCategories: sellerCategories,
      verificationDetails: verificationMetadata.verificationDetails,
      verificationStatus: verificationMetadata.status,
      verificationMetadata,
      preferredCategories,
      categories: preferredCategories,
      referralCode: safeString(user.referralCode),
      sessionToken: safeString(user.sessionToken),
      sessionStartedAt: user.sessionStartedAt || null
    };
  }

  function getUsers() {
    return readClientState("trusthub-users", []).map((user) => syncUserRecord(user));
  }

  function setUsers(users) {
    writeClientState("trusthub-users", (users || []).map((user) => syncUserRecord(user)));
  }

  function getCurrentUser() {
    return syncUserRecord(readClientState("trusthub-current-user", {}));
  }

  function setCurrentUser(user) {
    writeClientState("trusthub-current-user", syncUserRecord(user || {}));
  }

  function calculateAge(dateOfBirth) {
    if (!dateOfBirth) {
      return null;
    }

    const birthDate = new Date(dateOfBirth);
    if (Number.isNaN(birthDate.getTime())) {
      return null;
    }

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDifference = today.getMonth() - birthDate.getMonth();

    if (
      monthDifference < 0 ||
      (monthDifference === 0 && today.getDate() < birthDate.getDate())
    ) {
      age -= 1;
    }

    return age >= 0 ? age : null;
  }

  function getPasswordStrength(password) {
    const value = safeString(password);
    const checks = {
      length: value.length >= 8,
      upper: /[A-Z]/.test(value),
      lower: /[a-z]/.test(value),
      number: /\d/.test(value)
    };

    const score = Object.values(checks).filter(Boolean).length;

    if (score <= 2) {
      return { label: "Weak", level: "weak", width: "34%", strong: false, checks };
    }

    if (score === 3) {
      return { label: "Medium", level: "medium", width: "68%", strong: false, checks };
    }

    return { label: "Strong", level: "strong", width: "100%", strong: true, checks };
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0
    }).format(Number(amount) || 0);
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Not available";
    }

    return new Intl.DateTimeFormat("en-NG", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function getDashboardDestination(role) {
    if (role === "buyer") {
      return "buyer-dashboard.html";
    }

    if (role === "seller") {
      return "seller-dashboard.html";
    }

    if (role === "admin") {
      return "admin-dashboard.html";
    }

    return "login.html";
  }

  function getStoredUser(role, email, username) {
    return getUsers().find((user) => {
      const sameRole = !role || user.role === role;
      const emailMatch = email && normalize(user.email) === normalize(email);
      const usernameMatch = username && normalize(user.username) === normalize(username);
      return sameRole && (emailMatch || usernameMatch);
    }) || null;
  }

  function getActiveUser() {
    const currentUser = getCurrentUser();
    if (!currentUser.role) {
      return {};
    }

    const storedUser = getStoredUser(currentUser.role, currentUser.email, currentUser.username);
    return syncUserRecord({ ...storedUser, ...currentUser });
  }

  function getInitials(fullName) {
    return safeString(fullName)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "TH";
  }

  function isSameUser(leftUser, rightUser) {
    if (!leftUser || !rightUser) {
      return false;
    }

    if (safeString(leftUser.role) !== safeString(rightUser.role)) {
      return false;
    }

    const emailMatch = leftUser.email && rightUser.email &&
      normalize(leftUser.email) === normalize(rightUser.email);
    const usernameMatch = leftUser.username && rightUser.username &&
      normalize(leftUser.username) === normalize(rightUser.username);

    return Boolean(emailMatch || usernameMatch);
  }

  function getSellerStorageId(seller) {
    return normalize(seller && (seller.username || seller.email || "seller"));
  }

  function isDemoProduct(product) {
    const name = normalize(product && product.name);
    const id = normalize(product && product.id);
    return DEMO_PRODUCT_NAMES.includes(name) || /^p-00[1-4]$/.test(id);
  }

  function resolveImage(image, fallback = "logo.png") {
    if (Array.isArray(image)) {
      const firstImage = image.find((item) => safeString(item));
      return resolveImage(firstImage || fallback, fallback);
    }

    const value = safeString(image);
    if (!value || value.startsWith("blob:")) {
      return fallback;
    }

    return value;
  }

  function getVerificationStatus(user) {
    if (safeString(user && user.verificationStatus)) {
      return user.verificationStatus;
    }

    if (user && user.role === "admin") {
      return "Admin Access";
    }

    if (user && user.role === "seller") {
      return safeString(user.verificationDetails) ? "Pending Review" : "Verification Pending";
    }

    return "Email Verified";
  }

  function getUserStorageKey(user = getCurrentUser()) {
    return normalize(user.email || user.username || "guest");
  }

  function getAddressesKey(user = getCurrentUser()) {
    return `trusthub-addresses-${getUserStorageKey(user)}`;
  }

  function getNotificationsKey(user = getCurrentUser()) {
    return `trusthub-notifications-${getUserStorageKey(user)}`;
  }

  function getNotificationSettingsKey(user = getCurrentUser()) {
    return `trusthub-notification-settings-${getUserStorageKey(user)}`;
  }

  function getDefaultNotificationSettings() {
    return {
      orderUpdates: true,
      verificationUpdates: true,
      promotions: false,
      securityAlerts: true
    };
  }

  function getAddresses(user = getCurrentUser()) {
    return readClientState(getAddressesKey(user), []).filter(Boolean);
  }

  function setAddresses(addresses, user = getCurrentUser()) {
    const cleanAddresses = (addresses || []).filter(Boolean);
    writeClientState(getAddressesKey(user), cleanAddresses);
    return cleanAddresses;
  }

  function getNotifications(user = getCurrentUser()) {
    return readClientState(getNotificationsKey(user), []).filter(Boolean);
  }

  function setNotifications(notifications, user = getCurrentUser()) {
    const cleanNotifications = (notifications || []).filter(Boolean);
    writeClientState(getNotificationsKey(user), cleanNotifications.slice(0, 50));
    return cleanNotifications;
  }

  function addNotification(notification, user = getCurrentUser()) {
    if (!user || !user.role) {
      return [];
    }

    const notifications = getNotifications(user);
    notifications.unshift({
      id: notification.id || `NOTIF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: safeString(notification.type) || "info",
      title: safeString(notification.title) || "TrustHub update",
      message: safeString(notification.message) || "",
      createdAt: notification.createdAt || new Date().toISOString(),
      read: Boolean(notification.read)
    });

    return setNotifications(notifications, user);
  }

  function getNotificationSettings(user = getCurrentUser()) {
    return {
      ...getDefaultNotificationSettings(),
      ...readClientState(getNotificationSettingsKey(user), {})
    };
  }

  function setNotificationSettings(settings, user = getCurrentUser()) {
    const nextSettings = {
      ...getDefaultNotificationSettings(),
      ...(settings || {})
    };
    writeClientState(getNotificationSettingsKey(user), nextSettings);
    return nextSettings;
  }

  function getCartItems() {
    return readClientState("trusthub-cart", []).filter(Boolean);
  }

  function setCartItems(items) {
    writeClientState("trusthub-cart", (items || []).filter(Boolean));
  }

  function getAdminLogs() {
    return readClientState("trusthub-admin-logs", []);
  }

  function setAdminLogs(logs) {
    writeClientState("trusthub-admin-logs", logs || []);
  }

  function addAdminLog(action, details, actor = getCurrentUser()) {
    const logs = getAdminLogs();
    logs.unshift({
      id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action: safeString(action) || "Admin Action",
      details: safeString(details) || "No details provided.",
      actor: actor.fullName || actor.email || "Admin",
      actorEmail: actor.email || "",
      createdAt: new Date().toISOString()
    });
    setAdminLogs(logs.slice(0, 120));
    return logs;
  }

  function getDisputes() {
    return readClientState("trusthub-disputes", []);
  }

  function setDisputes(disputes) {
    writeClientState("trusthub-disputes", disputes || []);
  }

  function updateStoredUser(targetUser, updates) {
    const users = getUsers();
    const index = users.findIndex((user) => isSameUser(user, targetUser));

    if (index < 0) {
      return null;
    }

    users[index] = { ...users[index], ...updates };
    setUsers(users);

    const currentUser = getCurrentUser();
    if (isSameUser(currentUser, users[index])) {
      setCurrentUser({
        ...currentUser,
        ...updates,
        role: users[index].role,
        fullName: users[index].fullName || currentUser.fullName || "",
        email: users[index].email || currentUser.email || "",
        username: users[index].username || currentUser.username || "",
        phone: users[index].phone || currentUser.phone || "",
        location: users[index].location || currentUser.location || "",
        preferredCategories: users[index].preferredCategories || users[index].categories || currentUser.preferredCategories || currentUser.categories || [],
        categories: users[index].preferredCategories || users[index].categories || currentUser.preferredCategories || currentUser.categories || []
      });
    }

    return syncUserRecord(users[index]);
  }

  function getMarketplaceProducts() {
    return getUsers()
      .filter((user) => {
        if (user.role !== "seller") {
          return false;
        }

        const verificationStatus = normalize(user.verificationStatus || "");
        const accountStatus = normalize(user.accountStatus || "active");
        return verificationStatus === "verified" && accountStatus !== "suspended";
      })
      .flatMap((seller) => {
        const storageId = getSellerStorageId(seller);
        const products = readClientState(`trusthub-seller-products-${storageId}`, []);

        return products
          .filter((product) => product && !isDemoProduct(product))
          .map((product) => ({
            ...product,
            slug: safeString(product.slug) || slugify(product.name),
            image: resolveImage(product.image),
            sellerId: storageId,
            sellerName: seller.shopName || seller.businessName || seller.fullName || "Verified Seller",
            sellerEmail: seller.email || "",
            sellerUsername: seller.username || "",
            rating: Number(seller.rating || 4.8),
            verificationStatus: getVerificationStatus(seller),
            isPro: Boolean(seller.isPro)
          }));
      });
  }

  function setSelectedProduct(product) {
    writeClientState("trusthub-selected-product", product || null);
  }

  function getSelectedProduct() {
    return readClientState("trusthub-selected-product", null);
  }

  function getSavedItemsKey(user = getCurrentUser()) {
    return `trusthub-saved-items-${normalize(user.email || user.username || "buyer")}`;
  }

  function getSavedItems(user = getCurrentUser()) {
    return readClientState(
      getSavedItemsKey(user),
      readClientState("trusthub-saved-items", [])
    ).filter((item) => item && !isDemoProduct(item));
  }

  function setSavedItems(items, user = getCurrentUser()) {
    const cleanItems = (items || []).filter((item) => item && !isDemoProduct(item));
    writeClientState(getSavedItemsKey(user), cleanItems);
    writeClientState("trusthub-saved-items", cleanItems);
    return cleanItems;
  }

  function toggleSavedProduct(product, user = getCurrentUser()) {
    const savedItems = getSavedItems(user);
    const index = savedItems.findIndex((item) => item.id === product.id && String(item.sellerId || "") === String(product.sellerId || ""));

    if (index >= 0) {
      savedItems.splice(index, 1);
      setSavedItems(savedItems, user);
      return { saved: false, items: savedItems };
    }

    savedItems.unshift({
      ...product,
      image: resolveImage(product.image)
    });
    setSavedItems(savedItems, user);
    return { saved: true, items: savedItems };
  }

  function addCartItem(product, quantity = 1) {
    const items = getCartItems();
    const existing = items.find((item) => item.id === product.id && String(item.sellerId || "") === String(product.sellerId || ""));

    if (existing) {
      existing.quantity = (Number(existing.quantity) || 1) + quantity;
    } else {
      items.push({
        id: product.id,
        name: product.name,
        seller: product.sellerName || product.seller || "Verified Seller",
        sellerId: product.sellerId || "",
        sellerEmail: product.sellerEmail || "",
        sellerUsername: product.sellerUsername || "",
        price: Number(product.price) || 0,
        image: resolveImage(product.image),
        quantity,
        slug: safeString(product.slug) || slugify(product.name)
      });
    }

    setCartItems(items);
    setSelectedProduct(product);
    return items;
  }

  function updateCartItem(productId, sellerId, quantity) {
    const items = getCartItems();
    const index = items.findIndex((item) => item.id === productId && String(item.sellerId || "") === String(sellerId || ""));
    if (index < 0) {
      return items;
    }

    const nextQuantity = Math.max(0, Number(quantity) || 0);
    if (!nextQuantity) {
      items.splice(index, 1);
    } else {
      items[index].quantity = nextQuantity;
    }

    setCartItems(items);
    return items;
  }

  function removeCartItem(productId, sellerId) {
    return updateCartItem(productId, sellerId, 0);
  }

  function getServiceChargeRate(subtotal) {
    const value = Number(subtotal) || 0;
    if (value <= 0) {
      return 0;
    }

    if (value <= 5000) {
      return 0.1;
    }

    if (value <= 15000) {
      return 0.13;
    }

    return 0.2;
  }

  function getCartSummary(items = getCartItems(), selectedAddress = null, fulfillmentMethod = "delivery") {
    const cleanItems = (items || []).filter(Boolean);
    const subtotal = cleanItems.reduce((sum, item) => {
      return sum + (Number(item.price) || 0) * (Number(item.quantity) || 1);
    }, 0);
    const fulfillment = normalize(fulfillmentMethod) === "pickup" ? "pickup" : "delivery";
    const deliveryFee = cleanItems.length && fulfillment === "delivery"
      ? Number(selectedAddress && selectedAddress.deliveryFee) || 1500
      : 0;
    const serviceRate = getServiceChargeRate(subtotal);
    const serviceFee = cleanItems.length ? Math.round(subtotal * serviceRate) : 0;

    return {
      items: cleanItems,
      subtotal,
      deliveryFee,
      fulfillmentMethod: fulfillment,
      serviceRate,
      serviceFee,
      total: subtotal + deliveryFee + serviceFee
    };
  }

  function getOrderTimeline(order = {}) {
    const steps = ["Pending", "Accepted", "Shipped", "Delivered", "Completed"];
    const currentStatus = normalize(order.status) === "in transit"
      ? "shipped"
      : normalize(order.status);
    const currentIndex = Math.max(steps.findIndex((step) => normalize(step) === currentStatus), 0);

    return steps.map((step, index) => ({
      step,
      state: index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming"
    }));
  }

  function findProductByIdOrSlug(identifier) {
    const value = safeString(identifier);
    if (!value) {
      return null;
    }

    return getMarketplaceProducts().find((product) => {
      return safeString(product.id) === value || safeString(product.slug) === value || slugify(product.name) === slugify(value);
    }) || null;
  }

  function createApiSuccess(data, message = "") {
    return { ok: true, data, error: null, message };
  }

  function createApiError(message, code = "BAD_REQUEST", details = null) {
    return { ok: false, data: null, error: { code, message, details }, message: "" };
  }

  async function requireAuthenticatedUser(role = "") {
    const user = getActiveUser();
    if (!user.role) {
      return createApiError("Authentication required.", "UNAUTHORIZED");
    }

    if (role && user.role !== role) {
      return createApiError("You do not have access to this resource.", "FORBIDDEN");
    }

    return createApiSuccess(user);
  }

  function createSessionPayload(user) {
    return syncUserRecord({
      ...user,
      sessionToken: `th-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionStartedAt: new Date().toISOString()
    });
  }

  const services = {
    auth: {
      async signupBuyer(payload) {
        const users = getUsers();
        const duplicate = users.find((user) => {
          return normalize(user.email) === normalize(payload.email) || normalize(user.phone) === normalize(payload.phone);
        });

        if (duplicate) {
          return createApiError("An account with this email or phone number already exists.", "DUPLICATE_ACCOUNT");
        }

        const buyer = syncUserRecord({
          role: "buyer",
          firstName: payload.firstName,
          lastName: payload.lastName,
          fullName: `${safeString(payload.firstName)} ${safeString(payload.lastName)}`.trim(),
          email: payload.email,
          phone: payload.phone,
          password: payload.password,
          location: payload.location,
          country: payload.country,
          preferredCategories: payload.preferredCategories,
          referralCode: payload.referralCode,
          verificationStatus: "Pending Email Verification",
          verificationMetadata: {
            status: "Pending Email Verification",
            emailOtpSentAt: new Date().toISOString(),
            manualReviewRequired: false
          }
        });

        setUsers([...users, buyer]);
        setCurrentUser(createSessionPayload(buyer));
        writeClientText("trusthub-pending-role", "buyer");
        addNotification({
          title: "Verify your email",
          message: "Enter the OTP sent to your email address to activate your buyer account."
        }, buyer);
        return createApiSuccess(buyer, "Buyer account created.");
      },
      async signupSeller(payload) {
        const users = getUsers();
        const duplicate = users.find((user) => {
          return normalize(user.email) === normalize(payload.email) || normalize(user.phone) === normalize(payload.phone);
        });

        if (duplicate) {
          return createApiError("An account with this email or phone number already exists.", "DUPLICATE_ACCOUNT");
        }

        const seller = syncUserRecord({
          role: "seller",
          firstName: payload.firstName,
          lastName: payload.lastName,
          fullName: `${safeString(payload.firstName)} ${safeString(payload.lastName)}`.trim(),
          email: payload.email,
          phone: payload.phone,
          password: payload.password,
          dateOfBirth: payload.dateOfBirth,
          age: calculateAge(payload.dateOfBirth),
          school: payload.school,
          businessName: payload.businessName,
          whatYouSell: payload.whatYouSell,
          productCategory: payload.productCategory,
          location: payload.location,
          state: payload.state,
          country: payload.country,
          verificationDetails: payload.verificationDetails,
          referralCode: payload.referralCode,
          verificationStatus: "Pending Email Verification",
          verificationMetadata: {
            status: "Pending Email Verification",
            emailOtpSentAt: new Date().toISOString(),
            verificationDetails: safeString(payload.verificationDetails),
            documentName: safeString(payload.verificationDocumentName),
            documentUrl: safeString(payload.verificationDocumentUrl),
            manualReviewRequired: true
          }
        });

        setUsers([...users, seller]);
        setCurrentUser(createSessionPayload(seller));
        writeClientText("trusthub-pending-role", "seller");
        addNotification({
          title: "Complete seller verification",
          message: "Verify your email first, then your seller account will move to manual review."
        }, seller);
        return createApiSuccess(seller, "Seller account created.");
      },
      async login(payload) {
        const identifier = normalize(payload.identifier);
        const user = getUsers().find((item) => {
          const emailMatch = normalize(item.email) === identifier;
          const usernameMatch = normalize(item.username) === identifier;
          return item.role === payload.role && (emailMatch || usernameMatch) && item.password === payload.password;
        });

        if (!user) {
          return createApiError("We could not sign you in with those details.", "INVALID_CREDENTIALS");
        }

        const sessionUser = createSessionPayload(user);
        setCurrentUser(sessionUser);
        addNotification({
          title: "Sign-in successful",
          message: `You are now signed in as a ${user.role}.`,
          type: "success"
        }, sessionUser);
        return createApiSuccess(sessionUser, "Signed in successfully.");
      },
      async logout() {
        removeClientState("trusthub-current-user");
        removeClientState("trusthub-pending-role");
        return createApiSuccess(null, "Signed out.");
      },
      async getSession() {
        return createApiSuccess(getActiveUser());
      },
      async verifyEmailOtp(payload) {
        const user = getActiveUser();
        if (!user.role) {
          return createApiError("Authentication required.", "UNAUTHORIZED");
        }

        if (!/^\d{6}$/.test(safeString(payload.code))) {
          return createApiError("Enter a valid 6-digit code.", "INVALID_OTP");
        }

        const nextStatus = user.role === "seller" ? "Pending Review" : "Verified";
        const updatedUser = updateStoredUser(user, {
          verificationStatus: nextStatus,
          verificationDocumentName: safeString(payload.verificationDocumentName),
          verificationDocumentUrl: safeString(payload.verificationDocumentUrl),
          verificationMetadata: {
            ...buildVerificationMetadata(user),
            status: nextStatus,
            emailVerifiedAt: new Date().toISOString(),
            documentName: safeString(payload.verificationDocumentName),
            documentUrl: safeString(payload.verificationDocumentUrl),
            verificationDetails: safeString(payload.verificationDetails) || user.verificationDetails
          }
        });

        if (!updatedUser) {
          return createApiError("Unable to update verification status.", "VERIFY_FAILED");
        }

        removeClientState("trusthub-pending-role");
        addNotification({
          title: user.role === "seller" ? "Seller review started" : "Account verified",
          message: user.role === "seller"
            ? "Your email is verified. Your seller account is now pending manual review."
            : "Your buyer account is fully verified.",
          type: "success"
        }, updatedUser);
        return createApiSuccess(updatedUser, "Verification successful.");
      }
    },
    profile: {
      async getCurrentProfile() {
        return requireAuthenticatedUser();
      },
      async updateProfile(payload) {
        const session = await requireAuthenticatedUser();
        if (!session.ok) {
          return session;
        }

        const user = session.data;
        const updatedUser = updateStoredUser(user, {
          ...payload,
          preferredCategories: payload.preferredCategories || payload.categories || user.preferredCategories || [],
          categories: payload.preferredCategories || payload.categories || user.preferredCategories || []
        });

        if (!updatedUser) {
          return createApiError("Unable to update this profile.", "PROFILE_UPDATE_FAILED");
        }

        return createApiSuccess(updatedUser, "Profile updated.");
      },
      async changePassword(payload) {
        const session = await requireAuthenticatedUser();
        if (!session.ok) {
          return session;
        }

        const user = session.data;
        if (user.password !== payload.currentPassword) {
          return createApiError("Current password is incorrect.", "INVALID_PASSWORD");
        }

        if (safeString(payload.newPassword).length < 8) {
          return createApiError("New password must be at least 8 characters.", "WEAK_PASSWORD");
        }

        const updatedUser = updateStoredUser(user, {
          password: payload.newPassword
        });

        return createApiSuccess(updatedUser, "Password changed.");
      }
    },
    product: {
      async listProducts(filters = {}) {
        let products = getMarketplaceProducts();
        if (safeString(filters.category)) {
          products = products.filter((product) => normalize(product.category) === normalize(filters.category));
        }
        if (safeString(filters.query)) {
          const query = normalize(filters.query);
          products = products.filter((product) => {
            return normalize(`${product.name} ${product.description || ""} ${product.sellerName} ${product.category}`).includes(query);
          });
        }
        return createApiSuccess(products);
      },
      async getProductByIdOrSlug(identifier) {
        const product = findProductByIdOrSlug(identifier);
        return product
          ? createApiSuccess(product)
          : createApiError("Product not found.", "NOT_FOUND");
      },
      async getRelatedProducts(identifier, limit = 4) {
        const product = typeof identifier === "object" ? identifier : findProductByIdOrSlug(identifier);
        if (!product) {
          return createApiError("Product not found.", "NOT_FOUND");
        }

        const related = getMarketplaceProducts()
          .filter((item) => !(item.id === product.id && String(item.sellerId || "") === String(product.sellerId || "")))
          .filter((item) => item.category === product.category || String(item.sellerId || "") === String(product.sellerId || ""))
          .slice(0, limit);
        return createApiSuccess(related);
      },
      async getCategories() {
        return createApiSuccess(CATEGORIES.slice());
      }
    },
    cart: {
      async getCart() {
        return createApiSuccess(getCartSummary());
      },
      async addItem(product, quantity = 1) {
        return createApiSuccess(getCartSummary(addCartItem(product, quantity)));
      },
      async updateItem(productId, sellerId, quantity) {
        return createApiSuccess(getCartSummary(updateCartItem(productId, sellerId, quantity)));
      },
      async removeItem(productId, sellerId) {
        return createApiSuccess(getCartSummary(removeCartItem(productId, sellerId)));
      },
      async clear() {
        setCartItems([]);
        return createApiSuccess(getCartSummary([]));
      }
    },
    order: {
      async listOrders(role = "") {
        const session = await requireAuthenticatedUser();
        if (!session.ok) {
          return session;
        }

        const user = session.data;
        const activeRole = safeString(role) || user.role;
        const orders = readClientState("trusthub-orders", []).filter((order) => {
          if (activeRole === "seller") {
            return [order.sellerEmail, order.sellerUsername, order.seller]
              .map((value) => normalize(value))
              .includes(normalize(user.email || user.username || user.fullName));
          }

          return [order.buyerEmail, order.buyerUsername, order.buyer]
            .map((value) => normalize(value))
            .includes(normalize(user.email || user.username || user.fullName));
        });

        return createApiSuccess(orders);
      },
      async createFromCart(payload = {}) {
        const session = await requireAuthenticatedUser("buyer");
        if (!session.ok) {
          return session;
        }

        const buyer = session.data;
        const fulfillmentMethod = normalize(payload.fulfillmentMethod) === "pickup" ? "pickup" : "delivery";
        const cartSummary = getCartSummary(getCartItems(), payload.selectedAddress, fulfillmentMethod);
        if (!cartSummary.items.length) {
          return createApiError("Your cart is empty.", "EMPTY_CART");
        }

        const paymentReference = `THP-${Date.now()}`;
        const idempotencyKey = `THI-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const createdAt = new Date().toISOString();
        const readableDate = new Intl.DateTimeFormat("en-NG", {
          day: "2-digit",
          month: "short",
          year: "numeric"
        }).format(new Date(createdAt));
        const existingOrders = readClientState("trusthub-orders", []);
        const subtotal = Number(cartSummary.subtotal) || 0;

        const newOrders = cartSummary.items.map((item, index) => ({
          id: `THA-${Date.now() + index}`,
          product: item.name,
          productId: item.id,
          seller: item.seller || "Verified Seller",
          sellerId: item.sellerId || "",
          sellerEmail: item.sellerEmail || "",
          sellerUsername: item.sellerUsername || "",
          buyer: buyer.fullName || `${buyer.firstName || ""} ${buyer.lastName || ""}`.trim() || "Buyer",
          buyerEmail: buyer.email || "",
          buyerUsername: buyer.username || "",
          status: "Pending",
          paymentStatus: payload.paymentMethod === "transfer" ? "Pending Verification" : "Pending Confirmation",
          paymentMethod: payload.paymentMethod,
          paymentReference,
          idempotencyKey,
          date: readableDate,
          createdAt,
          amount: (Number(item.price) || 0) * (Number(item.quantity) || 1),
          buyerTotal: ((Number(item.price) || 0) * (Number(item.quantity) || 1)) +
            (subtotal ? Math.round(cartSummary.serviceFee * (((Number(item.price) || 0) * (Number(item.quantity) || 1)) / subtotal)) : 0) +
            (index === 0 ? cartSummary.deliveryFee : 0),
          trustHubCharge: subtotal ? Math.round(cartSummary.serviceFee * (((Number(item.price) || 0) * (Number(item.quantity) || 1)) / subtotal)) : 0,
          trustHubChargeRate: cartSummary.serviceRate,
          quantity: Number(item.quantity) || 1,
          image: item.image || "logo.png",
          fulfillmentMethod: cartSummary.fulfillmentMethod,
          deliveryAddressId: payload.selectedAddress && payload.selectedAddress.id ? payload.selectedAddress.id : "",
          deliveryAddressLabel: payload.selectedAddress
            ? `${payload.selectedAddress.label}: ${payload.selectedAddress.line1}, ${payload.selectedAddress.city}`
            : "Buyer pickup",
          deliveryFee: cartSummary.deliveryFee
        }));

        writeClientState("trusthub-orders", [...newOrders, ...existingOrders]);
        setCartItems([]);
        addNotification({
          title: "Order placed",
          message: `Your payment request has been created with reference ${paymentReference}.`,
          type: "success"
        }, buyer);
        return createApiSuccess({
          orders: newOrders,
          paymentReference,
          idempotencyKey,
          summary: cartSummary
        }, "Order created.");
      },
      getTimeline(order) {
        return getOrderTimeline(order);
      }
    },
    wishlist: {
      async listSavedItems() {
        const session = await requireAuthenticatedUser("buyer");
        if (!session.ok) {
          return session;
        }

        return createApiSuccess(getSavedItems(session.data));
      },
      async saveItem(product) {
        const session = await requireAuthenticatedUser("buyer");
        if (!session.ok) {
          return session;
        }

        const result = toggleSavedProduct(product, session.data);
        return createApiSuccess(result.items, result.saved ? "Saved." : "Removed.");
      },
      async removeItem(productId, sellerId) {
        const session = await requireAuthenticatedUser("buyer");
        if (!session.ok) {
          return session;
        }

        const nextItems = getSavedItems(session.data).filter((item) => {
          return !(item.id === productId && String(item.sellerId || "") === String(sellerId || ""));
        });
        setSavedItems(nextItems, session.data);
        return createApiSuccess(nextItems, "Removed.");
      }
    },
    address: {
      async listAddresses() {
        const session = await requireAuthenticatedUser();
        if (!session.ok) {
          return session;
        }

        return createApiSuccess(getAddresses(session.data));
      },
      async saveAddress(payload) {
        const session = await requireAuthenticatedUser();
        if (!session.ok) {
          return session;
        }

        const requiredFields = [
          ["label", "Address label"],
          ["fullName", "Recipient name"],
          ["phone", "Recipient phone"],
          ["line1", "Address line 1"],
          ["city", "City"],
          ["state", "State"],
          ["country", "Country"]
        ];

        const missingField = requiredFields.find(([key]) => !safeString(payload[key]));
        if (missingField) {
          return createApiError(`${missingField[1]} is required.`, "VALIDATION_ERROR");
        }

        const existingAddresses = getAddresses(session.data);
        const nextAddress = {
          id: payload.id || `ADDR-${Date.now()}`,
          label: safeString(payload.label) || "Delivery Address",
          fullName: safeString(payload.fullName),
          phone: safeString(payload.phone),
          line1: safeString(payload.line1),
          line2: safeString(payload.line2),
          city: safeString(payload.city) || "Enugu",
          state: safeString(payload.state) || "Enugu",
          country: safeString(payload.country) || "Nigeria",
          deliveryFee: Number(payload.deliveryFee) || 1500,
          isDefault: Boolean(payload.isDefault)
        };

        const cleanedAddresses = existingAddresses.filter((address) => address.id !== nextAddress.id)
          .map((address) => ({
            ...address,
            isDefault: nextAddress.isDefault ? false : Boolean(address.isDefault)
          }));
        cleanedAddresses.unshift(nextAddress);
        if (!cleanedAddresses.some((address) => address.isDefault)) {
          cleanedAddresses[0].isDefault = true;
        }

        setAddresses(cleanedAddresses, session.data);
        return createApiSuccess(cleanedAddresses, "Address saved.");
      },
      async deleteAddress(addressId) {
        const session = await requireAuthenticatedUser();
        if (!session.ok) {
          return session;
        }

        let addresses = getAddresses(session.data).filter((address) => address.id !== addressId);
        if (addresses.length && !addresses.some((address) => address.isDefault)) {
          addresses[0].isDefault = true;
        }
        setAddresses(addresses, session.data);
        return createApiSuccess(addresses, "Address deleted.");
      },
      async setDefault(addressId) {
        const session = await requireAuthenticatedUser();
        if (!session.ok) {
          return session;
        }

        const addresses = getAddresses(session.data).map((address) => ({
          ...address,
          isDefault: address.id === addressId
        }));
        setAddresses(addresses, session.data);
        return createApiSuccess(addresses, "Default address updated.");
      }
    },
    notification: {
      async listNotifications() {
        const session = await requireAuthenticatedUser();
        if (!session.ok) {
          return createApiSuccess([]);
        }

        return createApiSuccess(getNotifications(session.data));
      },
      async getSettings() {
        const session = await requireAuthenticatedUser();
        if (!session.ok) {
          return createApiSuccess(getDefaultNotificationSettings());
        }

        return createApiSuccess(getNotificationSettings(session.data));
      },
      async updateSettings(settings) {
        const session = await requireAuthenticatedUser();
        if (!session.ok) {
          return session;
        }

        return createApiSuccess(setNotificationSettings(settings, session.data), "Notification settings updated.");
      },
      async markAllRead() {
        const session = await requireAuthenticatedUser();
        if (!session.ok) {
          return session;
        }

        const notifications = getNotifications(session.data).map((notification) => ({
          ...notification,
          read: true
        }));
        setNotifications(notifications, session.data);
        return createApiSuccess(notifications, "Notifications marked as read.");
      }
    }
  };

  function showToast(message, type = "success") {
    if (!document || !document.body) {
      return;
    }

    let stack = document.querySelector(".th-toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "th-toast-stack";
      stack.setAttribute("aria-live", "polite");
      stack.setAttribute("aria-atomic", "true");
      document.body.appendChild(stack);
    }

    const toast = document.createElement("div");
    toast.className = `th-toast th-toast-${type}`;
    toast.setAttribute("role", "status");
    toast.textContent = message;
    stack.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("is-visible");
    });

    window.setTimeout(() => {
      toast.classList.remove("is-visible");
      window.setTimeout(() => {
        toast.remove();
      }, 220);
    }, 2200);
  }

  return {
    categories: CATEGORIES,
    demoProductNames: DEMO_PRODUCT_NAMES,
    safeParse,
    safeString,
    normalize,
    readClientState,
    writeClientState,
    readClientText,
    writeClientText,
    removeClientState,
    getUsers,
    setUsers,
    getCurrentUser,
    setCurrentUser,
    calculateAge,
    getPasswordStrength,
    formatCurrency,
    formatDateTime,
    getDashboardDestination,
    getStoredUser,
    getActiveUser,
    getInitials,
    isSameUser,
    getSellerStorageId,
    isDemoProduct,
    resolveImage,
    getVerificationStatus,
    getAdminLogs,
    setAdminLogs,
    addAdminLog,
    getDisputes,
    setDisputes,
    updateStoredUser,
    getMarketplaceProducts,
    setSelectedProduct,
    getSelectedProduct,
    getSavedItemsKey,
    getSavedItems,
    setSavedItems,
    toggleSavedProduct,
    addCartItem,
    updateCartItem,
    removeCartItem,
    getCartItems,
    setCartItems,
    getCartSummary,
    getOrderTimeline,
    findProductByIdOrSlug,
    getServiceChargeRate,
    getAddresses,
    setAddresses,
    getNotifications,
    addNotification,
    getNotificationSettings,
    setNotificationSettings,
    slugify,
    syncUserRecord,
    services,
    showToast
  };
})();

let thGlobalLoader;
let thLoaderCreatedAt = 0;
let thNavigationTransitionActive = false;

window.TrustHub = TrustHub;

initGlobalPagePolish();

document.addEventListener("DOMContentLoaded", () => {
  initThemeAndMenu();
  initNotificationPanels();

  if (!applyRouteGuard()) {
    return;
  }

  const page = document.body.dataset.page;

  if (page === "buyer-signup") {
    initBuyerSignup();
  }

  if (page === "seller-signup") {
    initSellerSignup();
  }

  if (page === "login") {
    initLogin();
  }

  if (page === "admin-login") {
    initAdminLogin();
  }

  if (page === "admin-dashboard") {
    initAdminDashboard();
  }

  if (page === "cart") {
    initCart();
  }

  if (page === "checkout") {
    initCheckout();
  }

  if (page === "orders") {
    initOrders();
  }

  if (page === "profile") {
    initProfile();
  }

  if (page === "verify") {
    initVerify();
  }

  if (page === "product") {
    initProduct();
  }

  if (page === "contact") {
    initContact();
  }

  requestAnimationFrame(() => {
    initSiteSectionAnimations();
    document.body.classList.add("th-page-ready");
    hideGlobalLoader();
  });
});

window.addEventListener("load", () => {
  hideGlobalLoader();
});

function initGlobalPagePolish() {
  injectGlobalPolishStyles();
  createGlobalLoader();
  initPageTransitions();
  markActiveNavigation();
}

function injectGlobalPolishStyles() {
  if (document.getElementById("th-global-polish-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "th-global-polish-styles";
  style.textContent = `
    body:not(.th-page-ready) main,
    body:not(.th-page-ready) .main-area,
    body:not(.th-page-ready) .dashboard-shell {
      opacity: 0.98;
    }
    body.th-page-ready main,
    body.th-page-ready .main-area,
    body.th-page-ready .dashboard-shell {
      animation: th-fade-in 0.28s ease both;
    }
    .th-global-loader {
      position: fixed;
      inset: 0;
      z-index: 999;
      display: grid;
      place-items: center;
      padding: 1.5rem;
      background: color-mix(in srgb, var(--background) 92%, transparent);
      backdrop-filter: blur(8px);
      transition: opacity 0.24s ease, visibility 0.24s ease;
    }
    .th-global-loader.is-hidden {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }
    .th-global-loader-card {
      display: grid;
      justify-items: center;
      gap: 0.85rem;
      min-width: min(300px, 100%);
      padding: 1.2rem 1.35rem;
      border: 1px solid var(--border);
      border-radius: 1.2rem;
      background: var(--surface);
      box-shadow: 0 18px 40px rgba(11, 31, 58, 0.14);
      text-align: center;
    }
    .th-global-loader-spinner {
      width: 2rem;
      height: 2rem;
      border-radius: 999px;
      border: 3px solid var(--border);
      border-top-color: #16A34A;
      animation: th-spin 0.8s linear infinite;
    }
    .th-global-loader strong {
      color: var(--primary);
      font-size: 1rem;
    }
    .th-global-loader span {
      color: var(--text);
      font-size: 0.9rem;
      opacity: 0.78;
    }
    .icon-button,
    .icon-btn,
    .profile-pill,
    .sidebar-link,
    .nav-link,
    .action-button,
    .stat-card,
    .stat,
    .panel,
    .section-card,
    .saved-card,
    .seller-card,
    .support-action,
    .order-row,
    .product-card,
    .mobile-nav a {
      transition: transform 0.24s ease, box-shadow 0.24s ease, border-color 0.18s ease, background-color 0.18s ease, color 0.18s ease;
    }
    .icon-button:hover,
    .icon-btn:hover,
    .profile-pill:hover,
    .sidebar-link:hover,
    .nav-link:hover,
    .mobile-nav a:hover {
      transform: translateY(-2px);
    }
    .sidebar-link.is-active,
    .nav-link.is-active,
    .mobile-nav a.is-active {
      border-color: rgba(22, 163, 74, 0.28);
      box-shadow: 0 12px 24px rgba(11, 31, 58, 0.1);
    }
    .panel:hover,
    .section-card:hover,
    .stat-card:hover,
    .stat:hover,
    .saved-card:hover,
    .seller-card:hover,
    .order-row:hover,
    .product-card:hover,
    .action-button:hover,
    .support-action:hover {
      transform: translateY(-3px);
      box-shadow: 0 18px 36px rgba(11, 31, 58, 0.12);
    }
    .th-reveal {
      opacity: 0;
      transform: translateY(22px) scale(0.985);
      transition: opacity 0.68s ease, transform 0.68s cubic-bezier(0.22, 1, 0.36, 1);
      transition-delay: var(--th-reveal-delay, 0s);
    }
    .th-reveal.is-visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    body.th-page-leaving .th-global-loader {
      opacity: 1;
      visibility: visible;
    }
    @keyframes th-fade-in {
      from {
        opacity: 0;
        transform: translateY(4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    @keyframes th-spin {
      to { transform: rotate(360deg); }
    }
    @media (prefers-reduced-motion: reduce) {
      .th-global-loader,
      .icon-button,
      .icon-btn,
      .profile-pill,
      .sidebar-link,
      .nav-link,
      .action-button,
      .stat-card,
      .stat,
      .panel,
      .section-card,
      .saved-card,
      .seller-card,
      .support-action,
      .order-row,
      .product-card,
      .mobile-nav a,
      .th-reveal {
        transition: none !important;
      }
      .th-global-loader-spinner {
        animation-duration: 1.6s;
      }
    }
  `;
  document.head.appendChild(style);
}

function createGlobalLoader() {
  if (!document.body || document.getElementById("th-global-loader")) {
    return;
  }

  thLoaderCreatedAt = Date.now();
  thGlobalLoader = document.createElement("div");
  thGlobalLoader.id = "th-global-loader";
  thGlobalLoader.className = "th-global-loader";
  thGlobalLoader.setAttribute("role", "status");
  thGlobalLoader.setAttribute("aria-live", "polite");
  thGlobalLoader.innerHTML = `
    <div class="th-global-loader-card">
      <div class="th-global-loader-spinner" aria-hidden="true"></div>
      <strong>Loading TrustHub Africa...</strong>
      <span>Please wait...</span>
    </div>
  `;
  document.body.appendChild(thGlobalLoader);
}

function showGlobalLoader(title = "Loading TrustHub Africa...", message = "Please wait...") {
  if (!thGlobalLoader) {
    createGlobalLoader();
  }

  if (!thGlobalLoader) {
    return;
  }

  const strong = thGlobalLoader.querySelector("strong");
  const span = thGlobalLoader.querySelector("span");
  if (strong) {
    strong.textContent = title;
  }
  if (span) {
    span.textContent = message;
  }
  thLoaderCreatedAt = Date.now();
  thGlobalLoader.classList.remove("is-hidden");
}

function hideGlobalLoader() {
  if (!thGlobalLoader || thGlobalLoader.classList.contains("is-hidden")) {
    return;
  }

  const elapsed = Date.now() - thLoaderCreatedAt;
  const delay = Math.max(0, 180 - elapsed);
  window.setTimeout(() => {
    thGlobalLoader.classList.add("is-hidden");
  }, delay);
}

function initPageTransitions() {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const link = target.closest("a");
    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }

    if (thNavigationTransitionActive || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const href = TrustHub.safeString(link.getAttribute("href"));
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
      return;
    }

    if (link.target && link.target !== "_self") {
      return;
    }

    if (link.hasAttribute("download")) {
      return;
    }

    const url = new URL(href, window.location.href);
    const isSameOrigin = url.origin === window.location.origin;
    const isNavigatingToCurrentPage = url.href === window.location.href;

    if (!isSameOrigin || isNavigatingToCurrentPage) {
      return;
    }

    event.preventDefault();
    thNavigationTransitionActive = true;
    showGlobalLoader("Loading TrustHub Africa...", "Please wait...");
    document.body.classList.add("th-page-leaving");
    window.setTimeout(() => {
      window.location.href = url.href;
    }, 120);
  });
}

function markActiveNavigation() {
  const currentFile = window.location.pathname.split("/").pop() || "index.html";
  const links = document.querySelectorAll(".nav-list a, .mobile-nav a, .sidebar-nav a, .sidebar-link, .nav-link");

  links.forEach((link) => {
    const href = TrustHub.safeString(link.getAttribute("href"));
    if (!href || href.startsWith("#")) {
      return;
    }

    const file = href.split("/").pop();
    if (file === currentFile) {
      link.classList.add("is-active");
    }
  });

  const hashLinks = document.querySelectorAll('.mobile-nav a[href^="#"], .sidebar-nav a[href^="#"], .sidebar-link[href^="#"], .nav-link[href^="#"]');
  hashLinks.forEach((link) => {
    link.addEventListener("click", () => {
      hashLinks.forEach((item) => item.classList.remove("is-active"));
      link.classList.add("is-active");
    });
  });
}

function initSiteSectionAnimations(scope = document) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const targets = Array.from(scope.querySelectorAll([
    ".th-page-header",
    ".th-panel",
    ".th-auth-card",
    ".th-admin-stat",
    ".th-admin-item",
    ".th-admin-log",
    ".th-cart-item",
    ".th-radio-card",
    ".th-empty-state",
    ".section-head",
    ".trust-strip-card",
    ".start-card",
    ".info-card",
    ".step-card",
    ".category-card",
    ".product-card",
    ".content-panel",
    ".support-panel",
    ".cta-wrap"
  ].join(","))).filter((element) => {
    return !element.closest(".site-header") && !element.closest(".site-footer") && element.dataset.thRevealReady !== "true";
  });

  if (!targets.length) {
    return;
  }

  targets.forEach((element, index) => {
    element.dataset.thRevealReady = "true";
    element.classList.add("th-reveal");
    element.style.setProperty("--th-reveal-delay", `${Math.min(index % 8, 7) * 0.045}s`);
  });

  if (reduceMotion || !("IntersectionObserver" in window)) {
    targets.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries, activeObserver) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      entry.target.classList.add("is-visible");
      activeObserver.unobserve(entry.target);
    });
  }, {
    threshold: 0.16,
    rootMargin: "0px 0px -6% 0px"
  });

  targets.forEach((element) => observer.observe(element));
}

function initThemeAndMenu() {
  const themeToggles = document.querySelectorAll(".theme-toggle");
  const menuToggle = document.querySelector(".menu-toggle");
  const mainNav = document.querySelector(".main-nav");
  const navLinks = document.querySelectorAll(".nav-list a");

  applyTheme("light");
  themeToggles.forEach((toggle) => {
    toggle.hidden = true;
    toggle.setAttribute("aria-hidden", "true");
  });

  const closeMenu = () => {
    if (!mainNav || !menuToggle) {
      return;
    }

    mainNav.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
  };

  if (menuToggle && mainNav) {
    menuToggle.addEventListener("click", () => {
      const isOpen = mainNav.classList.toggle("open");
      menuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  }

  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (href && href.startsWith("#")) {
        const target = document.querySelector(href);
        if (target) {
          event.preventDefault();
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
      closeMenu();
    });
  });

  document.addEventListener("click", (event) => {
    if (!mainNav || !menuToggle) {
      return;
    }

    if (!mainNav.contains(event.target) && !menuToggle.contains(event.target)) {
      closeMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1080) {
      closeMenu();
    }
  });

  const searchForm = document.querySelector(".search-form");
  if (searchForm) {
    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const searchInput = searchForm.querySelector('input[type="search"]');
      const selectInput = searchForm.querySelector("select");

      if (searchInput) {
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      }

      if (selectInput) {
        selectInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }
}

function applyRouteGuard() {
  const body = document.body;
  if (!body) {
    return true;
  }

  const requiresAuth = body.dataset.protected === "true";
  const requiredRole = TrustHub.safeString(body.dataset.role);
  if (!requiresAuth && !requiredRole) {
    return true;
  }

  const currentUser = TrustHub.getActiveUser();
  if (!currentUser.role) {
    TrustHub.writeClientText("trusthub-post-login-redirect", window.location.pathname.split("/").pop() || "index.html");
    window.location.href = "login.html";
    return false;
  }

  if (requiredRole && currentUser.role !== requiredRole) {
    window.location.href = TrustHub.getDashboardDestination(currentUser.role);
    return false;
  }

  return true;
}

function initNotificationPanels() {
  const buttons = Array.from(document.querySelectorAll('button[aria-label="Notifications"], [data-notification-toggle]'));
  if (!buttons.length) {
    return;
  }

  if (!document.getElementById("th-floating-panel-styles")) {
    const style = document.createElement("style");
    style.id = "th-floating-panel-styles";
    style.textContent = `
      .th-floating-panel {
        position: fixed;
        z-index: 130;
        width: min(360px, calc(100vw - 2rem));
        padding: 1rem;
        border: 1px solid var(--border);
        border-radius: 1rem;
        background: var(--surface);
        box-shadow: 0 20px 40px rgba(11, 31, 58, 0.16);
      }
      .th-floating-panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 0.85rem;
      }
      .th-floating-panel-head strong {
        color: var(--primary);
        font-size: 0.95rem;
      }
      .th-floating-panel-list {
        display: grid;
        gap: 0.75rem;
      }
      .th-floating-panel-item {
        padding: 0.85rem;
        border-radius: 0.9rem;
        background: var(--surface-soft);
      }
      .th-floating-panel-item strong {
        display: block;
        color: var(--primary);
        margin-bottom: 0.25rem;
      }
      .th-floating-panel-item p,
      .th-floating-panel-item span,
      .th-floating-panel-empty {
        color: var(--muted);
        font-size: 0.86rem;
        line-height: 1.5;
      }
      .th-floating-panel-actions {
        display: flex;
        justify-content: space-between;
        gap: 0.75rem;
        margin-top: 0.9rem;
      }
      .th-floating-panel-link {
        border: none;
        background: transparent;
        color: var(--primary);
        font-weight: 700;
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 2px;
      }
    `;
    document.head.appendChild(style);
  }

  const panel = document.createElement("div");
  panel.className = "th-floating-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Notifications panel");
  document.body.appendChild(panel);

  function renderPanel() {
    const user = TrustHub.getActiveUser();
    const notifications = user.role ? TrustHub.getNotifications(user) : [];
    panel.innerHTML = `
      <div class="th-floating-panel-head">
        <strong>Notifications</strong>
        <button type="button" class="th-floating-panel-link" data-panel-action="close">Close</button>
      </div>
      <div class="th-floating-panel-list">
        ${notifications.length ? notifications.slice(0, 5).map((notification) => `
          <article class="th-floating-panel-item">
            <strong>${notification.title}</strong>
            <p>${notification.message}</p>
            <span>${TrustHub.formatDateTime(notification.createdAt)}</span>
          </article>
        `).join("") : `
          <div class="th-floating-panel-empty">No notifications yet. Email verification, order updates, and account alerts will appear here.</div>
        `}
      </div>
      <div class="th-floating-panel-actions">
        <button type="button" class="th-floating-panel-link" data-panel-action="mark-read">Mark all read</button>
        <a href="profile.html" class="th-floating-panel-link">Notification settings</a>
      </div>
    `;
  }

  function closePanel() {
    panel.hidden = true;
  }

  buttons.forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      renderPanel();
      if (!panel.hidden) {
        closePanel();
        return;
      }

      const rect = button.getBoundingClientRect();
      panel.style.top = `${Math.min(rect.bottom + 10, window.innerHeight - 20)}px`;
      panel.style.left = `${Math.max(16, rect.right - Math.min(360, window.innerWidth - 32))}px`;
      panel.hidden = false;
    });
  });

  panel.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.dataset.panelAction;
    if (action === "close") {
      closePanel();
    }

    if (action === "mark-read") {
      await TrustHub.services.notification.markAllRead();
      renderPanel();
      TrustHub.showToast("Notifications marked as read.");
    }
  });

  document.addEventListener("click", (event) => {
    if (!panel.hidden && !panel.contains(event.target)) {
      closePanel();
    }
  });
}

function setInputError(id, message) {
  const input = document.getElementById(id);
  const error = document.getElementById(`error-${id}`);

  if (input) {
    input.classList.toggle("th-invalid", Boolean(message));
  }

  if (error) {
    error.textContent = message || "";
  }
}

function setTextError(id, message) {
  const error = document.getElementById(`error-${id}`);
  if (error) {
    error.textContent = message || "";
  }
}

function bindShowPassword(toggleId, inputIds) {
  const toggle = document.getElementById(toggleId);
  if (!toggle) {
    return;
  }

  toggle.addEventListener("change", () => {
    const type = toggle.checked ? "text" : "password";
    inputIds.forEach((id) => {
      const input = document.getElementById(id);
      if (input) {
        input.type = type;
      }
    });
  });
}

function createCategorySelect(rootId, defaultLabel) {
  const root = document.getElementById(rootId);
  const toggle = root?.querySelector(".th-multi-select-toggle");
  const label = root?.querySelector(".th-multi-select-label");
  const inputs = Array.from(root?.querySelectorAll("input[type='checkbox']") || []);

  function selectedValues() {
    return inputs.filter((input) => input.checked).map((input) => input.value);
  }

  function syncLabel() {
    const values = selectedValues();
    label.textContent = values.length ? values.join(", ") : defaultLabel;
  }

  if (toggle && root) {
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      root.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", root.classList.contains("is-open") ? "true" : "false");
    });

    document.addEventListener("click", (event) => {
      if (!root.contains(event.target)) {
        root.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  inputs.forEach((input) => input.addEventListener("change", syncLabel));
  syncLabel();

  return {
    getValues: selectedValues
  };
}

function attachFieldValidation(inputs, callback) {
  inputs.forEach((input) => {
    input.addEventListener("blur", () => callback(true));
    input.addEventListener("input", () => callback(false));
    input.addEventListener("change", () => callback(false));
  });
}

function initBuyerSignup() {
  const form = document.getElementById("buyer-signup-form");
  if (!form) {
    return;
  }

  const firstName = document.getElementById("buyer-first-name");
  const lastName = document.getElementById("buyer-last-name");
  const email = document.getElementById("buyer-email");
  const phone = document.getElementById("buyer-phone");
  const password = document.getElementById("buyer-password");
  const confirmPassword = document.getElementById("buyer-confirm-password");
  const location = document.getElementById("buyer-location");
  const country = document.getElementById("buyer-country");
  const referralCode = document.getElementById("buyer-referral-code");
  const submitButton = document.getElementById("buyer-submit");
  const strengthBadge = document.getElementById("buyer-strength-badge");
  const strengthFill = document.getElementById("buyer-strength-fill");
  const categorySelect = createCategorySelect("buyer-category-select", "Select preferred categories");
  const agreements = [
    document.getElementById("buyer-agree-terms"),
    document.getElementById("buyer-agree-privacy"),
    document.getElementById("buyer-agree-rules")
  ];

  const checklist = {
    length: document.getElementById("buyer-check-length"),
    upper: document.getElementById("buyer-check-upper"),
    lower: document.getElementById("buyer-check-lower"),
    number: document.getElementById("buyer-check-number")
  };

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phonePattern = /^[+]?\d{8,15}$/;

  bindShowPassword("buyer-show-password", ["buyer-password", "buyer-confirm-password"]);

  function updatePasswordStrength() {
    const strength = TrustHub.getPasswordStrength(password.value);
    strengthBadge.textContent = strength.label;
    strengthBadge.dataset.level = strength.level;
    strengthFill.style.width = strength.width;
    strengthFill.dataset.level = strength.level;

    Object.entries(checklist).forEach(([key, item]) => {
      item.classList.toggle("is-valid", strength.checks[key]);
    });

    return strength;
  }

  function validate(showErrors) {
    let valid = true;

    if (!TrustHub.safeString(firstName.value)) {
      valid = false;
      if (showErrors) {
        setInputError("buyer-first-name", "First Name is required.");
      }
    } else {
      setInputError("buyer-first-name", "");
    }

    if (!TrustHub.safeString(lastName.value)) {
      valid = false;
      if (showErrors) {
        setInputError("buyer-last-name", "Last Name is required.");
      }
    } else {
      setInputError("buyer-last-name", "");
    }

    const emailValue = TrustHub.safeString(email.value);
    if (!emailValue) {
      valid = false;
      if (showErrors) {
        setInputError("buyer-email", "Email Address is required.");
      }
    } else if (!emailPattern.test(emailValue)) {
      valid = false;
      if (showErrors) {
        setInputError("buyer-email", "Enter a valid email address.");
      }
    } else if (TrustHub.getStoredUser("", emailValue, "")) {
      valid = false;
      if (showErrors) {
        setInputError("buyer-email", "An account with this email already exists.");
      }
    } else {
      setInputError("buyer-email", "");
    }

    const phoneValue = TrustHub.safeString(phone.value).replace(/\s+/g, "");
    if (!phoneValue) {
      valid = false;
      if (showErrors) {
        setInputError("buyer-phone", "Phone Number is required.");
      }
    } else if (!phonePattern.test(phoneValue)) {
      valid = false;
      if (showErrors) {
        setInputError("buyer-phone", "Enter a valid phone number with 8 to 15 digits.");
      }
    } else {
      setInputError("buyer-phone", "");
    }

    const passwordStrength = updatePasswordStrength();
    if (!TrustHub.safeString(password.value)) {
      valid = false;
      if (showErrors) {
        setInputError("buyer-password", "Password is required.");
      }
    } else if (!passwordStrength.strong) {
      valid = false;
      if (showErrors) {
        setInputError("buyer-password", "Password strength must be strong.");
      }
    } else {
      setInputError("buyer-password", "");
    }

    if (!TrustHub.safeString(confirmPassword.value)) {
      valid = false;
      if (showErrors) {
        setInputError("buyer-confirm-password", "Confirm Password is required.");
      }
    } else if (password.value !== confirmPassword.value) {
      valid = false;
      if (showErrors) {
        setInputError("buyer-confirm-password", "Passwords do not match.");
      }
    } else {
      setInputError("buyer-confirm-password", "");
    }

    if (!TrustHub.safeString(location.value)) {
      valid = false;
      if (showErrors) {
        setInputError("buyer-location", "Location is required.");
      }
    } else {
      setInputError("buyer-location", "");
    }

    if (!TrustHub.safeString(country.value)) {
      valid = false;
      if (showErrors) {
        setInputError("buyer-country", "Country is required.");
      }
    } else {
      setInputError("buyer-country", "");
    }

    if (!categorySelect.getValues().length) {
      valid = false;
      if (showErrors) {
        setTextError("buyer-categories", "Select at least one preferred category.");
      }
    } else {
      setTextError("buyer-categories", "");
    }

    if (!agreements.every((checkbox) => checkbox.checked)) {
      valid = false;
      if (showErrors) {
        setTextError("buyer-agreements", "Accept all required checkboxes to continue.");
      }
    } else {
      setTextError("buyer-agreements", "");
    }

    submitButton.disabled = !valid;
    return valid;
  }

  attachFieldValidation(
    [firstName, lastName, email, phone, password, confirmPassword, location, country, ...agreements],
    validate
  );

  document
    .querySelectorAll("#buyer-category-select input[type='checkbox']")
    .forEach((input) => input.addEventListener("change", () => validate(false)));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validate(true)) {
      return;
    }

    const response = await TrustHub.services.auth.signupBuyer({
      firstName: TrustHub.safeString(firstName.value),
      lastName: TrustHub.safeString(lastName.value),
      email: TrustHub.safeString(email.value),
      phone: TrustHub.safeString(phone.value),
      password: password.value,
      location: TrustHub.safeString(location.value),
      country: TrustHub.safeString(country.value),
      preferredCategories: categorySelect.getValues(),
      referralCode: TrustHub.safeString(referralCode.value)
    });

    if (!response.ok) {
      setInputError("buyer-email", response.error.message);
      return;
    }

    window.location.href = "verify.html";
  });

  updatePasswordStrength();
  validate(false);
}

function initSellerSignup() {
  const form = document.getElementById("seller-signup-form");
  if (!form) {
    return;
  }

  const firstName = document.getElementById("seller-first-name");
  const lastName = document.getElementById("seller-last-name");
  const email = document.getElementById("seller-email");
  const phone = document.getElementById("seller-phone");
  const password = document.getElementById("seller-password");
  const confirmPassword = document.getElementById("seller-confirm-password");
  const dateOfBirth = document.getElementById("seller-date-of-birth");
  const school = document.getElementById("seller-school");
  const schoolOtherWrap = document.getElementById("seller-school-other-wrap");
  const schoolOther = document.getElementById("seller-school-other");
  const productCategorySelect = createCategorySelect("seller-product-category-select", "Select product categories");
  const productCategoryInputs = Array.from(document.querySelectorAll("#seller-product-category-select input[type='checkbox']"));
  const whatYouSell = document.getElementById("seller-what-you-sell");
  const location = document.getElementById("seller-location");
  const country = document.getElementById("seller-country");
  const verificationDetails = document.getElementById("seller-verification-details");
  const referralCode = document.getElementById("seller-referral-code");
  const submitButton = document.getElementById("seller-submit");
  const strengthBadge = document.getElementById("seller-strength-badge");
  const strengthFill = document.getElementById("seller-strength-fill");
  const agePreview = document.getElementById("seller-age-preview");
  const agreements = [
    document.getElementById("seller-agree-terms"),
    document.getElementById("seller-agree-privacy"),
    document.getElementById("seller-agree-rules"),
    document.getElementById("seller-agree-verification")
  ];

  const checklist = {
    length: document.getElementById("seller-check-length"),
    upper: document.getElementById("seller-check-upper"),
    lower: document.getElementById("seller-check-lower"),
    number: document.getElementById("seller-check-number")
  };

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phonePattern = /^[+]?\d{8,15}$/;

  bindShowPassword("seller-show-password", ["seller-password", "seller-confirm-password"]);
  dateOfBirth.max = new Date().toISOString().split("T")[0];

  function syncSchoolField() {
    const isOther = TrustHub.safeString(school.value) === "Others";
    if (schoolOtherWrap) {
      schoolOtherWrap.hidden = !isOther;
    }

    if (schoolOther) {
      schoolOther.disabled = !isOther;
      if (!isOther) {
        schoolOther.value = "";
        setInputError("seller-school-other", "");
      }
    }
  }

  function updatePasswordStrength() {
    const strength = TrustHub.getPasswordStrength(password.value);
    strengthBadge.textContent = strength.label;
    strengthBadge.dataset.level = strength.level;
    strengthFill.style.width = strength.width;
    strengthFill.dataset.level = strength.level;

    Object.entries(checklist).forEach(([key, item]) => {
      item.classList.toggle("is-valid", strength.checks[key]);
    });

    return strength;
  }

  function updateAgePreview() {
    const age = TrustHub.calculateAge(dateOfBirth.value);
    agePreview.textContent = age === null
      ? "Age will appear here after you pick a valid date of birth."
      : age < 18
        ? `You must be at least 18. Current age: ${age}`
        : `Calculated age: ${age}`;
    return age;
  }

  function validate(showErrors) {
    let valid = true;

    if (!TrustHub.safeString(firstName.value)) {
      valid = false;
      if (showErrors) {
        setInputError("seller-first-name", "First Name is required.");
      }
    } else {
      setInputError("seller-first-name", "");
    }

    if (!TrustHub.safeString(lastName.value)) {
      valid = false;
      if (showErrors) {
        setInputError("seller-last-name", "Last Name is required.");
      }
    } else {
      setInputError("seller-last-name", "");
    }

    const emailValue = TrustHub.safeString(email.value);
    if (!emailValue) {
      valid = false;
      if (showErrors) {
        setInputError("seller-email", "Email Address is required.");
      }
    } else if (!emailPattern.test(emailValue)) {
      valid = false;
      if (showErrors) {
        setInputError("seller-email", "Enter a valid email address.");
      }
    } else if (TrustHub.getStoredUser("", emailValue, "")) {
      valid = false;
      if (showErrors) {
        setInputError("seller-email", "An account with this email already exists.");
      }
    } else {
      setInputError("seller-email", "");
    }

    const phoneValue = TrustHub.safeString(phone.value).replace(/\s+/g, "");
    if (!phoneValue) {
      valid = false;
      if (showErrors) {
        setInputError("seller-phone", "Phone Number is required.");
      }
    } else if (!phonePattern.test(phoneValue)) {
      valid = false;
      if (showErrors) {
        setInputError("seller-phone", "Enter a valid phone number with 8 to 15 digits.");
      }
    } else {
      setInputError("seller-phone", "");
    }

    const passwordStrength = updatePasswordStrength();
    if (!TrustHub.safeString(password.value)) {
      valid = false;
      if (showErrors) {
        setInputError("seller-password", "Password is required.");
      }
    } else if (!passwordStrength.strong) {
      valid = false;
      if (showErrors) {
        setInputError("seller-password", "Password strength must be strong.");
      }
    } else {
      setInputError("seller-password", "");
    }

    if (!TrustHub.safeString(confirmPassword.value)) {
      valid = false;
      if (showErrors) {
        setInputError("seller-confirm-password", "Confirm Password is required.");
      }
    } else if (password.value !== confirmPassword.value) {
      valid = false;
      if (showErrors) {
        setInputError("seller-confirm-password", "Passwords do not match.");
      }
    } else {
      setInputError("seller-confirm-password", "");
    }

    const age = updateAgePreview();
    if (!TrustHub.safeString(dateOfBirth.value)) {
      valid = false;
      if (showErrors) {
        setInputError("seller-date-of-birth", "Date of Birth is required.");
      }
    } else if (age === null) {
      valid = false;
      if (showErrors) {
        setInputError("seller-date-of-birth", "Enter a valid date of birth.");
      }
    } else if (age < 18) {
      valid = false;
      if (showErrors) {
        setInputError("seller-date-of-birth", "You must be at least 18 years old.");
      }
    } else {
      setInputError("seller-date-of-birth", "");
    }

    if (!TrustHub.safeString(school.value)) {
      valid = false;
      if (showErrors) {
        setInputError("seller-school", "School is required.");
      }
    } else {
      setInputError("seller-school", "");
    }

    if (TrustHub.safeString(school.value) === "Others") {
      if (!TrustHub.safeString(schoolOther.value)) {
        valid = false;
        if (showErrors) {
          setInputError("seller-school-other", "Enter your school or business name.");
        }
      } else {
        setInputError("seller-school-other", "");
      }
    } else {
      setInputError("seller-school-other", "");
    }

    const selectedProductCategories = productCategorySelect.getValues();
    if (!selectedProductCategories.length) {
      valid = false;
      if (showErrors) {
        setInputError("seller-product-category", "Select at least one product category.");
      }
    } else {
      setInputError("seller-product-category", "");
    }

    if (!TrustHub.safeString(whatYouSell.value)) {
      valid = false;
      if (showErrors) {
        setInputError("seller-what-you-sell", "What You Sell is required.");
      }
    } else {
      setInputError("seller-what-you-sell", "");
    }

    if (!TrustHub.safeString(location.value)) {
      valid = false;
      if (showErrors) {
        setInputError("seller-location", "Location is required.");
      }
    } else {
      setInputError("seller-location", "");
    }

    if (!TrustHub.safeString(country.value)) {
      valid = false;
      if (showErrors) {
        setInputError("seller-country", "Country is required.");
      }
    } else {
      setInputError("seller-country", "");
    }

    if (!TrustHub.safeString(verificationDetails.value)) {
      valid = false;
      if (showErrors) {
        setInputError("seller-verification-details", "Business Name is required.");
      }
    } else {
      setInputError("seller-verification-details", "");
    }

    if (!agreements.every((checkbox) => checkbox.checked)) {
      valid = false;
      if (showErrors) {
        setTextError("seller-agreements", "Accept all required checkboxes to continue.");
      }
    } else {
      setTextError("seller-agreements", "");
    }

    submitButton.disabled = !valid;
    return valid;
  }

  attachFieldValidation(
    [firstName, lastName, email, phone, password, confirmPassword, dateOfBirth, school, schoolOther, whatYouSell, location, country, verificationDetails, ...agreements],
    validate
  );

  school.addEventListener("change", () => {
    syncSchoolField();
    validate(false);
  });

  productCategoryInputs.forEach((input) => {
    input.addEventListener("change", () => validate(false));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validate(true)) {
      return;
    }

    const response = await TrustHub.services.auth.signupSeller({
      firstName: TrustHub.safeString(firstName.value),
      lastName: TrustHub.safeString(lastName.value),
      email: TrustHub.safeString(email.value),
      phone: TrustHub.safeString(phone.value),
      password: password.value,
      dateOfBirth: dateOfBirth.value,
      school: TrustHub.safeString(school.value) === "Others"
        ? TrustHub.safeString(schoolOther.value)
        : TrustHub.safeString(school.value),
      businessName: TrustHub.safeString(verificationDetails.value),
      whatYouSell: TrustHub.safeString(whatYouSell.value),
      productCategory: productCategorySelect.getValues(),
      location: TrustHub.safeString(location.value),
      state: "Enugu",
      country: TrustHub.safeString(country.value),
      verificationDetails: TrustHub.safeString(verificationDetails.value),
      referralCode: TrustHub.safeString(referralCode.value)
    });

    if (!response.ok) {
      setInputError("seller-email", response.error.message);
      return;
    }

    window.location.href = "verify.html";
  });

  updatePasswordStrength();
  updateAgePreview();
  syncSchoolField();
  validate(false);
}

function initLogin() {
  const roleCards = Array.from(document.querySelectorAll("[data-login-role]"));
  const roleInput = document.getElementById("login-role");
  const formWrap = document.getElementById("login-form-wrap");
  const activeRoleLabel = document.getElementById("active-login-role");
  const signUpLink = document.getElementById("login-signup-link");
  const identifier = document.getElementById("login-identifier");
  const password = document.getElementById("login-password");
  const showPassword = document.getElementById("login-show-password");
  const submitButton = document.getElementById("login-submit");
  const form = document.getElementById("login-form");
  const formError = document.getElementById("error-login-form");
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!form) {
    return;
  }

  if (showPassword) {
    bindShowPassword("login-show-password", ["login-password"]);
  }

  function updateSubmitState() {
    submitButton.disabled = !(roleInput.value && TrustHub.safeString(identifier.value) && TrustHub.safeString(password.value));
  }

  function selectRole(role) {
    roleInput.value = role;
    formWrap.hidden = false;
    activeRoleLabel.textContent = role === "seller" ? "Seller login" : "Buyer login";
    signUpLink.href = role === "seller" ? "seller-signup.html" : "buyer-signup.html";
    signUpLink.textContent = role === "seller" ? "Create a seller account" : "Create a buyer account";
    roleCards.forEach((card) => {
      card.classList.toggle("is-active", card.dataset.loginRole === role);
    });
    identifier.focus();
    updateSubmitState();
  }

  function validate(showErrors) {
    let valid = true;

    if (!roleInput.value) {
      valid = false;
      if (showErrors) {
        formError.textContent = "Choose whether you want to log in as a buyer or seller.";
      }
    }

    const identifierValue = TrustHub.safeString(identifier.value);
    if (!identifierValue) {
      valid = false;
      if (showErrors) {
        setInputError("login-identifier", "Email or Username is required.");
      }
    } else if (identifierValue.includes("@") && !emailPattern.test(identifierValue)) {
      valid = false;
      if (showErrors) {
        setInputError("login-identifier", "Enter a valid email address or username.");
      }
    } else {
      setInputError("login-identifier", "");
    }

    if (!TrustHub.safeString(password.value)) {
      valid = false;
      if (showErrors) {
        setInputError("login-password", "Password is required.");
      }
    } else {
      setInputError("login-password", "");
    }

    updateSubmitState();
    return valid;
  }

  roleCards.forEach((card) => {
    card.addEventListener("click", () => {
      formError.textContent = "";
      selectRole(card.dataset.loginRole);
    });
  });

  attachFieldValidation([identifier, password], () => {
    formError.textContent = "";
    validate(false);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formError.textContent = "";

    if (!validate(true)) {
      return;
    }

    const response = await TrustHub.services.auth.login({
      role: roleInput.value,
      identifier: identifier.value,
      password: password.value
    });

    if (!response.ok) {
      formError.textContent = response.error.message;
      return;
    }

    const user = response.data;
    const verificationPending = !user.verificationMetadata.emailVerifiedAt &&
      TrustHub.normalize(user.verificationStatus).includes("pending email");
    const redirectTarget = TrustHub.readClientText("trusthub-post-login-redirect");

    if (verificationPending) {
      TrustHub.writeClientText("trusthub-pending-role", user.role);
      window.location.href = "verify.html";
      return;
    }

    TrustHub.removeClientState("trusthub-post-login-redirect");
    window.location.href = redirectTarget && redirectTarget !== "login.html"
      ? redirectTarget
      : TrustHub.getDashboardDestination(user.role);
  });

  updateSubmitState();
}

function initAdminLogin() {
  const setupPanel = document.getElementById("admin-setup-panel");
  const loginPanel = document.getElementById("admin-login-panel");
  const setupForm = document.getElementById("admin-setup-form");
  const loginForm = document.getElementById("admin-login-form");
  const stateMessage = document.getElementById("admin-access-state");
  const setupStrengthBadge = document.getElementById("admin-setup-strength-label");
  const setupStrengthBar = document.getElementById("admin-setup-strength-bar");
  const setupSubmit = document.getElementById("admin-setup-submit");
  const loginSubmit = document.getElementById("admin-login-submit");
  const setupPassword = document.getElementById("admin-setup-password");
  const setupConfirmPassword = document.getElementById("admin-setup-confirm-password");
  const loginIdentifier = document.getElementById("admin-login-identifier");
  const loginPassword = document.getElementById("admin-login-password");
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!setupForm || !loginForm) {
    return;
  }

  bindShowPassword("admin-setup-show-password", ["admin-setup-password", "admin-setup-confirm-password"]);
  bindShowPassword("admin-login-show-password", ["admin-login-password"]);

  function hasAdminAccount() {
    return TrustHub.getUsers().some((user) => user.role === "admin");
  }

  function syncMode() {
    const adminExists = hasAdminAccount();
    setupPanel.hidden = adminExists;
    loginPanel.hidden = !adminExists;
    stateMessage.textContent = adminExists
      ? "Admin access is enabled. Sign in with your admin account to manage TrustHub Africa."
      : "No admin account exists yet. Create the first admin account to unlock the control panel.";
  }

  function updateSetupState() {
    const passwordStrength = TrustHub.getPasswordStrength(setupPassword.value);
    setupStrengthBadge.textContent = passwordStrength.label;
    setupStrengthBadge.dataset.level = passwordStrength.level;
    setupStrengthBar.style.width = passwordStrength.width;
    setupStrengthBar.dataset.level = passwordStrength.level;
    setupSubmit.disabled = !(
      TrustHub.safeString(document.getElementById("admin-setup-first-name").value) &&
      TrustHub.safeString(document.getElementById("admin-setup-last-name").value) &&
      TrustHub.safeString(document.getElementById("admin-setup-email").value) &&
      passwordStrength.strong &&
      setupPassword.value === setupConfirmPassword.value
    );
  }

  function validateSetup(showErrors) {
    let valid = true;
    const firstName = document.getElementById("admin-setup-first-name");
    const lastName = document.getElementById("admin-setup-last-name");
    const email = document.getElementById("admin-setup-email");
    const passwordStrength = TrustHub.getPasswordStrength(setupPassword.value);

    if (!TrustHub.safeString(firstName.value)) {
      valid = false;
      if (showErrors) {
        setInputError("admin-setup-first-name", "First name is required.");
      }
    } else {
      setInputError("admin-setup-first-name", "");
    }

    if (!TrustHub.safeString(lastName.value)) {
      valid = false;
      if (showErrors) {
        setInputError("admin-setup-last-name", "Last name is required.");
      }
    } else {
      setInputError("admin-setup-last-name", "");
    }

    if (!TrustHub.safeString(email.value)) {
      valid = false;
      if (showErrors) {
        setInputError("admin-setup-email", "Email address is required.");
      }
    } else if (!emailPattern.test(TrustHub.safeString(email.value))) {
      valid = false;
      if (showErrors) {
        setInputError("admin-setup-email", "Enter a valid email address.");
      }
    } else if (TrustHub.getUsers().some((user) => TrustHub.normalize(user.email) === TrustHub.normalize(email.value))) {
      valid = false;
      if (showErrors) {
        setInputError("admin-setup-email", "An account with this email already exists.");
      }
    } else {
      setInputError("admin-setup-email", "");
    }

    if (!passwordStrength.strong) {
      valid = false;
      if (showErrors) {
        setInputError("admin-setup-password", "Use a strong password with uppercase, lowercase, number, and at least 8 characters.");
      }
    } else {
      setInputError("admin-setup-password", "");
    }

    if (setupConfirmPassword.value !== setupPassword.value || !setupConfirmPassword.value) {
      valid = false;
      if (showErrors) {
        setInputError("admin-setup-confirm-password", "Passwords must match.");
      }
    } else {
      setInputError("admin-setup-confirm-password", "");
    }

    updateSetupState();
    return valid;
  }

  function updateLoginState() {
    loginSubmit.disabled = !(TrustHub.safeString(loginIdentifier.value) && TrustHub.safeString(loginPassword.value));
  }

  function validateLogin(showErrors) {
    let valid = true;
    const identifier = TrustHub.safeString(loginIdentifier.value);

    if (!identifier) {
      valid = false;
      if (showErrors) {
        setInputError("admin-login-identifier", "Email or username is required.");
      }
    } else if (identifier.includes("@") && !emailPattern.test(identifier)) {
      valid = false;
      if (showErrors) {
        setInputError("admin-login-identifier", "Enter a valid email address or username.");
      }
    } else {
      setInputError("admin-login-identifier", "");
    }

    if (!TrustHub.safeString(loginPassword.value)) {
      valid = false;
      if (showErrors) {
        setInputError("admin-login-password", "Password is required.");
      }
    } else {
      setInputError("admin-login-password", "");
    }

    updateLoginState();
    return valid;
  }

  attachFieldValidation(
    Array.from(setupForm.querySelectorAll("input")),
    () => validateSetup(false)
  );
  attachFieldValidation(
    Array.from(loginForm.querySelectorAll("input")),
    () => validateLogin(false)
  );

  setupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    setTextError("admin-setup-form", "");

    if (!validateSetup(true)) {
      return;
    }

    const firstName = TrustHub.safeString(document.getElementById("admin-setup-first-name").value);
    const lastName = TrustHub.safeString(document.getElementById("admin-setup-last-name").value);
    const email = TrustHub.safeString(document.getElementById("admin-setup-email").value);
    const newAdmin = {
      role: "admin",
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim(),
      email,
      username: "",
      phone: "",
      password: setupPassword.value,
      location: "Enugu",
      verificationStatus: "Admin Access",
      accountStatus: "Active",
      createdAt: new Date().toISOString()
    };

    const users = TrustHub.getUsers();
    users.push(newAdmin);
    TrustHub.setUsers(users);
    TrustHub.setCurrentUser({
      role: "admin",
      fullName: newAdmin.fullName,
      email: newAdmin.email,
      username: "",
      phone: "",
      location: newAdmin.location
    });
    TrustHub.addAdminLog("Admin account created", "The first admin account was created from the frontend admin setup flow.", newAdmin);
    window.location.href = "admin-dashboard.html";
  });

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    setTextError("admin-login-form", "");

    if (!validateLogin(true)) {
      return;
    }

    const identifierValue = TrustHub.normalize(loginIdentifier.value);
    const adminUser = TrustHub.getUsers().find((user) => {
      if (user.role !== "admin") {
        return false;
      }

      const emailMatch = TrustHub.normalize(user.email) === identifierValue;
      const usernameMatch = TrustHub.normalize(user.username) === identifierValue;
      return (emailMatch || usernameMatch) && user.password === loginPassword.value;
    });

    if (!adminUser) {
      setTextError("admin-login-form", "We could not sign you in with those admin details.");
      return;
    }

    if (TrustHub.normalize(adminUser.accountStatus) === "suspended") {
      setTextError("admin-login-form", "This admin account is suspended. Contact another administrator for access.");
      return;
    }

    TrustHub.setCurrentUser({
      role: "admin",
      fullName: adminUser.fullName,
      email: adminUser.email,
      username: adminUser.username || "",
      phone: adminUser.phone || "",
      location: adminUser.location || ""
    });
    TrustHub.addAdminLog("Admin login", `${adminUser.fullName || adminUser.email} signed into the admin panel.`, adminUser);
    window.location.href = "admin-dashboard.html";
  });

  syncMode();
  updateSetupState();
  updateLoginState();
}

function initAdminDashboard() {
  const currentUser = TrustHub.getActiveUser();
  const searchInput = document.getElementById("admin-user-search");
  const roleFilter = document.getElementById("admin-user-filter");
  const logoutButton = document.getElementById("admin-logout");
  const refreshButton = document.getElementById("admin-refresh");

  if (!document.getElementById("admin-dashboard")) {
    return;
  }

  if (currentUser.role !== "admin") {
    window.location.href = "admin-login.html";
    return;
  }

  const statUsers = document.getElementById("admin-stat-users");
  const statPending = document.getElementById("admin-stat-pending");
  const statProducts = document.getElementById("admin-stat-products");
  const statOrders = document.getElementById("admin-stat-orders");
  const statDisputes = document.getElementById("admin-stat-disputes");
  const verificationList = document.getElementById("admin-verification-list");
  const verificationCount = document.getElementById("admin-verification-count");
  const usersList = document.getElementById("admin-users-list");
  const usersCount = document.getElementById("admin-users-count");
  const productsList = document.getElementById("admin-products-list");
  const ordersList = document.getElementById("admin-orders-list");
  const disputesList = document.getElementById("admin-disputes-list");
  const logsList = document.getElementById("admin-logs-list");
  const activeAdminName = document.getElementById("admin-active-name");

  function getOrderData() {
    return TrustHub.readClientState("trusthub-orders", []).filter(Boolean);
  }

  function getVerificationQueue(users) {
    return users.filter((user) => {
      if (user.role !== "seller") {
        return false;
      }

      const status = TrustHub.normalize(user.verificationStatus || "");
      return status !== "verified";
    });
  }

  function getAccountStatus(user) {
    return TrustHub.safeString(user.accountStatus) || "Active";
  }

  function renderStats(users, products, orders, disputes) {
    const queue = getVerificationQueue(users);
    statUsers.textContent = String(users.length);
    statPending.textContent = String(queue.length);
    statProducts.textContent = String(products.length);
    statOrders.textContent = String(orders.length);
    statDisputes.textContent = String(disputes.length);
    activeAdminName.textContent = currentUser.fullName || currentUser.email || "Admin";
  }

  function renderVerification(users) {
    const queue = getVerificationQueue(users);
    verificationCount.textContent = `${queue.length} account${queue.length === 1 ? "" : "s"}`;

    if (!queue.length) {
      verificationList.innerHTML = `
        <div class="th-empty-state th-empty-state-compact">
          <h2>Verification queue is clear</h2>
          <p>New seller verification submissions will appear here.</p>
        </div>
      `;
      return;
    }

    verificationList.innerHTML = queue.map((user) => `
      <article class="th-admin-item">
        <div class="th-admin-item-copy">
          <strong>${user.fullName || "Seller account"}</strong>
          <span>${user.email || "No email"} | ${user.location || "Enugu"}</span>
          <span>${TrustHub.getVerificationStatus(user)}</span>
          <small>${user.businessName || user.verificationDetails || "No business name yet."}</small>
        </div>
        <div class="th-admin-actions">
          <button type="button" class="btn btn-primary" data-admin-action="verify-user" data-user-role="${user.role}" data-user-email="${user.email || ""}">Verify</button>
          <button type="button" class="btn btn-outline" data-admin-action="reject-user" data-user-role="${user.role}" data-user-email="${user.email || ""}">Reject</button>
        </div>
      </article>
    `).join("");
  }

  function renderUsers(users) {
    const query = TrustHub.normalize(searchInput.value);
    const filter = TrustHub.normalize(roleFilter.value);
    const filteredUsers = users.filter((user) => {
      const matchesQuery = !query || [
        user.fullName,
        user.email,
        user.phone,
        user.location,
        user.role
      ].some((value) => TrustHub.normalize(value).includes(query));

      if (!matchesQuery) {
        return false;
      }

      if (!filter) {
        return true;
      }

      if (filter === "suspended") {
        return TrustHub.normalize(getAccountStatus(user)) === "suspended";
      }

      if (filter === "pending") {
        return user.role === "seller" && TrustHub.normalize(TrustHub.getVerificationStatus(user)) !== "verified";
      }

      return TrustHub.normalize(user.role) === filter;
    });

    usersCount.textContent = `${filteredUsers.length} result${filteredUsers.length === 1 ? "" : "s"}`;

    if (!filteredUsers.length) {
      usersList.innerHTML = `
        <div class="th-empty-state th-empty-state-compact">
          <h2>No users matched</h2>
          <p>Try a different search or filter to find the account you need.</p>
        </div>
      `;
      return;
    }

    usersList.innerHTML = filteredUsers.map((user) => `
      <article class="th-admin-item">
        <div class="th-admin-item-copy">
          <strong>${user.fullName || "TrustHub user"}</strong>
          <span>${user.email || "No email"} | ${user.role || "user"}</span>
          <span>${getAccountStatus(user)} | ${TrustHub.getVerificationStatus(user)}</span>
          <small>${user.location || "Enugu"}${user.productCategory ? ` | ${user.productCategory}` : ""}</small>
        </div>
        <div class="th-admin-actions">
          ${user.role === "seller" ? `<button type="button" class="btn btn-outline" data-admin-action="verify-user" data-user-role="${user.role}" data-user-email="${user.email || ""}">Verify</button>` : ""}
          ${TrustHub.normalize(getAccountStatus(user)) === "suspended"
            ? `<button type="button" class="btn btn-primary" data-admin-action="restore-user" data-user-role="${user.role}" data-user-email="${user.email || ""}">Restore</button>`
            : `<button type="button" class="btn btn-outline" data-admin-action="suspend-user" data-user-role="${user.role}" data-user-email="${user.email || ""}">Suspend</button>`
          }
        </div>
      </article>
    `).join("");
  }

  function renderProducts(products) {
    if (!products.length) {
      productsList.innerHTML = `
        <div class="th-empty-state th-empty-state-compact">
          <h2>No products uploaded yet</h2>
          <p>Seller listings will appear here as soon as they go live.</p>
        </div>
      `;
      return;
    }

    productsList.innerHTML = products.map((product) => `
      <article class="th-admin-item">
        <div class="th-admin-item-media">
          <img src="${TrustHub.resolveImage(product.image)}" alt="${product.name || "Product"}">
        </div>
        <div class="th-admin-item-copy">
          <strong>${product.name || "Marketplace item"}</strong>
          <span>${product.sellerName || "Verified Seller"} | ${product.category || "Others"}</span>
          <span>${TrustHub.formatCurrency(product.price || 0)} | ${product.verificationStatus || "Verification pending"}</span>
          <small>${product.description || "Seller-provided listing ready for backend moderation."}</small>
        </div>
      </article>
    `).join("");
  }

  function renderOrders(orders) {
    if (!orders.length) {
      ordersList.innerHTML = `
        <div class="th-empty-state th-empty-state-compact">
          <h2>No orders yet</h2>
          <p>Completed checkout records will appear here for admin review.</p>
        </div>
      `;
      return;
    }

    ordersList.innerHTML = orders.map((order) => `
      <article class="th-admin-item">
        <div class="th-admin-item-copy">
          <strong>${order.id || "Order"}</strong>
          <span>${order.product || "Marketplace item"} | ${order.seller || "Seller"}</span>
          <span>${order.status || "Pending"} | ${order.paymentStatus || "Pending payment"} | ${order.fulfillmentMethod === "pickup" ? "Pickup" : "Delivery"}</span>
          <small>${order.buyer || "Buyer"} | Buyer total ${TrustHub.formatCurrency(order.buyerTotal || order.amount || 0)} | Charge ${TrustHub.formatCurrency(order.trustHubCharge || 0)} | ${order.date || "No date"}</small>
        </div>
      </article>
    `).join("");
  }

  function renderDisputes(disputes) {
    if (!disputes.length) {
      disputesList.innerHTML = `
        <div class="th-empty-state th-empty-state-compact">
          <h2>No disputes reported</h2>
          <p>Buyer complaints and refund cases will show up here once backend support is connected.</p>
        </div>
      `;
      return;
    }

    disputesList.innerHTML = disputes.map((dispute) => `
      <article class="th-admin-item">
        <div class="th-admin-item-copy">
          <strong>${dispute.subject || dispute.id || "Dispute"}</strong>
          <span>${dispute.status || "Open"} | ${dispute.orderId || "No order linked"}</span>
          <small>${dispute.message || "Buyer-submitted issue."}</small>
        </div>
      </article>
    `).join("");
  }

  function renderLogs() {
    const logs = TrustHub.getAdminLogs();

    if (!logs.length) {
      logsList.innerHTML = `
        <div class="th-empty-state th-empty-state-compact">
          <h2>No audit logs yet</h2>
          <p>Admin access, verification actions, and moderation events will be listed here.</p>
        </div>
      `;
      return;
    }

    logsList.innerHTML = logs.slice(0, 12).map((log) => `
      <article class="th-admin-log">
        <div>
          <strong>${log.action || "Admin action"}</strong>
          <p>${log.details || "No details provided."}</p>
        </div>
        <span>${log.actor || "Admin"} | ${TrustHub.formatDateTime(log.createdAt)}</span>
      </article>
    `).join("");
  }

  function refreshDashboard() {
    const users = TrustHub.getUsers();
    const products = TrustHub.getMarketplaceProducts();
    const orders = getOrderData();
    const disputes = TrustHub.getDisputes();

    renderStats(users, products, orders, disputes);
    renderVerification(users);
    renderUsers(users);
    renderProducts(products);
    renderOrders(orders);
    renderDisputes(disputes);
    renderLogs();
  }

  function getTargetUser(button) {
    return TrustHub.getUsers().find((user) => {
      return TrustHub.safeString(user.role) === TrustHub.safeString(button.dataset.userRole) &&
        TrustHub.normalize(user.email) === TrustHub.normalize(button.dataset.userEmail);
    }) || null;
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-action]");
    if (!button || !document.getElementById("admin-dashboard")) {
      return;
    }

    const targetUser = getTargetUser(button);
    const action = button.dataset.adminAction;

    if (!targetUser) {
      TrustHub.showToast("That account could not be found.", "warn");
      return;
    }

    if (action === "verify-user") {
      TrustHub.updateStoredUser(targetUser, {
        verificationStatus: "Verified",
        verifiedAt: new Date().toISOString(),
        verifiedBy: currentUser.email || currentUser.fullName || "Admin"
      });
      TrustHub.addAdminLog("Seller verified", `${targetUser.fullName || targetUser.email} was marked as verified.`, currentUser);
      TrustHub.showToast("Seller marked as verified.");
      refreshDashboard();
      return;
    }

    if (action === "reject-user") {
      TrustHub.updateStoredUser(targetUser, {
        verificationStatus: "Rejected",
        verifiedAt: new Date().toISOString(),
        verifiedBy: currentUser.email || currentUser.fullName || "Admin"
      });
      TrustHub.addAdminLog("Seller rejected", `${targetUser.fullName || targetUser.email} was marked as rejected.`, currentUser);
      TrustHub.showToast("Seller verification was rejected.", "warn");
      refreshDashboard();
      return;
    }

    if (action === "suspend-user") {
      if (TrustHub.isSameUser(targetUser, currentUser)) {
        TrustHub.showToast("Use a different admin account before suspending this one.", "warn");
        return;
      }

      TrustHub.updateStoredUser(targetUser, { accountStatus: "Suspended" });
      TrustHub.addAdminLog("Account suspended", `${targetUser.fullName || targetUser.email} was suspended.`, currentUser);
      TrustHub.showToast("Account suspended.", "warn");
      refreshDashboard();
      return;
    }

    if (action === "restore-user") {
      TrustHub.updateStoredUser(targetUser, { accountStatus: "Active" });
      TrustHub.addAdminLog("Account restored", `${targetUser.fullName || targetUser.email} was restored.`, currentUser);
      TrustHub.showToast("Account restored.");
      refreshDashboard();
    }
  });

  [searchInput, roleFilter].forEach((input) => {
    input?.addEventListener("input", refreshDashboard);
    input?.addEventListener("change", refreshDashboard);
  });

  refreshButton?.addEventListener("click", refreshDashboard);

  logoutButton?.addEventListener("click", () => {
    TrustHub.addAdminLog("Admin logout", `${currentUser.fullName || currentUser.email} signed out of the admin panel.`, currentUser);
    TrustHub.removeClientState("trusthub-current-user");
    window.location.href = "admin-login.html";
  });

  refreshDashboard();
}

function initCart() {
  const list = document.getElementById("cart-list");
  const emptyState = document.getElementById("cart-empty");
  const count = document.getElementById("cart-count");
  const subtotal = document.getElementById("cart-subtotal");
  const delivery = document.getElementById("cart-delivery");
  const service = document.getElementById("cart-service");
  const total = document.getElementById("cart-total");
  const checkoutButton = document.getElementById("cart-checkout");

  if (!list) {
    return;
  }

  let items = TrustHub.getCartItems();

  function save() {
    TrustHub.setCartItems(items);
  }

  function render() {
    const hasItems = items.length > 0;
    list.hidden = !hasItems;
    emptyState.hidden = hasItems;
    count.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;

    if (!hasItems) {
      list.innerHTML = "";
    } else {
      list.innerHTML = items.map((item, index) => `
        <article class="th-cart-item">
          <div class="th-cart-item-media">
            <img src="${item.image || "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80"}" alt="${item.name || "Cart item"}">
          </div>
          <div class="th-cart-item-body">
            <div class="th-cart-item-top">
              <div>
                <h3>${item.name || "Marketplace item"}</h3>
                <p>${item.seller || "Verified Seller"}</p>
              </div>
              <strong>${TrustHub.formatCurrency(item.price || 0)}</strong>
            </div>
            <div class="th-cart-item-actions">
              <div class="th-quantity-control">
                <button type="button" data-cart-action="decrease" data-index="${index}">-</button>
                <span>${Number(item.quantity) || 1}</span>
                <button type="button" data-cart-action="increase" data-index="${index}">+</button>
              </div>
              <button type="button" class="th-link-button th-danger" data-cart-action="remove" data-index="${index}">Remove</button>
            </div>
          </div>
        </article>
      `).join("");
    }

    const summary = TrustHub.getCartSummary(items);
    subtotal.textContent = TrustHub.formatCurrency(summary.subtotal);
    delivery.textContent = TrustHub.formatCurrency(summary.deliveryFee);
    service.textContent = TrustHub.formatCurrency(summary.serviceFee);
    total.textContent = TrustHub.formatCurrency(summary.total);
    checkoutButton.classList.toggle("is-disabled", !hasItems);
    checkoutButton.setAttribute("aria-disabled", hasItems ? "false" : "true");
  }

  list.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.dataset.cartAction;
    const index = Number(target.dataset.index);
    if (!action || Number.isNaN(index) || !items[index]) {
      return;
    }

    if (action === "increase") {
      items[index].quantity = (Number(items[index].quantity) || 1) + 1;
    }

    if (action === "decrease") {
      const nextQuantity = (Number(items[index].quantity) || 1) - 1;
      if (nextQuantity <= 0) {
        items.splice(index, 1);
      } else {
        items[index].quantity = nextQuantity;
      }
    }

    if (action === "remove") {
      items.splice(index, 1);
    }

    save();
    render();
  });

  checkoutButton.addEventListener("click", (event) => {
    if (!items.length) {
      event.preventDefault();
    }
  });

  render();
}

function initOrders() {
  const list = document.getElementById("orders-list");
  const searchInput = document.getElementById("orders-search");
  const filterInput = document.getElementById("orders-filter");
  const emptyState = document.getElementById("orders-empty");
  const detailTitle = document.getElementById("order-detail-title");
  const detailMeta = document.getElementById("order-detail-meta");
  const detailAmount = document.getElementById("order-detail-amount");
  const timeline = document.getElementById("order-timeline");
  const steps = ["Pending", "Accepted", "Shipped", "Delivered", "Completed"];

  if (!list) {
    return;
  }

  const currentUser = TrustHub.getActiveUser();
  const headerTitle = document.querySelector(".th-page-header h1");
  const headerCopy = document.querySelector(".th-page-header p");
  const tableHead = Array.from(document.querySelectorAll(".th-order-table-head span"));
  const role = currentUser.role === "seller" ? "seller" : "buyer";
  const allOrders = TrustHub.readClientState("trusthub-orders", []).filter((order) => {
    if (role === "seller") {
      return [order.sellerEmail, order.sellerUsername, order.seller]
        .map((value) => TrustHub.normalize(value))
        .includes(TrustHub.normalize(currentUser.email || currentUser.username || currentUser.fullName));
    }

    return [order.buyerEmail, order.buyerUsername, order.buyer]
      .map((value) => TrustHub.normalize(value))
      .includes(TrustHub.normalize(currentUser.email || currentUser.username || currentUser.fullName));
  });
  let filteredOrders = allOrders.slice();
  let selectedOrder = filteredOrders[0] || null;

  if (headerTitle) {
    headerTitle.textContent = role === "seller" ? "Manage Orders" : "Your Orders";
  }

  if (headerCopy) {
    headerCopy.textContent = role === "seller"
      ? "Review buyer activity, payment status, and delivery progress for your listings."
      : "Search, filter, and track each order from purchase to completion.";
  }

  if (tableHead[2]) {
    tableHead[2].textContent = role === "seller" ? "Buyer" : "Seller";
  }

  if (role === "seller" && emptyState) {
    emptyState.innerHTML = `
      <h2>No seller orders yet</h2>
      <p>Your seller order queue will appear here as buyers purchase your verified listings.</p>
      <a href="seller-dashboard.html" class="btn btn-outline">Go to Seller Dashboard</a>
    `;
  }

  function normalizeStatus(status) {
    const value = TrustHub.normalize(status);
    return value === "in transit" ? "shipped" : value;
  }

  function renderTimeline(order) {
    if (!order) {
      timeline.innerHTML = `
        <li class="th-timeline-item is-current">
          <span>Pending</span>
          <small>Select an order to view tracking progress.</small>
        </li>
      `;
      return;
    }

    const currentIndex = Math.max(
      steps.findIndex((step) => TrustHub.normalize(step) === normalizeStatus(order.status)),
      0
    );

    timeline.innerHTML = steps.map((step, index) => `
      <li class="th-timeline-item${index < currentIndex ? " is-complete" : ""}${index === currentIndex ? " is-current" : ""}">
        <span>${step}</span>
        <small>${index <= currentIndex ? "Updated" : "Waiting"}</small>
      </li>
    `).join("");
  }

  function renderDetail(order) {
    if (!order) {
      detailTitle.textContent = "No order selected";
      detailMeta.textContent = "Choose an order to view its status updates and delivery steps.";
      detailAmount.textContent = TrustHub.formatCurrency(0);
      renderTimeline(null);
      return;
    }

    const counterparty = role === "seller"
      ? (order.buyer || order.buyerEmail || "Buyer")
      : (order.seller || "Verified Seller");
    detailTitle.textContent = `${order.product || "Order"} | ${order.id || "THA-0000"}`;
    detailMeta.textContent = `${counterparty} | ${order.date || "-"} | ${order.status || "Pending"}${order.paymentStatus ? ` | ${order.paymentStatus}` : ""}`;
    detailAmount.textContent = TrustHub.formatCurrency(order.buyerTotal || order.amount || 0);
    renderTimeline(order);
  }

  function renderList() {
    const hasOrders = filteredOrders.length > 0;
    emptyState.hidden = hasOrders;

    if (!hasOrders) {
      list.innerHTML = "";
      selectedOrder = null;
      renderDetail(null);
      return;
    }

    if (!selectedOrder || !filteredOrders.some((order) => order.id === selectedOrder.id)) {
      selectedOrder = filteredOrders[0];
    }

    list.innerHTML = filteredOrders.map((order) => `
      <button type="button" class="th-order-row${selectedOrder && selectedOrder.id === order.id ? " is-active" : ""}" data-order-id="${order.id}">
        <span>${order.id || "THA-0000"}</span>
        <span>${order.product || "Marketplace order"}</span>
          <span>${role === "seller" ? (order.buyer || order.buyerEmail || "Buyer") : (order.seller || "Verified Seller")}</span>
        <span><span class="th-status-badge">${order.status || "Pending"}</span></span>
        <span>${order.date || "-"}</span>
        <strong>${TrustHub.formatCurrency(order.buyerTotal || order.amount || 0)}</strong>
      </button>
    `).join("");

    renderDetail(selectedOrder);
  }

  function applyFilters() {
    const query = TrustHub.normalize(searchInput.value);
    const status = TrustHub.normalize(filterInput.value);

    filteredOrders = allOrders.filter((order) => {
      const orderText = `${order.id || ""} ${order.product || ""} ${order.seller || ""}`.toLowerCase();
      const matchesQuery = !query || orderText.includes(query);
      const matchesStatus = !status || normalizeStatus(order.status) === status;
      return matchesQuery && matchesStatus;
    });

    renderList();
  }

  list.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest("[data-order-id]");
    if (!(button instanceof HTMLElement)) {
      return;
    }

    selectedOrder = filteredOrders.find((order) => order.id === button.dataset.orderId) || null;
    renderList();
  });

  searchInput.addEventListener("input", applyFilters);
  filterInput.addEventListener("change", applyFilters);

  renderList();
}

function initProfile() {
  const emptyState = document.getElementById("profile-empty");
  const content = document.getElementById("profile-content");
  const editButton = document.getElementById("profile-edit");
  const logoutButton = document.getElementById("profile-logout");
  const modal = document.getElementById("profile-modal");
  const closeModalButton = document.getElementById("profile-modal-close");
  const form = document.getElementById("profile-edit-form");
  const buyerFields = document.getElementById("profile-buyer-fields");
  const sellerFields = document.getElementById("profile-seller-fields");
  const passwordForm = document.getElementById("profile-password-form");
  const passwordMessage = document.getElementById("profile-password-message");
  const addressForm = document.getElementById("profile-address-form");
  const addressList = document.getElementById("profile-address-list");
  const addressMessage = document.getElementById("profile-address-message");
  const notificationForm = document.getElementById("profile-notification-form");
  const notificationMessage = document.getElementById("profile-notification-message");
  const notificationList = document.getElementById("profile-notification-list");
  const notificationEmpty = document.getElementById("profile-notification-empty");

  if (!emptyState || !content || !form) {
    return;
  }

  function render(user) {
    if (!user.role) {
      emptyState.hidden = false;
      content.hidden = true;
      return;
    }

    emptyState.hidden = true;
    content.hidden = false;

    const fullName = user.fullName || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "TrustHub User";
    const summary = user.role === "seller"
      ? (user.whatYouSell || "Seller profile details will appear here.")
      : ((Array.isArray(user.preferredCategories || user.categories) && (user.preferredCategories || user.categories).length)
        ? (user.preferredCategories || user.categories).join(", ")
        : "No preferred categories saved yet.");
    const age = user.age || TrustHub.calculateAge(user.dateOfBirth);
    const verification = TrustHub.getVerificationStatus(user);

    document.getElementById("profile-avatar").textContent = TrustHub.getInitials(fullName);
    document.getElementById("profile-full-name").textContent = fullName;
    document.getElementById("profile-email").textContent = user.email || "Not available";
    document.getElementById("profile-phone").textContent = user.phone || "Not available";
    document.getElementById("profile-role").textContent = user.role === "seller" ? "Seller" : "Buyer";
    document.getElementById("profile-dob").textContent = user.dateOfBirth || (age ? `${age} years` : "Not available");
    document.getElementById("profile-location").textContent = user.location || "Enugu";
    document.getElementById("profile-verification").textContent = verification;
    document.getElementById("profile-summary").textContent = summary;
    document.getElementById("profile-verification-badge").textContent = verification;
    const verificationNote = document.getElementById("profile-verification-note");
    if (verificationNote) {
      verificationNote.textContent = user.role === "seller"
        ? `${verification}. Manual review is required after email OTP verification.`
        : "Email OTP verification keeps your buyer account active.";
    }
    const notificationCount = document.getElementById("profile-notification-count");
    if (notificationCount) {
      const notifications = TrustHub.getNotifications(user);
      notificationCount.textContent = `${notifications.length} notification${notifications.length === 1 ? "" : "s"}`;
    }
  }

  function openModal(user) {
    modal.hidden = false;
    document.body.classList.add("th-modal-open");

    const fullName = user.fullName || `${user.firstName || ""} ${user.lastName || ""}`.trim();
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    document.getElementById("edit-first-name").value = user.firstName || nameParts[0] || "";
    document.getElementById("edit-last-name").value = user.lastName || nameParts.slice(1).join(" ") || "";
    document.getElementById("edit-email").value = user.email || "";
    document.getElementById("edit-phone").value = user.phone || "";
    document.getElementById("edit-location").value = user.location || "";
    document.getElementById("edit-date-of-birth").value = user.dateOfBirth || "";

    if (user.role === "buyer") {
      buyerFields.hidden = false;
      sellerFields.hidden = true;
      Array.from(document.getElementById("edit-categories").options).forEach((option) => {
        option.selected = Array.isArray(user.preferredCategories || user.categories) &&
          (user.preferredCategories || user.categories).includes(option.value);
      });
    } else {
      buyerFields.hidden = true;
      sellerFields.hidden = false;
      document.getElementById("edit-what-you-sell").value = user.whatYouSell || "";
      document.getElementById("edit-product-category").value = user.productCategory || "";
    }
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove("th-modal-open");
  }

  editButton.addEventListener("click", () => {
    const user = TrustHub.getActiveUser();
    if (user.role) {
      openModal(user);
    }
  });

  closeModalButton.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const currentUser = TrustHub.getActiveUser();
    if (!currentUser.role) {
      return;
    }

    const firstName = TrustHub.safeString(document.getElementById("edit-first-name").value);
    const lastName = TrustHub.safeString(document.getElementById("edit-last-name").value);
    const dateOfBirth = TrustHub.safeString(document.getElementById("edit-date-of-birth").value);
    const updatedUser = {
      ...currentUser,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim(),
      email: TrustHub.safeString(document.getElementById("edit-email").value),
      phone: TrustHub.safeString(document.getElementById("edit-phone").value),
      location: TrustHub.safeString(document.getElementById("edit-location").value),
      dateOfBirth,
      age: TrustHub.calculateAge(dateOfBirth) || currentUser.age || null
    };

    if (currentUser.role === "buyer") {
      updatedUser.preferredCategories = Array.from(document.getElementById("edit-categories").selectedOptions).map((option) => option.value);
      updatedUser.categories = updatedUser.preferredCategories;
    } else {
      updatedUser.whatYouSell = TrustHub.safeString(document.getElementById("edit-what-you-sell").value);
      updatedUser.productCategory = TrustHub.safeString(document.getElementById("edit-product-category").value);
    }

    TrustHub.services.profile.updateProfile(updatedUser).then((response) => {
      if (!response.ok) {
        TrustHub.showToast(response.error.message, "warn");
        return;
      }

      render(response.data);
      closeModal();
      TrustHub.showToast("Profile updated.");
    });
  });

  function renderAddresses(user) {
    if (!addressList) {
      return;
    }

    const addresses = TrustHub.getAddresses(user);
    if (!addresses.length) {
      addressList.innerHTML = `
        <div class="th-empty-state th-empty-state-compact">
          <h2>No saved addresses</h2>
          <p>Add your first delivery address so checkout can connect to the backend address book cleanly.</p>
        </div>
      `;
      return;
    }

    addressList.innerHTML = addresses.map((address) => `
      <article class="th-address-card">
        <div>
          <strong>${address.label}${address.isDefault ? " | Default" : ""}</strong>
          <p>${address.fullName} | ${address.phone}</p>
          <p>${address.line1}${address.line2 ? `, ${address.line2}` : ""}, ${address.city}, ${address.state}, ${address.country}</p>
        </div>
        <div class="th-address-actions">
          <button type="button" class="btn btn-outline" data-address-action="edit" data-address-id="${address.id}">Edit</button>
          <button type="button" class="btn btn-outline" data-address-action="default" data-address-id="${address.id}">Set Default</button>
          <button type="button" class="btn btn-outline" data-address-action="delete" data-address-id="${address.id}">Delete</button>
        </div>
      </article>
    `).join("");
  }

  function renderNotifications(user) {
    if (!notificationList || !notificationEmpty) {
      return;
    }

    const notifications = TrustHub.getNotifications(user);
    notificationEmpty.hidden = notifications.length > 0;
    notificationList.innerHTML = notifications.length ? notifications.slice(0, 6).map((notification) => `
      <article class="th-notification-card">
        <strong>${notification.title}</strong>
        <p>${notification.message}</p>
        <span>${TrustHub.formatDateTime(notification.createdAt)}</span>
      </article>
    `).join("") : "";
  }

  function renderNotificationSettings(user) {
    if (!notificationForm) {
      return;
    }

    const settings = TrustHub.getNotificationSettings(user);
    notificationForm.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.checked = Boolean(settings[input.name]);
    });
  }

  passwordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentPassword = TrustHub.safeString(document.getElementById("profile-current-password").value);
    const newPassword = TrustHub.safeString(document.getElementById("profile-new-password").value);
    const confirmPassword = TrustHub.safeString(document.getElementById("profile-confirm-password").value);

    if (newPassword !== confirmPassword) {
      passwordMessage.textContent = "New passwords do not match.";
      return;
    }

    const response = await TrustHub.services.profile.changePassword({
      currentPassword,
      newPassword
    });

    passwordMessage.textContent = response.ok ? "Password updated successfully." : response.error.message;
    if (response.ok) {
      passwordForm.reset();
    }
  });

  addressForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const response = await TrustHub.services.address.saveAddress({
      id: TrustHub.safeString(document.getElementById("profile-address-id").value),
      label: TrustHub.safeString(document.getElementById("profile-address-label").value),
      fullName: TrustHub.safeString(document.getElementById("profile-address-full-name").value),
      phone: TrustHub.safeString(document.getElementById("profile-address-phone").value),
      line1: TrustHub.safeString(document.getElementById("profile-address-line1").value),
      line2: TrustHub.safeString(document.getElementById("profile-address-line2").value),
      city: TrustHub.safeString(document.getElementById("profile-address-city").value),
      state: TrustHub.safeString(document.getElementById("profile-address-state").value),
      country: TrustHub.safeString(document.getElementById("profile-address-country").value),
      isDefault: document.getElementById("profile-address-default").checked
    });

    addressMessage.textContent = response.ok ? "Address saved." : response.error.message;
    if (response.ok) {
      addressForm.reset();
      document.getElementById("profile-address-id").value = "";
      renderAddresses(TrustHub.getActiveUser());
    }
  });

  addressList?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.dataset.addressAction;
    const addressId = target.dataset.addressId;
    if (!action || !addressId) {
      return;
    }

    const addresses = TrustHub.getAddresses(TrustHub.getActiveUser());
    const address = addresses.find((item) => item.id === addressId);

    if (action === "edit" && address) {
      document.getElementById("profile-address-id").value = address.id;
      document.getElementById("profile-address-label").value = address.label || "";
      document.getElementById("profile-address-full-name").value = address.fullName || "";
      document.getElementById("profile-address-phone").value = address.phone || "";
      document.getElementById("profile-address-line1").value = address.line1 || "";
      document.getElementById("profile-address-line2").value = address.line2 || "";
      document.getElementById("profile-address-city").value = address.city || "";
      document.getElementById("profile-address-state").value = address.state || "";
      document.getElementById("profile-address-country").value = address.country || "";
      document.getElementById("profile-address-default").checked = Boolean(address.isDefault);
      addressMessage.textContent = "Editing selected address.";
      return;
    }

    if (action === "default") {
      await TrustHub.services.address.setDefault(addressId);
      renderAddresses(TrustHub.getActiveUser());
      addressMessage.textContent = "Default address updated.";
      return;
    }

    if (action === "delete") {
      await TrustHub.services.address.deleteAddress(addressId);
      renderAddresses(TrustHub.getActiveUser());
      addressMessage.textContent = "Address deleted.";
    }
  });

  notificationForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {};
    notificationForm.querySelectorAll("input[type='checkbox']").forEach((input) => {
      payload[input.name] = input.checked;
    });

    const response = await TrustHub.services.notification.updateSettings(payload);
    notificationMessage.textContent = response.ok ? "Notification preferences updated." : response.error.message;
  });

  logoutButton.addEventListener("click", () => {
    TrustHub.services.auth.logout().then(() => {
      window.location.href = "login.html";
    });
  });

  const activeUser = TrustHub.getActiveUser();
  render(activeUser);
  renderAddresses(activeUser);
  renderNotifications(activeUser);
  renderNotificationSettings(activeUser);
}

function initVerify() {
  const form = document.getElementById("verify-form");
  const otpInputs = Array.from(document.querySelectorAll(".otp-input"));
  const helper = document.getElementById("verify-helper");
  const successMessage = document.getElementById("verify-success-message");
  const timerElement = document.getElementById("verify-timer");
  const resendButton = document.getElementById("verify-resend");
  const accountRole = document.getElementById("verify-account-role");
  const accountEmail = document.getElementById("verify-account-email");
  const accountStatus = document.getElementById("verify-account-status");
  const sellerPanel = document.getElementById("verify-seller-panel");
  const documentInput = document.getElementById("verify-document");
  const documentName = document.getElementById("verify-document-name");
  const verificationNotes = document.getElementById("verify-notes");

  if (!form || !otpInputs.length) {
    return;
  }

  const user = TrustHub.getActiveUser();
  let secondsRemaining = 300;

  accountRole.textContent = user.role === "seller" ? "Seller account" : "Buyer account";
  accountEmail.textContent = user.email || "No email found";
  accountStatus.textContent = TrustHub.getVerificationStatus(user);
  sellerPanel.hidden = user.role !== "seller";

  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function updateTimerUI() {
    timerElement.textContent = `Code expires in ${formatTime(secondsRemaining)}`;
  }

  const timerInterval = window.setInterval(() => {
    if (secondsRemaining <= 0) {
      clearInterval(timerInterval);
      timerElement.textContent = "Code expired. Please resend code.";
      return;
    }

    secondsRemaining -= 1;
    updateTimerUI();
  }, 1000);

  otpInputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 1);
      helper.textContent = "";
      successMessage.textContent = "";
      if (input.value && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus();
      }
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !input.value && index > 0) {
        otpInputs[index - 1].focus();
      }
    });
  });

  documentInput?.addEventListener("change", () => {
    documentName.textContent = documentInput.files && documentInput.files[0]
      ? `Selected document: ${documentInput.files[0].name}`
      : "No document selected yet.";
  });

  resendButton?.addEventListener("click", () => {
    otpInputs.forEach((input) => {
      input.value = "";
    });
    otpInputs[0].focus();
    helper.textContent = "A new verification code has been issued to your email.";
    successMessage.textContent = "";
    secondsRemaining = 300;
    updateTimerUI();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    helper.textContent = "";
    successMessage.textContent = "";

    const code = otpInputs.map((input) => input.value).join("");
    if (secondsRemaining <= 0) {
      helper.textContent = "Code expired. Please resend code.";
      return;
    }

    const response = await TrustHub.services.auth.verifyEmailOtp({
      code,
      verificationDocumentName: documentInput?.files && documentInput.files[0] ? documentInput.files[0].name : "",
      verificationDetails: TrustHub.safeString(verificationNotes?.value)
    });

    if (!response.ok) {
      helper.textContent = response.error.message;
      return;
    }

    accountStatus.textContent = TrustHub.getVerificationStatus(response.data);
    successMessage.textContent = response.data.role === "seller"
      ? "Email verified. Your seller account is now awaiting manual review."
      : "Verification successful. Redirecting to your dashboard.";

    window.setTimeout(() => {
      window.location.href = response.data.role === "seller"
        ? "seller-dashboard.html"
        : "buyer-dashboard.html";
    }, 1000);
  });

  updateTimerUI();
}

function initProduct() {
  const productHero = document.getElementById("product-hero");
  const productName = document.getElementById("product-name");
  const productSeller = document.getElementById("product-seller");
  const productMeta = document.getElementById("product-meta");
  const productDescription = document.getElementById("product-description");
  const productPrice = document.getElementById("product-price");
  const productFeedback = document.getElementById("product-feedback");
  const productRating = document.getElementById("product-rating");
  const buyNowButton = document.getElementById("product-buy-now");
  const saveItemButton = document.getElementById("product-save-item");
  const relatedGrid = document.getElementById("related-products-grid");
  const searchParams = new URLSearchParams(window.location.search);
  const requestedId = searchParams.get("id");
  const requestedSlug = searchParams.get("slug");
  const selectedProduct = TrustHub.getSelectedProduct();
  const activeUser = TrustHub.getActiveUser();

  if (!relatedGrid) {
    return;
  }

  const product = TrustHub.findProductByIdOrSlug(requestedId || requestedSlug) ||
    (selectedProduct && TrustHub.findProductByIdOrSlug(selectedProduct.id || selectedProduct.slug || selectedProduct.name)) ||
    TrustHub.getMarketplaceProducts()[0] ||
    null;

  if (!product) {
    productHero.textContent = "No live product selected";
    relatedGrid.innerHTML = `
      <article class="product-card content-panel">
        <div class="product-card-copy">
          <h3>No live listings yet</h3>
          <p>Product details will appear here once verified sellers upload real marketplace listings.</p>
        </div>
      </article>
    `;
    return;
  }

  TrustHub.setSelectedProduct(product);
  const image = TrustHub.resolveImage(product.image, "");
  if (image) {
    productHero.style.backgroundImage = `url("${image}")`;
    productHero.style.backgroundSize = "cover";
    productHero.style.backgroundPosition = "center";
    productHero.textContent = "";
  }

  const sellerBadge = "Verified Seller";
  const trustBadge = TrustHub.safeString(product.verificationStatus) || "Trusted Listing";
  productName.textContent = product.name || "Marketplace product";
  productSeller.textContent = `${product.sellerName || product.seller || "Verified Seller"} | ${sellerBadge}`;
  productDescription.textContent = TrustHub.safeString(product.description) || "Live marketplace listing ready for backend product details.";
  productPrice.textContent = TrustHub.formatCurrency(product.price);
  productRating.innerHTML = `${Number(product.rating || 4.8).toFixed(1)} <span>&#9733;&#9733;&#9733;&#9733;&#9733;</span>`;
  productMeta.innerHTML = `
    <span>${product.category || "Marketplace"}</span>
    <span>${sellerBadge}</span>
    <span>${trustBadge}</span>
  `;
  productFeedback.textContent = "This product page is ready to resolve by product ID or slug once the backend is connected.";

  buyNowButton.disabled = false;
  saveItemButton.disabled = false;
  saveItemButton.textContent = TrustHub.getSavedItems().some((item) => {
    return item.id === product.id && String(item.sellerId || "") === String(product.sellerId || "");
  }) ? "Saved" : "Save Item";

  buyNowButton.addEventListener("click", () => {
    if (!activeUser.role) {
      TrustHub.writeClientText("trusthub-post-login-redirect", `product.html?id=${encodeURIComponent(product.id)}&slug=${encodeURIComponent(product.slug || TrustHub.slugify(product.name))}`);
      window.location.href = "login.html";
      return;
    }

    if (activeUser.role !== "buyer") {
      TrustHub.showToast("Only buyer accounts can add marketplace items to cart.", "warn");
      return;
    }

    TrustHub.addCartItem(product);
    TrustHub.showToast(`${product.name} added to cart.`);
    window.location.href = "cart.html";
  });

  saveItemButton.addEventListener("click", () => {
    if (!activeUser.role) {
      TrustHub.writeClientText("trusthub-post-login-redirect", `product.html?id=${encodeURIComponent(product.id)}&slug=${encodeURIComponent(product.slug || TrustHub.slugify(product.name))}`);
      window.location.href = "login.html";
      return;
    }

    if (activeUser.role !== "buyer") {
      TrustHub.showToast("Only buyer accounts can save items to a wishlist.", "warn");
      return;
    }

    const result = TrustHub.toggleSavedProduct(product);
    saveItemButton.textContent = result.saved ? "Saved" : "Save Item";
    TrustHub.showToast(result.saved ? "Item saved." : "Item removed from saved items.", result.saved ? "success" : "info");
  });

  TrustHub.services.product.getRelatedProducts(product, 4).then((response) => {
    const relatedProducts = response.ok ? response.data : [];
    relatedGrid.innerHTML = relatedProducts.length ? relatedProducts.map((item) => `
      <article class="product-card">
        <img src="${TrustHub.resolveImage(item.image)}" alt="${item.name}" class="product-image" loading="lazy">
        <div class="product-card-copy">
          <h3>${item.name}</h3>
          <p class="price">${TrustHub.formatCurrency(item.price)}</p>
          <p class="meta">Seller: ${item.sellerName}</p>
          <p class="meta">${item.category || "Marketplace"} | Verified Seller</p>
          <p class="rating">${Number(item.rating || 4.8).toFixed(1)} <span>&#9733;&#9733;&#9733;&#9733;&#9733;</span></p>
        </div>
        <div class="product-card-actions">
          <button class="btn btn-outline" type="button" data-related-action="view" data-product-id="${item.id}" data-product-slug="${item.slug || TrustHub.slugify(item.name)}">View Details</button>
          <button class="btn btn-primary" type="button" data-related-action="cart" data-product-id="${item.id}" data-product-slug="${item.slug || TrustHub.slugify(item.name)}">Add to Cart</button>
        </div>
      </article>
    `).join("") : `
      <article class="product-card content-panel">
        <div class="product-card-copy">
          <h3>No related products yet</h3>
          <p>More listings from this category or seller will appear here as soon as they are available.</p>
        </div>
      </article>
    `;
  });

  relatedGrid.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.dataset.relatedAction;
    const productId = target.dataset.productId;
    const productSlug = target.dataset.productSlug;
    if (!action || (!productId && !productSlug)) {
      return;
    }

    const relatedProduct = TrustHub.findProductByIdOrSlug(productId || productSlug);
    if (!relatedProduct) {
      return;
    }

    if (action === "view") {
      TrustHub.setSelectedProduct(relatedProduct);
      window.location.href = `product.html?id=${encodeURIComponent(relatedProduct.id)}&slug=${encodeURIComponent(relatedProduct.slug || TrustHub.slugify(relatedProduct.name))}`;
    }

    if (action === "cart") {
      if (!activeUser.role) {
        TrustHub.writeClientText("trusthub-post-login-redirect", `product.html?id=${encodeURIComponent(relatedProduct.id)}&slug=${encodeURIComponent(relatedProduct.slug || TrustHub.slugify(relatedProduct.name))}`);
        window.location.href = "login.html";
        return;
      }

      if (activeUser.role !== "buyer") {
        TrustHub.showToast("Only buyer accounts can add marketplace items to cart.", "warn");
        return;
      }

      TrustHub.addCartItem(relatedProduct);
      TrustHub.showToast(`${relatedProduct.name} added to cart.`);
    }
  });
}

function initCheckout() {
  const orderItems = document.getElementById("checkout-order-items");
  const delivery = document.getElementById("checkout-delivery");
  const service = document.getElementById("checkout-service");
  const total = document.getElementById("checkout-total");
  const helper = document.getElementById("checkout-helper");
  const form = document.getElementById("checkout-form");
  const paymentMethod = document.getElementById("payment-method");
  const cardNumber = document.getElementById("card-number");
  const expiry = document.getElementById("expiry");
  const cvv = document.getElementById("cvv");
  const payNowButton = document.getElementById("checkout-pay-now");
  const addressList = document.getElementById("checkout-address-list");
  const addressEmpty = document.getElementById("checkout-address-empty");
  const addressForm = document.getElementById("checkout-address-form");
  const successPanel = document.getElementById("checkout-success");
  const paymentFields = document.getElementById("checkout-card-fields");
  const fulfillmentChoice = document.getElementById("checkout-fulfillment-choice");
  const addressPanel = document.getElementById("checkout-address-panel");
  const addressCopy = document.getElementById("checkout-address-copy");
  const chargeNote = document.getElementById("checkout-charge-note");

  if (!form || !orderItems) {
    return;
  }

  let selectedAddress = null;
  let selectedFulfillment = "delivery";

  function getSelectedFulfillment() {
    const selectedInput = fulfillmentChoice?.querySelector('input[name="fulfillmentMethod"]:checked');
    return selectedInput && selectedInput.value === "pickup" ? "pickup" : "delivery";
  }

  function renderSummary() {
    selectedFulfillment = getSelectedFulfillment();
    const summary = TrustHub.getCartSummary(TrustHub.getCartItems(), selectedAddress, selectedFulfillment);
    const requiresAddress = selectedFulfillment === "delivery";

    if (addressPanel) {
      addressPanel.hidden = !requiresAddress;
      addressPanel.classList.toggle("is-muted", !requiresAddress);
    }

    if (addressCopy) {
      addressCopy.textContent = requiresAddress
        ? "Choose from saved addresses or create a new one for this order."
        : "Pickup selected. You can skip delivery address and continue to payment.";
    }

    if (!summary.items.length) {
      orderItems.innerHTML = `
        <div class="order-item">
          <span>Your cart is empty</span>
          <span>${TrustHub.formatCurrency(0)}</span>
        </div>
      `;
      helper.textContent = "Add a live marketplace item to your cart before checking out.";
      payNowButton.disabled = true;
    } else {
      orderItems.innerHTML = summary.items.map((item) => `
        <div class="order-item">
          <span>${item.name} x ${Number(item.quantity) || 1}</span>
          <span>${TrustHub.formatCurrency((Number(item.price) || 0) * (Number(item.quantity) || 1))}</span>
        </div>
      `).join("");
      payNowButton.disabled = requiresAddress && !selectedAddress;
    }

    delivery.textContent = TrustHub.formatCurrency(summary.deliveryFee);
    service.textContent = TrustHub.formatCurrency(summary.serviceFee);
    total.textContent = TrustHub.formatCurrency(summary.total);

    if (chargeNote) {
      chargeNote.textContent = summary.subtotal
        ? `TrustHub charge: ${Math.round(summary.serviceRate * 100)}% of ${TrustHub.formatCurrency(summary.subtotal)}.`
        : "The TrustHub charge is calculated from your order subtotal.";
    }
  }

  function renderAddresses() {
    const addresses = TrustHub.getAddresses(TrustHub.getActiveUser());
    if (!addresses.length) {
      addressEmpty.hidden = false;
      addressList.innerHTML = "";
      selectedAddress = null;
      renderSummary();
      return;
    }

    addressEmpty.hidden = true;
    selectedAddress = addresses.find((address) => address.isDefault) || addresses[0];
    addressList.innerHTML = addresses.map((address) => `
      <label class="th-radio-card">
        <input type="radio" name="checkout-address" value="${address.id}"${selectedAddress && selectedAddress.id === address.id ? " checked" : ""}>
        <span>
          <strong>${address.label}${address.isDefault ? " | Default" : ""}</strong>
          <small>${address.fullName} | ${address.phone}</small>
          <small>${address.line1}${address.line2 ? `, ${address.line2}` : ""}, ${address.city}, ${address.state}</small>
        </span>
      </label>
    `).join("");
    renderSummary();
  }

  paymentMethod.addEventListener("change", () => {
    const usingCard = paymentMethod.value === "card";
    paymentFields.hidden = !usingCard;
    [cardNumber, expiry, cvv].forEach((input) => {
      input.disabled = !usingCard;
    });
    helper.textContent = usingCard
      ? "Card inputs are ready for backend Paystack tokenization."
      : paymentMethod.value === "transfer"
        ? "Transfer payments will remain pending until backend verification confirms the transfer."
        : "Paystack redirect or wallet flows can plug into this payment section later.";
  });

  fulfillmentChoice?.addEventListener("change", () => {
    selectedFulfillment = getSelectedFulfillment();
    helper.textContent = selectedFulfillment === "pickup"
      ? "Pickup selected. Confirm your payment method to place the order."
      : "Delivery selected. Choose or save a delivery address before payment.";
    renderSummary();
  });

  addressList?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    const addresses = TrustHub.getAddresses(TrustHub.getActiveUser());
    selectedAddress = addresses.find((address) => address.id === target.value) || null;
    renderSummary();
  });

  addressForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const response = await TrustHub.services.address.saveAddress({
      label: TrustHub.safeString(document.getElementById("checkout-address-label").value),
      fullName: TrustHub.safeString(document.getElementById("checkout-address-full-name").value),
      phone: TrustHub.safeString(document.getElementById("checkout-address-phone").value),
      line1: TrustHub.safeString(document.getElementById("checkout-address-line1").value),
      line2: TrustHub.safeString(document.getElementById("checkout-address-line2").value),
      city: TrustHub.safeString(document.getElementById("checkout-address-city").value),
      state: TrustHub.safeString(document.getElementById("checkout-address-state").value),
      country: TrustHub.safeString(document.getElementById("checkout-address-country").value),
      isDefault: document.getElementById("checkout-address-default").checked
    });

    if (!response.ok) {
      helper.textContent = response.error.message;
      return;
    }

    addressForm.reset();
    helper.textContent = "Address saved and ready for checkout.";
    renderAddresses();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    selectedFulfillment = getSelectedFulfillment();

    if (selectedFulfillment === "delivery" && !selectedAddress) {
      helper.textContent = "Select or add a delivery address before placing the order.";
      return;
    }

    if (paymentMethod.value === "card" && (!TrustHub.safeString(cardNumber.value) || !TrustHub.safeString(expiry.value) || !TrustHub.safeString(cvv.value))) {
      helper.textContent = "Complete your card details before continuing.";
      return;
    }

    payNowButton.disabled = true;
    helper.textContent = "Placing your order...";

    const response = await TrustHub.services.order.createFromCart({
      paymentMethod: paymentMethod.value,
      selectedAddress: selectedFulfillment === "delivery" ? selectedAddress : null,
      fulfillmentMethod: selectedFulfillment
    });

    if (!response.ok) {
      helper.textContent = response.error.message;
      payNowButton.disabled = false;
      return;
    }

    successPanel.hidden = false;
    successPanel.innerHTML = `
      <h2>Order confirmation created</h2>
      <p>Payment reference: <strong>${response.data.paymentReference}</strong></p>
      <p>Your checkout summary is now ready for backend payment verification and webhook confirmation.</p>
    `;
    helper.textContent = "Order created successfully. Redirecting to your orders...";
    form.reset();
    renderAddresses();
    renderSummary();

    window.setTimeout(() => {
      window.location.href = "orders.html";
    }, 1200);
  });

  paymentMethod.dispatchEvent(new Event("change"));
  renderAddresses();
  renderSummary();
}

function initContact() {
  const form = document.getElementById("contact-form");
  const success = document.getElementById("contact-success");

  if (!form) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const fields = [
      ["contact-name", "Name"],
      ["contact-email", "Email"],
      ["contact-subject", "Subject"],
      ["contact-message", "Message"]
    ];

    let valid = true;
    fields.forEach(([id, label]) => {
      const input = document.getElementById(id);
      if (!TrustHub.safeString(input.value)) {
        valid = false;
        setInputError(id, `${label} is required.`);
      } else {
        setInputError(id, "");
      }
    });

    if (!valid) {
      success.textContent = "";
      return;
    }

    form.reset();
    success.textContent = "Message received. We'll contact you shortly.";
  });
}
