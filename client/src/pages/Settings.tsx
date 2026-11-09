import { useState, useEffect, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

const inputClass =
  "w-full bg-slate-800 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-brand-accent";

// Reused for every password field on this page. Each instance manages its own
// visible/hidden state independently — revealing one field never affects the others.
// Same icon pair/behavior as Login.tsx: slashed eye = hidden (default), plain eye = visible.
function PasswordInput({
  value,
  onChange,
  autoFocus,
  wrapperClassName = "",
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  wrapperClassName?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className={`${inputClass} pr-11`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text/50 hover:text-brand-text"
      >
        {visible ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-7.5 11-7.5S23 12 23 12s-4 7.5-11 7.5S1 12 1 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3.11-11-7.5a13.6 13.6 0 0 1 3.06-4.44M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 7.5a13.6 13.6 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default function Settings() {
  const { host, updateHost, logout } = useAuth();
  const navigate = useNavigate();

  // Profile
  const [name, setName] = useState(host?.name ?? "");
  const [email, setEmail] = useState(host?.email ?? "");
  const [phone, setPhone] = useState(host?.phone ?? "");
  const [profileError, setProfileError] = useState("");
  const [profileNote, setProfileNote] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordNote, setPasswordNote] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Delete account
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Esc closes the delete popup.
  useEffect(() => {
    if (!confirmDelete) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmDelete(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [confirmDelete]);

  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProfileNote("");
    if (!name.trim()) {
      setProfileError("Name is required");
      return;
    }
    if (!email.trim()) {
      setProfileError("Email is required");
      return;
    }
    setProfileError("");
    setSavingProfile(true);
    try {
      const res = await api.put("/auth/me", { name: name.trim(), email: email.trim(), phone: phone.trim() || null });
      const updated = res.data.data;
      updateHost({ name: updated.name, email: updated.email, phone: updated.phone });
      setName(updated.name);
      setEmail(updated.email);
      setPhone(updated.phone || "");
      setProfileNote("Profile updated.");
    } catch (err: any) {
      setProfileError(err.response?.data?.message || "Could not update your profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordNote("");
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Fill in all three password fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The new passwords don't match");
      return;
    }
    setPasswordError("");
    setSavingPassword(true);
    try {
      await api.put("/auth/me/password", { currentPassword, newPassword, confirmPassword });
      setPasswordNote("Password changed.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordError(err.response?.data?.message || "Could not change your password");
    } finally {
      setSavingPassword(false);
    }
  };

  const openDeleteModal = () => {
    setDeletePassword("");
    setDeleteError("");
    setConfirmDelete(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletePassword) {
      setDeleteError("Enter your password to confirm");
      return;
    }
    setDeleteError("");
    setDeletingAccount(true);
    try {
      await api.delete("/auth/me", { data: { password: deletePassword } });
      logout();
      navigate("/login", {
        state: {
          message:
            "Your account has been scheduled for deletion. Log back in within 30 days to cancel it and restore your account — after that, it's permanently and irreversibly deleted.",
        },
      });
    } catch (err: any) {
      setDeleteError(err.response?.data?.message || "Could not delete your account");
      setDeletingAccount(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Settings</h1>
        <p className="text-slate-400">Manage your profile and account.</p>
      </div>

      {/* Profile */}
      <form onSubmit={handleProfileSubmit} className="surface p-6">
        <h2 className="text-lg font-bold mb-4">Profile</h2>

        <label className="text-sm text-slate-400 block mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setProfileError("");
            setProfileNote("");
          }}
          className={`${inputClass} mb-4`}
        />

        <label className="text-sm text-slate-400 block mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setProfileError("");
            setProfileNote("");
          }}
          className={`${inputClass} mb-4`}
        />

        <label className="text-sm text-slate-400 block mb-1">Phone number</label>
        <input
          type="tel"
          placeholder="e.g. +91 98765 43210"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setProfileNote("");
          }}
          className={`${inputClass} mb-4`}
        />

        {profileError && <p className="text-brand-error text-sm mb-3">{profileError}</p>}
        {profileNote && <p className="text-brand-accent text-sm mb-3">{profileNote}</p>}

        <button
          type="submit"
          disabled={savingProfile}
          className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-6 py-2 rounded-lg disabled:opacity-50"
        >
          {savingProfile ? "Saving..." : "Save profile"}
        </button>
      </form>

      {/* Change password */}
      <form onSubmit={handlePasswordSubmit} className="surface p-6">
        <h2 className="text-lg font-bold mb-4">Change password</h2>

        <label className="text-sm text-slate-400 block mb-1">Current password</label>
        <PasswordInput
          value={currentPassword}
          onChange={(v) => {
            setCurrentPassword(v);
            setPasswordError("");
            setPasswordNote("");
          }}
          wrapperClassName="mb-4"
        />

        <label className="text-sm text-slate-400 block mb-1">New password</label>
        <PasswordInput
          value={newPassword}
          onChange={(v) => {
            setNewPassword(v);
            setPasswordError("");
            setPasswordNote("");
          }}
          wrapperClassName="mb-4"
        />

        <label className="text-sm text-slate-400 block mb-1">Confirm new password</label>
        <PasswordInput
          value={confirmPassword}
          onChange={(v) => {
            setConfirmPassword(v);
            setPasswordError("");
            setPasswordNote("");
          }}
          wrapperClassName="mb-4"
        />

        {passwordError && <p className="text-brand-error text-sm mb-3">{passwordError}</p>}
        {passwordNote && <p className="text-brand-accent text-sm mb-3">{passwordNote}</p>}

        <button
          type="submit"
          disabled={savingPassword}
          className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-6 py-2 rounded-lg disabled:opacity-50"
        >
          {savingPassword ? "Changing..." : "Change password"}
        </button>
      </form>

      {/* Delete account */}
      <div className="surface p-6 border-red-500/40">
        <h2 className="text-lg font-bold text-red-400 mb-1">Delete account</h2>
        <p className="text-slate-400 mb-4">
          Schedule your account for deletion. You'll have 30 days to cancel this by simply logging back in — after
          that, your account, quizzes, game sessions and reports are permanently deleted.
        </p>

        <button
          onClick={openDeleteModal}
          className="bg-red-600 hover:bg-red-500 text-white font-bold px-6 py-2 rounded-lg"
        >
          Delete account
        </button>
      </div>

      {/* Confirmation popup */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => !deletingAccount && setConfirmDelete(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md bg-slate-900 border border-brand-text/10 rounded-2xl p-6 shadow-2xl shadow-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-2">Delete your account?</h2>
            <p className="text-slate-400 mb-2">
              Your account will be <span className="text-brand-text font-semibold">scheduled for deletion</span>, not
              deleted right away.
            </p>
            <p className="text-slate-400 mb-4">
              You have <span className="text-brand-accent font-semibold">30 days</span> to cancel this — just log
              back in and your account is automatically restored. After 30 days with no login, your account,
              quizzes, game sessions and reports are{" "}
              <span className="text-red-400 font-semibold">permanently deleted and cannot be recovered</span>.
            </p>

            <label className="text-sm text-slate-400 block mb-1">Enter your password to confirm</label>
            <PasswordInput
              value={deletePassword}
              onChange={(v) => {
                setDeletePassword(v);
                setDeleteError("");
              }}
              autoFocus
              wrapperClassName="mb-3"
            />
            {deleteError && <p className="text-brand-error text-sm mb-3">{deleteError}</p>}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deletingAccount}
                className="bg-slate-800 hover:bg-brand-text/10 border border-brand-text/10 px-5 py-2 rounded-lg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deletingAccount}
                className="bg-red-600 hover:bg-red-500 text-white font-bold px-5 py-2 rounded-lg disabled:opacity-50"
              >
                {deletingAccount ? "Deleting..." : "Delete my account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}