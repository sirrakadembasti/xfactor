import React, { createContext, useContext, useState, useEffect } from "react";

export const ROLES = {
  ADMIN: "ADMIN",
  LIBRARIAN: "LIBRARIAN",
  STUDENT: "STUDENT",
};

const AuthContext = createContext(null);

const MOCK_USER = {
  id: "user-1",
  name: "Ahmet Yılmaz",
  email: "admin@kutuphane.com",
  role: ROLES.ADMIN,
  avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Ahmet",
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("kutuphane_auth_user");
    return saved ? JSON.parse(saved) : MOCK_USER;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      localStorage.setItem("kutuphane_auth_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("kutuphane_auth_user");
    }
  }, [user]);

  const login = async (email, password) => {
    setLoading(true);
    try {
      // Mock login logic
      let role = ROLES.STUDENT;
      if (email.includes("admin")) role = ROLES.ADMIN;
      else if (email.includes("kutuphane")) role = ROLES.LIBRARIAN;

      const loggedUser = {
        id: `user-${Date.now()}`,
        name: email.split("@")[0].toUpperCase(),
        email,
        role,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
      };
      setUser(loggedUser);
      return { success: true, user: loggedUser };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
  };

  const switchRole = (newRole) => {
    if (Object.values(ROLES).includes(newRole) && user) {
      setUser((prev) => ({ ...prev, role: newRole }));
    }
  };

  const hasPermission = (allowedRoles = []) => {
    if (!user) return false;
    if (allowedRoles.length === 0) return true;
    return allowedRoles.includes(user.role);
  };

  const value = {
    user,
    loading,
    login,
    logout,
    switchRole,
    hasPermission,
    isAdmin: user?.role === ROLES.ADMIN,
    isLibrarian: user?.role === ROLES.LIBRARIAN || user?.role === ROLES.ADMIN,
    isStudent: user?.role === ROLES.STUDENT,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth AuthProvider içinde kullanılmalıdır.");
  }
  return context;
};
