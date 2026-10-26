import { BrowserRouter, Routes, Route } from "react-router-dom";
import { doc, setDoc } from "firebase/firestore";
import { db } from "./firebase/config";
import { useAuth } from "./auth/useAuth";
import { useChecklist } from "./dashboard/useChecklist";
import NavBar from "./components/NavBar";
import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";
import HomePage from "./pages/HomePage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./auth/LoginPage";
import RegistrationPage from "./auth/RegistrationPage";
import VisaExplorerPage from "./pages/VisaExplorerPage";
import VisaComparisonPage from "./pages/VisaComparisonPage";
import CostOfLivingPage from "./pages/CostOfLivingPage";
import AccountPage from "./pages/AccountPage";
import SettingsPage from "./pages/SettingsPage";
import DocumentUploadPage from "./pages/DocumentUploadPage";
import ChecklistPage from "./pages/ChecklistPage";
import AffordabilityCalculatorPage from "./pages/AffordabilityCalculatorPage";

export default function App() {
  const { user } = useAuth();
  const checklist = useChecklist(user?.uid);

  // Persists a checklist toggle two places: the real per-item PATCH (via
  // useChecklist.toggleStep, so the checklist itself stays correct), and
  // the aggregate completed/total fields on users/{uid} that the
  // Dashboard's Progress card (useChecklistProgress) reads — now backed
  // by real checklist data instead of the earlier placeholder.
  async function handleChecklistToggle({ id, completed, completedCount, total }) {
    await checklist.toggleStep({ id, completed });

    if (!user) return;
    try {
      await setDoc(
        doc(db, "users", user.uid),
        { checklistCompleted: completedCount, checklistTotal: total },
        { merge: true },
      );
    } catch (err) {
      console.error("Failed to save checklist progress:", err);
    }
  }

  return (
    <BrowserRouter>
      <NavBar />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegistrationPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/visa-explorer"
            element={
              <ProtectedRoute>
                <VisaExplorerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/visa-comparison"
            element={
              <ProtectedRoute>
                <VisaComparisonPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cost-of-living"
            element={
              <ProtectedRoute>
                <CostOfLivingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/documents"
            element={
              <ProtectedRoute>
                <DocumentUploadPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/account"
            element={
              <ProtectedRoute>
                <AccountPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/checklist"
            element={
              <ProtectedRoute>
                <ChecklistPage
                  steps={checklist.steps}
                  isLoading={checklist.isLoading}
                  error={checklist.error}
                  onToggleStep={handleChecklistToggle}
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/affordability"
            element={
              <ProtectedRoute>
                <AffordabilityCalculatorPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
      <Footer />
    </BrowserRouter>
  );
}
